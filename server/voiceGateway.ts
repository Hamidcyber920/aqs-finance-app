/**
 * Voice Gateway — Real-time bidirectional audio streaming via Gemini Live API
 *
 * Architecture:
 * - Client WebSocket <-> Server <-> Gemini Live API WebSocket
 * - Client sends raw PCM audio (16kHz, 16-bit, mono) as base64 chunks
 * - Server relays to Gemini Live API which processes speech and responds with audio
 * - Server relays Gemini's audio response back to client for immediate playback
 * - Tool calls are intercepted, executed locally, and results sent back to Gemini
 */
import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "http";
import { nanoid } from "nanoid";
import { eq, and, sql, gte, desc } from "drizzle-orm";
import { getDb } from "./db";
import {
  voiceSessions,
  voiceToolCalls,
  voiceTranscripts,
  voiceCostTracking,
  voiceFeatureFlags,
  voiceReviewQueue,
  users,
} from "../drizzle/schema";
import { sdk } from "./_core/sdk";

// --- Types ---
interface VoiceClient {
  ws: WebSocket;
  geminiWs: WebSocket | null;
  userId: number;
  userRole: string;
  userName: string;
  sessionId: string;
  dbSessionId: number;
  screenContext: string;
  entityContext: string | null;
  language: string;
  isAlive: boolean;
  tokenCount: number;
  lastActivity: number;
  isGeminiReady: boolean;
}

interface ClientMessage {
  type: "start_session" | "audio_chunk" | "text_input" | "end_session" | "screen_context" | "correct_this";
  screenContext?: string;
  entityContext?: string;
  language?: string;
  text?: string;
  audio?: string;
  transcriptId?: string;
  correctionNote?: string;
}

// --- Constants ---
const DAILY_TOKEN_LIMIT = 200_000;
const SOFT_WARNING_THRESHOLD = 0.8;
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_CONCURRENT_SESSIONS_PER_USER = 1;
const GEMINI_LIVE_WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const GEMINI_MODEL = "models/gemini-3.1-flash-live-preview";

const activeClients = new Map<string, VoiceClient>();

const SYSTEM_PROMPT = `You are Hibba, the AI voice assistant for a UK charity management platform.
IDENTITY:
- You are helpful, professional, and warm
- You speak in British English
- You address users by their first name
- You are aware of Islamic charity terminology (Sadaqah, Zakat, Waqf, Qard Hasan, JazakAllah)
CAPABILITIES:
- Answer queries about donors, finances, campaigns, staff, facilities
- Help fill forms by voice (QuickCapture, expense entry, donor updates)
- Compose communications (WhatsApp, email drafts)
- Generate morning briefings
- Create payment links
- Search transactions and documents
BOUNDARIES:
- Never authenticate users — the system handles that
- Never handle card data — generate Stripe payment links instead
- Never read out sensitive data (full addresses, bank details, NI numbers)
- For amounts over £1,000, always confirm before proceeding
- For any destructive action, require explicit confirmation
PERMISSIONS:
- Respect the user's role. If a tool returns FORBIDDEN, explain politely that they don't have access.
- Reception staff can only use QuickCapture and basic lookups
- Donors can only access their own data
- Auditors have read-only access
STYLE:
- Keep responses concise for voice (2-3 sentences max unless asked for detail)
- Use natural speech patterns, not bullet points
- Confirm actions before executing writes
- If unsure, say so and offer to escalate to Dr. Hamid`;

