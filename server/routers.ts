import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createReceipt,
  deleteReceipt,
  getAllCategories,
  getCategoryTotals,
  getMonthlyTotal,
  getReceiptById,
  listReceipts,
  seedDefaultCategories,
  updateReceipt,
} from "./db";
import { invokeLLM, type Message } from "./_core/llm";
import { storagePut } from "./storage";
import { notifyOwner } from "./_core/notification";
import { nanoid } from "nanoid";

// ── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix() {
  return nanoid(8);
}

async function extractReceiptData(imageUrl: string, mimeType: string) {
  const contentType = mimeType.startsWith("application/pdf") ? "file_url" : "image_url";

  const extractionPrompt = `You are an expert receipt parser. Analyze this receipt and extract all information.
Return a JSON object with exactly these fields:
{
  "vendor": "string - business/vendor name",
  "date": "string - date in YYYY-MM-DD format, or null",
  "amount": number - total amount as a number (no currency symbol), or null,
  "tax": number - tax amount as a number, or null,
  "currency": "string - 3-letter currency code e.g. GBP, USD, EUR",
  "lineItems": [{"description": "string", "amount": number}],
  "rawText": "string - all text visible on the receipt",
  "categoryName": "string - one of: Catering & Food, Utilities, Office Supplies, Maintenance & Repairs, Travel & Transport, IT & Technology, Events & Activities, Printing & Stationery, Cleaning & Hygiene, Other",
  "confidence": number - 0 to 1 confidence score
}
Be precise with amounts. If a field cannot be determined, use null.`;

  const userContent =
    contentType === "image_url"
      ? [
          { type: "image_url" as const, image_url: { url: imageUrl, detail: "high" as const } },
          { type: "text" as const, text: extractionPrompt },
        ]
      : [
          { type: "file_url" as const, file_url: { url: imageUrl, mime_type: "application/pdf" as const } },
          { type: "text" as const, text: extractionPrompt },
        ];

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You are a precise receipt data extraction assistant. Always return valid JSON only, no markdown, no explanation.",
      },
      { role: "user", content: userContent as any },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "receipt_data",
        strict: true,
        schema: {
          type: "object",
          properties: {
            vendor: { type: ["string", "null"] },
            date: { type: ["string", "null"] },
            amount: { type: ["number", "null"] },
            tax: { type: ["number", "null"] },
            currency: { type: "string" },
            lineItems: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  amount: { type: "number" },
                },
                required: ["description", "amount"],
                additionalProperties: false,
              },
            },
            rawText: { type: ["string", "null"] },
            categoryName: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["vendor", "date", "amount", "tax", "currency", "lineItems", "rawText", "categoryName", "confidence"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("No response from LLM");
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  return JSON.parse(content) as {
    vendor: string | null;
    date: string | null;
    amount: number | null;
    tax: number | null;
    currency: string;
    lineItems: Array<{ description: string; amount: number }>;
    rawText: string | null;
    categoryName: string;
    confidence: number;
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  categories: router({
    list: publicProcedure.query(async () => {
      await seedDefaultCategories();
      return getAllCategories();
    }),
  }),

  receipts: router({
    list: protectedProcedure
      .input(
        z.object({
          categoryName: z.string().optional(),
          vendor: z.string().optional(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          status: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
      )
      .query(async ({ ctx, input }) => {
        return listReceipts({
          userId: ctx.user.id,
          categoryName: input.categoryName,
          vendor: input.vendor,
          dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
          dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
          status: input.status,
          limit: input.limit,
          offset: input.offset,
        });
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const receipt = await getReceiptById(input.id);
        if (!receipt) throw new TRPCError({ code: "NOT_FOUND" });
        if (receipt.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return receipt;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          vendor: z.string().optional(),
          receiptDate: z.string().optional(),
          amount: z.string().optional(),
          tax: z.string().optional(),
          categoryName: z.string().optional(),
          notes: z.string().optional(),
          currency: z.string().optional(),
          lineItems: z
            .array(z.object({ description: z.string(), amount: z.number() }))
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const receipt = await getReceiptById(input.id);
        if (!receipt) throw new TRPCError({ code: "NOT_FOUND" });
        if (receipt.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const { id, receiptDate, ...rest } = input;
        await updateReceipt(id, {
          ...rest,
          receiptDate: receiptDate ? new Date(receiptDate) : undefined,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const receipt = await getReceiptById(input.id);
        if (!receipt) throw new TRPCError({ code: "NOT_FOUND" });
        if (receipt.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await deleteReceipt(input.id);
        return { success: true };
      }),

    categoryTotals: protectedProcedure
      .input(
        z.object({
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        return getCategoryTotals(
          ctx.user.id,
          input.dateFrom ? new Date(input.dateFrom) : undefined,
          input.dateTo ? new Date(input.dateTo) : undefined
        );
      }),

    // Process a receipt that was already uploaded — run AI extraction
    process: protectedProcedure
      .input(z.object({ receiptId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const receipt = await getReceiptById(input.receiptId);
        if (!receipt) throw new TRPCError({ code: "NOT_FOUND" });
        if (receipt.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        if (!receipt.imageUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "No image URL" });

        await updateReceipt(input.receiptId, { status: "processing" });

        try {
          const extracted = await extractReceiptData(
            receipt.imageUrl,
            receipt.mimeType ?? "image/jpeg"
          );

          const receiptDate = extracted.date ? new Date(extracted.date) : undefined;

          await updateReceipt(input.receiptId, {
            vendor: extracted.vendor ?? undefined,
            receiptDate,
            amount: extracted.amount != null ? String(extracted.amount) : undefined,
            tax: extracted.tax != null ? String(extracted.tax) : undefined,
            currency: extracted.currency ?? "GBP",
            categoryName: extracted.categoryName ?? "Other",
            lineItems: extracted.lineItems,
            rawText: extracted.rawText ?? undefined,
            status: "processed",
          });

          // Notify owner
          const updatedReceipt = await getReceiptById(input.receiptId);
          await notifyOwner({
            title: "New Receipt Processed",
            content: `Receipt from "${extracted.vendor ?? "Unknown Vendor"}" for £${extracted.amount ?? 0} has been processed and categorised as "${extracted.categoryName}".`,
          });

          // Check monthly threshold (£5000)
          if (receiptDate) {
            const year = receiptDate.getFullYear();
            const month = receiptDate.getMonth() + 1;
            const monthlyTotal = await getMonthlyTotal(ctx.user.id, year, month);
            if (monthlyTotal > 5000) {
              await notifyOwner({
                title: "Monthly Expense Threshold Exceeded",
                content: `Monthly expenses for ${year}-${String(month).padStart(2, "0")} have exceeded £5,000. Current total: £${monthlyTotal.toFixed(2)}.`,
              });
            }
          }

          return { success: true, data: updatedReceipt };
        } catch (err) {
          await updateReceipt(input.receiptId, { status: "failed" });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "AI extraction failed: " + (err as Error).message,
          });
        }
      }),

    exportCsv: protectedProcedure
      .input(
        z.object({
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          categoryName: z.string().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const { rows } = await listReceipts({
          userId: ctx.user.id,
          categoryName: input.categoryName,
          dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
          dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
          limit: 10000,
        });

        const headers = ["ID", "Vendor", "Date", "Amount", "Tax", "Currency", "Category", "Status", "Notes", "Created At"];
        const csvRows = rows.map((r) => [
          r.id,
          `"${(r.vendor ?? "").replace(/"/g, '""')}"`,
          r.receiptDate ? new Date(r.receiptDate).toISOString().split("T")[0] : "",
          r.amount ?? "",
          r.tax ?? "",
          r.currency ?? "GBP",
          `"${(r.categoryName ?? "").replace(/"/g, '""')}"`,
          r.status,
          `"${(r.notes ?? "").replace(/"/g, '""')}"`,
          new Date(r.createdAt).toISOString(),
        ]);

        const csv = [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");
        return { csv, count: rows.length };
      }),
  }),

  // Upload endpoint returns a signed URL and creates a pending receipt record
  upload: router({
    getUploadUrl: protectedProcedure
      .input(
        z.object({
          filename: z.string(),
          mimeType: z.string(),
          sizeBytes: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (input.sizeBytes > 16 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 16MB)" });
        }
        const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
        if (!allowed.includes(input.mimeType)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported file type" });
        }
        const ext = input.filename.split(".").pop() ?? "jpg";
        const key = `receipts/${ctx.user.id}/${randomSuffix()}.${ext}`;
        // Create a pending receipt record
        const receiptId = await createReceipt({
          userId: ctx.user.id,
          originalFilename: input.filename,
          mimeType: input.mimeType,
          status: "pending",
        });
        return { receiptId, key, mimeType: input.mimeType };
      }),

    confirmUpload: protectedProcedure
      .input(
        z.object({
          receiptId: z.number(),
          imageUrl: z.string().url(),
          thumbnailUrl: z.string().url().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const receipt = await getReceiptById(input.receiptId);
        if (!receipt) throw new TRPCError({ code: "NOT_FOUND" });
        if (receipt.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await updateReceipt(input.receiptId, {
          imageUrl: input.imageUrl,
          thumbnailUrl: input.thumbnailUrl ?? input.imageUrl,
          status: "pending",
        });
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
