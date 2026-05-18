/**
 * Lightweight Express endpoint for AI receipt/document extraction.
 * Bypasses tRPC to reduce memory overhead on Cloud Run (512MB).
 * 
 * POST /api/extract
 * Body: { fileUrl: string, mimeType: string, moduleType: string }
 * Returns: { extractedData, confidence, moduleType, isBulk }
 */
import { Router } from "express";
import { invokeLLM } from "./_core/llm";

const extractRouter = Router();

const MODULE_PROMPTS: Record<string, string> = {
  receipt: `You are a UK expense receipt extractor. Extract from this document:
- vendorName: name of the shop/vendor
- totalAmount: total amount paid in GBP (number)
- purchaseDate: date of purchase (YYYY-MM-DD)
- items: brief description of items purchased
- category: best matching from: Food & Catering, Cleaning & Hygiene, Maintenance & Repairs, IT & Technology, Printing & Stationery, Travel & Transport, Other
- vatAmount: VAT amount in GBP (number or null)
- paymentMethod: cash/card or null
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

  handwritten_collection: `You are an expert at reading handwritten UK charity collection sheets. Extract ALL donor entries you can see. For each entry extract:
- donorName: full name of donor
- donorPhone: phone number if visible (UK format preferred)
- donorEmail: email address if visible
- amount: donation amount in GBP (number)
- donationDate: date (YYYY-MM-DD) if visible, otherwise null
- campaignName: campaign or project name if written at top of sheet
- giftAid: true if there is a tick or 'GA' next to the entry, false otherwise
- paymentMethod: cash/cheque/bank_transfer based on any method column
- notes: any additional notes
Return JSON with key "records" containing an array of all donors found. Use null for missing fields.`,

  business_card: `You are an expert at reading business cards. Extract:
- donorName: full name
- donorPhone: phone number (prefer mobile, UK format)
- donorEmail: email address
- donorAddress: business address if shown
- organisation: company or organisation name
- jobTitle: job title or role
- website: website URL if shown
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

  fundraising_donation: `You are a donation extractor for a UK Islamic charity. Extract:
- donorName: full name of donor
- donorPhone: UK phone number or null
- donorEmail: email address or null
- amount: donation amount in GBP (number)
- donationDate: date (YYYY-MM-DD)
- paymentMethod: cash/bank_transfer/cheque/online or null
- reference: payment reference or null
- campaignName: fundraising campaign name or null
- giftAid: whether gift aid applies (true/false or null)
- notes: any additional notes
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

  bank_transfer_screenshot: `You are an expert at reading UK bank transfer confirmation screenshots. Extract:
- donorName: sender name or account name
- amount: transferred amount in GBP (number)
- donationDate: date of transfer (YYYY-MM-DD)
- reference: payment reference or description text
- senderBank: name of sender's bank if visible
- recipientName: recipient account name
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

  crm_donor: `You are an expert at reading UK charity donor pledge cards and donor forms. Extract:
- donorName: full name of donor
- donorPhone: UK phone number or null
- donorEmail: email address or null
- donorAddress: home address or null
- amount: pledge or donation amount in GBP (number) or null
- donationDate: date (YYYY-MM-DD) or null
- campaignName: campaign or project name or null
- giftAid: true if gift aid box is ticked, false otherwise
- paymentMethod: cash/bank_transfer/cheque/standing_order or null
- notes: any additional notes or instructions
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

  invoice: `You are a UK invoice/expense extractor. Extract:
- vendorName: name of the supplier/vendor
- invoiceNumber: invoice number or reference
- amount: total amount in GBP (number)
- vatAmount: VAT amount in GBP (number or null)
- invoiceDate: invoice date (YYYY-MM-DD)
- dueDate: payment due date (YYYY-MM-DD or null)
- description: description of goods/services
- category: best matching from: Restaurant/Bistro, Cleaning & Hygiene, Events & Activities, Wholesale & Supplies, Travel & Transport, Maintenance & Repairs, Utilities, Professional Services, IT & Technology, Printing & Stationery, Staff Welfare, Ramadan, Other
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,
};

extractRouter.post("/api/extract", async (req, res) => {
  try {
    const { fileUrl, mimeType, moduleType } = req.body || {};

    if (!fileUrl || !moduleType) {
      return res.status(400).json({ error: "Missing fileUrl or moduleType" });
    }

    const systemPrompt = MODULE_PROMPTS[moduleType] || MODULE_PROMPTS["receipt"];
    const isImage = (mimeType || "").startsWith("image/");
    const isPdf = mimeType === "application/pdf";

    let userContent: any[];
    if (isPdf) {
      userContent = [{ type: "file_url" as const, file_url: { url: fileUrl, mime_type: "application/pdf" as const } }];
    } else {
      // Use 'auto' detail instead of 'high' to reduce processing time and memory
      userContent = [{ type: "image_url" as const, image_url: { url: fileUrl, detail: "auto" as const } }];
    }

    const llmResult = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const content = llmResult?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: "AI extraction failed — no response from model" });
    }

    let extractedData: Record<string, unknown> = {};
    try {
      extractedData = typeof content === "string" ? JSON.parse(content) : (content as unknown as Record<string, unknown>);
    } catch {
      // Try to extract JSON from the response
      const match = (content as string).match(/\{[\s\S]*\}/);
      if (match) {
        extractedData = JSON.parse(match[0]);
      } else {
        return res.status(500).json({ error: "AI returned non-JSON response" });
      }
    }

    return res.json({
      extractedData,
      confidence: 0.85,
      moduleType,
      isBulk: "records" in extractedData,
    });
  } catch (err: any) {
    console.error("[Extract] Error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Extraction failed" });
  }
});

export { extractRouter };
