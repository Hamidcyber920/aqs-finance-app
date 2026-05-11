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
import { getDb } from "./db";
import { loanRepayments } from "../drizzle/schema";
import { eq } from "drizzle-orm";

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
    .where(eq(loanApplications.status, "active"));
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
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#1a4731;">£${d.amount.toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${d.dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
      </tr>`).join("");

    const reportDate = now.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

    for (const recipient of WEEKLY_ALERT_RECIPIENTS) {
      const firstName = recipient.name.split(" ").find(p => !["Mr", "Dr", "Mrs", "Ms"].includes(p)) ?? recipient.name;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;">
          <div style="background:#1a4731;padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;">Abdullah Quilliam Society</h1>
            <p style="color:#c9a84c;margin:4px 0 0;">Qarde Hasan — Weekly Repayment Alert</p>
          </div>
          <div style="padding:24px;background:#fff;">
            <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p>
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
                  <td colspan="2" style="padding:10px 12px;font-weight:800;font-size:15px;color:#1a4731;">£${totalDue.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
            <p>Please follow up with the respective donors and update the system once repayments are received. JazakAllahu Khayran for your continued dedication to the Rimmers Building Project.</p>
            <p>The Prophet (PBUH) said: <em>"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah."</em></p>
            <p>Warm Islamic greetings,<br><strong>AQ Society Finance System</strong></p>
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
    const monthName = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

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
      const statusColor = overdueCount > 0 ? "#dc2626" : outstanding === 0 ? "#16a34a" : "#1a4731";
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
      const firstName = (trustee.fullName ?? "").split(" ").find((p: string) => !["Mr", "Dr", "Mrs", "Ms"].includes(p)) ?? trustee.fullName ?? "Trustee";
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;">
          <div style="background:#1a4731;padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;">Abdullah Quilliam Society</h1>
            <p style="color:#c9a84c;margin:4px 0 0;">Qarde Hasan — Monthly Trustee Report — ${monthName}</p>
          </div>
          <div style="padding:24px;background:#fff;">
            <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p>
            <p>May Allah bless you with barakah and good health. Please find below the monthly Qarde Hasan Amanah report for <strong>${monthName}</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;background:#f0fdf4;border-radius:8px;">
              <tr><td style="padding:10px 16px;font-weight:700;">Total Loaned</td><td style="padding:10px 16px;font-weight:800;font-size:16px;color:#1a4731;">£${totalLoaned.toFixed(2)}</td></tr>
              <tr><td style="padding:10px 16px;font-weight:700;">Total Repaid</td><td style="padding:10px 16px;font-weight:800;font-size:16px;color:#16a34a;">£${totalRepaid.toFixed(2)}</td></tr>
              <tr><td style="padding:10px 16px;font-weight:700;">Total Outstanding</td><td style="padding:10px 16px;font-weight:800;font-size:16px;color:#dc2626;">£${totalOutstanding.toFixed(2)}</td></tr>
              <tr><td style="padding:10px 16px;font-weight:700;">Active Loans</td><td style="padding:10px 16px;font-weight:800;font-size:16px;">${loans.length}</td></tr>
            </table>
            <h3 style="color:#1a4731;margin:24px 0 12px;font-size:15px;">Individual Loan Status</h3>
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
            <p>Warm Islamic greetings,<br><strong>AQ Society Finance System</strong></p>
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
      const firstName = (trustee.fullName ?? "").split(" ").find((p: string) => !["Mr", "Dr", "Mrs", "Ms"].includes(p)) ?? trustee.fullName ?? "Trustee";
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1a4731;padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;">Abdullah Quilliam Society</h1>
            <p style="color:#c9a84c;margin:4px 0 0;">Birthday Mubarak 🎁</p>
          </div>
          <div style="padding:24px;background:#fff;">
            <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p>
            <p style="font-size:18px;font-weight:700;color:#1a4731;">JazakAllahu Khayran — Wishing you a blessed birthday!</p>
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
        trustee.fullName ?? firstName,
        `Birthday Mubarak, ${firstName}! 🎁 — AQ Society`,
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

  console.log("[Scheduled] Jobs registered: weekly repayment alert (Mon 08:00) + monthly trustee report (1st 08:00) + birthday alerts (daily 09:00) + rent reminders (daily 08:30) + compliance digest (Mon 07:30)");
}
// Export for manual trigger from tRPC (admin use)
export { sendWeeklyRepaymentAlert, sendMonthlyTrusteeReport, sendBirthdayAlerts };

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
      const dueDate = new Date(payment.dueDate as any).toLocaleDateString("en-GB");
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1a4731;padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;">Abdullah Quilliam Society</h1>
            <p style="color:#c9a84c;margin:4px 0 0;">Rent Reminder</p>
          </div>
          <div style="padding:24px;background:#fff;">
            <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p>
            <p>This is a friendly reminder that your rent payment is due soon.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:8px;background:#f9f9f9;font-weight:600;">Period</td><td style="padding:8px;">${payment.periodLabel}</td></tr>
              <tr><td style="padding:8px;background:#f9f9f9;font-weight:600;">Amount Due</td><td style="padding:8px;font-size:18px;color:#1a4731;font-weight:700;">£${parseFloat(payment.amountDue as any).toFixed(2)}</td></tr>
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
      const dueDate = new Date(payment.dueDate as any).toLocaleDateString("en-GB");
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

    const { complianceActions, trainingRecords, policyDocuments, trusteeDecisions } = await import("../drizzle/schema");
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

    const totalIssues = criticalActions.length + overdueActions.length + trainingGaps.length + policyReviews.length + decisionsNeedingAttention.length;
    if (totalIssues === 0) {
      console.log("[Scheduled] Compliance digest: no issues to report this week.");
      return;
    }

    const dateStr = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const score = Math.max(0, 100 - criticalActions.length * 20 - overdueActions.length * 10 - trainingGaps.length * 5 - policyReviews.length * 5 - decisionsNeedingAttention.length * 3);
    const scoreColor = score >= 80 ? "#00FFC2" : score >= 60 ? "#f59e0b" : "#f87171";

    const actionRow = (a: any) => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#e2e8f0;font-size:13px">${a.title ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${a.source ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;font-size:12px">
          <span style="padding:2px 8px;border-radius:999px;background:${a.priority==='critical'?'rgba(248,113,113,0.15)':'rgba(245,158,11,0.15)'};color:${a.priority==='critical'?'#f87171':'#f59e0b'};font-weight:600">${a.priority ?? "—"}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${a.dueDate ? new Date(a.dueDate).toLocaleDateString("en-GB") : "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${a.owner ?? "—"}</td>
      </tr>`;

    const trainingRow = (t: any) => {
      const exp = t.expiresAt ? new Date(t.expiresAt) : null;
      const isExpired = exp && exp < now;
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#e2e8f0;font-size:13px">${t.userName ?? `User #${t.userId}`}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${t.module ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;font-size:12px">
          <span style="padding:2px 8px;border-radius:999px;background:${isExpired?'rgba(248,113,113,0.15)':'rgba(245,158,11,0.15)'};color:${isExpired?'#f87171':'#f59e0b'};font-weight:600">${isExpired?'Expired':'Expiring soon'}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${exp ? exp.toLocaleDateString("en-GB") : "—"}</td>
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
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${d.meetingDate ? new Date(d.meetingDate).toLocaleDateString("en-GB") : "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#f87171;font-size:12px;font-weight:600">${flags || "✓"}</td>
      </tr>`;
    };

    const policyRow = (p: any) => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#e2e8f0;font-size:13px">${p.title ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${p.category ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;font-size:12px">
          <span style="padding:2px 8px;border-radius:999px;background:rgba(245,158,11,0.15);color:#f59e0b;font-weight:600">${p.status === "overdue" ? "Overdue" : "Due Review"}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${p.reviewDate ? new Date(p.reviewDate).toLocaleDateString("en-GB") : "—"}</td>
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
    console.log(`[Scheduled] Compliance digest sent to Dr. Hamid: ${totalIssues} issues (${criticalActions.length} critical, ${overdueActions.length} overdue, ${trainingGaps.length} training, ${policyReviews.length} policies, ${decisionsNeedingAttention.length} decisions flagged, ${recentDecisions.length} decisions this week)`);
  } catch (e) {
    console.error("[Scheduled] Compliance digest failed:", e);
  }
}
