/**
 * LBMW Gmail Pull Router
 *
 * Fetches emails from a configured Gmail label/folder, runs AI analysis on each,
 * creates LBMW correspondence records, detects invoices, and optionally creates
 * compliance action tasks and notifies trustees.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";

// ── Gmail helpers ────────────────────────────────────────────────────────────

async function getGmailToken(): Promise<string | null> {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

function extractBody(part: any): string {
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
}

interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: Date;
  body: string;
  labelIds: string[];
}

async function fetchMessageDetail(messageId: string, token: string): Promise<GmailMessage | null> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const detail = (await res.json()) as any;
  const headers: any[] = detail.payload?.headers ?? [];
  const h = (name: string) =>
    headers.find((x: any) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const fromRaw = h("From");
  const dateStr = h("Date");
  return {
    id: detail.id,
    threadId: detail.threadId,
    from: fromRaw,
    subject: h("Subject") || "(No subject)",
    date: dateStr ? new Date(dateStr) : new Date(),
    body: extractBody(detail.payload),
    labelIds: detail.labelIds ?? [],
  };
}

// ── AI analysis ──────────────────────────────────────────────────────────────

interface EmailAnalysis {
  summary: string;
  actionRequired: boolean;
  actionTitle: string;
  actionDeadline: string | null;
  actionPriority: "low" | "medium" | "high" | "critical";
  isInvoice: boolean;
  invoiceAmount: number | null;
  invoiceVendor: string | null;
  priority: "low" | "medium" | "high" | "critical";
  contactName: string;
  contactRole: string;
}

async function analyseEmail(subject: string, body: string, from: string): Promise<EmailAnalysis> {
  const today = new Date().toISOString().split("T")[0];
  const prompt = `You are an assistant for a UK charity (AQS / LBMW). Analyse this email and return structured JSON.

FROM: ${from}
SUBJECT: ${subject}
DATE: ${today}
BODY (first 3000 chars):
${body.slice(0, 3000)}

Return JSON with these exact fields:
{
  "summary": "2-3 sentence plain English summary of what this email is about and what it requires",
  "actionRequired": true/false (does this email require a response or action from the charity?),
  "actionTitle": "short title for the action task if actionRequired is true, else empty string",
  "actionDeadline": "YYYY-MM-DD deadline if mentioned, else null",
  "actionPriority": "low|medium|high|critical",
  "isInvoice": true/false (is this an invoice or bill to be paid?),
  "invoiceAmount": number or null (GBP amount if invoice),
  "invoiceVendor": "vendor name if invoice, else null",
  "priority": "low|medium|high|critical (overall priority of this correspondence)",
  "contactName": "full name of the sender if identifiable, else extract from email address",
  "contactRole": "role/organisation of sender if identifiable, else empty string"
}`;

  try {
    const resp = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "email_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              actionRequired: { type: "boolean" },
              actionTitle: { type: "string" },
              actionDeadline: { type: ["string", "null"] },
              actionPriority: { type: "string", enum: ["low", "medium", "high", "critical"] },
              isInvoice: { type: "boolean" },
              invoiceAmount: { type: ["number", "null"] },
              invoiceVendor: { type: ["string", "null"] },
              priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
              contactName: { type: "string" },
              contactRole: { type: "string" },
            },
            required: ["summary", "actionRequired", "actionTitle", "actionDeadline", "actionPriority", "isInvoice", "invoiceAmount", "invoiceVendor", "priority", "contactName", "contactRole"],
            additionalProperties: false,
          },
        },
      },
    });
    const content = resp.choices?.[0]?.message?.content;
    return JSON.parse(typeof content === "string" ? content : JSON.stringify(content)) as EmailAnalysis;
  } catch {
    return {
      summary: `Email from ${from}: ${subject}`,
      actionRequired: false,
      actionTitle: "",
      actionDeadline: null,
      actionPriority: "medium",
      isInvoice: false,
      invoiceAmount: null,
      invoiceVendor: null,
      priority: "medium",
      contactName: from.replace(/<.*>/, "").trim() || from,
      contactRole: "",
    };
  }
}

// ── Router ───────────────────────────────────────────────────────────────────

export const lbmwGmailRouter = router({
  // List Gmail labels so user can pick which folder to pull from
  listLabels: adminProcedure.query(async () => {
    const token = await getGmailToken();
    if (!token) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Gmail credentials not configured" });
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch Gmail labels" });
    const { labels } = (await res.json()) as { labels: Array<{ id: string; name: string; type: string }> };
    return (labels ?? [])
      .filter(l => l.type === "user" || ["INBOX", "SENT", "IMPORTANT"].includes(l.id))
      .map(l => ({ id: l.id, name: l.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }),

  // Pull emails from a Gmail label and create LBMW correspondence records
  pullFromLabel: adminProcedure
    .input(z.object({
      labelId: z.string().min(1),
      labelName: z.string().default(""),
      maxResults: z.number().int().min(1).max(50).default(20),
      notifyTrustees: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const token = await getGmailToken();
      if (!token) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Gmail credentials not configured. Please check Gmail API settings." });

      const { lbmwCorrespondence, complianceActions } = await import("../../drizzle/schema");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Fetch message list from the label
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=${encodeURIComponent(input.labelId)}&maxResults=${input.maxResults}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!listRes.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch messages from Gmail" });
      const { messages = [] } = (await listRes.json()) as { messages?: Array<{ id: string; threadId: string }> };

      if (messages.length === 0) return { created: 0, skipped: 0, invoices: 0, actionsCreated: 0, details: [] };

      // Get existing gmailMessageIds to deduplicate
      const existingRows = await db
        .select({ gmailMessageId: lbmwCorrespondence.gmailMessageId })
        .from(lbmwCorrespondence)
        .where(inArray(lbmwCorrespondence.gmailMessageId, messages.map(m => m.id)));
      const existingIds = new Set(existingRows.map(r => r.gmailMessageId).filter(Boolean));

      const newMessages = messages.filter(m => !existingIds.has(m.id));
      if (newMessages.length === 0) return { created: 0, skipped: messages.length, invoices: 0, actionsCreated: 0, details: [] };

      let created = 0;
      let invoices = 0;
      let actionsCreated = 0;
      const details: Array<{ subject: string; from: string; isInvoice: boolean; actionRequired: boolean }> = [];

      for (const msg of newMessages.slice(0, 20)) {
        const detail = await fetchMessageDetail(msg.id, token);
        if (!detail) continue;

        // AI analysis
        const analysis = await analyseEmail(detail.subject, detail.body, detail.from);

        // Create compliance action task if needed
        let actionTaskId: number | null = null;
        if (analysis.actionRequired && analysis.actionTitle) {
          const [actionResult] = await db.insert(complianceActions).values({
            title: analysis.actionTitle,
            source: "LBMW Gmail",
            owner: null,
            dueDate: analysis.actionDeadline ? new Date(analysis.actionDeadline) : null,
            priority: analysis.actionPriority,
            notes: `Auto-created from email: ${detail.subject}\n\nSummary: ${analysis.summary}`,
            status: "open",
            createdByUserId: ctx.user.id,
          });
          actionTaskId = (actionResult as any).insertId as number;
          actionsCreated++;
        }

        // Insert LBMW correspondence record
        const dateReceived = detail.date.toISOString().split("T")[0];
        await db.insert(lbmwCorrespondence).values({
          contactName: analysis.contactName || detail.from,
          contactRole: analysis.contactRole || "",
          direction: "inbound",
          channel: "email",
          subject: detail.subject,
          summary: analysis.summary,
          aiSummary: analysis.summary,
          dateReceived: new Date(dateReceived) as any,
          responseDeadline: analysis.actionDeadline ? new Date(analysis.actionDeadline) as any : null,
          status: "pending",
          priority: analysis.priority,
          gmailMessageId: detail.id,
          gmailThreadId: detail.threadId,
          gmailFrom: detail.from,
          gmailLabel: input.labelName || input.labelId,
          actionRequired: analysis.actionRequired,
          actionTaskId: actionTaskId,
          isInvoice: analysis.isInvoice,
          invoiceAmount: analysis.invoiceAmount ? analysis.invoiceAmount.toFixed(2) as any : null,
          handledByUserId: ctx.user.id,
        });

        created++;
        if (analysis.isInvoice) invoices++;
        details.push({
          subject: detail.subject,
          from: detail.from,
          isInvoice: analysis.isInvoice,
          actionRequired: analysis.actionRequired,
        });
      }

      // Notify owner/trustees if action-required emails were found
      if (input.notifyTrustees && (actionsCreated > 0 || invoices > 0)) {
        const actionItems = details.filter(d => d.actionRequired).map(d => `• ${d.subject} (from: ${d.from})`).join("\n");
        const invoiceItems = details.filter(d => d.isInvoice).map(d => `• ${d.subject} (from: ${d.from})`).join("\n");
        let notifContent = `${created} new email(s) pulled from Gmail label "${input.labelName || input.labelId}".`;
        if (actionsCreated > 0) notifContent += `\n\n⚠️ ${actionsCreated} action task(s) created:\n${actionItems}`;
        if (invoices > 0) notifContent += `\n\n🧾 ${invoices} invoice(s) detected:\n${invoiceItems}`;
        await notifyOwner({ title: `LBMW: ${created} new email(s) from Gmail`, content: notifContent });
      }

      return {
        created,
        skipped: messages.length - newMessages.length,
        invoices,
        actionsCreated,
        details,
      };
    }),

  // Mark an LBMW invoice as paid and auto-create expense record
  markInvoicePaid: adminProcedure
    .input(z.object({
      correspondenceId: z.number().int(),
      departmentId: z.number().int().optional(),
      departmentName: z.string().optional(),
      categoryName: z.string().default("Bills & Utilities"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { lbmwCorrespondence, receipts } = await import("../../drizzle/schema");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [corr] = await db.select().from(lbmwCorrespondence).where(eq(lbmwCorrespondence.id, input.correspondenceId)).limit(1);
      if (!corr) throw new TRPCError({ code: "NOT_FOUND" });
      if (!corr.isInvoice) throw new TRPCError({ code: "BAD_REQUEST", message: "This record is not tagged as an invoice" });

      // Create expense receipt record
      const [expResult] = await db.insert(receipts).values({
        userId: ctx.user.id,
        vendor: corr.contactName,
        receiptDate: new Date(),
        amount: corr.invoiceAmount ?? "0.00" as any,
        departmentId: input.departmentId ?? null,
        departmentName: input.departmentName ?? "General",
        categoryName: input.categoryName,
        status: "approved",
        notes: `Auto-created from LBMW invoice email: ${corr.subject}\n${input.notes ?? ""}`,
        currency: "GBP",
        paymentStatus: "paid",
      } as any);
      const newExpenseId = (expResult as any).insertId as number;

      // Link back to the correspondence record
      await db.update(lbmwCorrespondence)
        .set({ invoiceLinkedExpenseId: newExpenseId, status: "closed" })
        .where(eq(lbmwCorrespondence.id, input.correspondenceId));

      return { success: true, expenseId: newExpenseId };
    }),
});
