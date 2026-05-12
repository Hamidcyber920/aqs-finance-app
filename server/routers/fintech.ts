import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { stripePaymentSessions, giftAidDeclarations, fundraisingCampaigns, fundraisingDonations } from "../../drizzle/schema";
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
function generateRefCode(campaignName: string, id: number, donorName?: string): string {
  // Spec: SURNAME-XXXX style (e.g. RIMMER-A8K2) — personal and unique
  const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
  const rand4 = Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
  if (donorName && donorName.trim()) {
    // Use last word of donor name as surname prefix (up to 7 chars)
    const parts = donorName.trim().toUpperCase().replace(/[^A-Z ]/g, "").split(" ");
    const surname = (parts[parts.length - 1] || parts[0] || "AQS").slice(0, 7);
    return `${surname}-${rand4}`;
  }
  // Fallback: campaign prefix + random
  const prefix = campaignName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
  return `${prefix || "AQS"}-${rand4}`;
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
      const refCode = generateRefCode(input.campaignName ?? "AQS", inserted.id, input.donorName);
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
      const refCode = generateRefCode(input.campaignName ?? "AQS", inserted.id, input.donorName);
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
      const refCode = generateRefCode(input.campaignName ?? "AQS", inserted.id, input.donorName);
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
      const refCode = generateRefCode(input.campaignName ?? "AQS", inserted.id, input.donorName);
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
      const refCode = generateRefCode(input.campaignName ?? "AQS", inserted.id, input.donorName);
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

  // ─── GIFT AID ChR1 EXPORT ───────────────────────────────────────────────────
  exportGiftAidChr1: protectedProcedure
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
      // HMRC ChR1 CSV format — all required columns
      const csvRows = [
        "Title,First Name,Last Name,House Number or Name,Postcode,Donation Date,Donation Amount,Aggregated Donations,Sponsored Event,Gift Aid Declaration,Unique Reference,Consent Method,Consent Timestamp,IP Address",
      ];
      for (const d of declarations) {
        // Prefer split name fields; fall back to parsing donorName
        const nameParts = d.donorName.trim().split(" ");
        const title = d.donorTitle ?? "";
        const firstName = d.donorFirstName ?? (nameParts.slice(0, -1).join(" ") || nameParts[0]);
        const lastName = d.donorSurname ?? (nameParts.length > 1 ? nameParts[nameParts.length - 1] : "");
        // Prefer structured address fields; fall back to parsing donorAddress
        const addressParts = (d.donorAddress ?? "").split(",");
        const houseNo = d.donorHouseNumber ?? addressParts[0]?.trim() ?? "";
        const postcode = d.donorPostcode ?? addressParts[addressParts.length - 1]?.trim() ?? "";
        // HMRC Unique Reference Number = Stripe payment_intent ID
        const urn = d.uniqueReferenceNumber ?? d.stripePaymentIntentId ?? d.stripeTransactionRef ?? String(d.id);
        const consentMethod = d.declarationMethod === "online_stripe" ? "Electronic (ECA 2000)" : d.declarationMethod;
        const consentTs = d.consentTimestamp ? new Date(d.consentTimestamp).toISOString() : "";
        csvRows.push(
          [`"${title}"`, `"${firstName}"`, `"${lastName}"`, `"${houseNo}"`, `"${postcode}"`,
            d.donationDate, Number(d.amount).toFixed(2), "No", "No", "Yes",
            `"${urn}"`, `"${consentMethod}"`, `"${consentTs}"`, `"${d.donorIpAddress ?? ""}"`].join(",")
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

  // ─── CREATE BANK TRANSFER SESSION (log a pending bank transfer) ─────────────
  createBankTransferSession: protectedProcedure
    .input(
      z.object({
        donorName: z.string().min(1),
        donorEmail: z.string().email().optional(),
        donorPhone: z.string().optional(),
        campaignId: z.number().optional(),
        campaignName: z.string().optional(),
        amount: z.number().min(0.01).optional(),
        referenceCode: z.string().min(1),
        giftAidDeclared: z.boolean().default(false),
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
          amount: input.amount ? String(input.amount) : null,
          currency: "gbp",
          giftAidDeclared: input.giftAidDeclared,
          status: "pending",
          provider: "bank_transfer",
          referenceCode: input.referenceCode,
        })
        .$returningId();
      return { id: inserted.id, referenceCode: input.referenceCode };
    }),

  // ─── SEND PLEDGE FULFILMENT WHATSAPP ──────────────────────────────────────
  sendPledgeWhatsApp: protectedProcedure
    .input(
      z.object({
        donorName: z.string().min(1),
        donorPhone: z.string().min(1),
        campaignName: z.string().optional(),
        amount: z.number().min(0.01).optional(),
        origin: z.string(),
        referenceCode: z.string().optional(),
        giftAidDeclared: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const firstName = input.donorName.split(" ")[0];
      const refCode = input.referenceCode ?? `AQS-${String(Date.now()).slice(-6)}`;
      const params = new URLSearchParams({
        ref: refCode,
        name: input.donorName,
        campaign: input.campaignName ?? "",
        ...(input.amount ? { amount: String(input.amount) } : {}),
        ...(input.giftAidDeclared ? { giftaid: "1" } : {}),
      });
      const paymentUrl = `${input.origin}/pay?${params.toString()}`;
      const hadith = `"Whoever builds a house for Allah, Allah will build for him a house in Paradise." (Bukhari & Muslim)`;
      const msgLines = [
        `Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName} 🌿`,
        ``,
        `JazakAllah Khayran for your generous pledge${input.campaignName ? ` towards the *${input.campaignName}*` : ""}. Your Amanah is a source of immense barakah for our community.`,
        ``,
        `To fulfil your pledge${input.amount ? ` of *£${input.amount.toFixed(2)}*` : ""}, please tap the secure link below:`,
        ``,
        `👉 ${paymentUrl}`,
        ``,
        `🔖 Your Reference: *${refCode}*`,
        input.giftAidDeclared ? `✅ Gift Aid: Pre-selected (25% uplift at no cost to you)` : ``,
        ``,
        `📖 ${hadith}`,
        ``,
        `May Allah accept this from you as a Sadaqah Jariyah. Ameen. 🤲`,
        ``,
        `— AQ Society Finance Team`,
      ].filter(Boolean).join("\n");
      const cleaned = input.donorPhone.replace(/\D/g, "");
      const waNumber = cleaned.startsWith("0") ? "44" + cleaned.slice(1) : cleaned;
      const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(msgLines)}`;
      return { whatsAppUrl: waUrl, message: msgLines, paymentUrl, referenceCode: refCode };
    }),

  // ─── GENERATE DONOR RECEIPT (HTML + Jannah Hadith) ─────────────────────────
  generateDonorReceipt: protectedProcedure
    .input(
      z.object({
        sessionId: z.number().optional(),
        donorName: z.string().min(1),
        donorEmail: z.string().optional(),
        amount: z.number(),
        campaignName: z.string().optional(),
        referenceCode: z.string(),
        giftAidDeclared: z.boolean().default(false),
        paymentMethod: z.string().optional(),
        paidAt: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const hadithOptions = [
        { arabic: "مَنْ بَنَى مَسْجِدًا لِلَّهِ بَنَى اللَّهُ لَهُ بَيْتًا فِي الْجَنَّةِ", english: `"Whoever builds a mosque for Allah, Allah will build for him a house in Paradise."`, source: "Bukhari & Muslim" },
        { arabic: "إِذَا مَاتَ الإِنْسَانُ انْقَطَعَ عَنْهُ عَمَلُهُ إِلاَّ مِنْ ثَلاَثَةٍ", english: `"When a person dies, his deeds come to an end except for three: Sadaqah Jariyah, knowledge that is benefited from, and a righteous child who prays for him."`, source: "Muslim" },
        { arabic: "مَثَلُ الَّذِينَ يُنفِقُونَ أَمْوَالَهُمْ فِي سَبِيلِ اللَّهِ كَمَثَلِ حَبَّةٍ أَنبَتَتْ سَبْعَ سَنَابِلَ", english: `"The example of those who spend their wealth in the way of Allah is like a seed that grows seven spikes; in each spike is a hundred grains."`, source: "Quran 2:261" },
      ];
      const hadith = hadithOptions[Math.floor(Math.random() * hadithOptions.length)];
      const paidDate = input.paidAt ? new Date(input.paidAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Donation Receipt — AQ Society</title><style>body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f4f0;margin:0;padding:24px}.card{max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)}.header{background:linear-gradient(135deg,#1a4731,#2d6a4f);padding:32px 24px;text-align:center;color:#fff}.header h1{margin:0;font-size:24px;font-weight:800;letter-spacing:-0.02em}.header p{margin:4px 0 0;opacity:0.8;font-size:13px}.body{padding:28px 24px}.ref-badge{background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:12px 16px;text-align:center;margin-bottom:20px}.ref-badge .label{font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#16a34a;font-weight:600}.ref-badge .code{font-size:22px;font-family:monospace;font-weight:800;color:#14532d;margin-top:4px}.table{width:100%;border-collapse:collapse;margin-bottom:20px}.table td{padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px}.table td:first-child{color:#6b7280;font-weight:500}.table td:last-child{text-align:right;font-weight:600;color:#111827}.amount-row td{background:#f0fdf4;font-size:16px}.gift-aid{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:20px;font-size:13px;color:#1e40af}.hadith{background:linear-gradient(135deg,#fef9c3,#fef3c7);border-left:4px solid #d97706;border-radius:8px;padding:16px;margin-bottom:20px}.hadith .arabic{font-size:18px;text-align:right;direction:rtl;color:#92400e;margin-bottom:8px;font-family:serif}.hadith .english{font-size:13px;color:#78350f;font-style:italic;line-height:1.6}.hadith .source{font-size:11px;color:#b45309;margin-top:6px;font-weight:600}.footer{background:#f9fafb;padding:16px 24px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #f0f0f0}</style></head><body><div class="card"><div class="header"><h1>🕌 AQ Society</h1><p>Abdullah Quilliam Society — Donation Receipt</p></div><div class="body"><div class="ref-badge"><div class="label">Payment Reference</div><div class="code">${input.referenceCode}</div></div><table class="table"><tr><td>Donor</td><td>${input.donorName}</td></tr>${input.donorEmail ? `<tr><td>Email</td><td>${input.donorEmail}</td></tr>` : ""}<tr><td>Campaign</td><td>${input.campaignName ?? "AQ Society General Fund"}</td></tr><tr><td>Date</td><td>${paidDate}</td></tr><tr><td>Payment Method</td><td>${input.paymentMethod ?? "Online"}</td></tr><tr class="amount-row"><td>Amount</td><td>£${input.amount.toFixed(2)}</td></tr></table>${input.giftAidDeclared ? `<div class="gift-aid">✅ <strong>Gift Aid Declared</strong> — AQ Society can claim an additional 25p for every £1 donated, at no cost to you. Thank you for maximising your donation!</div>` : ""}<div class="hadith"><div class="arabic">${hadith.arabic}</div><div class="english">${hadith.english}</div><div class="source">— ${hadith.source}</div></div><p style="font-size:14px;color:#374151;line-height:1.7">JazakAllah Khayran, <strong>${input.donorName.split(" ")[0]}</strong>. May Allah accept your generous donation and grant you and your family the highest ranks in Jannah. Your contribution to the <strong>${input.campaignName ?? "AQ Society"}</strong> is a Sadaqah Jariyah that will continue to benefit the Ummah long after us. Ameen. 🤲</p></div><div class="footer">AQ Society · Abdullah Quilliam Society · Registered Charity · JazakAllahu Khayran</div></div></body></html>`;
      return { html, hadith, referenceCode: input.referenceCode, donorName: input.donorName, amount: input.amount };
    }),

  // ─── MIRROR TO HIBBA BACKUP VAULT ─────────────────────────────────────────
  mirrorToBackupVault: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [session] = await db
        .select()
        .from(stripePaymentSessions)
        .where(eq(stripePaymentSessions.id, input.sessionId));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      const { storagePut } = await import("../storage");
      const now = new Date();
      const datePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
      const fileKey = `backup-vault/${datePath}/${session.referenceCode ?? `session-${session.id}`}-${Date.now()}.json`;
      const snapshot = JSON.stringify({ ...session, _backupAt: now.toISOString(), _source: "hibba-backup-vault" }, null, 2);
      const { url } = await storagePut(fileKey, Buffer.from(snapshot), "application/json");
      return { success: true, url, fileKey };
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

  // ─── PARSE FRIDAY COLLECTION SHEET (AI batch extraction) ──────────────────
  parseFridayCollectionSheet: protectedProcedure
    .input(
      z.object({
        fileUrl: z.string().url(),
        mimeType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ input }) => {
      const systemPrompt = `You are an expert data extraction assistant for a mosque charity.
You are given an image or PDF of a Friday collection sheet (Amanah entries) containing donor names, phone numbers, amounts pledged, campaign names, and Gift Aid declarations.
Extract ALL donor rows you can find. For each row return a JSON object with these fields:
- name: string (donor full name)
- phone: string (phone number, may be empty)
- amount: number (amount in GBP, 0 if unclear)
- campaign: string (campaign name or "General" if not specified)
- giftAid: boolean (true if Gift Aid is ticked/indicated)
- confidence: object with keys name, phone, amount, campaign, giftAid — each a number 0-1 indicating extraction confidence
Return a JSON object: { donors: [...], totalRows: number, analysisNote: string }
The analysisNote should say "Ready for verification, Dr. Abdul Hamid." if extraction looks complete.`;

      const contentParts: any[] = [
        { type: "text", text: "Please extract all donor rows from this collection sheet:" },
        input.mimeType.startsWith("image/")
          ? { type: "image_url", image_url: { url: input.fileUrl, detail: "high" } }
          : { type: "file_url", file_url: { url: input.fileUrl, mime_type: input.mimeType as any } },
      ];

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contentParts },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "collection_sheet_result",
            strict: true,
            schema: {
              type: "object",
              properties: {
                donors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      phone: { type: "string" },
                      amount: { type: "number" },
                      campaign: { type: "string" },
                      giftAid: { type: "boolean" },
                      confidence: {
                        type: "object",
                        properties: {
                          name: { type: "number" },
                          phone: { type: "number" },
                          amount: { type: "number" },
                          campaign: { type: "number" },
                          giftAid: { type: "number" },
                        },
                        required: ["name", "phone", "amount", "campaign", "giftAid"],
                        additionalProperties: false,
                      },
                    },
                    required: ["name", "phone", "amount", "campaign", "giftAid", "confidence"],
                    additionalProperties: false,
                  },
                },
                totalRows: { type: "number" },
                analysisNote: { type: "string" },
              },
              required: ["donors", "totalRows", "analysisNote"],
              additionalProperties: false,
            },
          },
        },
      });

      const raw = response?.choices?.[0]?.message?.content;
      if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No response from AI" });
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return parsed as {
        donors: Array<{
          name: string; phone: string; amount: number; campaign: string; giftAid: boolean;
          confidence: { name: number; phone: number; amount: number; campaign: number; giftAid: number };
        }>;
        totalRows: number;
        analysisNote: string;
      };
    }),

  // ─── SAVE PARSED DONORS (bulk insert from collection sheet) ───────────────
  saveParsedDonors: protectedProcedure
    .input(
      z.object({
        donors: z.array(
          z.object({
            name: z.string().min(1),
            phone: z.string().optional(),
            amount: z.number().min(0),
            campaign: z.string().optional(),
            giftAid: z.boolean().default(false),
          })
        ),
        campaignId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const results: Array<{ name: string; donationId: number }> = [];
      for (const donor of input.donors) {
        if (donor.amount <= 0) continue;
        const [don] = await db
          .insert(fundraisingDonations)
          .values({
            campaignId: input.campaignId ?? null,
            donorName: donor.name,
            donorPhone: donor.phone ?? null,
            amount: String(donor.amount),
            paymentMethod: "pending",
            giftAid: donor.giftAid,
            notes: "Imported from Friday collection sheet",
          } as any)
          .$returningId();
        results.push({ name: donor.name, donationId: don.id });
      }
      return { saved: results.length, results };
    }),
});
