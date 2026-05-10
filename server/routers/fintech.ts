import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { stripePaymentSessions, giftAidDeclarations, fundraisingCampaigns } from "../../drizzle/schema";
import { eq, desc, gte, and, isNull } from "drizzle-orm";
import Stripe from "stripe";
import { TRPCError } from "@trpc/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2026-04-22.dahlia",
});

// Generate a unique reference code like RIMMERS-001
function generateRefCode(campaignName: string, id: number): string {
  const prefix = campaignName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  return `${prefix}-${String(id).padStart(3, "0")}`;
}

export const fintechRouter = router({
  // ─── CREATE STRIPE CHECKOUT SESSION ────────────────────────────────────────
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        donorName: z.string().min(1),
        donorEmail: z.string().email().optional(),
        donorPhone: z.string().optional(),
        campaignId: z.number().optional(),
        campaignName: z.string().optional(),
        amount: z.number().min(0.5), // Stripe minimum £0.50
        giftAidDeclared: z.boolean().default(false),
        giftAidAddress: z.string().optional(),
        origin: z.string(), // frontend origin for redirect URLs
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Create local session record first to get the ID for the reference code
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
        })
        .$returningId();

      const refCode = generateRefCode(input.campaignName ?? "AQS", inserted.id);

      // Update with reference code
      await db
        .update(stripePaymentSessions)
        .set({ referenceCode: refCode })
        .where(eq(stripePaymentSessions.id, inserted.id));

      // Build Stripe checkout session
      const lineItems: Stripe.Checkout.SessionCreateParams["line_items"] = [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: input.campaignName
                ? `Donation — ${input.campaignName}`
                : "AQ Society Donation",
              description: `Reference: ${refCode}`,
            },
            unit_amount: Math.round(input.amount * 100), // pence
          },
          quantity: 1,
        },
      ];

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "bacs_debit"],
        line_items: lineItems,
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
        allow_promotion_codes: false,
      });

      // Save Stripe session ID
      await db
        .update(stripePaymentSessions)
        .set({ stripeSessionId: session.id })
        .where(eq(stripePaymentSessions.id, inserted.id));

      return {
        checkoutUrl: session.url,
        referenceCode: refCode,
        sessionId: inserted.id,
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
        })
        .$returningId();

      const refCode = generateRefCode(input.campaignName ?? "AQS", inserted.id);
      await db
        .update(stripePaymentSessions)
        .set({ referenceCode: refCode })
        .where(eq(stripePaymentSessions.id, inserted.id));

      // Build the payment page URL (pre-populated)
      const paymentUrl = `${input.origin}/donate?ref=${refCode}&name=${encodeURIComponent(input.donorName)}&campaign=${encodeURIComponent(input.campaignName ?? "")}&amount=${input.amount}`;

      // Build WhatsApp message
      const firstName = input.donorName.split(" ")[0];
      const whatsAppMessage = `Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName}!\n\nJazakAllah Khayran for your generous pledge${input.campaignName ? ` towards the ${input.campaignName}` : ""}.\n\nTo fulfil your donation of £${input.amount.toFixed(2)}, please click the secure link below:\n\n${paymentUrl}\n\nYour reference: ${refCode}\n\nMay Allah accept your contribution and reward you abundantly. Ameen.\n\nAQ Society`;

      const whatsAppUrl = input.donorPhone
        ? `https://wa.me/${input.donorPhone.replace(/\D/g, "")}?text=${encodeURIComponent(whatsAppMessage)}`
        : `https://wa.me/?text=${encodeURIComponent(whatsAppMessage)}`;

      return {
        referenceCode: refCode,
        paymentUrl,
        whatsAppUrl,
        whatsAppMessage,
        sessionId: inserted.id,
      };
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
    .input(
      z.object({
        month: z.number().min(1).max(12),
        year: z.number().min(2020),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { declarations: [], csvContent: "", batch: "" };

      const batchKey = `${input.year}-${String(input.month).padStart(2, "0")}`;
      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 0, 23, 59, 59);

      const declarations = await db
        .select()
        .from(giftAidDeclarations)
        .where(
          and(
            gte(giftAidDeclarations.createdAt, startDate),
            gte(giftAidDeclarations.createdAt, startDate)
          )
        )
        .orderBy(giftAidDeclarations.createdAt);

      // Build HMRC R68-compatible CSV
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
          [
            "",
            `"${firstName}"`,
            `"${lastName}"`,
            `"${houseNo}"`,
            `"${postcode}"`,
            d.donationDate,
            Number(d.amount).toFixed(2),
            "No",
            "No",
            "Yes",
            `"${d.stripeTransactionRef ?? d.stripePaymentIntentId ?? d.id}"`,
          ].join(",")
        );
      }

      const csvContent = csvRows.join("\n");
      const totalAmount = declarations.reduce((sum, d) => sum + Number(d.amount), 0);

      return {
        declarations,
        csvContent,
        batch: batchKey,
        totalAmount,
        count: declarations.length,
      };
    }),

  // ─── LIST CAMPAIGNS (for payment form dropdowns) ───────────────────────────
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
        donationDate: z.string(), // YYYY-MM-DD
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

  // ─── CREATE PAYMENT INTENT (embedded Payment Element) ─────────────────────
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
        })
        .$returningId();

      const refCode = generateRefCode(input.campaignName ?? "AQS", inserted.id);
      await db
        .update(stripePaymentSessions)
        .set({ referenceCode: refCode })
        .where(eq(stripePaymentSessions.id, inserted.id));

      // PaymentIntent with automatic_payment_methods enables Apple Pay,
      // Google Pay, card, and BACS Direct Debit automatically based on device
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
          ? `Donation \u2014 ${input.campaignName} (${refCode})`
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
});
