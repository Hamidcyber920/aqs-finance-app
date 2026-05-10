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
  console.log("[Scheduled] Jobs registered: weekly repayment alert (Mon 08:00) + monthly trustee report (1st 08:00) + birthday alerts (daily 09:00) + rent reminders (daily 08:30)");
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
