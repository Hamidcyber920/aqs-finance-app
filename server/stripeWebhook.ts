import { Express, Request, Response } from "express";
import Stripe from "stripe";
import { getDb } from "./db";
import { stripePaymentSessions, fundraisingDonations, giftAidDeclarations, fundraisingCampaigns } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2026-04-22.dahlia",
});

export function registerStripeWebhook(app: Express) {
  // Must use raw body for webhook signature verification
  app.post(
    "/api/stripe/webhook",
    // express.raw is registered before express.json in index.ts
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"];
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(
          (req as any).rawBody ?? req.body,
          sig as string,
          webhookSecret
        );
      } catch (err: any) {
        console.error("[Stripe Webhook] Signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      // Test event passthrough
      if (event.id.startsWith("evt_test_")) {
        console.log("[Stripe Webhook] Test event detected, returning verification response");
        return res.json({ verified: true });
      }

      const db = await getDb();
      if (!db) {
        console.error("[Stripe Webhook] Database not available");
        return res.status(500).json({ error: "Database unavailable" });
      }

      try {
        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            const paymentIntentId = typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id;

            // Find our local session record by stripeSessionId
            const [localSession] = await db
              .select()
              .from(stripePaymentSessions)
              .where(eq(stripePaymentSessions.stripeSessionId, session.id));

            if (localSession) {
              // Mark as completed
              await db
                .update(stripePaymentSessions)
                .set({
                  status: "completed",
                  stripePaymentIntentId: paymentIntentId ?? null,
                  paymentMethod: session.payment_method_types?.[0] ?? null,
                  webhookConfirmedAt: new Date(),
                })
                .where(eq(stripePaymentSessions.id, localSession.id));

              // Create a fundraising donation record if linked to a campaign
              if (localSession.campaignId && localSession.amount) {
                const [donation] = await db
                  .insert(fundraisingDonations)
                  .values({
                    campaignId: localSession.campaignId,
                    donorName: localSession.donorName,
                    donorEmail: localSession.donorEmail ?? undefined,
                    donorPhone: localSession.donorPhone ?? undefined,
                    amount: localSession.amount,
                    paymentMethod: "online",
                    thankYouSent: false,
                    notes: `Stripe payment: ${paymentIntentId ?? session.id}`,
                  })
                  .$returningId();

                // Update campaign total
                await db
                  .update(fundraisingCampaigns)
                  .set({
                    currentAmount: sql`currentAmount + ${localSession.amount}`,
                  })
                  .where(eq(fundraisingCampaigns.id, localSession.campaignId));

                // Link donation back to session
                await db
                  .update(stripePaymentSessions)
                  .set({ fundraisingDonationId: donation.id })
                  .where(eq(stripePaymentSessions.id, localSession.id));
              }

              // Create Gift Aid declaration if declared
              if (localSession.giftAidDeclared && localSession.amount) {
                await db.insert(giftAidDeclarations).values({
                  donorName: localSession.donorName,
                  donorEmail: localSession.donorEmail ?? undefined,
                  donorAddress: localSession.giftAidAddress ?? undefined,
                  amount: localSession.amount,
                  donationDate: new Date().toISOString().split("T")[0] as any,
                  campaignName: localSession.campaignName ?? undefined,
                  stripePaymentIntentId: paymentIntentId ?? undefined,
                  stripeTransactionRef: session.id,
                  declarationMethod: "online_stripe",
                });
              }

              console.log(`[Stripe Webhook] Payment completed for ${localSession.donorName} — £${localSession.amount}`);
            }
            break;
          }

          case "payment_intent.payment_failed": {
            const pi = event.data.object as Stripe.PaymentIntent;
            await db
              .update(stripePaymentSessions)
              .set({ status: "failed" })
              .where(eq(stripePaymentSessions.stripePaymentIntentId, pi.id));
            break;
          }

          default:
            console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        }
      } catch (err) {
        console.error("[Stripe Webhook] Processing error:", err);
        return res.status(500).json({ error: "Webhook processing failed" });
      }

      res.json({ received: true });
    }
  );
}
