import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  emailSections,
  inboundEmails,
  emailAttachments,
  emailActivityLog,
} from "../../drizzle/schema";
import { eq, desc, and, or, like, isNull, sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";

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
        await db.insert(emailActivityLog).values({
          emailId: 0, // will be updated below if needed
          userId: ctx.user.id,
          action: "received",
        });
        imported++;
      }
      return { imported, skipped, total: messages.length };
    }),
});