const TOOL_DECLARATIONS = [
  { name: "get_current_user", description: "Get the current user's profile, role, and permissions", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_screen_context", description: "Get the current page/screen context", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_staff_directory", description: "Get the staff directory", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_trustees", description: "Get the list of trustees", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_donor", description: "Get donor details by ID", parameters: { type: "object", properties: { donorId: { type: "number", description: "Donor ID" } }, required: ["donorId"] } },
  { name: "search_transactions", description: "Search recent transactions", parameters: { type: "object", properties: { limit: { type: "number", description: "Max results" } }, required: [] } },
  { name: "get_fund_balance", description: "Get fund/campaign balance", parameters: { type: "object", properties: { campaignId: { type: "number" } }, required: [] } },
  { name: "get_campaign_status", description: "Get all campaign statuses", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_priorities", description: "Get pending approvals and flagged items", parameters: { type: "object", properties: {}, required: [] } },
  { name: "compose_briefing", description: "Compose a morning briefing summary", parameters: { type: "object", properties: {}, required: [] } },
  { name: "create_donation", description: "Record a new donation", parameters: { type: "object", properties: { donorId: { type: "number" }, amount: { type: "number" }, campaignId: { type: "number" }, paymentMethod: { type: "string" } }, required: ["donorId", "amount"] } },
  { name: "update_donor_profile", description: "Update donor profile fields", parameters: { type: "object", properties: { donorId: { type: "number" }, phone: { type: "string" }, email: { type: "string" }, addressLine1: { type: "string" }, postcode: { type: "string" } }, required: ["donorId"] } },
  { name: "log_communication", description: "Log a communication with a donor", parameters: { type: "object", properties: { donorId: { type: "number" }, channel: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["donorId"] } },
  { name: "create_payment_link", description: "Generate a Stripe payment link", parameters: { type: "object", properties: { donorId: { type: "number" }, amount: { type: "number" } }, required: ["donorId", "amount"] } },
  { name: "draft_whatsapp", description: "Draft a WhatsApp message", parameters: { type: "object", properties: { recipientId: { type: "number" }, to: { type: "string" }, body: { type: "string" } }, required: ["body"] } },
  { name: "draft_email", description: "Draft an email", parameters: { type: "object", properties: { recipientId: { type: "number" }, to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["body"] } },
  { name: "flag_for_review", description: "Flag something for Dr. Hamid's review", parameters: { type: "object", properties: { transcriptId: { type: "number" }, note: { type: "string" } }, required: [] } },
];

// --- Auth helper ---
async function authenticateFromRequest(req: IncomingMessage): Promise<{ userId: number; role: string; name: string } | null> {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const queryToken = url.searchParams.get("token");
    if (queryToken) {
      const { verifyWsToken } = await import("./wsAuth");
      const result = await verifyWsToken(queryToken);
      if (result) return result;
    }
  } catch {}
  try {
    const fakeReq = { headers: { cookie: req.headers.cookie || "" } } as any;
    const user = await sdk.authenticateRequest(fakeReq);
    if (!user) return null;
    return { userId: user.id, role: user.role, name: user.name || "User" };
  } catch (err: any) {
    console.error(`[VoiceGateway] Auth error:`, err?.message || err);
    return null;
  }
}

// --- Daily token usage ---
async function getDailyTokenUsage(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const todayStr = new Date().toISOString().split("T")[0]!;
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${voiceCostTracking.tokenCount}), 0)` })
    .from(voiceCostTracking)
    .where(and(eq(voiceCostTracking.userId, userId), eq(voiceCostTracking.date, todayStr)));
  return Number(result[0]?.total ?? 0);
}

// --- Log token usage ---
async function logTokenUsage(userId: number, tokensUsed: number, estimatedCostPence: number) {
  const db = await getDb();
  if (!db) return;
  const todayStr = new Date().toISOString().split("T")[0]!;
  await db.insert(voiceCostTracking).values({
    userId,
    date: todayStr,
    tokenCount: tokensUsed,
    estimatedCostPence,
    createdAt: new Date(),
  });
}

// --- Feature flag check ---
async function isFeatureEnabled(flagName: string, userRole?: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return true; // Allow if DB unavailable
  const flags = await db.select().from(voiceFeatureFlags).where(eq(voiceFeatureFlags.toolName, flagName)).limit(1);
  if (!flags.length) return false;
  const flag = flags[0]!;
  if (!flag.enabled) return false;
  if (userRole && flag.enabledRoles) {
    try {
      const allowed = JSON.parse(flag.enabledRoles) as string[];
      if (allowed.length > 0 && !allowed.includes(userRole)) return false;
    } catch {}
  }
  return true;
}

// --- Execute tool call ---
async function executeToolCall(toolName: string, args: Record<string, unknown>, client: VoiceClient): Promise<{ status: string; data: unknown; error?: string }> {
  const db = await getDb();
  const startTime = Date.now();
  try {
    const result = await routeToolCall(toolName, args, client);
    const latencyMs = Date.now() - startTime;
    await db.insert(voiceToolCalls).values({
      sessionId: client.dbSessionId,
      toolName,
      params: JSON.stringify(args),
      resultSummary: JSON.stringify(result).substring(0, 500),
      latencyMs,
      success: true,
      createdAt: new Date(),
    });
    return { status: "success", data: result };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    await db.insert(voiceToolCalls).values({
      sessionId: client.dbSessionId,
      toolName,
      params: JSON.stringify(args),
      resultSummary: err.message || "Error",
      latencyMs,
      success: false,
      createdAt: new Date(),
    });
    return { status: "error", data: null, error: err.message || "Tool execution failed" };
  }
}

// --- Tool routing ---
async function routeToolCall(toolName: string, args: Record<string, unknown>, client: VoiceClient): Promise<unknown> {
  const db = await getDb();
  switch (toolName) {
    case "get_current_user":
      return { userId: client.userId, role: client.userRole, name: client.userName, language: client.language };
    case "get_screen_context":
      return { screen: client.screenContext, entity: client.entityContext };
    case "get_staff_directory": {
      const staffRows = await db.select({ id: users.id, name: users.name, role: users.role, email: users.email }).from(users).where(eq(users.isActive, true));
      return staffRows;
    }
    case "get_trustees": {
      const trustees = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.role, "trustee"));
      return trustees;
    }
    case "get_donor": {
      const { donors } = await import("../drizzle/schema");
      const donorId = Number(args.donorId);
      if (!donorId) return { error: "donorId required" };
      const result = await db.select().from(donors).where(eq(donors.id, donorId)).limit(1);
      if (!result.length) return { error: "Donor not found" };
      const donor = result[0]!;
      if (client.userRole === "reception") return { id: donor.id, name: donor.name, phone: donor.phone, email: donor.email };
      return donor;
    }
    case "search_transactions": {
      const { receipts } = await import("../drizzle/schema");
      const limit = Math.min(Number(args.limit) || 20, 50);
      const rows = await db.select().from(receipts).orderBy(desc(receipts.createdAt)).limit(limit);
      return { count: rows.length, transactions: rows };
    }
    case "get_fund_balance": {
      const { fundraisingCampaigns } = await import("../drizzle/schema");
      const campaigns = await db.select().from(fundraisingCampaigns).where(eq(fundraisingCampaigns.isActive, true));
      return { activeFunds: campaigns.length, campaigns: campaigns.map(c => ({ id: c.id, name: c.name, goal: c.goalAmount, raised: c.raisedAmount })) };
    }
    case "get_campaign_status": {
      const { fundraisingCampaigns } = await import("../drizzle/schema");
      const campaigns = await db.select().from(fundraisingCampaigns);
      return campaigns.map(c => ({ id: c.id, name: c.name, goal: c.goalAmount, raised: c.raisedAmount, isActive: c.isActive }));
    }
    case "get_priorities": {
      const { receipts } = await import("../drizzle/schema");
      const pending = await db.select().from(receipts).where(eq(receipts.status, "pending")).limit(20);
      return { pendingApprovals: pending.length, items: pending };
    }
    case "create_donation": {
      const { fundraisingDonations } = await import("../drizzle/schema");
      const donorId = Number(args.donorId);
      const amount = Number(args.amount);
      if (!donorId || !amount) return { error: "donorId and amount required" };
      if (amount <= 0) return { error: "Amount must be positive" };
      if (amount >= 100000) return { error: "Amount exceeds limit - requires manual confirmation" };
      await db.insert(fundraisingDonations).values({ donorId, campaignId: args.campaignId ? Number(args.campaignId) : null, amount: String(amount), paymentMethod: String(args.paymentMethod || "cash"), donatedAt: new Date(), createdAt: new Date() });
      return { success: true, donorId, amount };
    }
    case "update_donor_profile": {
      const { donors } = await import("../drizzle/schema");
      const donorId = Number(args.donorId);
      if (!donorId) return { error: "donorId required" };
      const allowedFields: Record<string, string[]> = { reception: ["phone", "email"], staff: ["phone", "email", "addressLine1", "addressLine2", "city", "postcode"], manager: ["phone", "email", "addressLine1", "addressLine2", "city", "postcode"], trustee: ["phone", "email", "addressLine1", "addressLine2", "city", "postcode"], superadmin: ["*"] };
      const permitted = allowedFields[client.userRole] || [];
      const updates: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(args)) { if (key === "donorId") continue; if (permitted.includes("*") || permitted.includes(key)) updates[key] = val; }
      if (Object.keys(updates).length === 0) return { error: "No permitted fields to update for your role" };
      await db.update(donors).set(updates as any).where(eq(donors.id, donorId));
      return { success: true, updatedFields: Object.keys(updates) };
    }
    case "log_communication": {
      const { donorCommsLog } = await import("../drizzle/schema");
      await db.insert(donorCommsLog).values({ donorId: Number(args.donorId), type: "manual_note", channel: (args.channel as any) || "system", subject: String(args.subject || "Voice agent interaction"), notes: String(args.body || ""), sentByUserId: client.userId, createdAt: new Date() });
      return { success: true };
    }
    case "create_payment_link":
      return { status: "payment_link_ready", suggestedUrl: `/pay?donorId=${args.donorId}&amount=${args.amount}` };
    case "draft_whatsapp":
    case "draft_email": {
      const { commsOutbox } = await import("../drizzle/schema");
      await db.insert(commsOutbox).values({ recipientGroup: "individual", recipientIds: [Number(args.recipientId) || 0], subject: String(args.subject || ""), body: String(args.body || ""), type: toolName === "draft_whatsapp" ? "sms" : "email", status: "queued", sentByUserId: client.userId, createdAt: new Date() });
      return { success: true, status: "draft_saved" };
    }
    case "compose_briefing": {
      const { receipts, fundraisingCampaigns } = await import("../drizzle/schema");
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const recentReceipts = await db.select().from(receipts).where(gte(receipts.createdAt, yesterday)).limit(10);
      const activeCampaigns = await db.select().from(fundraisingCampaigns).where(eq(fundraisingCampaigns.isActive, true));
      return { date: new Date().toLocaleDateString("en-GB"), recentTransactions: recentReceipts.length, activeCampaigns: activeCampaigns.map(c => ({ name: c.name, raised: c.raisedAmount, goal: c.goalAmount })) };
    }
    case "flag_for_review": {
      await db.insert(voiceReviewQueue).values({ sessionId: client.dbSessionId, transcriptId: args.transcriptId ? Number(args.transcriptId) : null, flaggedByUserId: client.userId, agentStatement: String(args.note || "Flagged by user via voice"), status: "pending", createdAt: new Date() });
      return { success: true, note: "Flagged for Dr. Hamid's review" };
    }
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// --- Connect to Gemini Live API ---
function connectToGeminiLive(client: VoiceClient, connectionId: string): WebSocket | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[VoiceGateway] GEMINI_API_KEY not set");
    return null;
  }
  const wsUrl = `${GEMINI_LIVE_WS_URL}?key=${apiKey}`;
  const geminiWs = new WebSocket(wsUrl);

  geminiWs.on("open", () => {
    console.log(`[VoiceGateway] Gemini Live connected for ${connectionId}`);
    const setupMessage = {
      setup: {
        model: GEMINI_MODEL,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Kore"
              }
            }
          }
        },
        systemInstruction: {
          parts: [{ text: `${SYSTEM_PROMPT}\n\nCurrent user: ${client.userName} (role: ${client.userRole}). Screen: ${client.screenContext}. Language: ${client.language}.` }]
        },
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }]
      }
    };
    geminiWs.send(JSON.stringify(setupMessage));
  });

  geminiWs.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.setupComplete) {
        client.isGeminiReady = true;
        console.log(`[VoiceGateway] Gemini setup complete for ${connectionId}`);
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({ type: "gemini_ready" }));
        }
        return;
      }

      if (msg.serverContent) {
        const { modelTurn, turnComplete } = msg.serverContent;
        if (modelTurn?.parts) {
          for (const part of modelTurn.parts) {
            if (part.inlineData && client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify({
                type: "audio_response",
                audio: part.inlineData.data,
                mimeType: part.inlineData.mimeType || "audio/pcm;rate=24000",
              }));
            }
            if (part.text && client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify({ type: "transcript", text: part.text, speaker: "assistant" }));
              const db = await getDb();
              await db.insert(voiceTranscripts).values({ sessionId: client.dbSessionId, role: "assistant", content: part.text, createdAt: new Date() });
            }
          }
        }
        if (turnComplete && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({ type: "turn_complete" }));
        }
        return;
      }

      if (msg.toolCall) {
        const { functionCalls } = msg.toolCall;
        if (functionCalls && functionCalls.length > 0) {
          const toolResponses: any[] = [];
          for (const fc of functionCalls) {
            if (client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify({ type: "tool_call", toolName: fc.name, toolResult: { status: "executing" } }));
            }
            const result = await executeToolCall(fc.name, fc.args || {}, client);
            if (client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify({ type: "tool_call", toolName: fc.name, toolResult: result }));
            }
            toolResponses.push({ id: fc.id, name: fc.name, response: { result: JSON.stringify(result) } });
          }
          if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({ toolResponse: { functionResponses: toolResponses } }));
          }
        }
        return;
      }

      if (msg.toolCallCancellation) {
        console.log(`[VoiceGateway] Tool call cancelled for ${connectionId}`);
        return;
      }
    } catch (err: any) {
      console.error(`[VoiceGateway] Error processing Gemini message:`, err.message);
    }
  });

  geminiWs.on("error", (err) => {
    console.error(`[VoiceGateway] Gemini WS error for ${connectionId}:`, err.message);
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type: "error", error: "Voice service connection error. Please try again." }));
    }
  });

  geminiWs.on("close", (code, reason) => {
    console.log(`[VoiceGateway] Gemini WS closed for ${connectionId}: ${code} ${reason.toString()}`);
    client.isGeminiReady = false;
    client.geminiWs = null;
  });

  return geminiWs;
}

// --- Send to client helper ---
function sendToClient(client: VoiceClient, message: Record<string, unknown>) {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

// --- Main: Attach WebSocket server ---
export function attachVoiceGateway(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/api/voice" });

  const heartbeat = setInterval(() => {
    for (const [id, client] of activeClients) {
      if (!client.isAlive) {
        client.ws.terminate();
        if (client.geminiWs) client.geminiWs.close();
        activeClients.delete(id);
        continue;
      }
      client.isAlive = false;
      client.ws.ping();
      if (Date.now() - client.lastActivity > SESSION_TIMEOUT_MS) {
        sendToClient(client, { type: "session_ended", text: "Session timed out due to inactivity." });
        client.ws.close();
        if (client.geminiWs) client.geminiWs.close();
        activeClients.delete(id);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", async (ws, req) => {
    const connectionId = nanoid(12);
    console.log(`[VoiceGateway] New connection ${connectionId}`);

    const auth = await authenticateFromRequest(req);
    if (!auth) {
      console.log(`[VoiceGateway] Auth FAILED for ${connectionId}`);
      ws.send(JSON.stringify({ type: "error", error: "Authentication failed. Please log in again." }));
      ws.close();
      return;
    }

    ws.on("pong", () => { const c = activeClients.get(connectionId); if (c) c.isAlive = true; });

     ws.on("message", async (raw) => {
      let msg: ClientMessage;
      try { msg = JSON.parse(raw.toString()); } catch { ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" })); return; }
      try {
      if (msg.type === "start_session") {
        const enabled = await isFeatureEnabled("*", auth.role);
        if (!enabled) { ws.send(JSON.stringify({ type: "error", error: "Voice agent is not enabled for your role" })); ws.close(); return; }

        const dailyUsage = await getDailyTokenUsage(auth.userId);
        if (dailyUsage >= DAILY_TOKEN_LIMIT) { ws.send(JSON.stringify({ type: "error", error: "Daily usage limit reached." })); ws.close(); return; }

        // Close existing sessions
        const existing = Array.from(activeClients.values()).filter(c => c.userId === auth.userId);
        for (const old of existing) {
          sendToClient(old, { type: "session_ended", text: "New session started from another tab" });
          old.ws.close();
          if (old.geminiWs) old.geminiWs.close();
          const oldId = Array.from(activeClients.entries()).find(([, v]) => v === old)?.[0];
          if (oldId) activeClients.delete(oldId);
        }

        const conversationId = `vs_${nanoid(16)}`;
        const db = await getDb();
        if (!db) { ws.send(JSON.stringify({ type: "error", error: "Database unavailable" })); ws.close(); return; }
        const insertResult = await db.insert(voiceSessions).values({
          userId: auth.userId, conversationId, language: msg.language || "en-GB",
          screenContext: msg.screenContext || "dashboard", status: "active", startedAt: new Date(),
        });
        const dbSessionId = Number(insertResult[0].insertId);

        const client: VoiceClient = {
          ws, geminiWs: null, userId: auth.userId, userRole: auth.role, userName: auth.name,
          sessionId: conversationId, dbSessionId, screenContext: msg.screenContext || "dashboard",
          entityContext: msg.entityContext || null, language: msg.language || "en-GB",
          isAlive: true, tokenCount: 0, lastActivity: Date.now(), isGeminiReady: false,
        };
        activeClients.set(connectionId, client);

        // Connect to Gemini Live
        const geminiWs = connectToGeminiLive(client, connectionId);
        client.geminiWs = geminiWs;

        ws.send(JSON.stringify({ type: "session_started", sessionId: conversationId, text: `Hello ${auth.name}, how can I help you today?` }));
        return;
      }

      const client = activeClients.get(connectionId);
      if (!client) { ws.send(JSON.stringify({ type: "error", error: "No active session." })); return; }
      client.lastActivity = Date.now();

      if (msg.type === "screen_context") {
        client.screenContext = msg.screenContext || client.screenContext;
        client.entityContext = msg.entityContext || client.entityContext;
        return;
      }

      if (msg.type === "audio_chunk" && msg.audio) {
        if (!client.geminiWs || client.geminiWs.readyState !== WebSocket.OPEN || !client.isGeminiReady) {
          ws.send(JSON.stringify({ type: "status", text: "Voice service connecting..." }));
          return;
        }
        client.geminiWs.send(JSON.stringify({
          realtimeInput: { audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" } }
        }));
        return;
      }

      if (msg.type === "text_input" && msg.text) {
        const db = await getDb();
        await db.insert(voiceTranscripts).values({ sessionId: client.dbSessionId, role: "user", content: msg.text, createdAt: new Date() });
        if (client.geminiWs && client.geminiWs.readyState === WebSocket.OPEN && client.isGeminiReady) {
          // clientContent is the correct format for text turns per API reference
          client.geminiWs.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: msg.text }] }], turnComplete: true } }));
        } else {
          try {
            const { invokeLLM } = await import("./_core/llm");
            const contextInfo = `Current user: ${client.userName} (${client.userRole}). Screen: ${client.screenContext}.`;
            const response = await invokeLLM({ messages: [{ role: "system", content: `${SYSTEM_PROMPT}\n\nContext: ${contextInfo}` }, { role: "user", content: msg.text }] });
            const agentText = response.choices?.[0]?.message?.content || "I couldn't process that.";
            ws.send(JSON.stringify({ type: "agent_response", text: agentText }));
            await db.insert(voiceTranscripts).values({ sessionId: client.dbSessionId, role: "assistant", content: agentText, createdAt: new Date() });
          } catch { ws.send(JSON.stringify({ type: "error", error: "Failed to process text input." })); }
        }
        return;
      }

      if (msg.type === "correct_this") {
        const db = await getDb();
        await db.insert(voiceReviewQueue).values({ sessionId: client.dbSessionId, transcriptId: msg.transcriptId ? Number(msg.transcriptId) : null, flaggedByUserId: client.userId, agentStatement: msg.correctionNote || "User flagged this response", status: "pending", createdAt: new Date() });
        ws.send(JSON.stringify({ type: "agent_response", text: "Thank you, I've flagged that for Dr. Hamid to review." }));
        return;
      }

      if (msg.type === "end_session") {
        const db = await getDb();
        await db.update(voiceSessions).set({ endedAt: new Date(), status: "completed" }).where(eq(voiceSessions.id, client.dbSessionId));
        ws.send(JSON.stringify({ type: "session_ended", text: "Session ended. Goodbye!" }));
        if (client.geminiWs) client.geminiWs.close();
        activeClients.delete(connectionId);
        ws.close();
        return;
      }
      } catch (err: any) {
        console.error(`[VoiceGateway] Message handler error for ${connectionId}:`, err.message, err.stack);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "error", error: err.message || "Internal error" }));
        }
      }
    });

    ws.on("close", async () => {
      const client = activeClients.get(connectionId);
      if (client) {
        const db = await getDb();
        await db.update(voiceSessions).set({ endedAt: new Date(), status: "completed" }).where(eq(voiceSessions.id, client.dbSessionId));
        if (client.geminiWs) client.geminiWs.close();
        activeClients.delete(connectionId);
      }
    });

    ws.on("error", () => {
      const client = activeClients.get(connectionId);
      if (client?.geminiWs) client.geminiWs.close();
      activeClients.delete(connectionId);
    });
  });

  console.log("[VoiceGateway] WebSocket server attached at /api/voice (Gemini Live mode)");
  return wss;
}
