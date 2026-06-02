/**
 * Scheduled Jobs — AQ Society Finance System
 *
 * 1. Weekly Repayment Alert (every Monday 08:00 UK time)
 *    Sends an email to Mumin Khan, Farid Ahmed, Dr Abdul Hamid, Galib Khan
 *    listing all Qarde Hasan repayments due within the next 4 weeks.
 *
 * 2. Monthly Trustee Report (1st of every month, 08:00 UK time)
 *    Sends a full loan status summary by email to all active trustees.
 */

import cron from "node-cron";
import nodemailer from "nodemailer";
import Stripe from "stripe";
import { getDb } from "./db";
import { loanRepayments, pledges, donors, fundraisingDonations, voiceSessions, accommodationTenants, invoices } from "../drizzle/schema";
import { eq, and, lte, gte, or, sql } from "drizzle-orm";
import { setGmailLastSyncedAt } from "./routers/commsInbox";
import { fmtDate, fmtDateLong } from "./dateUtils";

const stripeScheduler = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2026-04-22.dahlia" as any });

// ─── Email helper ─────────────────────────────────────────────────────────────

async function sendEmail(to: string, name: string, subject: string, html: string) {
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
}

// ─── Staff recipients for weekly alert ───────────────────────────────────────

const WEEKLY_ALERT_RECIPIENTS = [
  { name: "Mumin Khan", email: "meds.mumin@gmail.com" },
  { name: "Mr Farid Ahmed", email: "fariddixy@gmail.com" },
  { name: "Dr Abdul Hamid", email: "ahamid4@gmail.com" },
  { name: "Mr Galib Khan", email: "khan.galib@gmail.com" },
];

// ─── Loan data helpers ────────────────────────────────────────────────────────

async function getActiveLoansWithRepayments() {
  const db = await getDb();
  if (!db) return [];
  const { loanApplications } = await import("../drizzle/schema");
  const loans = await db.select().from(loanApplications)
    .where(sql`${loanApplications.status} IN ('approved', 'active')`);
  const results = await Promise.all(loans.map(async (loan: any) => {
    const reps = await db.select().from(loanRepayments)
      .where(eq((loanRepayments as any).loanId, loan.id));
    return { ...loan, repayments: reps };
  }));
  return results;
}

async function getActiveTrustees() {
  const db = await getDb();
  if (!db) return [];
  const { trustees } = await import("../drizzle/schema");
  const all = await db.select().from(trustees);
  return all.filter((t: any) => t.isActive !== false && t.email);
}

// ─── Weekly Repayment Alert ───────────────────────────────────────────────────

