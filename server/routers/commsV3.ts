/**
 * Wave 3 — Communications module router
 * Template library, bulk send (email), outbox log, AI-compose
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import { commsTemplates, commsOutbox, users, donors } from "../../drizzle/schema";

const ADMIN_ROLES = ["superadmin", "trustee", "manager", "admin"];

// Local email helper
async function sendEmail(to: string, name: string, subject: string, html: string) {
  const nodemailer = await import("nodemailer");
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.GMAIL_FROM_EMAIL || "noreply@example.com";
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_FROM_EMAIL || fromEmail;
  const envPass = process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD || "";
  const smtpPass = envPass && envPass.length >= 16 ? envPass : "";
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: 465, secure: true,
    auth: { user: smtpUser, pass: smtpPass },
  });
  await transporter.sendMail({ from: `"Abdullah Quilliam Society" <${fromEmail}>`, to, subject, html });
}

// Replace {{name}} etc. in template body
function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export const commsV3Router = router({

  // ── Templates ────────────────────────────────────────────────────────────────

  listTemplates: protectedProcedure
    .input(z.object({
      category: z.enum(["trustee_meeting", "donor_thankyou", "gift_aid_declaration", "commission_response", "staff_bulletin", "supplier_query", "training_invite", "general"]).optional(),
      type: z.enum(["email", "sms", "letter"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      let q = db.select().from(commsTemplates).where(eq(commsTemplates.isActive, true)).$dynamic();
      if (input.category) q = q.where(eq(commsTemplates.category, input.category));
      if (input.type) q = q.where(eq(commsTemplates.type, input.type));
      return q.orderBy(commsTemplates.name);
    }),

  upsertTemplate: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      name: z.string().min(1),
      category: z.enum(["trustee_meeting", "donor_thankyou", "gift_aid_declaration", "commission_response", "staff_bulletin", "supplier_query", "training_invite", "general"]),
      type: z.enum(["email", "sms", "letter"]).default("email"),
      subject: z.string().optional(),
      body: z.string().min(1),
      variables: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      if (input.id) {
        await db.update(commsTemplates).set({
          name: input.name, category: input.category, type: input.type,
          subject: input.subject, body: input.body, variables: input.variables ?? [],
        }).where(eq(commsTemplates.id, input.id));
        return { id: input.id };
      } else {
        await db.insert(commsTemplates).values({
          name: input.name, category: input.category, type: input.type,
          subject: input.subject, body: input.body, variables: input.variables ?? [],
          createdByUserId: ctx.user.id,
        });
        return { id: null };
      }
    }),

  deleteTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can delete templates" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(commsTemplates).set({ isActive: false }).where(eq(commsTemplates.id, input.id));
      return { success: true };
    }),

  // ── AI Compose ───────────────────────────────────────────────────────────────

  aiCompose: protectedProcedure
    .input(z.object({
      category: z.string(),
      type: z.enum(["email", "sms", "letter"]).default("email"),
      recipientGroup: z.string().optional(),
      context: z.string().optional(), // user-provided context/brief
    }))
    .mutation(async ({ input }) => {
      const prompt = `You are writing on behalf of the Abdullah Quilliam Society, a UK Muslim charity.
Write a ${input.type} for the category "${input.category}".
Recipient group: ${input.recipientGroup ?? "general audience"}.
Context / brief: ${input.context ?? "general communication"}.
Tone: professional, warm, Islamic.
${input.type === "sms" ? "Keep under 160 characters." : "Keep under 300 words."}
Start with AssalamuAlaikum. End with JazakAllah Khayran.
Return JSON: { subject: string, body: string }`;
      const result = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "comms_compose",
            strict: true,
            schema: {
              type: "object",
              properties: {
                subject: { type: "string" },
                body: { type: "string" },
              },
              required: ["subject", "body"],
              additionalProperties: false,
            },
          },
        } as any,
      });
      const raw = result.choices?.[0]?.message?.content;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw ?? { subject: "", body: "" };
      return parsed as { subject: string; body: string };
    }),

  // ── Outbox / Send ────────────────────────────────────────────────────────────

  listOutbox: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      return db.select().from(commsOutbox).orderBy(desc(commsOutbox.createdAt)).limit(input.limit);
    }),

  /** Send a bulk email to a recipient group */
  sendBulk: protectedProcedure
    .input(z.object({
      templateId: z.number().optional(),
      subject: z.string().min(1),
      body: z.string().min(1),
      type: z.enum(["email", "sms", "letter"]).default("email"),
      recipientGroup: z.enum([
        "trustees_all", "staff_all", "donors_all", "donors_major",
        "donors_monthly", "donors_eid", "donors_friday",
        "students_current", "suppliers", "individual", "custom"
      ]),
      recipientIds: z.array(z.number()).optional(), // for 'individual' or 'custom'
      scheduledAt: z.string().optional(), // ISO timestamp for scheduled send
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only managers/trustees can send bulk communications" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Create outbox record
      const [outboxResult] = await db.insert(commsOutbox).values({
        templateId: input.templateId,
        recipientGroup: input.recipientGroup,
        recipientIds: input.recipientIds ?? [],
        subject: input.subject,
        body: input.body,
        type: input.type,
        status: input.scheduledAt ? "queued" : "sending",
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        sentByUserId: ctx.user.id,
      });

      // If email and not scheduled, send now
      if (input.type === "email" && !input.scheduledAt) {
        let recipients: { email: string; name: string }[] = [];

        if (input.recipientGroup === "donors_all" || input.recipientGroup.startsWith("donors_")) {
          const allDonors = await db.select().from(donors);
          recipients = allDonors
            .filter((d: any) => d.email)
            .map((d: any) => ({ email: d.email!, name: d.name ?? "Valued Donor" }));
        } else if (input.recipientGroup === "trustees_all" || input.recipientGroup === "staff_all") {
          const allUsers = await db.select().from(users);
          const roleFilter = input.recipientGroup === "trustees_all"
            ? ["trustee", "superadmin"]
            : ["manager", "deputy", "assistant", "volunteer"];
          recipients = allUsers
            .filter((u: any) => u.email && roleFilter.includes(u.role) && u.isActive)
            .map((u: any) => ({ email: u.email!, name: u.name ?? "Team Member" }));
        } else if (input.recipientGroup === "individual" || input.recipientGroup === "custom") {
          // Use recipientIds to find users
          if (input.recipientIds && input.recipientIds.length > 0) {
            const allUsers = await db.select().from(users);
            recipients = allUsers
              .filter((u: any) => u.email && input.recipientIds!.includes(u.id))
              .map((u: any) => ({ email: u.email!, name: u.name ?? "Team Member" }));
          }
        }

        let sentCount = 0;
        let failCount = 0;
        for (const r of recipients) {
          try {
            const personalised = renderTemplate(input.body, { name: r.name, email: r.email });
            const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
              ${personalised.split("\n").map(l => `<p>${l}</p>`).join("")}
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
              <p style="font-size:12px;color:#888">Abdullah Quilliam Society · Registered Charity</p>
            </div>`;
            await sendEmail(r.email, r.name, input.subject, htmlBody);
            sentCount++;
          } catch {
            failCount++;
          }
        }

        // Update outbox record
        await db.update(commsOutbox).set({
          status: failCount === recipients.length && recipients.length > 0 ? "failed" : "sent",
          sentCount,
          failCount,
          sentAt: new Date(),
        }).where(sql`id = LAST_INSERT_ID()`);

        return { success: true, sentCount, failCount, total: recipients.length };
      }

      return { success: true, sentCount: 0, failCount: 0, total: 0, scheduled: !!input.scheduledAt };
    }),
});

export type CommsV3Router = typeof commsV3Router;
