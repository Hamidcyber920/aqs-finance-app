/**
 * Voice Database Helpers — Session tracking, cost tracking, monthly ceiling
 */
import { drizzle } from "drizzle-orm/mysql2";
import {
  voiceSessions,
  voiceCostTracking,
  voiceToolCalls,
  voiceTranscripts,
} from "../drizzle/schema";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";

let _db: ReturnType<typeof drizzle> | null = null;
function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); }
    catch { _db = null; }
  }
  return _db;
}

// ── Session Management ──

/** Create a new voice session record and return its ID */
export async function createVoiceSession(data: {
  userId: number;
  conversationId: string;
  device?: string;
  screenContext?: string;
}) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(voiceSessions).values({
    userId: data.userId,
    conversationId: data.conversationId,
    device: data.device || "unknown",
    screenContext: data.screenContext || "unknown",
    status: "active",
    tokenCount: 0,
  }).$returningId();
  return result.id;
}

/** End a voice session — update status, endedAt, and final token count */
export async function endVoiceSession(sessionId: number, tokenCount: number) {
  const db = getDb();
  if (!db) return;
  await db.update(voiceSessions)
    .set({
      status: "completed",
      endedAt: new Date(),
      tokenCount,
    })
    .where(eq(voiceSessions.id, sessionId));
}

/** Mark a session as errored */
export async function errorVoiceSession(sessionId: number) {
  const db = getDb();
  if (!db) return;
  await db.update(voiceSessions)
    .set({
      status: "error",
      endedAt: new Date(),
    })
    .where(eq(voiceSessions.id, sessionId));
}

// ── Cost Tracking ──

/** Record cost for a voice session */
export async function recordVoiceCost(data: {
  userId: number;
  tokenCount: number;
  estimatedCostPence: number;
}) {
  const db = getDb();
  if (!db) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Midnight today
  await db.insert(voiceCostTracking).values({
    userId: data.userId,
    date: today,
    tokenCount: data.tokenCount,
    estimatedCostPence: data.estimatedCostPence,
  });
}

/** Get total cost in pence for a user in a given month */
export async function getMonthlyVoiceCost(userId: number, year: number, month: number): Promise<number> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  const db = getDb();
  if (!db) return 0;
  const [result] = await db.select({
    total: sql<number>`COALESCE(SUM(${voiceCostTracking.estimatedCostPence}), 0)`,
  })
    .from(voiceCostTracking)
    .where(
      and(
        eq(voiceCostTracking.userId, userId),
        sql`${voiceCostTracking.date} >= ${startDate}`,
        sql`${voiceCostTracking.date} < ${endDate}`,
      )
    );
  return Number(result?.total ?? 0);
}

/** Get total cost in pence for ALL users in a given month */
export async function getTotalMonthlyVoiceCost(year: number, month: number): Promise<number> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  const db = getDb();
  if (!db) return 0;
  const [result] = await db.select({
    total: sql<number>`COALESCE(SUM(${voiceCostTracking.estimatedCostPence}), 0)`,
  })
    .from(voiceCostTracking)
    .where(
      and(
        sql`${voiceCostTracking.date} >= ${startDate}`,
        sql`${voiceCostTracking.date} < ${endDate}`,
      )
    );
  return Number(result?.total ?? 0);
}

/** Get weekly cost breakdown for the cost report */
export async function getWeeklyVoiceCostReport(): Promise<{
  totalCostPence: number;
  totalSessions: number;
  totalTokens: number;
  byUser: { userId: number; sessions: number; costPence: number; tokens: number }[];
}> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().split("T")[0];

  const db = getDb();
  if (!db) return { totalCostPence: 0, totalSessions: 0, totalTokens: 0, byUser: [] };
  const costs = await db.select({
    userId: voiceCostTracking.userId,
    totalCost: sql<number>`SUM(${voiceCostTracking.estimatedCostPence})`,
    totalTokens: sql<number>`SUM(${voiceCostTracking.tokenCount})`,
    sessions: sql<number>`COUNT(*)`,
  })
    .from(voiceCostTracking)
    .where(sql`${voiceCostTracking.date} >= ${weekAgoStr}`)
    .groupBy(voiceCostTracking.userId);

  const totalCostPence = costs.reduce((s, c) => s + Number(c.totalCost), 0);
  const totalSessions = costs.reduce((s, c) => s + Number(c.sessions), 0);
  const totalTokens = costs.reduce((s, c) => s + Number(c.totalTokens), 0);

  return {
    totalCostPence,
    totalSessions,
    totalTokens,
    byUser: costs.map(c => ({
      userId: Number(c.userId),
      sessions: Number(c.sessions),
      costPence: Number(c.totalCost),
      tokens: Number(c.totalTokens),
    })),
  };
}

// ── Tool Call Logging ──

/** Log a tool call made during a voice session */
export async function logVoiceToolCall(data: {
  sessionId: number;
  toolName: string;
  params?: string;
  resultSummary?: string;
  success: boolean;
  errorMessage?: string;
  latencyMs?: number;
}) {
  const db = getDb();
  if (!db) return;
  await db.insert(voiceToolCalls).values({
    sessionId: data.sessionId,
    toolName: data.toolName,
    params: data.params,
    resultSummary: data.resultSummary?.substring(0, 500), // truncate
    success: data.success,
    errorMessage: data.errorMessage,
    latencyMs: data.latencyMs,
  });
}

// ── Transcript Logging ──

/** Log a transcript entry for a voice session */
export async function logVoiceTranscript(data: {
  sessionId: number;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}) {
  const db = getDb();
  if (!db) return;
  await db.insert(voiceTranscripts).values({
    sessionId: data.sessionId,
    role: data.role,
    content: data.content.substring(0, 5000), // truncate long content
  });
}

// ── Recent Sessions ──

/** Get recent voice sessions for a user */
export async function getRecentVoiceSessions(userId: number, limit = 10) {
  const db = getDb();
  if (!db) return [];
  return db.select()
    .from(voiceSessions)
    .where(eq(voiceSessions.userId, userId))
    .orderBy(desc(voiceSessions.startedAt))
    .limit(limit);
}
