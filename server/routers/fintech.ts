import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { stripePaymentSessions, giftAidDeclarations, fundraisingCampaigns } from "../../drizzle/schema";
import { eq, desc, gte, and } from "drizzle-orm";
import Stripe from "stripe";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "../_core/llm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2026-04-22.dahlia",
});

// ─── PayPal REST API helpers (credential-optional — graceful fallback) ─────────
const PAYPAL_BASE =
  process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID ?? "";
  const secret = process.env.PAYPAL_CLIENT_SECRET ?? "";
  if (!clientId || !secret) throw new Error("PayPal credentials not configured");
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token as string;
}

async function createPayPalOrder(
  amountGBP: number,
  description: string,
  returnUrl: string,
  cancelUrl: string
): Promise<{ orderId: string; approvalUrl: string }> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: { currency_code: "GBP", value: amountGBP.toFixed(2) },
          description,
        },
      ],
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        brand_name: "Abdullah Quilliam Society",
        locale: "en-GB",
        user_action: "PAY_NOW",
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal order creation failed: ${err}`);
  }
  const order = await res.json();
  const approvalUrl =
    (order.links as Array<{ rel: string; href: string }>).find((l) => l.rel === "approve")?.href ?? "";
  return { orderId: order.id as string, approvalUrl };
}

async function capturePayPalOrder(orderId: string): Promise<{ status: string; captureId: string }> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`PayPal capture failed: ${res.status}`);
  const data = await res.json();
  const captureId =
    data.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? orderId;
  return { status: data.status as string, captureId };
}

// ─── Reference code generator ─────────────────────────────────────────────────
function generateRefCode(campaignName: string, id: number): string {
  const prefix = campaignName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  return `${prefix}-${String(id).padStart(3, "0")}`;
}

// ─── Open Banking link builder (Truelayer / GoCardless style deep link) ────────
function buildOpenBankingLink(
  amount: number,
  reference: string,
  description: string
): string {
  // If a real Open Banking provider URL is configured, use it.
  // Otherwise fall back to a pre-filled BACS payment initiation link.
  const providerUrl = process.env.OPEN_BANKING_PAYMENT_URL;
  if (providerUrl) {
    const url = new URL(providerUrl);
    url.searchParams.set("amount", amount.toFixed(2));
    url.searchParams.set("currency", "GBP");
    url.searchParams.set("reference", reference);
    url.searchParams.set("description", description);
    return url.toString();
  }
  // Fallback: deep link to UK Faster Payments via sort code / account number
  // This opens the user's banking app (Monzo, Starling, HSBC etc.) via a
  // standard payment initiation URL format used by many UK fintechs.
  const params = new URLSearchParams({
    amount: amount.toFixed(2),
    currency: "GBP",
    reference,
    payee_name: "Abdullah Quilliam Society",
    sort_code: "309626",
    account_number: "XXXXXXXX",
    description,
  });
  return `https://pay.aqs.org.uk/ob?${params.toString()}`;
}