async function sendWeeklyRepaymentAlert() {
  console.log("[Scheduled] Running weekly repayment alert...");
  try {
    const loans = await getActiveLoansWithRepayments();
    const now = new Date();
    const fourWeeksLater = new Date(now);
    fourWeeksLater.setDate(fourWeeksLater.getDate() + 28);

    // Find instalments due within 4 weeks
    const dueItems: { borrowerName: string; borrowerEmail: string; borrowerPhone: string; amount: number; dueDate: Date; loanId: number }[] = [];

    for (const loan of loans) {
      const termMonths = loan.termUnit === "years"
        ? (loan.termValue ?? 6) * 12
        : (loan.termValue ?? loan.termMonths ?? 6);
      const monthly = Number(loan.amount ?? 0) / termMonths;
      const startDate = loan.startDate ? new Date(loan.startDate) : new Date(loan.createdAt ?? now);
      const paidCount = (loan.repayments ?? []).filter((r: any) => r.trusteeApprovedAt).length;

      for (let m = paidCount + 1; m <= termMonths; m++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + m);
        if (dueDate > now && dueDate <= fourWeeksLater) {
          dueItems.push({
            borrowerName: loan.borrowerName ?? "Unknown",
            borrowerEmail: loan.borrowerEmail ?? "",
            borrowerPhone: loan.borrowerPhone ?? "",
            amount: monthly,
            dueDate,
            loanId: loan.id,
          });
        }
      }
    }

    if (dueItems.length === 0) {
      console.log("[Scheduled] No repayments due in next 4 weeks — skipping alert.");
      return;
    }

    // Sort by due date
    dueItems.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    const totalDue = dueItems.reduce((s, d) => s + d.amount, 0);
    const rows = dueItems.map(d => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${d.borrowerName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${d.borrowerEmail || "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${d.borrowerPhone || "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#5C1A1A;">£${d.amount.toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${d.dueDate}</td>
      </tr>`).join("");

    const reportDate = fmtDate(now);

    for (const recipient of WEEKLY_ALERT_RECIPIENTS) {
      // Full respectful salutation — recipient.name already includes title (e.g. "Dr Abdul Hamid")
      const recipientSalutation = recipient.name;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;">
          <div style="background:#5C1A1A;padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;">Abdullah Quilliam Society</h1>
            <p style="color:#c9a84c;margin:4px 0 0;">Qarde Hasan — Weekly Repayment Alert</p>
          </div>
          <div style="padding:24px;background:#fff;">
            <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${recipientSalutation},</p>
            <p>May Allah bless you and your family with barakah. This is your weekly Qarde Hasan repayment alert for <strong>${reportDate}</strong>.</p>
            <p>The following Amanah repayments are due within the next <strong>4 weeks</strong>:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
              <thead>
                <tr style="background:#f0fdf4;">
                  <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;">Donor / Lender</th>
                  <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;">Email</th>
                  <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;">Phone</th>
                  <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;">Amount Due</th>
                  <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;">Due Date</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr style="background:#f9fafb;">
                  <td colspan="3" style="padding:10px 12px;font-weight:700;font-size:13px;">Total Due</td>
                  <td colspan="2" style="padding:10px 12px;font-weight:800;font-size:15px;color:#5C1A1A;">£${totalDue.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
            <p>Please follow up with the respective donors and update the system once repayments are received. JazakAllahu Khayran for your continued dedication to the Rimmers Building Project.</p>
            <p>The Prophet (PBUH) said: <em>"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah."</em></p>
            <p>Wassalamu alaikum,<br><strong>Dr Abdul Hamid (Chair)</strong><br>On behalf of the Board of Trustees<br><em>Abdullah Quilliam Society</em></p>
          </div>
          <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666;">
            JazakAllahu Khayran — AQ Society Automated Finance Alert
          </div>
        </div>`;

      await sendEmail(recipient.email, recipient.name, `Weekly Qarde Hasan Alert — ${dueItems.length} Repayment(s) Due — AQ Society`, html)
        .then(() => console.log(`[Scheduled] Weekly alert sent to ${recipient.email}`))
        .catch(e => console.error(`[Scheduled] Failed to send weekly alert to ${recipient.email}:`, e));
    }
  } catch (e) {
    console.error("[Scheduled] Weekly repayment alert failed:", e);
  }
}

// ─── Monthly Trustee Report ───────────────────────────────────────────────────

async function sendMonthlyTrusteeReport() {
  console.log("[Scheduled] Running monthly trustee report...");
  try {
    const loans = await getActiveLoansWithRepayments();
    const trustees = await getActiveTrustees();
    const now = new Date();
    const monthName = fmtDate(now);

    // Compute stats
    const totalLoaned = loans.reduce((s: number, l: any) => s + Number(l.amount ?? 0), 0);
    const totalOutstanding = loans.reduce((s: number, l: any) => {
      const paid = (l.repayments ?? []).filter((r: any) => r.trusteeApprovedAt).reduce((ps: number, r: any) => ps + Number(r.amount ?? 0), 0);
      return s + Math.max(0, Number(l.amount ?? 0) - paid);
    }, 0);
    const totalRepaid = totalLoaned - totalOutstanding;

    const loanRows = loans.map((l: any) => {
      const paid = (l.repayments ?? []).filter((r: any) => r.trusteeApprovedAt).reduce((ps: number, r: any) => ps + Number(r.amount ?? 0), 0);
      const outstanding = Math.max(0, Number(l.amount ?? 0) - paid);
      const termMonths = l.termUnit === "years" ? (l.termValue ?? 6) * 12 : (l.termValue ?? l.termMonths ?? 6);
      const paidCount = (l.repayments ?? []).filter((r: any) => r.trusteeApprovedAt).length;
      const overdueCount = (l.repayments ?? []).filter((r: any) => !r.trusteeApprovedAt && r.dueDate && new Date(r.dueDate) < now).length;
      const statusColor = overdueCount > 0 ? "#dc2626" : outstanding === 0 ? "#16a34a" : "#5C1A1A";
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${l.borrowerName ?? "Unknown"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">£${Number(l.amount).toFixed(2)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">£${paid.toFixed(2)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:${statusColor};">£${outstanding.toFixed(2)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${paidCount}/${termMonths}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:${overdueCount > 0 ? '#dc2626' : '#6b7280'};">${overdueCount > 0 ? `⚠ ${overdueCount} overdue` : "On track"}</td>
        </tr>`;
    }).join("");

    for (const trustee of trustees) {
      // Use full respectful salutation — fullName already includes title (e.g. "Dr Abdul Hamid")
      const trusteeSalutation = trustee.fullName ?? 'Trustee';
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;">
          <div style="background:#5C1A1A;padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;">Abdullah Quilliam Society</h1>
            <p style="color:#c9a84c;margin:4px 0 0;">Qarde Hasan — Monthly Trustee Report — ${monthName}</p>
          </div>
          <div style="padding:24px;background:#fff;">
            <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${trusteeSalutation},</p>
            <p>May Allah bless you with barakah and good health. Please find below the monthly Qarde Hasan Amanah report for <strong>${monthName}</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;background:#f0fdf4;border-radius:8px;">
              <tr><td style="padding:10px 16px;font-weight:700;">Total Borrowed</td><td style="padding:10px 16px;font-weight:800;font-size:16px;color:#5C1A1A;">£${totalLoaned.toFixed(2)}</td></tr>
              <tr><td style="padding:10px 16px;font-weight:700;">Total Repaid</td><td style="padding:10px 16px;font-weight:800;font-size:16px;color:#16a34a;">£${totalRepaid.toFixed(2)}</td></tr>
              <tr><td style="padding:10px 16px;font-weight:700;">Total Outstanding</td><td style="padding:10px 16px;font-weight:800;font-size:16px;color:#dc2626;">£${totalOutstanding.toFixed(2)}</td></tr>
              <tr><td style="padding:10px 16px;font-weight:700;">Active Loans</td><td style="padding:10px 16px;font-weight:800;font-size:16px;">${loans.length}</td></tr>
            </table>
            <h3 style="color:#5C1A1A;margin:24px 0 12px;font-size:15px;">Individual Loan Status</h3>
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead>
                <tr style="background:#f0fdf4;">
                  <th style="padding:10px 12px;text-align:left;font-size:10px;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;">Donor</th>
                  <th style="padding:10px 12px;text-align:left;font-size:10px;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;">Loaned</th>
                  <th style="padding:10px 12px;text-align:left;font-size:10px;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;">Repaid</th>
                  <th style="padding:10px 12px;text-align:left;font-size:10px;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;">Outstanding</th>
                  <th style="padding:10px 12px;text-align:left;font-size:10px;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;">Progress</th>
                  <th style="padding:10px 12px;text-align:left;font-size:10px;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;">Status</th>
                </tr>
              </thead>
              <tbody>${loanRows}</tbody>
            </table>
            <p style="margin-top:24px;">The Prophet (PBUH) said: <em>"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah."</em> May Allah (SWT) accept the Amanah of all our donors and reward them with Sadaqah Jariyah.</p>
            <p>JazakAllahu Khayran for your continued trust and oversight of the Rimmers Building Project.</p>
            <p>Wassalamu alaikum,<br><strong>Dr Abdul Hamid (Chair)</strong><br>On behalf of the Board of Trustees<br><em>Abdullah Quilliam Society</em></p>
          </div>
          <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666;">
            JazakAllahu Khayran — AQ Society Monthly Finance Report
          </div>
        </div>`;

      await sendEmail(trustee.email!, trustee.fullName ?? "Trustee", `Monthly Qarde Hasan Report — ${monthName} — AQ Society`, html)
        .then(() => console.log(`[Scheduled] Monthly report sent to ${trustee.email}`))
        .catch(e => console.error(`[Scheduled] Failed to send monthly report to ${trustee.email}:`, e));
    }
  } catch (e) {
    console.error("[Scheduled] Monthly trustee report failed:", e);
  }
}

// ─── Birthday Alert ──────────────────────────────────────────────────────────

async function sendBirthdayAlerts() {
  console.log("[Scheduled] Running birthday alert check...");
  try {
    const db = await getDb();
    if (!db) return;
    const { trustees } = await import("../drizzle/schema");
    const all = await db.select().from(trustees);
    const now = new Date();
    const todayMonth = now.getMonth() + 1; // 1-12
    const todayDay = now.getDate();

    const birthdayTrustees = all.filter((t: any) => {
      if (!t.dateOfBirth || !t.email || t.isActive === false) return false;
      const dob = new Date(t.dateOfBirth);
      return dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDay;
    });

    if (birthdayTrustees.length === 0) {
      console.log("[Scheduled] No birthdays today.");
      return;
    }

    for (const trustee of birthdayTrustees) {
      // Full respectful salutation — fullName already includes title (e.g. "Dr Abdul Hamid")
      const birthdaySalutation = trustee.fullName ?? 'Trustee';
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#5C1A1A;padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;">Abdullah Quilliam Society</h1>
            <p style="color:#c9a84c;margin:4px 0 0;">Birthday Mubarak 🎁</p>
          </div>
          <div style="padding:24px;background:#fff;">
            <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${birthdaySalutation},</p>
            <p style="font-size:18px;font-weight:700;color:#5C1A1A;">JazakAllahu Khayran — Wishing you a blessed birthday!</p>
            <p>May Allah (SWT) bless you with good health, happiness, barakah, and continued success in your service to the community. May this year bring you and your family immense joy and reward in both this world and the Hereafter.</p>
            <p>The Prophet (PBUH) said: <em>"Whoever is not grateful to people is not grateful to Allah."</em></p>
            <p>With warm Islamic greetings and du'as,<br><strong>The AQ Society Team</strong></p>
          </div>
          <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666;">
            JazakAllahu Khayran — Abdullah Quilliam Society
          </div>
        </div>`;

      await sendEmail(
        trustee.email!,
        trustee.fullName ?? birthdaySalutation,
        `Birthday Mubarak, ${birthdaySalutation}! 🎁 — AQ Society`,
        html
      )
        .then(() => console.log(`[Scheduled] Birthday email sent to ${trustee.email}`))
        .catch(e => console.error(`[Scheduled] Failed to send birthday email to ${trustee.email}:`, e));
    }
  } catch (e) {
    console.error("[Scheduled] Birthday alert failed:", e);
  }
}

// ─── Register cron jobs ───────────────────────────────────────────────────────

// ─── Daily unread digest ──────────────────────────────────────────────────────
async function sendUnreadEmailDigest() {
  try {
    const db = await getDb();
    if (!db) return;
    const { inboundEmails } = await import("../drizzle/schema");
    const { notifyOwner } = await import("./_core/notification");
    const { eq, inArray, gte } = await import("drizzle-orm");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const urgent = await db.select({ id: inboundEmails.id, subject: inboundEmails.subject, fromEmail: inboundEmails.fromEmail })
      .from(inboundEmails)
      .where(
        (inboundEmails as any).status ? 
          (inboundEmails as any).priority ?
            (await import("drizzle-orm")).and(
              eq(inboundEmails.status, "unread"),
              (await import("drizzle-orm")).inArray(inboundEmails.priority as any, ["urgent", "high"]),
              gte(inboundEmails.receivedAt, since)
            ) : eq(inboundEmails.status, "unread")
          : eq(inboundEmails.status, "unread")
      )
      .limit(20);
    if (urgent.length === 0) return;
    const lines = urgent.map((e: any) => `• [${e.id}] ${e.subject ?? "(no subject)"} — from ${e.fromEmail}`).join("\n");
    await notifyOwner({
      title: `📬 Daily Unread Digest — ${urgent.length} urgent/high email${urgent.length !== 1 ? "s" : ""}`,
      content: `The following unread urgent/high-priority emails arrived in the last 24 hours:\n\n${lines}`,
    });
    console.log(`[Scheduled] Unread digest sent: ${urgent.length} emails`);
  } catch (e) {
    console.error("[Scheduled] Unread digest failed:", e);
  }
}

export function registerScheduledJobs() {
  // Every Monday at 08:00 UK time (UTC+1 in summer = 07:00 UTC)
  // Using "0 7 * * 1" (07:00 UTC = 08:00 BST)
  cron.schedule("0 7 * * 1", () => {
    sendWeeklyRepaymentAlert().catch(console.error);
  }, { timezone: "Europe/London" });

  // 1st of every month at 08:00 UK time
  cron.schedule("0 8 1 * *", () => {
    sendMonthlyTrusteeReport().catch(console.error);
  }, { timezone: "Europe/London" });

   // Daily at 09:00 UK time — birthday alerts
  cron.schedule("0 9 * * *", () => {
    sendBirthdayAlerts().catch(console.error);
  }, { timezone: "Europe/London" });
  // Daily at 08:30 UK time — rent reminders (7-day due notice, 8-14 day overdue, 14+ day escalation)
  cron.schedule("30 8 * * *", () => {
    sendRentReminders().catch(console.error);
  }, { timezone: "Europe/London" });
  // Every Monday at 07:30 UK time — compliance digest to Dr. Hamid
  cron.schedule("30 7 * * 1", () => {
    sendComplianceDigest().catch(console.error);
  }, { timezone: "Europe/London" });

  // Every hour between 06:00 and 22:00 UK time — auto-sync Gmail inbox
  cron.schedule("0 6-22 * * *", () => {
    syncGmailInbox().catch(console.error);
  }, { timezone: "Europe/London" });

  // Daily at 08:00 UK time — unread urgent/high email digest
  cron.schedule("0 8 * * *", () => {
    sendUnreadEmailDigest().catch(console.error);
  }, { timezone: "Europe/London" });
  // Daily at 09:30 UK time — pledge reminders (7-day due notice + overdue)
  cron.schedule("30 9 * * *", () => {
    sendPledgeReminders().catch(console.error);
  }, { timezone: "Europe/London" });
  // Daily at 08:15 UK time — LBMW Gmail label pull with AI analysis
  cron.schedule("15 8 * * *", () => {
    runDailyLbmwGmailPull().catch(console.error);
  }, { timezone: "Europe/London" });
  // Daily at 07:00 UK time — utility contract renewal reminders (60-day warning)
  cron.schedule("0 7 * * *", () => {
    sendContractRenewalReminders().catch(console.error);
  }, { timezone: "Europe/London" });
  // Every Monday at 07:00 UK time — weekly cash flow payment digest
  cron.schedule("0 7 * * 1", () => {
    sendWeeklyCashFlowDigest().catch(console.error);
  }, { timezone: "Europe/London" });
  // Morning briefing for voice agent (daily 07:30)
  cron.schedule("30 7 * * *", () => {
    generateMorningBriefing().catch(console.error);
  }, { timezone: "Europe/London" });
  // 9am Calendar + Urgent Emails briefing email
  cron.schedule("0 9 * * *", () => {
    sendCalendarAndUrgentBriefing().catch(console.error);
  }, { timezone: "Europe/London" });
  console.log("[Scheduled] Jobs registered: weekly repayment alert (Mon 08:00) + monthly trustee report (1st 08:00) + birthday alerts (daily 09:00) + rent reminders (daily 08:30) + compliance digest (Mon 07:30) + Gmail sync (hourly 06-22) + unread digest (daily 08:00) + pledge reminders (daily 09:30) + LBMW Gmail pull (daily 08:15) + contract renewal reminders (daily 07:00) + weekly cashflow digest (Mon 07:00) + morning briefing (daily 07:30) + calendar & urgent briefing (daily 09:00)");
}
// Export for manual trigger from tRPC (admin use)
export { sendWeeklyRepaymentAlert, sendMonthlyTrusteeReport, sendBirthdayAlerts };

// ─── Pledge Reminders ────────────────────────────────────────────────────────
/**
 * Daily pledge reminder job (09:30 UK time):
 *  1. Pledges due within the next 7 days — send a gentle reminder
 *  2. Overdue pledges (nextDueDate < today, status = 'active') — send an overdue notice
 * Looks up the donor's email from the donors table via donorId.
 */
export async function sendPledgeReminders() {
  console.log("[Scheduled] Running pledge reminder check...");
  try {
    const db = await getDb();
    if (!db) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);
    // Format as YYYY-MM-DD for MySQL date column comparison
    const todayStr = today.toISOString().slice(0, 10);
    const in7DaysStr = in7Days.toISOString().slice(0, 10);
    // Fetch active pledges with nextDueDate <= 7 days from now (includes overdue)
    const activePledges = await db
      .select({
        id: pledges.id,
        donorId: pledges.donorId,
        donorName: pledges.donorName,
        totalAmount: pledges.totalAmount,
        balanceOwing: pledges.balanceOwing,
        nextDueDate: pledges.nextDueDate,
        campaignName: pledges.campaignName,
        isGiftAid: pledges.isGiftAid,
      })
      .from(pledges)
      .where(and(
        eq(pledges.status, "active"),
        lte(pledges.nextDueDate, in7DaysStr as any),
      ))
      .limit(200);
    if (!activePledges.length) {
      console.log("[Scheduled] Pledge reminders: no pledges due within 7 days.");
      return;
    }
    let sent = 0;
    let skipped = 0;
    for (const pledge of activePledges) {
      if (!pledge.nextDueDate) { skipped++; continue; }
      const dueDate = new Date(pledge.nextDueDate);
      const dueDateFormatted2 = fmtDateLong(dueDate);
      const isOverdue = dueDate < today;
      // Look up donor email
      let donorEmail: string | null = null;
      if (pledge.donorId) {
        const [donorRow] = await db
          .select({ email: donors.email })
          .from(donors)
          .where(eq(donors.id, pledge.donorId))
          .limit(1);
        donorEmail = donorRow?.email ?? null;
      }
      if (!donorEmail) { skipped++; continue; }
      const donorFirstName = (pledge.donorName ?? "Valued Donor").split(" ")[0];
      const dueDateFormatted = dueDateFormatted2;
      const balanceFormatted = `£${Number(pledge.balanceOwing ?? 0).toFixed(2)}`;
      const campaignLine = pledge.campaignName ? `<br/>Campaign: <strong>${pledge.campaignName}</strong>` : "";
      const giftAidLine = pledge.isGiftAid ? "<br/><em>Your pledge includes Gift Aid — JazakAllah Khayran for your generosity.</em>" : "";
      // Generate Stripe Checkout link for this pledge
      let paymentButtonHtml = "";
      try {
        if (process.env.STRIPE_SECRET_KEY && Number(pledge.balanceOwing ?? 0) >= 0.5) {
          const amountPence = Math.round(Number(pledge.balanceOwing ?? 0) * 100);
          const appUrl = process.env.VITE_APP_URL || "https://receiptapp-excmtodu.manus.space";
          const checkoutSession = await stripeScheduler.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{
              price_data: {
                currency: "gbp",
                unit_amount: amountPence,
                product_data: {
                  name: `Pledge Payment${pledge.campaignName ? ` — ${pledge.campaignName}` : ""}`,
                  description: `Pledge #${pledge.id} — ${pledge.donorName ?? "Donor"}`,
                },
              },
              quantity: 1,
            }],
            mode: "payment",
            customer_email: donorEmail,
            success_url: `${appUrl}/pledges?payment=success`,
            cancel_url: `${appUrl}/pledges`,
            metadata: { pledgeId: String(pledge.id), donorName: pledge.donorName ?? "" },
          });
          if (checkoutSession.url) {
            paymentButtonHtml = `<p style="text-align:center;margin:20px 0;"><a href="${checkoutSession.url}" style="background:#1a3c5e;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Pay Now — ${balanceFormatted}</a></p>`;
          }
        }
      } catch (stripeErr) {
        console.warn(`[Scheduled] Could not generate Stripe link for pledge ${pledge.id}:`, stripeErr);
      }
      const subject = isOverdue
        ? `Pledge Reminder — Overdue Payment | Abdullah Quilliam Society`
        : `Pledge Reminder — Payment Due ${dueDateFormatted} | Abdullah Quilliam Society`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="color:#1a3c5e;">Assalamu Alaikum, ${donorFirstName},</h2>
          <p>JazakAllah Khayran for your generous pledge to the Abdullah Quilliam Society.</p>
          ${
            isOverdue
              ? `<p style="color:#dc2626;"><strong>Your pledge payment of ${balanceFormatted} was due on ${dueDateFormatted} and is now overdue.</strong></p>`
              : `<p>This is a gentle reminder that your pledge payment of <strong>${balanceFormatted}</strong> is due on <strong>${dueDateFormatted}</strong>.</p>`
          }
          ${campaignLine}
          ${giftAidLine}
          <p>If you have already made this payment, please disregard this message.</p>
          ${paymentButtonHtml}
          <p>To discuss your pledge, please contact us at <a href="mailto:info@abdullahquilliam.org">info@abdullahquilliam.org</a>.</p>
          <br/>
          <p>Warm regards,<br/><strong>Abdullah Quilliam Society</strong><br/>Finance Team</p>
        </div>
      `;
      try {
        await sendEmail(donorEmail, pledge.donorName ?? "Donor", subject, html);
        sent++;
        console.log(`[Scheduled] Pledge reminder sent to ${donorEmail} (pledge #${pledge.id})`);
      } catch (e) {
        console.error(`[Scheduled] Pledge reminder failed for pledge ${pledge.id}:`, e);
        skipped++;
      }
    }
    console.log(`[Scheduled] Pledge reminders complete: ${sent} sent, ${skipped} skipped.`);
  } catch (e) {
    console.error("[Scheduled] Pledge reminders job failed:", e);
  }
}

