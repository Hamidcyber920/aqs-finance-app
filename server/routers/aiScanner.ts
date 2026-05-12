/**
 * AI Scanner Router
 * Handles file upload (image/PDF) → S3 storage → AI OCR → structured field extraction
 * Used by LBMW Correspondence and Bills & Utilities to auto-fill forms.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";

// ─── LBMW document scanner ────────────────────────────────────────────────────
async function analyseLbmwDocument(fileUrl: string, mimeType: string) {
  const contentType = mimeType.startsWith("application/pdf") ? "file_url" : "image_url";
  const prompt = `You are an assistant for a UK charity. Analyse this document (letter, email printout, invoice, or official notice) and extract all relevant fields.
Return JSON with:
{
  "contactName": "sender/author full name",
  "contactRole": "their role or organisation",
  "subject": "document subject or title",
  "summary": "2-3 sentence summary of the document",
  "dateReceived": "YYYY-MM-DD or null",
  "responseDeadline": "YYYY-MM-DD or null",
  "priority": "critical|high|medium|low",
  "direction": "inbound|outbound",
  "channel": "email|letter|phone|meeting|portal",
  "actionRequired": true/false,
  "actionTitle": "brief action title if needed, else null",
  "isInvoice": true/false,
  "invoiceAmount": number or null,
  "internalNotes": "any additional notes extracted from the document, else null"
}`;

  const userContent = contentType === "image_url"
    ? [{ type: "image_url" as const, image_url: { url: fileUrl, detail: "high" as const } }, { type: "text" as const, text: prompt }]
    : [{ type: "file_url" as const, file_url: { url: fileUrl, mime_type: "application/pdf" as const } }, { type: "text" as const, text: prompt }];

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are a precise document extraction assistant for a UK charity. Return valid JSON only." },
      { role: "user", content: userContent as any },
    ],
    response_format: { type: "json_object" } as any,
  });

  const rawContent = response.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("No response from LLM");
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  return JSON.parse(content);
}

// ─── Bills document scanner ───────────────────────────────────────────────────
async function analyseBillDocument(fileUrl: string, mimeType: string) {
  const contentType = mimeType.startsWith("application/pdf") ? "file_url" : "image_url";
  const prompt = `You are an assistant for a UK charity. Analyse this utility bill or invoice and extract all relevant fields.
Return JSON with:
{
  "supplierName": "energy/utility company name",
  "accountNumber": "account reference number or null",
  "billDate": "YYYY-MM-DD or null",
  "periodStart": "YYYY-MM-DD or null",
  "periodEnd": "YYYY-MM-DD or null",
  "amount": number or null (total amount due in GBP),
  "consumptionUnits": number or null,
  "unitType": "kWh|m3|litres|units or null",
  "utilityType": "electricity|gas|water|broadband|phone|insurance|rates|other",
  "notes": "any additional notes from the bill, else null"
}`;

  const userContent = contentType === "image_url"
    ? [{ type: "image_url" as const, image_url: { url: fileUrl, detail: "high" as const } }, { type: "text" as const, text: prompt }]
    : [{ type: "file_url" as const, file_url: { url: fileUrl, mime_type: "application/pdf" as const } }, { type: "text" as const, text: prompt }];

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are a precise utility bill extraction assistant for a UK charity. Return valid JSON only." },
      { role: "user", content: userContent as any },
    ],
    response_format: { type: "json_object" } as any,
  });

  const rawContent = response.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("No response from LLM");
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  return JSON.parse(content);
}

export const aiScannerRouter = router({
  /**
   * Upload a file to S3 and run AI OCR for LBMW correspondence.
   * Returns the S3 URL and extracted fields for the user to review before saving.
   */
  scanLbmwDocument: protectedProcedure
    .input(z.object({
      fileBase64: z.string(), // base64 encoded file content
      fileName: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Validate file type
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
      if (!allowed.includes(input.mimeType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only images (JPEG, PNG, WebP) and PDFs are supported" });
      }
      // Validate size (max 10MB base64 ≈ 7.5MB file)
      if (input.fileBase64.length > 14_000_000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 10MB)" });
      }
      // Upload to S3
      const ext = input.fileName.split(".").pop() ?? "bin";
      const key = `lbmw-docs/${ctx.user.id}-${nanoid(8)}.${ext}`;
      const buffer = Buffer.from(input.fileBase64, "base64");
      const { url } = await storagePut(key, buffer, input.mimeType);
      // AI analysis
      let extracted: any = null;
      let error: string | null = null;
      try {
        extracted = await analyseLbmwDocument(url, input.mimeType);
      } catch (e) {
        error = e instanceof Error ? e.message : "AI analysis failed";
      }
      return { fileUrl: url, extracted, error };
    }),

  /**
   * Upload a file to S3 and run AI OCR for a utility bill.
   * Returns the S3 URL and extracted fields for the user to review before saving.
   */
  scanBillDocument: protectedProcedure
    .input(z.object({
      fileBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
      if (!allowed.includes(input.mimeType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only images (JPEG, PNG, WebP) and PDFs are supported" });
      }
      if (input.fileBase64.length > 14_000_000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 10MB)" });
      }
      const ext = input.fileName.split(".").pop() ?? "bin";
      const key = `utility-bills/${ctx.user.id}-${nanoid(8)}.${ext}`;
      const buffer = Buffer.from(input.fileBase64, "base64");
      const { url } = await storagePut(key, buffer, input.mimeType);
      let extracted: any = null;
      let error: string | null = null;
      try {
        extracted = await analyseBillDocument(url, input.mimeType);
      } catch (e) {
        error = e instanceof Error ? e.message : "AI analysis failed";
      }
      return { fileUrl: url, extracted, error };
    }),
});
