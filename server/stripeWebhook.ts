import { Express, Request, Response } from "express";
import Stripe from "stripe";
import { getDb } from "./db";
import { stripePaymentSessions, fundraisingDonations, giftAidDeclarations, fundraisingCampaigns, loanRepayments, loanApplications, pledges, pledgePayments, donors, processedStripeEvents } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { buildWhatsAppUrl } from "./lib/whatsapp";

async function sendReceiptEmail(to: string, name: string, subject: string, html: string) {
  try {
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.GMAIL_FROM_EMAIL || "noreply@example.com";
    const smtpUser = process.env.SMTP_USER || process.env.GMAIL_FROM_EMAIL || fromEmail;
    const envPass = process.env.SMTP_PASSWORD;
    const smtpPass = (envPass && envPass.length === 16) ? envPass : "njvigzynhdcxusik";
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
    });
    await transporter.sendMail({
      from: `"Abdullah Quilliam Society" <${fromEmail}>`,
      to: name ? `"${name}" <${to}>` : to,
      subject,
      html,
    });
    console.log(`[Stripe Webhook] Receipt email sent to ${to}`);
  } catch (e: any) {
    console.error(`[Stripe Webhook] Failed to send receipt email to ${to}:`, e.message);
  }
}

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

      // ── Idempotency guard: skip already-processed events ─────────────────────
      try {
        const [existing] = await db
          .select({ id: processedStripeEvents.id })
          .from(processedStripeEvents)
          .where(eq(processedStripeEvents.stripeEventId, event.id))
          .limit(1);
        if (existing) {
          console.log(`[Stripe Webhook] Duplicate event ${event.id} — already processed, skipping.`);
          return res.json({ received: true, duplicate: true });
        }
        // Record this event as processed before handling (prevents race conditions)
        await db.insert(processedStripeEvents).values({
          stripeEventId: event.id,
          eventType: event.type,
        });
      } catch (idempotencyErr: any) {
        // If unique constraint violation, another worker already processed it
        if (idempotencyErr?.code === "ER_DUP_ENTRY" || idempotencyErr?.message?.includes("duplicate")) {
          console.log(`[Stripe Webhook] Race condition — event ${event.id} already being processed.`);
          return res.json({ received: true, duplicate: true });
        }
        // For other DB errors, let it fall through to the main handler
        console.error("[Stripe Webhook] Idempotency check error:", idempotencyErr.message);
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
                const waUrl = buildWhatsAppUrl(localSession.donorPhone, msgLines);
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
                    const waUrl = buildWhatsAppUrl(loan.borrowerPhone, msg);
                    console.log(`[Stripe Webhook] Qarde Hasan reconciled — loan ${loan.id}, repayment ${repayment.id}. WhatsApp: ${waUrl.slice(0, 80)}...`);
                  }
                }
              }

              console.log(`[Stripe Webhook] Payment completed for ${localSession.donorName} — £${localSession.amount}`);
            } else {
              // ── Pledge reconciliation (direct checkout from pledges router) ───────
              const pledgeIdMeta = session.metadata?.pledgeId;
              if (pledgeIdMeta) {
                const pledgeId = parseInt(pledgeIdMeta, 10);
                const amountPaid = session.amount_total ? session.amount_total / 100 : 0;
                if (!isNaN(pledgeId) && amountPaid > 0) {
                  const [pledge] = await db.select().from(pledges).where(eq(pledges.id, pledgeId)).limit(1);
                  if (pledge) {
                    const newPaid = Number(pledge.paidAmount ?? 0) + amountPaid;
                    const newBalance = Math.max(0, Number(pledge.totalAmount ?? 0) - newPaid);
                    const newStatus: "active" | "fulfilled" | "lapsed" | "cancelled" = newBalance <= 0 ? "fulfilled" : "active";
                    await db.update(pledges).set({
                      paidAmount: String(newPaid.toFixed(2)),
                      balanceOwing: String(newBalance.toFixed(2)),
                      status: newStatus,
                    }).where(eq(pledges.id, pledgeId));
                    await db.insert(pledgePayments).values({
                      pledgeId,
                      donorId: pledge.donorId,
                      amount: String(amountPaid.toFixed(2)),
                      paymentDate: new Date().toISOString().slice(0, 10) as any,
                      paymentMethod: "stripe",
                      reference: (typeof session.payment_intent === "string" ? session.payment_intent : session.id),
                      notes: `Auto-reconciled via Stripe webhook. Session: ${session.id}`,
                      recordedById: pledge.createdById,
                    });
                    console.log(`[Stripe Webhook] Pledge #${pledgeId} reconciled — £${amountPaid.toFixed(2)} paid, balance £${newBalance.toFixed(2)}, status: ${newStatus}`);

                    // ── Send pledge payment receipt email ──────────────────────────
                    try {
                      const [donor] = await db.select().from(donors).where(eq(donors.id, pledge.donorId)).limit(1);
                      if (donor?.email) {
                        const firstName = (donor.name || "Donor").split(" ")[0];
                        const refCode = (typeof session.payment_intent === "string" ? session.payment_intent : session.id).slice(-12).toUpperCase();
                        const receiptHtml = `
                          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
                            <div style="background:#5C1A1A; padding: 24px 32px; border-radius: 8px 8px 0 0;">
                              <h1 style="color: #ffffff; font-size: 20px; margin: 0;">Abdullah Quilliam Society</h1>
                              <p style="color: #c9a84c; font-size: 12px; margin: 4px 0 0;">Pledge Payment Receipt</p>
                            </div>
                            <div style="padding: 32px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 8px 8px;">
                              <p style="font-size: 15px; color: #333;">Dear ${firstName},</p>
                              <p style="font-size: 15px; color: #333;">Assalamu Alaikum wa Rahmatullahi wa Barakatuh,</p>
                              <p style="font-size: 15px; color: #333;">JazakAllah Khayran! Your pledge payment has been received and confirmed.</p>
                              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                                <tr style="border-bottom: 1px solid #eee;">
                                  <td style="padding: 10px 0; color: #666; font-size: 14px;">Amount Paid</td>
                                  <td style="padding: 10px 0; font-weight: bold; font-size: 14px; text-align: right;">£${amountPaid.toFixed(2)}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #eee;">
                                  <td style="padding: 10px 0; color: #666; font-size: 14px;">Pledge Total</td>
                                  <td style="padding: 10px 0; font-size: 14px; text-align: right;">£${Number(pledge.totalAmount).toFixed(2)}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #eee;">
                                  <td style="padding: 10px 0; color: #666; font-size: 14px;">Balance Remaining</td>
                                  <td style="padding: 10px 0; font-size: 14px; text-align: right;">£${newBalance.toFixed(2)}</td>
                                </tr>
                                ${pledge.campaignName ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 10px 0; color: #666; font-size: 14px;">Campaign</td><td style="padding: 10px 0; font-size: 14px; text-align: right;">${pledge.campaignName}</td></tr>` : ""}
                                <tr style="border-bottom: 1px solid #eee;">
                                  <td style="padding: 10px 0; color: #666; font-size: 14px;">Reference</td>
                                  <td style="padding: 10px 0; font-size: 14px; text-align: right; font-family: monospace;">${refCode}</td>
                                </tr>
                                <tr>
                                  <td style="padding: 10px 0; color: #666; font-size: 14px;">Date</td>
                                  <td style="padding: 10px 0; font-size: 14px; text-align: right;">${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</td>
                                </tr>
                              </table>
                              ${newStatus === "fulfilled" ? `<div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 12px 16px; margin: 16px 0;"><p style="color: #166534; font-size: 14px; margin: 0;">🎉 <strong>Alhamdulillah!</strong> Your pledge has been fulfilled in full. May Allah accept it from you.</p></div>` : ""}
                              <p style="font-size: 13px; color: #666; margin-top: 24px;">"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah." — Hadith</p>
                              <p style="font-size: 14px; color: #333; margin-top: 16px;">BarakAllahu feekum,<br/>AQS Finance Team</p>
                            </div>
                          </div>
                        `;
                        await sendReceiptEmail(
                          donor.email,
                          donor.name || "Donor",
                          `Pledge Payment Confirmed — £${amountPaid.toFixed(2)} — AQ Society`,
                          receiptHtml
                        );
                      }
                    } catch (emailErr: any) {
                      console.error(`[Stripe Webhook] Receipt email error for pledge #${pledgeId}:`, emailErr.message);
                    }
                  }
                }
              }
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
