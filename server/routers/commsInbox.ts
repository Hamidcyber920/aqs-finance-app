import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  emailSections,
  inboundEmails,
  emailAttachments,
  emailActivityLog,
  sectionReplyTemplates,
} from "../../drizzle/schema";
import { eq, desc, and, or, like, isNull, sql, gte, lte, inArray } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";

// ─── Module-level Gmail sync timestamp (updated by scheduledJobs.ts) ────────
export let gmailLastSyncedAt: number | null = null;
export function setGmailLastSyncedAt(ts: number) { gmailLastSyncedAt = ts; }
// ─── Default system sections seeded on first use ─────────────────────────────
const SYSTEM_SECTIONS = [
  { name: "Urgent", color: "#ef4444", icon: "AlertTriangle", sortOrder: 0, isSystem: true },
  { name: "Accounts", color: "#f59e0b", icon: "Calculator", sortOrder: 1, isSystem: true },
  { name: "HMRC", color: "#3b82f6", icon: "Building2", sortOrder: 2, isSystem: true },
  { name: "Gift Aid", color: "#10b981", icon: "Heart", sortOrder: 3, isSystem: true },
  { name: "Trustees", color: "#8b5cf6", icon: "Shield", sortOrder: 4, isSystem: true },
  { name: "Staff", color: "#06b6d4", icon: "Users", sortOrder: 5, isSystem: true },
  { name: "Student Accommodation", color: "#f97316", icon: "Home", sortOrder: 6, isSystem: true },
  { name: "General Enquiries", color: "#6b7280", icon: "Mail", sortOrder: 7, isSystem: true },
  { name: "Friday Comms", color: "#ec4899", icon: "Calendar", sortOrder: 8, isSystem: true },
];

async function ensureSystemSections(db: any) {
  const existing = await db.select({ name: emailSections.name }).from(emailSections);
  const existingNames = new Set(existing.map((s: any) => s.name));
  const toInsert = SYSTEM_SECTIONS.filter(s => !existingNames.has(s.name));
  if (toInsert.length > 0) {
    await db.insert(emailSections).values(toInsert);
  }
}

