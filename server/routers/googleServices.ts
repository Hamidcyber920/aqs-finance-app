import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  listDriveFiles,
  getDriveFile,
  uploadToDrive,
  listGmailLabels,
  fetchEmailsByLabel,
  fetchRecentEmails,
  createExpenseSheet,
  createMonthlyBreakdownSheet,
} from "../googleServices";
import { invokeLLM } from "../_core/llm";

export const googleServicesRouter = router({
  // ── Google Drive ──────────────────────────────────────────────────────────
  listDriveFiles: protectedProcedure
    .input(z.object({ folderId: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      try {
        const files = await listDriveFiles(input.folderId, input.limit);
        return files;
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  readDriveFile: protectedProcedure
    .input(z.object({ fileId: z.string().min(1) }))
    .query(async ({ input }) => {
      try {
        const file = await getDriveFile(input.fileId);
        return file;
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  saveToDrive: protectedProcedure
    .input(z.object({
      fileName: z.string().min(1),
      content: z.string().min(1),
      mimeType: z.string().default("text/plain"),
      folderId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await uploadToDrive(input.fileName, input.content, input.mimeType, input.folderId);
        return result;
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ── Gmail Labels ──────────────────────────────────────────────────────────
  listGmailLabels: protectedProcedure.query(async () => {
    try {
      const labels = await listGmailLabels();
      return labels.filter(l => (l.messagesTotal ?? 0) > 0).sort((a, b) => a.name.localeCompare(b.name));
    } catch (err: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
    }
  }),

  fetchEmailsByLabel: protectedProcedure
    .input(z.object({ labelId: z.string().min(1), maxResults: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      try {
        const emails = await fetchEmailsByLabel(input.labelId, input.maxResults);
        return emails;
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  fetchNewEmails: protectedProcedure
    .input(z.object({ query: z.string().default("is:unread in:inbox"), maxResults: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      try {
        const emails = await fetchRecentEmails(input.maxResults, input.query);
        return emails;
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  summariseEmails: protectedProcedure
    .input(z.object({
      emails: z.array(z.object({
        from: z.string(),
        subject: z.string(),
        body: z.string(),
      })).min(1).max(20),
    }))
    .mutation(async ({ input }) => {
      const prompt = `Summarise these ${input.emails.length} emails concisely and extract action items:\n\n${input.emails.map((e, i) => `Email ${i + 1}:\nFrom: ${e.from}\nSubject: ${e.subject}\nBody: ${e.body}\n---`).join("\n")}`;
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are a concise email summariser for a UK Islamic charity (Abdullah Quilliam Society). Extract key points and action items. Return JSON with: summary (string), actionItems (array of strings), urgentCount (number)." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "email_summary",
            strict: true,
            schema: {
              type: "object",
              properties: {
                summary: { type: "string", description: "2-3 sentence summary of all emails" },
                actionItems: { type: "array", items: { type: "string" }, description: "List of action items extracted" },
                urgentCount: { type: "integer", description: "Number of urgent items" },
              },
              required: ["summary", "actionItems", "urgentCount"],
              additionalProperties: false,
            },
          },
        },
      });
      const raw = response.choices?.[0]?.message?.content ?? "{}";
      return JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    }),

  // ── Google Sheets ─────────────────────────────────────────────────────────
  createExpenseSheet: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      expenses: z.array(z.object({
        date: z.string(),
        vendor: z.string(),
        category: z.string(),
        amount: z.number(),
        department: z.string().default(""),
        notes: z.string().default(""),
      })),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await createExpenseSheet(input.title, input.expenses);
        return result;
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  createMonthlyBreakdown: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      income: z.array(z.object({
        date: z.string(),
        source: z.string(),
        category: z.string(),
        amount: z.number(),
        reference: z.string().default(""),
      })),
      expenses: z.array(z.object({
        date: z.string(),
        vendor: z.string(),
        category: z.string(),
        amount: z.number(),
        department: z.string().default(""),
      })),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await createMonthlyBreakdownSheet(input.title, input.income, input.expenses);
        return result;
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),
});
