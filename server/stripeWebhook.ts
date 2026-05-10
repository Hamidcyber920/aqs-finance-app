import { Express, Request, Response } from "express";
import Stripe from "stripe";
import { getDb } from "./db";
import { stripePaymentSessions, fundraisingDonations, giftAidDeclarations, fundraisingCampaigns, loanRepayments, loanApplications } from "../drizzle/schema";
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
                // Split donor name into title/first/surname for HMRC R68
                const nameParts = localSession.donorName.trim().split(" ");
                const donorSurname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
                const donorFirstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : "";
                const consentText = `I am a UK taxpayer and understand that if I pay less Income Tax and/or Capital Gains Tax than the amount of Gift Aid claimed on all my donations in that tax year it is my responsibility to pay any difference. I confirm this donation was made by me under the Gift Aid scheme. Electronic declaration made via AQ Society online payment system under the UK Electronic Communications Act 2000.`;
                await db.insert(giftAidDeclarations).values({
                  donorName: localSession.donorName,
                  donorTitle: (session.metadata?.donor_title as string) ?? undefined,
                  donorFirstName,
                  donorSurname,
                  donorEmail: localSession.donorEmail ?? undefined,
                  donorAddress: localSession.giftAidAddress ?? undefined,
                  donorHouseNumber: (session.metadata?.donor_house_number as string) ?? undefined,
                  donorPostcode: (session.metadata?.donor_postcode as string) ?? undefined,
                  amount: localSession.amount,
                  donationDate: new Date().toISOString().split("T")[0] as any,
                  campaignName: localSession.campaignName ?? undefined,
                  stripePaymentIntentId: paymentIntentId ?? undefined,
                  stripeTransactionRef: session.id,
                  // HMRC Unique Reference Number = Stripe payment_intent ID
                  uniqueReferenceNumber: paymentIntentId ?? session.id,
                  // Electronic Communications Act 2000 audit
                  donorIpAddress: (session.customer_details?.address?.country === "GB" ? session.metadata?.donor_ip : undefined) ?? undefined,
                  consentTimestamp: new Date(),
                  consentStatement: consentText,
                  declarationMethod: "online_stripe",
                });
              }

              // Generate Islamic WhatsApp thank-you receipt URL (for admin to send)
              if (localSession.donorPhone) {
                const firstName = localSession.donorName.split(" ")[0];
                const refCode = localSession.referenceCode ?? session.id.slice(-8).toUpperCase();
                const hadith = "The Prophet ﷺ said: 'Whoever builds a house for Allah, Allah will build for him a house in Paradise.' (Bukhari & Muslim)";
                const msgLines = [
                  `Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName} 🌿`,
                  ``,
                  `JazakAllah Khayran for your generous donation to AQ Society!`,
                  ``,
                  `🕌 Campaign: ${localSession.campaignName ?? "AQ Society"}`,
                  `💷 Amount: £${Number(localSession.amount).toFixed(2)}`,
                  `🔖 Reference: ${refCode}`,
                  localSession.giftAidDeclared ? `✅ Gift Aid: Declared (25% uplift)` : ``,
                  ``,
                  `📖 ${hadith}`,
                  ``,
                  `May Allah accept your sadaqah and grant you and your family the highest ranks in Jannah. Ameen. 🤲`,
                  ``,
                  `— AQ Society Finance Team`,
                ].filter(Boolean).join("\n");
                const cleaned = localSession.donorPhone.replace(/\D/g, "");
                const waNumber = cleaned.startsWith("0") ? "44" + cleaned.slice(1) : cleaned;
                const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(msgLines)}`;
                console.log(`[Stripe Webhook] WhatsApp receipt URL for ${localSession.donorName}: ${waUrl.slice(0, 100)}...`);
                // Mark thank-you as ready to send
                await db
                  .update(stripePaymentSessions)
                  .set({ thankYouWhatsAppSentAt: new Date() })
                  .where(eq(stripePaymentSessions.id, localSession.id));
              }

              // ── Qarde Hasan reconciliation ──────────────────────────────────────────
              if (localSession.loanRepaymentId) {
                await db
                  .update(loanRepayments)
                  .set({
                    status: "paid",
                    receivedConfirmedAt: new Date(),
                    notes: `Auto-reconciled via Stripe webhook. Payment Intent: ${paymentIntentId ?? session.id}`,
                  })
                  .where(eq(loanRepayments.id, localSession.loanRepaymentId));

                // Fetch loan application for borrower contact details
                const [repayment] = await db
                  .select()
                  .from(loanRepayments)
                  .where(eq(loanRepayments.id, localSession.loanRepaymentId));
                if (repayment?.loanId) {
                  const [loan] = await db
                    .select()
                    .from(loanApplications)
                    .where(eq(loanApplications.id, repayment.loanId));
                  if (loan?.borrowerPhone) {
                    const firstName = loan.borrowerName.split(" ")[0];
                    const monthLabel = repayment.month && repayment.year
                      ? `${new Date(repayment.year, (repayment.month ?? 1) - 1).toLocaleString("en-GB", { month: "long", year: "numeric" })}`
                      : "this month";
                    const hadith = "The Prophet ﷺ said: 'The best of people are those who are most beneficial to others.' (Al-Mu'jam Al-Awsat)";
                    const msg = [
                      `Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName} 🌿`,
                      ``,
                      `JazakAllah Khayran! Your Qarde Hasan repayment for ${monthLabel} has been received and confirmed.`,
                      ``,
                      `💷 Amount: £${Number(localSession.amount).toFixed(2)}`,
                      `🔖 Reference: ${localSession.referenceCode ?? paymentIntentId ?? session.id.slice(-8).toUpperCase()}`,
                      ``,
                      `📖 ${hadith}`,
                      ``,
                      `May Allah bless you and your family abundantly. Ameen. 🤲`,
                      ``,
                      `— AQ Society Finance Team`,
                    ].join("\n");
                    const cleaned = loan.borrowerPhone.replace(/\D/g, "");
                    const waNumber = cleaned.startsWith("0") ? "44" + cleaned.slice(1) : cleaned;
                    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
                    console.log(`[Stripe Webhook] Qarde Hasan reconciled — loan ${loan.id}, repayment ${repayment.id}. WhatsApp: ${waUrl.slice(0, 80)}...`);
                  }
                }
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