export const commsInboxRouter = router({
  // ── Sections ──────────────────────────────────────────────────────────────

  listSections: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    await ensureSystemSections(db);
    return db.select().from(emailSections).orderBy(emailSections.sortOrder, emailSections.name);
  }),

  upsertSection: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      color: z.string().optional(),
      icon: z.string().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      if (input.id) {
        await db.update(emailSections).set({
          name: input.name,
          description: input.description,
          color: input.color,
          icon: input.icon,
          sortOrder: input.sortOrder ?? 0,
        }).where(eq(emailSections.id, input.id));
        return { id: input.id };
      } else {
        const [result] = await db.insert(emailSections).values({
          name: input.name,
          description: input.description,
          color: input.color ?? "#6366f1",
          icon: input.icon,
          sortOrder: input.sortOrder ?? 99,
          isSystem: false,
          createdByUserId: ctx.user.id,
        });
        return { id: (result as any).insertId };
      }
    }),

  deleteSection: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [section] = await db.select().from(emailSections).where(eq(emailSections.id, input.id));
      if (!section) throw new TRPCError({ code: "NOT_FOUND" });
      if ((section as any).isSystem) throw new TRPCError({ code: "FORBIDDEN", message: "Cannot delete system sections" });
      // Move emails in this section to unsectioned
      await db.update(inboundEmails).set({ sectionId: null as any }).where(eq(inboundEmails.sectionId, input.id));
      await db.delete(emailSections).where(eq(emailSections.id, input.id));
      return { success: true };
    }),

  // ── Emails ────────────────────────────────────────────────────────────────

  listEmails: protectedProcedure
    .input(z.object({
      sectionId: z.number().optional(),
      status: z.enum(["unread", "read", "actioned", "archived"]).optional(),
      priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
      search: z.string().optional(),
      fromEmail: z.string().optional(), // exact/partial match on fromEmail for donor comms tab
      dateFrom: z.number().optional(), // UTC ms timestamp
      dateTo: z.number().optional(),   // UTC ms timestamp
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const conditions: any[] = [];
      if (input.sectionId !== undefined) conditions.push(eq(inboundEmails.sectionId, input.sectionId));
      if (input.status) conditions.push(eq(inboundEmails.status, input.status));
      if (input.priority) conditions.push(eq(inboundEmails.priority, input.priority));
      if (input.dateFrom) conditions.push(gte(inboundEmails.receivedAt, new Date(input.dateFrom)));
      if (input.dateTo) conditions.push(lte(inboundEmails.receivedAt, new Date(input.dateTo)));
      if (input.fromEmail) conditions.push(like(inboundEmails.fromEmail, `%${input.fromEmail}%`));
      if (input.search) {
        conditions.push(or(
          like(inboundEmails.subject, `%${input.search}%`),
          like(inboundEmails.fromEmail, `%${input.search}%`),
          like(inboundEmails.fromName, `%${input.search}%`),
          like(inboundEmails.snippet, `%${input.search}%`),
        ));
      }
      const emails = await db.select().from(inboundEmails)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(inboundEmails.receivedAt))
        .limit(input.limit)
        .offset(input.offset);
      return emails;
    }),

  getEmail: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [email] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, input.id));
      if (!email) throw new TRPCError({ code: "NOT_FOUND" });
      const attachments = await db.select().from(emailAttachments).where(eq(emailAttachments.emailId, input.id));
      const activity = await db.select().from(emailActivityLog)
        .where(eq(emailActivityLog.emailId, input.id))
        .orderBy(desc(emailActivityLog.createdAt))
        .limit(20);
      return { email, attachments, activity };
    }),

  getInboxStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const [unread] = await db.select({ count: sql<number>`count(*)` }).from(inboundEmails).where(eq(inboundEmails.status, "unread"));
    const [urgent] = await db.select({ count: sql<number>`count(*)` }).from(inboundEmails).where(and(eq(inboundEmails.priority, "urgent"), eq(inboundEmails.status, "unread")));
    const [actionRequired] = await db.select({ count: sql<number>`count(*)` }).from(inboundEmails).where(eq(inboundEmails.aiActionRequired, true));
    const [total] = await db.select({ count: sql<number>`count(*)` }).from(inboundEmails);
    return {
      unread: Number(unread.count),
      urgent: Number(urgent.count),
      actionRequired: Number(actionRequired.count),
      total: Number(total.count),
    };
  }),

  // ── Push email manually (or from Gmail webhook) ──────────────────────────

  pushEmail: protectedProcedure
    .input(z.object({
      fromEmail: z.string().email(),
      fromName: z.string().optional(),
      toEmail: z.string().optional(),
      subject: z.string().min(1),
      bodyText: z.string().optional(),
      bodyHtml: z.string().optional(),
      snippet: z.string().optional(),
      priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
      sectionId: z.number().optional(),
      gmailMessageId: z.string().optional(),
      gmailThreadId: z.string().optional(),
      receivedAt: z.string().optional(), // ISO timestamp
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Deduplicate by gmailMessageId
      if (input.gmailMessageId) {
        const [existing] = await db.select({ id: inboundEmails.id }).from(inboundEmails)
          .where(eq(inboundEmails.gmailMessageId, input.gmailMessageId));
        if (existing) return { id: (existing as any).id, duplicate: true };
      }
      const [result] = await db.insert(inboundEmails).values({
        fromEmail: input.fromEmail,
        fromName: input.fromName,
        toEmail: input.toEmail,
        subject: input.subject,
        bodyText: input.bodyText,
        bodyHtml: input.bodyHtml,
        snippet: input.snippet ?? input.bodyText?.slice(0, 200),
        priority: input.priority ?? "normal",
        sectionId: input.sectionId,
        gmailMessageId: input.gmailMessageId,
        gmailThreadId: input.gmailThreadId,
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
        status: "unread",
      });
      const emailId = (result as any).insertId;
      // Log receipt
      await db.insert(emailActivityLog).values({
        emailId,
        userId: ctx.user.id,
        action: "received",
      });
      return { id: emailId, duplicate: false };
    }),

  // ── Update email status / move section / assign ──────────────────────────

  updateEmail: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["unread", "read", "actioned", "archived"]).optional(),
      priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
      sectionId: z.number().nullable().optional(),
      assignedToUserId: z.number().nullable().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [current] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, input.id));
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      const updates: any = {};
      if (input.status !== undefined) updates.status = input.status;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.sectionId !== undefined) updates.sectionId = input.sectionId;
      if (input.assignedToUserId !== undefined) {
        updates.assignedToUserId = input.assignedToUserId;
        updates.assignedAt = input.assignedToUserId ? new Date() : null;
      }
      await db.update(inboundEmails).set(updates).where(eq(inboundEmails.id, input.id));
      // Determine action for log
      let action: any = "read";
      if (input.sectionId !== undefined && input.sectionId !== (current as any).sectionId) action = "moved_section";
      else if (input.assignedToUserId !== undefined) action = "assigned";
      else if (input.status === "actioned") action = "actioned";
      else if (input.status === "archived") action = "archived";
      await db.insert(emailActivityLog).values({
        emailId: input.id,
        userId: ctx.user.id,
        action,
        fromSectionId: (current as any).sectionId,
        toSectionId: input.sectionId ?? undefined,
        notes: input.notes,
      });
      return { success: true };
    }),

  // ── AI: summarise email ───────────────────────────────────────────────────

  aiSummariseEmail: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [email] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, input.id));
      if (!email) throw new TRPCError({ code: "NOT_FOUND" });
      const body = (email as any).bodyText ?? (email as any).snippet ?? "";
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an AI assistant for the Abdullah Quilliam Society charity. Analyse the following email and return JSON with these fields:
- summary: string (2-3 sentence summary)
- keyPoints: string[] (up to 5 bullet points)
- actionRequired: boolean (does this email require a response or action?)
- suggestedSection: string (one of: Urgent, Accounts, HMRC, Gift Aid, Trustees, Staff, Student Accommodation, General Enquiries, Friday Comms)
- suggestedPriority: string (urgent | high | normal | low)`,
          },
          {
            role: "user",
            content: `From: ${(email as any).fromName ?? ""} <${(email as any).fromEmail}>\nSubject: ${(email as any).subject}\n\n${body.slice(0, 3000)}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "email_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                keyPoints: { type: "array", items: { type: "string" } },
                actionRequired: { type: "boolean" },
                suggestedSection: { type: "string" },
                suggestedPriority: { type: "string" },
              },
              required: ["summary", "keyPoints", "actionRequired", "suggestedSection", "suggestedPriority"],
              additionalProperties: false,
            },
          },
        },
      });
      const raw = response.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
      await db.update(inboundEmails).set({
        aiSummary: parsed.summary,
        aiKeyPoints: parsed.keyPoints,
        aiActionRequired: parsed.actionRequired,
        aiProcessedAt: new Date(),
      }).where(eq(inboundEmails.id, input.id));
      await db.insert(emailActivityLog).values({
        emailId: input.id,
        userId: ctx.user.id,
        action: "ai_summarised",
      });
      return { ...parsed };
    }),

  // ── AI: OCR an attachment ─────────────────────────────────────────────────

  ocrAttachment: protectedProcedure
    .input(z.object({ attachmentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [att] = await db.select().from(emailAttachments).where(eq(emailAttachments.id, input.attachmentId));
      if (!att) throw new TRPCError({ code: "NOT_FOUND" });
      // Use LLM vision to read the file
      const mimeType = (att as any).mimeType ?? "image/jpeg";
      const url = (att as any).s3Url;
      const isImage = mimeType.startsWith("image/");
      const isPdf = mimeType === "application/pdf";
      let ocrText = "";
      let ocrSummary = "";
      if (isImage) {
        const response = await invokeLLM({
          messages: [
            { role: "system" as const, content: "Extract all text from this image. Return the raw text content only." },
            { role: "user" as const, content: [{ type: "image_url" as const, image_url: { url, detail: "high" as const } }] },
          ],
        });
        ocrText = (response.choices?.[0]?.message?.content as string) ?? "";
      } else if (isPdf) {
        const response = await invokeLLM({
          messages: [
            { role: "system" as const, content: "Extract all text from this PDF document. Return the raw text content only." },
            { role: "user" as const, content: [{ type: "file_url" as const, file_url: { url, mime_type: "application/pdf" as const } }] },
          ],
        });
        ocrText = (response.choices?.[0]?.message?.content as string) ?? "";
      }
      // Summarise the OCR text
      if (ocrText) {
        const sumResponse = await invokeLLM({
          messages: [
            { role: "system", content: "You are an AI assistant for a UK charity. Summarise the following document content in 2-3 sentences, highlighting any financial figures, dates, or action items." },
            { role: "user", content: ocrText.slice(0, 3000) },
          ],
        });
        ocrSummary = (sumResponse.choices?.[0]?.message?.content as string) ?? "";
      }
      await db.update(emailAttachments).set({
        ocrText,
        ocrSummary,
        ocrProcessedAt: new Date(),
      }).where(eq(emailAttachments.id, input.attachmentId));
      await db.insert(emailActivityLog).values({
        emailId: (att as any).emailId,
        userId: ctx.user.id,
        action: "ocr_processed",
      });
      return { ocrText, ocrSummary };
    }),

  // ── Upload attachment for an email ────────────────────────────────────────

  uploadAttachment: protectedProcedure
    .input(z.object({
      emailId: z.number(),
      filename: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number().optional(),
      base64Data: z.string(), // base64-encoded file content
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const buffer = Buffer.from(input.base64Data, "base64");
      const suffix = Math.random().toString(36).slice(2, 8);
      const key = `email-attachments/${input.emailId}/${suffix}-${input.filename}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      const [result] = await db.insert(emailAttachments).values({
        emailId: input.emailId,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        s3Url: url,
        s3Key: key,
      });
      return { id: (result as any).insertId, url };
    }),

  // ── Bulk Gmail fetch (pulls recent emails from Gmail API) ─────────────────

  fetchFromGmail: protectedProcedure
    .input(z.object({
      maxResults: z.number().min(1).max(100).default(20),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Use the Gmail API via the built-in SMTP credentials
      // We use the Gmail REST API with the refresh token
      const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
      const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
      const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
      if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Gmail credentials not configured. Please set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in Settings → Secrets." });
      }
      // Get access token
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GMAIL_CLIENT_ID,
          client_secret: GMAIL_CLIENT_SECRET,
          refresh_token: GMAIL_REFRESH_TOKEN,
          grant_type: "refresh_token",
        }),
      });
      if (!tokenRes.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to refresh Gmail access token" });
      }
      const { access_token } = await tokenRes.json() as { access_token: string };
      // List recent messages
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${input.maxResults}&q=in:inbox`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );
      if (!listRes.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to list Gmail messages" });
      const { messages = [] } = await listRes.json() as { messages?: Array<{ id: string; threadId: string }> };
      let imported = 0;
      let skipped = 0;
      for (const msg of messages) {
        // Check for duplicate
        const [existing] = await db.select({ id: inboundEmails.id }).from(inboundEmails)
          .where(eq(inboundEmails.gmailMessageId, msg.id));
        if (existing) { skipped++; continue; }
        // Fetch message detail
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (!detailRes.ok) continue;
        const detail = await detailRes.json() as any;
        const headers = detail.payload?.headers ?? [];
        const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
        const fromRaw = getHeader("From");
        const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/) ?? [null, null, fromRaw];
        const fromName = fromMatch[1]?.trim() || undefined;
        const fromEmail = fromMatch[2]?.trim() || fromRaw;
        const subject = getHeader("Subject") || "(No subject)";
        const dateStr = getHeader("Date");
        const receivedAt = dateStr ? new Date(dateStr) : new Date();
        // Extract body
        let bodyText = "";
        const extractBody = (part: any): string => {
          if (part.mimeType === "text/plain" && part.body?.data) {
            return Buffer.from(part.body.data, "base64url").toString("utf-8");
          }
          if (part.parts) {
            for (const p of part.parts) {
              const t = extractBody(p);
              if (t) return t;
            }
          }
          return "";
        };
        bodyText = extractBody(detail.payload);
        const snippet = detail.snippet ?? bodyText.slice(0, 200);
        await db.insert(inboundEmails).values({
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          fromEmail,
          fromName,
          subject,
          bodyText,
          snippet,
          receivedAt,
          status: "unread",
          priority: "normal",
        });
        // AI priority classification
        let autoPriority: "urgent" | "high" | "normal" | "low" = "normal";
        try {
          const priorityRes = await invokeLLM({
            messages: [
              { role: "system", content: "You are an email triage assistant for a UK charity. Classify the email priority as one of: urgent, high, normal, low. Respond with JSON only: {\"priority\": \"urgent|high|normal|low\"}" },
              { role: "user", content: `Subject: ${subject}\nFrom: ${fromEmail}\nSnippet: ${snippet}` },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "email_priority",
                strict: true,
                schema: {
                  type: "object",
                  properties: { priority: { type: "string", enum: ["urgent", "high", "normal", "low"] } },
                  required: ["priority"],
                  additionalProperties: false,
                },
              },
            },
          });
          const content = priorityRes.choices[0].message.content;
          const p = JSON.parse(typeof content === "string" ? content : JSON.stringify(content)) as { priority: "urgent" | "high" | "normal" | "low" };
          autoPriority = p.priority;
        } catch { /* fallback to normal */ }
        // Update the inserted email with the auto-classified priority
        if (autoPriority !== "normal") {
          await db.update(inboundEmails)
            .set({ priority: autoPriority })
            .where(eq(inboundEmails.gmailMessageId, msg.id));
        }
        await db.insert(emailActivityLog).values({
          emailId: 0, // will be updated below if needed
          userId: ctx.user.id,
          action: "received",
        });
        imported++;
      }
      return { imported, skipped, total: messages.length };
    }),

  // ── Reply to an email via Gmail API ─────────────────────────────────────
  replyToEmail: protectedProcedure
    .input(z.object({
      emailId: z.number(),
      replyBody: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [email] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, input.emailId));
      if (!email) throw new TRPCError({ code: "NOT_FOUND", message: "Email not found" });
      const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
      const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
      const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
      const GMAIL_FROM_EMAIL = process.env.GMAIL_FROM_EMAIL;
      if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_FROM_EMAIL) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Gmail credentials not configured" });
      }
      // Get access token
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GMAIL_CLIENT_ID,
          client_secret: GMAIL_CLIENT_SECRET,
          refresh_token: GMAIL_REFRESH_TOKEN,
          grant_type: "refresh_token",
        }),
      });
      if (!tokenRes.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to refresh Gmail access token" });
      const { access_token } = await tokenRes.json() as { access_token: string };
      // Build RFC 2822 reply message
      const toEmail = (email as any).fromEmail;
      const subject = (email as any).subject.startsWith("Re:") ? (email as any).subject : `Re: ${(email as any).subject}`;
      const rawMessage = [
        `From: ${GMAIL_FROM_EMAIL}`,
        `To: ${toEmail}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
        `In-Reply-To: ${(email as any).gmailMessageId ?? ""}`,
        `References: ${(email as any).gmailMessageId ?? ""}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset=UTF-8`,
        ``,
        `Assalamu Alaikum,`,
        ``,
        input.replyBody,
        ``,
        `JazakAllah Khair`,
      ].join("\r\n");
      const encodedMessage = Buffer.from(rawMessage).toString("base64url");
      // Send via Gmail API — reply in same thread
      const sendRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw: encodedMessage, threadId: (email as any).gmailThreadId }),
        }
      );
      if (!sendRes.ok) {
        const err = await sendRes.text();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Gmail send failed: ${err}` });
      }
      // Log the reply in activity log
      await db.insert(emailActivityLog).values({
        emailId: (email as any).id,
        userId: ctx.user.id,
        action: "replied",
        notes: `Reply sent to ${toEmail}`,
      });
      // Mark original as actioned
      await db.update(inboundEmails).set({ status: "actioned" }).where(eq(inboundEmails.id, (email as any).id));
      return { success: true, to: toEmail, subject };
    }),

  // ── Register Gmail push subscription (Pub/Sub watch) ─────────────────────
  registerGmailPush: protectedProcedure
    .input(z.object({
      webhookUrl: z.string().url(),
      topicName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
      const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
      const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
      if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Gmail credentials not configured" });
      }
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GMAIL_CLIENT_ID,
          client_secret: GMAIL_CLIENT_SECRET,
          refresh_token: GMAIL_REFRESH_TOKEN,
          grant_type: "refresh_token",
        }),
      });
      if (!tokenRes.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to refresh Gmail access token" });
      const { access_token } = await tokenRes.json() as { access_token: string };
      const topic = input.topicName || `projects/${process.env.GOOGLE_CLOUD_PROJECT || "hibba-finance"}/topics/gmail-inbox`;
      const watchRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/watch`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            topicName: topic,
            labelIds: ["INBOX"],
            labelFilterBehavior: "INCLUDE",
          }),
        }
      );
      if (!watchRes.ok) {
        const err = await watchRes.text();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Gmail watch registration failed: ${err}` });
      }
      const watchData = await watchRes.json() as { historyId: string; expiration: string };
      return {
        success: true,
        historyId: watchData.historyId,
        expiration: watchData.expiration,
        expiresAt: new Date(parseInt(watchData.expiration)).toISOString(),
        webhookUrl: input.webhookUrl,
        topic,
      };
    }),

  // ── Bulk actions ─────────────────────────────────────────────────────────
  bulkAction: protectedProcedure
    .input(z.object({
      emailIds: z.array(z.number()).min(1).max(200),
      action: z.enum(["markRead", "markUnread", "archive", "moveToSection"]),
      sectionId: z.number().optional(), // required when action === moveToSection
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const updates: any = {};
      if (input.action === "markRead") updates.status = "read";
      else if (input.action === "markUnread") updates.status = "unread";
      else if (input.action === "archive") updates.status = "archived";
      else if (input.action === "moveToSection") {
        if (input.sectionId === undefined) throw new TRPCError({ code: "BAD_REQUEST", message: "sectionId required for moveToSection" });
        updates.sectionId = input.sectionId;
      }
      await db.update(inboundEmails)
        .set(updates)
        .where(inArray(inboundEmails.id, input.emailIds));
      // Log bulk action
      const logAction = input.action === "moveToSection" ? "moved_section"
        : input.action === "markRead" ? "read"
        : input.action === "markUnread" ? "read"
        : "archived";
      await db.insert(emailActivityLog).values(
        input.emailIds.map(emailId => ({
          emailId,
          userId: ctx.user.id,
          action: logAction as any,
          notes: input.action === "moveToSection" ? `Moved to section ${input.sectionId}` : undefined,
        }))
      );
      return { updated: input.emailIds.length };
    }),

  // ── Link email to a receipt/expense record ─────────────────────────────────
  linkToReceipt: protectedProcedure
    .input(z.object({
      emailId: z.number(),
      receiptId: z.number(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(inboundEmails)
        .set({ linkedReceiptId: input.receiptId, linkedReceiptNote: input.note ?? null })
        .where(eq(inboundEmails.id, input.emailId));
      await db.insert(emailActivityLog).values({
        emailId: input.emailId,
        userId: ctx.user.id,
        action: "linked_receipt",
        notes: `Linked to receipt #${input.receiptId}${input.note ? ': ' + input.note : ''}`,
      });
      return { success: true };
    }),

  // ── Search receipts for the link picker ──────────────────────────────────────
  searchReceiptsForLink: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(100),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { receipts } = await import("../../drizzle/schema");
      const q = `%${input.query}%`;
      const rows = await db
        .select({
          id: receipts.id,
          vendor: receipts.vendor,
          amount: receipts.amount,
          receiptDate: receipts.receiptDate,
          categoryName: receipts.categoryName,
          status: receipts.status,
        })
        .from(receipts)
        .where(or(
          like(receipts.vendor, q),
          like(receipts.categoryName, q),
        ))
        .orderBy(desc(receipts.receiptDate))
        .limit(20);
      return rows;
    }),

  // ── AI priority classifier ────────────────────────────────────────────────────
  classifyPriority: protectedProcedure
    .input(z.object({
      emailId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [email] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, input.emailId));
      if (!email) throw new TRPCError({ code: "NOT_FOUND", message: "Email not found" });
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are an email triage assistant for a UK charity. Classify the email priority as one of: urgent, high, normal, low. Respond with JSON only: {\"priority\": \"urgent|high|normal|low\", \"reason\": \"brief reason\"}" },
          { role: "user", content: `Subject: ${email.subject}\nFrom: ${email.fromEmail}\nSnippet: ${email.snippet ?? ''}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "email_priority",
            strict: true,
            schema: {
              type: "object",
              properties: {
                priority: { type: "string", enum: ["urgent", "high", "normal", "low"] },
                reason: { type: "string" },
              },
              required: ["priority", "reason"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = response.choices[0].message.content;
      const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content)) as { priority: "urgent" | "high" | "normal" | "low"; reason: string };
      await db.update(inboundEmails)
        .set({ priority: parsed.priority })
        .where(eq(inboundEmails.id, input.emailId));
      return { priority: parsed.priority, reason: parsed.reason };
    }),

  // ── Priority distribution stats ─────────────────────────────────────────
  getPriorityStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { urgent: 0, high: 0, normal: 0, low: 0, total: 0 };
    const rows = await db
      .select({ priority: inboundEmails.priority, count: sql<number>`count(*)` })
      .from(inboundEmails)
      .where(eq(inboundEmails.status, "unread"))
      .groupBy(inboundEmails.priority);
    const stats = { urgent: 0, high: 0, normal: 0, low: 0, total: 0 };
    for (const row of rows) {
      const p = row.priority as keyof typeof stats;
      if (p in stats) (stats as any)[p] = Number(row.count);
      stats.total += Number(row.count);
    }
    return stats;
  }),
  // ── Last Gmail sync timestamp ─────────────────────────────────────────────
  getLastSyncTime: protectedProcedure.query(() => {
    return { lastSyncedAt: gmailLastSyncedAt };
  }),
  // ── Linked emails for a receipt (cross-reference panel) ───────────────────
  getLinkedEmailsForReceipt: protectedProcedure
    .input(z.object({ receiptId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: inboundEmails.id,
          subject: inboundEmails.subject,
          fromEmail: inboundEmails.fromEmail,
          fromName: inboundEmails.fromName,
          snippet: inboundEmails.snippet,
          priority: inboundEmails.priority,
          status: inboundEmails.status,
          receivedAt: inboundEmails.receivedAt,
          linkedReceiptNote: inboundEmails.linkedReceiptNote,
        })
        .from(inboundEmails)
        .where(eq(inboundEmails.linkedReceiptId, input.receiptId))
        .orderBy(desc(inboundEmails.receivedAt))
        .limit(50);
      return rows;
    }),

  // ── Section reply templates ───────────────────────────────────────────────
  listSectionTemplates: protectedProcedure
    .input(z.object({ sectionId: z.number().nullable().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.sectionId !== undefined) {
        // Return templates for this section + global templates
        conditions.push(
          or(
            eq(sectionReplyTemplates.sectionId, input.sectionId!),
            isNull(sectionReplyTemplates.sectionId)
          )
        );
      }
      const rows = await db
        .select()
        .from(sectionReplyTemplates)
        .where(conditions.length ? conditions[0] : undefined)
        .orderBy(sectionReplyTemplates.sectionId, sectionReplyTemplates.title);
      return rows;
    }),
  upsertSectionTemplate: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      sectionId: z.number().nullable().optional(),
      title: z.string().min(1).max(200),
      body: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.id) {
        await db.update(sectionReplyTemplates)
          .set({ title: input.title, body: input.body, sectionId: input.sectionId ?? null })
          .where(eq(sectionReplyTemplates.id, input.id));
        return { id: input.id };
      } else {
        const [result] = await db.insert(sectionReplyTemplates).values({
          sectionId: input.sectionId ?? null,
          title: input.title,
          body: input.body,
          createdById: ctx.user.id,
        });
        return { id: (result as any).insertId };
      }
    }),
  deleteSectionTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(sectionReplyTemplates).where(eq(sectionReplyTemplates.id, input.id));
      return { success: true };
    }),
  // ── AI Suggested Replies (3 options per inbound email) ────────────────────
  suggestReplies: protectedProcedure
    .input(z.object({ emailId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [email] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, input.emailId)).limit(1);
      if (!email) throw new TRPCError({ code: "NOT_FOUND", message: "Email not found" });
      const prompt = `You are a helpful assistant for the Abdullah Quilliam Society (AQS), a UK charity. 
Generate exactly 3 different reply options for the following inbound email. Each reply should:
- Begin with "Assalamu Alaikum,"
- Be professional, warm, and Islamic in tone
- End with "JazakAllah Khair"
- Be concise (2-4 sentences)
- Vary in tone: formal, friendly, and brief

Email subject: ${email.subject ?? "(no subject)"}
From: ${email.fromName ?? email.fromEmail}
Body: ${(email.bodyText ?? email.bodyHtml ?? "").slice(0, 1500)}

Return JSON with this exact structure: { "replies": ["reply1", "reply2", "reply3"] }`;
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are a helpful assistant for a UK Islamic charity. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "suggested_replies",
            strict: true,
            schema: {
              type: "object",
              properties: {
                replies: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
              },
              required: ["replies"],
              additionalProperties: false,
            },
          },
        },
      });
      const raw = response.choices?.[0]?.message?.content;
      if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No response from AI" });
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return { replies: parsed.replies as string[] };
    }),

  // ── Mark all emails in a section (or all) as read ──────────────────────
  markAllRead: protectedProcedure
    .input(z.object({
      sectionId: z.number().nullable().optional(), // null = unsorted, undefined = all sections
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const conditions: any[] = [eq(inboundEmails.status, "unread")];
      if (input.sectionId !== undefined) {
        conditions.push(
          input.sectionId === null
            ? isNull(inboundEmails.sectionId)
            : eq(inboundEmails.sectionId, input.sectionId)
        );
      }
      await db.update(inboundEmails)
        .set({ status: "read" })
        .where(and(...conditions));
      return { success: true };
    }),

  // ── Per-section unread counts (for sidebar badges) ───────────────────────
  getSectionUnreadCounts: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, sections: {} };
    const rows = await db
      .select({ sectionId: inboundEmails.sectionId, count: sql<number>`count(*)` })
      .from(inboundEmails)
      .where(eq(inboundEmails.status, "unread"))
      .groupBy(inboundEmails.sectionId);
    const sections: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      const key = row.sectionId == null ? "unsorted" : String(row.sectionId);
      const count = Number(row.count);
      sections[key] = count;
      total += count;
    }
    return { total, sections };
  }),
});