// ─── Rent Reminders ───────────────────────────────────────────────────────────
/**
 * Daily rent reminder jobs:
 *  1. 7-day due notice — email tenants whose rent is due within 7 days
 *  2. 8-14 day overdue — escalating reminder to tenant
 *  3. 14+ day overdue — escalation notification to owner/managers
 */
export async function sendRentReminders() {
  console.log("[Scheduled] Running rent reminder check...");
  try {
    const db = await getDb();
    if (!db) return;
    const { accommodationRentPayments, accommodationTenants } = await import("../drizzle/schema");
    const { eq: eqOp, and: andOp, sql: sqlOp, or: orOp, isNull: isNullOp } = await import("drizzle-orm");
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const in7DaysStr = new Date(today.getTime() + 7 * 86400000).toISOString().split("T")[0];

    // ── 7-day due notice ──────────────────────────────────────────────────────
    const upcoming = await db.select({ payment: accommodationRentPayments, tenant: accommodationTenants })
      .from(accommodationRentPayments)
      .innerJoin(accommodationTenants, eqOp(accommodationRentPayments.tenantId, accommodationTenants.id))
      .where(andOp(
        sqlOp`${accommodationRentPayments.dueDate} >= ${todayStr}`,
        sqlOp`${accommodationRentPayments.dueDate} <= ${in7DaysStr}`,
        eqOp(accommodationRentPayments.status, "pending"),
        isNullOp(accommodationRentPayments.reminderSentAt),
      ));

    for (const row of upcoming) {
      const { tenant, payment } = row;
      if (!tenant.email) continue;
      const firstName = (tenant.fullName ?? "").split(" ")[0] ?? tenant.fullName ?? "Tenant";
      const dueDate = fmtDate(new Date(payment.dueDate as any));
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#5C1A1A;padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;">Abdullah Quilliam Society</h1>
            <p style="color:#c9a84c;margin:4px 0 0;">Rent Reminder</p>
          </div>
          <div style="padding:24px;background:#fff;">
            <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p>
            <p>This is a friendly reminder that your rent payment is due soon.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:8px;background:#f9f9f9;font-weight:600;">Period</td><td style="padding:8px;">${payment.periodLabel}</td></tr>
              <tr><td style="padding:8px;background:#f9f9f9;font-weight:600;">Amount Due</td><td style="padding:8px;font-size:18px;color:#5C1A1A;font-weight:700;">£${parseFloat(payment.amountDue as any).toFixed(2)}</td></tr>
              <tr><td style="padding:8px;background:#f9f9f9;font-weight:600;">Due Date</td><td style="padding:8px;">${dueDate}</td></tr>
            </table>
            <p>Please ensure your payment is made on time. If you have any questions, please contact us.</p>
            <p>JazakAllahu Khayran for your cooperation.</p>
            <p>Warm Islamic greetings,<br><strong>AQ Society Finance Team</strong></p>
          </div>
          <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666;">
            Abdullah Quilliam Society — Student Accommodation
          </div>
        </div>`;
      await sendEmail(tenant.email, tenant.fullName ?? firstName, `Rent Due in 7 Days — ${payment.periodLabel} — AQ Society`, html)
        .then(async () => {
          await db.update(accommodationRentPayments)
            .set({ reminderSentAt: new Date() })
            .where(eqOp(accommodationRentPayments.id, payment.id));
          console.log(`[Scheduled] 7-day rent reminder sent to ${tenant.email}`);
        })
        .catch(e => console.error(`[Scheduled] Failed to send rent reminder to ${tenant.email}:`, e));
    }

    // ── 8-14 day overdue reminder ─────────────────────────────────────────────
    const overdue8to14 = await db.select({ payment: accommodationRentPayments, tenant: accommodationTenants })
      .from(accommodationRentPayments)
      .innerJoin(accommodationTenants, eqOp(accommodationRentPayments.tenantId, accommodationTenants.id))
      .where(andOp(
        sqlOp`${accommodationRentPayments.dueDate} < ${todayStr}`,
        sqlOp`DATEDIFF(${todayStr}, ${accommodationRentPayments.dueDate}) BETWEEN 8 AND 14`,
        orOp(eqOp(accommodationRentPayments.status, "pending"), eqOp(accommodationRentPayments.status, "overdue")),
        isNullOp(accommodationRentPayments.overdueSentAt),
      ));

    for (const row of overdue8to14) {
      const { tenant, payment } = row;
      if (!tenant.email) continue;
      const firstName = (tenant.fullName ?? "").split(" ")[0] ?? tenant.fullName ?? "Tenant";
      const dueDate = fmtDate(new Date(payment.dueDate as any));
      const daysOverdue = Math.floor((today.getTime() - new Date(payment.dueDate as any).getTime()) / 86400000);
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#c0392b;padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;">Abdullah Quilliam Society</h1>
            <p style="color:#ffd;margin:4px 0 0;">Overdue Rent Notice</p>
          </div>
          <div style="padding:24px;background:#fff;">
            <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p>
            <p style="color:#c0392b;font-weight:600;">Your rent payment is now ${daysOverdue} days overdue.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:8px;background:#fff0f0;font-weight:600;">Period</td><td style="padding:8px;">${payment.periodLabel}</td></tr>
              <tr><td style="padding:8px;background:#fff0f0;font-weight:600;">Amount Due</td><td style="padding:8px;font-size:18px;color:#c0392b;font-weight:700;">£${parseFloat(payment.amountDue as any).toFixed(2)}</td></tr>
              <tr><td style="padding:8px;background:#fff0f0;font-weight:600;">Original Due Date</td><td style="padding:8px;">${dueDate}</td></tr>
              <tr><td style="padding:8px;background:#fff0f0;font-weight:600;">Days Overdue</td><td style="padding:8px;color:#c0392b;font-weight:700;">${daysOverdue} days</td></tr>
            </table>
            <p>Please make payment as soon as possible. If you are experiencing difficulties, please contact us immediately.</p>
            <p>JazakAllahu Khayran,<br><strong>AQ Society Finance Team</strong></p>
          </div>
          <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666;">
            Abdullah Quilliam Society — Student Accommodation
          </div>
        </div>`;
      await sendEmail(tenant.email, tenant.fullName ?? firstName, `OVERDUE: Rent Payment ${daysOverdue} Days Late — ${payment.periodLabel} — AQ Society`, html)
        .then(async () => {
          await db.update(accommodationRentPayments)
            .set({ status: "overdue", overdueSentAt: new Date() })
            .where(eqOp(accommodationRentPayments.id, payment.id));
          console.log(`[Scheduled] 8-14 day overdue notice sent to ${tenant.email}`);
        })
        .catch(e => console.error(`[Scheduled] Failed to send overdue notice to ${tenant.email}:`, e));
    }

    // ── 14+ day escalation to owner/managers ──────────────────────────────────
    const overdue14plus = await db.select({ payment: accommodationRentPayments, tenant: accommodationTenants })
      .from(accommodationRentPayments)
      .innerJoin(accommodationTenants, eqOp(accommodationRentPayments.tenantId, accommodationTenants.id))
      .where(andOp(
        sqlOp`${accommodationRentPayments.dueDate} < ${todayStr}`,
        sqlOp`DATEDIFF(${todayStr}, ${accommodationRentPayments.dueDate}) >= 14`,
        orOp(eqOp(accommodationRentPayments.status, "pending"), eqOp(accommodationRentPayments.status, "overdue")),
        isNullOp(accommodationRentPayments.escalationSentAt),
      ));

    if (overdue14plus.length > 0) {
      const { notifyOwner } = await import("./_core/notification");
      const rows = overdue14plus.map(r => `${r.tenant.fullName} — ${r.payment.periodLabel} — £${parseFloat(r.payment.amountDue as any).toFixed(2)} (${Math.floor((today.getTime() - new Date(r.payment.dueDate as any).getTime()) / 86400000)} days overdue)`).join("\n");
      await notifyOwner({
        title: `⚠️ ${overdue14plus.length} Rent Payment(s) 14+ Days Overdue`,
        content: `The following student accommodation rent payments are 14+ days overdue and require immediate attention:\n\n${rows}\n\nPlease review in the Student Accommodation section.`,
      }).catch(e => console.error("[Scheduled] Failed to send escalation notification:", e));

      for (const row of overdue14plus) {
        const { tenant, payment } = row;
        if (!tenant.email) continue;
        const firstName = (tenant.fullName ?? "").split(" ")[0] ?? tenant.fullName ?? "Tenant";
        const daysOverdue = Math.floor((today.getTime() - new Date(payment.dueDate as any).getTime()) / 86400000);
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#7b241c;padding:24px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:20px;">Abdullah Quilliam Society</h1>
              <p style="color:#ffd;margin:4px 0 0;">URGENT: Rent Escalation Notice</p>
            </div>
            <div style="padding:24px;background:#fff;">
              <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p>
              <p style="color:#7b241c;font-weight:700;font-size:16px;">URGENT: Your rent payment is ${daysOverdue} days overdue.</p>
              <p>This matter has been escalated to the management and trustees of Abdullah Quilliam Society. Please contact us immediately.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:8px;background:#fff0f0;font-weight:600;">Period</td><td style="padding:8px;">${payment.periodLabel}</td></tr>
                <tr><td style="padding:8px;background:#fff0f0;font-weight:600;">Amount Due</td><td style="padding:8px;font-size:18px;color:#7b241c;font-weight:700;">£${parseFloat(payment.amountDue as any).toFixed(2)}</td></tr>
                <tr><td style="padding:8px;background:#fff0f0;font-weight:600;">Days Overdue</td><td style="padding:8px;color:#7b241c;font-weight:700;">${daysOverdue} days</td></tr>
              </table>
              <p>Please contact us urgently at your earliest convenience.</p>
              <p>JazakAllahu Khayran,<br><strong>AQ Society Management</strong></p>
            </div>
            <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666;">
              Abdullah Quilliam Society — Student Accommodation
            </div>
          </div>`;
        await sendEmail(tenant.email, tenant.fullName ?? firstName, `URGENT: Rent ${daysOverdue} Days Overdue — Escalation Notice — AQ Society`, html)
          .then(async () => {
            await db.update(accommodationRentPayments)
              .set({ escalationSentAt: new Date() })
              .where(eqOp(accommodationRentPayments.id, payment.id));
            console.log(`[Scheduled] 14+ day escalation sent to ${tenant.email}`);
          })
          .catch(e => console.error(`[Scheduled] Failed to send escalation to ${tenant.email}:`, e));
      }
    }

    console.log(`[Scheduled] Rent reminders complete: ${upcoming.length} due-soon, ${overdue8to14.length} overdue (8-14d), ${overdue14plus.length} escalated (14+d)`);
  } catch (e) {
    console.error("[Scheduled] Rent reminder job failed:", e);
  }
}

// ─── Monday Compliance Digest ─────────────────────────────────────────────────
/**
 * Every Monday at 07:30 UK time — sends a compliance digest to Dr. Abdul Hamid
 * covering:
 *  - Critical / overdue compliance actions
 *  - Training records expiring within 30 days or already expired
 *  - Policies due for review
 */
export async function sendComplianceDigest() {
  console.log("[Scheduled] Running Monday compliance digest...");
  try {
    const db = await getDb();
    if (!db) { console.warn("[Scheduled] DB unavailable, skipping compliance digest"); return; }

    const { complianceActions, trainingRecords, policyDocuments, trusteeDecisions, trusteeMeetings } = await import("../drizzle/schema");
    const now = new Date();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

    // Fetch all data
    const actions = await db.select().from(complianceActions);
    const training = await db.select().from(trainingRecords);
    const policies = await db.select().from(policyDocuments);
    const allDecisions = await db.select().from(trusteeDecisions);

    // Filter to actionable items
    const criticalActions = actions.filter((a: any) =>
      a.priority === "critical" && a.status !== "completed"
    );
    const overdueActions = actions.filter((a: any) =>
      (a.status === "overdue" || (a.dueDate && new Date(a.dueDate) < now && a.status !== "completed"))
      && a.priority !== "critical"
    );
    const trainingGaps = training.filter((t: any) => {
      if (!t.expiresAt) return false;
      const exp = new Date(t.expiresAt).getTime();
      return exp < now.getTime() + THIRTY_DAYS;
    });
    const policyReviews = policies.filter((p: any) =>
      p.status === "overdue" || p.status === "due_review"
    );

    // Decisions: made in past 7 days, flagged if missing minutes or votes
    const SEVEN_DAYS_AGO = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentDecisions = allDecisions.filter((d: any) =>
      d.createdAt && new Date(d.createdAt) >= SEVEN_DAYS_AGO
    );
    const decisionsNeedingAttention = allDecisions.filter((d: any) =>
      d.outcome === "pending" || !d.minutesUrl || (d.votesFor === 0 && d.votesAgainst === 0 && d.abstentions === 0)
    );

    // Quorum: meetings in past 30 days where quorumMet = false
    const THIRTY_DAYS_AGO = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const allMeetings = await db.select().from(trusteeMeetings);
    const quorumFailedMeetings = allMeetings.filter((m: any) =>
      m.scheduledAt && new Date(m.scheduledAt) >= THIRTY_DAYS_AGO &&
      m.status === "completed" && !m.quorumMet
    );

    const totalIssues = criticalActions.length + overdueActions.length + trainingGaps.length + policyReviews.length + decisionsNeedingAttention.length + quorumFailedMeetings.length;
    if (totalIssues === 0) {
      console.log("[Scheduled] Compliance digest: no issues to report this week.");
      return;
    }

    const dateStr = now;
    const score = Math.max(0, 100 - criticalActions.length * 20 - overdueActions.length * 10 - trainingGaps.length * 5 - policyReviews.length * 5 - decisionsNeedingAttention.length * 3 - quorumFailedMeetings.length * 10);
    const scoreColor = score >= 80 ? "#00FFC2" : score >= 60 ? "#f59e0b" : "#f87171";

    const actionRow = (a: any) => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#e2e8f0;font-size:13px">${a.title ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${a.source ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;font-size:12px">
          <span style="padding:2px 8px;border-radius:999px;background:${a.priority==='critical'?'rgba(248,113,113,0.15)':'rgba(245,158,11,0.15)'};color:${a.priority==='critical'?'#f87171':'#f59e0b'};font-weight:600">${a.priority ?? "—"}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${a.dueDate ? fmtDate(new Date(a.dueDate)) : "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${a.owner ?? "—"}</td>
      </tr>`;

    const trainingRow = (t: any) => {
      const expDateObj = t.expiresAt ? new Date(t.expiresAt) : null;
      const exp = expDateObj ? fmtDate(expDateObj) : null;
      const isExpired = expDateObj && expDateObj < now;
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#e2e8f0;font-size:13px">${t.userName ?? `User #${t.userId}`}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${t.module ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;font-size:12px">
          <span style="padding:2px 8px;border-radius:999px;background:${isExpired?'rgba(248,113,113,0.15)':'rgba(245,158,11,0.15)'};color:${isExpired?'#f87171':'#f59e0b'};font-weight:600">${isExpired?'Expired':'Expiring soon'}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${exp ? exp : "—"}</td>
      </tr>`;
    };

    const decisionRow = (d: any) => {
      const missingMinutes = !d.minutesUrl;
      const missingVotes = d.votesFor === 0 && d.votesAgainst === 0 && d.abstentions === 0;
      const flags = [missingMinutes && "No minutes", missingVotes && "No votes recorded"].filter(Boolean).join(", ");
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#e2e8f0;font-size:13px">${d.title ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${d.proposer ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;font-size:12px">
          <span style="padding:2px 8px;border-radius:999px;background:${d.outcome==='passed'?'rgba(0,255,194,0.15)':d.outcome==='rejected'?'rgba(248,113,113,0.15)':'rgba(245,158,11,0.15)'};color:${d.outcome==='passed'?'#00FFC2':d.outcome==='rejected'?'#f87171':'#f59e0b'};font-weight:600;text-transform:capitalize">${d.outcome ?? "pending"}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${d.meetingDate ? fmtDate(new Date(d.meetingDate)) : "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#f87171;font-size:12px;font-weight:600">${flags || "✓"}</td>
      </tr>`;
    };

    const policyRow = (p: any) => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#e2e8f0;font-size:13px">${p.title ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${p.category ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;font-size:12px">
          <span style="padding:2px 8px;border-radius:999px;background:rgba(245,158,11,0.15);color:#f59e0b;font-weight:600">${p.status === "overdue" ? "Overdue" : "Due Review"}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${p.reviewDate ? fmtDate(new Date(p.reviewDate)) : "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${p.owner ?? "—"}</td>
      </tr>`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#070F1E;font-family:'Inter',Arial,sans-serif">
  <div style="max-width:680px;margin:0 auto;padding:32px 16px">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0A192F,#112240);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px 32px;margin-bottom:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.03em">
            Weekly Compliance Digest
          </h1>
          <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.5)">${dateStr} · Abdullah Quilliam Society</p>
        </div>
        <div style="text-align:center">
          <p style="margin:0;font-size:36px;font-weight:900;color:${scoreColor};line-height:1">${score}%</p>
          <p style="margin:2px 0 0;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Compliance Score</p>
        </div>
      </div>
    </div>

    <!-- Summary strip -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:24px">
      ${[
        { label: "Critical Actions", value: criticalActions.length, color: "#f87171" },
        { label: "Overdue Items", value: overdueActions.length, color: "#f59e0b" },
        { label: "Training Gaps", value: trainingGaps.length, color: "#a78bfa" },
        { label: "Policy Reviews", value: policyReviews.length, color: "#00FFC2" },
        { label: "Decisions Flagged", value: decisionsNeedingAttention.length, color: "#60a5fa" },
        { label: "Quorum Failures", value: quorumFailedMeetings.length, color: "#f43f5e" },
      ].map(s => `<div style="background:${s.color}11;border:1px solid ${s.color}33;border-radius:12px;padding:14px;text-align:center">
        <p style="margin:0;font-size:24px;font-weight:800;color:${s.value>0?s.color:'rgba(255,255,255,0.3)'}">${s.value}</p>
        <p style="margin:4px 0 0;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.08em">${s.label}</p>
      </div>`).join("")}
    </div>

    ${criticalActions.length > 0 ? `
    <!-- Critical Actions -->
    <div style="background:rgba(248,113,113,0.05);border:1px solid rgba(248,113,113,0.2);border-radius:12px;margin-bottom:20px;overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid rgba(248,113,113,0.2)">
        <h2 style="margin:0;font-size:14px;font-weight:700;color:#f87171">⚠ Critical Actions (${criticalActions.length})</h2>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:rgba(0,0,0,0.2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Action</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Source</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Priority</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Due</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Owner</th>
        </tr></thead>
        <tbody>${criticalActions.map(actionRow).join("")}</tbody>
      </table>
    </div>` : ""}

    ${overdueActions.length > 0 ? `
    <!-- Overdue Actions -->
    <div style="background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.2);border-radius:12px;margin-bottom:20px;overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid rgba(245,158,11,0.2)">
        <h2 style="margin:0;font-size:14px;font-weight:700;color:#f59e0b">⏰ Overdue Actions (${overdueActions.length})</h2>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:rgba(0,0,0,0.2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Action</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Source</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Priority</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Due</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Owner</th>
        </tr></thead>
        <tbody>${overdueActions.map(actionRow).join("")}</tbody>
      </table>
    </div>` : ""}

    ${trainingGaps.length > 0 ? `
    <!-- Training Gaps -->
    <div style="background:rgba(167,139,250,0.05);border:1px solid rgba(167,139,250,0.2);border-radius:12px;margin-bottom:20px;overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid rgba(167,139,250,0.2)">
        <h2 style="margin:0;font-size:14px;font-weight:700;color:#a78bfa">🎓 Training Gaps (${trainingGaps.length})</h2>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:rgba(0,0,0,0.2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Staff Member</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Module</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Status</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Expires</th>
        </tr></thead>
        <tbody>${trainingGaps.map(trainingRow).join("")}</tbody>
      </table>
    </div>` : ""}

    ${policyReviews.length > 0 ? `
    <!-- Policy Reviews -->
    <div style="background:rgba(0,255,194,0.04);border:1px solid rgba(0,255,194,0.2);border-radius:12px;margin-bottom:20px;overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid rgba(0,255,194,0.2)">
        <h2 style="margin:0;font-size:14px;font-weight:700;color:#00FFC2">📋 Policies Due for Review (${policyReviews.length})</h2>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:rgba(0,0,0,0.2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Policy</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Category</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Status</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Review Date</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Owner</th>
        </tr></thead>
        <tbody>${policyReviews.map(policyRow).join("")}</tbody>
      </table>
    </div>` : ""}

    ${recentDecisions.length > 0 ? `
    <!-- Decisions This Week -->
    <div style="background:rgba(96,165,250,0.05);border:1px solid rgba(96,165,250,0.2);border-radius:12px;margin-bottom:20px;overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid rgba(96,165,250,0.2)">
        <h2 style="margin:0;font-size:14px;font-weight:700;color:#60a5fa">🗳 Decisions This Week (${recentDecisions.length})</h2>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:rgba(0,0,0,0.2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Title</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Proposer</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Outcome</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Meeting Date</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Flags</th>
        </tr></thead>
        <tbody>${recentDecisions.map(decisionRow).join("")}</tbody>
      </table>
    </div>` : ""}

    ${quorumFailedMeetings.length > 0 ? `
    <!-- Quorum Failures -->
    <div style="background:rgba(244,63,94,0.05);border:1px solid rgba(244,63,94,0.2);border-radius:12px;margin-bottom:20px;overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid rgba(244,63,94,0.2)">
        <h2 style="margin:0;font-size:14px;font-weight:700;color:#f43f5e">🔴 Quorum Failures — Last 30 Days (${quorumFailedMeetings.length})</h2>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:rgba(0,0,0,0.2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Meeting</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Date</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Type</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Quorum Required</th>
        </tr></thead>
        <tbody>${quorumFailedMeetings.map((m: any) => `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#e2e8f0;font-size:13px">${m.title ?? "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${m.scheduledAt ? fmtDate(new Date(m.scheduledAt)) : "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${(m.meetingType ?? "—").replace(/_/g, " ")}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;font-size:12px"><span style="padding:2px 8px;border-radius:999px;background:rgba(244,63,94,0.15);color:#f43f5e;font-weight:600">${m.quorumRequired} trustees</span></td>
        </tr>`).join("")}</tbody>
      </table>
    </div>` : ""}

    ${decisionsNeedingAttention.length > 0 ? `
    <!-- Decisions Needing Attention -->
    <div style="background:rgba(96,165,250,0.04);border:1px solid rgba(96,165,250,0.15);border-radius:12px;margin-bottom:20px;overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid rgba(96,165,250,0.15)">
        <h2 style="margin:0;font-size:14px;font-weight:700;color:#60a5fa">⚠ Decisions Needing Attention (${decisionsNeedingAttention.length})</h2>
        <p style="margin:4px 0 0;font-size:11px;color:rgba(255,255,255,0.4)">Missing minutes URL, missing vote counts, or still pending</p>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:rgba(0,0,0,0.2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Title</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Proposer</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Outcome</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Meeting Date</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em">Flags</th>
        </tr></thead>
        <tbody>${decisionsNeedingAttention.map(decisionRow).join("")}</tbody>
      </table>
    </div>` : ""}

    <!-- Footer -->
    <div style="text-align:center;padding:20px 0;border-top:1px solid rgba(255,255,255,0.06)">
      <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3)">
        Abdullah Quilliam Society · Automated Compliance Digest · Every Monday 07:30 UK
      </p>
      <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.2)">
        To manage compliance items, log in to the Hibba OS Compliance Cockpit.
      </p>
    </div>

  </div>
</body>
</html>`;

    await sendEmail(
      "ahamid4@gmail.com",
      "Dr Abdul Hamid",
      `[Hibba] Weekly Compliance Digest — ${totalIssues} item${totalIssues !== 1 ? "s" : ""} require attention`,
      html,
    );
    console.log(`[Scheduled] Compliance digest sent to Dr. Hamid: ${totalIssues} issues (${criticalActions.length} critical, ${overdueActions.length} overdue, ${trainingGaps.length} training, ${policyReviews.length} policies, ${decisionsNeedingAttention.length} decisions flagged, ${recentDecisions.length} decisions this week, ${quorumFailedMeetings.length} quorum failures)`);
  } catch (e) {
    console.error("[Scheduled] Compliance digest failed:", e);
  }
}

// ─── Scheduled Gmail Inbox Sync ───────────────────────────────────────────────
/**
 * Runs every hour between 06:00 and 22:00 UK time.
 * Fetches the latest 20 emails from Gmail and stores any new ones in inbound_emails.
 * Uses the same Gmail OAuth tokens as the commsInbox.fetchFromGmail procedure.
 */
async function syncGmailInbox() {
  console.log("[Scheduled] Running Gmail inbox sync...");
  try {
    const db = await getDb();
    if (!db) { console.log("[Scheduled] Gmail sync: DB unavailable, skipping."); return; }

    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
    const fromEmail = process.env.GMAIL_FROM_EMAIL;
    if (!clientId || !clientSecret || !refreshToken || !fromEmail) {
      console.log("[Scheduled] Gmail sync: credentials not configured, skipping.");
      return;
    }

    // Get access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) {
      console.log("[Scheduled] Gmail sync: failed to get access token.");
      return;
    }
    const accessToken = tokenData.access_token;

    // Fetch latest 20 messages from INBOX
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&labelIds=INBOX`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json() as { messages?: { id: string }[] };
    const messages = listData.messages ?? [];

    const { inboundEmails, emailSections } = await import("../drizzle/schema");
    const { invokeLLM } = await import("./_core/llm");
    const { eq, like, or, desc } = await import("drizzle-orm");

    // Get or create default section
    let defaultSectionId: number | null = null;
    const sections = await db.select().from(emailSections).limit(1);
    if (sections.length > 0) defaultSectionId = sections[0].id;

    let imported = 0;
    let skipped = 0;

    for (const msg of messages) {
      // Check if already imported
      const existing = await db.select({ id: inboundEmails.id })
        .from(inboundEmails)
        .where(eq(inboundEmails.gmailMessageId, msg.id))
        .limit(1);
      if (existing.length > 0) { skipped++; continue; }

      // Fetch full message
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData = await msgRes.json() as any;

      const headers: { name: string; value: string }[] = msgData.payload?.headers ?? [];
      const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

      const subject = getHeader("Subject") || "(no subject)";
      const fromRaw = getHeader("From");
      const fromMatch = fromRaw.match(/^(?:"?([^"<]+)"?\s*)?<?([^>]+)>?$/);
      const fromName = fromMatch?.[1]?.trim() ?? "";
      const fromEmail2 = fromMatch?.[2]?.trim() ?? fromRaw;
      const toEmail = getHeader("To");
      const snippet = (msgData.snippet ?? "").substring(0, 500);
      const threadId = msgData.threadId ?? null;
      const internalDate = msgData.internalDate ? new Date(parseInt(msgData.internalDate)) : new Date();

      // Extract body
      let bodyText = "";
      let bodyHtml = "";
      const extractBody = (payload: any) => {
        if (!payload) return;
        if (payload.mimeType === "text/plain" && payload.body?.data) {
          bodyText = Buffer.from(payload.body.data, "base64").toString("utf-8");
        } else if (payload.mimeType === "text/html" && payload.body?.data) {
          bodyHtml = Buffer.from(payload.body.data, "base64").toString("utf-8");
        }
        if (payload.parts) payload.parts.forEach(extractBody);
      };
      extractBody(msgData.payload);

      // AI priority classification
      let autoPriority: "urgent" | "high" | "normal" | "low" = "normal";
      try {
        const priorityRes = await invokeLLM({
          messages: [
            { role: "system", content: "You are an email triage assistant for a UK charity. Classify the email priority as one of: urgent, high, normal, low. Respond with JSON only: {\"priority\": \"urgent|high|normal|low\"}" },
            { role: "user", content: `Subject: ${subject}\nFrom: ${fromEmail2}\nSnippet: ${snippet}` },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "email_priority",
              strict: true,
              schema: {
                type: "object",
                properties: { priority: { type: "string", enum: ["urgent", "high", "normal", "low"] } },
                required: ["priority"],
                additionalProperties: false,
              },
            },
          },
        });
        const content = priorityRes.choices[0].message.content;
        const p = JSON.parse(typeof content === "string" ? content : JSON.stringify(content)) as { priority: "urgent" | "high" | "normal" | "low" };
        autoPriority = p.priority;
      } catch { /* fallback to normal */ }

      await db.insert(inboundEmails).values({
        gmailMessageId: msg.id,
        gmailThreadId: threadId,
        fromEmail: fromEmail2,
        fromName: fromName || null,
        toEmail: toEmail || null,
        subject,
        bodyText: bodyText || null,
        bodyHtml: bodyHtml || null,
        snippet: snippet || null,
        sectionId: defaultSectionId,
        priority: autoPriority,
        status: "unread",
        receivedAt: internalDate,
      });
      imported++;
    }

    setGmailLastSyncedAt(Date.now());
    console.log(`[Scheduled] Gmail sync complete: ${imported} imported, ${skipped} skipped.`);
  } catch (e) {
    console.error("[Scheduled] Gmail sync failed:", e);
  }
}

// ─── Daily LBMW Gmail Pull ────────────────────────────────────────────────────
/**
 * Runs daily at 08:15 UK time.
 * Pulls emails from the configured LBMW Gmail label (env: LBMW_GMAIL_LABEL, default "LBMW")
 * and creates LBMW correspondence records with AI analysis.
 */
export async function runDailyLbmwGmailPull() {
  console.log("[Scheduled] Running daily LBMW Gmail pull...");
  try {
    const db = await getDb();
    if (!db) { console.log("[Scheduled] LBMW pull: DB unavailable, skipping."); return; }
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken) {
      console.log("[Scheduled] LBMW pull: Gmail credentials not configured, skipping.");
      return;
    }
    const labelName = process.env.LBMW_GMAIL_LABEL || "LBMW";
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) { console.log("[Scheduled] LBMW pull: failed to get access token."); return; }
    const accessToken = tokenData.access_token;
    const labelsRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", { headers: { Authorization: `Bearer ${accessToken}` } });
    const labelsData = await labelsRes.json() as { labels?: { id: string; name: string }[] };
    const label = (labelsData.labels ?? []).find(l => l.name.toLowerCase() === labelName.toLowerCase());
    if (!label) { console.log(`[Scheduled] LBMW pull: label "${labelName}" not found.`); return; }
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&labelIds=${label.id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const listData = await listRes.json() as { messages?: { id: string }[] };
    const messages = listData.messages ?? [];
    if (messages.length === 0) { console.log("[Scheduled] LBMW pull: no messages found."); return; }
    const { lbmwCorrespondence, complianceActions } = await import("../drizzle/schema");
    const { invokeLLM } = await import("./_core/llm");
    const { eq } = await import("drizzle-orm");
    const { notifyOwner } = await import("./_core/notification");
    let created = 0, skipped = 0, actionsCreated = 0, invoices = 0;
    for (const msg of messages) {
      const existing = await db.select({ id: lbmwCorrespondence.id }).from(lbmwCorrespondence).where(eq(lbmwCorrespondence.gmailMessageId, msg.id)).limit(1);
      if (existing.length > 0) { skipped++; continue; }
      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const msgData = await msgRes.json() as any;
      const headers = (msgData.payload?.headers ?? []) as { name: string; value: string }[];
      const getHeader = (n: string) => headers.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
      const subject = getHeader("subject") || "(no subject)";
      const from = getHeader("from");
      const date = new Date(getHeader("date") || Date.now());
      const extractText = (part: any): string => {
        if (part.mimeType === "text/plain" && part.body?.data) return Buffer.from(part.body.data, "base64").toString("utf-8");
        if (part.parts) return part.parts.map(extractText).join("\n");
        return "";
      };
      const bodyText = extractText(msgData.payload) || msgData.snippet || "";
      let analysis: any = { contactName: from.split("<")[0].trim() || from, contactRole: "", summary: bodyText.slice(0, 300), priority: "medium", actionRequired: false, actionTitle: null, actionDeadline: null, actionPriority: "medium", isInvoice: false, invoiceAmount: null };
      try {
        const aiRes = await invokeLLM({ messages: [{ role: "user", content: `Analyse this email for a UK charity. Return JSON with: contactName, contactRole, summary (2-3 sentences), priority (critical/high/medium/low), actionRequired (bool), actionTitle, actionDeadline (YYYY-MM-DD or null), actionPriority, isInvoice (bool), invoiceAmount (number or null).\nSubject: ${subject}\nFrom: ${from}\nBody: ${bodyText.slice(0, 1500)}` }], response_format: { type: "json_object" } as any });
        const raw = aiRes.choices[0].message.content;
        analysis = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
      } catch { /* use defaults */ }
      let actionTaskId: number | null = null;
      if (analysis.actionRequired && analysis.actionTitle) {
        const [ar] = await db.insert(complianceActions).values({ title: analysis.actionTitle, source: "LBMW Gmail Auto", owner: null, dueDate: analysis.actionDeadline ? new Date(analysis.actionDeadline) : null, priority: analysis.actionPriority ?? "medium", notes: `Auto-created from scheduled LBMW Gmail pull.\nEmail: ${subject}\nSummary: ${analysis.summary}`, status: "open", createdByUserId: null as any } as any);
        actionTaskId = (ar as any).insertId as number;
        actionsCreated++;
      }
      await db.insert(lbmwCorrespondence).values({ contactName: analysis.contactName || from, contactRole: analysis.contactRole || "", direction: "inbound", channel: "email", subject, summary: analysis.summary, aiSummary: analysis.summary, dateReceived: new Date(date.toISOString().split("T")[0]) as any, responseDeadline: analysis.actionDeadline ? new Date(analysis.actionDeadline) as any : null, status: "pending", priority: analysis.priority ?? "medium", gmailMessageId: msg.id, gmailThreadId: msgData.threadId, gmailFrom: from, gmailLabel: labelName, actionRequired: analysis.actionRequired, actionTaskId, isInvoice: analysis.isInvoice, invoiceAmount: analysis.invoiceAmount ? String(analysis.invoiceAmount) as any : null, handledByUserId: null as any } as any);
      created++;
      if (analysis.isInvoice) invoices++;
    }
    if (created > 0) {
      await notifyOwner({ title: `LBMW Daily Pull: ${created} new email(s)`, content: `Daily scheduled pull from Gmail label "${labelName}" complete.\n${created} new record(s) created, ${skipped} skipped.\n${actionsCreated} action task(s) created, ${invoices} invoice(s) detected.` }).catch(() => {});
    }
    console.log(`[Scheduled] LBMW pull complete: ${created} created, ${skipped} skipped, ${actionsCreated} actions, ${invoices} invoices.`);
  } catch (e) {
    console.error("[Scheduled] LBMW Gmail pull failed:", e);
  }
}


// ─── Contract Renewal Reminders ──────────────────────────────────────────────
/**
 * Daily at 07:00 UK time — check utility accounts whose contractEndDate is
 * within the next 60 days and send an email reminder to the admin.
 */
export async function sendContractRenewalReminders() {
  console.log("[Scheduled] Running contract renewal reminder check...");
  try {
    const db = await getDb();
    if (!db) return;
    const { utilityAccounts, supplierContacts } = await import("../drizzle/schema");
    const { and, lte, gte, isNotNull } = await import("drizzle-orm");
    const now = new Date();
    const in60Days = new Date(now);
    in60Days.setDate(in60Days.getDate() + 60);

    const accounts = await db.select().from(utilityAccounts)
      .where(and(
        isNotNull(utilityAccounts.contractEndDate),
        lte(utilityAccounts.contractEndDate, in60Days),
        gte(utilityAccounts.contractEndDate, now)
      ));

    if (accounts.length === 0) {
      console.log("[Scheduled] No contracts expiring within 60 days.");
      return;
    }

    // Fetch linked supplier contacts
    const accountsWithContacts = await Promise.all(accounts.map(async (acc: any) => {
      let contact = null;
      if (acc.supplierContactId) {
        const contacts = await db.select().from(supplierContacts)
          .where(eq(supplierContacts.id, acc.supplierContactId))
          .limit(1);
        contact = contacts[0] ?? null;
      }
      return { ...acc, contact };
    }));

    const rows = accountsWithContacts.map((acc: any) => {
      const daysLeft = Math.ceil((new Date(acc.contractEndDate).getTime() - now.getTime()) / 86400000);
      const contactInfo = acc.contact
        ? `${acc.contact.name}${acc.contact.phone ? ` · ${acc.contact.phone}` : ""}${acc.contact.email ? ` · ${acc.contact.email}` : ""}`
        : "No contact linked";
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${acc.supplierName || acc.accountName || "Unknown"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${acc.utilityType || "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${acc.building || "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${acc.accountNumber || "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:${daysLeft <= 14 ? "#dc2626" : daysLeft <= 30 ? "#d97706" : "#5C1A1A"};">${daysLeft} days (${fmtDate(new Date(acc.contractEndDate))})</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;">${contactInfo}</td>
        </tr>`;
    }).join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="background:#5C1A1A;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:20px;">Abdullah Quilliam Society</h1>
          <p style="color:#c9a84c;margin:4px 0 0;">Utility Contract Renewal Reminder</p>
        </div>
        <div style="padding:24px;background:#fff;">
          <p>Assalamu Alaikum,</p>
          <p>This is an automated reminder that the following utility contracts are due for renewal within the next <strong>60 days</strong>. Please contact the relevant suppliers to arrange renewals.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
            <thead>
              <tr style="background:#f0fdf4;">
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Supplier</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Type</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Building</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Account No.</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Expires In</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Supplier Contact</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p>Please update the contract end dates in the Bills & Utilities section once renewals are confirmed.</p>
          <p>JazakAllahu Khayran,<br><strong>AQ Society Finance System</strong></p>
        </div>
        <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666;">
          AQ Society Automated Contract Renewal Alert
        </div>
      </div>`;

    const adminRecipients = [
      { name: "Mumin Khan", email: "meds.mumin@gmail.com" },
      { name: "Mr Galib Khan", email: "khan.galib@gmail.com" },
    ];

    for (const recipient of adminRecipients) {
      await sendEmail(
        recipient.email,
        recipient.name,
        `⚠️ ${accounts.length} Utility Contract(s) Expiring Within 60 Days — AQ Society`,
        html
      ).then(() => console.log(`[Scheduled] Contract renewal reminder sent to ${recipient.email}`))
        .catch(e => console.error(`[Scheduled] Failed to send contract renewal reminder to ${recipient.email}:`, e));
    }

    console.log(`[Scheduled] Contract renewal reminders sent for ${accounts.length} account(s).`);
  } catch (e) {
    console.error("[Scheduled] Contract renewal reminder failed:", e);
  }
}

// ─── Weekly Cash Flow Digest ──────────────────────────────────────────────────
/**
 * Every Monday at 07:00 UK time — sends a digest of all upcoming payments
 * due within the next 7 days, with held payments highlighted.
 */
async function sendWeeklyCashFlowDigest() {
  console.log("[Scheduled] Running weekly cash flow digest...");
  try {
    const db = await getDb();
    if (!db) return;
    const { scheduledPayments } = await import("../drizzle/schema");
    const { gte, lte: lteOp, inArray: inArr } = await import("drizzle-orm");

    const now = new Date();
    const sevenDaysLater = new Date(now);
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

    // Get all pending + held payments due within 7 days
    const upcoming = await db.select().from(scheduledPayments)
      .where(
        and(
          gte(scheduledPayments.dueDate, now),
          lteOp(scheduledPayments.dueDate, sevenDaysLater),
          inArr(scheduledPayments.status, ["pending", "held"])
        )
      )
      .orderBy(scheduledPayments.dueDate);

    if (upcoming.length === 0) {
      console.log("[Scheduled] No upcoming payments in next 7 days — skipping digest.");
      return;
    }

    const totalPending = upcoming.filter(p => p.status === "pending").reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
    const totalHeld = upcoming.filter(p => p.status === "held").reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
    const totalAll = totalPending + totalHeld;

    const rows = upcoming.map(p => {
      const isHeld = p.status === "held";
      const dueDate = fmtDate(new Date(p.dueDate));
      const statusBadge = isHeld
        ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">HELD</span>`
        : `<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">PENDING</span>`;
      const rowBg = isHeld ? "#fffbeb" : "#fff";
      return `
        <tr style="background:${rowBg};">
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${p.description ?? "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${p.supplier ?? "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${p.building ?? "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#5C1A1A;">£${parseFloat(p.amount ?? "0").toFixed(2)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${dueDate}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${statusBadge}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${p.note ?? "—"}</td>
        </tr>`;
    }).join("");

    const reportDate = fmtDate(now);

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;">
        <div style="background:#5C1A1A;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:20px;">Abdullah Quilliam Society</h1>
          <p style="color:#c9a84c;margin:4px 0 0;">Weekly Cash Flow Digest — Payments Due This Week</p>
        </div>
        <div style="padding:24px;background:#fff;">
          <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh,</p>
          <p>This is your weekly cash flow digest for <strong>${reportDate}</strong>. The following payments are due within the next <strong>7 days</strong>:</p>

          <div style="display:flex;gap:16px;margin:16px 0;">
            <div style="flex:1;background:#f0fdf4;padding:16px;border-radius:8px;text-align:center;">
              <div style="font-size:22px;font-weight:800;color:#5C1A1A;">£${totalAll.toFixed(2)}</div>
              <div style="font-size:12px;color:#6b7280;margin-top:4px;">Total Due This Week</div>
            </div>
            <div style="flex:1;background:#dbeafe;padding:16px;border-radius:8px;text-align:center;">
              <div style="font-size:22px;font-weight:800;color:#1e40af;">£${totalPending.toFixed(2)}</div>
              <div style="font-size:12px;color:#6b7280;margin-top:4px;">Pending Payments</div>
            </div>
            <div style="flex:1;background:#fef3c7;padding:16px;border-radius:8px;text-align:center;">
              <div style="font-size:22px;font-weight:800;color:#92400e;">£${totalHeld.toFixed(2)}</div>
              <div style="font-size:12px;color:#6b7280;margin-top:4px;">Held (Insufficient Funds)</div>
            </div>
          </div>

          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
            <thead>
              <tr style="background:#f0fdf4;">
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Description</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Supplier</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Building</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Amount</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Due Date</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Status</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Note</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          ${totalHeld > 0 ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin:16px 0;">
            <strong style="color:#92400e;">⚠️ Held Payments:</strong> £${totalHeld.toFixed(2)} in payments are currently held due to insufficient funds. Please review the Cash Flow Planner and release payments once funds are available.
          </div>` : ""}

          <p>Please log into the Finance System and update payment statuses once funds are released. JazakAllahu Khayran for your continued dedication.</p>
          <p>Warm Islamic greetings,<br><strong>AQ Society Finance System</strong></p>
        </div>
        <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666;">
          AQ Society Automated Cash Flow Digest — Every Monday 07:00
        </div>
      </div>`;

    const digestRecipients = [
      { name: "Mumin Khan", email: "meds.mumin@gmail.com" },
      { name: "Mr Galib Khan", email: "khan.galib@gmail.com" },
      { name: "Mr Farid Ahmed", email: "fariddixy@gmail.com" },
    ];

    for (const recipient of digestRecipients) {
      await sendEmail(
        recipient.email,
        recipient.name,
        `💰 Cash Flow Digest — ${upcoming.length} Payment(s) Due This Week — AQ Society`,
        html
      ).then(() => console.log(`[Scheduled] Cash flow digest sent to ${recipient.email}`))
        .catch(e => console.error(`[Scheduled] Failed to send cash flow digest to ${recipient.email}:`, e));
    }

    console.log(`[Scheduled] Weekly cash flow digest sent for ${upcoming.length} upcoming payment(s).`);
  } catch (e) {
    console.error("[Scheduled] Weekly cash flow digest failed:", e);
  }
}


// ─── Morning Briefing for Voice Agent ────────────────────────────────────────
/**
 * Daily morning briefing (07:30 UK time):
 * Generates a structured summary for the voice agent to read aloud when the user
 * first opens the app each morning. Covers:
 * - Unread email count
 * - Overdue rents / upcoming payments
 * - New donations since yesterday
 * - Pending approvals
 * - Cash flow alerts
 */
export async function generateMorningBriefing() {
  console.log("[Scheduled] Generating morning briefing...");
  try {
    const db = await getDb();
    if (!db) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const newDonations = await db
      .select({ count: sql<number>`count(*)` })
      .from(fundraisingDonations)
      .where(gte(fundraisingDonations.createdAt, yesterday));
    const donationCount = Number(newDonations[0]?.count ?? 0);

    let overdueLoansCount = 0;
    try {
      const { loanApplications } = await import("../drizzle/schema");
      const overdue = await db.select({ count: sql<number>`count(*)` })
        .from(loanApplications)
        .where(eq(loanApplications.status, "active"));
      overdueLoansCount = Number(overdue[0]?.count ?? 0);
    } catch { /* skip */ }

    let pendingApprovalCount = 0;
    try {
      const pending = await db.select({ count: sql<number>`count(*)` })
        .from(invoices)
        .where(eq(invoices.paymentStatus, "pending"));
      pendingApprovalCount = Number(pending[0]?.count ?? 0);
    } catch { /* skip */ }

    let activePledgeCount = 0;
    try {
      const activePledges = await db.select({ count: sql<number>`count(*)` })
        .from(pledges)
        .where(eq((pledges as any).status, "active"));
      activePledgeCount = Number(activePledges[0]?.count ?? 0);
    } catch { /* skip */ }

    let activeTenantCount = 0;
    try {
      const tenants = await db.select({ count: sql<number>`count(*)` })
        .from(accommodationTenants)
        .where(eq(accommodationTenants.status, "active"));
      activeTenantCount = Number(tenants[0]?.count ?? 0);
    } catch { /* skip */ }

    const dateStr = today;
    const urgentItems: string[] = [];
    const infoItems: string[] = [];

    if (pendingApprovalCount > 0) urgentItems.push(`${pendingApprovalCount} invoice${pendingApprovalCount > 1 ? "s" : ""} pending approval`);
    if (overdueLoansCount > 0) infoItems.push(`${overdueLoansCount} active Qarde Hasan loan${overdueLoansCount > 1 ? "s" : ""}`);
    if (donationCount > 0) infoItems.push(`${donationCount} new donation${donationCount > 1 ? "s" : ""} received since yesterday`);
    if (activePledgeCount > 0) infoItems.push(`${activePledgeCount} active pledge${activePledgeCount > 1 ? "s" : ""} on record`);
    if (activeTenantCount > 0) infoItems.push(`${activeTenantCount} active tenant${activeTenantCount > 1 ? "s" : ""} in accommodation`);

    const hasUrgent = urgentItems.length > 0;

    const urgentHtml = hasUrgent
      ? `<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:0 8px 8px 0;margin:16px 0;"><p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#dc2626;">Requires Attention</p><ul style="margin:0;padding-left:18px;color:#374151;font-size:13px;">${urgentItems.map(i => `<li style="margin:4px 0;">${i}</li>`).join("")}</ul></div>`
      : "";

    const infoHtml = infoItems.length > 0
      ? `<div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:12px 16px;border-radius:0 8px 8px 0;margin:16px 0;"><p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#16a34a;">Today Overview</p><ul style="margin:0;padding-left:18px;color:#374151;font-size:13px;">${infoItems.map(i => `<li style="margin:4px 0;">${i}</li>`).join("")}</ul></div>`
      : "";

    const noItemsHtml = (!hasUrgent && infoItems.length === 0)
      ? `<p style="color:#6b7280;font-size:13px;">No urgent items today. Have a productive day, insha Allah.</p>`
      : "";

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;"><div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;"><div style="background:linear-gradient(135deg,#0A192F,#0d2a4a);padding:24px 28px;"><p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">Good Morning from Hibba</p><p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.6);">Daily Briefing - ${dateStr}</p></div><div style="padding:24px 28px;"><p style="color:#374151;font-size:14px;margin:0 0 16px;">AssalamuAlaikum,</p><p style="color:#374151;font-size:14px;margin:0 0 16px;">Here is your morning briefing for the Abdullah Quilliam Society.</p>${urgentHtml}${infoHtml}${noItemsHtml}<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;"><p style="font-size:12px;color:#9ca3af;margin:0;">Generated by Hibba, your AQ Society AI assistant.</p></div></div><div style="background:#f3f4f6;padding:14px 28px;text-align:center;"><p style="margin:0;font-size:11px;color:#9ca3af;">Abdullah Quilliam Society - Liverpool - JazakAllahu Khayran</p></div></div></body></html>`;

    // Check global morning brief toggle
    const { systemSettings: sysSettingsTable, users: briefUsersTable, trustees: briefTrusteesTable } = await import("../drizzle/schema");
    const [globalSetting] = await db.select().from(sysSettingsTable).where(eq(sysSettingsTable.key, 'morningBriefEnabled')).limit(1);
    const globalEnabled = globalSetting ? globalSetting.value === 'true' : true;
    if (!globalEnabled) {
      console.log('[Scheduled] Morning briefing is globally disabled — skipping.');
      return;
    }
    // Build recipient list from users with receiveMorningBrief = true
    const briefUsers = await db.select({ name: briefUsersTable.name, email: briefUsersTable.email })
      .from(briefUsersTable)
      .where(and(eq(briefUsersTable.isActive, true), eq(briefUsersTable.receiveMorningBrief, true)));
    // Also include opted-in trustees
    const briefTrustees = await db.select({ name: briefTrusteesTable.fullName, email: briefTrusteesTable.email })
      .from(briefTrusteesTable)
      .where(and(eq(briefTrusteesTable.isActive, true), eq(briefTrusteesTable.receiveMorningBrief, true)));
    const recipients: { name: string; email: string }[] = [
      ...briefUsers.filter(u => !!u.email).map(u => ({ name: u.name ?? 'User', email: u.email! })),
      ...briefTrustees.filter(t => !!t.email).map(t => ({ name: t.name ?? 'Trustee', email: t.email! })),
    ];
    // Deduplicate by email
    const seen = new Set<string>();
    const uniqueRecipients = recipients.filter(r => { if (seen.has(r.email)) return false; seen.add(r.email); return true; });
    if (uniqueRecipients.length === 0) {
      console.log('[Scheduled] Morning briefing: no opted-in recipients — skipping.');
      return;
    }

    for (const r of uniqueRecipients) {
      try {
        await sendEmail(r.email, r.name, `Morning Briefing - ${dateStr}`, html);
        console.log(`[Scheduled] Morning briefing sent to ${r.name} <${r.email}>`);
      } catch (emailErr) {
        console.error(`[Scheduled] Failed to send briefing to ${r.email}:`, emailErr);
      }
    }

    const briefingText = [
      `Morning briefing for ${dateStr}.`,
      ...urgentItems.map(i => `URGENT: ${i}.`),
      ...infoItems.map(i => `INFO: ${i}.`),
    ].join(" ") || "No items today.";

    await db.insert(voiceSessions).values({
      userId: 1,
      conversationId: `briefing-${Date.now()}`,
      startedAt: new Date(),
      endedAt: new Date(),
      screenContext: "dashboard",
      tokenCount: 0,
      status: "completed",
    });
    console.log(`[Scheduled] Morning briefing generated: ${briefingText.substring(0, 100)}...`);
  } catch (e) {
    console.error("[Scheduled] Morning briefing generation failed:", e);
  }
}


// ─── 9am Calendar + Urgent Emails Briefing ──────────────────────────────────
/**
 * Daily at 09:00 UK time — sends calendar appointments for the day,
 * anything coming up within 2 hours, and urgent emails needing response.
 */
async function sendCalendarAndUrgentBriefing() {
  console.log("[Scheduled] Generating 9am calendar & urgent briefing...");
  try {
    const { collectDailyBriefingData } = await import("./googleServices");
    const data = await collectDailyBriefingData();
    const dateStr = fmtDate(new Date());

    // Build calendar section
    let calendarHtml = "";
    if (data.calendarToday.length > 0) {
      const rows = data.calendarToday.map(e => {
        const timeStr = e.allDay ? "All Day" : `${e.start.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })} - ${e.end.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })}`;
        return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${timeStr}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;font-weight:500;">${e.summary}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">${e.location || "-"}</td></tr>`;
      }).join("");
      calendarHtml = `<div style="margin:16px 0;"><p style="font-size:14px;font-weight:700;color:#1f2937;margin:0 0 8px;">📅 Today's Calendar (${data.calendarToday.length} events)</p><table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;"><thead><tr style="background:#f9fafb;"><th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">Time</th><th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">Event</th><th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">Location</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } else {
      calendarHtml = `<div style="margin:16px 0;background:#f0fdf4;padding:12px 16px;border-radius:8px;"><p style="margin:0;font-size:13px;color:#16a34a;">📅 No calendar events today. Clear schedule, Alhamdulillah.</p></div>`;
    }

    // Build upcoming within 2 hours section
    let upcomingHtml = "";
    if (data.upcomingWithin2Hours.length > 0) {
      const items = data.upcomingWithin2Hours.map(e => {
        const timeStr = e.start.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
        return `<li style="margin:4px 0;font-size:13px;color:#374151;"><strong>${timeStr}</strong> — ${e.summary}</li>`;
      }).join("");
      upcomingHtml = `<div style="margin:16px 0;background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 8px 8px 0;"><p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#d97706;">⏰ Coming Up Within 2 Hours</p><ul style="margin:0;padding-left:18px;">${items}</ul></div>`;
    }

    // Build urgent emails section
    let urgentHtml = "";
    if (data.urgentEmails.length > 0) {
      const items = data.urgentEmails.map(e => {
        return `<li style="margin:6px 0;font-size:13px;color:#374151;"><strong>${e.from}</strong>: ${e.subject}<br><span style="color:#6b7280;font-size:12px;">${e.summary}</span></li>`;
      }).join("");
      urgentHtml = `<div style="margin:16px 0;background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:0 8px 8px 0;"><p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#dc2626;">🚨 Urgent Emails Needing Response (${data.urgentEmails.length})</p><ul style="margin:0;padding-left:18px;">${items}</ul></div>`;
    }

    // Unread count
    const unreadHtml = data.unreadCount > 0
      ? `<div style="margin:16px 0;background:#eff6ff;padding:12px 16px;border-radius:8px;"><p style="margin:0;font-size:13px;color:#1d4ed8;">📬 ${data.unreadCount} unread message${data.unreadCount > 1 ? "s" : ""} in Comms Hub</p></div>`
      : "";

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="background:linear-gradient(135deg,#0A192F,#1e3a5f);padding:24px 28px;"><p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">9am Briefing from Hibba</p><p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.7);">${dateStr}</p></div><div style="padding:24px 28px;"><p style="color:#374151;font-size:14px;margin:0 0 16px;">Assalamu Alaikum,</p><p style="color:#374151;font-size:14px;margin:0 0 16px;">Here is your 9am briefing — calendar appointments, upcoming events, and urgent items requiring your attention.</p>${upcomingHtml}${calendarHtml}${urgentHtml}${unreadHtml}<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;"><p style="font-size:12px;color:#9ca3af;margin:0;">Generated by Hibba · Abdullah Quilliam Society AI Assistant</p></div></div><div style="background:#f3f4f6;padding:14px 28px;text-align:center;"><p style="margin:0;font-size:11px;color:#9ca3af;">Abdullah Quilliam Society — Liverpool — JazakAllahu Khayran</p></div></div></body></html>`;

    // Check global 9am brief toggle and build DB-driven recipient list
    const db = await getDb();
    if (!db) return;
    const { systemSettings: sysSettings9am, users: briefUsers9am, trustees: briefTrustees9am } = await import("../drizzle/schema");
    const [globalSetting9am] = await db.select().from(sysSettings9am).where(eq(sysSettings9am.key, 'nineAmBriefEnabled')).limit(1);
    const globalEnabled9am = globalSetting9am ? globalSetting9am.value === 'true' : true;
    if (!globalEnabled9am) {
      console.log('[Scheduled] 9am briefing is globally disabled — skipping.');
      return;
    }
    const nineAmUsers = await db.select({ name: briefUsers9am.name, email: briefUsers9am.email })
      .from(briefUsers9am)
      .where(and(eq(briefUsers9am.isActive, true), eq(briefUsers9am.receive9amBrief, true)));
    const nineAmTrustees = await db.select({ name: briefTrustees9am.fullName, email: briefTrustees9am.email })
      .from(briefTrustees9am)
      .where(and(eq(briefTrustees9am.isActive, true), eq(briefTrustees9am.receive9amBrief, true)));
    const allRecipients9am: { name: string; email: string }[] = [
      ...nineAmUsers.filter(u => !!u.email).map(u => ({ name: u.name ?? 'User', email: u.email! })),
      ...nineAmTrustees.filter(t => !!t.email).map(t => ({ name: t.name ?? 'Trustee', email: t.email! })),
    ];
    const seen9am = new Set<string>();
    const recipients: { name: string; email: string }[] = allRecipients9am.filter(r => { if (seen9am.has(r.email)) return false; seen9am.add(r.email); return true; });
    if (recipients.length === 0) {
      console.log('[Scheduled] 9am briefing: no opted-in recipients — skipping.');
      return;
    }

    for (const r of recipients) {
      try {
        await sendEmail(r.email, r.name, `9am Briefing - ${dateStr}`, html);
        console.log(`[Scheduled] 9am briefing sent to ${r.name} <${r.email}>`);
      } catch (emailErr) {
        console.error(`[Scheduled] Failed to send 9am briefing to ${r.email}:`, emailErr);
      }
    }
    console.log(`[Scheduled] 9am calendar & urgent briefing complete. Calendar: ${data.calendarToday.length} events, Urgent: ${data.urgentEmails.length} emails.`);
  } catch (e) {
    console.error("[Scheduled] 9am briefing generation failed:", e);
  }
}
