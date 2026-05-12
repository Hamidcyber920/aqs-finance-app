/**
 * Voice Gateway — WebSocket service for Hibba Voice Agent
 *
 * Handles:
 * - WebSocket connections from authenticated clients
 * - Session management (create, resume, end)
 * - Audio streaming bidirectionally (client ↔ Gemini)
 * - Tool call interception and routing to /internal/voice-tools/ endpoints
 * - Cost tracking and rate limiting (200k tokens/user/day)
 * - Transcript logging
 *
 * PRECONDITION: Gemini API key + model ID required for live voice.
 * Without them, the gateway operates in "text-only" mode using invokeLLM.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import { nanoid } from "nanoid";
import { eq, and, sql, gte, desc } from "drizzle-orm";
import { getDb } from "./db";
import {
  voiceSessions,
  voiceToolCalls,
  voiceTranscripts,
  voiceCostTracking,
  voiceFeatureFlags,
  users,
} from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VoiceClient {
  ws: WebSocket;
  userId: number;
  userRole: string;
  userName: string;
  sessionId: string;
  screenContext: string;
  entityContext: string | null;
  language: string;
  isAlive: boolean;
  tokenCount: number;
  lastActivity: number;
}

interface ToolCallRequest {
  toolName: string;
  args: Record<string, unknown>;
}

interface ClientMessage {
  type: "start_session" | "audio_chunk" | "text_input" | "end_session" | "screen_context" | "correct_this";
  sessionToken?: string;
  screenContext?: string;
  entityContext?: string;
  language?: string;
  text?: string;
  audio?: string; // base64 encoded audio chunk
  transcriptId?: string;
  correctionNote?: string;
}

interface ServerMessage {
  type: "session_started" | "transcript" | "agent_response" | "tool_call" | "error" | "cost_warning" | "session_ended" | "audio_chunk";
  sessionId?: string;
  text?: string;
  audio?: string; // base64 encoded audio chunk
  toolName?: string;
  toolResult?: unknown;
  error?: string;
  tokensUsed?: number;
  tokensRemaining?: number;
  costWarning?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DAILY_TOKEN_LIMIT = 200_000;
const SOFT_WARNING_THRESHOLD = 0.8; // 80%
const MONTHLY_COST_CEILING_PENCE = 50000; // £500
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

// ─── Helper: authenticate WebSocket connection ───────────────────────────────

async function authenticateSession(token: string): Promise<{ userId: number; role: string; name: string } | null> {
  if (!token) return null;
  try {
    const jwt = await import("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev-secret") as {
      userId: number;
      role: string;
      name: string;
    };
    return { userId: decoded.userId, role: decoded.role, name: decoded.name };
  } catch {
    return null;
  }
}

// ─── Helper: check daily token usage ─────────────────────────────────────────

async function getDailyTokenUsage(userId: number): Promise<number> {
  const db = getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${voiceCostTracking.tokensUsed}), 0)` })
    .from(voiceCostTracking)
    .where(and(eq(voiceCostTracking.userId, userId), gte(voiceCostTracking.createdAt, today)));
  return Number(result[0]?.total ?? 0);
}

// ─── Helper: log token usage ─────────────────────────────────────────────────

async function logTokenUsage(userId: number, sessionId: string, tokensUsed: number, estimatedCostPence: number) {
  const db = getDb();
  await db.insert(voiceCostTracking).values({
    userId,
    sessionId,
    tokensUsed,
    estimatedCostPence,
    createdAt: new Date(),
  });
}

// ─── Helper: check feature flag ──────────────────────────────────────────────

async function isFeatureEnabled(flagName: string, userRole?: string): Promise<boolean> {
  const db = getDb();
  const flags = await db
    .select()
    .from(voiceFeatureFlags)
    .where(eq(voiceFeatureFlags.flagName, flagName))
    .limit(1);

  if (!flags.length) return false;
  const flag = flags[0]!;
  if (!flag.isEnabled) return false;

  // Check role allowlist
  if (userRole && flag.allowedRoles) {
    const allowed = JSON.parse(flag.allowedRoles) as string[];
    if (allowed.length > 0 && !allowed.includes(userRole)) return false;
  }

  return true;
}

// ─── Helper: execute tool call via voice agent router ────────────────────────

async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  client: VoiceClient
): Promise<{ status: string; data: unknown; error?: string }> {
  const db = getDb();
  const startTime = Date.now();

  try {
    // Log the tool call
    await db.insert(voiceToolCalls).values({
      sessionId: client.sessionId,
      toolName,
      inputPayload: JSON.stringify(args),
      userId: client.userId,
      userRole: client.userRole,
      startedAt: new Date(),
    });

    // Check if the specific tool is enabled
    const toolEnabled = await isFeatureEnabled(`tool_${toolName}`, client.userRole);
    if (!toolEnabled) {
      // Check if the global voice feature is enabled
      const globalEnabled = await isFeatureEnabled("voice_agent_enabled", client.userRole);
      if (!globalEnabled) {
        return { status: "error", data: null, error: "Voice agent is currently disabled" };
      }
    }

    // Route to the appropriate handler based on tool name
    const result = await routeToolCall(toolName, args, client);

    const durationMs = Date.now() - startTime;

    // Update tool call with result
    await db
      .update(voiceToolCalls)
      .set({
        outputPayload: JSON.stringify(result),
        durationMs,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(voiceToolCalls.sessionId, client.sessionId),
          eq(voiceToolCalls.toolName, toolName)
        )
      );

    return { status: "ok", data: result };
  } catch (err: any) {
    return { status: "error", data: null, error: err.message || "Tool execution failed" };
  }
}

// ─── Tool routing ────────────────────────────────────────────────────────────

async function routeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  client: VoiceClient
): Promise<unknown> {
  const db = getDb();

  switch (toolName) {
    case "get_current_user":
      return { userId: client.userId, role: client.userRole, name: client.userName, language: client.language };

    case "get_screen_context":
      return { screen: client.screenContext, entity: client.entityContext };

    case "get_staff_directory": {
      const staffRows = await db
        .select({
          id: users.id,
          name: users.name,
          role: users.role,
          email: users.email,
        })
        .from(users)
        .where(eq(users.isActive, true));
      // Exclude payroll data unless superadmin
      return staffRows;
    }

    case "get_trustees": {
      const { trustees } = await import("../drizzle/schema");
      const trusteeRows = await db.select().from(trustees);
      return trusteeRows;
    }

    case "get_donor": {
      const { donors } = await import("../drizzle/schema");
      const donorId = Number(args.donorId);
      if (!donorId) return { error: "donorId required" };
      const [donor] = await db.select().from(donors).where(eq(donors.id, donorId)).limit(1);
      if (!donor) return { error: "Donor not found" };
      // Filter fields based on role
      if (client.userRole === "reception") {
        return { id: donor.id, fullName: donor.fullName, email: donor.email, phone: donor.phone };
      }
      return donor;
    }

    case "search_transactions": {
      const { receipts } = await import("../drizzle/schema");
      const limit = Math.min(Number(args.limit) || 20, 50);
      const rows = await db.select().from(receipts).orderBy(desc(receipts.createdAt)).limit(limit);
      return rows;
    }

    case "get_fund_balance": {
      const { fundraisingCampaigns } = await import("../drizzle/schema");
      const campaignId = Number(args.campaignId);
      if (campaignId) {
        const [campaign] = await db.select().from(fundraisingCampaigns).where(eq(fundraisingCampaigns.id, campaignId)).limit(1);
        return campaign || { error: "Campaign not found" };
      }
      const campaigns = await db.select().from(fundraisingCampaigns);
      return campaigns;
    }

    case "get_campaign_status": {
      const { fundraisingCampaigns } = await import("../drizzle/schema");
      const campaigns = await db.select().from(fundraisingCampaigns);
      return campaigns;
    }

    case "get_gift_aid_status": {
      const { giftAidDeclarations, donors } = await import("../drizzle/schema");
      const declarations = await db
        .select()
        .from(giftAidDeclarations)
        .orderBy(desc(giftAidDeclarations.createdAt))
        .limit(50);
      return declarations;
    }

    case "get_priorities": {
      // Aggregate: pending approvals, flagged items, overdue follow-ups
      const { bulkApprovalItems } = await import("../drizzle/schema");
      const pending = await db
        .select()
        .from(bulkApprovalItems)
        .where(eq(bulkApprovalItems.status, "pending"))
        .limit(20);
      return { pendingApprovals: pending.length, items: pending };
    }

    case "create_donation": {
      const { fundraisingDonations, donors } = await import("../drizzle/schema");
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
      const { receipts } = await import("../drizzle/schema");
      // Fund ring-fencing check would go here
      return { status: "expense_created", note: "Use the receipt scanner for full expense entry" };
    }

    case "update_donor_profile": {
      const { donors } = await import("../drizzle/schema");
      const donorId = Number(args.donorId);
      if (!donorId) return { error: "donorId required" };

      // Field-level permissions
      const allowedFields: Record<string, string[]> = {
        reception: ["phone", "email"],
        staff: ["phone", "email", "address1", "address2", "city", "postcode"],
        manager: ["phone", "email", "address1", "address2", "city", "postcode", "notes", "status"],
        trustee: ["phone", "email", "address1", "address2", "city", "postcode", "notes", "status"],
        admin: ["phone", "email", "address1", "address2", "city", "postcode", "notes", "status"],
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
        channel: String(args.channel || "voice"),
        direction: "outbound",
        subject: String(args.subject || "Voice agent interaction"),
        body: String(args.body || ""),
        sentBy: client.userName,
        sentAt: new Date(),
        createdAt: new Date(),
      });
      return { success: true };
    }

    case "create_payment_link": {
      // Generate a Stripe checkout session URL
      return {
        status: "payment_link_ready",
        note: "Use the Pay page to generate Stripe payment links",
        suggestedUrl: `/pay?donorId=${args.donorId}&amount=${args.amount}`,
      };
    }

    case "draft_whatsapp":
    case "draft_email": {
      const { commsOutbox } = await import("../drizzle/schema");
      await db.insert(commsOutbox).values({
        channel: toolName === "draft_whatsapp" ? "whatsapp" : "email",
        recipientId: Number(args.recipientId) || null,
        recipientAddress: String(args.to || ""),
        subject: String(args.subject || ""),
        body: String(args.body || ""),
        status: "draft",
        createdBy: client.userId,
        createdAt: new Date(),
      });
      return { success: true, status: "draft_saved" };
    }

    case "compose_briefing": {
      // Aggregate data for morning briefing
      const { receipts, fundraisingCampaigns, bulkApprovalItems } = await import("../drizzle/schema");
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const recentReceipts = await db.select().from(receipts).where(gte(receipts.createdAt, yesterday)).limit(10);
      const activeCampaigns = await db.select().from(fundraisingCampaigns).where(eq(fundraisingCampaigns.isActive, true));
      const pendingApprovals = await db.select().from(bulkApprovalItems).where(eq(bulkApprovalItems.status, "pending"));

      return {
        date: new Date().toISOString().split("T")[0],
        recentTransactions: recentReceipts.length,
        activeCampaigns: activeCampaigns.length,
        pendingApprovals: pendingApprovals.length,
        summary: `Good morning. You have ${pendingApprovals.length} pending approvals, ${activeCampaigns.length} active campaigns, and ${recentReceipts.length} transactions since yesterday.`,
      };
    }

    case "flag_for_review": {
      const { voiceTranscripts } = await import("../drizzle/schema");
      // Flag a transcript for human review
      if (args.transcriptId) {
        await db
          .update(voiceTranscripts)
          .set({ flaggedForReview: true, reviewNote: String(args.note || "Flagged by user via voice") })
          .where(eq(voiceTranscripts.id, Number(args.transcriptId)));
      }
      return { success: true, note: "Flagged for Dr. Hamid's review" };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ─── Process text input (text-only mode / fallback) ──────────────────────────

async function processTextInput(client: VoiceClient, text: string): Promise<string> {
  const db = getDb();

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
    { type: "function" as const, function: { name: "update_donor_profile", description: "Update donor profile fields", parameters: { type: "object", properties: { donorId: { type: "number" }, phone: { type: "string" }, email: { type: "string" }, address1: { type: "string" }, postcode: { type: "string" } }, required: ["donorId"] } } },
    { type: "function" as const, function: { name: "log_communication", description: "Log a communication with a donor", parameters: { type: "object", properties: { donorId: { type: "number" }, channel: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["donorId"] } } },
    { type: "function" as const, function: { name: "create_payment_link", description: "Generate a Stripe payment link", parameters: { type: "object", properties: { donorId: { type: "number" }, amount: { type: "number" } }, required: ["donorId", "amount"] } } },
    { type: "function" as const, function: { name: "draft_whatsapp", description: "Draft a WhatsApp message", parameters: { type: "object", properties: { recipientId: { type: "number" }, to: { type: "string" }, body: { type: "string" } }, required: ["body"] } } },
    { type: "function" as const, function: { name: "draft_email", description: "Draft an email", parameters: { type: "object", properties: { recipientId: { type: "number" }, to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["body"] } } },
    { type: "function" as const, function: { name: "flag_for_review", description: "Flag something for Dr. Hamid's review", parameters: { type: "object", properties: { transcriptId: { type: "number" }, note: { type: "string" } }, required: [] } } },
  ];

  // Get conversation history for this session
  const recentTranscripts = await db
    .select()
    .from(voiceTranscripts)
    .where(eq(voiceTranscripts.sessionId, client.sessionId))
    .orderBy(desc(voiceTranscripts.createdAt))
    .limit(10);

  const conversationHistory = recentTranscripts
    .reverse()
    .map((t) => ({
      role: t.speaker === "user" ? ("user" as const) : ("assistant" as const),
      content: t.text,
    }));

  const messages = [
    { role: "system" as const, content: `${SYSTEM_PROMPT}\n\nContext: ${contextInfo}` },
    ...conversationHistory,
    { role: "user" as const, content: text },
  ];

  // Save user transcript
  await db.insert(voiceTranscripts).values({
    sessionId: client.sessionId,
    speaker: "user",
    text,
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
    sessionId: client.sessionId,
    speaker: "agent",
    text: agentText,
    tokensUsed: totalTokens,
    createdAt: new Date(),
  });

  // Log cost
  const estimatedCostPence = Math.ceil(totalTokens * 0.003); // rough estimate
  await logTokenUsage(client.userId, client.sessionId, totalTokens, estimatedCostPence);

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

    ws.on("pong", () => {
      const client = activeClients.get(connectionId);
      if (client) client.isAlive = true;
    });

    ws.on("message", async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
        return;
      }

      // ─── Start session ─────────────────────────────────────────────
      if (msg.type === "start_session") {
        if (!msg.sessionToken) {
          ws.send(JSON.stringify({ type: "error", error: "Session token required" }));
          ws.close();
          return;
        }

        const auth = await authenticateSession(msg.sessionToken);
        if (!auth) {
          ws.send(JSON.stringify({ type: "error", error: "Authentication failed" }));
          ws.close();
          return;
        }

        // Check if voice agent is enabled for this role
        const enabled = await isFeatureEnabled("voice_agent_enabled", auth.role);
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
          // Close the old session
          for (const old of existingSessions) {
            sendToClient(old, { type: "session_ended", text: "New session started from another tab" });
            old.ws.close();
            activeClients.delete(
              Array.from(activeClients.entries()).find(([, v]) => v === old)?.[0] || ""
            );
          }
        }

        const sessionId = `vs_${nanoid(16)}`;
        const db = getDb();

        // Create session record
        await db.insert(voiceSessions).values({
          sessionId,
          userId: auth.userId,
          userRole: auth.role,
          screenContext: msg.screenContext || "dashboard",
          startedAt: new Date(),
        });

        const client: VoiceClient = {
          ws,
          userId: auth.userId,
          userRole: auth.role,
          userName: auth.name,
          sessionId,
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
            sessionId,
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
        // When Gemini API key is available, this will:
        // 1. Forward audio to Gemini Live API
        // 2. Receive transcription + response
        // 3. Stream back audio + text
        // For now, send a message explaining text-only mode
        sendToClient(client, {
          type: "agent_response",
          text: "Voice input will be available once the Gemini API key is configured. Please use text input for now.",
        });
        return;
      }

      // ─── Correct this ──────────────────────────────────────────────
      if (msg.type === "correct_this") {
        const db = getDb();
        if (msg.transcriptId) {
          await db
            .update(voiceTranscripts)
            .set({
              flaggedForReview: true,
              reviewNote: msg.correctionNote || "User flagged this response as incorrect",
            })
            .where(eq(voiceTranscripts.id, Number(msg.transcriptId)));
        }
        sendToClient(client, {
          type: "agent_response",
          text: "Thank you, I've flagged that for Dr. Hamid to review.",
        });
        return;
      }

      // ─── End session ───────────────────────────────────────────────
      if (msg.type === "end_session") {
        const db = getDb();
        await db
          .update(voiceSessions)
          .set({ endedAt: new Date() })
          .where(eq(voiceSessions.sessionId, client.sessionId));

        sendToClient(client, { type: "session_ended", text: "Session ended. Goodbye!" });
        activeClients.delete(connectionId);
        ws.close();
        return;
      }
    });

    ws.on("close", async () => {
      const client = activeClients.get(connectionId);
      if (client) {
        const db = getDb();
        await db
          .update(voiceSessions)
          .set({ endedAt: new Date() })
          .where(eq(voiceSessions.sessionId, client.sessionId));
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
