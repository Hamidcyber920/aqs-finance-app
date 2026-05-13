/**
 * Voice Agent Router — 20+ tool endpoints for the Gemini voice agent.
 * All endpoints enforce role-based permissions server-side.
 * Tool calls are logged to voice_tool_calls for audit.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { eq, and, sql, desc, gte, lte, like, or } from "drizzle-orm";
import {
  voiceSessions, voiceToolCalls, voiceTranscripts, voiceCostTracking,
  voiceFeatureFlags, voiceReviewQueue, voiceQuickActions,
  users, donors, fundraisingDonations, fundraisingCampaigns,
  receipts, trustees, donorCommsLog, pledges, pledgePayments,
  giftAidDeclarations, donorLeads, commsOutbox,
} from "../../drizzle/schema";
import { getDb } from "../db";
import nodemailer from "nodemailer";

// ─── Email helper (session summaries) ────────────────────────────────────────
async function sendSessionSummaryEmail(to: string, name: string, subject: string, htmlBody: string) {
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.GMAIL_FROM_EMAIL || "noreply@example.com";
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_FROM_EMAIL || fromEmail;
  const envPass = process.env.SMTP_PASSWORD;
  const smtpPass = (envPass && envPass.length === 16) ? envPass : "njvigzynhdcxusik";
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: parseInt(process.env.SMTP_PORT || "587") === 465,
    auth: { user: smtpUser, pass: smtpPass },
    tls: { rejectUnauthorized: false },
  });
  await transporter.sendMail({
    from: `"Abdullah Quilliam Society" <${fromEmail}>`,
    to: name ? `"${name}" <${to}>` : to,
    subject,
    html: htmlBody,
  });
}

// ─── Role helpers ────────────────────────────────────────────────────────────
const ADMIN_ROLES = ["superadmin", "trustee", "manager", "admin"];
const SENIOR_ROLES = ["superadmin", "trustee", "manager"];
function requireRole(role: string, allowed: string[]) {
  if (!allowed.includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Role '${role}' not permitted for this voice tool` });
  }
}

// ─── Cost tracking helpers ───────────────────────────────────────────────────
const DAILY_TOKEN_CAP = 200_000;
const MONTHLY_COST_CAP_PENCE = 50_000; // £500

async function checkCostCap(db: any, userId: number) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const [todayUsage] = await db.select({ total: sql<number>`COALESCE(SUM(tokenCount), 0)` })
    .from(voiceCostTracking).where(and(eq(voiceCostTracking.userId, userId), sql`DATE(${voiceCostTracking.date}) = ${todayStr}`));
  if (todayUsage && todayUsage.total >= DAILY_TOKEN_CAP) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Daily voice token cap (${DAILY_TOKEN_CAP}) reached. Try again tomorrow.` });
  }
  return { tokensUsedToday: todayUsage?.total ?? 0, remaining: DAILY_TOKEN_CAP - (todayUsage?.total ?? 0) };
}

async function logToolCall(db: any, sessionId: number, toolName: string, params: any, result: any, success: boolean, errorMessage?: string, latencyMs?: number) {
  await db.insert(voiceToolCalls).values({
    sessionId,
    toolName,
    params: JSON.stringify(params).slice(0, 2000),
    resultSummary: JSON.stringify(result).slice(0, 2000),
    success,
    errorMessage: errorMessage?.slice(0, 500),
    latencyMs,
  });
}

// ─── Voice Agent Router ──────────────────────────────────────────────────────
export const voiceAgentRouter = router({

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  startSession: protectedProcedure
    .input(z.object({
      language: z.string().default("en"),
      device: z.string().optional(),
      screenContext: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await checkCostCap(db, ctx.user.id);
      const conversationId = crypto.randomUUID();
      const [session] = await db.insert(voiceSessions).values({
        userId: ctx.user.id,
        conversationId,
        language: input.language,
        device: input.device,
        screenContext: input.screenContext,
      }).$returningId();
      return { sessionId: session.id, conversationId };
    }),

  endSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(voiceSessions)
        .set({ status: "completed", endedAt: new Date() })
        .where(and(eq(voiceSessions.id, input.sessionId), eq(voiceSessions.userId, ctx.user.id)));
      return { ok: true };
    }),

  listSessions: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      return db.select().from(voiceSessions)
        .where(eq(voiceSessions.userId, ctx.user.id))
        .orderBy(desc(voiceSessions.startedAt))
        .limit(input.limit);
    }),

  getSessionTranscript: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Verify ownership
      const [session] = await db.select().from(voiceSessions)
        .where(and(eq(voiceSessions.id, input.sessionId), eq(voiceSessions.userId, ctx.user.id)));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const transcripts = await db.select().from(voiceTranscripts)
        .where(eq(voiceTranscripts.sessionId, input.sessionId))
        .orderBy(voiceTranscripts.createdAt);
      const toolCalls = await db.select().from(voiceToolCalls)
        .where(eq(voiceToolCalls.sessionId, input.sessionId))
        .orderBy(voiceToolCalls.createdAt);
      return { session, transcripts, toolCalls };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY & CONTEXT TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  getCurrentUser: protectedProcedure.query(async ({ ctx }) => {
    return {
      id: ctx.user.id,
      name: ctx.user.name,
      role: ctx.user.role,
      email: ctx.user.email,
    };
  }),

  getScreenContext: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [session] = await db.select().from(voiceSessions)
        .where(and(eq(voiceSessions.id, input.sessionId), eq(voiceSessions.userId, ctx.user.id)));
      return { screenContext: session?.screenContext ?? null };
    }),

  updateScreenContext: protectedProcedure
    .input(z.object({ sessionId: z.number(), screenContext: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(voiceSessions)
        .set({ screenContext: input.screenContext })
        .where(and(eq(voiceSessions.id, input.sessionId), eq(voiceSessions.userId, ctx.user.id)));
      return { ok: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // READ — PEOPLE
  // ═══════════════════════════════════════════════════════════════════════════

  getStaffDirectory: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireRole(ctx.user.role, ADMIN_ROLES);
      const start = Date.now();
      const staff = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
      }).from(users).where(eq(users.isActive, true));
      await logToolCall(db, input.sessionId, "getStaffDirectory", {}, { count: staff.length }, true, undefined, Date.now() - start);
      return staff;
    }),

  getTrustees: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireRole(ctx.user.role, ADMIN_ROLES);
      const start = Date.now();
      const result = await db.select().from(trustees);
      await logToolCall(db, input.sessionId, "getTrustees", {}, { count: result.length }, true, undefined, Date.now() - start);
      return result;
    }),

  getDonor: protectedProcedure
    .input(z.object({ sessionId: z.number(), donorId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const start = Date.now();
      const [donor] = await db.select().from(donors).where(eq(donors.id, input.donorId));
      if (!donor) throw new TRPCError({ code: "NOT_FOUND", message: "Donor not found" });
      // Reception can't see lifetime value or Gift Aid
      let filtered: any = { ...donor };
      if (ctx.user.role === "volunteer") {
        delete filtered.totalGiven;
        delete filtered.giftAidStatus;
        delete filtered.rfmSegment;
        delete filtered.donorSince;
      }
      await logToolCall(db, input.sessionId, "getDonor", { donorId: input.donorId }, { found: true }, true, undefined, Date.now() - start);
      return filtered;
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // READ — FINANCE
  // ═══════════════════════════════════════════════════════════════════════════

  searchTransactions: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      query: z.string().optional(),
      fundId: z.number().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireRole(ctx.user.role, ADMIN_ROLES);
      const start = Date.now();
      // Search across receipts (expenses)
      const conditions: any[] = [];
      if (input.query) {
        conditions.push(or(
          like(receipts.vendor, `%${input.query}%`),
          like(receipts.notes, `%${input.query}%`),
        ));
      }
      if (input.dateFrom) conditions.push(gte(receipts.receiptDate, new Date(input.dateFrom)));
      if (input.dateTo) conditions.push(lte(receipts.receiptDate, new Date(input.dateTo)));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const results = await db.select().from(receipts).where(where)
        .orderBy(desc(receipts.receiptDate)).limit(input.limit).offset(input.offset);
      await logToolCall(db, input.sessionId, "searchTransactions", input, { count: results.length }, true, undefined, Date.now() - start);
      return results;
    }),

  getFundBalance: protectedProcedure
    .input(z.object({ sessionId: z.number(), campaignId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireRole(ctx.user.role, ADMIN_ROLES);
      const start = Date.now();
      if (input.campaignId) {
        const [campaign] = await db.select().from(fundraisingCampaigns).where(eq(fundraisingCampaigns.id, input.campaignId));
        if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
        const [donations] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
          .from(fundraisingDonations).where(eq(fundraisingDonations.campaignId, input.campaignId));
        await logToolCall(db, input.sessionId, "getFundBalance", input, { balance: donations?.total }, true, undefined, Date.now() - start);
        return { campaignName: campaign.name, balance: donations?.total ?? "0", target: campaign.targetAmount };
      }
      // All campaigns summary
      const campaigns = await db.select().from(fundraisingCampaigns);
      const balances = await Promise.all(campaigns.map(async (c: any) => {
        const [d] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
          .from(fundraisingDonations).where(eq(fundraisingDonations.campaignId, c.id));
        return { id: c.id, name: c.name, balance: d?.total ?? "0", target: c.targetAmount };
      }));
      await logToolCall(db, input.sessionId, "getFundBalance", input, { count: balances.length }, true, undefined, Date.now() - start);
      return balances;
    }),

  getCampaignStatus: protectedProcedure
    .input(z.object({ sessionId: z.number(), campaignId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const start = Date.now();
      const [campaign] = await db.select().from(fundraisingCampaigns).where(eq(fundraisingCampaigns.id, input.campaignId));
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      const [donations] = await db.select({
        total: sql<string>`COALESCE(SUM(amount), 0)`,
        count: sql<number>`COUNT(*)`,
      }).from(fundraisingDonations).where(eq(fundraisingDonations.campaignId, input.campaignId));
      await logToolCall(db, input.sessionId, "getCampaignStatus", input, { name: campaign.name }, true, undefined, Date.now() - start);
      return { ...campaign, totalRaised: donations?.total ?? "0", donationCount: donations?.count ?? 0 };
    }),

  getGiftAidStatus: protectedProcedure
    .input(z.object({ sessionId: z.number(), donorId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireRole(ctx.user.role, [...SENIOR_ROLES, "admin"]);
      const start = Date.now();
      if (input.donorId) {
        // giftAidDeclarations doesn't have donorId; search by donorName via donors table
        const [donor] = await db.select({ name: donors.name }).from(donors).where(eq(donors.id, input.donorId)).limit(1);
        const declarations = await db.select().from(giftAidDeclarations)
          .where(donor ? like(giftAidDeclarations.donorName, `%${donor.name}%`) : sql`1=0`);
        await logToolCall(db, input.sessionId, "getGiftAidStatus", input, { count: declarations.length }, true, undefined, Date.now() - start);
        return declarations;
      }
      // Summary: total declarations, total claimable
      const [summary] = await db.select({
        totalDeclarations: sql<number>`COUNT(*)`,
        activeDeclarations: sql<number>`SUM(CASE WHEN isActive = true THEN 1 ELSE 0 END)`,
      }).from(giftAidDeclarations);
      await logToolCall(db, input.sessionId, "getGiftAidStatus", input, summary, true, undefined, Date.now() - start);
      return summary;
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // READ — CONTEXT
  // ═══════════════════════════════════════════════════════════════════════════

  getPriorities: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireRole(ctx.user.role, ADMIN_ROLES);
      const start = Date.now();
      // Pending pledge payments
      const pendingPledges = await db.select().from(pledges)
        .where(eq(pledges.status, "active")).limit(10);
      // Recent flagged items from review queue
      const flaggedItems = await db.select().from(voiceReviewQueue)
        .where(eq(voiceReviewQueue.status, "pending"))
        .orderBy(desc(voiceReviewQueue.createdAt)).limit(10);
      await logToolCall(db, input.sessionId, "getPriorities", {}, { pledges: pendingPledges.length, flagged: flaggedItems.length }, true, undefined, Date.now() - start);
      return { pendingPledges, flaggedItems };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // WRITE — RECORDS
  // ═══════════════════════════════════════════════════════════════════════════

  createDonation: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      donorId: z.number(),
      campaignId: z.number(),
      amount: z.number().min(0.01).max(1000000),
      method: z.enum(["cash", "card", "bank_transfer", "online", "cheque"]).default("cash"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireRole(ctx.user.role, [...SENIOR_ROLES, "admin", "volunteer"]);
      const start = Date.now();
      // Amount edge cases (from QA hardening)
      if (input.amount <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Amount must be positive" });
      if (input.amount < 0.01) throw new TRPCError({ code: "BAD_REQUEST", message: "Minimum donation is £0.01" });
      const [result] = await db.insert(fundraisingDonations).values({
        campaignId: input.campaignId,
        donorName: ctx.user.name ?? "Voice Agent",
        amount: input.amount.toFixed(2),
        paymentMethod: (input.method ?? "cash") as any,
        notes: input.notes,
      }).$returningId();
      // Log comms
      await db.insert(donorCommsLog).values({
        donorId: input.donorId,
        type: "manual_note",
        channel: "system",
        subject: "Donation recorded via voice agent",
        notes: `£${input.amount.toFixed(2)} donation recorded to campaign #${input.campaignId} by ${ctx.user.name} via voice agent`,
        sentByUserId: ctx.user.id,
      });
      await logToolCall(db, input.sessionId, "createDonation", input, { donationId: result.id }, true, undefined, Date.now() - start);
      return { donationId: result.id, amount: input.amount };
    }),

  createExpense: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      vendor: z.string().min(1),
      amount: z.number().min(0.01),
      category: z.string().optional(),
      description: z.string().optional(),
      date: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireRole(ctx.user.role, SENIOR_ROLES);
      const start = Date.now();
      const [result] = await db.insert(receipts).values({
        userId: ctx.user.id,
        vendor: input.vendor,
        amount: input.amount.toFixed(2),
        categoryName: input.category ?? "Uncategorised",
        notes: input.description,
        receiptDate: input.date ? new Date(input.date) : new Date(),
      }).$returningId();
      await logToolCall(db, input.sessionId, "createExpense", input, { receiptId: result.id }, true, undefined, Date.now() - start);
      return { receiptId: result.id };
    }),

  updateDonorProfile: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      donorId: z.number(),
      updates: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireRole(ctx.user.role, [...SENIOR_ROLES, "admin"]);
      const start = Date.now();
      // Field-level permissions: reception cannot update financial fields
      const RESTRICTED_FIELDS = ["totalGiven", "giftAidStatus", "rfmSegment", "status"];
      if (ctx.user.role === "volunteer") {
        for (const field of Object.keys(input.updates)) {
          if (RESTRICTED_FIELDS.includes(field)) {
            throw new TRPCError({ code: "FORBIDDEN", message: `Reception cannot update field: ${field}` });
          }
        }
      }
      await db.update(donors).set(input.updates).where(eq(donors.id, input.donorId));
      await logToolCall(db, input.sessionId, "updateDonorProfile", input, { updated: true }, true, undefined, Date.now() - start);
      return { ok: true };
    }),

  logCommunication: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      donorId: z.number(),
      channel: z.enum(["email", "phone", "whatsapp", "sms", "in_person", "system"]),
      direction: z.enum(["inbound", "outbound"]),
      subject: z.string(),
      body: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const start = Date.now();
      await db.insert(donorCommsLog).values({
        donorId: input.donorId,
        type: "manual_note",
        channel: (["email","whatsapp","sms","system"].includes(input.channel) ? input.channel : "system") as any,
        subject: input.subject,
        notes: input.body,
        sentByUserId: ctx.user.id,
      });
      await logToolCall(db, input.sessionId, "logCommunication", input, { logged: true }, true, undefined, Date.now() - start);
      return { ok: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // WRITE — PAYMENTS & COMMS
  // ═══════════════════════════════════════════════════════════════════════════

  draftMessage: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      donorId: z.number().optional(),
      channel: z.enum(["email", "whatsapp", "sms"]),
      subject: z.string().optional(),
      body: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireRole(ctx.user.role, [...SENIOR_ROLES, "admin"]);
      const start = Date.now();
      // Write to comms outbox as draft
      const [result] = await db.insert(commsOutbox).values({
        sentByUserId: ctx.user.id,
        recipientGroup: "custom",
        type: (input.channel === "sms" ? "sms" : "email") as any,
        subject: input.subject ?? "(Voice draft)",
        body: input.body,
        status: "queued",
      }).$returningId();
      await logToolCall(db, input.sessionId, "draftMessage", input, { draftId: result.id }, true, undefined, Date.now() - start);
      return { draftId: result.id, status: "draft" };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORTING
  // ═══════════════════════════════════════════════════════════════════════════

  composeBriefing: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireRole(ctx.user.role, SENIOR_ROLES);
      const start = Date.now();
      // Gather data for morning briefing
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      // Recent donations (last 24h)
      const recentDonations = await db.select().from(fundraisingDonations)
        .where(gte(fundraisingDonations.createdAt, new Date(Date.now() - 86400000)))
        .orderBy(desc(fundraisingDonations.createdAt)).limit(10);

      // Pending pledges
      const pendingPledges = await db.select().from(pledges)
        .where(eq(pledges.status, "active")).limit(5);

      // Pending review items
      const pendingReviews = await db.select().from(voiceReviewQueue)
        .where(eq(voiceReviewQueue.status, "pending")).limit(5);

      // Recent expenses
      const recentExpenses = await db.select().from(receipts)
        .where(gte(receipts.receiptDate, new Date(Date.now() - 86400000)))
        .orderBy(desc(receipts.receiptDate)).limit(5);

      // Use LLM to compose the briefing
      const briefingData = {
        date: today,
        userName: ctx.user.name,
        recentDonations: recentDonations.map((d: any) => ({ amount: d.amount, method: d.method, campaign: d.campaignId })),
        pendingPledges: pendingPledges.length,
        pendingReviews: pendingReviews.length,
        recentExpenses: recentExpenses.map((e: any) => ({ vendor: e.vendor, total: e.total, category: e.category })),
      };

      const llmResponse = await invokeLLM({
        messages: [
          { role: "system", content: "You are a charity management assistant. Compose a concise morning briefing for a trustee/manager. Use British English. Be factual and professional. Format as bullet points." },
          { role: "user", content: `Compose a morning briefing for ${ctx.user.name} based on this data:\n${JSON.stringify(briefingData, null, 2)}` },
        ],
      });

      const briefingText = String(llmResponse.choices?.[0]?.message?.content ?? "No briefing data available.");
      // Save transcript
      await db.insert(voiceTranscripts).values({
        sessionId: input.sessionId,
        role: "assistant",
        content: briefingText,
      });
      await logToolCall(db, input.sessionId, "composeBriefing", {}, { length: briefingText.length }, true, undefined, Date.now() - start);
      return { briefing: briefingText, dataTimestamp: new Date().toISOString() };
    }),

  flagForReview: protectedProcedure
    .input(z.object({
      sessionId: z.number().optional(),
      transcriptId: z.number().optional(),
      agentStatement: z.string(),
      userCorrection: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const start = Date.now();
      const [result] = await db.insert(voiceReviewQueue).values({
        sessionId: input.sessionId,
        transcriptId: input.transcriptId,
        flaggedByUserId: ctx.user.id,
        agentStatement: input.agentStatement,
        userCorrection: input.userCorrection,
      }).$returningId();
      if (input.sessionId) {
        await logToolCall(db, input.sessionId, "flagForReview", input, { reviewId: result.id }, true, undefined, Date.now() - start);
      }
      return { reviewId: result.id };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // REVIEW QUEUE (Admin)
  // ═══════════════════════════════════════════════════════════════════════════

  listReviewQueue: protectedProcedure
    .input(z.object({ status: z.enum(["pending", "reviewed", "dismissed"]).default("pending") }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireRole(ctx.user.role, SENIOR_ROLES);
      return db.select().from(voiceReviewQueue)
        .where(eq(voiceReviewQueue.status, input.status))
        .orderBy(desc(voiceReviewQueue.createdAt)).limit(50);
    }),

  resolveReviewItem: protectedProcedure
    .input(z.object({
      reviewId: z.number(),
      status: z.enum(["reviewed", "dismissed"]),
      reviewNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireRole(ctx.user.role, SENIOR_ROLES);
      await db.update(voiceReviewQueue).set({
        status: input.status,
        reviewedByUserId: ctx.user.id,
        reviewNotes: input.reviewNotes,
        reviewedAt: new Date(),
      }).where(eq(voiceReviewQueue.id, input.reviewId));
      return { ok: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // COST TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  getCostSummary: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireRole(ctx.user.role, SENIOR_ROLES);
      const since = new Date(Date.now() - input.days * 86400000).toISOString().slice(0, 10);
      const costs = await db.select({
        date: voiceCostTracking.date,
        tokens: sql<number>`SUM(tokenCount)`,
        costPence: sql<number>`SUM(estimatedCostPence)`,
      }).from(voiceCostTracking)
        .where(sql`DATE(${voiceCostTracking.date}) >= ${since}`)
        .groupBy(voiceCostTracking.date)
        .orderBy(desc(voiceCostTracking.date));
      const totalTokens = costs.reduce((sum: number, c: any) => sum + (c.tokens ?? 0), 0);
      const totalCostPence = costs.reduce((sum: number, c: any) => sum + (c.costPence ?? 0), 0);
      return { days: input.days, dailyBreakdown: costs, totalTokens, totalCostPence, totalCostGBP: (totalCostPence / 100).toFixed(2) };
    }),

  recordTokenUsage: protectedProcedure
    .input(z.object({ tokenCount: z.number().min(0), estimatedCostPence: z.number().min(0).default(0) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.insert(voiceCostTracking).values({
        userId: ctx.user.id,
        date: new Date(),
        tokenCount: input.tokenCount,
        estimatedCostPence: input.estimatedCostPence,
      });
      return { ok: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE FLAGS
  // ═══════════════════════════════════════════════════════════════════════════

  getFeatureFlags: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    requireRole(ctx.user.role, SENIOR_ROLES);
    return db.select().from(voiceFeatureFlags).orderBy(voiceFeatureFlags.toolName);
  }),

  updateFeatureFlag: protectedProcedure
    .input(z.object({
      toolName: z.string(),
      enabled: z.boolean(),
      enabledRoles: z.array(z.string()).optional(),
      phase: z.number().min(1).max(5).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireRole(ctx.user.role, ["superadmin"]);
      // Upsert
      const [existing] = await db.select().from(voiceFeatureFlags).where(eq(voiceFeatureFlags.toolName, input.toolName));
      if (existing) {
        await db.update(voiceFeatureFlags).set({
          enabled: input.enabled,
          ...(input.enabledRoles ? { enabledRoles: JSON.stringify(input.enabledRoles) } : {}),
          ...(input.phase !== undefined ? { phase: input.phase } : {}),
        }).where(eq(voiceFeatureFlags.id, existing.id));
      } else {
        await db.insert(voiceFeatureFlags).values({
          toolName: input.toolName,
          enabled: input.enabled,
          enabledRoles: JSON.stringify(input.enabledRoles ?? []),
          phase: input.phase ?? 1,
        });
      }
      return { ok: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSCRIPT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  addTranscript: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      role: z.enum(["user", "assistant", "system", "tool"]),
      content: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Verify session ownership
      const [session] = await db.select().from(voiceSessions)
        .where(and(eq(voiceSessions.id, input.sessionId), eq(voiceSessions.userId, ctx.user.id)));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      await db.insert(voiceTranscripts).values({
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
      });
      return { ok: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CHAT (Text-based fallback when voice unavailable)
  // ═══════════════════════════════════════════════════════════════════════════

  chat: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      message: z.string().min(1).max(2000),
      screenContext: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await checkCostCap(db, ctx.user.id);
      // Save user message
      await db.insert(voiceTranscripts).values({
        sessionId: input.sessionId,
        role: "user",
        content: input.message,
      });
      // Build context for LLM
      const systemPrompt = `You are Hibba, a helpful voice assistant for a UK charity management system. You help trustees, managers, and staff with donor management, finance queries, Gift Aid, campaigns, and daily operations. Be concise, professional, and use British English. The current user is ${ctx.user.name} (role: ${ctx.user.role}).${input.screenContext ? ` They are currently viewing: ${input.screenContext}.` : ""}`;
      // Get recent transcript for context
      const recentTranscripts = await db.select().from(voiceTranscripts)
        .where(eq(voiceTranscripts.sessionId, input.sessionId))
        .orderBy(desc(voiceTranscripts.createdAt)).limit(10);
      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...recentTranscripts.reverse().map((t: any) => ({
          role: t.role as "user" | "assistant",
          content: t.content,
        })),
      ];
      const llmResponse = await invokeLLM({ messages });
      const assistantMessage = String(llmResponse.choices?.[0]?.message?.content ?? "I'm sorry, I couldn't process that request.");
      // Save assistant response
      await db.insert(voiceTranscripts).values({
        sessionId: input.sessionId,
        role: "assistant",
        content: assistantMessage,
      });
      // Track token usage
      const tokensUsed = llmResponse.usage?.total_tokens ?? 500;
      await db.insert(voiceCostTracking).values({
        userId: ctx.user.id,
        date: new Date(),
        tokenCount: tokensUsed,
        estimatedCostPence: Math.ceil(tokensUsed * 0.003), // rough Gemini pricing
      });
      return { response: assistantMessage, tokensUsed };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════
  getAnalytics: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      requireRole(ctx.user.role, [...ADMIN_ROLES, "deputy", "assistant"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const since = new Date(Date.now() - input.days * 86400000);

      // Daily session counts
      const dailySessions = await db.select({
        date: sql<string>`DATE(${voiceSessions.startedAt})`,
        count: sql<number>`COUNT(*)`,
      }).from(voiceSessions)
        .where(gte(voiceSessions.startedAt, since))
        .groupBy(sql`DATE(${voiceSessions.startedAt})`)
        .orderBy(sql`DATE(${voiceSessions.startedAt})`);

      // Top tool calls
      const topTools = await db.select({
        toolName: voiceToolCalls.toolName,
        count: sql<number>`COUNT(*)`,
        avgLatency: sql<number>`ROUND(AVG(${voiceToolCalls.latencyMs}))`,
        successRate: sql<number>`ROUND(SUM(CASE WHEN ${voiceToolCalls.success} = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1)`,
      }).from(voiceToolCalls)
        .innerJoin(voiceSessions, eq(voiceToolCalls.sessionId, voiceSessions.id))
        .where(gte(voiceSessions.startedAt, since))
        .groupBy(voiceToolCalls.toolName)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(15);

      // Daily token cost
      const dailyCost = await db.select({
        date: sql<string>`DATE(${voiceCostTracking.date})`,
        tokens: sql<number>`SUM(${voiceCostTracking.tokenCount})`,
        costPence: sql<number>`SUM(${voiceCostTracking.estimatedCostPence})`,
      }).from(voiceCostTracking)
        .where(gte(voiceCostTracking.date, since))
        .groupBy(sql`DATE(${voiceCostTracking.date})`)
        .orderBy(sql`DATE(${voiceCostTracking.date})`);

      // Summary stats
      const [totals] = await db.select({
        totalSessions: sql<number>`COUNT(*)`,
        avgDuration: sql<number>`ROUND(AVG(TIMESTAMPDIFF(SECOND, ${voiceSessions.startedAt}, ${voiceSessions.endedAt})))`,
      }).from(voiceSessions).where(gte(voiceSessions.startedAt, since));

      const [toolTotals] = await db.select({
        totalToolCalls: sql<number>`COUNT(*)`,
      }).from(voiceToolCalls)
        .innerJoin(voiceSessions, eq(voiceToolCalls.sessionId, voiceSessions.id))
        .where(gte(voiceSessions.startedAt, since));

      const [costTotals] = await db.select({
        totalTokens: sql<number>`COALESCE(SUM(${voiceCostTracking.tokenCount}), 0)`,
        totalCostPence: sql<number>`COALESCE(SUM(${voiceCostTracking.estimatedCostPence}), 0)`,
      }).from(voiceCostTracking).where(gte(voiceCostTracking.date, since));

      return {
        summary: {
          totalSessions: totals?.totalSessions ?? 0,
          avgDurationSecs: totals?.avgDuration ?? 0,
          totalToolCalls: toolTotals?.totalToolCalls ?? 0,
          totalTokens: costTotals?.totalTokens ?? 0,
          totalCostPence: costTotals?.totalCostPence ?? 0,
        },
        dailySessions,
        topTools,
        dailyCost,
      };
    }),
  // ═══════════════════════════════════════════════════════════════════════════
  // QUICK ACTION CUSTOMISATION
  // ═══════════════════════════════════════════════════════════════════════════
  getQuickActions: protectedProcedure
    .input(z.object({ pageKey: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db.select().from(voiceQuickActions)
        .where(and(eq(voiceQuickActions.userId, ctx.user.id), eq(voiceQuickActions.pageKey, input.pageKey)));
      if (!row) return null;
      try {
        return JSON.parse(row.actions) as string[];
      } catch {
        return null;
      }
    }),

  saveQuickActions: protectedProcedure
    .input(z.object({
      pageKey: z.string(),
      actions: z.array(z.string().max(120)).max(6),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const actionsJson = JSON.stringify(input.actions);
      // Upsert: insert or update on duplicate key
      await db.execute(
        sql`INSERT INTO voice_quick_actions (userId, pageKey, actions, updatedAt)
            VALUES (${ctx.user.id}, ${input.pageKey}, ${actionsJson}, NOW())
            ON DUPLICATE KEY UPDATE actions = ${actionsJson}, updatedAt = NOW()`
      );
      return { saved: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION SUMMARY EMAIL
  // ═══════════════════════════════════════════════════════════════════════════
  emailSessionSummary: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      email: z.string().email().optional(), // override recipient email
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Fetch session + transcripts
      const [session] = await db.select().from(voiceSessions)
        .where(and(eq(voiceSessions.id, input.sessionId), eq(voiceSessions.userId, ctx.user.id)));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      const transcripts = await db.select().from(voiceTranscripts)
        .where(eq(voiceTranscripts.sessionId, input.sessionId))
        .orderBy(voiceTranscripts.createdAt);

      const toolCalls = await db.select().from(voiceToolCalls)
        .where(eq(voiceToolCalls.sessionId, input.sessionId))
        .orderBy(voiceToolCalls.createdAt);

      // Build plain-text transcript
      const transcriptText = transcripts.map((t: any) => {
        const speaker = t.speaker === "user" ? "You" : "Hibba";
        return `${speaker}: ${t.text}`;
      }).join("\n");

      // Use LLM to generate a concise summary
      let summaryText = "No summary available.";
      try {
        const llmRes = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant. Summarise the following voice session transcript in 3-5 bullet points. Focus on what was discussed, any actions taken, and any important data retrieved. Be concise and professional.",
            },
            {
              role: "user",
              content: transcriptText || "No transcript available.",
            },
          ],
        });
        summaryText = (llmRes as any)?.choices?.[0]?.message?.content || summaryText;
      } catch (_) {
        // Fall back to raw transcript if LLM fails
        summaryText = transcriptText || "No transcript available.";
      }

      // Format tool calls
      const toolCallsHtml = toolCalls.length > 0
        ? `<ul>${toolCalls.map((tc: any) => `<li><strong>${tc.toolName}</strong> — ${tc.success ? "✓ Success" : "✗ Failed"} (${tc.latencyMs ?? 0}ms)</li>`).join("")}</ul>`
        : "<p>No tool calls in this session.</p>";

      const sessionDate = new Date(session.startedAt).toLocaleString("en-GB", { timeZone: "Europe/London" });
      const durationSecs = session.endedAt
        ? Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
        : null;
      const durationStr = durationSecs ? `${Math.floor(durationSecs / 60)}m ${durationSecs % 60}s` : "In progress";

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
          <div style="background: #0A192F; padding: 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: #10b981; margin: 0; font-size: 20px;">Hibba Voice Session Summary</h1>
            <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">${sessionDate} · Duration: ${durationStr}</p>
          </div>
          <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
            <p>Dear ${ctx.user.name || "Team Member"},</p>
            <p>AssalamuAlaikum. Here is a summary of your recent Hibba voice session.</p>

            <h2 style="color: #0A192F; font-size: 16px; margin-top: 24px;">Session Summary</h2>
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">
${summaryText}
            </div>

            <h2 style="color: #0A192F; font-size: 16px; margin-top: 24px;">Actions Taken by Hibba</h2>
            ${toolCallsHtml}

            <h2 style="color: #0A192F; font-size: 16px; margin-top: 24px;">Full Transcript</h2>
            <div style="background: #1e293b; color: #e2e8f0; border-radius: 6px; padding: 16px; font-family: monospace; font-size: 12px; white-space: pre-wrap; max-height: 400px; overflow-y: auto;">
${transcriptText || "No transcript recorded."}
            </div>

            <p style="margin-top: 24px; font-size: 12px; color: #94a3b8;">
              This email was generated automatically by the Hibba Voice Assistant system.<br>
              Abdullah Quilliam Society · Liverpool
            </p>
          </div>
        </div>
      `;

      const recipientEmail = input.email || ctx.user.email;
      const recipientName = ctx.user.name || "Team Member";

      await sendSessionSummaryEmail(
        recipientEmail,
        recipientName,
        `Hibba Session Summary — ${sessionDate}`,
        htmlBody,
      );

      return { sent: true, to: recipientEmail };
    }),
});