export const fintechRouter = router({
  // ─── CREATE STRIPE CHECKOUT SESSION (legacy redirect) ──────────────────────
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        donorName: z.string().min(1),
        donorEmail: z.string().email().optional(),
        donorPhone: z.string().optional(),
        campaignId: z.number().optional(),
        campaignName: z.string().optional(),
        amount: z.number().min(0.5),
        giftAidDeclared: z.boolean().default(false),
        giftAidAddress: z.string().optional(),
        origin: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [inserted] = await db
        .insert(stripePaymentSessions)
        .values({
          donorName: input.donorName,
          donorEmail: input.donorEmail,
          donorPhone: input.donorPhone,
          campaignId: input.campaignId,
          campaignName: input.campaignName,
          amount: String(input.amount),
          currency: "gbp",
          giftAidDeclared: input.giftAidDeclared,
          giftAidAddress: input.giftAidAddress,
          status: "pending",
          provider: "stripe",
        })
        .$returningId();
      const refCode = generateRefCode(input.campaignName ?? "AQS", inserted.id);
      await db
        .update(stripePaymentSessions)
        .set({ referenceCode: refCode })
        .where(eq(stripePaymentSessions.id, inserted.id));
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "bacs_debit"],
        line_items: [
          {
            price_data: {
              currency: "gbp",
              product_data: {
                name: input.campaignName ? `Donation — ${input.campaignName}` : "AQ Society Donation",
                description: `Reference: ${refCode}`,
              },
              unit_amount: Math.round(input.amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: input.donorEmail,
        client_reference_id: String(inserted.id),
        metadata: {
          local_session_id: String(inserted.id),
          donor_name: input.donorName,
          campaign_name: input.campaignName ?? "",
          reference_code: refCode,
          gift_aid: input.giftAidDeclared ? "yes" : "no",
        },
        success_url: `${input.origin}/payment/success?ref=${refCode}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.origin}/payment/cancelled?ref=${refCode}`,
      });
      await db
        .update(stripePaymentSessions)
        .set({ stripeSessionId: session.id })
        .where(eq(stripePaymentSessions.id, inserted.id));
      return { checkoutUrl: session.url, referenceCode: refCode, sessionId: inserted.id };
    }),

  // ─── CREATE PAYMENT INTENT (embedded Stripe Payment Element) ───────────────
  createPaymentIntent: protectedProcedure
    .input(
      z.object({
        donorName: z.string().min(1),
        donorEmail: z.string().email().optional(),
        donorPhone: z.string().optional(),
        campaignId: z.number().optional(),
        campaignName: z.string().optional(),
        amount: z.number().min(0.5),
        giftAidDeclared: z.boolean().default(false),
        giftAidAddress: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [inserted] = await db
        .insert(stripePaymentSessions)
        .values({
          donorName: input.donorName,
          donorEmail: input.donorEmail,
          donorPhone: input.donorPhone,
          campaignId: input.campaignId,
          campaignName: input.campaignName,
          amount: String(input.amount),
          currency: "gbp",
          giftAidDeclared: input.giftAidDeclared,
          giftAidAddress: input.giftAidAddress,
          status: "pending",
          provider: "stripe",
        })
        .$returningId();
      const refCode = generateRefCode(input.campaignName ?? "AQS", inserted.id);
      await db
        .update(stripePaymentSessions)
        .set({ referenceCode: refCode })
        .where(eq(stripePaymentSessions.id, inserted.id));
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(input.amount * 100),
        currency: "gbp",
        automatic_payment_methods: { enabled: true },
        receipt_email: input.donorEmail,
        metadata: {
          local_session_id: String(inserted.id),
          donor_name: input.donorName,
          donor_phone: input.donorPhone ?? "",
          campaign_name: input.campaignName ?? "",
          reference_code: refCode,
          gift_aid: input.giftAidDeclared ? "yes" : "no",
        },
        description: input.campaignName
          ? `Donation — ${input.campaignName} (${refCode})`
          : `AQ Society Donation (${refCode})`,
      });
      await db
        .update(stripePaymentSessions)
        .set({ stripeSessionId: paymentIntent.id })
        .where(eq(stripePaymentSessions.id, inserted.id));
      return {
        clientSecret: paymentIntent.client_secret!,
        referenceCode: refCode,
        sessionId: inserted.id,
        paymentIntentId: paymentIntent.id,
      };
    }),

  // ─── CREATE PAYPAL ORDER ────────────────────────────────────────────────────
  createPayPalOrder: protectedProcedure
    .input(
      z.object({
        donorName: z.string().min(1),
        donorEmail: z.string().email().optional(),
        donorPhone: z.string().optional(),
        campaignId: z.number().optional(),
        campaignName: z.string().optional(),
        amount: z.number().min(0.5),
        giftAidDeclared: z.boolean().default(false),
        giftAidAddress: z.string().optional(),
        origin: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [inserted] = await db
        .insert(stripePaymentSessions)
        .values({
          donorName: input.donorName,
          donorEmail: input.donorEmail,
          donorPhone: input.donorPhone,
          campaignId: input.campaignId,
          campaignName: input.campaignName,
          amount: String(input.amount),
          currency: "gbp",
          giftAidDeclared: input.giftAidDeclared,
          giftAidAddress: input.giftAidAddress,
          status: "pending",
          provider: "paypal",
        })
        .$returningId();
      const refCode = generateRefCode(input.campaignName ?? "AQS", inserted.id);
      await db
        .update(stripePaymentSessions)
        .set({ referenceCode: refCode })
        .where(eq(stripePaymentSessions.id, inserted.id));
      const description = input.campaignName
        ? `Donation — ${input.campaignName} (${refCode})`
        : `AQ Society Donation (${refCode})`;
      const returnUrl = `${input.origin}/payment/success?ref=${refCode}&provider=paypal`;
      const cancelUrl = `${input.origin}/payment/cancelled?ref=${refCode}`;
      const { orderId, approvalUrl } = await createPayPalOrder(
        input.amount,
        description,
        returnUrl,
        cancelUrl
      );
      await db
        .update(stripePaymentSessions)
        .set({ externalOrderId: orderId })
        .where(eq(stripePaymentSessions.id, inserted.id));
      return { approvalUrl, referenceCode: refCode, orderId, sessionId: inserted.id };
    }),

  // ─── CAPTURE PAYPAL ORDER (called from success page) ───────────────────────
  capturePayPalOrder: protectedProcedure
    .input(z.object({ orderId: z.string(), sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { status, captureId } = await capturePayPalOrder(input.orderId);
      if (status === "COMPLETED") {
        await db
          .update(stripePaymentSessions)
          .set({ status: "completed", externalOrderId: captureId, webhookConfirmedAt: new Date() })
          .where(eq(stripePaymentSessions.id, input.sessionId));
      }
      return { status, captureId };
    }),

  // ─── GENERATE OPEN BANKING LINK ─────────────────────────────────────────────
  generateOpenBankingLink: protectedProcedure
    .input(
      z.object({
        donorName: z.string().min(1),
        donorEmail: z.string().email().optional(),
        donorPhone: z.string().optional(),
        campaignId: z.number().optional(),
        campaignName: z.string().optional(),
        amount: z.number().min(0.5),
        giftAidDeclared: z.boolean().default(false),
        giftAidAddress: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [inserted] = await db
        .insert(stripePaymentSessions)
        .values({
          donorName: input.donorName,
          donorEmail: input.donorEmail,
          donorPhone: input.donorPhone,
          campaignId: input.campaignId,
          campaignName: input.campaignName,
          amount: String(input.amount),
          currency: "gbp",
          giftAidDeclared: input.giftAidDeclared,
          giftAidAddress: input.giftAidAddress,
          status: "pending",
          provider: "open_banking",
        })
        .$returningId();
      const refCode = generateRefCode(input.campaignName ?? "AQS", inserted.id);
      await db
        .update(stripePaymentSessions)
        .set({ referenceCode: refCode })
        .where(eq(stripePaymentSessions.id, inserted.id));
      const description = input.campaignName
        ? `Donation — ${input.campaignName}`
        : "AQ Society Donation";
      const obLink = buildOpenBankingLink(input.amount, refCode, description);
      return {
        openBankingLink: obLink,
        referenceCode: refCode,
        sessionId: inserted.id,
        bankDetails: {
          accountName: "Abdullah Quilliam Society",
          sortCode: "30-96-26",
          accountNumber: "XXXXXXXX",
          iban: "GB00 LOYD 3096 26XX XXXX XX",
          swift: "LOYDGB21",
          bankName: "Lloyds Bank",
          reference: refCode,
        },
      };
    }),

  // ─── GET PAYMENT PAGE DATA (for pre-populated /pay public page) ────────────
  getPaymentPageData: protectedProcedure
    .input(
      z.object({
        ref: z.string().optional(),
        donorName: z.string().optional(),
        campaignName: z.string().optional(),
        amount: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      // If a ref code is provided, load the existing session
      if (input.ref) {
        const sessions = await db
          .select()
          .from(stripePaymentSessions)
          .where(eq(stripePaymentSessions.referenceCode, input.ref))
          .limit(1);
        if (sessions.length > 0) {
          const s = sessions[0];
          return {
            donorName: s.donorName,
            donorEmail: s.donorEmail ?? "",
            donorPhone: s.donorPhone ?? "",
            campaignName: s.campaignName ?? "",
            amount: Number(s.amount ?? 0),
            referenceCode: s.referenceCode ?? "",
            status: s.status,
          };
        }
      }
      // Otherwise return the query-param pre-fill data
      return {
        donorName: input.donorName ?? "",
        donorEmail: "",
        donorPhone: "",
        campaignName: input.campaignName ?? "",
        amount: input.amount ?? 0,
        referenceCode: "",
        status: "pending" as const,
      };
    }),

  // ─── AI-OCR: EXTRACT PAYMENT DATA FROM IMAGE ───────────────────────────────
  extractPaymentData: protectedProcedure
    .input(
      z.object({
        fileUrl: z.string().url(),
        mimeType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content:
              "You are an AI assistant that extracts payment and donation data from images. Extract all relevant fields and return structured JSON. For confidence, use 'high' (clearly visible), 'medium' (partially visible or inferred), or 'low' (guessed or unclear).",
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: input.fileUrl, detail: "high" },
              },
              {
                type: "text",
                text: 'Extract the following fields from this donation receipt, bank transfer screenshot, or payment confirmation image. Return ONLY valid JSON with this exact structure: {"donorName":{"value":"","confidence":"high|medium|low"},"amount":{"value":0,"confidence":"high|medium|low"},"currency":{"value":"GBP","confidence":"high|medium|low"},"date":{"value":"","confidence":"high|medium|low"},"campaignName":{"value":"","confidence":"high|medium|low"},"reference":{"value":"","confidence":"high|medium|low"},"donorEmail":{"value":"","confidence":"high|medium|low"},"donorPhone":{"value":"","confidence":"high|medium|low"},"paymentMethod":{"value":"","confidence":"high|medium|low"}}',
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "payment_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                donorName: { type: "object", properties: { value: { type: "string" }, confidence: { type: "string" } }, required: ["value", "confidence"], additionalProperties: false },
                amount: { type: "object", properties: { value: { type: "number" }, confidence: { type: "string" } }, required: ["value", "confidence"], additionalProperties: false },
                currency: { type: "object", properties: { value: { type: "string" }, confidence: { type: "string" } }, required: ["value", "confidence"], additionalProperties: false },
                date: { type: "object", properties: { value: { type: "string" }, confidence: { type: "string" } }, required: ["value", "confidence"], additionalProperties: false },
                campaignName: { type: "object", properties: { value: { type: "string" }, confidence: { type: "string" } }, required: ["value", "confidence"], additionalProperties: false },
                reference: { type: "object", properties: { value: { type: "string" }, confidence: { type: "string" } }, required: ["value", "confidence"], additionalProperties: false },
                donorEmail: { type: "object", properties: { value: { type: "string" }, confidence: { type: "string" } }, required: ["value", "confidence"], additionalProperties: false },
                donorPhone: { type: "object", properties: { value: { type: "string" }, confidence: { type: "string" } }, required: ["value", "confidence"], additionalProperties: false },
                paymentMethod: { type: "object", properties: { value: { type: "string" }, confidence: { type: "string" } }, required: ["value", "confidence"], additionalProperties: false },
              },
              required: ["donorName", "amount", "currency", "date", "campaignName", "reference", "donorEmail", "donorPhone", "paymentMethod"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = response.choices?.[0]?.message?.content ?? "{}";
      const parsed = typeof content === "string" ? JSON.parse(content) : content;
      return parsed as {
        donorName: { value: string; confidence: string };
        amount: { value: number; confidence: string };
        currency: { value: string; confidence: string };
        date: { value: string; confidence: string };
        campaignName: { value: string; confidence: string };
        reference: { value: string; confidence: string };
        donorEmail: { value: string; confidence: string };
        donorPhone: { value: string; confidence: string };
        paymentMethod: { value: string; confidence: string };
      };
    }),

  // ─── QUICK CAPTURE: generate trackable WhatsApp payment link ───────────────
  quickCaptureLink: protectedProcedure
    .input(
      z.object({
        donorName: z.string().min(1),
        donorPhone: z.string().optional(),
        campaignId: z.number().optional(),
        campaignName: z.string().optional(),
        amount: z.number().min(0.5),
        origin: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [inserted] = await db
        .insert(stripePaymentSessions)
        .values({
          donorName: input.donorName,
          donorPhone: input.donorPhone,
          campaignId: input.campaignId,
          campaignName: input.campaignName,
          amount: String(input.amount),
          currency: "gbp",
          giftAidDeclared: false,
          status: "pending",
          provider: "stripe",
        })
        .$returningId();
      const refCode = generateRefCode(input.campaignName ?? "AQS", inserted.id);
      await db
        .update(stripePaymentSessions)
        .set({ referenceCode: refCode })
        .where(eq(stripePaymentSessions.id, inserted.id));
      // Pre-populated payment page URL — /pay reads ?ref, ?name, ?campaign, ?amount
      const paymentUrl = `${input.origin}/pay?ref=${refCode}&name=${encodeURIComponent(input.donorName)}&campaign=${encodeURIComponent(input.campaignName ?? "")}&amount=${input.amount}`;
      const firstName = input.donorName.split(" ")[0];
      const whatsAppMessage =
        `Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName}!\n\n` +
        `JazakAllah Khayran for your generous pledge${input.campaignName ? ` towards the ${input.campaignName}` : ""}.\n\n` +
        `To fulfil your donation of £${input.amount.toFixed(2)}, please click the secure link below:\n\n` +
        `${paymentUrl}\n\n` +
        `Your reference: *${refCode}*\n\n` +
        `You can pay by card, Apple Pay, Google Pay, BACS Direct Debit, PayPal, or direct bank transfer.\n\n` +
        `May Allah accept your contribution and reward you abundantly. Ameen.\n\nAQ Society`;
      const whatsAppUrl = input.donorPhone
        ? `https://wa.me/${input.donorPhone.replace(/\D/g, "")}?text=${encodeURIComponent(whatsAppMessage)}`
        : `https://wa.me/?text=${encodeURIComponent(whatsAppMessage)}`;
      return { referenceCode: refCode, paymentUrl, whatsAppUrl, whatsAppMessage, sessionId: inserted.id };
    }),

  // ─── LIST PAYMENT SESSIONS ─────────────────────────────────────────────────
  listPaymentSessions: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "completed", "failed", "cancelled"]).optional(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = input.status
        ? [eq(stripePaymentSessions.status, input.status)]
        : [];
      return db
        .select()
        .from(stripePaymentSessions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(stripePaymentSessions.createdAt))
        .limit(input.limit);
    }),

  // ─── GIFT AID R68 EXPORT ───────────────────────────────────────────────────
  exportGiftAidR68: protectedProcedure
    .input(z.object({ month: z.number().min(1).max(12), year: z.number().min(2020) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { declarations: [], csvContent: "", batch: "", totalAmount: 0, count: 0 };
      const batchKey = `${input.year}-${String(input.month).padStart(2, "0")}`;
      const startDate = new Date(input.year, input.month - 1, 1);
      const declarations = await db
        .select()
        .from(giftAidDeclarations)
        .where(gte(giftAidDeclarations.createdAt, startDate))
        .orderBy(giftAidDeclarations.createdAt);
      const csvRows = [
        "Title,First Name,Last Name,House Number or Name,Postcode,Donation Date,Donation Amount,Aggregated Donations,Sponsored Event,Gift Aid Declaration,Unique Reference",
      ];
      for (const d of declarations) {
        const nameParts = d.donorName.trim().split(" ");
        const firstName = nameParts.slice(0, -1).join(" ") || nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
        const addressParts = (d.donorAddress ?? "").split(",");
        const houseNo = addressParts[0]?.trim() ?? "";
        const postcode = addressParts[addressParts.length - 1]?.trim() ?? "";
        csvRows.push(
          ["", `"${firstName}"`, `"${lastName}"`, `"${houseNo}"`, `"${postcode}"`,
            d.donationDate, Number(d.amount).toFixed(2), "No", "No", "Yes",
            `"${d.stripeTransactionRef ?? d.stripePaymentIntentId ?? d.id}"`].join(",")
        );
      }
      const csvContent = csvRows.join("\n");
      const totalAmount = declarations.reduce((sum, d) => sum + Number(d.amount), 0);
      return { declarations, csvContent, batch: batchKey, totalAmount, count: declarations.length };
    }),

  // ─── LIST CAMPAIGNS ────────────────────────────────────────────────────────
  listCampaigns: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({ id: fundraisingCampaigns.id, name: fundraisingCampaigns.name })
      .from(fundraisingCampaigns)
      .where(eq(fundraisingCampaigns.isActive, true))
      .orderBy(fundraisingCampaigns.name);
  }),

  // ─── MARK THANK-YOU WHATSAPP SENT ─────────────────────────────────────────
  markThankYouSent: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db
        .update(stripePaymentSessions)
        .set({ thankYouWhatsAppSentAt: new Date() })
        .where(eq(stripePaymentSessions.id, input.sessionId));
      return { success: true };
    }),

  // ─── ADD MANUAL GIFT AID DECLARATION ──────────────────────────────────────
  addGiftAidDeclaration: protectedProcedure
    .input(
      z.object({
        donorName: z.string().min(1),
        donorEmail: z.string().email().optional(),
        donorAddress: z.string().optional(),
        amount: z.number().min(0.01),
        donationDate: z.string(),
        campaignName: z.string().optional(),
        declarationMethod: z.enum(["online_stripe", "manual", "paper"]).default("manual"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [inserted] = await db
        .insert(giftAidDeclarations)
        .values({
          donorName: input.donorName,
          donorEmail: input.donorEmail,
          donorAddress: input.donorAddress,
          amount: String(input.amount),
          donationDate: input.donationDate as any,
          campaignName: input.campaignName,
          declarationMethod: input.declarationMethod,
        })
        .$returningId();
      return { id: inserted.id };
    }),
});
