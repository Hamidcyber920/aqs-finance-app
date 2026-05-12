/**
 * Voice Gateway — WebSocket service for Hibba Voice Agent
 *
 * Handles:
 * - WebSocket connections from authenticated clients (cookie-based auth from upgrade headers)
 * - Session management (create, resume, end)
 * - Audio streaming bidirectionally (client ↔ Gemini)
 * - Tool-call interception and routing
 * - Cost tracking and rate limiting (200k tokens/user/day)
 * - Transcript logging
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
import { invokeLLM } from "./_core/llm";
import { sdk } from "./_core/sdk";
import { transcribeAudio } from "./_core/voiceTranscription";
import { storagePut } from "./storage";

// ─── Types ───────────────────────────────────────────────────────────────────
interface VoiceClient {
  ws: WebSocket;
  userId: number;
  userRole: string;
  userName: string;
  sessionId: string; // internal tracking ID (not stored as column — we use conversationId in DB)
  dbSessionId: number; // the auto-increment id from voice_sessions table
  screenContext: string;
  entityContext: string | null;
  language: string;
  isAlive: boolean;
  tokenCount: number;
  lastActivity: number;
}

interface ClientMessage {
  type: "start_session" | "audio_chunk" | "text_input" | "end_session" | "screen_context" | "correct_this";
  sessionToken?: string; // kept for backwards compat but not used for auth
  screenContext?: string;
  entityContext?: string;
  language?: string;
  text?: string;
  audio?: string;
  transcriptId?: string;
  correctionNote?: string;
}

interface ServerMessage {
  type: "session_started" | "transcript" | "agent_response" | "tool_call" | "error" | "cost_warning" | "session_ended" | "audio_chunk";
  sessionId?: string;
  text?: string;
  audio?: string;
  toolName?: string;
  toolResult?: unknown;
  error?: string;
  tokensUsed?: number;
  tokensRemaining?: number;
  costWarning?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const DAILY_TOKEN_LIMIT = 200_000;
const SOFT_WARNING_THRESHOLD = 0.8;
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes inactivity
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_CONCURRENT_SESSIONS_PER_USER = 1;

// ─── Active connections ──────────────────────────────────────────────────────
const activeClients = new Map<string, VoiceClient>();

// ─── System prompt for the voice agent ───────────────────────────────────────
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

// ─── Helper: authenticate from WebSocket upgrade request headers ─────────────
async function authenticateFromRequest(req: IncomingMessage): Promise<{ userId: number; role: string; name: string } | null> {
  // First try query param token (for browsers that don't send cookies on WS upgrade)
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const queryToken = url.searchParams.get("token");
    if (queryToken) {
      const { verifyWsToken } = await import("./wsAuth");
      const result = await verifyWsToken(queryToken);
      if (result) return result;
    }
  } catch {}
  // Fallback: try cookie-based auth
  try {
    // The SDK's authenticateRequest expects an Express-like Request with headers.cookie
    const fakeReq = { headers: { cookie: req.headers.cookie || "" } } as any;
    const user = await sdk.authenticateRequest(fakeReq);
    if (!user) return null;
    return { userId: user.id, role: user.role, name: user.name || "User" };
  } catch (err: any) {
    console.error(`[VoiceGateway] Auth error:`, err?.message || err);
    return null;
  }
}

// ─── Helper: check daily token usage ─────────────────────────────────────────
async function getDailyTokenUsage(userId: number): Promise<number> {
  const db = await getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0]!;
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${voiceCostTracking.tokenCount}), 0)` })
    .from(voiceCostTracking)
    .where(and(eq(voiceCostTracking.userId, userId), eq(voiceCostTracking.date, todayStr)));
  return Number(result[0]?.total ?? 0);
}

// ─── Helper: log token usage ─────────────────────────────────────────────────
async function logTokenUsage(userId: number, tokensUsed: number, estimatedCostPence: number) {
  const db = await getDb();
  const todayStr = new Date().toISOString().split("T")[0]!;
  await db.insert(voiceCostTracking).values({
    userId,
    date: todayStr,
    tokenCount: tokensUsed,
    estimatedCostPence,
    createdAt: new Date(),
  });
}

// ─── Helper: check feature flag ──────────────────────────────────────────────
async function isFeatureEnabled(flagName: string, userRole?: string): Promise<boolean> {
  const db = await getDb();
  const flags = await db
    .select()
    .from(voiceFeatureFlags)
    .where(eq(voiceFeatureFlags.toolName, flagName))
    .limit(1);
  if (!flags.length) return false;
  const flag = flags[0]!;
  if (!flag.enabled) return false;
  // Check role allowlist
  if (userRole && flag.enabledRoles) {
    try {
      const allowed = JSON.parse(flag.enabledRoles) as string[];
      if (allowed.length > 0 && !allowed.includes(userRole)) return false;
    } catch (err: any) {
    console.error(`[VoiceGateway] Auth error:`, err?.message || err);
      // If JSON parse fails, allow all
    }
  }
  return true;
}

// ─── Helper: execute tool call ───────────────────────────────────────────────
async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  client: VoiceClient
): Promise<{ status: string; data: unknown; error?: string }> {
  const db = await getDb();
  const startTime = Date.now();
  try {
    // Check if the specific tool is enabled
    const toolEnabled = await isFeatureEnabled(`tool_${toolName}`, client.userRole);
    if (!toolEnabled) {
      const globalEnabled = await isFeatureEnabled("*", client.userRole);
      if (!globalEnabled) {
        return { status: "error", data: null, error: "Voice agent is currently disabled" };
      }
    }
    // Route to the appropriate handler
    const result = await routeToolCall(toolName, args, client);
    const durationMs = Date.now() - startTime;
    // Log the tool call
    await db.insert(voiceToolCalls).values({
      sessionId: client.dbSessionId,
      toolName,
      params: JSON.stringify(args),
      resultSummary: JSON.stringify(result).slice(0, 500),
      success: true,
      latencyMs: durationMs,
      createdAt: new Date(),
    });
    return { status: "ok", data: result };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    // Log failed tool call
    await db.insert(voiceToolCalls).values({
      sessionId: client.dbSessionId,
      toolName,
      params: JSON.stringify(args),
      success: false,
      errorMessage: err.message || "Tool execution failed",
      latencyMs: durationMs,
      createdAt: new Date(),
    }).catch(() => {}); // Don't fail if logging fails
    return { status: "error", data: null, error: err.message || "Tool execution failed" };
  }
}

// ─── Tool routing ────────────────────────────────────────────────────────────
async function routeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  client: VoiceClient
): Promise<unknown> {
  const db = await getDb();
  switch (toolName) {
    case "get_current_user":
      return { userId: client.userId, role: client.userRole, name: client.userName, language: client.language };

    case "get_screen_context":
      return { screen: client.screenContext, entity: client.entityContext };

    case "get_staff_directory": {
      const staffRows = await db
        .select({ id: users.id, name: users.name, role: users.role, email: users.email })
        .from(users)
        .where(eq(users.isActive, true));
      return staffRows;
    }

    case "get_trustees": {
      const trustees = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.role, "trustee"));
      return trustees;
    }

    case "get_donor": {
      const { donors } = await import("../drizzle/schema");
      const donorId = Number(args.donorId);
      if (!donorId) return { error: "donorId required" };
      const result = await db.select().from(donors).where(eq(donors.id, donorId)).limit(1);
      if (!result.length) return { error: "Donor not found" };
      const donor = result[0]!;
      // Filter sensitive fields based on role
      if (client.userRole === "reception") {
        return { id: donor.id, name: donor.name, phone: donor.phone, email: donor.email };
      }
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
      // Return pending items that need attention
      const { receipts } = await import("../drizzle/schema");
      const pending = await db.select().from(receipts).where(eq(receipts.status, "pending")).limit(20);
      return { pendingApprovals: pending.length, items: pending };
    }

    case "create_donation": {
      const { fundraisingDonations } = await import("../drizzle/schema");
      const donorId = Number(args.donorId);
      const amount = Number(args.amount);
      const campaignId = args.campaignId ? Number(args.campaignId) : null;
      if (!donorId || !amount) return { error: "donorId and amount required" };
      if (amount <= 0) return { error: "Amount must be positive" };
      if (amount >= 100000) return { error: "Amount exceeds £1,000 — requires manual confirmation in the app" };
      await db.insert(fundraisingDonations).values({
        donorId,
        campaignId,
        amount: String(amount),
        paymentMethod: String(args.paymentMethod || "cash"),
        donatedAt: new Date(),
        createdAt: new Date(),
      });
      return { success: true, donorId, amount };
    }

    case "create_expense": {
      return { status: "expense_created", note: "Use the receipt scanner for full expense entry" };
    }

    case "update_donor_profile": {
      const { donors } = await import("../drizzle/schema");
      const donorId = Number(args.donorId);
      if (!donorId) return { error: "donorId required" };
      const allowedFields: Record<string, string[]> = {
        reception: ["phone", "email"],
        staff: ["phone", "email", "addressLine1", "addressLine2", "city", "postcode"],
        manager: ["phone", "email", "addressLine1", "addressLine2", "city", "postcode"],
        trustee: ["phone", "email", "addressLine1", "addressLine2", "city", "postcode"],
        admin: ["phone", "email", "addressLine1", "addressLine2", "city", "postcode"],
        superadmin: ["*"],
      };
      const permitted = allowedFields[client.userRole] || [];
      const updates: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(args)) {
        if (key === "donorId") continue;
        if (permitted.includes("*") || permitted.includes(key)) {
          updates[key] = val;
        }
      }
      if (Object.keys(updates).length === 0) {
        return { error: "No permitted fields to update for your role" };
      }
      await db.update(donors).set(updates as any).where(eq(donors.id, donorId));
      return { success: true, updatedFields: Object.keys(updates) };
    }

    case "log_communication": {
      const { donorCommsLog } = await import("../drizzle/schema");
      await db.insert(donorCommsLog).values({
        donorId: Number(args.donorId),
        type: "manual_note",
        channel: (args.channel as any) || "system",
        subject: String(args.subject || "Voice agent interaction"),
        notes: String(args.body || ""),
        sentByUserId: client.userId,
        createdAt: new Date(),
      });
      return { success: true };
    }

    case "create_payment_link": {
      return {
        status: "payment_link_ready",
        note: "Use the Pay page to generate Stripe payment links",
        suggestedUrl: `/pay?donorId=${args.donorId}&amount=${args.amount}`,
      };
    }

    case "draft_whatsapp":
    case "draft_email": {
      const { commsOutbox } = await import("../drizzle/schema");
      const recipientId = Number(args.recipientId) || null;
      await db.insert(commsOutbox).values({
        recipientGroup: "individual",
        recipientIds: recipientId ? [recipientId] : [],
        subject: String(args.subject || ""),
        body: String(args.body || ""),
        type: toolName === "draft_whatsapp" ? "sms" : "email",
        status: "queued",
        sentByUserId: client.userId,
        createdAt: new Date(),
      });
      return { success: true, status: "draft_saved" };
    }

    case "compose_briefing": {
      const { receipts, fundraisingCampaigns } = await import("../drizzle/schema");
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const recentReceipts = await db.select().from(receipts).where(gte(receipts.createdAt, yesterday)).limit(10);
      const activeCampaigns = await db.select().from(fundraisingCampaigns).where(eq(fundraisingCampaigns.isActive, true));
      return {
        date: new Date().toISOString().split("T")[0],
        recentTransactions: recentReceipts.length,
        activeCampaigns: activeCampaigns.length,
        summary: `Good morning. You have ${activeCampaigns.length} active campaigns and ${recentReceipts.length} transactions since yesterday.`,
      };
    }

    case "flag_for_review": {
      // Use voiceReviewQueue instead of updating voiceTranscripts
      await db.insert(voiceReviewQueue).values({
        sessionId: client.dbSessionId,
        transcriptId: args.transcriptId ? Number(args.transcriptId) : null,
        flaggedByUserId: client.userId,
        agentStatement: String(args.note || "Flagged by user via voice"),
        status: "pending",
        createdAt: new Date(),
      });
      return { success: true, note: "Flagged for Dr. Hamid's review" };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ─── Process text input (text-only mode / fallback) ──────────────────────────
async function processTextInput(client: VoiceClient, text: string): Promise<string> {
  const db = await getDb();
  // Check daily token limit
  const dailyUsage = await getDailyTokenUsage(client.userId);
  if (dailyUsage >= DAILY_TOKEN_LIMIT) {
    return "I'm sorry, you've reached your daily usage limit. Please try again tomorrow or contact Dr. Hamid for an increase.";
  }
  // Build context
  const contextInfo = `Current user: ${client.userName} (${client.userRole}). Screen: ${client.screenContext}. ${client.entityContext ? `Entity: ${client.entityContext}` : ""}`;
  // Define available tools for the LLM
  const tools = [
    { type: "function" as const, function: { name: "get_current_user", description: "Get current user info", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function" as const, function: { name: "get_staff_directory", description: "Get list of active staff members", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function" as const, function: { name: "get_trustees", description: "Get list of trustees", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function" as const, function: { name: "get_donor", description: "Get donor details by ID", parameters: { type: "object", properties: { donorId: { type: "number", description: "Donor ID" } }, required: ["donorId"] } } },
    { type: "function" as const, function: { name: "search_transactions", description: "Search recent transactions", parameters: { type: "object", properties: { limit: { type: "number", description: "Max results (default 20)" } }, required: [] } } },
    { type: "function" as const, function: { name: "get_fund_balance", description: "Get fund/campaign balance", parameters: { type: "object", properties: { campaignId: { type: "number", description: "Campaign ID (optional)" } }, required: [] } } },
    { type: "function" as const, function: { name: "get_campaign_status", description: "Get all campaign statuses", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function" as const, function: { name: "get_priorities", description: "Get pending approvals and flagged items", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function" as const, function: { name: "compose_briefing", description: "Compose a morning briefing summary", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function" as const, function: { name: "create_donation", description: "Record a new donation", parameters: { type: "object", properties: { donorId: { type: "number" }, amount: { type: "number" }, campaignId: { type: "number" }, paymentMethod: { type: "string" } }, required: ["donorId", "amount"] } } },
    { type: "function" as const, function: { name: "update_donor_profile", description: "Update donor profile fields", parameters: { type: "object", properties: { donorId: { type: "number" }, phone: { type: "string" }, email: { type: "string" }, addressLine1: { type: "string" }, postcode: { type: "string" } }, required: ["donorId"] } } },
    { type: "function" as const, function: { name: "log_communication", description: "Log a communication with a donor", parameters: { type: "object", properties: { donorId: { type: "number" }, channel: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["donorId"] } } },
    { type: "function" as const, function: { name: "create_payment_link", description: "Generate a Stripe payment link", parameters: { type: "object", properties: { donorId: { type: "number" }, amount: { type: "number" } }, required: ["donorId", "amount"] } } },
    { type: "function" as const, function: { name: "draft_whatsapp", description: "Draft a WhatsApp message", parameters: { type: "object", properties: { recipientId: { type: "number" }, to: { type: "string" }, body: { type: "string" } }, required: ["body"] } } },
    { type: "function" as const, function: { name: "draft_email", description: "Draft an email", parameters: { type: "object", properties: { recipientId: { type: "number" }, to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["body"] } } },
    { type: "function" as const, function: { name: "flag_for_review", description: "Flag something for Dr. Hamid's review", parameters: { type: "object", properties: { transcriptId: { type: "number" }, note: { type: "string" } }, required: [] } } },
  ];
  // Get conversation history for this session (using correct column names)
  const recentTranscripts = await db
    .select()
    .from(voiceTranscripts)
    .where(eq(voiceTranscripts.sessionId, client.dbSessionId))
    .orderBy(desc(voiceTranscripts.createdAt))
    .limit(10);
  const conversationHistory = recentTranscripts
    .reverse()
    .map((t) => ({
      role: t.role === "user" ? ("user" as const) : ("assistant" as const),
      content: t.content,
    }));
  const messages = [
    { role: "system" as const, content: `${SYSTEM_PROMPT}\n\nContext: ${contextInfo}` },
    ...conversationHistory,
    { role: "user" as const, content: text },
  ];
  // Save user transcript
  await db.insert(voiceTranscripts).values({
    sessionId: client.dbSessionId,
    role: "user",
    content: text,
    createdAt: new Date(),
  });
  // Call LLM with tools
  let response = await invokeLLM({ messages, tools, tool_choice: "auto" });
  let responseMessage = response.choices?.[0]?.message;
  let totalTokens = response.usage?.total_tokens || 0;
  // Handle tool calls (up to 5 rounds)
  let rounds = 0;
  while (responseMessage?.tool_calls && rounds < 5) {
    rounds++;
    const toolMessages: any[] = [];
    for (const toolCall of responseMessage.tool_calls) {
      const fnName = toolCall.function.name;
      const fnArgs = JSON.parse(toolCall.function.arguments || "{}");
      // Send tool call notification to client
      sendToClient(client, {
        type: "tool_call",
        toolName: fnName,
        toolResult: { status: "executing" },
      });
      const result = await executeToolCall(fnName, fnArgs, client);
      toolMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
      // Send tool result to client
      sendToClient(client, {
        type: "tool_call",
        toolName: fnName,
        toolResult: result,
      });
    }
    // Continue conversation with tool results
    messages.push(responseMessage as any);
    messages.push(...toolMessages);
    response = await invokeLLM({ messages, tools, tool_choice: "auto" });
    responseMessage = response.choices?.[0]?.message;
    totalTokens += response.usage?.total_tokens || 0;
  }
  const agentText = responseMessage?.content || "I'm sorry, I couldn't process that. Could you try again?";
  // Save agent transcript
  await db.insert(voiceTranscripts).values({
    sessionId: client.dbSessionId,
    role: "assistant",
    content: agentText,
    createdAt: new Date(),
  });
  // Log cost
  const estimatedCostPence = Math.ceil(totalTokens * 0.003);
  await logTokenUsage(client.userId, totalTokens, estimatedCostPence);
  // Check if approaching limit
  const newDailyUsage = dailyUsage + totalTokens;
  if (newDailyUsage >= DAILY_TOKEN_LIMIT * SOFT_WARNING_THRESHOLD) {
    sendToClient(client, {
      type: "cost_warning",
      tokensUsed: newDailyUsage,
      tokensRemaining: DAILY_TOKEN_LIMIT - newDailyUsage,
      costWarning: `You've used ${Math.round((newDailyUsage / DAILY_TOKEN_LIMIT) * 100)}% of your daily token allowance.`,
    });
  }
  return agentText;
}

// ─── Send message to client ──────────────────────────────────────────────────
function sendToClient(client: VoiceClient, message: ServerMessage) {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

// ─── Attach WebSocket server to HTTP server ──────────────────────────────────
export function attachVoiceGateway(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/api/voice" });

  // Heartbeat to detect stale connections
  const heartbeat = setInterval(() => {
    for (const [id, client] of activeClients) {
      if (!client.isAlive) {
        client.ws.terminate();
        activeClients.delete(id);
        continue;
      }
      client.isAlive = false;
      client.ws.ping();
      // Session timeout
      if (Date.now() - client.lastActivity > SESSION_TIMEOUT_MS) {
        sendToClient(client, { type: "session_ended", text: "Session timed out due to inactivity" });
        client.ws.close();
        activeClients.delete(id);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", async (ws, req) => {
    const connectionId = nanoid(12);
    console.log(`[VoiceGateway] New connection ${connectionId}, cookie present: ${!!req.headers.cookie}, cookie length: ${(req.headers.cookie || "").length}`);

    // ─── Authenticate from HTTP upgrade request cookie ─────────────
    const auth = await authenticateFromRequest(req);
    if (!auth) {
      console.log(`[VoiceGateway] Auth FAILED for ${connectionId}. Cookie header: ${req.headers.cookie?.substring(0, 50) || "NONE"}`);
      ws.send(JSON.stringify({ type: "error", error: "Authentication failed. Please log in again." }));
      ws.close();
      return;
    }

    ws.on("pong", () => {
      const client = activeClients.get(connectionId);
      if (client) client.isAlive = true;
    });

    ws.on("message", async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch (err: any) {
    console.error(`[VoiceGateway] Auth error:`, err?.message || err);
        ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
        return;
      }

      // ─── Start session ─────────────────────────────────────────────
      if (msg.type === "start_session") {
        // Check if voice agent is enabled for this role
        const enabled = await isFeatureEnabled("*", auth.role);
        if (!enabled) {
          ws.send(JSON.stringify({ type: "error", error: "Voice agent is not enabled for your role" }));
          ws.close();
          return;
        }
        // Check concurrent session limit
        const existingSessions = Array.from(activeClients.values()).filter(
          (c) => c.userId === auth.userId
        );
        if (existingSessions.length >= MAX_CONCURRENT_SESSIONS_PER_USER) {
          for (const old of existingSessions) {
            sendToClient(old, { type: "session_ended", text: "New session started from another tab" });
            old.ws.close();
            activeClients.delete(
              Array.from(activeClients.entries()).find(([, v]) => v === old)?.[0] || ""
            );
          }
        }
        const conversationId = `vs_${nanoid(16)}`;
        const db = await getDb();
        // Create session record using correct schema columns
        const insertResult = await db.insert(voiceSessions).values({
          userId: auth.userId,
          conversationId,
          language: msg.language || "en-GB",
          screenContext: msg.screenContext || "dashboard",
          status: "active",
          startedAt: new Date(),
        });
        const dbSessionId = Number(insertResult[0].insertId);

        const client: VoiceClient = {
          ws,
          userId: auth.userId,
          userRole: auth.role,
          userName: auth.name,
          sessionId: conversationId,
          dbSessionId,
          screenContext: msg.screenContext || "dashboard",
          entityContext: msg.entityContext || null,
          language: msg.language || "en-GB",
          isAlive: true,
          tokenCount: 0,
          lastActivity: Date.now(),
        };
        activeClients.set(connectionId, client);
        ws.send(
          JSON.stringify({
            type: "session_started",
            sessionId: conversationId,
            text: `Hello ${auth.name}, how can I help you today?`,
          })
        );
        return;
      }

      // ─── All other messages require an active session ──────────────
      const client = activeClients.get(connectionId);
      if (!client) {
        ws.send(JSON.stringify({ type: "error", error: "No active session. Send start_session first." }));
        return;
      }
      client.lastActivity = Date.now();

      // ─── Screen context update ─────────────────────────────────────
      if (msg.type === "screen_context") {
        client.screenContext = msg.screenContext || client.screenContext;
        client.entityContext = msg.entityContext || client.entityContext;
        return;
      }

      // ─── Text input ────────────────────────────────────────────────
      if (msg.type === "text_input" && msg.text) {
        try {
          const response = await processTextInput(client, msg.text);
          sendToClient(client, {
            type: "agent_response",
            text: response,
            sessionId: client.sessionId,
          });
        } catch (err: any) {
          sendToClient(client, {
            type: "error",
            error: err.message || "Failed to process input",
          });
        }
        return;
      }

      // ─── Audio chunk (placeholder for Gemini Live API) ─────────────
      if (msg.type === "audio_chunk" && msg.audio) {
        // Transcribe audio via Whisper then process as text
        try {
          sendToClient(client, { type: "transcript", text: "Listening...", speaker: "system" });
          const audioBuffer = Buffer.from(msg.audio, "base64");
          const audioKey = `voice-audio/${client.userId}/${Date.now()}-${nanoid(6)}.webm`;
          const { url: audioUrl } = await storagePut(audioKey, audioBuffer, "audio/webm");
          const result = await transcribeAudio({ audioUrl, language: client.language || "en" });
          if ("error" in result) {
            sendToClient(client, { type: "error", error: "Could not transcribe audio: " + (result as any).error });
            return;
          }
          const userText = (result as any).text;
          if (!userText || !userText.trim()) {
            sendToClient(client, { type: "error", error: "Could not understand audio. Please try again." });
            return;
          }
          // Show transcription to user
          sendToClient(client, { type: "transcript", text: userText, speaker: "user" });
          // Process as text input
          await processTextInput(client, userText);
        } catch (err: any) {
          console.error("[VoiceGateway] Audio transcription error:", err.message);
          sendToClient(client, { type: "error", error: "Voice processing failed. Please try text input." });
        }
        return;
      }

      // ─── Correct this ──────────────────────────────────────────────
      if (msg.type === "correct_this") {
        const db = await getDb();
        // Insert into voiceReviewQueue instead of updating voiceTranscripts
        await db.insert(voiceReviewQueue).values({
          sessionId: client.dbSessionId,
          transcriptId: msg.transcriptId ? Number(msg.transcriptId) : null,
          flaggedByUserId: client.userId,
          agentStatement: msg.correctionNote || "User flagged this response as incorrect",
          status: "pending",
          createdAt: new Date(),
        });
        sendToClient(client, {
          type: "agent_response",
          text: "Thank you, I've flagged that for Dr. Hamid to review.",
        });
        return;
      }

      // ─── End session ───────────────────────────────────────────────
      if (msg.type === "end_session") {
        const db = await getDb();
        await db
          .update(voiceSessions)
          .set({ endedAt: new Date(), status: "completed" })
          .where(eq(voiceSessions.id, client.dbSessionId));
        sendToClient(client, { type: "session_ended", text: "Session ended. Goodbye!" });
        activeClients.delete(connectionId);
        ws.close();
        return;
      }
    });

    ws.on("close", async () => {
      const client = activeClients.get(connectionId);
      if (client) {
        const db = await getDb();
        await db
          .update(voiceSessions)
          .set({ endedAt: new Date(), status: "completed" })
          .where(eq(voiceSessions.id, client.dbSessionId));
        activeClients.delete(connectionId);
      }
    });

    ws.on("error", () => {
      activeClients.delete(connectionId);
    });
  });

  console.log("[VoiceGateway] WebSocket server attached at /api/voice");
  return wss;
}
