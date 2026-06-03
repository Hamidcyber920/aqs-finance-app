import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateLoanPdf, generateRepaymentPdf, generateWaqfCertificate } from "./loanPdf";
import { sendWeeklyRepaymentAlert, sendMonthlyTrusteeReport } from "./scheduledJobs";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { notifyOwner } from "./_core/notification";
import { nanoid } from "nanoid";
import { localAuthRouter, adminRouter } from "./routers/localAuth";
import { backupRouter, triggerBackupSoon } from "./routers/backup";
import { accommodationRouter } from "./routers/accommodation";
import { fintechRouter } from "./routers/fintech";
import { crmRouter } from "./routers/crm";
import { donorsV3Router } from "./routers/donorsV3";
import { payrollV3Router } from "./routers/payrollV3";
import { commsV3Router } from "./routers/commsV3";
import { meetingsV3Router } from "./routers/meetingsV3";
import { commsInboxRouter } from "./routers/commsInbox";
import { auditTrailRouter, logAudit } from "./routers/auditTrail";
import { systemHealthRouter } from "./routers/systemHealth";
import { pledgesRouter } from "./routers/pledges";
import { donorPipelineRouter } from "./routers/donorPipeline";
import { majorDonorRouter } from "./routers/majorDonor";
import { bulkApprovalsRouter } from "./routers/bulkApprovals";
import { conflictsRouter } from "./routers/conflicts";
import { savedViewsRouter } from "./routers/savedViews";
import { billsRouter } from "./routers/bills";
import { trainingRouter } from "./routers/training";
import { lbmwGmailRouter } from "./routers/lbmwGmail";
import { supplierContactsRouter } from "./routers/supplierContacts";
import { aiScannerRouter } from "./routers/aiScanner";
import { trusteeFinanceRouter } from "./routers/trusteeFinance";
import { qrCodesRouter } from "./routers/qrCodes";
import { recognitionTiersRouter } from "./routers/recognitionTiers";
import { facilitiesRouter } from "./routers/facilities";
import { bistroRouter } from "./routers/bistro";
import { googleServicesRouter } from "./routers/googleServices";
import { voiceRouter } from "./routers/voice";
import { hibbaToolsRouter } from "./routers/hibbaTools";
import {
  createReceipt, deleteReceipt, getAllCategories, getCategoryTotals, getMonthlyTotal,
  getReceiptById, listReceipts, listAllReceipts, seedDefaultCategories, updateReceipt, getAdminReceiptStats,
  getDepartments, getExpenseCategories, seedDepartmentsAndCategories, createDepartment, createExpenseCategory,
  getUserPermissions, upsertUserPermissions,
  listAllUsers, updateUserRole, setUserActive, getPendingUsers, approveUser, rejectUser, setDelegateApprover,
  getUserById,
  getFundraisingCampaigns, getCampaignById, createFundraisingCampaign, updateCampaignAmount,
  getCampaignItems, getCampaignDonations, createDonation, getFridayCollections, createFridayCollection,
  getLoans, getLoanById, createLoan, updateLoan, getLoanRepayments, createLoanRepayment, getLoanRepaymentsById,
  getTrustees, getTrusteeById, createTrustee, updateTrustee, deleteTrustee, getDb,
  getOrgMembers, getOrgMemberById, createOrgMember, updateOrgMember, deleteOrgMember,
  getIncomeCategories, getIncomeRecords, createIncomeRecord, updateIncomeRecord, createIncomeCategory,
  getDonors, getDonorById, createDonor, updateDonor,
  getEmailCampaigns, getEmailCampaignById, createEmailCampaign, updateEmailCampaign,
  getPayrollRecords, createPayrollRecord, updatePayrollRecord, getStaffProfile, upsertStaffProfile,
  getDashboardStats,
} from "./db";
import { eq, and, sql, desc, isNull, gte, lte } from "drizzle-orm";
import { loanRepayments, loanApplications, commChannels, commMessages, commTemplates, successionEvents, users, trusteeDecisions, donorPortalTokens, pledges, pledgePayments, giftAidDeclarations, donorLeads, donorCommsLog, donors } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { buildWhatsAppUrl } from "./lib/whatsapp";
import { fmtDate, fmtDateLong, fmtDateTime } from "./dateUtils";
// sendGmail is defined locally in this file (line ~123)

// ─── Permission helpers ───────────────────────────────────────────────────────

const ADMIN_ROLES = ["superadmin", "trustee", "manager", "admin"];

function isAdmin(role: string) { return ADMIN_ROLES.includes(role); }

/** Returns true if the user is the app owner (Dr Abdul Hamid) by openId, or is superadmin.
 * NOTE: generic "admin" role does NOT qualify — only superadmin or the owner's openId. */
function isOwnerOrSuperAdmin(user: { role: string; openId?: string | null }): boolean {
  return user.role === "superadmin" || (!!ENV.ownerOpenId && user.openId === ENV.ownerOpenId);
}

/** Returns true if user is owner, superadmin, or the designated owner delegate */
function isOwnerOrDelegate(user: { role: string; openId?: string | null; isOwnerDelegate?: boolean }): boolean {
  return isOwnerOrSuperAdmin(user) || user.isOwnerDelegate === true;
}

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  return next({ ctx });
});

const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isOwnerOrSuperAdmin(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "Super admin access required" });
  return next({ ctx });
});

/** Owner-level procedure: only the app owner (by openId), superadmin, or the active owner delegate */
const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isOwnerOrDelegate(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "Owner-level access required" });
  return next({ ctx });
});

// Managers, trustees, superadmins — used for AI document import and sensitive data entry
const SENIOR_ROLES = ["superadmin", "trustee", "manager", "deputy", "admin"];
const seniorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!SENIOR_ROLES.includes(ctx.user.role) && !isOwnerOrSuperAdmin(ctx.user))
    throw new TRPCError({ code: "FORBIDDEN", message: "Only managers, trustees and superadmins can perform this action" });
  return next({ ctx });
});

// ─── Deletion policy helper ───────────────────────────────────────────────────
// Rules:
//   ONLY superadmin or owner (Dr Abdul Hamid by openId) can delete any record.
//   Trustees, managers, deputies, staff, and volunteers CANNOT delete anything.
function canDelete(user: { role: string; openId?: string | null }): boolean {
  return isOwnerOrSuperAdmin(user);
}

function assertCanDelete(user: { role: string; openId?: string | null }) {
  if (!canDelete(user)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the superadmin or owner (Dr Abdul Hamid) can delete records. Data cannot be removed by other users.',
    });
  }
}

// ─── CSV helper ───────────────────────────────────────────────────────────────

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
}

// ─── AI extraction helper ─────────────────────────────────────────────────────

function randomSuffix() { return nanoid(8); }

async function extractReceiptData(imageUrl: string, mimeType: string) {
  const contentType = mimeType.startsWith("application/pdf") ? "file_url" : "image_url";
  const extractionPrompt = `You are an expert receipt parser for a UK charity. Extract all data and return JSON.
{
  "vendor": "string",
  "date": "YYYY-MM-DD or null",
  "amount": number or null,
  "tax": number or null,
  "currency": "GBP",
  "paymentMethod": "cash|card|cheque|bank_transfer|other",
  "receiptNumber": "string or null",
  "lineItems": [{"description": "string", "amount": number}],
  "rawText": "string",
  "categoryName": "Catering & Food|Utilities|Office Supplies|Maintenance & Repairs|Travel & Transport|IT & Technology|Events & Activities|Printing & Stationery|Cleaning & Hygiene|Other",
  "departmentGuess": "Mosque|Restaurant / Bistro|Ramadan|Staff / Payroll|Other",
  "confidence": 0.0-1.0
}`;

  const userContent = contentType === "image_url"
    ? [{ type: "image_url" as const, image_url: { url: imageUrl, detail: "high" as const } }, { type: "text" as const, text: extractionPrompt }]
    : [{ type: "file_url" as const, file_url: { url: imageUrl, mime_type: "application/pdf" as const } }, { type: "text" as const, text: extractionPrompt }];

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are a precise receipt data extraction assistant. Always return valid JSON only." },
      { role: "user", content: userContent as any },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "receipt_data", strict: true,
        schema: {
          type: "object",
          properties: {
            vendor: { type: ["string", "null"] }, date: { type: ["string", "null"] },
            amount: { type: ["number", "null"] }, tax: { type: ["number", "null"] },
            currency: { type: "string" }, paymentMethod: { type: "string" },
            receiptNumber: { type: ["string", "null"] },
            lineItems: { type: "array", items: { type: "object", properties: { description: { type: "string" }, amount: { type: "number" } }, required: ["description", "amount"], additionalProperties: false } },
            rawText: { type: ["string", "null"] }, categoryName: { type: "string" },
            departmentGuess: { type: "string" }, confidence: { type: "number" },
          },
          required: ["vendor", "date", "amount", "tax", "currency", "paymentMethod", "receiptNumber", "lineItems", "rawText", "categoryName", "departmentGuess", "confidence"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("No response from LLM");
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  return JSON.parse(content);
}

// ─── Gmail sender ─────────────────────────────────────────────────────────────

async function sendGmail(to: string, name: string, subject: string, htmlBody: string) {
  const nodemailer = await import("nodemailer");
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.GMAIL_FROM_EMAIL || "noreply@example.com";
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_FROM_EMAIL || fromEmail;
  // Use env var if it looks like a valid 16-char Gmail App Password, otherwise use the configured one
  const envPass = process.env.SMTP_PASSWORD;
  const smtpPass = (envPass && envPass.length === 16) ? envPass : "njvigzynhdcxusik";
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = parseInt(process.env.SMTP_PORT || "587");

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
    tls: { rejectUnauthorized: false },
  });

  await transporter.sendMail({
    from: `"Abdullah Quilliam Society" <${fromEmail}>`,
    to: name ? `"${name}" <${to}>` : to,
    subject,
    html: htmlBody,
  });
}

// ─── Loan approval helpers ──────────────────────────────────────────────────

async function _fullyApproveLoan(loan: any) {
  await updateLoan(loan.id, { status: "approved" });
  // Generate and store agreement PDF
  try {
    const pdfBuffer = await generateLoanPdf({
      id: loan.id, borrowerName: loan.borrowerName, borrowerEmail: loan.borrowerEmail,
      borrowerAddress: loan.borrowerAddress, borrowerPhone: loan.borrowerPhone,
      borrowerTitle: (loan as any).borrowerTitle,
      purpose: loan.purpose, amount: loan.amount, termMonths: loan.termMonths,
      termValue: loan.termValue, termUnit: loan.termUnit, termNotes: loan.termNotes,
      monthlyRepayment: loan.monthlyRepayment, startDate: loan.startDate,
      createdAt: loan.createdAt, status: "approved",
      chairSignatureUrl: loan.chairSignatureUrl, trusteeSignatureUrl: loan.trusteeSignatureUrl,
      notes: loan.notes, adminApprovedByName: loan.adminApprovedByName,
      adminApprovedAt: loan.adminApprovedAt, trusteeName: loan.trusteeName, trusteeApprovedAt: loan.trusteeApprovedAt,
    });
    const fileKey = `loans/agreement-${loan.id}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
    await updateLoan(loan.id, { agreementPdfUrl: url } as any);
    // Send email + WhatsApp to borrower
    if (loan.borrowerEmail) {
      const firstName = (loan.borrowerName ?? '').split(' ')[0];
      const termLabel = loan.termValue && loan.termUnit ? `${loan.termValue} ${loan.termUnit}` : `${loan.termMonths} months`;
      const monthlyAmt = loan.monthlyRepayment ? parseFloat(String(loan.monthlyRepayment)) : parseFloat(String(loan.amount)) / loan.termMonths;
      const whatsappPhone = (loan.borrowerPhone ?? '').replace(/[^0-9]/g, '');
      const waMsg = `Assalamu Alaikum wa Rahmatullahi wa Barakatuh ${firstName}, Alhamdulillah — your Qarde Hasan loan of £${parseFloat(String(loan.amount)).toFixed(2)} has been approved by Abdullah Quilliam Society. Please download your loan agreement: ${url}`;
      const waLink = buildWhatsAppUrl(whatsappPhone, waMsg);
      const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#5C1A1A;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Amanah &mdash; Alhamdulillah, Fully Approved</p></div><div style="padding:24px;background:#fff"><p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p><p>Alhamdulillah — we are honoured to inform you that your Qarde Hasan Amanah for the <strong>Rimmers Building Project</strong> has been <strong style="color:#1a4731">fully approved</strong> by both the Authorised Signatory and Trustee of the Abdullah Quilliam Society.</p><p>You are now a pillar of this House of Allah. The Prophet (PBUH) said: <em>"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah."</em> May Allah (SWT) reward you with the very best in this world and the Akhirah.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Loan Amount</td><td style="padding:8px">&pound;${parseFloat(String(loan.amount)).toFixed(2)}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Repayment Term</td><td style="padding:8px">${termLabel}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Monthly Repayment</td><td style="padding:8px">&pound;${monthlyAmt.toFixed(2)}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Approved By (Admin)</td><td style="padding:8px">${loan.adminApprovedByName ?? 'N/A'}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Approved By (Trustee)</td><td style="padding:8px">${loan.trusteeName ?? 'N/A'}</td></tr></table><p><a href="${url}" style="display:inline-block;background:#5C1A1A;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold">Download Loan Agreement (PDF)</a></p>${whatsappPhone ? `<p style="margin-top:16px"><a href="${waLink}" style="display:inline-block;background:#25D366;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">Open in WhatsApp</a></p>` : ''}<p>JazakAllahu Khayran for your generous Amanah and trust in the AQ Society. Please find your formal Amanah Agreement attached for your records.</p><p>Warm Islamic greetings,<br><strong>AQ Society Finance Team</strong><br><em>Abdullah Quilliam Society</em></p></div><div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">JazakAllahu Khayran — AQ Society Finance System</div></div>`;
      await sendGmail(loan.borrowerEmail, loan.borrowerName, "Alhamdulillah — Your Qarde Hasan Amanah Has Been Fully Approved — AQ Society", html).catch(() => {});
    }
  } catch (e) { console.error("[Loans] Failed to generate PDF or send email on full approval:", e); }
}

async function _fullyApproveRepayment(repayment: any) {
  try {
    const loan = await getLoanById(repayment.loanId);
    if (!loan) return;
    const allRepayments = await getLoanRepayments(loan.id);
    // Determine repayment number: position among ALL repayments sorted chronologically (oldest=1)
    // This matches the UI instalment numbering which also counts all repayments regardless of status
    const allSorted = [...allRepayments].sort((a: any, b: any) =>
      new Date(a.paidAt ?? a.createdAt).getTime() - new Date(b.paidAt ?? b.createdAt).getTime()
    );
    const repaymentNumber = allSorted.findIndex((r: any) => r.id === repayment.id) + 1 || allRepayments.length;
    const waqfEndowed = allRepayments.reduce((s, r) => s + Number((r as any).waqfAmount ?? 0), 0);
    // Recalculate totalRepaid from actual approved repayments (including the one being approved now)
    // This fixes the stale-cache bug where totalRepaid on loan_applications was never updated after approval
    const approvedRepayments = allRepayments.filter((r: any) => r.status === 'approved' || r.id === repayment.id);
    const freshTotalRepaid = approvedRepayments.reduce((s: number, r: any) => s + parseFloat(String(r.amount ?? 0)), 0);
    const freshTotalRepaidStr = freshTotalRepaid.toFixed(2);
    // Update the cached totalRepaid on the loan record
    const dbForUpdate = await getDb();
    if (dbForUpdate) {
      await dbForUpdate.update(loanApplications).set({ totalRepaid: freshTotalRepaidStr } as any).where(eq(loanApplications.id, loan.id));
    }
    const pdfBuffer = await generateRepaymentPdf({
      repaymentId: repayment.id, loanId: loan.id,
      borrowerName: loan.borrowerName, borrowerEmail: loan.borrowerEmail, borrowerPhone: loan.borrowerPhone,
      borrowerTitle: (loan as any).borrowerTitle,
      amount: repayment.amount, paymentMethod: repayment.paymentMethod,
      paidAt: repayment.paidAt, loanAmount: loan.amount, totalRepaid: freshTotalRepaidStr,
      termMonths: loan.termMonths,
      adminApprovedByName: repayment.adminApprovedByName, adminApprovedAt: repayment.adminApprovedAt,
      trusteeName: repayment.trusteeName, trusteeApprovedAt: repayment.trusteeApprovedAt,
      notes: repayment.notes,
      waqfEndowed,
    });
    const fileKey = `loans/repayment-${repayment.id}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
    const db = await getDb();
    if (db) await db.update(loanRepayments).set({ confirmationPdfUrl: url, status: "approved" } as any).where(eq(loanRepayments.id, repayment.id));
    if (loan.borrowerEmail) {
      const firstName = (loan.borrowerName ?? '').split(' ')[0];
      const outstanding = Math.max(0, parseFloat(String(loan.amount)) - freshTotalRepaid - waqfEndowed);
      const whatsappPhone = (loan.borrowerPhone ?? '').replace(/[^0-9]/g, '');
      const waMsg = `Assalamu Alaikum wa Rahmatullahi wa Barakatuh ${firstName}, JazakAllahu Khayran for your Qarde Hasana Repayment No.${repaymentNumber} of £${parseFloat(String(repayment.amount)).toFixed(2)} to the Abdullah Quilliam Society. Outstanding Amanah balance: £${outstanding.toFixed(2)}. May Allah (SWT) bless you and accept this as Sadaqah Jariyah. Download receipt: ${url}`;
      const waLink = buildWhatsAppUrl(whatsappPhone, waMsg);
      const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#5C1A1A;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan &mdash; Repayment No.${repaymentNumber} Confirmed</p></div><div style="padding:24px;background:#fff"><p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p><p>May Allah (SWT) bless you and your family abundantly. We are pleased to confirm that your Project Milestone Repayment of <strong>&pound;${parseFloat(String(repayment.amount)).toFixed(2)}</strong> has been processed and sent by the Abdullah Quilliam Society on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}.</p><p>The Prophet (PBUH) said: <em>"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah."</em> May Allah (SWT) accept this as Sadaqah Jariyah for you and your loved ones.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Amount Paid</td><td style="padding:8px">&pound;${parseFloat(String(repayment.amount)).toFixed(2)}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Outstanding Balance</td><td style="padding:8px">&pound;${outstanding.toFixed(2)}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Confirmed By</td><td style="padding:8px">${repayment.adminApprovedByName ?? 'N/A'}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Trustee</td><td style="padding:8px">${repayment.trusteeName ?? 'N/A'}</td></tr></table><p><a href="${url}" style="display:inline-block;background:#5C1A1A;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold">Download Repayment Receipt (PDF)</a></p>${whatsappPhone ? `<p style="margin-top:16px"><a href="${waLink}" style="display:inline-block;background:#25D366;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">Open in WhatsApp</a></p>` : ''}<p>JazakAllahu Khayran,<br><strong>AQ Society Finance Team</strong><br><em>Abdullah Quilliam Society</em></p></div><div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">JazakAllahu Khayran — AQ Society Finance System</div></div>`;
      await sendGmail(loan.borrowerEmail, loan.borrowerName, `Qarde Hasana Repayment No.${repaymentNumber} Confirmed — JazakAllahu Khayran — AQ Society`, html).catch(() => {});
    }
  } catch (e) { console.error("[Loans] Failed to generate repayment PDF or send email:", e); }
}


/// ─── Payslip bulk analysis helper (extracted to avoid circular appRouter.createCaller reference) ──
async function _analyzePayslipBulk(input: { fileUrl: string; mimeType: string }) {
  const contentType = input.mimeType.startsWith("application/pdf") ? "file_url" : "image_url";
  const prompt = `You are a UK payroll document parser. This document may contain payslips for MULTIPLE employees (one per page or section).
Extract ALL employees and return a JSON array called "employees".
CRITICAL RULE FOR MONTH/YEAR: Use the PAYMENT DATE (e.g. "Paid on 31/01/2026") to determine month and year — NOT any internal month number like "Month 10". If the payment date says 31/01/2026 then month=1 and year=2026.
For each employee return:
{
  "employeeName": "string or null",
  "employeeId": "string or null",
  "taxCode": "string or null",
  "niNumber": "string or null",
  "period": "string or null (e.g. January 2026)",
  "month": number 1-12 (from payment date, NOT internal month number),
  "year": number (from payment date),
  "grossPay": number or null,
  "incomeTax": number or null,
  "nationalInsurance": number or null,
  "pensionContribution": number or null,
  "otherDeductions": number or null,
  "netPay": number or null,
  "paymentMethod": "bank_transfer|cheque|cash or null"
}
Return: { "employees": [ ...array of employee objects... ] }`;
  const userContent = contentType === "image_url"
    ? [{ type: "image_url" as const, image_url: { url: input.fileUrl } }]
    : [{ type: "file_url" as const, file_url: { url: input.fileUrl, mime_type: "application/pdf" as const } }];
  const llmResponse = await invokeLLM({
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: userContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "bulk_payslip_data",
        strict: true,
        schema: {
          type: "object",
          properties: {
            employees: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  employeeName: { type: ["string", "null"] },
                  employeeId: { type: ["string", "null"] },
                  taxCode: { type: ["string", "null"] },
                  niNumber: { type: ["string", "null"] },
                  period: { type: ["string", "null"] },
                  month: { type: ["number", "null"] },
                  year: { type: ["number", "null"] },
                  grossPay: { type: ["number", "null"] },
                  incomeTax: { type: ["number", "null"] },
                  nationalInsurance: { type: ["number", "null"] },
                  pensionContribution: { type: ["number", "null"] },
                  otherDeductions: { type: ["number", "null"] },
                  netPay: { type: ["number", "null"] },
                  paymentMethod: { type: ["string", "null"] },
                },
                required: ["employeeName", "employeeId", "taxCode", "niNumber", "period", "month", "year", "grossPay", "incomeTax", "nationalInsurance", "pensionContribution", "otherDeductions", "netPay", "paymentMethod"],
                additionalProperties: false,
              },
            },
          },
          required: ["employees"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = llmResponse.choices[0]?.message?.content ?? '{"employees":[]}';
  let parsed: { employees: Array<{
    employeeName: string | null; employeeId: string | null; taxCode: string | null; niNumber: string | null;
    period: string | null; month: number | null; year: number | null;
    grossPay: number | null; incomeTax: number | null; nationalInsurance: number | null;
    pensionContribution: number | null; otherDeductions: number | null; netPay: number | null;
    paymentMethod: string | null;
  }> };
  try {
    parsed = typeof content === "string" ? JSON.parse(content) : content;
    if (!parsed.employees) parsed = { employees: [] };
  } catch {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned malformed data \u2014 please try again or fill fields manually" });
  }
  return parsed;
}

// ─── MAIN ROUTER ─────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  localAuth: localAuthRouter,
  admin: adminRouter,
  backup: backupRouter,
  accommodation: accommodationRouter,
  fintech: fintechRouter,
  crm: crmRouter,
  donorsV3: donorsV3Router,
  payrollV3: payrollV3Router,
  commsV3: commsV3Router,
  meetingsV3: meetingsV3Router,
  commsInbox: commsInboxRouter,
  auditTrail: auditTrailRouter,
  systemHealth: systemHealthRouter,
  pledges: pledgesRouter,
  donorPipeline: donorPipelineRouter,
  majorDonor: majorDonorRouter,
  bulkApprovals: bulkApprovalsRouter,
  conflicts: conflictsRouter,
  savedViews: savedViewsRouter,
  qrCodes: qrCodesRouter,
  recognitionTiers: recognitionTiersRouter,
  bills: billsRouter,
  training: trainingRouter,
  lbmwGmail: lbmwGmailRouter,
  supplierContacts: supplierContactsRouter,
  aiScanner: aiScannerRouter,
  trusteeFinance: trusteeFinanceRouter,
  facilities: facilitiesRouter,
  bistro: bistroRouter,
  googleServices: googleServicesRouter,
  voice: voiceRouter,
  hibbaTools: hibbaToolsRouter,
  // --- SUCCESSIONN & DELEGATION ──────────────────────────────────────────────────
  succession: router({
    /** Get current succession status: who is the delegate, last owner activity, inactivity days */
    getStatus: ownerProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      // Find current delegate user
      const allUsers = await db.select().from(users);
      const delegate = allUsers.find((u: any) => u.isOwnerDelegate);
      // Find owner user
      const owner = allUsers.find((u: any) => u.openId === ENV.ownerOpenId);
      // Last 10 succession events
      const events = await db.select().from(successionEvents).orderBy(sql`triggeredAt DESC`).limit(10);
      // Get trustees for delegate picker
      const { trustees } = await import('../drizzle/schema');
      const allTrustees = await db.select().from(trustees).where(eq(trustees.isActive, true));
      return {
        delegate: delegate ? { id: delegate.id, name: delegate.name, role: delegate.role } : null,
        owner: owner ? { id: owner.id, name: owner.name, lastActiveAt: owner.lastSignedIn ?? null } : null,
        inactivityDays: owner?.lastSignedIn ? Math.floor((Date.now() - new Date(owner.lastSignedIn).getTime()) / 86400000) : null,
        events,
        trustees: allTrustees.map((t: any) => ({ id: t.id, name: t.fullName, role: t.role, email: t.email })),
      };
    }),

    /** Assign a trustee (by trustees.id) as the owner delegate */
    setDelegate: ownerProcedure
      .input(z.object({ trusteesId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { trustees } = await import('../drizzle/schema');
        const trustee = await db.select().from(trustees).where(eq(trustees.id, input.trusteesId)).limit(1);
        if (!trustee[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Trustee not found' });
        // Clear any existing delegate
        await db.update(users).set({ isOwnerDelegate: false });
        // Try to find matching user account by email
        let delegateUser: any = null;
        if (trustee[0].email) {
          const found = await db.select().from(users).where(eq(users.email, trustee[0].email)).limit(1);
          if (found[0]) {
            await db.update(users).set({ isOwnerDelegate: true }).where(eq(users.id, found[0].id));
            delegateUser = found[0];
          }
        }
        // Log succession event
        await db.insert(successionEvents).values({
          eventType: 'delegate_assigned',
          triggeredByUserId: ctx.user.id,
          delegateTrusteeId: trustee[0].id,
          delegateUserId: delegateUser?.id ?? null,
          notes: `Delegate assigned: ${trustee[0].fullName} (${trustee[0].role})`,
        });
        return { success: true, delegateName: trustee[0].fullName };
      }),

    /** Remove the current delegate */
    removeDelegate: ownerProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      await db.update(users).set({ isOwnerDelegate: false });
      await db.insert(successionEvents).values({
        eventType: 'delegate_removed',
        triggeredByUserId: ctx.user.id,
        notes: 'Delegate removed by owner',
      });
      return { success: true };
    }),

    /** Manually trigger succession (e.g. planned absence) — emails all trustees + NOK */
    triggerManual: ownerProcedure
      .input(z.object({ reason: z.string().min(1), notifyNok: z.boolean().default(false) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { trustees } = await import('../drizzle/schema');
        const allTrustees = await db.select().from(trustees).where(eq(trustees.isActive, true));
        const notified: { name: string; email: string }[] = [];
        for (const t of allTrustees) {
          if (!t.email) continue;
          const firstName = (t.fullName ?? '').split(' ').find((p: string) => !['Mr','Dr','Mrs','Ms'].includes(p)) ?? t.fullName ?? 'Trustee';
          const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><div style="background:#1a1a2e;padding:24px;"><h1 style="color:#c9a84c;margin:0;">AQ Society — Succession Notice</h1></div><div style="padding:24px;"><p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p><p>This is an official notice that a <strong>succession event</strong> has been triggered for the AQ Society administration system.</p><p><strong>Reason:</strong> ${input.reason}</p><p>The designated delegate trustee has been granted temporary administrative access. Please contact the AQ Society management team for further information.</p><p>JazakAllahu Khayran,<br><strong>AQ Society System</strong></p></div></div>`;
          try {
            await sendGmail(t.email, t.fullName ?? firstName, 'AQ Society — Succession Notice', html);
            notified.push({ name: t.fullName ?? firstName, email: t.email });
          } catch (e) { /* continue */ }
          // Notify NOK if requested
          if (input.notifyNok && t.nokEmail) {
            try {
              await sendGmail(t.nokEmail, t.nokName ?? 'Next of Kin', 'AQ Society — Succession Notice (Next of Kin)', html);
              notified.push({ name: t.nokName ?? 'NOK', email: t.nokEmail });
            } catch (e) { /* continue */ }
          }
        }
        await db.insert(successionEvents).values({
          eventType: 'manual_succession',
          triggeredByUserId: ctx.user.id,
          notes: input.reason,
          notifiedTrusteesJson: JSON.stringify(notified),
        });
        return { success: true, notifiedCount: notified.length };
      }),
  }),

  auth: router({
    me: publicProcedure.query(opts => {
      const user = opts.ctx.user;
      if (!user) return null;
      return { ...user, isOwner: isOwnerOrSuperAdmin(user) };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── CATEGORIES & DEPARTMENTS ─────────────────────────────────────────────

  categories: router({
    list: publicProcedure.query(async () => { await seedDefaultCategories(); return getAllCategories(); }),
    listByDepartment: protectedProcedure.input(z.object({ departmentId: z.number().optional() })).query(({ input }) => getExpenseCategories(input.departmentId)),
    seed: adminProcedure.mutation(async () => { await seedDepartmentsAndCategories(); return { success: true }; }),
    create: adminProcedure
      .input(z.object({ name: z.string().min(1), departmentId: z.number().optional(), color: z.string().optional(), icon: z.string().optional() }))
      .mutation(({ input }) => createExpenseCategory(input)),
  }),

  departments: router({
    list: protectedProcedure.query(() => getDepartments()),
    create: adminProcedure
      .input(z.object({ name: z.string().min(1), description: z.string().optional(), color: z.string().optional() }))
      .mutation(({ input }) => createDepartment(input)),
  }),

  // ─── RECEIPTS ─────────────────────────────────────────────────────────────

  receipts: router({
    list: protectedProcedure
      .input(z.object({
        categoryName: z.string().optional(), vendor: z.string().optional(),
        dateFrom: z.string().optional(), dateTo: z.string().optional(),
        status: z.string().optional(), departmentId: z.number().optional(),
        userId: z.number().optional(), limit: z.number().min(1).max(100).default(50), offset: z.number().min(0).default(0),
      }))
      .query(async ({ ctx, input }) => {
        const userId = isAdmin(ctx.user.role) && input.userId ? input.userId : isAdmin(ctx.user.role) && !input.userId ? undefined : ctx.user.id;
        return listReceipts({ ...input, userId, dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined, dateTo: input.dateTo ? new Date(input.dateTo) : undefined });
      }),

    // Admin-only: list all receipts across all users with submitter info
    adminList: adminProcedure
      .input(z.object({
        userId: z.number().optional(),
        dateFrom: z.string().optional(), dateTo: z.string().optional(),
        status: z.string().optional(), categoryName: z.string().optional(),
        limit: z.number().min(1).max(200).default(100), offset: z.number().min(0).default(0),
      }))
      .query(async ({ input }) => {
        return listAllReceipts({
          allUsers: true,
          userId: input.userId,
          dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
          dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
          status: input.status,
          categoryName: input.categoryName,
          limit: input.limit,
          offset: input.offset,
        });
      }),

    create: protectedProcedure
      .input(z.object({
        amount: z.union([z.string(), z.number()]).transform(v => String(v)).refine(v => { const n = parseFloat(v); return !isNaN(n) && n > 0; }, { message: "Amount must be a positive number" }),
        description: z.string().optional(),
        vendor: z.string().optional(),
        date: z.string().optional(),
        department: z.union([z.string(), z.number()]).optional().transform(v => v != null ? String(v) : undefined),
        notes: z.string().optional(),
        imageUrl: z.string().optional(),
        categoryName: z.string().optional(),
        imageHash: z.string().optional(),
        fundAllocation: z.array(z.object({ fund: z.string(), amount: z.number() })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const amountNum = parseFloat(input.amount) || 0;
        const secondApproverRequired = amountNum >= 500;
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { receipts: receiptsTable } = await import("../drizzle/schema");

        // ── Restricted fund guard ──────────────────────────────────────────────
        // If any fundAllocation entry names a restricted campaign, only trustees
        // and superadmins may record expenditure against it.
        if (input.fundAllocation && input.fundAllocation.length > 0) {
          const { fundraisingCampaigns } = await import("../drizzle/schema");
          const { like, or: orClause } = await import("drizzle-orm");
          const fundNames = input.fundAllocation.map((f: { fund: string }) => f.fund);
          const conditions = fundNames.map((name: string) => like(fundraisingCampaigns.name, `%${name.substring(0, 40)}%`));
          if (conditions.length > 0) {
            const restrictedCampaigns = await db.select({ id: fundraisingCampaigns.id, isRestricted: fundraisingCampaigns.isRestricted })
              .from(fundraisingCampaigns)
              .where(orClause(...conditions))
              .limit(10);
            const hasRestricted = restrictedCampaigns.some((c: any) => c.isRestricted);
            if (hasRestricted && !['superadmin', 'trustee'].includes(ctx.user.role)) {
              throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'Expenditure against a restricted fund requires Trustee or Super Admin authorisation.',
              });
            }
          }
        }

        const id = await createReceipt({
          userId: ctx.user.id,
          amount: input.amount,
          vendor: input.vendor ?? input.description,
          departmentName: input.department,
          notes: input.notes,
          imageUrl: input.imageUrl,
          categoryName: input.categoryName,
          status: "pending",
        });
        // Patch the extra fields not in createReceipt helper
        await db.update(receiptsTable).set({
          imageHash: input.imageHash ?? null,
          secondApproverRequired,
          fundAllocation: input.fundAllocation ?? null,
        } as any).where(eq(receiptsTable.id, id));
        if (secondApproverRequired) {
          await notifyOwner({
            title: `£500+ Receipt Requires Second Approval`,
            content: `A receipt for £${amountNum.toFixed(2)} submitted by ${ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`} requires a second approver. Receipt ID: #${id}. Please review in the Expenses module.`,
          });
        }
        return { id, secondApproverRequired };
      }),

    // Check for duplicate receipt by image hash or fuzzy match (same vendor + amount + date within 7 days)
    checkDuplicate: protectedProcedure
      .input(z.object({
        imageHash: z.string().optional(),
        vendor: z.string().optional(),
        amount: z.string().optional(),
        date: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { isDuplicate: false, matches: [] };
        const { receipts: receiptsTable } = await import("../drizzle/schema");
        const { like, gte, lte } = await import("drizzle-orm");
        let matches: any[] = [];
        // 1. Exact hash match
        if (input.imageHash) {
          const hashMatches = await db.select({
            id: receiptsTable.id,
            vendor: receiptsTable.vendor,
            amount: receiptsTable.amount,
            createdAt: receiptsTable.createdAt,
            imageHash: (receiptsTable as any).imageHash,
          }).from(receiptsTable)
            .where(eq((receiptsTable as any).imageHash, input.imageHash))
            .limit(3);
          matches = [...matches, ...hashMatches.map((m: any) => ({ ...m, matchType: "exact_hash" }))];
        }
        // 2. Fuzzy match: same vendor + amount within 7 days
        if (input.vendor && input.amount && matches.length === 0) {
          const amountNum = parseFloat(input.amount);
          const dateBase = input.date ? new Date(input.date) : new Date();
          const windowStart = new Date(dateBase.getTime() - 7 * 24 * 60 * 60 * 1000);
          const windowEnd = new Date(dateBase.getTime() + 7 * 24 * 60 * 60 * 1000);
          const fuzzyMatches = await db.select({
            id: receiptsTable.id,
            vendor: receiptsTable.vendor,
            amount: receiptsTable.amount,
            createdAt: receiptsTable.createdAt,
          }).from(receiptsTable)
            .where(and(
              like(receiptsTable.vendor, `%${input.vendor.slice(0, 20)}%`),
              gte(receiptsTable.createdAt, windowStart),
              lte(receiptsTable.createdAt, windowEnd),
            ))
            .limit(5);
          const fuzzy = fuzzyMatches.filter((m: any) => {
            const diff = Math.abs(parseFloat(m.amount ?? "0") - amountNum);
            return diff < 0.01;
          });
          matches = [...matches, ...fuzzy.map((m: any) => ({ ...m, matchType: "fuzzy" }))];
        }
        return { isDuplicate: matches.length > 0, matches };
      }),

    // Second approver sign-off (admin/trustee only)
    secondApprove: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { receipts: receiptsTable } = await import("../drizzle/schema");
        const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, input.id)).limit(1);
        if (!receipt) throw new TRPCError({ code: "NOT_FOUND" });
        if (!(receipt as any).secondApproverRequired) throw new TRPCError({ code: "BAD_REQUEST", message: "Second approval not required for this receipt" });
        if ((receipt as any).secondApprovedById) throw new TRPCError({ code: "BAD_REQUEST", message: "Already second-approved" });
        if (receipt.approvedById === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Second approver must be a different person from the first approver" });
        await db.update(receiptsTable).set({
          secondApprovedById: ctx.user.id,
          secondApprovedByName: ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`,
          secondApprovedAt: new Date(),
          status: "approved",
        } as any).where(eq(receiptsTable.id, input.id));
        await logAudit({ userId: ctx.user.id, userName: ctx.user.name ?? ctx.user.email ?? undefined, action: "second_approve", entity: "receipt", entityId: input.id });
        return { success: true };
      }),
    listPendingSecondApproval: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const { receipts: receiptsTable } = await import("../drizzle/schema");
      const rows = await db.select().from(receiptsTable)
        .where(and(eq((receiptsTable as any).secondApproverRequired, 1), isNull((receiptsTable as any).secondApprovedAt)))
        .orderBy(desc(receiptsTable.createdAt))
        .limit(50);
      return rows;
    }),
    // Admin-only: list all active users (for filter dropdown)
    adminUserList: adminProcedure.query(async () => {
      const { rows } = await listAllUsers(200, 0);
      return rows.filter(u => u.status === 'active').map(u => ({
        id: u.id,
        displayName: u.fullName ?? u.name ?? `User #${u.id}`,
        role: u.role,
      }));
    }),

    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const receipt = await getReceiptById(input.id);
      if (!receipt) throw new TRPCError({ code: "NOT_FOUND" });
      if (!isAdmin(ctx.user.role) && receipt.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      return receipt;
    }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(), vendor: z.string().optional(), receiptDate: z.string().optional(),
        amount: z.string().optional(), tax: z.string().optional(), categoryName: z.string().optional(),
        departmentId: z.number().optional(), notes: z.string().optional(), currency: z.string().optional(),
        lineItems: z.array(z.object({ description: z.string(), amount: z.number() })).optional(),
        status: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const receipt = await getReceiptById(input.id);
        if (!receipt) throw new TRPCError({ code: "NOT_FOUND" });
        if (!isAdmin(ctx.user.role) && receipt.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const { id, receiptDate, ...rest } = input;
        await updateReceipt(id, { ...rest, status: rest.status as any, receiptDate: receiptDate ? new Date(receiptDate) : undefined });
        return { success: true };
      }),

    delete: superAdminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const receipt = await getReceiptById(input.id);
      if (!receipt) throw new TRPCError({ code: "NOT_FOUND" });
      assertCanDelete(ctx.user);
      await deleteReceipt(input.id);
      await logAudit({ userId: ctx.user.id, userName: ctx.user.name ?? ctx.user.email ?? undefined, action: "delete", entity: "receipt", entityId: input.id, meta: { vendor: (receipt as any).vendor, amount: (receipt as any).amount } });
      return { success: true };
    }),

    // Returns whether the current user can delete a given receipt (for UI)
    canDelete: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const receipt = await getReceiptById(input.id);
      if (!receipt) return { allowed: false, reason: 'Not found' };
      const allowed = canDelete(ctx.user);
      const ageMs = receipt.createdAt ? Date.now() - new Date(receipt.createdAt).getTime() : Infinity;
      const remainingMs = Math.max(0, 10 * 60 * 1000 - ageMs);
      return { allowed, remainingMs, isSuperAdmin: ctx.user.role === 'superadmin' || ctx.user.role === 'trustee' };
    }),

    categoryTotals: protectedProcedure
      .input(z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional(), userId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const targetUserId = isAdmin(ctx.user.role) ? (input.userId ?? ctx.user.id) : ctx.user.id;
        return getCategoryTotals(targetUserId, input.dateFrom ? new Date(input.dateFrom) : undefined, input.dateTo ? new Date(input.dateTo) : undefined);
      }),

    process: protectedProcedure.input(z.object({ receiptId: z.number() })).mutation(async ({ ctx, input }) => {
      const receipt = await getReceiptById(input.receiptId);
      if (!receipt) throw new TRPCError({ code: "NOT_FOUND" });
      if (!isAdmin(ctx.user.role) && receipt.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (!receipt.imageUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "No image URL" });
      await updateReceipt(input.receiptId, { status: "processing" });
      try {
        const extracted = await extractReceiptData(receipt.imageUrl, receipt.mimeType ?? "image/jpeg");

        // ── OCR confidence threshold: flag low-confidence scans for manual review ──
        const OCR_CONFIDENCE_THRESHOLD = 0.4;
        if (extracted.confidence != null && extracted.confidence < OCR_CONFIDENCE_THRESHOLD) {
          await updateReceipt(input.receiptId, {
            status: "failed",
            rawText: extracted.rawText ?? undefined,
            notes: `Low OCR confidence (${(extracted.confidence * 100).toFixed(0)}%). Please review manually — the image may be blurry, blank, or unreadable.`,
          });
          return {
            success: false,
            lowConfidence: true,
            confidence: extracted.confidence,
            message: `OCR confidence too low (${(extracted.confidence * 100).toFixed(0)}%). Please upload a clearer image or enter the details manually.`,
          };
        }

        const receiptDate = extracted.date ? new Date(extracted.date) : undefined;
        await updateReceipt(input.receiptId, {
          vendor: extracted.vendor ?? undefined, receiptDate,
          amount: extracted.amount != null ? String(extracted.amount) : undefined,
          tax: extracted.tax != null ? String(extracted.tax) : undefined,
          currency: extracted.currency ?? "GBP", categoryName: extracted.categoryName ?? "Other",
          lineItems: extracted.lineItems, rawText: extracted.rawText ?? undefined, status: "processed",
        });
        const updatedReceipt = await getReceiptById(input.receiptId);
        await notifyOwner({ title: "New Receipt Processed", content: `Receipt from "${extracted.vendor ?? "Unknown"}" for £${extracted.amount ?? 0} categorised as "${extracted.categoryName}" (confidence: ${(extracted.confidence * 100).toFixed(0)}%).` }).catch(() => {});
        if (receiptDate) {
          const monthlyTotal = await getMonthlyTotal(ctx.user.id, receiptDate.getFullYear(), receiptDate.getMonth() + 1);
          if (monthlyTotal > 5000) {
            await notifyOwner({ title: "Monthly Expense Threshold Exceeded", content: `Monthly expenses exceeded £5,000. Current total: £${monthlyTotal.toFixed(2)}.` }).catch(() => {});
          }
        }
        return { success: true, data: updatedReceipt };
      } catch (err) {
        await updateReceipt(input.receiptId, { status: "failed" });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to process receipt" });
      }
    }),

    exportCsv: protectedProcedure
      .input(z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional(), categoryName: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const { rows } = await listReceipts({ userId: ctx.user.id, categoryName: input.categoryName, dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined, dateTo: input.dateTo ? new Date(input.dateTo) : undefined, limit: 10000 });
        const headers = ["ID", "Vendor", "Date", "Amount", "Tax", "Currency", "Category", "Status", "Notes", "Created At"];
        const csvRows = rows.map(r => [r.id, `"${(r.vendor ?? "").replace(/"/g, '""')}"`, r.receiptDate ? new Date(r.receiptDate).toISOString().split("T")[0] : "", r.amount ?? "", r.tax ?? "", r.currency ?? "GBP", `"${(r.categoryName ?? "").replace(/"/g, '""')}"`, r.status, `"${(r.notes ?? "").replace(/"/g, '""')}"`, new Date(r.createdAt).toISOString()]);
        return { csv: [headers.join(","), ...csvRows.map(r => r.join(","))].join("\n"), count: rows.length };
      }),
    // ── Expense auto-link ────────────────────────────────────────────────────
    suggestExpenseLink: protectedProcedure
      .input(z.object({ receiptId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const { receipts: receiptsTable, payrollRecords, volunteerPayments } = await import("../drizzle/schema");
        const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, input.receiptId)).limit(1);
        if (!receipt || !receipt.amount) return [];
        const amount = parseFloat(String(receipt.amount));
        const dateFrom = receipt.receiptDate ? new Date(receipt.receiptDate.getTime() - 7 * 86400000) : undefined;
        const dateTo = receipt.receiptDate ? new Date(receipt.receiptDate.getTime() + 7 * 86400000) : undefined;
        const payrollMatches = await db.select({
          id: payrollRecords.id,
          type: sql<string>`'payroll'`,
          label: payrollRecords.employeeName,
          amount: payrollRecords.netPay,
          date: payrollRecords.createdAt,
        }).from(payrollRecords)
          .where(and(
            sql`ABS(CAST(${payrollRecords.netPay} AS DECIMAL) - ${amount}) / ${amount} < 0.05`,
            dateFrom ? gte(payrollRecords.createdAt, dateFrom) : undefined,
            dateTo ? lte(payrollRecords.createdAt, dateTo) : undefined,
          ) as any).limit(5);
        const volunteerMatches = await db.select({
          id: volunteerPayments.id,
          type: sql<string>`'volunteer'`,
          label: volunteerPayments.recipientName,
          amount: volunteerPayments.amount,
          date: volunteerPayments.createdAt,
        }).from(volunteerPayments)
          .where(and(
            sql`ABS(CAST(${volunteerPayments.amount} AS DECIMAL) - ${amount}) / ${amount} < 0.05`,
            dateFrom ? gte(volunteerPayments.createdAt, dateFrom) : undefined,
            dateTo ? lte(volunteerPayments.createdAt, dateTo) : undefined,
          ) as any).limit(5);
        return [...payrollMatches, ...volunteerMatches];
      }),
    confirmExpenseLink: protectedProcedure
      .input(z.object({
        receiptId: z.number(),
        linkedExpenseId: z.number(),
        linkedExpenseNote: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { receipts: receiptsTable } = await import("../drizzle/schema");
        await db.update(receiptsTable)
          .set({ linkedExpenseId: input.linkedExpenseId, linkedExpenseNote: input.linkedExpenseNote ?? null } as any)
          .where(eq(receiptsTable.id, input.receiptId));
        return { success: true };
      }),
  }),
  upload: router({
    getUploadUrl: protectedProcedure
      .input(z.object({ filename: z.string(), mimeType: z.string(), sizeBytes: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (input.sizeBytes > 16 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 16MB)" });
        const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
        if (!allowed.includes(input.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported file type" });
        const ext = input.filename.split(".").pop() ?? "jpg";
        const key = `receipts/${ctx.user.id}/${randomSuffix()}.${ext}`;
        const receiptId = await createReceipt({ userId: ctx.user.id, originalFilename: input.filename, mimeType: input.mimeType, status: "pending" });
        return { receiptId, key, mimeType: input.mimeType };
      }),

    confirmUpload: protectedProcedure
      .input(z.object({ receiptId: z.number(), imageUrl: z.string().url(), thumbnailUrl: z.string().url().optional() }))
      .mutation(async ({ ctx, input }) => {
        const receipt = await getReceiptById(input.receiptId);
        if (!receipt) throw new TRPCError({ code: "NOT_FOUND" });
        if (receipt.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await updateReceipt(input.receiptId, { imageUrl: input.imageUrl, thumbnailUrl: input.thumbnailUrl ?? input.imageUrl, status: "pending" });
        return { success: true };
      }),
  }),

  // ─── DASHBOARD ────────────────────────────────────────────────────────────

  dashboard: router({
    stats: adminProcedure
      .input(z.object({ startDate: z.date().optional(), endDate: z.date().optional() }))
      .query(({ input }) => getDashboardStats(input.startDate, input.endDate)),
    receiptStats: adminProcedure.query(() => getAdminReceiptStats()),
    bankBalance: adminProcedure.query(async () => {
      const { reconciliationSessions } = await import('../drizzle/schema');
      const db = await getDb();
      if (!db) return null;
      const sessions = await db.select().from(reconciliationSessions)
        .orderBy(desc(reconciliationSessions.year), desc(reconciliationSessions.month))
        .limit(1);
      if (!sessions[0]) return null;
      return { balance: sessions[0].bankBalance, month: sessions[0].month, year: sessions[0].year, status: sessions[0].status };
    }),
    donationTrends: adminProcedure.query(async () => {
      const { fundraisingDonations } = await import('../drizzle/schema');
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select({
        month: sql<string>`DATE_FORMAT(${fundraisingDonations.createdAt}, '%b')`,
        year: sql<number>`YEAR(${fundraisingDonations.createdAt})`,
        total: sql<number>`COALESCE(SUM(CAST(${fundraisingDonations.amount} AS DECIMAL(12,2))), 0)`,
      }).from(fundraisingDonations)
        .where(sql`${fundraisingDonations.createdAt} >= DATE_SUB(NOW(), INTERVAL 6 MONTH)`)
        .groupBy(sql`YEAR(${fundraisingDonations.createdAt})`, sql`MONTH(${fundraisingDonations.createdAt})`, sql`DATE_FORMAT(${fundraisingDonations.createdAt}, '%b')`)
        .orderBy(sql`YEAR(${fundraisingDonations.createdAt})`, sql`MONTH(${fundraisingDonations.createdAt})`);
      return rows.map(r => ({ month: r.month, donations: Number(r.total) }));
    }),
    cashflowProjection: adminProcedure.query(async () => {
      const { incomeRecords, receipts: receiptsTable } = await import('../drizzle/schema');
      const db = await getDb();
      if (!db) return { projectedIncome: 0, projectedExpenses: 0, netCashflow: 0, confidence: 'low' };
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const [incomeRows, expenseRows] = await Promise.all([
        db.select({ total: sql<number>`COALESCE(SUM(CAST(${incomeRecords.amount} AS DECIMAL(12,2))), 0)` })
          .from(incomeRecords).where(sql`${incomeRecords.createdAt} >= ${thirtyDaysAgo}`),
        db.select({ total: sql<number>`COALESCE(SUM(CAST(${receiptsTable.amount} AS DECIMAL(12,2))), 0)` })
          .from(receiptsTable).where(sql`${receiptsTable.createdAt} >= ${sixtyDaysAgo} AND ${receiptsTable.status} = 'approved'`),
      ]);
      const avgIncome = Number(incomeRows[0]?.total ?? 0);
      const avgExpenses = Number(expenseRows[0]?.total ?? 0) / 2;
      return {
        projectedIncome: Math.round(avgIncome),
        projectedExpenses: Math.round(avgExpenses),
        netCashflow: Math.round(avgIncome - avgExpenses),
        confidence: avgIncome > 0 ? 'medium' : 'low',
      };
    }),
    thisWeek: adminProcedure.query(async () => {
      const { complianceActions, trainingRecords, accommodationTenants } = await import('../drizzle/schema');
      const db = await getDb();
      if (!db) return { dueActions: 0, trainingDue: 0, rentDue: 0, upcomingRenewals: 0 };
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const todayStr = today.toISOString().split('T')[0];
      const nextWeekStr = nextWeek.toISOString().split('T')[0];
      const [actionRows, trainingRows, rentRows] = await Promise.all([
        db.select({ n: sql<number>`count(*)` }).from(complianceActions)
          .where(sql`${complianceActions.dueDate} BETWEEN ${todayStr} AND ${nextWeekStr} AND ${complianceActions.status} != 'completed'`),
        db.select({ n: sql<number>`count(*)` }).from(trainingRecords)
          .where(sql`${trainingRecords.expiresAt} BETWEEN ${todayStr} AND ${nextWeekStr}`),
        db.select({ n: sql<number>`count(*)` }).from(accommodationTenants)
          .where(sql`DAY(CURDATE()) BETWEEN 1 AND 7 AND ${accommodationTenants.status} = 'active'`),
      ]);
      return {
        dueActions: Number(actionRows[0]?.n ?? 0),
        trainingDue: Number(trainingRows[0]?.n ?? 0),
        rentDue: Number(rentRows[0]?.n ?? 0),
        upcomingRenewals: 0,
      };
    }),
  }),

  // ─── USER MANAGEMENT ──────────────────────────────────────────────────────

  users: router({
    list: adminProcedure.input(z.object({ limit: z.number().default(100), offset: z.number().default(0) })).query(({ input }) => listAllUsers(input.limit, input.offset)),
    pending: adminProcedure.query(() => getPendingUsers()),

    approve: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ ctx, input }) => {
      await approveUser(input.userId, ctx.user.id);
      const user = await getUserById(input.userId);
      if (user?.email) {
        await sendGmail(user.email, user.name ?? "User", "Your AQ Society account has been approved",
          `<h2>Welcome to Abdullah Quilliam Society Finance System</h2><p>Dear ${user.name},</p><p>Your account has been approved. You can now log in.</p>`
        ).catch(() => {});
      }
      return { success: true };
    }),

    reject: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ input }) => { await rejectUser(input.userId); return { success: true }; }),
    updateRole: superAdminProcedure.input(z.object({ userId: z.number(), role: z.string() })).mutation(async ({ input }) => { await updateUserRole(input.userId, input.role); return { success: true }; }),
    suspend: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ input }) => { await setUserActive(input.userId, false); return { success: true }; }),
    restore: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ input }) => { await setUserActive(input.userId, true); return { success: true }; }),
    setDelegate: superAdminProcedure.input(z.object({ delegateId: z.number().nullable() })).mutation(async ({ ctx, input }) => { await setDelegateApprover(ctx.user.id, input.delegateId); return { success: true }; }),
    getPermissions: adminProcedure.input(z.object({ userId: z.number() })).query(({ input }) => getUserPermissions(input.userId)),
    updatePermissions: protectedProcedure
      .use(({ ctx, next }) => {
        if (ctx.user.role !== 'superadmin' && ctx.user.role !== 'trustee' && ctx.user.role !== 'admin')
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only superadmin or trustee can change permissions' });
        return next({ ctx });
      })
      .input(z.object({
        userId: z.number(),
        canViewDashboard: z.boolean().optional(), canManageExpenses: z.boolean().optional(),
        canViewAllExpenses: z.boolean().optional(), canManageFundraising: z.boolean().optional(),
        canManageLoans: z.boolean().optional(), canSignLoans: z.boolean().optional(),
        canManageIncome: z.boolean().optional(), canManagePayroll: z.boolean().optional(),
        canViewOwnPayslip: z.boolean().optional(), canManageDonors: z.boolean().optional(),
        canSendCampaigns: z.boolean().optional(), canManageStaff: z.boolean().optional(),
        canManageUsers: z.boolean().optional(), canExportReports: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => { const { userId, ...perms } = input; await upsertUserPermissions(userId, perms); return { success: true }; }),

    createStaff: protectedProcedure
      .use(({ ctx, next }) => {
        if (ctx.user.role !== 'superadmin' && ctx.user.role !== 'admin')
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only superadmin can create staff accounts' });
        return next({ ctx });
      })
      .input(z.object({
        name: z.string().min(2),
        email: z.string().email(),
        role: z.enum(['manager', 'deputy', 'assistant', 'volunteer', 'trustee', 'property_manager']),
        supervisedById: z.number().optional(),
        isPropertyManager: z.boolean().default(false),
        jobTitle: z.string().optional(),
        department: z.string().optional(),
        phone: z.string().optional(),
        tempPassword: z.string().min(8),
      }))
      .mutation(async ({ ctx, input }) => {
        const bcrypt = await import('bcryptjs');
        const passwordHash = await bcrypt.hash(input.tempPassword, 10);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { users: usersTable } = await import('../drizzle/schema');
        // Check email not already taken
        const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, input.email)).limit(1);
        if (existing.length > 0) throw new TRPCError({ code: 'CONFLICT', message: 'Email already in use' });
        const [result] = await db.insert(usersTable).values({
          name: input.name,
          email: input.email,
          loginMethod: 'local',
          role: input.role as any,
          status: 'active',
          isActive: true,
          passwordHash,
          supervisedById: input.supervisedById ?? null,
          isPropertyManager: input.isPropertyManager,
          jobTitle: input.jobTitle ?? null,
          department: input.department ?? null,
          phone: input.phone ?? null,
          approvedById: ctx.user.id,
          approvedAt: new Date(),
        });
        // Send welcome email
        await sendGmail(input.email, input.name, 'Your AQS Finance System Account',
          `<h2>Welcome to AQS Finance System</h2><p>Dear ${input.name},</p><p>Your account has been created by the system administrator.</p><p><strong>Login:</strong> ${input.email}<br><strong>Temporary Password:</strong> ${input.tempPassword}</p><p>Please log in and change your password immediately.</p>`
        ).catch(() => {});
        return { success: true, userId: (result as any).insertId };
      }),

    updateSupervision: protectedProcedure
      .use(({ ctx, next }) => {
        if (ctx.user.role !== 'superadmin' && ctx.user.role !== 'admin')
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only superadmin can update supervision' });
        return next({ ctx });
      })
      .input(z.object({ userId: z.number(), supervisedById: z.number().nullable(), isPropertyManager: z.boolean().optional() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { users: usersTable } = await import('../drizzle/schema');
        await db.update(usersTable).set({
          supervisedById: input.supervisedById,
          ...(input.isPropertyManager !== undefined ? { isPropertyManager: input.isPropertyManager } : {}),
        }).where(eq(usersTable.id, input.userId));
        return { success: true };
      }),

    // ─── Morning Brief Controls ────────────────────────────────────────────────
    getMorningBriefSettings: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { globalEnabled: true, users: [], trustees: [] };
      const { systemSettings, users: usersTable, trustees: trusteesTable } = await import('../drizzle/schema');
      // Get global toggle
      const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'morningBriefEnabled')).limit(1);
      const globalEnabled = setting ? setting.value === 'true' : true;
      // Get all active users with their receiveMorningBrief flag
      const userRows = await db.select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        receiveMorningBrief: usersTable.receiveMorningBrief,
      }).from(usersTable).where(eq(usersTable.isActive, true)).orderBy(usersTable.name);
      // Get all active trustees
      const trusteeRows = await db.select({
        id: trusteesTable.id,
        name: trusteesTable.fullName,
        email: trusteesTable.email,
        role: trusteesTable.role,
        receiveMorningBrief: trusteesTable.receiveMorningBrief,
      }).from(trusteesTable).where(eq(trusteesTable.isActive, true)).orderBy(trusteesTable.seniorityOrder);
      return { globalEnabled, users: userRows, trustees: trusteeRows };
    }),

    setMorningBriefGlobal: superAdminProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { systemSettings } = await import('../drizzle/schema');
        await db.insert(systemSettings).values({ key: 'morningBriefEnabled', value: String(input.enabled) })
          .onDuplicateKeyUpdate({ set: { value: String(input.enabled) } });
        return { success: true };
      }),

    setUserMorningBrief: superAdminProcedure
      .input(z.object({ userId: z.number(), receive: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { users: usersTable } = await import('../drizzle/schema');
        await db.update(usersTable).set({ receiveMorningBrief: input.receive }).where(eq(usersTable.id, input.userId));
        return { success: true };
      }),

    // ─── 9am Brief Controls ───────────────────────────────────────────────────
    get9amBriefSettings: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { globalEnabled: true, users: [], trustees: [] };
      const { systemSettings, users: usersTable, trustees: trusteesTable } = await import('../drizzle/schema');
      const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'nineAmBriefEnabled')).limit(1);
      const globalEnabled = setting ? setting.value === 'true' : true;
      const userRows = await db.select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        receive9amBrief: usersTable.receive9amBrief,
      }).from(usersTable).where(eq(usersTable.isActive, true)).orderBy(usersTable.name);
      const trusteeRows = await db.select({
        id: trusteesTable.id,
        name: trusteesTable.fullName,
        email: trusteesTable.email,
        role: trusteesTable.role,
        receive9amBrief: trusteesTable.receive9amBrief,
      }).from(trusteesTable).where(eq(trusteesTable.isActive, true)).orderBy(trusteesTable.seniorityOrder);
      return { globalEnabled, users: userRows, trustees: trusteeRows };
    }),

    set9amBriefGlobal: superAdminProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { systemSettings } = await import('../drizzle/schema');
        await db.insert(systemSettings).values({ key: 'nineAmBriefEnabled', value: String(input.enabled) })
          .onDuplicateKeyUpdate({ set: { value: String(input.enabled) } });
        return { success: true };
      }),

    setUser9amBrief: superAdminProcedure
      .input(z.object({ userId: z.number(), receive: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { users: usersTable } = await import('../drizzle/schema');
        await db.update(usersTable).set({ receive9amBrief: input.receive }).where(eq(usersTable.id, input.userId));
        return { success: true };
      }),

    setTrusteeMorningBrief: superAdminProcedure
      .input(z.object({ trusteeId: z.number(), receive: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { trustees: trusteesTable } = await import('../drizzle/schema');
        await db.update(trusteesTable).set({ receiveMorningBrief: input.receive }).where(eq(trusteesTable.id, input.trusteeId));
        return { success: true };
      }),

    setTrustee9amBrief: superAdminProcedure
      .input(z.object({ trusteeId: z.number(), receive: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { trustees: trusteesTable } = await import('../drizzle/schema');
        await db.update(trusteesTable).set({ receive9amBrief: input.receive }).where(eq(trusteesTable.id, input.trusteeId));
        return { success: true };
      }),
  }),

  // ─── FUNDRAISING ──────────────────────────────────────────────────────────

  fundraising: router({
    listCampaigns: protectedProcedure.query(() => getFundraisingCampaigns()),
    getDonationsByDonor: adminProcedure
      .input(z.object({ donorId: z.number().int(), limit: z.number().default(50) }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const { fundraisingDonations: fd, fundraisingCampaigns: fc, donors: dt } = await import("../drizzle/schema");
        // Get donor email/name first
        const [donorRow] = await db.select({ email: dt.email, name: dt.name }).from(dt).where(eq(dt.id, input.donorId)).limit(1);
        if (!donorRow) return [];
        const rows = await db.select({
          id: fd.id, amount: fd.amount, donatedAt: fd.donatedAt,
          paymentMethod: fd.paymentMethod, giftAidDeclared: fd.giftAidDeclared,
          notes: fd.notes, campaignId: fd.campaignId, campaignName: fc.name,
          donorName: fd.donorName, donorEmail: fd.donorEmail,
        }).from(fd)
          .leftJoin(fc, eq(fd.campaignId, fc.id))
          .where(donorRow.email
            ? sql`${fd.donorEmail} = ${donorRow.email}`
            : sql`${fd.donorName} = ${donorRow.name}`)
          .orderBy(desc(fd.donatedAt))
          .limit(input.limit);
        return rows;
      }),
    getCampaign: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const campaign = await getCampaignById(input.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      const [items, donations] = await Promise.all([getCampaignItems(input.id), getCampaignDonations(input.id)]);
      return { ...campaign, items, donations };
    }),
    createCampaign: adminProcedure
      .input(z.object({ name: z.string(), description: z.string().optional(), targetAmount: z.string(), startDate: z.date().optional(), endDate: z.date().optional(), imageUrl: z.string().optional() }))
      .mutation(async ({ ctx, input }) => createFundraisingCampaign({ name: input.name, description: input.description, targetAmount: input.targetAmount, startDate: input.startDate, endDate: input.endDate, imageUrl: input.imageUrl })),
    recordDonation: adminProcedure
      .input(z.object({ campaignId: z.number(), donorName: z.string().optional(), donorEmail: z.string().optional(), amount: z.string(), paymentMethod: z.string().default("cash"), isGiftAid: z.boolean().default(false), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const d = await createDonation({ campaignId: input.campaignId, donorName: input.donorName ?? "Anonymous", donorEmail: input.donorEmail, amount: input.amount, paymentMethod: input.paymentMethod as any, notes: input.notes });
        await updateCampaignAmount(input.campaignId, parseFloat(input.amount));
        await logAudit({ userId: ctx.user.id, userName: ctx.user.name ?? ctx.user.email ?? undefined, action: "create", entity: "donation", entityId: (d as any)?.id, meta: { campaignId: input.campaignId, amount: input.amount, donorName: input.donorName } });
        // Charity Commission SIR requirement: anonymous donations >= £5,000 must be reported
        const donorIsAnonymous = !input.donorName || input.donorName.trim().toLowerCase() === "anonymous";
        const donationAmountNum = parseFloat(input.amount);
        if (donorIsAnonymous && donationAmountNum >= 5000) {
          await notifyOwner({
            title: `🚨 Anonymous Donation ≥ £5,000 — Serious Incident Report May Be Required`,
            content: `An anonymous donation of £${donationAmountNum.toLocaleString()} has been recorded (Campaign ID: ${input.campaignId}). Under Charity Commission guidance, anonymous donations of £5,000 or more may require a Serious Incident Report. Please review and file via the Major Donor Due Diligence module if required.`,
          });
        }
        return d;
      }),
    listFridayCollections: protectedProcedure.query(() => getFridayCollections()),
    recordFridayCollection: adminProcedure
      .input(z.object({ collectionDate: z.date(), amount: z.string(), collectedById: z.number().optional(), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => createFridayCollection({ collectionDate: input.collectionDate, totalAmount: input.amount, recordedById: ctx.user.id, notes: input.notes })),
    deleteDonation: superAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq } = await import('drizzle-orm');
        const { fundraisingDonations } = await import('../drizzle/schema');
        const rows = await db.select().from(fundraisingDonations).where(eq(fundraisingDonations.id, input.id)).limit(1);
        if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCanDelete(ctx.user);
        await db.delete(fundraisingDonations).where(eq(fundraisingDonations.id, input.id));
        return { success: true };
      }),
    deleteFridayCollection: superAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq } = await import('drizzle-orm');
        const { fridayCollections } = await import('../drizzle/schema');
        const rows = await db.select().from(fridayCollections).where(eq(fridayCollections.id, input.id)).limit(1);
        if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCanDelete(ctx.user);
        await db.delete(fridayCollections).where(eq(fridayCollections.id, input.id));
        return { success: true };
      }),

    // Cash withheld sub-entry — bookkeeper (deputy/property manager) records, manager/trustee confirms
    recordCashWithheld: protectedProcedure
      .input(z.object({ id: z.number(), amount: z.string(), reason: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // Bookkeeper role: deputy, property manager, or manager
        const BOOKKEEPER_ROLES = ['superadmin', 'admin', 'trustee', 'manager', 'deputy'];
        if (!BOOKKEEPER_ROLES.includes(ctx.user.role)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only authorised bookkeepers can record cash withheld.' });
        }
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq } = await import('drizzle-orm');
        const { fridayCollections } = await import('../drizzle/schema');
        const rows = await db.select().from(fridayCollections).where(eq(fridayCollections.id, input.id)).limit(1);
        if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
        await db.update(fridayCollections).set({
          cashWithheld: input.amount,
          cashWithheldReason: input.reason,
          cashWithheldRecordedById: ctx.user.id,
          cashWithheldRecordedAt: new Date(),
          cashWithheldRecordedByName: ctx.user.name ?? ctx.user.email ?? 'Unknown',
          // Clear any previous confirmation when re-recording
          cashWithheldConfirmedById: null,
          cashWithheldConfirmedAt: null,
          cashWithheldConfirmedByName: null,
        }).where(eq(fridayCollections.id, input.id));
        return { success: true };
      }),

    confirmCashWithheld: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Confirmer role: manager or trustee (not the bookkeeper themselves)
        const CONFIRMER_ROLES = ['superadmin', 'admin', 'trustee', 'manager'];
        if (!CONFIRMER_ROLES.includes(ctx.user.role)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only a manager or trustee can confirm cash withheld.' });
        }
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq } = await import('drizzle-orm');
        const { fridayCollections } = await import('../drizzle/schema');
        const rows = await db.select().from(fridayCollections).where(eq(fridayCollections.id, input.id)).limit(1);
        if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
        if (!rows[0].cashWithheld) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No cash withheld entry to confirm.' });
        // Prevent self-confirmation: confirmer cannot be the same as recorder
        if (rows[0].cashWithheldRecordedById === ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You cannot confirm your own cash withheld entry. A different authorised person must confirm.' });
        }
        await db.update(fridayCollections).set({
          cashWithheldConfirmedById: ctx.user.id,
          cashWithheldConfirmedAt: new Date(),
          cashWithheldConfirmedByName: ctx.user.name ?? ctx.user.email ?? 'Unknown',
        }).where(eq(fridayCollections.id, input.id));
        return { success: true };
      }),

    removeCashWithheld: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const AUTHORISED_ROLES = ['superadmin', 'admin', 'trustee', 'manager'];
        if (!AUTHORISED_ROLES.includes(ctx.user.role)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only a manager or trustee can remove a cash withheld entry.' });
        }
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq } = await import('drizzle-orm');
        const { fridayCollections } = await import('../drizzle/schema');
        await db.update(fridayCollections).set({
          cashWithheld: null,
          cashWithheldReason: null,
          cashWithheldRecordedById: null,
          cashWithheldRecordedAt: null,
          cashWithheldRecordedByName: null,
          cashWithheldConfirmedById: null,
          cashWithheldConfirmedAt: null,
          cashWithheldConfirmedByName: null,
        }).where(eq(fridayCollections.id, input.id));
        return { success: true };
      }),

    // Two-step authorisation — manager/deputy/trustee only
    authoriseFridayCollection: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const AUTHORISED_ROLES = ['superadmin', 'admin', 'trustee', 'manager', 'deputy'];
        if (!AUTHORISED_ROLES.includes(ctx.user.role)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only managers, deputies, or trustees can authorise collections.' });
        }
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq } = await import('drizzle-orm');
        const { fridayCollections } = await import('../drizzle/schema');
        const rows = await db.select().from(fridayCollections).where(eq(fridayCollections.id, input.id)).limit(1);
        if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
        await db.update(fridayCollections).set({
          authorisedById: ctx.user.id,
          authorisedAt: new Date(),
          authorisedByName: ctx.user.name ?? ctx.user.email ?? 'Unknown',
        }).where(eq(fridayCollections.id, input.id));
        return { success: true };
      }),

    unauthoriseFridayCollection: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const AUTHORISED_ROLES = ['superadmin', 'admin', 'trustee', 'manager', 'deputy'];
        if (!AUTHORISED_ROLES.includes(ctx.user.role)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only managers, deputies, or trustees can remove authorisation.' });
        }
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq } = await import('drizzle-orm');
        const { fridayCollections } = await import('../drizzle/schema');
        const rows = await db.select().from(fridayCollections).where(eq(fridayCollections.id, input.id)).limit(1);
        if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
        await db.update(fridayCollections).set({
          authorisedById: null,
          authorisedAt: null,
          authorisedByName: null,
        }).where(eq(fridayCollections.id, input.id));
        return { success: true };
      }),
  }),


  // ─── TRUSTEES ──────────────────────────────────────────────────────────────

  trustees: router({
    list: adminProcedure.query(() => getTrustees(false)),
    listActive: protectedProcedure.query(() => getTrustees(true)),
    create: adminProcedure
      .input(z.object({
        fullName: z.string(),
        email: z.string().optional(),
        phone: z.string().optional(),
        role: z.string().optional(),
        notes: z.string().optional(),
        dateOfBirth: z.string().optional().nullable(),
        addressLine1: z.string().optional().nullable(),
        addressLine2: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        postcode: z.string().optional().nullable(),
        nokName: z.string().optional().nullable(),
        nokPhone: z.string().optional().nullable(),
        nokEmail: z.string().optional().nullable(),
        nokRelationship: z.string().optional().nullable(),
        seniorityOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => createTrustee({ ...input, role: input.role ?? "Trustee" } as any)),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        fullName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        role: z.string().optional(),
        isActive: z.boolean().optional(),
        notes: z.string().optional(),
        // Extended profile
        dateOfBirth: z.string().optional().nullable(),
        addressLine1: z.string().optional().nullable(),
        addressLine2: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        postcode: z.string().optional().nullable(),
        // Next of kin
        nokName: z.string().optional().nullable(),
        nokPhone: z.string().optional().nullable(),
        nokEmail: z.string().optional().nullable(),
        nokRelationship: z.string().optional().nullable(),
        seniorityOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await updateTrustee(id, data as any); return { success: true }; }),
    delete: superAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => { await deleteTrustee(input.id); return { success: true }; }),

    // Merge AI-extracted fields into an existing trustee record
    mergeFromScan: seniorProcedure
      .input(z.object({
        id: z.number(),
        fullName: z.string().nullish(),
        role: z.string().nullish(),
        email: z.string().nullish(),
        phone: z.string().nullish(),
        dateOfBirth: z.string().nullish(),
        addressLine1: z.string().nullish(),
        addressLine2: z.string().nullish(),
        city: z.string().nullish(),
        postcode: z.string().nullish(),
        nokName: z.string().nullish(),
        nokPhone: z.string().nullish(),
        nokEmail: z.string().nullish(),
        nokRelationship: z.string().nullish(),
        notes: z.string().nullish(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        // Helper: normalise any date string to YYYY-MM-DD
        const normaliseDate = (v: string): string => {
          const ukMatch = v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
          if (ukMatch) return `${ukMatch[3]}-${ukMatch[2].padStart(2,'0')}-${ukMatch[1].padStart(2,'0')}`;
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
          const d = new Date(v);
          if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
          return v;
        };
        const { id, ...fields } = input;
        const { trustees: trusteesTable, scanMergeSnapshots } = await import('../drizzle/schema');
        // Fetch existing record so we can protect non-null fields and snapshot it
        const [existing] = await db.select().from(trusteesTable).where(eq(trusteesTable.id, id)).limit(1);
        // Save snapshot BEFORE applying any changes
        let snapshotId: number | null = null;
        if (existing) {
          const [snapResult] = await db.insert(scanMergeSnapshots).values({
            tableName: 'trustees',
            recordId: id,
            snapshotJson: JSON.stringify(existing),
            mergedByUserId: ctx.user.id,
            mergedByName: ctx.user.name,
          });
          snapshotId = (snapResult as any).insertId ?? null;
        }
        const updates: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined && v !== null && v !== '') {
            // GUARD: never overwrite the member's own phone with a NOK phone value.
            if (k === 'phone' && existing?.phone && existing.phone.trim() !== '') {
              continue;
            }
            if ((k === 'dateOfBirth' || k === 'date') && typeof v === 'string') {
              updates[k] = normaliseDate(v);
            } else {
              updates[k] = v;
            }
          }
        }
        if (Object.keys(updates).length > 0) {
          await db.update(trusteesTable).set(updates as any).where(eq(trusteesTable.id, id));
        }
        return { success: true, updatedFields: Object.keys(updates), snapshotId };
      }),
  }),

  // ─── LOANS (QARDE HASAN) ──────────────────────────────────────────────────

  loans: router({
    list: adminProcedure.input(z.object({ status: z.string().optional() })).query(({ input }) => getLoans(input.status)),

    listWithSummary: adminProcedure.input(z.object({ status: z.string().optional() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const loans = await getLoans(input.status);
      const now = new Date();
      const results = await Promise.all(loans.map(async (loan: any) => {
        const reps = await db.select().from(loanRepayments).where(eq((loanRepayments as any).loanId, loan.id));
        const termMonths = loan.termUnit === 'years' ? (loan.termValue ?? 6) * 12 : (loan.termValue ?? loan.termMonths ?? 6);
        const totalPaid = reps.filter((r: any) => r.trusteeApprovedAt).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
        const totalWaqf = reps.reduce((s: number, r: any) => s + Number((r as any).waqfAmount ?? 0), 0);
        const outstanding = Math.max(0, Number(loan.amount) - totalPaid - totalWaqf);
        const overdueCount = reps.filter((r: any) => !r.trusteeApprovedAt && r.dueDate && new Date(r.dueDate) < now).length;
        const paidCount = reps.filter((r: any) => r.trusteeApprovedAt).length;
        return { ...loan, _summary: { termMonths, totalPaid, outstanding, overdueCount, paidCount, totalInstalments: termMonths } };
      }));
      return results;
    }),

    get: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const loan = await getLoanById(input.id);
      if (!loan) throw new TRPCError({ code: "NOT_FOUND" });
      const repayments = await getLoanRepayments(input.id);
      return { ...loan, repayments };
    }),
    create: adminProcedure
      .input(z.object({
        applicantName: z.string(), applicantEmail: z.string().optional(),
        applicantPhone: z.string().optional(), applicantAddress: z.string().optional(),
        purpose: z.string(), amount: z.string(),
        repaymentPeriodMonths: z.number().optional(),
        termValue: z.number().optional(),
        termUnit: z.enum(["months", "years"]).optional().default("months"),
        termNotes: z.string().optional(),
        monthlyRepayment: z.string().optional(), startDate: z.date().optional(), notes: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        // Compute termMonths: if years, multiply by 12; fallback to repaymentPeriodMonths
        const tv = input.termValue ?? input.repaymentPeriodMonths ?? 6;
        const termMonths = (input.termUnit === "years") ? tv * 12 : tv;
        const termLabel = `${tv} ${input.termUnit ?? "months"}`;
        const loan = await createLoan({ borrowerName: input.applicantName, borrowerEmail: input.applicantEmail, borrowerPhone: input.applicantPhone, borrowerAddress: input.applicantAddress, purpose: input.purpose, amount: input.amount, termMonths, termValue: tv, termUnit: input.termUnit ?? "months", termNotes: input.termNotes, monthlyRepayment: input.monthlyRepayment, startDate: input.startDate, notes: input.notes } as any);
        if (input.applicantEmail) {
          const firstName1 = input.applicantName.split(' ')[0];
          const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#5C1A1A;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Loan Application</p></div><div style="padding:24px;background:#fff"><p>Assalamu Alaikum, ${firstName1},</p><p>Thank you for submitting your Qarde Hasan (interest-free loan) application. We have received your application and it is currently under review by our trustees.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Amount Requested</td><td style="padding:8px">&pound;${parseFloat(input.amount).toFixed(2)}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Purpose</td><td style="padding:8px">${input.purpose}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Repayment Term</td><td style="padding:8px">${termLabel}</td></tr></table><p>You will be notified once your application has been reviewed. If you have any questions, please contact us directly.</p><p>Jazakallahu Khayran,<br><strong>Abdullah Quilliam Society Finance Team</strong></p></div><div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">This is an automated message from the AQ Society Finance System.</div></div>`;
          await sendGmail(input.applicantEmail, input.applicantName, "Qarde Hasan Loan Application Received — Abdullah Quilliam Society", html).catch(() => {});
        }
        return loan;
      }),
    approve: adminProcedure
      .input(z.object({ id: z.number(), chairSignatureUrl: z.string().optional(), trusteeSignatureUrl: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await updateLoan(input.id, { status: "approved", approvedAt: new Date(), chairSignatureUrl: input.chairSignatureUrl, trusteeSignatureUrl: input.trusteeSignatureUrl } as any);
        const loan = await getLoanById(input.id);
        if (loan?.borrowerEmail) {
          const firstName2 = (loan.borrowerName ?? '').split(' ')[0];
          const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#5C1A1A;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Loan &mdash; Approved</p></div><div style="padding:24px;background:#fff"><p>Assalamu Alaikum, ${firstName2},</p><p>We are pleased to inform you that your Qarde Hasan loan application has been <strong style="color:#5C1A1A">approved</strong> by the Abdullah Quilliam Society trustees.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Loan Amount</td><td style="padding:8px">&pound;${parseFloat(String(loan.amount)).toFixed(2)}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Monthly Repayment</td><td style="padding:8px">&pound;${loan.monthlyRepayment ? parseFloat(String(loan.monthlyRepayment)).toFixed(2) : "TBC"}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Repayment Term</td><td style="padding:8px">${loan.termMonths} months</td></tr></table><p>Please contact us to arrange collection of funds and to sign your loan agreement document.</p><p>Jazakallahu Khayran,<br><strong>Abdullah Quilliam Society Finance Team</strong></p></div><div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">This is an automated message from the AQ Society Finance System.</div></div>`;
          await sendGmail(loan.borrowerEmail, loan.borrowerName, "Your Qarde Hasan Loan Has Been Approved — Abdullah Quilliam Society", html).catch(() => {});
        }
        return { success: true };
      }),
    reject: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => { await updateLoan(input.id, { status: "rejected" }); return { success: true }; }),

    // Dual approval: admin tick
    // Upload a signature (base64 PNG) to S3 and return the URL
    uploadSignature: adminProcedure
      .input(z.object({ loanId: z.number(), role: z.enum(["admin", "trustee", "borrower"]), dataUrl: z.string() }))
      .mutation(async ({ input }) => {
        const { storagePut } = await import("./storage");
        // Strip data URL prefix and convert to Buffer
        const base64 = input.dataUrl.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64, "base64");
        const suffix = Date.now().toString(36);
        const key = `loan-signatures/${input.loanId}-${input.role}-${suffix}.png`;
        const { url } = await storagePut(key, buffer, "image/png");
        // Persist to the correct column
        if (input.role === "admin") {
          await updateLoan(input.loanId, { managerSignatureUrl: url } as any);
        } else if (input.role === "trustee") {
          await updateLoan(input.loanId, { trusteeSignatureUrl: url } as any);
        } else {
          await updateLoan(input.loanId, { chairSignatureUrl: url } as any);
        }
        return { url };
      }),

    approveAdmin: adminProcedure
      .input(z.object({ id: z.number(), approvedByName: z.string().optional(), signatureDataUrl: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const loan = await getLoanById(input.id);
        if (!loan) throw new TRPCError({ code: "NOT_FOUND" });
        let sigUrl: string | undefined;
        if (input.signatureDataUrl) {
          const { storagePut } = await import("./storage");
          const base64 = input.signatureDataUrl.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64, "base64");
          const key = `loan-signatures/${input.id}-admin-${Date.now().toString(36)}.png`;
          const { url } = await storagePut(key, buffer, "image/png");
          sigUrl = url;
        }
        const adminName = input.approvedByName ?? ctx.user.name ?? ctx.user.email ?? "Admin";
        await updateLoan(input.id, { adminApprovedById: ctx.user.id, adminApprovedByName: adminName, adminApprovedAt: new Date(), ...(sigUrl ? { managerSignatureUrl: sigUrl } : {}) } as any);
        // Check if trustee also approved — if so, fully approve and send notifications
        const updated = await getLoanById(input.id);
        if (updated && (updated as any).trusteeApprovedAt) {
          await _fullyApproveLoan(updated as any);
        }
        return { success: true, signatureUrl: sigUrl };
      }),

    // Dual approval: trustee tick
    approveTrustee: adminProcedure
      .input(z.object({ id: z.number(), trusteeName: z.string(), trusteeId: z.number().optional(), signatureDataUrl: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const loan = await getLoanById(input.id);
        if (!loan) throw new TRPCError({ code: "NOT_FOUND" });
        let sigUrl: string | undefined;
        if (input.signatureDataUrl) {
          const { storagePut } = await import("./storage");
          const base64 = input.signatureDataUrl.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64, "base64");
          const key = `loan-signatures/${input.id}-trustee-${Date.now().toString(36)}.png`;
          const { url } = await storagePut(key, buffer, "image/png");
          sigUrl = url;
        }
        await updateLoan(input.id, { trusteeId: input.trusteeId ?? 0, trusteeName: input.trusteeName, trusteeApprovedAt: new Date(), ...(sigUrl ? { trusteeSignatureUrl: sigUrl } : {}) } as any);
        // Check if admin also approved
        const updated = await getLoanById(input.id);
        if (updated && (updated as any).adminApprovedAt) {
          await _fullyApproveLoan(updated as any);
        }
        return { success: true, signatureUrl: sigUrl };
      }),

    recordRepayment: adminProcedure
      .input(z.object({ loanId: z.number(), amount: z.string(), paymentMethod: z.string().default("bank_transfer"), evidenceUrl: z.string().optional(), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Calculate dueDate: loan approval date + (existing repayment count + 1) months
        const loan = await getLoanById(input.loanId);
        const existingReps = await db.select({ id: loanRepayments.id }).from(loanRepayments).where(eq(loanRepayments.loanId, input.loanId));
        const instalmentNumber = existingReps.length + 1;
        const baseDate = (loan as any)?.trusteeApprovedAt ? new Date((loan as any).trusteeApprovedAt) : new Date();
        const dueDate = new Date(baseDate);
        dueDate.setMonth(dueDate.getMonth() + instalmentNumber);
        const repayment = await createLoanRepayment({ ...input, paymentMethod: input.paymentMethod as any, recordedById: ctx.user.id, dueDate } as any);
        if (loan && parseFloat(loan.totalRepaid?.toString() ?? "0") >= parseFloat(loan.amount.toString())) {
          await updateLoan(input.loanId, { status: "completed" });
        }
        return repayment;
      }),

    // Confirm repayment received in bank — starts dual approval flow
    confirmRepaymentReceived: adminProcedure
      .input(z.object({ repaymentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(loanRepayments).set({ receivedConfirmedAt: new Date(), receivedConfirmedById: ctx.user.id } as any).where(eq(loanRepayments.id, input.repaymentId));
        return { success: true };
      }),

    // Repayment dual approval: admin
    approveRepaymentAdmin: adminProcedure
      .input(z.object({ repaymentId: z.number(), approvedByName: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const adminName = input.approvedByName ?? ctx.user.name ?? ctx.user.email ?? "Admin";
        await db.update(loanRepayments).set({ adminApprovedById: ctx.user.id, adminApprovedByName: adminName, adminApprovedAt: new Date() } as any).where(eq(loanRepayments.id, input.repaymentId));
        const repayment = await getLoanRepaymentsById(input.repaymentId);
        if (repayment && (repayment as any).trusteeApprovedAt) {
          await _fullyApproveRepayment(repayment as any);
        }
        return { success: true };
      }),

    // Repayment dual approval: trustee
    approveRepaymentTrustee: adminProcedure
      .input(z.object({ repaymentId: z.number(), trusteeName: z.string(), trusteeId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(loanRepayments).set({ trusteeId: input.trusteeId ?? 0, trusteeName: input.trusteeName, trusteeApprovedAt: new Date() } as any).where(eq(loanRepayments.id, input.repaymentId));
        const repayment = await getLoanRepaymentsById(input.repaymentId);
        if (repayment && (repayment as any).adminApprovedAt) {
          await _fullyApproveRepayment(repayment as any);
        }
        return { success: true };
      }),

    generatePdf: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const loan = await getLoanById(input.id);
        if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
        const pdfBuffer = await generateLoanPdf({
          id: loan.id, borrowerName: loan.borrowerName, borrowerEmail: loan.borrowerEmail,
          borrowerAddress: loan.borrowerAddress, borrowerPhone: loan.borrowerPhone,
          borrowerTitle: (loan as any).borrowerTitle,
          purpose: loan.purpose, amount: loan.amount, termMonths: loan.termMonths,
          termValue: (loan as any).termValue, termUnit: (loan as any).termUnit, termNotes: (loan as any).termNotes,
          monthlyRepayment: loan.monthlyRepayment, startDate: loan.startDate,
          createdAt: loan.createdAt, status: loan.status,
          chairSignatureUrl: loan.chairSignatureUrl, trusteeSignatureUrl: loan.trusteeSignatureUrl, notes: loan.notes,
          adminApprovedByName: (loan as any).adminApprovedByName, adminApprovedAt: (loan as any).adminApprovedAt,
          trusteeName: (loan as any).trusteeName, trusteeApprovedAt: (loan as any).trusteeApprovedAt,
        });
        const fileKey = `loans/agreement-${loan.id}-${Date.now()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
        await updateLoan(input.id, { agreementPdfUrl: url } as any);
        return { url, filename: `AQS-Loan-Agreement-${String(loan.id).padStart(4, "0")}.pdf` };
      }),

    generateRepaymentPdf: adminProcedure
      .input(z.object({ repaymentId: z.number() }))
      .mutation(async ({ input }) => {
        const repayment = await getLoanRepaymentsById(input.repaymentId);
        if (!repayment) throw new TRPCError({ code: "NOT_FOUND" });
        const loan = await getLoanById(repayment.loanId);
        if (!loan) throw new TRPCError({ code: "NOT_FOUND" });
        const allRepayments = await getLoanRepayments(repayment.loanId);
        const waqfEndowed = allRepayments.reduce((s, r) => s + Number((r as any).waqfAmount ?? 0), 0);
        const pdfBuffer = await generateRepaymentPdf({
          repaymentId: repayment.id, loanId: loan.id,
          borrowerName: loan.borrowerName, borrowerEmail: loan.borrowerEmail, borrowerPhone: loan.borrowerPhone,
          borrowerTitle: (loan as any).borrowerTitle,
          amount: repayment.amount, paymentMethod: repayment.paymentMethod,
          paidAt: repayment.paidAt, loanAmount: loan.amount, totalRepaid: loan.totalRepaid ?? "0",
          termMonths: loan.termMonths,
          adminApprovedByName: (repayment as any).adminApprovedByName, adminApprovedAt: (repayment as any).adminApprovedAt,
          trusteeName: (repayment as any).trusteeName, trusteeApprovedAt: (repayment as any).trusteeApprovedAt,
          notes: repayment.notes,
          waqfEndowed,
        });
        const fileKey = `loans/repayment-${repayment.id}-${Date.now()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
        const db = await getDb();
        if (db) await db.update(loanRepayments).set({ confirmationPdfUrl: url } as any).where(eq(loanRepayments.id, repayment.id));
        return { url, filename: `AQS-Repayment-${String(repayment.id).padStart(4, "0")}.pdf` };
      }),
    sendEmail: adminProcedure
      .input(z.object({ id: z.number(), type: z.enum(["application_received", "approved", "reminder", "custom"]), customSubject: z.string().optional(), customBody: z.string().optional() }))
      .mutation(async ({ input }) => {
        const loan = await getLoanById(input.id);
        if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
        if (!loan.borrowerEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "Borrower has no email address on file" });
        const baseStyle = `font-family:Arial,sans-serif;max-width:600px;margin:0 auto`;
        const header = `<div style="background:#5C1A1A;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Amanah — Rimmers Building Project</p></div>`;
        const footer = `<div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">JazakAllahu Khayran — AQ Society Finance System</div>`;

        let subject = ""; let htmlBody = "";
        if (input.type === "application_received") {
          subject = "Your Qarde Hasan Amanah Application Has Been Received — AQ Society";
          const fn1 = (loan.borrowerName ?? '').split(' ')[0];
          htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px"><p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${fn1},</p><p>May Allah (SWT) bless you and your family abundantly. We are writing to confirm that your Qarde Hasan Amanah application for <strong>&pound;${parseFloat(String(loan.amount)).toFixed(2)}</strong> for the <strong>Rimmers Building Project</strong> has been received and is currently under review by our Finance Committee.</p><p>By supporting this project, you are investing in a House of Allah — and the Prophet (PBUH) said: <em>"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah."</em></p><p>We will be in touch shortly, in sha Allah. JazakAllahu Khayran for your generosity and trust in the AQ Society.</p><p>Warm Islamic greetings,<br><strong>AQ Society Finance Team</strong><br><em>Abdullah Quilliam Society</em></p></div>${footer}</div>`;
        } else if (input.type === "approved") {
          subject = "An Investment in the House of Allah – Your Qarde Hasan Agreement";
          const nameParts2 = (loan.borrowerName ?? '').trim().split(' ');
          const surname2 = nameParts2.length > 1 ? nameParts2[nameParts2.length - 1] : nameParts2[0];
          const pdfLink = (loan as any).agreementPdfUrl ? `<p style="margin:20px 0"><a href="${(loan as any).agreementPdfUrl}" style="background:#5C1A1A;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">View Your Qarde Hasan Agreement</a></p>` : '';
          htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px"><p>Dear Brother/Sister ${surname2},</p><p>We pray this finds you in the best of health and Iman.</p><p>Attached is the formal agreement for the interest-free loan you have graciously provided for the <strong>AQS Rimmers Building Project</strong>. While this is a technical requirement for our records, we recognise it primarily as a testament to your commitment to the Ummah.</p><p>The AQS Financial System (Hibba Integration) ensures your contribution is tracked with 100% accuracy and backed up in real-time.</p><p>May Allah (SWT) accept this from you as a <strong>Sadaqah Jariyah</strong> that continues to benefit you and your family for generations.</p>${pdfLink}<p>Warm Islamic greetings,<br><strong>AQ Society Finance Team</strong><br><em>Abdullah Quilliam Society</em></p></div>${footer}</div>`;
        } else if (input.type === "reminder") {
          const fn3 = (loan.borrowerName ?? '').split(' ')[0];
          const remaining = Math.max(0, parseFloat(String(loan.amount)) - parseFloat(String((loan as any).totalRepaid ?? 0)));
          subject = "Project Milestone Update — Qarde Hasan Amanah — AQ Society";
          htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px"><p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${fn3},</p><p>May Allah (SWT) bless you and reward you for your generous Amanah towards the Rimmers Building Project.</p><p>We are writing to provide a project milestone update. The outstanding balance on your Qarde Hasan Amanah is <strong>&pound;${remaining.toFixed(2)}</strong>. We are working diligently to fulfil this trust, in sha Allah.</p><p>If you have any questions or would like to discuss your Amanah, please do not hesitate to contact us. We are always here to serve you.</p><p>JazakAllahu Khayran for your patience, generosity, and continued support of the AQ Society.</p><p>Warm Islamic greetings,<br><strong>AQ Society Finance Team</strong><br><em>Abdullah Quilliam Society</em></p></div>${footer}</div>`;
        } else if (input.type === "custom" && input.customSubject && input.customBody) {
          subject = input.customSubject;
          htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px">${input.customBody}</div>${footer}</div>`;
        } else { throw new TRPCError({ code: "BAD_REQUEST", message: "Custom email requires subject and body" }); }
        try {
          await sendGmail(loan.borrowerEmail, loan.borrowerName, subject, htmlBody);
          return { success: true, sentTo: loan.borrowerEmail };
        } catch (e: any) {
          const msg = e?.message ?? String(e);
          if (msg.includes('invalid_grant') || msg.includes('Invalid Credentials')) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Email failed: Gmail credentials need to be refreshed. Please contact the system administrator to re-authorise the Gmail account." });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Email failed: ${msg}` });
        }
      }),

    // Update borrower contact details
    updateBorrower: adminProcedure
      .input(z.object({
        id: z.number(),
        borrowerName: z.string().optional(),
        borrowerEmail: z.string().email().optional(),
        borrowerPhone: z.string().optional(),
        borrowerAddress: z.string().optional(),
        borrowerTitle: z.enum(["Brother", "Sister", "Dr.", "Hajji", "Hajjah", "Sheikh", "none"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...fields } = input;
        const loan = await getLoanById(id);
        if (!loan) throw new TRPCError({ code: "NOT_FOUND" });
        await updateLoan(id, fields as any);
        return { success: true };
      }),

    // Send repayment reminder email
    sendRepaymentReminder: adminProcedure
      .input(z.object({ repaymentId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [rep] = await db.select().from(loanRepayments).where(eq(loanRepayments.id, input.repaymentId));
        if (!rep) throw new TRPCError({ code: "NOT_FOUND", message: "Repayment not found" });
        const loan = await getLoanById((rep as any).loanId);
        if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
     if (!loan.borrowerEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "Lender has no email address on file" });
        const firstName = (loan.borrowerName ?? '').split(' ')[0];
        const instalmentNum = (rep as any).instalmentNumber ?? '';
        const amount = parseFloat(String((rep as any).amount ?? 0)).toFixed(2);
        const baseStyle = `font-family:Arial,sans-serif;max-width:600px;margin:0 auto`;
        const header = `<div style="background:#5C1A1A;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Amanah — Rimmers Building Project</p></div>`;
        const footer = `<div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">JazakAllahu Khayran — AQ Society Finance System</div>`;
        const instalmentLabel = instalmentNum ? ` (Instalment ${instalmentNum})` : '';
        const htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px"><p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p><p>May Allah (SWT) bless you and your family abundantly. We are writing to confirm that a repayment of <strong>&pound;${amount}</strong>${instalmentLabel} has been made towards your Qarde Hasan Amanah for the <strong>Rimmers Building Project</strong>.</p><p>Your generosity and trust in the AQ Society is deeply appreciated. The Prophet (PBUH) said: <em>"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah."</em></p><p>Please confirm receipt of this payment at your earliest convenience. If you have any questions or concerns, please do not hesitate to contact us — we are always here to serve you.</p><p>JazakAllahu Khayran,<br><strong>AQ Society Finance Team</strong><br><em>Abdullah Quilliam Society</em></p></div>${footer}</div>`;
        try {
          await sendGmail(loan.borrowerEmail, loan.borrowerName, `Qarde Hasan Amanah — Repayment Confirmation £${amount}${instalmentLabel} — AQ Society`, htmlBody);
          return { success: true, sentTo: loan.borrowerEmail };
        } catch (e: any) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Email failed: ${e?.message ?? String(e)}` });
        }
      }),

    confirmLenderReceipt: adminProcedure
      .input(z.object({ repaymentId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(loanRepayments)
          .set({ lenderConfirmedAt: new Date() } as any)
          .where(eq(loanRepayments.id, input.repaymentId));
        return { success: true };
      }),

    generateLoanStatement: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const loan = await getLoanById(input.id);
        if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
        const repayments = await db.select().from(loanRepayments).where(eq((loanRepayments as any).loanId, input.id)).orderBy((loanRepayments as any).createdAt);
        const termMonths = loan.termUnit === 'years' ? (loan.termValue ?? 6) * 12 : (loan.termValue ?? loan.termMonths ?? 6);
        const monthly = (Number(loan.amount) / termMonths).toFixed(2);
        // Count all repayments that have been recorded (paidAt is always set on creation)
        const totalPaid = repayments.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
        const totalWaqfStmt = repayments.reduce((s: number, r: any) => s + Number((r as any).waqfAmount ?? 0), 0);
        const outstanding = Math.max(0, Number(loan.amount) - totalPaid - totalWaqfStmt);
        // Generate as PDF so it opens correctly in all browsers
        const PDFDocument = (await import('pdfkit')).default;
        // Pre-load logo buffer before entering synchronous Promise callback
        let stmtLogoBufferPre: Buffer | null = null;
        try { stmtLogoBufferPre = Buffer.from((await import('./aqsLogoB64')).AQS_LOGO_WHITE_B64, 'base64'); } catch {}
        const stmtDoc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
        const stmtBufs: Buffer[] = [];
        await new Promise<void>((res, rej) => {
          stmtDoc.on('data', (c: Buffer) => stmtBufs.push(c));
          stmtDoc.on('end', res);
          stmtDoc.on('error', rej);

          const SG = '#4a0e1a'; const SGOLD = '#c9a84c'; const SMUTED = '#555555'; const STEXT = '#1a1a1a';
          const SGOLD_LIGHT = '#e8c97a'; const SWHITE = '#ffffff'; const SMUTED2 = '#d4b8be';
          const SL = 45; const SW = 505; const SPW = stmtDoc.page.width;

          // ── Burgundy header band (matching loan agreement letterhead) ─────────────────────────────────
          const SHEADER_H = 120;
          stmtDoc.rect(0, 0, SPW, SHEADER_H).fill(SG);
          stmtDoc.rect(0, SHEADER_H, SPW, 3).fill(SGOLD);
          // Logo (pre-loaded before this callback)
          const sLogoH = SHEADER_H - 16;
          const sLogoW = Math.round(sLogoH * 470 / 490);
          if (stmtLogoBufferPre) {
            try { stmtDoc.image(stmtLogoBufferPre, SL, 8, { width: sLogoW, height: sLogoH }); } catch {}
          }
          // Vertical gold divider
          const sDivX = SL + sLogoW + 14;
          stmtDoc.rect(sDivX, 18, 1.5, SHEADER_H - 36).fill(SGOLD);
          // Organisation name & tagline
          const sTextX = sDivX + 14;
          stmtDoc.fillColor(SWHITE).fontSize(15).font('Helvetica-Bold')
            .text('ABDULLAH QUILLIAM SOCIETY', sTextX, 20, { width: SPW - sTextX - 30 });
          stmtDoc.fontSize(9).font('Helvetica').fillColor(SGOLD_LIGHT)
            .text('Qarde Hasan (Interest-Free Loan) — Loan Statement', sTextX, 40, { width: SPW - sTextX - 30 });
          stmtDoc.fontSize(7.5).fillColor(SGOLD)
            .text('"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah." — Hadith', sTextX, 57, { width: SPW - sTextX - 30 });
          stmtDoc.fontSize(7.5).fillColor(SMUTED2)
            .text('8-10 Brougham Terrace, Liverpool, L6 1AE  |  Tel: 0151 260 3986  |  admin@abdullahquilliam.org', sTextX, 74, { width: SPW - sTextX - 30 });

          let sy = SHEADER_H + 16;
          stmtDoc.fillColor(SG).fontSize(13).font('Helvetica-Bold')
            .text('QARDE HASAN LOAN STATEMENT', SL, sy, { width: SW, align: 'center' });
          sy += 18;
          stmtDoc.fillColor(SMUTED).fontSize(8).font('Helvetica')
            .text(`Ref: AQS-LOAN-${String(input.id).padStart(6,'0')}   |   Generated: ${fmtDateTime(new Date())}`, SL, sy, { width: SW, align: 'center' });
          sy += 12;
          stmtDoc.rect(SL, sy, SW, 1).fill(SGOLD);
          sy += 10;

          // Summary section
          stmtDoc.rect(SL, sy, SW, 18).fill('#f0f0f0');
          stmtDoc.fillColor(SG).fontSize(9).font('Helvetica-Bold')
            .text('LOAN SUMMARY', SL + 8, sy + 5, { width: SW - 16, lineBreak: false });
          sy += 21;

          const sRow = (label: string, val: string, bold = false, color = STEXT) => {
            stmtDoc.fillColor(SMUTED).fontSize(8.5).font('Helvetica')
              .text(label, SL + 8, sy, { width: 150, lineBreak: false });
            stmtDoc.fillColor(color).fontSize(8.5).font(bold ? 'Helvetica-Bold' : 'Helvetica')
              .text(val, SL + 165, sy, { width: SW - 170, lineBreak: false });
            sy += 15;
          };

          const stmtTitle = (loan as any).borrowerTitle && (loan as any).borrowerTitle !== 'none' ? (loan as any).borrowerTitle + ' ' : '';
          sRow('Lender / Donor', stmtTitle + (loan.borrowerName ?? '—'), true);
          if (loan.borrowerEmail) sRow('Email', loan.borrowerEmail);
          sRow('Loan Amount', `£${Number(loan.amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, true, '#059669');
          sRow('Term', `${loan.termValue ?? termMonths} ${loan.termUnit ?? 'months'}`);
          sRow('Monthly Repayment', `£${monthly}/mo`);
          sRow('Purpose', loan.purpose ?? '—');
          sy += 4;
          stmtDoc.rect(SL, sy, SW, 1).fill('#e0e0e0'); sy += 5;
          sRow('Total Paid', `£${totalPaid.toFixed(2)}`, true);
          // Endowment: adjust outstanding balance if waqf converted
          const waqfEndowed = repayments.reduce((s: number, r: any) => s + Number(r.waqfAmount ?? 0), 0);
          const isWaqfConverted = !!(loan as any).waqfConvertedAt;
          if (isWaqfConverted || waqfEndowed > 0) {
            sRow('Endowment (Waqf) Amount', `£${waqfEndowed.toFixed(2)}`, true, '#c9a84c');
            const adjustedOutstanding = Math.max(0, Number(loan.amount) - totalPaid - waqfEndowed);
            sRow('Outstanding Balance', `£${adjustedOutstanding.toFixed(2)}`, true, adjustedOutstanding > 0 ? '#dc2626' : '#059669');
          } else {
            sRow('Outstanding Balance', `£${outstanding.toFixed(2)}`, true, outstanding > 0 ? '#dc2626' : '#059669');
          }
          sy += 8;

          // Repayments table
          stmtDoc.rect(SL, sy, SW, 18).fill('#f0f0f0');
          stmtDoc.fillColor(SG).fontSize(9).font('Helvetica-Bold')
            .text('REPAYMENT HISTORY', SL + 8, sy + 5, { width: SW - 16, lineBreak: false });
          sy += 21;

          if (repayments.length === 0) {
            stmtDoc.fillColor(SMUTED).fontSize(8.5).font('Helvetica')
              .text('No repayments recorded yet.', SL + 8, sy);
            sy += 20;
          } else {
            // Table header
            const tCols = [28, 72, 80, 115, 75, 65, 60];
            const tHdrs = ['#', 'Amount', 'Due Date', 'Paid At', 'Method', 'Status', 'Confirmed'];
            stmtDoc.rect(SL, sy, SW, 16).fill(SG);
            stmtDoc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold');
            let tx = SL + 3;
            tHdrs.forEach((h, i) => {
              stmtDoc.text(h, tx, sy + 5, { width: tCols[i]! - 4, lineBreak: false });
              tx += tCols[i]!;
            });
            sy += 16;

            repayments.forEach((r: any, i: number) => {
              const status = r.trusteeApprovedAt ? 'Confirmed' : r.adminApprovedAt ? 'Partial' : 'Pending';
              const statusColor = r.trusteeApprovedAt ? '#059669' : r.adminApprovedAt ? '#d97706' : '#6b7280';
              const due = r.dueDate ? fmtDate(new Date(r.dueDate)) : '—';
              const paid = r.paidAt ? fmtDateTime(new Date(r.paidAt)) : '—';
              const conf = r.lenderConfirmedAt ? fmtDate(new Date(r.lenderConfirmedAt)) : '—';
              const method = (r.paymentMethod ?? '').replace(/_/g,' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
              if (i % 2 === 0) stmtDoc.rect(SL, sy, SW, 15).fill('#f7f7f7');
              stmtDoc.fillColor(STEXT).fontSize(7.5).font('Helvetica');
              let rx = SL + 3;
              [String(i+1), `£${Number(r.amount??0).toFixed(2)}`, due, paid, method].forEach((v, ci) => {
                stmtDoc.text(v, rx, sy + 4, { width: tCols[ci]! - 4, lineBreak: false });
                rx += tCols[ci]!;
              });
              stmtDoc.fillColor(statusColor).fontSize(7.5).font('Helvetica-Bold')
                .text(status, rx, sy + 4, { width: tCols[5]! - 4, lineBreak: false });
              rx += tCols[5]!;
              stmtDoc.fillColor(STEXT).fontSize(7.5).font('Helvetica')
                .text(conf, rx, sy + 4, { width: tCols[6]! - 4, lineBreak: false });
              sy += 15;
            });
          }

          // Footer
          stmtDoc.rect(SL, stmtDoc.page.height - 50, SW, 1).fill(SGOLD);
          stmtDoc.fillColor(SMUTED).fontSize(7.5).font('Helvetica')
            .text('This is an official record from the AQ Society Finance System. Qarde Hasan — Interest-Free Loan.', SL, stmtDoc.page.height - 38, { width: SW, align: 'center' });

          stmtDoc.end();
        });

        const pdfBuf = Buffer.concat(stmtBufs);
        const { storagePut } = await import('./storage');
        const key = `loan-statements/loan-${input.id}-statement-${Date.now()}.pdf`;
        const { url } = await storagePut(key, pdfBuf, 'application/pdf');
        return { url };
      }),

    emailLoanStatement: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const loan = await getLoanById(input.id);
        if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
        if (!loan.borrowerEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "Lender has no email address on file" });
        const repayments = await db.select().from(loanRepayments).where(eq((loanRepayments as any).loanId, input.id)).orderBy((loanRepayments as any).createdAt);
        const termMonths = loan.termUnit === 'years' ? (loan.termValue ?? 6) * 12 : (loan.termValue ?? (loan as any).termMonths ?? 6);
        const monthly = (Number(loan.amount) / termMonths).toFixed(2);
        const totalPaid = repayments.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
        const waqfEndowedEmail = repayments.reduce((s: number, r: any) => s + Number(r.waqfAmount ?? 0), 0);
        const isWaqfEmail = !!(loan as any).waqfConvertedAt || waqfEndowedEmail > 0;
        const outstanding = Math.max(0, Number(loan.amount) - totalPaid - (isWaqfEmail ? waqfEndowedEmail : 0));
        const firstName = (loan.borrowerName ?? '').split(' ')[0];
        const rows = repayments.map((r: any, i: number) => {
          const status = r.trusteeApprovedAt ? 'Confirmed' : r.adminApprovedAt ? 'Partial' : 'Pending';
          const due = r.dueDate ? fmtDate(new Date(r.dueDate)) : '—';
          const paid = r.paidAt ? fmtDateTime(new Date(r.paidAt)) : '—';
          const lenderConf = r.lenderConfirmedAt ? fmtDate(new Date(r.lenderConfirmedAt)) : '—';
          return `<tr style="border-bottom:1px solid #e5e7eb"><td style="padding:8px 12px;font-size:13px">${i+1}</td><td style="padding:8px 12px;font-size:13px">&pound;${Number(r.amount??0).toFixed(2)}</td><td style="padding:8px 12px;font-size:13px">${due}</td><td style="padding:8px 12px;font-size:13px">${paid}</td><td style="padding:8px 12px;font-size:13px;text-transform:capitalize">${r.paymentMethod?.replace(/_/g,' ')??'—'}</td><td style="padding:8px 12px;font-size:13px;color:${r.trusteeApprovedAt?'#059669':r.adminApprovedAt?'#d97706':'#6b7280'}">${status}</td><td style="padding:8px 12px;font-size:13px">${lenderConf}</td></tr>`;
        }).join('');
        const html = `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto">
          <div style="background:#5C1A1A;padding:24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1>
            <p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Loan Statement</p>
          </div>
          <div style="padding:24px">
            <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p>
            <p>May Allah (SWT) bless you and your family abundantly. Please find below your Qarde Hasan Amanah Statement for the <strong>Rimmers Building Project</strong> as of ${fmtDate(new Date())}.</p>
            <p>Your generosity is a pillar of this House of Allah — the Prophet (PBUH) said: <em>"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah."</em></p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;width:150px">Loan Amount</td><td style="font-size:14px;font-weight:700;color:#059669">&pound;${Number(loan.amount).toLocaleString('en-GB',{minimumFractionDigits:2})}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280">Total Paid</td><td style="font-size:14px;font-weight:700">&pound;${totalPaid.toFixed(2)}</td></tr>
              ${isWaqfEmail ? `<tr><td style="padding:5px 0;font-size:13px;color:#6b7280">Endowment (Waqf)</td><td style="font-size:14px;font-weight:700;color:#c9a84c">&pound;${waqfEndowedEmail.toFixed(2)}</td></tr>` : ''}
              <tr><td style="padding:5px 0;font-size:13px;color:#6b7280">Outstanding Balance</td><td style="font-size:14px;font-weight:700;color:${outstanding>0?'#dc2626':'#059669'}">&pound;${outstanding.toFixed(2)}</td></tr>
            </table>
            <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
              <thead><tr style="background:#f9fafb">
                <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">#</th>
                <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">Amount</th>
                <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">Due</th>
                <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">Paid At</th>
                <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">Method</th>
                <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">Status</th>
                <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">Confirmed</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <p style="margin-top:24px">If you have any questions or would like to discuss your Amanah, please do not hesitate to contact us. We are always here to serve you.</p>
            <p>JazakAllahu Khayran for your patience, generosity, and continued support of the AQ Society.</p>
            <p>Warm Islamic greetings,<br><strong>AQ Society Finance Team</strong><br><em>Abdullah Quilliam Society</em></p>
          </div>
          <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">JazakAllahu Khayran — AQ Society Finance System</div>
        </div>`;
        try {
          await sendGmail(loan.borrowerEmail, loan.borrowerName, `Qarde Hasan Amanah Statement — ${fmtDate(new Date())} — AQ Society`, html);
          return { success: true, sentTo: loan.borrowerEmail };
        } catch (e: any) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Email failed: ${e?.message ?? String(e)}` });
        }
      }),

    remindAllOverdue: adminProcedure
      .input(z.object({ loanId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const loan = await getLoanById(input.loanId);
        if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
        if (!loan.borrowerEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "Lender has no email address on file" });
        const now = new Date();
        const allReps = await db.select().from(loanRepayments).where(eq((loanRepayments as any).loanId, input.loanId)).orderBy((loanRepayments as any).dueDate);
        const overdueReps = allReps.filter((r: any) => !r.trusteeApprovedAt && r.dueDate && new Date(r.dueDate) < now);
        if (overdueReps.length === 0) return { success: true, count: 0, message: 'No overdue repayments' };
        const firstName = (loan.borrowerName ?? '').split(' ')[0];
        const overdueList = overdueReps.map((r: any, i: number) => {
          const due = r.dueDate ? fmtDate(new Date(r.dueDate)) : '—';
          const amt = Number(r.amount ?? 0).toFixed(2);
          return `<li style="margin:6px 0">Instalment ${i+1} — <strong>&pound;${amt}</strong> (due ${due})</li>`;
        }).join('');
        const totalOverdue = overdueReps.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#5C1A1A;padding:24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1>
            <p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Amanah &mdash; Project Milestone Update</p>
          </div>
          <div style="padding:24px">
            <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p>
            <p>May Allah (SWT) bless you and your family. We are writing to provide a Project Milestone Update on your Qarde Hasan Amanah for the <strong>Rimmers Building Project</strong>.</p>
            <p>The following milestones are currently outstanding:</p>
            <ul style="margin:12px 0;padding-left:20px">${overdueList}</ul>
            <p style="font-weight:700">Total outstanding: &pound;${totalOverdue.toFixed(2)}</p>
            <p>We trust in your commitment to this Amanah and kindly request that you arrange the outstanding payments at your earliest convenience. If you have already made payment, please disregard this message, and JazakAllahu Khayran.</p>
            <p>Your generosity is a pillar of this House of Allah — the Prophet (PBUH) said: <em>"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah."</em> May Allah (SWT) accept this as Sadaqah Jariyah for you and your family.</p>
            <p>JazakAllahu Khayran,<br><strong>AQ Society Finance Team</strong><br><em>Abdullah Quilliam Society</em></p>
          </div>
          <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">JazakAllahu Khayran — AQ Society Finance System</div>
        </div>`;
        try {
          await sendGmail(loan.borrowerEmail, loan.borrowerName, `Project Milestone Update — ${overdueReps.length} Outstanding Payment(s) — AQ Society Qarde Hasan`, html);
          return { success: true, count: overdueReps.length, sentTo: loan.borrowerEmail };
        } catch (e: any) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Email failed: ${e?.message ?? String(e)}` });
        }
      }),

    exportSchedule: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { loanApplications, loanRepayments: lrTable } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        const [loan] = await db.select().from(loanApplications).where(eqOp(loanApplications.id, input.id));
        if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
        const repayments = await db.select().from(lrTable).where(eqOp(lrTable.loanId, input.id)).orderBy(lrTable.paidAt);
        const totalAmount = parseFloat(loan.amount);
        // Count all recorded repayments (paidAt set), not just trustee-approved
        const paid = repayments.filter(r => r.paidAt).reduce((s, r) => s + parseFloat(r.amount), 0);
        const totalWaqf = repayments.reduce((s, r) => s + parseFloat((r as any).waqfAmount ?? '0'), 0);
        // Outstanding = loan amount minus cash repaid minus waqf endowed
        // Waqf settles the remaining balance, so subtract it separately from outstanding
        const outstanding = Math.max(0, totalAmount - paid - totalWaqf);
        const cashRepaid = paid - totalWaqf;
        const borrowerTitle = (loan as any).borrowerTitle && (loan as any).borrowerTitle !== 'none' ? (loan as any).borrowerTitle + ' ' : '';
        const lenderDisplayName = borrowerTitle + loan.borrowerName;
        const startDateDisplay = (loan as any).startDate ? fmtDate(new Date((loan as any).startDate)) : fmtDate(new Date(loan.createdAt));
        const rows = repayments.map((r, i) => {
          const rWaqf = parseFloat((r as any).waqfAmount ?? '0');
          const waqfCell = rWaqf > 0
            ? `<span style="color:#059669;font-size:11px">\u00a3${rWaqf.toFixed(2)} Waqf</span>`
            : '';
          return `
          <tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:8px 12px">${i + 1}</td>
            <td style="padding:8px 12px">${r.dueDate ? fmtDate(new Date(r.dueDate)) : '\u2014'}</td>
            <td style="padding:8px 12px">${r.paidAt ? fmtDate(new Date(r.paidAt)) : '\u2014'}</td>
            <td style="padding:8px 12px">\u00a3${parseFloat(r.amount).toFixed(2)}${rWaqf > 0 ? '<br>' + waqfCell : ''}</td>
            <td style="padding:8px 12px;text-transform:capitalize">${(r.paymentMethod ?? '').replace(/_/g,' ')}</td>
            <td style="padding:8px 12px">${r.adminApprovedByName ?? '\u2014'}</td>
            <td style="padding:8px 12px">${r.trusteeName ?? '\u2014'}</td>
            <td style="padding:8px 12px;color:${r.trusteeApprovedAt ? '#059669' : '#d97706'}">${r.trusteeApprovedAt ? 'Confirmed' : r.adminApprovedAt ? 'Partial' : 'Pending'}</td>
            <td style="padding:8px 12px">${r.notes ?? ''}${(r as any).waqfNote ? '<br><em style="color:#059669;font-size:11px">Waqf: ' + (r as any).waqfNote + '</em>' : ''}</td>
          </tr>`;
        });
        const waqfRow = totalWaqf > 0
          ? `<tr><td style="padding:4px 16px 4px 0"><strong>Waqf Endowed</strong></td><td style="color:#059669">\u00a3${totalWaqf.toFixed(2)}</td></tr>
             <tr><td style="padding:4px 16px 4px 0"><strong>Cash Repaid</strong></td><td>\u00a3${cashRepaid.toFixed(2)}</td></tr>`
          : '';
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Repayment Schedule</title>
          <style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:20px;margin-bottom:4px}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f3f4f6;padding:8px 12px;text-align:left;font-weight:600}td{vertical-align:top}</style></head>
          <body>
          <h1>Qarde Hasan Loan \u2014 Repayment Schedule</h1>
          <p style="color:#6b7280;margin-bottom:16px">Generated ${new Date().toLocaleDateString('en-GB', {day:'2-digit',month:'long',year:'numeric'})}</p>
          <table style="margin-bottom:20px;font-size:13px"><tr><td style="padding:4px 16px 4px 0"><strong>Lender / Donor</strong></td><td>${lenderDisplayName}</td></tr>
          <tr><td style="padding:4px 16px 4px 0"><strong>Email</strong></td><td>${loan.borrowerEmail ?? '\u2014'}</td></tr>
          <tr><td style="padding:4px 16px 4px 0"><strong>Phone</strong></td><td>${loan.borrowerPhone ?? '\u2014'}</td></tr>
          <tr><td style="padding:4px 16px 4px 0"><strong>Loan Amount</strong></td><td>\u00a3${totalAmount.toFixed(2)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0"><strong>Term</strong></td><td>${loan.termMonths} months</td></tr>
          <tr><td style="padding:4px 16px 4px 0"><strong>Start Date</strong></td><td>${startDateDisplay}</td></tr>
          <tr><td style="padding:4px 16px 4px 0"><strong>Purpose</strong></td><td>${loan.purpose ?? '\u2014'}</td></tr>
          <tr><td style="padding:4px 16px 4px 0"><strong>Total Paid</strong></td><td>\u00a3${paid.toFixed(2)}</td></tr>
          ${waqfRow}
          <tr><td style="padding:4px 16px 4px 0"><strong>Outstanding</strong></td><td style="color:${outstanding > 0 ? '#d97706' : '#059669'}">\u00a3${outstanding.toFixed(2)}${outstanding === 0 ? ' (Fully Settled)' : ''}</td></tr></table>
          <table><thead><tr><th>#</th><th>Due Date</th><th>Paid Date</th><th>Amount</th><th>Method</th><th>Admin Auth</th><th>Trustee Auth</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>${rows.join('')}</tbody></table>
          <p style="margin-top:24px;font-size:11px;color:#9ca3af">AQ Society Finance Team \u2014 Qarde Hasan Interest-Free Loan Programme</p>
          </body></html>`;
        const key = `loan-schedules/schedule-${input.id}-${Date.now()}.html`;
        const { url } = await storagePut(key, Buffer.from(html, 'utf-8'), 'text/html');
        return { url };
      }),

    convertToWaqf: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { loanApplications } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        const [loan] = await db.select().from(loanApplications).where(eqOp(loanApplications.id, input.id));
        if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
        if ((loan as any).waqfConvertedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "This loan has already been converted to Waqf" });
        const convertedAt = new Date();
        // Fetch repayments to compute actual paid and waqf totals
        const { loanRepayments: lrTableW } = await import("../drizzle/schema");
        const repayments = await db.select().from(lrTableW).where(eqOp(lrTableW.loanId, input.id));
        const totalRepaid = repayments.filter((r: any) => r.paidAt).reduce((s: number, r: any) => s + parseFloat(r.amount), 0);
        const totalWaqfOnRepayments = repayments.reduce((s: number, r: any) => s + parseFloat((r as any).waqfAmount ?? '0'), 0);
        // Endowed amount = waqf recorded on repayments + remaining outstanding (full conversion)
        const outstandingBalance = Math.max(0, parseFloat(String(loan.amount)) - totalRepaid);
        // If there are interim waqf amounts, use those; otherwise the full outstanding is being endowed
        const waqfAmountForCert = totalWaqfOnRepayments > 0 ? totalWaqfOnRepayments : outstandingBalance;
        // Generate Certificate of Waqf PDF
        const certBuffer = await generateWaqfCertificate({
          loanId: loan.id,
          lenderName: loan.borrowerName,
          lenderTitle: (loan as any).borrowerTitle,
          lenderEmail: loan.borrowerEmail,
          lenderAddress: loan.borrowerAddress,
          lenderPhone: loan.borrowerPhone,
          originalAmount: loan.amount,
          totalRepaid: String(totalRepaid),
          waqfAmount: waqfAmountForCert,
          convertedAt,
          adminApprovedByName: loan.adminApprovedByName,
          trusteeName: loan.trusteeName,
        });
        const certKey = `loans/waqf-certificate-${loan.id}-${Date.now()}.pdf`;
        const { url: certUrl } = await storagePut(certKey, certBuffer, "application/pdf");
        // Update loan record
        await db.update(loanApplications)
          .set({ waqfConvertedAt: convertedAt, waqfCertificateUrl: certUrl } as any)
          .where(eqOp(loanApplications.id, input.id));
        // Send email notification if lender has email
        if (loan.borrowerEmail) {
          const firstName = (loan.borrowerName ?? '').split(' ')[0];
          const nameParts = (loan.borrowerName ?? '').trim().split(' ');
          const surname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
          const remaining = waqfAmountForCert;
          const baseStyle = `font-family:Arial,sans-serif;max-width:600px;margin:0 auto`;
          const header = `<div style="background:#5C1A1A;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Certificate of Waqf — Rimmers Building Project</p></div>`;
          const footer = `<div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">JazakAllahu Khayran — AQ Society Finance System</div>`;
          const certLink = `<p style="margin:20px 0"><a href="${certUrl}" style="background:#5C1A1A;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Download Your Certificate of Waqf</a></p>`;
          const htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px"><p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p><p>Alhamdulillah — we are deeply honoured to inform you that your Qarde Hasan Amanah of <strong>&pound;${parseFloat(String(loan.amount)).toFixed(2)}</strong> for the <strong>Rimmers Building Project</strong> has been permanently converted to a <strong>Waqf (Endowment)</strong>.</p><p>By this noble act, you have permanently endowed a portion of the House of Allah. The Prophet (PBUH) said: <em>"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah."</em> May Allah (SWT) accept this as a <strong>Sadaqah Jariyah</strong> that continues to benefit you and your family for generations to come, in sha Allah.</p><p>Please find attached your <strong>Certificate of Waqf</strong> for your records. The endowed amount of <strong>&pound;${remaining.toFixed(2)}</strong> has been transferred to the AQS Endowment Register.</p>${certLink}<p>JazakAllahu Khayran, Dear Brother/Sister ${surname}, for your immense generosity and trust in the AQ Society.</p><p>Warm Islamic greetings,<br><strong>AQ Society Finance Team</strong><br><em>Abdullah Quilliam Society</em></p></div>${footer}</div>`;
          try {
            await sendGmail(loan.borrowerEmail, loan.borrowerName, `Certificate of Waqf — Rimmers Building Project — AQ Society`, htmlBody);
          } catch {}
        }
        return { success: true, certUrl };
      }),

    // Record an interim waqf conversion on a specific repayment instalment
    interimWaqf: adminProcedure
      .input(z.object({
        repaymentId: z.number(),
        waqfAmount: z.number().positive(),
        waqfNote: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { loanRepayments: lrTable } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        const [repayment] = await db.select().from(lrTable).where(eqOp(lrTable.id, input.repaymentId));
        if (!repayment) throw new TRPCError({ code: "NOT_FOUND", message: "Repayment not found" });
        const repaymentAmount = parseFloat(repayment.amount);
        if (input.waqfAmount > repaymentAmount) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Waqf amount cannot exceed repayment amount of £${repaymentAmount.toFixed(2)}` });
        }
        await db.update(lrTable)
          .set({
            waqfAmount: String(input.waqfAmount),
            waqfNote: input.waqfNote ?? null,
            waqfConvertedAt: new Date(),
          } as any)
          .where(eqOp(lrTable.id, input.repaymentId));
        return { success: true };
      }),

    // Regenerate Waqf Certificate with current repayment data
    regenerateWaqfCertificate: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { loanApplications } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        const [loan] = await db.select().from(loanApplications).where(eqOp(loanApplications.id, input.id));
        if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
        // Fetch repayments to compute actual paid and waqf totals
        const { loanRepayments: lrTableR } = await import("../drizzle/schema");
        const repayments = await db.select().from(lrTableR).where(eqOp(lrTableR.loanId, input.id));
        const totalRepaid = repayments.filter((r: any) => r.paidAt).reduce((s: number, r: any) => s + parseFloat(r.amount), 0);
        const totalWaqfOnRepayments = repayments.reduce((s: number, r: any) => s + parseFloat((r as any).waqfAmount ?? '0'), 0);
        const outstandingBalance = Math.max(0, parseFloat(String(loan.amount)) - totalRepaid);
        const waqfAmountForCert = totalWaqfOnRepayments > 0 ? totalWaqfOnRepayments : outstandingBalance;
        const convertedAt = (loan as any).waqfConvertedAt ? new Date((loan as any).waqfConvertedAt) : new Date();
        const certBuffer = await generateWaqfCertificate({
          loanId: loan.id,
          lenderName: loan.borrowerName,
          lenderTitle: (loan as any).borrowerTitle,
          lenderEmail: loan.borrowerEmail,
          lenderAddress: loan.borrowerAddress,
          lenderPhone: loan.borrowerPhone,
          originalAmount: loan.amount,
          totalRepaid: String(totalRepaid),
          waqfAmount: waqfAmountForCert,
          convertedAt,
          adminApprovedByName: loan.adminApprovedByName,
          trusteeName: loan.trusteeName,
        });
        const { storagePut } = await import("./storage");
        const certKey = `loans/waqf-certificate-${loan.id}-${Date.now()}.pdf`;
        const { url: certUrl } = await storagePut(certKey, certBuffer, "application/pdf");
        await db.update(loanApplications)
          .set({ waqfCertificateUrl: certUrl } as any)
          .where(eqOp(loanApplications.id, input.id));
        return { success: true, certUrl };
      }),
    // Manual trigger: send weekly repayment alert now
    triggerWeeklyAlert: adminProcedure
      .mutation(async () => {
        await sendWeeklyRepaymentAlert();
        return { success: true };
      }),

    // Manual trigger: send monthly trustee report now
    triggerMonthlyReport: adminProcedure
      .mutation(async () => {
        await sendMonthlyTrusteeReport();
        return { success: true };
      }),
  }),
  // ─── MONTHLY EXPENSES PANEE ──────────────────────────────────────────────────

  expenses: router({
    // Aggregate all pending cheque/cash payments from payroll + receipts
    pendingPayments: adminProcedure
      .input(z.object({ month: z.number().optional(), year: z.number().optional() }))
      .query(async ({ input }) => {
        const { month, year } = input;
        const db = await (await import("./db")).getDb();
        if (!db) return { payroll: [], receipts: [], summary: { totalPending: 0, totalPaid: 0, unbankedCash: 0, unbankedCheques: 0 } };
        const { eq, and, or, inArray, isNull, gte, lte } = await import("drizzle-orm");
        const { payrollRecords, receipts: receiptsTable, users } = await import("../drizzle/schema");
        const { desc } = await import("drizzle-orm");

        // Date range filter for receipts
        const now = new Date();
        const filterMonth = month ?? now.getMonth() + 1;
        const filterYear = year ?? now.getFullYear();
        const startDate = new Date(filterYear, filterMonth - 1, 1);
        const endDate = new Date(filterYear, filterMonth, 0, 23, 59, 59);

        // Payroll: cheque or cash payments for the month
        const { staffProfiles } = await import("../drizzle/schema");
        const payrollRows = await db
          .select({ id: payrollRecords.id, employeeName: payrollRecords.employeeName, userId: payrollRecords.userId, month: payrollRecords.month, year: payrollRecords.year, netPay: payrollRecords.netPay, paymentMethod: payrollRecords.paymentMethod, paymentStatus: payrollRecords.paymentStatus, chequeNumber: payrollRecords.chequeNumber, chequeImageUrl: payrollRecords.chequeImageUrl, chequeIssuedAt: payrollRecords.chequeIssuedAt, bankingStatus: payrollRecords.bankingStatus, bankedAt: payrollRecords.bankedAt, paidAt: payrollRecords.paidAt, notes: payrollRecords.notes, userName: users.name, userFullName: staffProfiles.fullName, userEmail: users.email })
          .from(payrollRecords)
          .leftJoin(users, eq(payrollRecords.userId, users.id))
          .leftJoin(staffProfiles, eq(payrollRecords.userId, staffProfiles.userId))
          .where(and(
            inArray(payrollRecords.paymentMethod, ["cheque", "cash"]),
            eq(payrollRecords.month, filterMonth),
            eq(payrollRecords.year, filterYear)
          ))
          .orderBy(desc(payrollRecords.createdAt));

        // Receipts: cheque payments in the month
        const receiptRows = await db
          .select({ id: receiptsTable.id, vendor: receiptsTable.vendor, amount: receiptsTable.amount, departmentName: receiptsTable.departmentName, categoryName: receiptsTable.categoryName, status: receiptsTable.status, isChequePayment: receiptsTable.isChequePayment, chequeNumber: receiptsTable.chequeNumber, chequeImageUrl: receiptsTable.chequeImageUrl, chequeIssuedAt: receiptsTable.chequeIssuedAt, bankingStatus: receiptsTable.bankingStatus, bankedAt: receiptsTable.bankedAt, receiptDate: receiptsTable.receiptDate, notes: receiptsTable.notes, imageUrl: receiptsTable.imageUrl })
          .from(receiptsTable)
          .where(and(
            eq(receiptsTable.isChequePayment, true),
            gte(receiptsTable.createdAt, startDate),
            lte(receiptsTable.createdAt, endDate)
          ))
          .orderBy(desc(receiptsTable.createdAt));

        // Summary tallies
        const pendingPayroll = payrollRows.filter(r => r.paymentStatus === "pending");
        const paidPayroll = payrollRows.filter(r => r.paymentStatus === "paid");
        const totalPending = pendingPayroll.reduce((s, r) => s + parseFloat(String(r.netPay ?? 0)), 0)
          + receiptRows.filter(r => r.status !== "approved").reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
        const totalPaid = paidPayroll.reduce((s, r) => s + parseFloat(String(r.netPay ?? 0)), 0)
          + receiptRows.filter(r => r.status === "approved").reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
        const unbankedCash = payrollRows.filter(r => r.paymentMethod === "cash" && r.paymentStatus === "paid" && r.bankingStatus === "unbanked").reduce((s, r) => s + parseFloat(String(r.netPay ?? 0)), 0);
        const unbankedCheques = payrollRows.filter(r => r.paymentMethod === "cheque" && r.paymentStatus === "paid" && r.bankingStatus === "unbanked").reduce((s, r) => s + parseFloat(String(r.netPay ?? 0)), 0)
          + receiptRows.filter(r => r.bankingStatus === "unbanked" && r.status === "approved").reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);

        return {
          payroll: payrollRows.map(r => ({ ...r, displayName: r.employeeName ?? r.userFullName ?? r.userName ?? `Employee #${r.userId}`, type: "payroll" as const })),
          receipts: receiptRows.map(r => ({ ...r, type: "receipt" as const })),
          summary: { totalPending, totalPaid, unbankedCash, unbankedCheques },
        };
      }),

    // Mark payroll payment as paid (with optional cheque photo)
    markPayrollPaid: adminProcedure
      .input(z.object({ id: z.number(), chequeNumber: z.string().optional(), chequeImageUrl: z.string().optional(), chequeAmount: z.string().optional() }))
      .mutation(async ({ input }) => {
        await updatePayrollRecord(input.id, {
          paymentStatus: "paid" as any,
          paidAt: new Date(),
          chequeIssuedAt: new Date(),
          chequeNumber: input.chequeNumber,
          chequeImageUrl: input.chequeImageUrl,
          chequeAmount: input.chequeAmount,
        } as any);
        return { success: true, paidAt: new Date() };
      }),

    // Mark receipt/expense as paid (cheque issued)
    markReceiptPaid: adminProcedure
      .input(z.object({ id: z.number(), chequeNumber: z.string().optional(), chequeImageUrl: z.string().optional() }))
      .mutation(async ({ input }) => {
        await updateReceipt(input.id, {
          status: "approved" as any,
          chequeIssuedAt: new Date(),
          chequeNumber: input.chequeNumber,
          chequeImageUrl: input.chequeImageUrl,
        } as any);
        return { success: true, paidAt: new Date() };
      }),

    // Mark payment as banked
    markBanked: adminProcedure
      .input(z.object({ type: z.enum(["payroll", "receipt"]), id: z.number() }))
      .mutation(async ({ input }) => {
        if (input.type === "payroll") {
          await updatePayrollRecord(input.id, { bankingStatus: "banked" as any, bankedAt: new Date() } as any);
        } else {
          await updateReceipt(input.id, { bankingStatus: "banked" as any, bankedAt: new Date() } as any);
        }
        return { success: true };
      }),

    // Withheld: put a payment on hold
    withholdPayment: adminProcedure
      .input(z.object({ type: z.enum(["payroll", "receipt", "volunteer"]), id: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input }) => {
        const now = new Date();
        if (input.type === "payroll") {
          await updatePayrollRecord(input.id, { paymentStatus: "withheld" as any, withheldAt: now, withheldReason: input.reason } as any);
        } else if (input.type === "receipt") {
          await updateReceipt(input.id, { paymentHeld: true, heldAt: now, heldReason: input.reason } as any);
        } else {
          const db = await (await import("./db")).getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          const { eq } = await import("drizzle-orm");
          const { volunteerPayments } = await import("../drizzle/schema");
          await db.update(volunteerPayments).set({ paymentStatus: "withheld", withheldAt: now, withheldReason: input.reason, updatedAt: now }).where(eq(volunteerPayments.id, input.id));
        }
        return { success: true, withheldAt: now };
      }),

    // Now Paid: record payment with timestamp
    nowPaid: adminProcedure
      .input(z.object({ type: z.enum(["payroll", "receipt", "volunteer", "loan"]), id: z.number(), chequeNumber: z.string().optional(), chequeImageUrl: z.string().optional(), invoiceUrl: z.string().optional() }))
      .mutation(async ({ input }) => {
        const now = new Date();
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { eq } = await import("drizzle-orm");
        if (input.type === "payroll") {
          await updatePayrollRecord(input.id, { paymentStatus: "paid" as any, paidAt: now, chequeIssuedAt: now, chequeNumber: input.chequeNumber, chequeImageUrl: input.chequeImageUrl, invoiceUrl: input.invoiceUrl } as any);
        } else if (input.type === "receipt") {
          await updateReceipt(input.id, { status: "approved" as any, paidAt: now, chequeIssuedAt: now, chequeNumber: input.chequeNumber, chequeImageUrl: input.chequeImageUrl, invoiceUrl: input.invoiceUrl } as any);
        } else if (input.type === "loan") {
          const { loanRepayments } = await import("../drizzle/schema");
          await db.update(loanRepayments).set({ status: "paid", paidAt: now, chequeNumber: input.chequeNumber, chequeImageUrl: input.chequeImageUrl, invoiceUrl: input.invoiceUrl, updatedAt: now } as any).where(eq(loanRepayments.id, input.id));
        } else {
          const { volunteerPayments } = await import("../drizzle/schema");
          await db.update(volunteerPayments).set({ paymentStatus: "paid", paidAt: now, chequeNumber: input.chequeNumber, chequeImageUrl: input.chequeImageUrl, invoiceUrl: input.invoiceUrl, updatedAt: now }).where(eq(volunteerPayments.id, input.id));
        }
        return { success: true, paidAt: now };
      }),

    // Send payment confirmation email to recipient
    sendPaymentEmail: adminProcedure
      .input(z.object({
        type: z.enum(["payroll", "receipt", "volunteer"]),
        id: z.number(),
        recipientEmail: z.string().email(),
        recipientName: z.string(),
        amount: z.string(),
        description: z.string(),
        paidAt: z.date().optional(),
      }))
      .mutation(async ({ input }) => {
        const dateStr = input.paidAt ? fmtDateLong(new Date(input.paidAt)) : fmtDateLong(new Date());
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#5C1A1A;padding:20px;text-align:center">
              <h1 style="color:#C9A84C;margin:0;font-size:22px">Abdullah Quilliam Society</h1>
              <p style="color:#fff;margin:4px 0 0;font-size:13px">Payment Confirmation</p>
            </div>
            <div style="padding:24px;background:#fff">
              <p>Assalamu Alaikum, ${input.recipientName.split(' ')[0]},</p>
              <p>We are pleased to confirm that the following payment has been made to you:</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Description</td><td style="padding:8px">${input.description}</td></tr>
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Amount</td><td style="padding:8px;font-size:18px;color:#1B4332"><strong>\u00a3${parseFloat(input.amount).toFixed(2)}</strong></td></tr>
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Date Paid</td><td style="padding:8px">${dateStr}</td></tr>
              </table>
              <p style="color:#666;font-size:13px">If you have any questions about this payment, please contact the finance team.</p>
              <p>JazakAllahu Khayran,<br><strong>Abdullah Quilliam Society Finance Team</strong></p>
            </div>
            <div style="background:#f0f0f0;padding:12px;text-align:center;font-size:11px;color:#999">
              Abdullah Quilliam Society &middot; Liverpool &middot; finance@abdullahquilliam.com
            </div>
          </div>`;
        await sendGmail(input.recipientEmail, input.recipientName, `Payment Confirmation — \u00a3${parseFloat(input.amount).toFixed(2)}`, html);
        // Record email sent timestamp
        const now = new Date();
        if (input.type === "payroll") {
          await updatePayrollRecord(input.id, { emailSentAt: now, emailSentTo: input.recipientEmail } as any);
        } else if (input.type === "receipt") {
          await updateReceipt(input.id, { emailSentAt: now, emailSentTo: input.recipientEmail } as any);
        } else {
          const db = await (await import("./db")).getDb();
          if (db) {
            const { eq } = await import("drizzle-orm");
            const { volunteerPayments } = await import("../drizzle/schema");
            await db.update(volunteerPayments).set({ emailSentAt: now, emailSentTo: input.recipientEmail, updatedAt: now }).where(eq(volunteerPayments.id, input.id));
          }
        }
        return { success: true, sentAt: now };
      }),

    // Bulk mark all pending payroll as paid for a given month/year
    bulkMarkAllPaid: adminProcedure
      .input(z.object({ month: z.number(), year: z.number() }))
      .mutation(async ({ input }) => {
        const { month, year } = input;
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { eq, and, inArray } = await import("drizzle-orm");
        const { payrollRecords, volunteerPayments } = await import("../drizzle/schema");
        const now = new Date();
        // Mark all pending payroll cheque/cash payments as paid
        const payrollResult = await db.update(payrollRecords)
          .set({ paymentStatus: "paid", paidAt: now, chequeIssuedAt: now, updatedAt: now } as any)
          .where(and(
            eq(payrollRecords.paymentStatus, "pending"),
            inArray(payrollRecords.paymentMethod, ["cheque", "cash"]),
            eq(payrollRecords.month, month),
            eq(payrollRecords.year, year)
          ));
        // Mark all pending volunteer payments as paid
        const volunteerResult = await db.update(volunteerPayments)
          .set({ paymentStatus: "paid", paidAt: now, updatedAt: now })
          .where(and(
            eq(volunteerPayments.paymentStatus, "pending"),
            eq(volunteerPayments.month, month),
            eq(volunteerPayments.year, year)
          ));
        return { success: true, paidAt: now, payrollUpdated: (payrollResult as any)[0]?.affectedRows ?? 0, volunteerUpdated: (volunteerResult as any)[0]?.affectedRows ?? 0 };
      }),

    // Staff + volunteer directory for email recipient dropdown
    staffDirectory: adminProcedure.query(async () => {
      const db = await (await import("./db")).getDb();
      if (!db) return [];
      const { users: usersTable, staffProfiles: staffProfilesTable } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const rows = await db
        .select({ id: usersTable.id, username: usersTable.name, email: usersTable.email, role: usersTable.role, fullName: staffProfilesTable.fullName })
        .from(usersTable)
        .leftJoin(staffProfilesTable, eq(usersTable.id, staffProfilesTable.userId))
        .where((await import("drizzle-orm")).isNotNull(usersTable.email));
      return rows
        .filter((u: any) => u.email)
        .map((u: any) => ({
          id: u.id,
          name: u.fullName ?? u.username ?? u.email ?? "",  // prefer fullName over username
          email: u.email ?? "",
          role: u.role,
          type: "user" as const,
        }));
    }),

    // Income balance summary for the selected month
    incomeBalance: adminProcedure
      .input(z.object({ month: z.number(), year: z.number() }))
      .query(async ({ input }) => {
        const { month, year } = input;
        const db = await (await import("./db")).getDb();
        if (!db) return { totalIncome: 0, totalPaidExpenses: 0, availableBalance: 0, breakdown: [] as any[] };
        const { and, gte, lte, eq } = await import("drizzle-orm");
        const { incomeRecords, fridayCollections, fundraisingDonations, payrollRecords, receipts: receiptsTable, volunteerPayments } = await import("../drizzle/schema");
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        const incomeRows = await db.select().from(incomeRecords).where(and(gte(incomeRecords.createdAt, startDate), lte(incomeRecords.createdAt, endDate)));
        const fridayRows = await db.select().from(fridayCollections).where(and(gte(fridayCollections.createdAt, startDate), lte(fridayCollections.createdAt, endDate)));
        const donationRows = await db.select().from(fundraisingDonations).where(and(gte(fundraisingDonations.createdAt, startDate), lte(fundraisingDonations.createdAt, endDate)));

        const incomeTotal = incomeRows.reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
        const fridayTotal = fridayRows.reduce((s, r) => s + parseFloat(String(r.totalAmount ?? 0)), 0);
        const donationTotal = donationRows.reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
        const totalIncome = incomeTotal + fridayTotal + donationTotal;

        const payrollRows = await db.select().from(payrollRecords).where(and(eq(payrollRecords.month, month), eq(payrollRecords.year, year)));
        const receiptRows = await db.select().from(receiptsTable).where(and(gte(receiptsTable.createdAt, startDate), lte(receiptsTable.createdAt, endDate)));
        const volunteerRows = await db.select().from(volunteerPayments).where(and(eq(volunteerPayments.month, month), eq(volunteerPayments.year, year)));

        const paidPayroll = payrollRows.filter(r => r.paymentStatus === "paid").reduce((s, r) => s + parseFloat(String(r.netPay ?? 0)), 0);
        const paidReceipts = receiptRows.filter(r => r.status === "approved").reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
        const paidVolunteers = volunteerRows.filter(r => r.paymentStatus === "paid").reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
        const totalPaidExpenses = paidPayroll + paidReceipts + paidVolunteers;

        return {
          totalIncome,
          totalPaidExpenses,
          availableBalance: totalIncome - totalPaidExpenses,
          breakdown: [
            { label: "Income & Rentals", amount: incomeTotal },
            { label: "Friday Collections", amount: fridayTotal },
            { label: "Fundraising Donations", amount: donationTotal },
          ],
        };
      }),

    // Volunteer payments CRUD
    volunteerPayments: router({
      list: adminProcedure
        .input(z.object({ month: z.number().optional(), year: z.number().optional() }))
        .query(async ({ input }) => {
          const db = await (await import("./db")).getDb();
          if (!db) return [];
          const { and, eq, desc } = await import("drizzle-orm");
          const { volunteerPayments } = await import("../drizzle/schema");
          const now = new Date();
          const month = input.month ?? now.getMonth() + 1;
          const year = input.year ?? now.getFullYear();
          return db.select().from(volunteerPayments)
            .where(and(eq(volunteerPayments.month, month), eq(volunteerPayments.year, year)))
            .orderBy(desc(volunteerPayments.createdAt));
        }),
      create: adminProcedure
        .input(z.object({ recipientName: z.string(), recipientEmail: z.string().optional(), userId: z.number().optional(), month: z.number(), year: z.number(), amount: z.string(), description: z.string().optional(), paymentMethod: z.enum(["cash", "cheque", "bank_transfer"]).default("cash"), notes: z.string().optional() }))
        .mutation(async ({ ctx, input }) => {
          const db = await (await import("./db")).getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          const { volunteerPayments } = await import("../drizzle/schema");
          const [result] = await db.insert(volunteerPayments).values({ ...input, createdById: ctx.user.id });
          return { id: (result as any).insertId, success: true };
        }),
      delete: superAdminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
          const db = await (await import("./db")).getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          const { eq } = await import("drizzle-orm");
          const { volunteerPayments } = await import("../drizzle/schema");
          const rows = await db.select().from(volunteerPayments).where(eq(volunteerPayments.id, input.id)).limit(1);
          if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
          assertCanDelete(ctx.user);
          await db.delete(volunteerPayments).where(eq(volunteerPayments.id, input.id));
          return { success: true };
        }),
    }),

    // ── AUTHORISATION WORKFLOW ─────────────────────────────────────────────────

    // Authorise a payment item (green tick) — stamps authorisedBy + datetime
    authorise: adminProcedure
      .input(z.object({
        type: z.enum(["payroll", "receipt", "volunteer", "loan"]),
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return { success: true };
        const { eq } = await import("drizzle-orm");
        const { payrollRecords, receipts: receiptsTable, volunteerPayments, loanRepayments } = await import("../drizzle/schema");
        const now = new Date();
        const authorName = ctx.user.name ?? "Admin";
        if (input.type === "payroll") {
          await db.update(payrollRecords).set({ authorisedById: ctx.user.id, authorisedByName: authorName, authorisedAt: now, rejectedById: null, rejectedAt: null, rejectionComment: null, deferredToMonth: null, deferredToYear: null } as any).where(eq(payrollRecords.id, input.id));
        } else if (input.type === "receipt") {
          await db.update(receiptsTable).set({ authorisedById: ctx.user.id, authorisedByName: authorName, authorisedAt: now, rejectedById: null, rejectedAt: null, rejectionComment: null, deferredToMonth: null, deferredToYear: null } as any).where(eq(receiptsTable.id, input.id));
        } else if (input.type === "volunteer") {
          await db.update(volunteerPayments).set({ authorisedById: ctx.user.id, authorisedByName: authorName, authorisedAt: now, rejectedById: null, rejectedAt: null, rejectionComment: null, deferredToMonth: null, deferredToYear: null, updatedAt: now } as any).where(eq(volunteerPayments.id, input.id));
        } else {
          await db.update(loanRepayments).set({ authorisedById: ctx.user.id, authorisedByName: authorName, authorisedAt: now, rejectedById: null, rejectedAt: null, rejectionComment: null, deferredToMonth: null, deferredToYear: null } as any).where(eq(loanRepayments.id, input.id));
        }
        return { success: true, authorisedAt: now, authorisedByName: authorName };
      }),

    // Reject a payment item (red X) — adds comment and defers to next month
    reject: adminProcedure
      .input(z.object({
        type: z.enum(["payroll", "receipt", "volunteer", "loan"]),
        id: z.number(),
        comment: z.string().optional(),
        month: z.number(),
        year: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return { success: true };
        const { eq } = await import("drizzle-orm");
        const { payrollRecords, receipts: receiptsTable, volunteerPayments, loanRepayments } = await import("../drizzle/schema");
        const now = new Date();
        const rejectorName = ctx.user.name ?? "Admin";
        // Defer to next month
        const nextMonth = input.month === 12 ? 1 : input.month + 1;
        const nextYear = input.month === 12 ? input.year + 1 : input.year;
        const fields = { rejectedById: ctx.user.id, rejectedByName: rejectorName, rejectedAt: now, rejectionComment: input.comment ?? "", deferredToMonth: nextMonth, deferredToYear: nextYear, authorisedById: null, authorisedAt: null };
        if (input.type === "payroll") {
          await db.update(payrollRecords).set({ ...fields, paymentStatus: "withheld", withheldAt: now, withheldReason: input.comment } as any).where(eq(payrollRecords.id, input.id));
        } else if (input.type === "receipt") {
          await db.update(receiptsTable).set({ ...fields, paymentStatus: "withheld", withheldAt: now, withheldReason: input.comment } as any).where(eq(receiptsTable.id, input.id));
        } else if (input.type === "volunteer") {
          await db.update(volunteerPayments).set({ ...fields, paymentStatus: "withheld", withheldAt: now, withheldReason: input.comment, updatedAt: now } as any).where(eq(volunteerPayments.id, input.id));
        } else {
          await db.update(loanRepayments).set({ ...fields, status: "withheld", withheldAt: now, withheldReason: input.comment } as any).where(eq(loanRepayments.id, input.id));
        }
        return { success: true, rejectedAt: now, deferredToMonth: nextMonth, deferredToYear: nextYear };
      }),

    // Extract cheque data from uploaded image using LLM vision
    extractChequeData: adminProcedure
      .input(z.object({ imageUrl: z.string() }))
      .mutation(async ({ input }) => {
        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: "You are a cheque data extraction assistant. Extract data from cheque images and return structured JSON only." },
              { role: "user", content: [
                { type: "image_url", image_url: { url: input.imageUrl, detail: "high" } },
                { type: "text", text: "Extract the following fields from this cheque image: chequeNumber (the cheque/check number, usually 6 digits in the bottom right), date (the date written on the cheque in ISO format YYYY-MM-DD), amount (the numeric amount, as a decimal string like '1250.00'), payee (the name on the 'Pay' line). Return JSON with keys: chequeNumber, date, amount, payee. If a field is not visible or unclear, use null." },
              ]},
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "cheque_data",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    chequeNumber: { type: ["string", "null"] },
                    date: { type: ["string", "null"] },
                    amount: { type: ["string", "null"] },
                    payee: { type: ["string", "null"] },
                  },
                  required: ["chequeNumber", "date", "amount", "payee"],
                  additionalProperties: false,
                },
              },
            },
          });
          const content = response?.choices?.[0]?.message?.content;
          const parsed = typeof content === "string" ? JSON.parse(content) : content;
          return { success: true, data: parsed };
        } catch (e) {
          return { success: false, data: { chequeNumber: null, date: null, amount: null, payee: null } };
        }
      }),

    // Universal evidence extraction — works for invoices, receipts, cheques, and any financial document
    extractEvidence: adminProcedure
      .input(z.object({ imageUrl: z.string(), documentType: z.enum(["invoice", "cheque", "receipt", "auto"]).default("auto") }))
      .mutation(async ({ input }) => {
        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: "You are a financial document extraction assistant. Extract structured data from invoices, cheques, receipts, and expense documents. Return JSON only." },
              { role: "user", content: [
                { type: "image_url", image_url: { url: input.imageUrl, detail: "high" } },
                { type: "text", text: `Analyse this financial document image and extract all available fields. Document type hint: ${input.documentType}. Extract: vendor (supplier/payee name), amount (total amount as decimal string e.g. '125.50'), date (document date as YYYY-MM-DD), chequeNumber (if cheque: 6-digit number from bottom), invoiceNumber (if invoice: invoice/ref number), description (brief description of goods/services), category (best guess: restaurant/cleaning/events/wholesale/temp_staff/travel/maintenance/uniforms/accommodation/other). Return JSON with keys: vendor, amount, date, chequeNumber, invoiceNumber, description, category. Use null for any field not found.` },
              ]},
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "evidence_data",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    vendor: { type: ["string", "null"] },
                    amount: { type: ["string", "null"] },
                    date: { type: ["string", "null"] },
                    chequeNumber: { type: ["string", "null"] },
                    invoiceNumber: { type: ["string", "null"] },
                    description: { type: ["string", "null"] },
                    category: { type: ["string", "null"] },
                  },
                  required: ["vendor", "amount", "date", "chequeNumber", "invoiceNumber", "description", "category"],
                  additionalProperties: false,
                },
              },
            },
          });
          const content = response?.choices?.[0]?.message?.content;
          const parsed = typeof content === "string" ? JSON.parse(content) : content;
          return { success: true, data: parsed };
        } catch (e) {
          return { success: false, data: { vendor: null, amount: null, date: null, chequeNumber: null, invoiceNumber: null, description: null, category: null } };
        }
      }),

    // All items for a month across all 4 types — for the Monthly Expenses page
    allItems: adminProcedure
      .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
      .query(async ({ input }) => {
        const { month, year } = input;
        const db = await (await import("./db")).getDb();
        if (!db) return { payroll: [], receipts: [], volunteers: [], loans: [] };
        const { eq, and, gte, lte, desc } = await import("drizzle-orm");
        const { payrollRecords, receipts: receiptsTable, volunteerPayments, loanRepayments, loanApplications, users: usersTable, staffProfiles } = await import("../drizzle/schema");
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        // Deferred items from previous month that point to this month
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;

        const payrollFields = {
          id: payrollRecords.id, employeeName: payrollRecords.employeeName,
          netPay: payrollRecords.netPay, grossPay: payrollRecords.grossPay,
          paymentMethod: payrollRecords.paymentMethod, paymentStatus: payrollRecords.paymentStatus,
          chequeNumber: payrollRecords.chequeNumber, chequeImageUrl: payrollRecords.chequeImageUrl,
          chequeIssuedAt: payrollRecords.chequeIssuedAt, invoiceUrl: payrollRecords.invoiceUrl,
          paidAt: payrollRecords.paidAt, withheldAt: payrollRecords.withheldAt, withheldReason: payrollRecords.withheldReason,
          authorisedById: payrollRecords.authorisedById, authorisedByName: payrollRecords.authorisedByName, authorisedAt: payrollRecords.authorisedAt,
          rejectedById: payrollRecords.rejectedById, rejectedByName: payrollRecords.rejectedByName, rejectedAt: payrollRecords.rejectedAt,
          rejectionComment: payrollRecords.rejectionComment, deferredToMonth: payrollRecords.deferredToMonth, deferredToYear: payrollRecords.deferredToYear,
          notes: payrollRecords.notes, month: payrollRecords.month, year: payrollRecords.year,
          fullName: staffProfiles.fullName,
        };
        const payrollCurrent = await db.select(payrollFields).from(payrollRecords)
          .leftJoin(staffProfiles, eq(payrollRecords.userId, staffProfiles.userId))
          .where(and(eq(payrollRecords.month, month), eq(payrollRecords.year, year)))
          .orderBy(desc(payrollRecords.createdAt));
        const payrollDeferred = await db.select(payrollFields).from(payrollRecords)
          .leftJoin(staffProfiles, eq(payrollRecords.userId, staffProfiles.userId))
          .where(and(eq(payrollRecords.deferredToMonth, month), eq(payrollRecords.deferredToYear, year)))
          .orderBy(desc(payrollRecords.createdAt));
        // Deduplicate by id
        const payrollIds = new Set(payrollCurrent.map(r => r.id));
        const payroll = [...payrollCurrent, ...payrollDeferred.filter(r => !payrollIds.has(r.id))];

        const receiptFields = {
          id: receiptsTable.id, vendor: receiptsTable.vendor,
          amount: receiptsTable.amount, totalAmount: receiptsTable.totalAmount,
          categoryName: receiptsTable.categoryName, departmentName: receiptsTable.departmentName,
          paymentMethod: receiptsTable.isChequePayment,
          paymentStatus: receiptsTable.paymentStatus, status: receiptsTable.status,
          chequeNumber: receiptsTable.chequeNumber, chequeImageUrl: receiptsTable.chequeImageUrl,
          chequeIssuedAt: receiptsTable.chequeIssuedAt, invoiceUrl: receiptsTable.invoiceUrl,
          imageUrl: receiptsTable.imageUrl, paidAt: receiptsTable.paidAt,
          authorisedById: receiptsTable.authorisedById, authorisedByName: receiptsTable.authorisedByName, authorisedAt: receiptsTable.authorisedAt,
          rejectedById: receiptsTable.rejectedById, rejectedByName: receiptsTable.rejectedByName, rejectedAt: receiptsTable.rejectedAt,
          rejectionComment: receiptsTable.rejectionComment, deferredToMonth: receiptsTable.deferredToMonth, deferredToYear: receiptsTable.deferredToYear,
          notes: receiptsTable.notes, receiptDate: receiptsTable.receiptDate,
          submitterName: usersTable.name,
        };
        const { or } = await import("drizzle-orm");
        const receiptsCurrent = await db.select(receiptFields).from(receiptsTable)
          .leftJoin(usersTable, eq(receiptsTable.userId, usersTable.id))
          .where(and(gte(receiptsTable.createdAt, startDate), lte(receiptsTable.createdAt, endDate)))
          .orderBy(desc(receiptsTable.createdAt));
        const receiptsDeferred = await db.select(receiptFields).from(receiptsTable)
          .leftJoin(usersTable, eq(receiptsTable.userId, usersTable.id))
          .where(and(eq(receiptsTable.deferredToMonth, month), eq(receiptsTable.deferredToYear, year)))
          .orderBy(desc(receiptsTable.createdAt));
        const receiptIds = new Set(receiptsCurrent.map(r => r.id));
        const receipts = [...receiptsCurrent, ...receiptsDeferred.filter(r => !receiptIds.has(r.id))];

        const volunteerFields = {
          id: volunteerPayments.id, recipientName: volunteerPayments.recipientName,
          recipientEmail: volunteerPayments.recipientEmail,
          amount: volunteerPayments.amount, description: volunteerPayments.description,
          paymentMethod: volunteerPayments.paymentMethod, paymentStatus: volunteerPayments.paymentStatus,
          chequeNumber: volunteerPayments.chequeNumber, chequeImageUrl: volunteerPayments.chequeImageUrl,
          invoiceUrl: volunteerPayments.invoiceUrl, paidAt: volunteerPayments.paidAt,
          withheldAt: volunteerPayments.withheldAt, withheldReason: volunteerPayments.withheldReason,
          authorisedById: volunteerPayments.authorisedById, authorisedByName: volunteerPayments.authorisedByName, authorisedAt: volunteerPayments.authorisedAt,
          rejectedById: volunteerPayments.rejectedById, rejectedByName: volunteerPayments.rejectedByName, rejectedAt: volunteerPayments.rejectedAt,
          rejectionComment: volunteerPayments.rejectionComment, deferredToMonth: volunteerPayments.deferredToMonth, deferredToYear: volunteerPayments.deferredToYear,
          notes: volunteerPayments.notes, month: volunteerPayments.month, year: volunteerPayments.year,
        };
        const volunteersCurrent = await db.select(volunteerFields).from(volunteerPayments)
          .where(and(eq(volunteerPayments.month, month), eq(volunteerPayments.year, year)))
          .orderBy(desc(volunteerPayments.createdAt));
        const volunteersDeferred = await db.select(volunteerFields).from(volunteerPayments)
          .where(and(eq(volunteerPayments.deferredToMonth, month), eq(volunteerPayments.deferredToYear, year)))
          .orderBy(desc(volunteerPayments.createdAt));
        const volunteerIds = new Set(volunteersCurrent.map(r => r.id));
        const volunteers = [...volunteersCurrent, ...volunteersDeferred.filter(r => !volunteerIds.has(r.id))];

        const loanFields = {
          id: loanRepayments.id, amount: loanRepayments.amount,
          paymentMethod: loanRepayments.paymentMethod, status: loanRepayments.status,
          evidenceUrl: loanRepayments.evidenceUrl, chequeNumber: loanRepayments.chequeNumber,
          chequeImageUrl: loanRepayments.chequeImageUrl, invoiceUrl: loanRepayments.invoiceUrl,
          paidAt: loanRepayments.paidAt, withheldAt: loanRepayments.withheldAt, withheldReason: loanRepayments.withheldReason,
          authorisedById: loanRepayments.authorisedById, authorisedByName: loanRepayments.authorisedByName, authorisedAt: loanRepayments.authorisedAt,
          rejectedById: loanRepayments.rejectedById, rejectedByName: loanRepayments.rejectedByName, rejectedAt: loanRepayments.rejectedAt,
          rejectionComment: loanRepayments.rejectionComment, deferredToMonth: loanRepayments.deferredToMonth, deferredToYear: loanRepayments.deferredToYear,
          notes: loanRepayments.notes, month: loanRepayments.month, year: loanRepayments.year,
          borrowerName: loanApplications.borrowerName,
        };
        const loansCurrent = await db.select(loanFields).from(loanRepayments)
          .innerJoin(loanApplications, eq(loanRepayments.loanId, loanApplications.id))
          .where(and(eq(loanRepayments.month, month), eq(loanRepayments.year, year)))
          .orderBy(desc(loanRepayments.createdAt));
        const loansDeferred = await db.select(loanFields).from(loanRepayments)
          .innerJoin(loanApplications, eq(loanRepayments.loanId, loanApplications.id))
          .where(and(eq(loanRepayments.deferredToMonth, month), eq(loanRepayments.deferredToYear, year)))
          .orderBy(desc(loanRepayments.createdAt));
        const loanIds = new Set(loansCurrent.map(r => r.id));
        const loans = [...loansCurrent, ...loansDeferred.filter(r => !loanIds.has(r.id))];

        return { payroll, receipts, volunteers, loans };
      }),

    // Monthly income vs expenses summary for reports
    monthlySummary: adminProcedure
      .input(z.object({ month: z.number(), year: z.number() }))
      .query(async ({ input }) => {
        const { month, year } = input;
        const db = await (await import("./db")).getDb();
        if (!db) return null;
        const { eq, and, gte, lte, sum } = await import("drizzle-orm");
        const { payrollRecords, receipts: receiptsTable, incomeRecords, fridayCollections } = await import("../drizzle/schema");

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        // Income: income records for the month
        const incomeRows = await db.select().from(incomeRecords)
          .where(and(gte(incomeRecords.createdAt, startDate), lte(incomeRecords.createdAt, endDate)));
        const fridayRows = await db.select().from(fridayCollections)
          .where(and(gte(fridayCollections.createdAt, startDate), lte(fridayCollections.createdAt, endDate)));

        // Expenses: payroll net pay for the month
        const payrollRows = await db.select().from(payrollRecords)
          .where(and(eq(payrollRecords.month, month), eq(payrollRecords.year, year)));

        // Expenses: approved receipts for the month
        const receiptRows = await db.select().from(receiptsTable)
          .where(and(gte(receiptsTable.createdAt, startDate), lte(receiptsTable.createdAt, endDate)));

        const totalIncome = incomeRows.reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0)
          + fridayRows.reduce((s, r) => s + parseFloat(String(r.totalAmount ?? 0)), 0);
        const totalPayroll = payrollRows.reduce((s, r) => s + parseFloat(String(r.netPay ?? 0)), 0);
        const totalReceipts = receiptRows.filter(r => r.status === "approved").reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
        const totalExpenses = totalPayroll + totalReceipts;
        const netBalance = totalIncome - totalExpenses;

        const unbankedCash = payrollRows.filter(r => r.paymentMethod === "cash" && r.paymentStatus === "paid" && r.bankingStatus === "unbanked").reduce((s, r) => s + parseFloat(String(r.netPay ?? 0)), 0);
        const unbankedCheques = payrollRows.filter(r => r.paymentMethod === "cheque" && r.paymentStatus === "paid" && r.bankingStatus === "unbanked").reduce((s, r) => s + parseFloat(String(r.netPay ?? 0)), 0);

        return {
          month, year,
          income: {
            total: totalIncome,
            breakdown: [
              ...incomeRows.map(r => ({ label: (r as any).description ?? r.tenantName ?? "Income", amount: parseFloat(String(r.amount ?? 0)), category: r.categoryName ?? "General", paymentMethod: r.paymentMethod })),
              ...fridayRows.map(r => ({ label: `Friday Collection ${r.collectionDate}`, amount: parseFloat(String(r.totalAmount ?? 0)), category: "Friday Collection", paymentMethod: "cash" })),
            ],
          },
          expenses: {
            total: totalExpenses,
            payroll: { total: totalPayroll, records: payrollRows.map(r => ({ name: r.employeeName ?? `Employee #${r.userId}`, net: parseFloat(String(r.netPay ?? 0)), method: r.paymentMethod, status: r.paymentStatus })) },
            receipts: { total: totalReceipts, records: receiptRows.filter(r => r.status === "approved").map(r => ({ vendor: r.vendor ?? "Unknown", amount: parseFloat(String(r.amount ?? 0)), category: r.categoryName ?? "General", department: r.departmentName ?? "" })) },
          },
          netBalance,
          unbankedCash,
          unbankedCheques,
          unbankedTotal: unbankedCash + unbankedCheques,
        };
      }),
  }),

  // ─── INCOME & RENTALS ─────────────────────────────────────────────────────

  income: router({
    categories: protectedProcedure.query(() => getIncomeCategories()),
    createCategory: adminProcedure
      .input(z.object({ name: z.string().min(1), description: z.string().optional(), color: z.string().optional(), allowedPeriods: z.string().optional(), requiresSpecification: z.boolean().optional() }))
      .mutation(({ input }) => createIncomeCategory(input)),
    list: adminProcedure
      .input(z.object({ categoryId: z.number().optional(), paymentStatus: z.string().optional(), startDate: z.date().optional(), endDate: z.date().optional(), month: z.number().optional(), year: z.number().optional(), limit: z.number().default(100), offset: z.number().default(0) }))
      .query(({ input }) => {
        const filters: any = { ...input };
        if (input.month && input.year) {
          filters.startDate = new Date(input.year, input.month - 1, 1);
          filters.endDate = new Date(input.year, input.month, 0, 23, 59, 59);
        }
        return getIncomeRecords(filters);
      }),
    create: adminProcedure
      .input(z.object({
        category: z.string().optional(), categoryId: z.number().optional(),
        subcategory: z.string().optional(), description: z.string().default(""),
        amount: z.string(), paymentStatus: z.string().default("paid"),
        period: z.string().default("monthly"),
        payerName: z.string().optional(), tenantName: z.string().optional(),
        payerEmail: z.string().optional(), payerPhone: z.string().optional(),
        reference: z.string().optional(),
        periodStart: z.string().optional(), periodEnd: z.string().optional(),
        receiptUrl: z.string().optional(), notes: z.string().optional(),
        incomeDate: z.string().optional(),
        month: z.number().optional(), year: z.number().optional(),
        // Friday Collections breakdown
        bucketCollection: z.string().optional(),
        cardPayment: z.string().optional(),
        cashWithheld: z.string().optional(),
        cashWithheldReason: z.string().optional(),
        totalBanked: z.string().optional(),
        totalBankedDate: z.string().optional(),
        // Sign-off
        signedByManager: z.string().optional(),
        signedByTrustee: z.string().optional(),
        // Fund type
        isRestricted: z.boolean().optional(),
        restrictedFundName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        let catId = input.categoryId ?? 1;
        let catName = input.category ?? "Other";
        if (input.category && !input.categoryId) {
          const db2 = await (await import('./db')).getDb();
          if (db2) {
            const { incomeCategories } = await import('../drizzle/schema');
            const { like } = await import('drizzle-orm');
            const existing = await db2.select().from(incomeCategories).where(like(incomeCategories.name, `%${input.category.substring(0,30)}%`)).limit(1);
            if (existing[0]) { catId = existing[0].id; catName = existing[0].name; }
            else {
              const res = await db2.insert(incomeCategories).values({ name: input.category, color: '#635BFF' });
              catId = (res as any).insertId ?? 1;
              catName = input.category;
            }
          }
        }
        const periodMap: Record<string,string> = { Daily:'one_off', Weekly:'one_off', Monthly:'monthly', 'One-off':'one_off', daily:'one_off', weekly:'one_off', monthly:'monthly', one_off:'one_off', annual:'annual' };
        const period = (periodMap[input.period] ?? 'monthly') as any;
        const hasSignOff = input.signedByManager || input.signedByTrustee;
        return createIncomeRecord({
          categoryId: catId, categoryName: catName,
          subcategory: input.subcategory,
          amount: input.amount,
          paymentStatus: input.paymentStatus as any,
          period,
          tenantName: input.tenantName ?? input.payerName ?? "",
          notes: input.notes,
          evidenceUrl: input.receiptUrl,
          recordedById: ctx.user.id,
          // Friday Collections breakdown
          bucketCollection: input.bucketCollection ?? null,
          cardPayment: input.cardPayment ?? null,
          cashWithheld: input.cashWithheld ?? null,
          cashWithheldReason: input.cashWithheldReason ?? null,
          totalBanked: input.totalBanked ?? null,
          totalBankedDate: input.totalBankedDate ?? null,
          // Sign-off
          signedByManager: input.signedByManager ?? null,
          signedByTrustee: input.signedByTrustee ?? null,
          signedAt: hasSignOff ? new Date() : null,
          periodStart: input.periodStart ? new Date(input.periodStart + 'T12:00:00') : null,
          periodEnd: input.periodEnd ? new Date(input.periodEnd + 'T12:00:00') : null,
          isRestricted: input.isRestricted ?? false,
          restrictedFundName: input.restrictedFundName ?? null,
        } as any);
      }),
    update: adminProcedure
      .input(z.object({ id: z.number(), paymentStatus: z.string().optional(), amount: z.string().optional(), notes: z.string().optional() }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await updateIncomeRecord(id, data as any); return { success: true }; }),
    delete: superAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq } = await import('drizzle-orm');
        const { incomeRecords } = await import('../drizzle/schema');
        const rows = await db.select().from(incomeRecords).where(eq(incomeRecords.id, input.id)).limit(1);
        if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCanDelete(ctx.user);
        await db.delete(incomeRecords).where(eq(incomeRecords.id, input.id));
        return { success: true };
      }),
    // ── Authorisation: Farid Ahmed tick
    checkFarid: adminProcedure
      .input(z.object({ id: z.number(), undo: z.boolean().default(false) }))
      .mutation(async ({ input }) => {
        const db2 = await (await import('./db')).getDb();
        if (!db2) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq: eq2 } = await import('drizzle-orm');
        const { incomeRecords: ir } = await import('../drizzle/schema');
        await db2.update(ir).set({ checkedByFaridAt: input.undo ? null : new Date() }).where(eq2(ir.id, input.id));
        return { success: true };
      }),
    // ── Authorisation: Mumin Khan tick
    checkMumin: adminProcedure
      .input(z.object({ id: z.number(), undo: z.boolean().default(false) }))
      .mutation(async ({ input }) => {
        const db2 = await (await import('./db')).getDb();
        if (!db2) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq: eq2 } = await import('drizzle-orm');
        const { incomeRecords: ir } = await import('../drizzle/schema');
        await db2.update(ir).set({ checkedByMuminAt: input.undo ? null : new Date() }).where(eq2(ir.id, input.id));
        return { success: true };
      }),
    // ── Trustee verification (Dr Abdul Hamid OR Galib Khan)
    trusteeVerify: adminProcedure
      .input(z.object({ id: z.number(), trusteeName: z.string().nullable() }))
      .mutation(async ({ input }) => {
        const db2 = await (await import('./db')).getDb();
        if (!db2) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq: eq2 } = await import('drizzle-orm');
        const { incomeRecords: ir } = await import('../drizzle/schema');
        await db2.update(ir).set({
          trusteeVerifiedBy: input.trusteeName,
          trusteeVerifiedAt: input.trusteeName ? new Date() : null,
        }).where(eq2(ir.id, input.id));
        return { success: true };
      }),
    // ── Update rental date range + evidence
    updateRentalDetails: adminProcedure
      .input(z.object({
        id: z.number(),
        rentalDateFrom: z.string().nullable().optional(),
        rentalDateTo: z.string().nullable().optional(),
        evidenceUrl: z.string().nullable().optional(),
        evidenceUrl2: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const db2 = await (await import('./db')).getDb();
        if (!db2) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq: eq2 } = await import('drizzle-orm');
        const { incomeRecords: ir } = await import('../drizzle/schema');
        const updates: any = {};
        if (input.rentalDateFrom !== undefined) updates.rentalDateFrom = input.rentalDateFrom ? new Date(input.rentalDateFrom + 'T12:00:00') : null;
        if (input.rentalDateTo !== undefined) updates.rentalDateTo = input.rentalDateTo ? new Date(input.rentalDateTo + 'T12:00:00') : null;
        if (input.evidenceUrl !== undefined) updates.evidenceUrl = input.evidenceUrl;
        if (input.evidenceUrl2 !== undefined) updates.evidenceUrl2 = input.evidenceUrl2;
        await db2.update(ir).set(updates).where(eq2(ir.id, input.id));
        return { success: true };
      }),

    // Merge AI-extracted tenant/rental fields into an existing income record
    mergeFromScan: seniorProcedure
      .input(z.object({
        id: z.number(),
        tenantName: z.string().nullish(),
        amount: z.number().nullish(),
        paymentDate: z.string().nullish(),
        periodStart: z.string().nullish(),
        periodEnd: z.string().nullish(),
        propertyUnit: z.string().nullish(),
        paymentMethod: z.string().nullish(),
        reference: z.string().nullish(),
        notes: z.string().nullish(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const normDate = (v: string) => {
          const m = v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
          if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
          const d = new Date(v); return isNaN(d.getTime()) ? v : d.toISOString().slice(0,10);
        };
        const DATE_KEYS = new Set(['paymentDate','periodStart','periodEnd']);
        const { id, ...fields } = input;
        const updates: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined && v !== null && v !== '') {
            updates[k] = (DATE_KEYS.has(k) && typeof v === 'string') ? normDate(v) : v;
          }
        }
        if (Object.keys(updates).length > 0) {
          const { incomeRecords } = await import('../drizzle/schema');
          await db.update(incomeRecords).set(updates as any).where(eq(incomeRecords.id, id));
        }
        return { success: true, updatedFields: Object.keys(updates) };
      }),
  }),


  // ─── DONORS ───────────────────────────────────────────────────────────────

  donors: router({
    list: adminProcedure.input(z.object({ isRegular: z.boolean().optional(), search: z.string().optional(), limit: z.number().default(100), offset: z.number().default(0) })).query(({ input }) => getDonors(input)),
    get: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => { const d = await getDonorById(input.id); if (!d) throw new TRPCError({ code: "NOT_FOUND" }); return d; }),
    create: adminProcedure.input(z.object({ name: z.string(), email: z.string().optional(), phone: z.string().optional(), address: z.string().optional(), isRegular: z.boolean().default(false), isGiftAid: z.boolean().default(false), notes: z.string().optional() })).mutation(({ input }) => createDonor(input)),
    update: adminProcedure.input(z.object({ id: z.number(), name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), address: z.string().optional(), isRegular: z.boolean().optional(), isGiftAid: z.boolean().optional(), notes: z.string().optional(), totalGiven: z.string().optional() })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      // ── Gift Aid UK postcode guard ─────────────────────────────────────────────
      if (data.isGiftAid === true) {
        // If enabling Gift Aid, check the donor has a UK address/postcode
        const db = await getDb();
        if (db) {
          const [existing] = await db.select().from(donors).where(eq(donors.id, id)).limit(1);
          const address = data.address ?? (existing as any)?.address ?? "";
          const ukPostcodeRegex = /[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}/i;
          if (!ukPostcodeRegex.test(address)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Gift Aid can only be claimed for UK taxpayers with a valid UK address and postcode. Please add a UK address before enabling Gift Aid.",
            });
          }
        }
      }
      await updateDonor(id, data as any);
      return { success: true };
    }),
    // Create or upsert multiple donors and link them to an income record
    linkToIncome: protectedProcedure.input(z.object({
      incomeRecordId: z.number(),
      donors: z.array(z.object({
        name: z.string(),
        email: z.string().optional(),
        phone: z.string().optional(),
        amount: z.string().optional(),
        notes: z.string().optional(),
      })),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { incomeDonors: incomeDonorsTable, donors: donorsTable } = await import("../drizzle/schema");
      const results: number[] = [];
      for (const d of input.donors) {
        // Upsert donor by name+email
        let donorId: number;
        if (d.email) {
          const existing = await db.select().from(donorsTable).where(eq(donorsTable.email, d.email)).limit(1);
          if (existing.length > 0) {
            donorId = existing[0].id;
            // Update phone if missing
            if (d.phone && !existing[0].phone) await db.update(donorsTable).set({ phone: d.phone }).where(eq(donorsTable.id, donorId));
          } else {
            const ins = await db.insert(donorsTable).values({ name: d.name, email: d.email, phone: d.phone ?? null, isRegular: false, totalGiven: "0" });
            donorId = (ins as any).insertId ?? (ins as any)[0]?.insertId;
          }
        } else {
          const ins = await db.insert(donorsTable).values({ name: d.name, phone: d.phone ?? null, isRegular: false, totalGiven: "0" });
          donorId = (ins as any).insertId ?? (ins as any)[0]?.insertId;
        }
        await db.insert(incomeDonorsTable).values({ incomeRecordId: input.incomeRecordId, donorId, amount: d.amount ?? null, notes: d.notes ?? null });
        results.push(donorId);
      }
      return { linkedDonorIds: results };
    }),
    // Send a donation receipt email to a donor
    sendReceipt: adminProcedure.input(z.object({
      donorName: z.string(),
      donorEmail: z.string(),
      amount: z.string().optional(),
      category: z.string(),
      incomeDate: z.string().optional(),
      authorisedBy: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { donorName, donorEmail, amount, category, incomeDate, authorisedBy } = input;
      const firstName = donorName.split(' ')[0];
      const amtStr = amount ? `£${parseFloat(amount).toFixed(2)}` : 'your donation';
      const dateStr = incomeDate ? new Date(incomeDate).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
      const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#0A192F;padding:24px;text-align:center"><h1 style="color:#00FFC2;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Donation Receipt</p></div><div style="padding:24px;background:#fff"><p>Assalamu Alaikum, ${firstName},</p><p>JazakAllahu Khayran for your generous donation. Please find your receipt details below:</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Donor Name</td><td style="padding:8px">${donorName}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Category</td><td style="padding:8px">${category}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Amount</td><td style="padding:8px">${amtStr}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Date</td><td style="padding:8px">${dateStr}</td></tr>${authorisedBy ? `<tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Authorised By</td><td style="padding:8px">${authorisedBy}</td></tr>` : ''}</table><p>May Allah accept your contribution and bless you abundantly.</p><p>Jazakallahu Khayran,<br><strong>Abdullah Quilliam Society Finance Team</strong></p></div><div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">This is an automated receipt from the AQ Society Finance System.</div></div>`;
      await sendGmail(donorEmail, donorName, `Donation Receipt — ${category} — Abdullah Quilliam Society`, html);
      return { success: true };
    }),
    // List donors linked to a specific income record
    byIncome: protectedProcedure.input(z.object({ incomeRecordId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { incomeDonors: incomeDonorsTable, donors: donorsTable } = await import("../drizzle/schema");
      const rows = await db.select({
        id: donorsTable.id, name: donorsTable.name, email: donorsTable.email, phone: donorsTable.phone,
        amount: incomeDonorsTable.amount, notes: incomeDonorsTable.notes, linkedAt: incomeDonorsTable.createdAt,
      }).from(incomeDonorsTable)
        .innerJoin(donorsTable, eq(incomeDonorsTable.donorId, donorsTable.id))
        .where(eq(incomeDonorsTable.incomeRecordId, input.incomeRecordId));
      return rows;
    }),

    // Merge AI-extracted fields into an existing donor record
    mergeFromScan: seniorProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().nullish(),
        email: z.string().nullish(),
        phone: z.string().nullish(),
        addressLine1: z.string().nullish(),
        city: z.string().nullish(),
        postcode: z.string().nullish(),
        giftAid: z.boolean().nullish(),
        notes: z.string().nullish(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { id, ...fields } = input;
        const { donors: donorsTable, scanMergeSnapshots } = await import('../drizzle/schema');
        // Fetch existing record for snapshot
        const [existing] = await db.select().from(donorsTable).where(eq(donorsTable.id, id)).limit(1);
        // Save snapshot BEFORE applying any changes
        let snapshotId: number | null = null;
        if (existing) {
          const [snapResult] = await db.insert(scanMergeSnapshots).values({
            tableName: 'donors',
            recordId: id,
            snapshotJson: JSON.stringify(existing),
            mergedByUserId: ctx.user.id,
            mergedByName: ctx.user.name,
          });
          snapshotId = (snapResult as any).insertId ?? null;
        }
        const updates: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined && v !== null && v !== '') updates[k] = v;
        }
        if (Object.keys(updates).length > 0) {
          await db.update(donorsTable).set(updates as any).where(eq(donorsTable.id, id));
        }
        return { success: true, updatedFields: Object.keys(updates), snapshotId };
      }),
    // Export annual giving statement as PDF
    exportAnnualStatement: adminProcedure
      .input(z.object({ donorId: z.number().int(), taxYear: z.number().int() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { fundraisingDonations: fd, fundraisingCampaigns: fc, pledgePayments: pp, pledges: pl, donors: dt } = await import("../drizzle/schema");
        const [donor] = await db.select().from(dt).where(eq(dt.id, input.donorId)).limit(1);
        if (!donor) throw new TRPCError({ code: "NOT_FOUND", message: "Donor not found" });
        // UK tax year: 6 April taxYear to 5 April taxYear+1
        const startDate = `${input.taxYear}-04-06`;
        const endDate = `${input.taxYear + 1}-04-05`;
        // Fetch donations in date range
        const donations = await db.select({
          id: fd.id, amount: fd.amount, donatedAt: fd.donatedAt,
          paymentMethod: fd.paymentMethod, giftAidDeclared: fd.giftAidDeclared,
          notes: fd.notes, campaignName: fc.name, referenceCode: fd.referenceCode,
        }).from(fd)
          .leftJoin(fc, eq(fd.campaignId, fc.id))
          .where(donor.email
            ? sql`${fd.donorEmail} = ${donor.email} AND ${fd.donatedAt} >= ${startDate} AND ${fd.donatedAt} <= ${endDate}`
            : sql`${fd.donorName} = ${donor.name} AND ${fd.donatedAt} >= ${startDate} AND ${fd.donatedAt} <= ${endDate}`)
          .orderBy(fd.donatedAt);
        // Fetch pledge payments in date range
        const pledgePaymentsRows = await db.select({
          id: pp.id, amount: pp.amount, paymentDate: pp.paymentDate,
          reference: pp.reference, pledgeId: pp.pledgeId,
          campaignName: pl.campaignName,
        }).from(pp)
          .leftJoin(pl, eq(pp.pledgeId, pl.id))
          .where(sql`${pp.donorId} = ${input.donorId} AND ${pp.paymentDate} >= ${startDate} AND ${pp.paymentDate} <= ${endDate}`)
          .orderBy(pp.paymentDate);
        const totalDonated = donations.reduce((s, d) => s + Number(d.amount ?? 0), 0);
        const totalPledgePaid = pledgePaymentsRows.reduce((s, p) => s + Number(p.amount ?? 0), 0);
        const giftAidTotal = donations.filter(d => d.giftAidDeclared).reduce((s, d) => s + Number(d.amount ?? 0), 0);
        const { generateAnnualStatement } = await import("./annualStatement");
        const pdfBuffer = await generateAnnualStatement({
          donorName: donor.name,
          donorEmail: donor.email,
          donorAddress: donor.address,
          taxYear: input.taxYear,
          donations: donations.map(d => ({
            date: d.donatedAt ? fmtDate(new Date(d.donatedAt)) : "—",
            amount: Number(d.amount ?? 0),
            campaign: d.campaignName,
            method: d.paymentMethod,
            giftAid: !!d.giftAidDeclared,
            reference: d.referenceCode,
          })),
          pledgePayments: pledgePaymentsRows.map(p => ({
            date: p.paymentDate ? fmtDate(new Date(p.paymentDate)) : "—",
            amount: Number(p.amount ?? 0),
            campaign: p.campaignName,
            reference: p.reference,
          })),
          totalDonated,
          totalPledgePaid,
          grandTotal: totalDonated + totalPledgePaid,
          giftAidTotal,
        });
        const fileKey = `statements/${input.donorId}-${input.taxYear}-${Date.now()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
        return { url, taxYear: input.taxYear, donorName: donor.name, grandTotal: totalDonated + totalPledgePaid };
      }),

    sendAnnualStatement: adminProcedure
      .input(z.object({ donorId: z.number().int(), taxYear: z.number().int() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { fundraisingDonations: fd, fundraisingCampaigns: fc, pledgePayments: pp, pledges: pl, donors: dt } = await import("../drizzle/schema");
        const [donor] = await db.select().from(dt).where(eq(dt.id, input.donorId)).limit(1);
        if (!donor) throw new TRPCError({ code: "NOT_FOUND", message: "Donor not found" });
        if (!donor.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Donor has no email address" });
        const startDate = `${input.taxYear}-04-06`;
        const endDate = `${input.taxYear + 1}-04-05`;
        const donations = await db.select({
          id: fd.id, amount: fd.amount, donatedAt: fd.donatedAt,
          paymentMethod: fd.paymentMethod, giftAidDeclared: fd.giftAidDeclared,
          notes: fd.notes, campaignName: fc.name, referenceCode: fd.referenceCode,
        }).from(fd)
          .leftJoin(fc, eq(fd.campaignId, fc.id))
          .where(donor.email
            ? sql`${fd.donorEmail} = ${donor.email} AND ${fd.donatedAt} >= ${startDate} AND ${fd.donatedAt} <= ${endDate}`
            : sql`${fd.donorName} = ${donor.name} AND ${fd.donatedAt} >= ${startDate} AND ${fd.donatedAt} <= ${endDate}`)
          .orderBy(fd.donatedAt);
        const pledgePaymentsRows = await db.select({
          id: pp.id, amount: pp.amount, paymentDate: pp.paymentDate,
          reference: pp.reference, pledgeId: pp.pledgeId, campaignName: pl.campaignName,
        }).from(pp)
          .leftJoin(pl, eq(pp.pledgeId, pl.id))
          .where(sql`${pp.donorId} = ${input.donorId} AND ${pp.paymentDate} >= ${startDate} AND ${pp.paymentDate} <= ${endDate}`)
          .orderBy(pp.paymentDate);
        const totalDonated = donations.reduce((s, d) => s + Number(d.amount ?? 0), 0);
        const totalPledgePaid = pledgePaymentsRows.reduce((s, p) => s + Number(p.amount ?? 0), 0);
        const giftAidTotal = donations.filter(d => d.giftAidDeclared).reduce((s, d) => s + Number(d.amount ?? 0), 0);
        const { generateAnnualStatement } = await import("./annualStatement");
        const pdfBuffer = await generateAnnualStatement({
          donorName: donor.name, donorEmail: donor.email, donorAddress: donor.address,
          taxYear: input.taxYear,
          donations: donations.map(d => ({
            date: d.donatedAt ? fmtDate(new Date(d.donatedAt)) : "—",
            amount: Number(d.amount ?? 0), campaign: d.campaignName,
            method: d.paymentMethod, giftAid: !!d.giftAidDeclared, reference: d.referenceCode,
          })),
          pledgePayments: pledgePaymentsRows.map(p => ({
            date: p.paymentDate ? fmtDate(new Date(p.paymentDate)) : "—",
            amount: Number(p.amount ?? 0), campaign: p.campaignName, reference: p.reference,
          })),
          totalDonated, totalPledgePaid,
          grandTotal: totalDonated + totalPledgePaid, giftAidTotal,
        });
        const fileKey = `statements/${input.donorId}-${input.taxYear}-${Date.now()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
        const firstName = donor.name.split(" ")[0];
        const grandTotal = totalDonated + totalPledgePaid;
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <p>AssalamuAlaikum Dear ${firstName},</p>
            <p>Please find attached your Annual Giving Statement for the UK tax year <strong>${input.taxYear}/${input.taxYear + 1}</strong> (6 April ${input.taxYear} – 5 April ${input.taxYear + 1}).</p>
            <p>Your total giving for this period: <strong>£${grandTotal.toFixed(2)}</strong>${giftAidTotal > 0 ? `, of which £${giftAidTotal.toFixed(2)} is eligible for Gift Aid (adding £${(giftAidTotal * 0.25).toFixed(2)} to your donations at no cost to you).` : "."}  </p>
            <p>You can download your statement here: <a href="${url}">Download Annual Statement PDF</a></p>
            <p>JazakAllahu Khayran for your continued generosity and support of AQ Society.</p>
            <p>BarakAllahu feekum,<br/>AQ Society Finance Team</p>
          </div>`;
        await sendGmail(donor.email, donor.name, `Your Annual Giving Statement ${input.taxYear}/${input.taxYear + 1} — AQ Society`, html);
        // Log the communication
        await db.insert(donorCommsLog).values({
          donorId: input.donorId,
          type: "annual_statement_sent",
          channel: "email",
          subject: `Annual Giving Statement ${input.taxYear}/${input.taxYear + 1}`,
          notes: `Total giving: £${grandTotal.toFixed(2)}. PDF: ${url}`,
        });
        return { success: true, url, taxYear: input.taxYear, donorName: donor.name, grandTotal };
      }),

    batchSendAnnualStatements: adminProcedure
      .input(z.object({ taxYear: z.number().int() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { fundraisingDonations: fd, fundraisingCampaigns: fc, pledgePayments: pp, pledges: pl, donors: dt } = await import("../drizzle/schema");
        // Get all donors with email addresses
        const allDonors = await getDonors({ limit: 1000 });
        const eligibleDonors = allDonors.filter((d: any) => d.email);
        const startDate = `${input.taxYear}-04-06`;
        const endDate = `${input.taxYear + 1}-04-05`;
        const { generateAnnualStatement } = await import("./annualStatement");
        let sent = 0;
        let skipped = 0;
        let failed = 0;
        const errors: string[] = [];
        for (const donor of eligibleDonors) {
          try {
            // Get donations for this donor in the tax year
            const donations = await db.select({
              id: fd.id, amount: fd.amount, donatedAt: fd.donatedAt,
              paymentMethod: fd.paymentMethod, giftAidDeclared: fd.giftAidDeclared,
              notes: fd.notes, campaignName: fc.name, referenceCode: fd.referenceCode,
            }).from(fd)
              .leftJoin(fc, eq(fd.campaignId, fc.id))
              .where(donor.email
                ? sql`${fd.donorEmail} = ${donor.email} AND ${fd.donatedAt} >= ${startDate} AND ${fd.donatedAt} <= ${endDate}`
                : sql`${fd.donorName} = ${donor.name} AND ${fd.donatedAt} >= ${startDate} AND ${fd.donatedAt} <= ${endDate}`)
              .orderBy(fd.donatedAt);
            const pledgePaymentsRows = await db.select({
              id: pp.id, amount: pp.amount, paymentDate: pp.paymentDate,
              reference: pp.reference, pledgeId: pp.pledgeId, campaignName: pl.campaignName,
            }).from(pp)
              .leftJoin(pl, eq(pp.pledgeId, pl.id))
              .where(sql`${pp.donorId} = ${donor.id} AND ${pp.paymentDate} >= ${startDate} AND ${pp.paymentDate} <= ${endDate}`)
              .orderBy(pp.paymentDate);
            const totalDonated = donations.reduce((s: number, d: any) => s + Number(d.amount ?? 0), 0);
            const totalPledgePaid = pledgePaymentsRows.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
            const grandTotal = totalDonated + totalPledgePaid;
            // Skip donors with no giving in this tax year
            if (grandTotal === 0) { skipped++; continue; }
            const giftAidTotal = donations.filter((d: any) => d.giftAidDeclared).reduce((s: number, d: any) => s + Number(d.amount ?? 0), 0);
            const pdfBuffer = await generateAnnualStatement({
              donorName: donor.name, donorEmail: donor.email!, donorAddress: donor.address,
              taxYear: input.taxYear,
              donations: donations.map((d: any) => ({
                date: d.donatedAt ? fmtDate(new Date(d.donatedAt)) : "—",
                amount: Number(d.amount ?? 0), campaign: d.campaignName,
                method: d.paymentMethod, giftAid: !!d.giftAidDeclared, reference: d.referenceCode,
              })),
              pledgePayments: pledgePaymentsRows.map((p: any) => ({
                date: p.paymentDate ? fmtDate(new Date(p.paymentDate)) : "—",
                amount: Number(p.amount ?? 0), campaign: p.campaignName, reference: p.reference,
              })),
              totalDonated, totalPledgePaid, grandTotal, giftAidTotal,
            });
            const fileKey = `statements/${donor.id}-${input.taxYear}-${Date.now()}.pdf`;
            const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
            const firstName = donor.name.split(" ")[0];
            const html = `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <p>AssalamuAlaikum Dear ${firstName},</p>
                <p>Please find attached your Annual Giving Statement for the UK tax year <strong>${input.taxYear}/${input.taxYear + 1}</strong> (6 April ${input.taxYear} – 5 April ${input.taxYear + 1}).</p>
                <p>Your total giving for this period: <strong>£${grandTotal.toFixed(2)}</strong>${giftAidTotal > 0 ? `, of which £${giftAidTotal.toFixed(2)} is eligible for Gift Aid (adding £${(giftAidTotal * 0.25).toFixed(2)} to your donations at no cost to you).` : "."}</p>
                <p>You can download your statement here: <a href="${url}">Download Annual Statement PDF</a></p>
                <p>JazakAllahu Khayran for your continued generosity and support of AQ Society.</p>
                <p>BarakAllahu feekum,<br/>AQ Society Finance Team</p>
              </div>`;
            await sendGmail(donor.email!, donor.name, `Your Annual Giving Statement ${input.taxYear}/${input.taxYear + 1} — AQ Society`, html);
            // Log the communication
            await db.insert(donorCommsLog).values({
              donorId: donor.id,
              type: "annual_statement_sent",
              channel: "email",
              subject: `Annual Giving Statement ${input.taxYear}/${input.taxYear + 1}`,
              notes: `Batch send. Total giving: £${grandTotal.toFixed(2)}`,
            });
            sent++;
          } catch (err: any) {
            failed++;
            errors.push(`${donor.name}: ${err?.message ?? "unknown error"}`);
          }
        }
        return { success: true, sent, skipped, failed, errors, taxYear: input.taxYear, totalEligible: eligibleDonors.length };
      }),
  }),
  // ─── EMAIL CAMPAIGNS ──────────────────────────────────────────────────────

  campaigns: router({
    list: adminProcedure.query(() => getEmailCampaigns()),
    get: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => { const c = await getEmailCampaignById(input.id); if (!c) throw new TRPCError({ code: "NOT_FOUND" }); return c; }),
    create: adminProcedure
      .input(z.object({ name: z.string(), subject: z.string(), body: z.string(), type: z.string().default("newsletter"), scheduledAt: z.date().optional(), targetAudience: z.string().default("all_donors") }))
      .mutation(async ({ ctx, input }) => createEmailCampaign({ name: input.name, subject: input.subject, body: input.body, type: (input.type === "email" || input.type === "sms" || input.type === "both" ? input.type : "email") as "email" | "sms" | "both", targetAudience: input.targetAudience as any, scheduledAt: input.scheduledAt, status: (input.scheduledAt ? "scheduled" : "draft") as any, createdById: ctx.user.id })),
    send: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const campaign = await getEmailCampaignById(input.id);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      const allDonors = await getDonors({ limit: 1000 });
      const recipients = allDonors.filter(d => d.email);
      let sent = 0;
      for (const donor of recipients) {
        try { await sendGmail(donor.email!, donor.name ?? "Donor", campaign.subject ?? "", campaign.body ?? ""); sent++; } catch { /* continue */ }
      }
      await updateEmailCampaign(input.id, { status: "sent", sentAt: new Date(), sentCount: sent });
      return { success: true, sent };
    }),
  }),

  // ─── PAYROLL ──────────────────────────────────────────────────────────────

  payroll: router({
    list: adminProcedure.input(z.object({ userId: z.number().optional(), year: z.number().optional(), month: z.number().optional() })).query(({ input }) => getPayrollRecords(input.userId, input.year, input.month)),
    myPayslips: protectedProcedure.query(({ ctx }) => getPayrollRecords(ctx.user.id)),

    analyzePayslipBulk: adminProcedure
      .input(z.object({ fileUrl: z.string(), mimeType: z.string().default("application/pdf") }))
      .mutation(async ({ input }) => { return _analyzePayslipBulk(input); }),

    // Keep single-employee alias for backward compat
    analyzePayslip: adminProcedure
      .input(z.object({ fileUrl: z.string(), mimeType: z.string().default("application/pdf") }))
      .mutation(async ({ input }) => {
        // Inline the bulk logic to avoid circular appRouter.createCaller reference
        const bulk = await _analyzePayslipBulk(input);
        return bulk.employees[0] ?? null;
      }),

    create: adminProcedure
      .input(z.object({
        userId: z.number().default(0),
        employeeName: z.string().optional(), // free-text name when no user account
        month: z.number(), year: z.number(), grossPay: z.string(),
        incomeTax: z.string().default("0"), nationalInsurance: z.string().default("0"),
        pensionContribution: z.string().default("0"), otherDeductions: z.string().default("0"),
        netPay: z.string(), paymentMethod: z.string().default("bank_transfer"),
        payslipUrl: z.string().optional(), notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const totalDeductions = (parseFloat(input.incomeTax) + parseFloat(input.nationalInsurance) + parseFloat(input.pensionContribution) + parseFloat(input.otherDeductions)).toFixed(2);
        const { userId, employeeName, month, year, grossPay, incomeTax, nationalInsurance, pensionContribution, otherDeductions, netPay, paymentMethod, payslipUrl, notes } = input;
        const payrollId = await createPayrollRecord({ userId: userId ?? 0, employeeName, month, year, grossPay, incomeTax: incomeTax ?? "0", nationalInsurance: nationalInsurance ?? "0", pensionContribution: pensionContribution ?? "0", otherDeductions: otherDeductions ?? "0", totalDeductions, netPay, paymentMethod: (paymentMethod as any) ?? "bank_transfer", payslipUrl, notes });
        await logAudit({ userId: ctx.user.id, userName: ctx.user.name ?? ctx.user.email ?? undefined, action: "create", entity: "payroll", entityId: typeof payrollId === "number" ? payrollId : undefined, meta: { employeeName, month, year, netPay } });
        return payrollId;
      }),
    update: adminProcedure
      .input(z.object({ id: z.number(), paymentStatus: z.string().optional(), chequeImageUrl: z.string().optional(), chequeNumber: z.string().optional(), chequeAmount: z.string().optional(), paidAt: z.date().optional(), notes: z.string().optional() }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await updatePayrollRecord(id, data as any); return { success: true }; }),
    staffProfile: router({
      get: protectedProcedure.query(({ ctx }) => getStaffProfile(ctx.user.id)),
      getByUser: adminProcedure.input(z.object({ userId: z.number() })).query(({ input }) => getStaffProfile(input.userId)),
      upsert: adminProcedure
        .input(z.object({ userId: z.number(), fullName: z.string().optional(), niNumber: z.string().optional(), taxCode: z.string().optional(), bankName: z.string().optional(), bankAccountNumber: z.string().optional(), bankSortCode: z.string().optional(), startDate: z.date().optional(), contractType: z.string().optional(), paymentMethod: z.string().optional(), annualSalary: z.string().optional(), hourlyRate: z.string().optional() }))
         .mutation(async ({ input }) => { const { userId, ...data } = input; await upsertStaffProfile(userId, data as any); return { success: true }; }),
    }),

    exportMonthly: adminProcedure
      .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
      .query(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { payrollRecords: prTable } = await import('../drizzle/schema');
        const { and: andFn, eq: eqFn } = await import('drizzle-orm');
        const rows = await db.select().from(prTable)
          .where(andFn(eqFn(prTable.month, input.month), eqFn(prTable.year, input.year)))
          .orderBy(prTable.employeeName);
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const monthLabel = `${monthNames[input.month - 1]} ${input.year}`;
        const headers = ['Employee Name','Gross Pay','Income Tax','National Insurance','Pension','Other Deductions','Total Deductions','Net Pay','Payment Method','Cheque Number','Paid At','Authorised By','Status'];
        const csvRows = rows.map(r => [
          r.employeeName ?? `Employee #${r.userId}`,
          r.grossPay ?? '0', r.incomeTax ?? '0', r.nationalInsurance ?? '0',
          r.pensionContribution ?? '0', r.otherDeductions ?? '0', r.totalDeductions ?? '0', r.netPay ?? '0',
          r.paymentMethod ?? 'bank_transfer', r.chequeNumber ?? '',
          r.paidAt ? fmtDateTime(new Date(r.paidAt)) : '',
          r.authorisedByName ?? '', r.paymentStatus ?? 'pending',
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        const csv = [headers.join(','), ...csvRows].join('\n');
        const totals = rows.reduce((acc, r) => ({ gross: acc.gross + parseFloat(String(r.grossPay ?? 0)), net: acc.net + parseFloat(String(r.netPay ?? 0)), deductions: acc.deductions + parseFloat(String(r.totalDeductions ?? 0)) }), { gross: 0, net: 0, deductions: 0 });
        return { csv, monthLabel, rowCount: rows.length, totals };
      }),

    exportMonthlyPdf: adminProcedure
      .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
      .query(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { payrollRecords: prTable } = await import('../drizzle/schema');
        const { and: andFn, eq: eqFn } = await import('drizzle-orm');
        const rows = await db.select().from(prTable)
          .where(andFn(eqFn(prTable.month, input.month), eqFn(prTable.year, input.year)))
          .orderBy(prTable.employeeName);
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const monthLabel = `${monthNames[input.month - 1]} ${input.year}`;
        const totals = rows.reduce((acc, r) => ({ gross: acc.gross + parseFloat(String(r.grossPay ?? 0)), net: acc.net + parseFloat(String(r.netPay ?? 0)), deductions: acc.deductions + parseFloat(String(r.totalDeductions ?? 0)) }), { gross: 0, net: 0, deductions: 0 });
        const rowsHtml = rows.map(r => `<tr><td>${r.employeeName ?? `Employee #${r.userId}`}</td><td>£${parseFloat(String(r.grossPay??0)).toFixed(2)}</td><td>£${parseFloat(String(r.incomeTax??0)).toFixed(2)}</td><td>£${parseFloat(String(r.nationalInsurance??0)).toFixed(2)}</td><td>£${parseFloat(String(r.pensionContribution??0)).toFixed(2)}</td><td>£${parseFloat(String(r.otherDeductions??0)).toFixed(2)}</td><td><strong>£${parseFloat(String(r.netPay??0)).toFixed(2)}</strong></td><td>${r.paymentMethod??'bank_transfer'}</td><td>${r.chequeNumber??''}</td><td>${r.paidAt?fmtDate(new Date(r.paidAt)):''}</td><td>${r.authorisedByName??''}</td></tr>`).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payroll ${monthLabel}</title><style>body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:20px}h1{color:#1a3a2a;font-size:16px;margin-bottom:4px}p{margin:2px 0}table{width:100%;border-collapse:collapse;margin-top:12px}th{background:#1a3a2a;color:#fff;padding:5px 6px;text-align:left;font-size:10px}td{padding:4px 6px;border-bottom:1px solid #e5e7eb;font-size:10px}.total-row td{font-weight:bold;background:#f0f7f4;border-top:2px solid #1a3a2a}.footer{margin-top:24px;border-top:1px solid #ccc;padding-top:10px;font-size:10px;color:#666}</style></head><body><h1>AQ Society — Payroll Summary: ${monthLabel}</h1><p><strong>Generated:</strong> ${fmtDateTime(new Date())} &nbsp; <strong>Staff Count:</strong> ${rows.length}</p><table><thead><tr><th>Employee</th><th>Gross</th><th>Tax</th><th>NI</th><th>Pension</th><th>Other</th><th>Net Pay</th><th>Method</th><th>Cheque No</th><th>Paid</th><th>Authorised By</th></tr></thead><tbody>${rowsHtml}<tr class="total-row"><td>TOTALS (${rows.length} staff)</td><td>£${totals.gross.toFixed(2)}</td><td></td><td></td><td></td><td></td><td>£${totals.net.toFixed(2)}</td><td colspan="4"></td></tr></tbody></table><div class="footer"><p>Authorised by: Dr Abdul Hamid (Manager &amp; Trustee) — AQ Society Finance &amp; HR System</p></div></body></html>`;
        return { html, monthLabel, rowCount: rows.length, totals };
      }),

    getChequeRegister: adminProcedure
      .input(z.object({ year: z.number().optional() }))
      .query(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) return [];
        const { payrollRecords: prTable } = await import('../drizzle/schema');
        const { eq: eqFn, and: andFn } = await import('drizzle-orm');
        const conditions: any[] = [eqFn(prTable.paymentMethod, 'cheque')];
        if (input.year) conditions.push(eqFn(prTable.year, input.year));
        const rows = await db.select().from(prTable).where(andFn(...conditions as [any, ...any[]])).orderBy(prTable.chequeIssuedAt);
        return rows;
      }),

    markChequeBanked: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { payrollRecords: prTable } = await import('../drizzle/schema');
        const { eq: eqFn } = await import('drizzle-orm');
        await db.update(prTable).set({ bankingStatus: 'banked', bankedAt: new Date() }).where(eqFn(prTable.id, input.id));
        return { success: true };
      }),

    getStaffProfileByName: adminProcedure
      .input(z.object({ name: z.string() }))
      .query(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) return null;
        const { staffProfiles: spTable } = await import('../drizzle/schema');
        const nameLower = input.name.toLowerCase().trim();
        const allProfiles = await db.select({
          id: spTable.id, userId: spTable.userId, fullName: spTable.fullName,
          niNumber: spTable.niNumber, taxCode: spTable.taxCode,
          bankName: spTable.bankName, bankSortCode: spTable.bankSortCode,
          bankAccountNumber: spTable.bankAccountNumber, paymentMethod: spTable.paymentMethod,
        }).from(spTable);
        const match = allProfiles.find(p => {
          const profileName = (p.fullName ?? '').toLowerCase();
          if (!profileName) return false;
          return profileName.includes(nameLower) || nameLower.includes(profileName.split(' ')[0] ?? '');
        });
        return match ?? null;
      }),
  }),

  // ─── PAYROLL RUNS (two-trustee approval workflow) ──────────────────────────
  payrollRuns: router({
    get: seniorProcedure
      .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
      .query(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) return null;
        const { payrollRuns: prRunTable } = await import('../drizzle/schema');
        const { and: andFn, eq: eqFn } = await import('drizzle-orm');
        const rows = await db.select().from(prRunTable)
          .where(andFn(eqFn(prRunTable.month, input.month), eqFn(prRunTable.year, input.year)))
          .limit(1);
        return rows[0] ?? null;
      }),

    submit: seniorProcedure
      .input(z.object({ month: z.number().min(1).max(12), year: z.number(), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { payrollRuns: prRunTable, payrollRecords: prTable } = await import('../drizzle/schema');
        const { and: andFn, eq: eqFn } = await import('drizzle-orm');
        const records = await db.select().from(prTable)
          .where(andFn(eqFn(prTable.month, input.month), eqFn(prTable.year, input.year)));
        if (records.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No payroll records for this period' });
        const totals = records.reduce((acc, r) => ({
          gross: acc.gross + parseFloat(String(r.grossPay ?? 0)),
          tax: acc.tax + parseFloat(String(r.incomeTax ?? 0)),
          ni: acc.ni + parseFloat(String(r.nationalInsurance ?? 0)),
          pension: acc.pension + parseFloat(String(r.pensionContribution ?? 0)),
          net: acc.net + parseFloat(String(r.netPay ?? 0)),
        }), { gross: 0, tax: 0, ni: 0, pension: 0, net: 0 });
        const submitterName = (ctx.user as any).name ?? ctx.user.email ?? 'Unknown';
        const runData = {
          month: input.month, year: input.year, status: 'submitted' as const,
          submittedById: ctx.user.id, submittedByName: submitterName,
          submittedAt: new Date(),
          totalGross: String(totals.gross.toFixed(2)),
          totalTax: String(totals.tax.toFixed(2)),
          totalNI: String(totals.ni.toFixed(2)),
          totalPension: String(totals.pension.toFixed(2)),
          totalNet: String(totals.net.toFixed(2)),
          employeeCount: records.length,
          notes: input.notes ?? null,
        };
        const existing = await db.select().from(prRunTable)
          .where(andFn(eqFn(prRunTable.month, input.month), eqFn(prRunTable.year, input.year)))
          .limit(1);
        if (existing.length > 0) {
          if (existing[0].status === 'finalised') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Payroll run is already finalised' });
          await db.update(prRunTable).set(runData as any)
            .where(andFn(eqFn(prRunTable.month, input.month), eqFn(prRunTable.year, input.year)));
        } else {
          await db.insert(prRunTable).values(runData as any);
        }
        try {
          const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
          await notifyOwner({ title: `Payroll Run Submitted — ${monthNames[input.month-1]} ${input.year}`, content: `${submitterName} submitted payroll for ${monthNames[input.month-1]} ${input.year} (${records.length} employees, gross £${totals.gross.toFixed(2)}). Please review and approve.` });
        } catch {}
        return { success: true };
      }),

    approve: seniorProcedure
      .input(z.object({ month: z.number().min(1).max(12), year: z.number(), comment: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { payrollRuns: prRunTable } = await import('../drizzle/schema');
        const { and: andFn, eq: eqFn } = await import('drizzle-orm');
        const rows = await db.select().from(prRunTable)
          .where(andFn(eqFn(prRunTable.month, input.month), eqFn(prRunTable.year, input.year)))
          .limit(1);
        if (rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Payroll run not found — submit it first' });
        const run = rows[0];
        if (!['submitted', 'approved'].includes(run.status)) throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot approve a run with status: ${run.status}` });
        const approverName = (ctx.user as any).name ?? ctx.user.email ?? 'Unknown';
        const now = new Date();
        let updateData: any = {};
        if (!run.approver1Id) {
          updateData = { approver1Id: ctx.user.id, approver1Name: approverName, approver1At: now, approver1Comment: input.comment ?? null, status: 'approved' };
        } else if (!run.approver2Id && run.approver1Id !== ctx.user.id) {
          updateData = { approver2Id: ctx.user.id, approver2Name: approverName, approver2At: now, approver2Comment: input.comment ?? null, status: 'finalised' };
        } else if (run.approver1Id === ctx.user.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'You already approved this run. A second trustee must approve.' });
        } else {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'This payroll run already has two approvals.' });
        }
        await db.update(prRunTable).set(updateData)
          .where(andFn(eqFn(prRunTable.month, input.month), eqFn(prRunTable.year, input.year)));
        return { success: true, newStatus: updateData.status };
      }),

    reject: seniorProcedure
      .input(z.object({ month: z.number().min(1).max(12), year: z.number(), comment: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { payrollRuns: prRunTable } = await import('../drizzle/schema');
        const { and: andFn, eq: eqFn } = await import('drizzle-orm');
        const rejectorName = (ctx.user as any).name ?? ctx.user.email ?? 'Unknown';
        await db.update(prRunTable).set({
          status: 'rejected', rejectedById: ctx.user.id, rejectedByName: rejectorName,
          rejectedAt: new Date(), rejectionComment: input.comment,
        } as any).where(andFn(eqFn(prRunTable.month, input.month), eqFn(prRunTable.year, input.year)));
        return { success: true };
      }),

    exportFps: seniorProcedure
      .input(z.object({
        month: z.number().min(1).max(12), year: z.number(),
        payeRef: z.string().default('000/AQ00001'),
        accountsOfficeRef: z.string().default('000PA00000001'),
        employerName: z.string().default('AQ Society'),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { payrollRuns: prRunTable, payrollRecords: prTable, staffProfiles: spTable } = await import('../drizzle/schema');
        const { and: andFn, eq: eqFn } = await import('drizzle-orm');
        const records = await db.select().from(prTable)
          .where(andFn(eqFn(prTable.month, input.month), eqFn(prTable.year, input.year)));
        if (records.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No payroll records for this period' });
        const profiles = await db.select().from(spTable);
        const profileMap = new Map(profiles.map((p: any) => [p.userId, p]));
        const { generateFpsXml, deriveTaxYear } = await import('./payrollFps');
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const paymentDate = `${input.year}-${String(input.month).padStart(2,'0')}-28`;
        const fpsEmployees = records.map((r: any) => {
          const profile: any = profileMap.get(r.userId);
          return {
            employeeName: r.employeeName ?? profile?.fullName ?? `Employee #${r.userId}`,
            niNumber: r.niNumber ?? profile?.niNumber,
            taxCode: r.taxCode ?? profile?.taxCode,
            paymentDate,
            grossPay: parseFloat(String(r.grossPay ?? 0)),
            incomeTax: parseFloat(String(r.incomeTax ?? 0)),
            nationalInsurance: parseFloat(String(r.nationalInsurance ?? 0)),
            pensionContribution: parseFloat(String(r.pensionContribution ?? 0)),
            netPay: parseFloat(String(r.netPay ?? 0)),
            paymentMethod: r.paymentMethod === 'bank_transfer' ? 'BACS' : r.paymentMethod === 'cheque' ? 'Cheque' : 'Cash',
          };
        });
        const taxYear = deriveTaxYear(input.month, input.year);
        const xml = generateFpsXml({ payeRef: input.payeRef, accountsOfficeRef: input.accountsOfficeRef, employerName: input.employerName, taxYear, month: input.month, year: input.year }, fpsEmployees);
        const fileKey = `fps-xml/${input.year}-${String(input.month).padStart(2,'0')}-fps-${Date.now()}.xml`;
        const { url } = await storagePut(fileKey, Buffer.from(xml, 'utf-8'), 'application/xml');
        await db.update(prRunTable).set({ fpsXmlUrl: url, fpsExportedAt: new Date(), fpsExportedById: ctx.user.id } as any)
          .where(andFn(eqFn(prRunTable.month, input.month), eqFn(prRunTable.year, input.year)));
        return { url, xml, monthLabel: `${monthNames[input.month-1]} ${input.year}`, employeeCount: records.length };
      }),
  }),

  // ─── PENSION AUTO-ENROLMENT ────────────────────────────────────────────────
  pension: router({
    assess: seniorProcedure
      .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
      .query(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) return { employees: [], summary: { enrolled: 0, eligible: 0, notEligible: 0, approachingThreshold: 0, totalEmployeeContribs: 0, totalEmployerContribs: 0 } };
        const { payrollRecords: prTable, pensionEnrolments: peTable, staffProfiles: spTable } = await import('../drizzle/schema');
        const { and: andFn, eq: eqFn } = await import('drizzle-orm');
        const MONTHLY_TRIGGER = 833.33;
        const MONTHLY_LOWER_QE = 520.00;
        const MONTHLY_UPPER_QE = 4189.17;
        const records = await db.select().from(prTable)
          .where(andFn(eqFn(prTable.month, input.month), eqFn(prTable.year, input.year)));
        const enrolments = await db.select().from(peTable);
        const enrolmentMap = new Map(enrolments.map((e: any) => [e.employeeName.toLowerCase(), e]));
        const profiles = await db.select().from(spTable);
        const profileMap = new Map(profiles.map((p: any) => [p.userId, p]));
        const employees = records.map((r: any) => {
          const name = r.employeeName ?? `Employee #${r.userId}`;
          const gross = parseFloat(String(r.grossPay ?? 0));
          const profile: any = profileMap.get(r.userId);
          const existing: any = enrolmentMap.get(name.toLowerCase());
          const qe = Math.max(0, Math.min(gross, MONTHLY_UPPER_QE) - MONTHLY_LOWER_QE);
          const isEligible = gross >= MONTHLY_TRIGGER;
          const isApproaching = !isEligible && gross >= MONTHLY_TRIGGER * 0.90;
          const empPct = parseFloat(String(existing?.employeeContributionPct ?? '5.00'));
          const erPct = parseFloat(String(existing?.employerContributionPct ?? '3.00'));
          return {
            employeeName: name, niNumber: r.niNumber ?? profile?.niNumber ?? null,
            grossPay: gross, qualifyingEarnings: parseFloat(qe.toFixed(2)),
            isEligible, isApproaching, monthlyTrigger: MONTHLY_TRIGGER,
            status: existing?.status ?? (isEligible ? 'eligible_not_enrolled' : 'not_eligible'),
            enrolmentDate: existing?.enrolmentDate ?? null, optOutDate: existing?.optOutDate ?? null,
            pensionProvider: existing?.pensionProvider ?? null, pensionSchemeRef: existing?.pensionSchemeRef ?? null,
            employeeContributionPct: empPct, employerContributionPct: erPct,
            employeeContribAmount: parseFloat((qe * empPct / 100).toFixed(2)),
            employerContribAmount: parseFloat((qe * erPct / 100).toFixed(2)),
            totalContribAmount: parseFloat((qe * (empPct + erPct) / 100).toFixed(2)),
            enrolmentId: existing?.id ?? null,
          };
        });
        const summary = {
          enrolled: employees.filter((e: any) => e.status === 'enrolled').length,
          eligible: employees.filter((e: any) => e.isEligible).length,
          notEligible: employees.filter((e: any) => !e.isEligible).length,
          approachingThreshold: employees.filter((e: any) => e.isApproaching).length,
          totalEmployeeContribs: employees.filter((e: any) => e.status === 'enrolled').reduce((s: number, e: any) => s + e.employeeContribAmount, 0),
          totalEmployerContribs: employees.filter((e: any) => e.status === 'enrolled').reduce((s: number, e: any) => s + e.employerContribAmount, 0),
        };
        return { employees, summary };
      }),

    enrol: seniorProcedure
      .input(z.object({
        employeeName: z.string(), niNumber: z.string().optional(), userId: z.number().optional(),
        pensionProvider: z.string().optional(), pensionSchemeRef: z.string().optional(),
        employeeContributionPct: z.number().min(0).max(100).default(5),
        employerContributionPct: z.number().min(0).max(100).default(3),
        enrolmentDate: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { pensionEnrolments: peTable } = await import('../drizzle/schema');
        const { eq: eqFn } = await import('drizzle-orm');
        const today = new Date().toISOString().slice(0, 10);
        const existing = await db.select().from(peTable).where(eqFn(peTable.employeeName, input.employeeName)).limit(1);
        if (existing.length > 0) {
          await db.update(peTable).set({ status: 'enrolled', enrolmentDate: input.enrolmentDate ?? today, pensionProvider: input.pensionProvider ?? null, pensionSchemeRef: input.pensionSchemeRef ?? null, employeeContributionPct: String(input.employeeContributionPct), employerContributionPct: String(input.employerContributionPct), niNumber: input.niNumber ?? null } as any).where(eqFn(peTable.id, existing[0].id));
          return { success: true, id: existing[0].id };
        }
        await db.insert(peTable).values({ employeeName: input.employeeName, userId: input.userId ?? 0, niNumber: input.niNumber ?? null, status: 'enrolled', enrolmentDate: input.enrolmentDate ?? today, assessmentDate: today, pensionProvider: input.pensionProvider ?? null, pensionSchemeRef: input.pensionSchemeRef ?? null, employeeContributionPct: String(input.employeeContributionPct), employerContributionPct: String(input.employerContributionPct) } as any);
        return { success: true };
      }),

    optOut: seniorProcedure
      .input(z.object({ employeeName: z.string(), optOutDate: z.string().optional() }))
      .mutation(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { pensionEnrolments: peTable } = await import('../drizzle/schema');
        const { eq: eqFn } = await import('drizzle-orm');
        const today = new Date().toISOString().slice(0, 10);
        await db.update(peTable).set({ status: 'opted_out', optOutDate: input.optOutDate ?? today } as any).where(eqFn(peTable.employeeName, input.employeeName));
        return { success: true };
      }),

    list: seniorProcedure.query(async () => {
      const db = await import('./db').then(m => m.getDb());
      if (!db) return [];
      const { pensionEnrolments: peTable } = await import('../drizzle/schema');
      return db.select().from(peTable).orderBy(peTable.employeeName);
    }),

    contributionSchedule: seniorProcedure
      .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
      .query(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) return { rows: [], totals: { employee: 0, employer: 0, total: 0 } };
        const { payrollRecords: prTable, pensionEnrolments: peTable } = await import('../drizzle/schema');
        const { and: andFn, eq: eqFn } = await import('drizzle-orm');
        const MONTHLY_LOWER_QE = 520.00;
        const MONTHLY_UPPER_QE = 4189.17;
        const records = await db.select().from(prTable)
          .where(andFn(eqFn(prTable.month, input.month), eqFn(prTable.year, input.year)));
        const enrolments = await db.select().from(peTable).where(eqFn(peTable.status, 'enrolled'));
        const enrolmentMap = new Map(enrolments.map((e: any) => [e.employeeName.toLowerCase(), e]));
        const rows = records.map((r: any) => {
          const name = r.employeeName ?? `Employee #${r.userId}`;
          const enrolment: any = enrolmentMap.get(name.toLowerCase());
          if (!enrolment) return null;
          const gross = parseFloat(String(r.grossPay ?? 0));
          const qe = Math.max(0, Math.min(gross, MONTHLY_UPPER_QE) - MONTHLY_LOWER_QE);
          const empPct = parseFloat(String(enrolment.employeeContributionPct ?? '5'));
          const erPct = parseFloat(String(enrolment.employerContributionPct ?? '3'));
          return { employeeName: name, niNumber: enrolment.niNumber ?? null, grossPay: gross, qualifyingEarnings: parseFloat(qe.toFixed(2)), employeeContribPct: empPct, employerContribPct: erPct, employeeContrib: parseFloat((qe * empPct / 100).toFixed(2)), employerContrib: parseFloat((qe * erPct / 100).toFixed(2)), totalContrib: parseFloat((qe * (empPct + erPct) / 100).toFixed(2)), pensionProvider: enrolment.pensionProvider ?? 'Not specified', pensionSchemeRef: enrolment.pensionSchemeRef ?? null };
        }).filter(Boolean) as any[];
        const totals = rows.reduce((acc: any, r: any) => ({ employee: acc.employee + r.employeeContrib, employer: acc.employer + r.employerContrib, total: acc.total + r.totalContrib }), { employee: 0, employer: 0, total: 0 });
        return { rows, totals: { employee: parseFloat(totals.employee.toFixed(2)), employer: parseFloat(totals.employer.toFixed(2)), total: parseFloat(totals.total.toFixed(2)) } };
      }),
  }),

  // ─── RECONCILIATION ────────────────────────────────────────────────────────
  reconciliation: router({

    getOrCreate: adminProcedure
      .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { reconciliationSessions } = await import('../drizzle/schema');
        const { and: andFn } = await import('drizzle-orm');
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const existing = await db.select().from(reconciliationSessions)
          .where(andFn(eq(reconciliationSessions.month, input.month), eq(reconciliationSessions.year, input.year)))
          .limit(1);
        if (existing[0]) return existing[0];
        const [result] = await db.insert(reconciliationSessions).values({
          month: input.month, year: input.year, bankBalance: '0',
          status: 'draft', createdById: ctx.user.id,
        });
        const [session] = await db.select().from(reconciliationSessions)
          .where(eq(reconciliationSessions.id, (result as any).insertId)).limit(1);
        return session;
      }),

    updateBankBalance: adminProcedure
      .input(z.object({ month: z.number(), year: z.number(), bankBalance: z.string() }))
      .mutation(async ({ input }) => {
        const { reconciliationSessions } = await import('../drizzle/schema');
        const { and: andFn2 } = await import('drizzle-orm');
        const db = await import('./db').then(m => m.getDb());
        if (!db) return { success: true };
        // Check if session is already finalised — block edits after finalisation
        const existing = await db.select({ status: reconciliationSessions.status })
          .from(reconciliationSessions)
          .where(andFn2(eq(reconciliationSessions.month, input.month), eq(reconciliationSessions.year, input.year)))
          .limit(1);
        if (existing[0]?.status === 'finalised') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot update bank balance after reconciliation has been finalised.' });
        }
        await db.update(reconciliationSessions)
          .set({ bankBalance: input.bankBalance })
          .where(andFn2(eq(reconciliationSessions.month, input.month), eq(reconciliationSessions.year, input.year)));
        return { success: true };
      }),

    allPayments: adminProcedure
      .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
      .query(async ({ input }) => {
        const { payrollRecords, loanRepayments, loanApplications, receipts, volunteerPayments, staffProfiles, reconciliationSessions, users } = await import('../drizzle/schema');
        const { sql, and: andOp } = await import('drizzle-orm');
        const db = await import('./db').then(m => m.getDb());
        if (!db) return { payroll: [], loans: [], expenses: [], volunteers: [], session: null };

        const sessions = await db.select().from(reconciliationSessions)
          .where(andOp(eq(reconciliationSessions.month, input.month), eq(reconciliationSessions.year, input.year)))
          .limit(1);
        const session = sessions[0] ?? null;

        const payroll = await db.select({
          id: payrollRecords.id, type: sql`'payroll'`,
          payee: sql`COALESCE(${staffProfiles.fullName}, ${payrollRecords.employeeName}, ${users.name}, 'Employee')`,
          amount: payrollRecords.netPay,
          paymentMethod: payrollRecords.paymentMethod,
          paymentStatus: payrollRecords.paymentStatus,
          chequeImageUrl: payrollRecords.chequeImageUrl,
          invoiceUrl: payrollRecords.invoiceUrl,
          paidAt: payrollRecords.paidAt,
          withheldAt: payrollRecords.withheldAt,
          withheldReason: payrollRecords.withheldReason,
          notes: payrollRecords.notes,
          priority: sql`1`,
        }).from(payrollRecords)
          .leftJoin(users, eq(payrollRecords.userId, users.id))
          .leftJoin(staffProfiles, eq(payrollRecords.userId, staffProfiles.userId))
          .where(andOp(eq(payrollRecords.month, input.month), eq(payrollRecords.year, input.year)));

        const loans = await db.select({
          id: loanRepayments.id, type: sql`'loan'`,
          payee: loanApplications.borrowerName,
          amount: loanRepayments.amount,
          paymentMethod: sql`'cheque'`,
          paymentStatus: loanRepayments.status,
          chequeImageUrl: loanRepayments.evidenceUrl,
          invoiceUrl: sql`NULL`,
          paidAt: loanRepayments.paidAt,
          withheldAt: sql`NULL`,
          withheldReason: sql`NULL`,
          notes: loanRepayments.notes,
          priority: sql`2`,
        }).from(loanRepayments)
          .innerJoin(loanApplications, eq(loanRepayments.loanId, loanApplications.id))
          .where(andOp(eq(loanRepayments.month, input.month), eq(loanRepayments.year, input.year)));

        const expenses = await db.select({
          id: receipts.id, type: sql`'expense'`,
          payee: sql`COALESCE(${receipts.vendor}, 'Supplier')`,
          amount: receipts.totalAmount,
          paymentMethod: sql`'cash'`,
          paymentStatus: receipts.paymentStatus,
          chequeImageUrl: receipts.chequeImageUrl,
          invoiceUrl: receipts.imageUrl,
          paidAt: receipts.paidAt,
          withheldAt: receipts.withheldAt,
          withheldReason: receipts.withheldReason,
          notes: receipts.notes,
          priority: sql`3`,
        }).from(receipts)
          .where(andOp(
            sql`MONTH(${receipts.receiptDate}) = ${input.month}`,
            sql`YEAR(${receipts.receiptDate}) = ${input.year}`,
          ));

        const volunteers = await db.select({
          id: volunteerPayments.id, type: sql`'volunteer'`,
          payee: volunteerPayments.recipientName,
          amount: volunteerPayments.amount,
          paymentMethod: volunteerPayments.paymentMethod,
          paymentStatus: volunteerPayments.paymentStatus,
          chequeImageUrl: volunteerPayments.chequeImageUrl,
          invoiceUrl: volunteerPayments.invoiceUrl,
          paidAt: volunteerPayments.paidAt,
          withheldAt: volunteerPayments.withheldAt,
          withheldReason: volunteerPayments.withheldReason,
          notes: volunteerPayments.notes,
          priority: sql`4`,
        }).from(volunteerPayments)
          .where(andOp(eq(volunteerPayments.month, input.month), eq(volunteerPayments.year, input.year)));

        return { payroll, loans, expenses, volunteers, session };
      }),

    withholdPayment: adminProcedure
      .input(z.object({ type: z.enum(['loan', 'expense', 'volunteer']), id: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { loanRepayments, receipts, volunteerPayments } = await import('../drizzle/schema');
        const db = await import('./db').then(m => m.getDb());
        if (!db) return { success: true };
        const now = new Date();
        if (input.type === 'loan') {
          await db.update(loanRepayments).set({ status: 'withheld', withheldAt: now, withheldReason: input.reason ?? null } as any).where(eq(loanRepayments.id, input.id));
        } else if (input.type === 'expense') {
          await db.update(receipts).set({ paymentStatus: 'withheld', withheldAt: now, withheldReason: input.reason ?? null } as any).where(eq(receipts.id, input.id));
        } else {
          await db.update(volunteerPayments).set({ paymentStatus: 'withheld', withheldAt: now, withheldReason: input.reason ?? null } as any).where(eq(volunteerPayments.id, input.id));
        }
        return { success: true };
      }),

    markPaid: adminProcedure
      .input(z.object({ type: z.enum(['payroll', 'loan', 'expense', 'volunteer']), id: z.number(), chequeImageUrl: z.string().optional(), invoiceUrl: z.string().optional(), paymentMethod: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { payrollRecords, loanRepayments, receipts, volunteerPayments } = await import('../drizzle/schema');
        const db = await import('./db').then(m => m.getDb());
        if (!db) return { success: true };
        const now = new Date();
        const methodUpdate = input.paymentMethod ? { paymentMethod: input.paymentMethod } : {};
        if (input.type === 'payroll') {
          await db.update(payrollRecords).set({ paymentStatus: 'paid', paidAt: now, ...methodUpdate, ...(input.chequeImageUrl ? { chequeImageUrl: input.chequeImageUrl } : {}), ...(input.invoiceUrl ? { invoiceUrl: input.invoiceUrl } : {}) } as any).where(eq(payrollRecords.id, input.id));
        } else if (input.type === 'loan') {
          await db.update(loanRepayments).set({ status: 'paid', paidAt: now, ...(input.chequeImageUrl ? { evidenceUrl: input.chequeImageUrl } : {}) } as any).where(eq(loanRepayments.id, input.id));
        } else if (input.type === 'expense') {
          await db.update(receipts).set({ paymentStatus: 'paid', paidAt: now, ...methodUpdate, ...(input.chequeImageUrl ? { chequeImageUrl: input.chequeImageUrl } : {}), ...(input.invoiceUrl ? { imageUrl: input.invoiceUrl } : {}) } as any).where(eq(receipts.id, input.id));
        } else {
          await db.update(volunteerPayments).set({ paymentStatus: 'paid', paidAt: now, ...methodUpdate, ...(input.chequeImageUrl ? { chequeImageUrl: input.chequeImageUrl } : {}), ...(input.invoiceUrl ? { invoiceUrl: input.invoiceUrl } : {}) } as any).where(eq(volunteerPayments.id, input.id));
        }
        return { success: true };
      }),

    finalise: adminProcedure
      .input(z.object({ month: z.number(), year: z.number(), notes: z.string().optional() }))
       .mutation(async ({ ctx, input }) => {
        const { reconciliationSessions } = await import('../drizzle/schema');
        const { and: andFn3 } = await import('drizzle-orm');
        const db = await import('./db').then(m => m.getDb());
        if (!db) return { success: true };
        // Guard: prevent finalising if bank balance has not been entered (still at default '0')
        const [existing] = await db.select({ bankBalance: reconciliationSessions.bankBalance, status: reconciliationSessions.status })
          .from(reconciliationSessions)
          .where(andFn3(eq(reconciliationSessions.month, input.month), eq(reconciliationSessions.year, input.year)))
          .limit(1);
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'No reconciliation session found for this month. Please create one first.' });
        if (existing.status === 'finalised') throw new TRPCError({ code: 'BAD_REQUEST', message: 'This month has already been finalised.' });
        if (!existing.bankBalance || parseFloat(String(existing.bankBalance)) === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Bank balance must be entered before finalising. Please update the bank balance first.' });
        }
        await db.update(reconciliationSessions)
          .set({ status: 'finalised', finalisedAt: new Date(), finalisedById: ctx.user.id, notes: input.notes ?? null } as any)
          .where(andFn3(eq(reconciliationSessions.month, input.month), eq(reconciliationSessions.year, input.year)));
        return { success: true };
      }),
    // Full month-end financial statement: income + all expenditure with payment method breakdown
    fullStatement: adminProcedure
      .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
      .query(async ({ input }) => {
        const { month, year } = input;
        const db = await import('./db').then(m => m.getDb());
        if (!db) return null;
         const {
          payrollRecords, receipts: receiptsTable, incomeRecords, fridayCollections,
          fundraisingDonations, loanRepayments, loanApplications, volunteerPayments,
          staffProfiles, reconciliationSessions, users: usersTable, invoices: invoicesTable,
        } = await import('../drizzle/schema');
        const { and: andS, gte: gteS, lte: lteS, sql: sqlS } = await import('drizzle-orm');
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        // ── SESSION ──
        const sessions = await db.select().from(reconciliationSessions)
          .where(andS(eq(reconciliationSessions.month, month), eq(reconciliationSessions.year, year))).limit(1);
        const session = sessions[0] ?? null;
        // ── INCOME ──
        const incomeRows = await db.select().from(incomeRecords)
          .where(andS(gteS(incomeRecords.createdAt, startDate), lteS(incomeRecords.createdAt, endDate)));
        const fridayRows = await db.select().from(fridayCollections)
          .where(andS(gteS(fridayCollections.createdAt, startDate), lteS(fridayCollections.createdAt, endDate)));
        const donationRows = await db.select().from(fundraisingDonations)
          .where(andS(gteS(fundraisingDonations.donatedAt, startDate), lteS(fundraisingDonations.donatedAt, endDate)));;

        const incomeBreakdown = [
          ...incomeRows.map(r => ({ id: r.id, label: r.tenantName ?? 'Income', category: r.categoryName ?? 'Rental/Income', amount: parseFloat(String(r.amount ?? 0)), paymentMethod: r.paymentMethod ?? 'bank_transfer', source: 'income' as const })),
          ...fridayRows.map(r => ({ id: r.id, label: `Friday Collection ${r.collectionDate}`, category: 'Friday Collection', amount: parseFloat(String(r.totalAmount ?? 0)), paymentMethod: 'cash' as const, source: 'friday' as const })),
          ...donationRows.map(r => ({ id: r.id, label: r.donorName, category: 'Fundraising Donation', amount: parseFloat(String(r.amount ?? 0)), paymentMethod: r.paymentMethod ?? 'bank_transfer', source: 'donation' as const })),
        ];
        const totalIncome = incomeBreakdown.reduce((s, r) => s + r.amount, 0);

        // ── EXPENDITURE ──
        // Cash withheld from Friday collections (confirmed entries only)
        const cashWithheldRows = fridayRows.filter(r => r.cashWithheld && parseFloat(String(r.cashWithheld)) > 0 && r.cashWithheldConfirmedAt);
        const totalCashWithheld = cashWithheldRows.reduce((s, r) => s + parseFloat(String(r.cashWithheld ?? 0)), 0);

        // Payroll
        const payrollRows = await db.select({
          id: payrollRecords.id, employeeName: payrollRecords.employeeName,
          netPay: payrollRecords.netPay, paymentMethod: payrollRecords.paymentMethod,
          paymentStatus: payrollRecords.paymentStatus, paidAt: payrollRecords.paidAt,
          withheldAt: payrollRecords.withheldAt, withheldReason: payrollRecords.withheldReason,
          chequeImageUrl: payrollRecords.chequeImageUrl, invoiceUrl: payrollRecords.invoiceUrl,
          notes: payrollRecords.notes, userId: payrollRecords.userId,
          fullName: staffProfiles.fullName,
        }).from(payrollRecords)
          .leftJoin(staffProfiles, eq(payrollRecords.userId, staffProfiles.userId))
          .where(andS(eq(payrollRecords.month, month), eq(payrollRecords.year, year)));
        // All receipts (all users, all payment methods)
        const receiptRows = await db.select({
          id: receiptsTable.id, vendor: receiptsTable.vendor,
          amount: receiptsTable.totalAmount, paymentMethod: sqlS`'cash'`,
          paymentStatus: receiptsTable.paymentStatus, paidAt: receiptsTable.paidAt,
          withheldAt: receiptsTable.withheldAt, withheldReason: receiptsTable.withheldReason,
          chequeImageUrl: receiptsTable.chequeImageUrl, invoiceUrl: receiptsTable.imageUrl,
          notes: receiptsTable.notes, categoryName: receiptsTable.categoryName,
          departmentName: receiptsTable.departmentName, userId: receiptsTable.userId,
          submitterName: usersTable.name,
        }).from(receiptsTable)
          .leftJoin(usersTable, eq(receiptsTable.userId, usersTable.id))
          .where(andS(
            sqlS`MONTH(${receiptsTable.receiptDate}) = ${month}`,
            sqlS`YEAR(${receiptsTable.receiptDate}) = ${year}`,
          ));
        // Qarde Hasan repayments
        const loanRows = await db.select({
          id: loanRepayments.id, borrowerName: loanApplications.borrowerName,
          amount: loanRepayments.amount, paymentMethod: sqlS`'cheque'`,
          paymentStatus: loanRepayments.status, paidAt: loanRepayments.paidAt,
          evidenceUrl: loanRepayments.evidenceUrl, notes: loanRepayments.notes,
        }).from(loanRepayments)
          .innerJoin(loanApplications, eq(loanRepayments.loanId, loanApplications.id))
          .where(andS(eq(loanRepayments.month, month), eq(loanRepayments.year, year)));

        // Volunteer payments
        const volunteerRows = await db.select().from(volunteerPayments)
          .where(andS(eq(volunteerPayments.month, month), eq(volunteerPayments.year, year)));

        // Invoices (current month + deferred to this month)
        const invoiceCurrentRows = await db.select().from(invoicesTable)
          .where(andS(eq(invoicesTable.month, month), eq(invoicesTable.year, year)));
        const invoiceDeferredRows = await db.select().from(invoicesTable)
          .where(andS(eq(invoicesTable.deferredToMonth, month), eq(invoicesTable.deferredToYear, year)));
        const invoiceIds = new Set(invoiceCurrentRows.map(r => r.id));
        const invoiceRows = [...invoiceCurrentRows, ...invoiceDeferredRows.filter(r => !invoiceIds.has(r.id))];

        // Also load carried-forward items from previous month (withheld)
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        // Carry-forward: load all unpaid (pending OR withheld) items from previous month
        const carriedPayroll = await db.select({
          id: payrollRecords.id, employeeName: payrollRecords.employeeName,
          netPay: payrollRecords.netPay, paymentMethod: payrollRecords.paymentMethod,
          paymentStatus: payrollRecords.paymentStatus, paidAt: payrollRecords.paidAt,
          withheldAt: payrollRecords.withheldAt, withheldReason: payrollRecords.withheldReason,
          chequeImageUrl: payrollRecords.chequeImageUrl, invoiceUrl: payrollRecords.invoiceUrl,
          notes: payrollRecords.notes, userId: payrollRecords.userId,
          fullName: staffProfiles.fullName,
        }).from(payrollRecords)
          .leftJoin(staffProfiles, eq(payrollRecords.userId, staffProfiles.userId))
          .where(andS(
            eq(payrollRecords.month, prevMonth), eq(payrollRecords.year, prevYear),
            sqlS`${payrollRecords.paymentStatus} IN ('pending', 'withheld')`,
          ));
        const carriedReceipts = await db.select({
          id: receiptsTable.id, vendor: receiptsTable.vendor,
          amount: receiptsTable.totalAmount, paymentMethod: sqlS`'cash'`,
          paymentStatus: receiptsTable.paymentStatus, paidAt: receiptsTable.paidAt,
          withheldAt: receiptsTable.withheldAt, withheldReason: receiptsTable.withheldReason,
          chequeImageUrl: receiptsTable.chequeImageUrl, invoiceUrl: receiptsTable.imageUrl,
          notes: receiptsTable.notes, categoryName: receiptsTable.categoryName,
          departmentName: receiptsTable.departmentName, userId: receiptsTable.userId,
          submitterName: usersTable.name,
        }).from(receiptsTable)
          .leftJoin(usersTable, eq(receiptsTable.userId, usersTable.id))
          .where(andS(
            sqlS`MONTH(${receiptsTable.receiptDate}) = ${prevMonth}`,
            sqlS`YEAR(${receiptsTable.receiptDate}) = ${prevYear}`,
            sqlS`${receiptsTable.paymentStatus} IN ('pending', 'withheld')`,
          ));
        const carriedLoans = await db.select({
          id: loanRepayments.id, borrowerName: loanApplications.borrowerName,
          amount: loanRepayments.amount, paymentMethod: sqlS`'cheque'`,
          paymentStatus: loanRepayments.status, paidAt: loanRepayments.paidAt,
          evidenceUrl: loanRepayments.evidenceUrl, notes: loanRepayments.notes,
        }).from(loanRepayments)
          .innerJoin(loanApplications, eq(loanRepayments.loanId, loanApplications.id))
          .where(andS(
            eq(loanRepayments.month, prevMonth), eq(loanRepayments.year, prevYear),
            sqlS`${loanRepayments.status} IN ('pending', 'withheld', 'approved')`,
          ));
        const carriedVolunteers = await db.select().from(volunteerPayments)
          .where(andS(
            eq(volunteerPayments.month, prevMonth), eq(volunteerPayments.year, prevYear),
            sqlS`${volunteerPayments.paymentStatus} IN ('pending', 'withheld')`,
          ));
        const carriedInvoices = await db.select().from(invoicesTable)
          .where(andS(
            eq(invoicesTable.month, prevMonth), eq(invoicesTable.year, prevYear),
            sqlS`${invoicesTable.paymentStatus} IN ('pending', 'withheld')`,
          ));

        // Totals
        const totalPayroll = payrollRows.reduce((s, r) => s + parseFloat(String(r.netPay ?? 0)), 0);
        const totalReceipts = receiptRows.reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
        const totalLoans = loanRows.reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
        const totalVolunteers = volunteerRows.reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
        const totalInvoices = invoiceRows.reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
        const totalCarried = [
          ...carriedPayroll.map(r => parseFloat(String(r.netPay ?? 0))),
          ...carriedReceipts.map(r => parseFloat(String(r.amount ?? 0))),
          ...carriedLoans.map(r => parseFloat(String(r.amount ?? 0))),
          ...carriedVolunteers.map(r => parseFloat(String(r.amount ?? 0))),
          ...carriedInvoices.map(r => parseFloat(String(r.amount ?? 0))),
        ].reduce((s, v) => s + v, 0);
        const totalExpenditure = totalPayroll + totalReceipts + totalLoans + totalVolunteers + totalInvoices + totalCarried + totalCashWithheld;

        const bankBalance = parseFloat(String(session?.bankBalance ?? 0));
        const totalPaid = [
          ...payrollRows.filter(r => r.paymentStatus === 'paid').map(r => parseFloat(String(r.netPay ?? 0))),
          ...receiptRows.filter(r => r.paymentStatus === 'paid').map(r => parseFloat(String(r.amount ?? 0))),
          ...loanRows.filter(r => r.paymentStatus === 'paid').map(r => parseFloat(String(r.amount ?? 0))),
          ...volunteerRows.filter(r => r.paymentStatus === 'paid').map(r => parseFloat(String(r.amount ?? 0))),
          ...invoiceRows.filter(r => r.paymentStatus === 'paid').map(r => parseFloat(String(r.amount ?? 0))),
        ].reduce((s, v) => s + v, 0);
        const totalPending = totalExpenditure - totalPaid;
        const reconciliationBalance = bankBalance - totalPending;

        return {
          session,
          income: { total: totalIncome, breakdown: incomeBreakdown },
          expenditure: {
            total: totalExpenditure,
            cashWithheld: cashWithheldRows.map(r => ({ id: r.id, type: 'cash_withheld' as const, payee: 'Cash Withheld (Friday)', amount: String(r.cashWithheld ?? '0'), reason: r.cashWithheldReason, confirmedBy: r.cashWithheldConfirmedByName, confirmedAt: r.cashWithheldConfirmedAt, collectionDate: r.collectionDate, paymentMethod: 'cash', paymentStatus: 'paid', carriedFrom: null })),
            payroll: payrollRows.map(r => ({ ...r, type: 'payroll' as const, payee: r.fullName ?? r.employeeName ?? `Employee #${r.userId}`, amount: String(r.netPay ?? '0'), carriedFrom: null })),
            receipts: receiptRows.map(r => ({ ...r, type: 'expense' as const, payee: r.vendor ?? r.submitterName ?? 'Supplier', amount: String(r.amount ?? '0'), carriedFrom: null })),
            loans: loanRows.map(r => ({ ...r, type: 'loan' as const, payee: r.borrowerName ?? 'Borrower', amount: String(r.amount ?? '0'), paymentMethod: 'cheque', chequeImageUrl: r.evidenceUrl ?? null, invoiceUrl: null, withheldAt: null, withheldReason: null, carriedFrom: null })),
            volunteers: volunteerRows.map(r => ({ ...r, type: 'volunteer' as const, payee: r.recipientName ?? 'Volunteer', amount: String(r.amount ?? '0'), carriedFrom: null })),
            invoices: invoiceRows.map(r => ({ ...r, type: 'invoice' as const, payee: r.vendor ?? 'Supplier', amount: String(r.amount ?? '0'), paymentMethod: r.paymentMethod ?? 'cheque', carriedFrom: null })),
            carried: [
              ...carriedPayroll.map(r => ({ ...r, type: 'payroll' as const, payee: r.fullName ?? r.employeeName ?? `Employee #${r.userId}`, amount: String(r.netPay ?? '0'), carriedFrom: { month: prevMonth, year: prevYear } })),
              ...carriedReceipts.map(r => ({ ...r, type: 'expense' as const, payee: r.vendor ?? r.submitterName ?? 'Supplier', amount: String(r.amount ?? '0'), carriedFrom: { month: prevMonth, year: prevYear } })),
              ...carriedLoans.map(r => ({ ...r, type: 'loan' as const, payee: r.borrowerName ?? 'Borrower', amount: String(r.amount ?? '0'), paymentMethod: 'cheque', chequeImageUrl: r.evidenceUrl ?? null, invoiceUrl: null, withheldAt: null, withheldReason: null, carriedFrom: { month: prevMonth, year: prevYear } })),
              ...carriedVolunteers.map(r => ({ ...r, type: 'volunteer' as const, payee: r.recipientName ?? 'Volunteer', amount: String(r.amount ?? '0'), carriedFrom: { month: prevMonth, year: prevYear } })),
              ...carriedInvoices.map(r => ({ ...r, type: 'invoice' as const, payee: r.vendor ?? 'Supplier', amount: String(r.amount ?? '0'), paymentMethod: r.paymentMethod ?? 'cheque', carriedFrom: { month: prevMonth, year: prevYear } })),
            ],
          },
          totals: { totalIncome, totalExpenditure, totalPaid, totalPending, reconciliationBalance },
          prevMonth: { month: prevMonth, year: prevYear },
        };
      }),
  }),

  // ─── INVOICES ────────────────────────────────────────────────────────────────
  invoices: router({
    list: adminProcedure
      .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
      .query(async ({ input }) => {
        const { month, year } = input;
        const db = await (await import("./db")).getDb();
        if (!db) return [];
        const { eq, and, desc } = await import("drizzle-orm");
        const { invoices } = await import("../drizzle/schema");
        const current = await db.select().from(invoices)
          .where(and(eq(invoices.month, month), eq(invoices.year, year)))
          .orderBy(desc(invoices.createdAt));
        const deferred = await db.select().from(invoices)
          .where(and(eq(invoices.deferredToMonth, month), eq(invoices.deferredToYear, year)))
          .orderBy(desc(invoices.createdAt));
        const ids = new Set(current.map(r => r.id));
        return [...current, ...deferred.filter(r => !ids.has(r.id))];
      }),

    create: adminProcedure
      .input(z.object({
        month: z.number().min(1).max(12),
        year: z.number(),
        category: z.string(),
        subCategory: z.string().optional(),
        vendor: z.string().optional(),
        description: z.string().optional(),
        invoiceNumber: z.string().optional(),
        invoiceDate: z.string().optional(),
        amount: z.string(),
        paymentMethod: z.enum(["cheque", "bank_transfer", "cash"]).default("cheque"),
        evidenceUrl: z.string().optional(),
        chequeImageUrl: z.string().optional(),
        chequeNumber: z.string().optional(),
        chequeDate: z.string().optional(),
        chequeAmount: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { invoices } = await import("../drizzle/schema");
        const [result] = await db.insert(invoices).values({
          month: input.month,
          year: input.year,
          category: input.category,
          subCategory: input.subCategory ?? null,
          vendor: input.vendor ?? null,
          description: input.description ?? null,
          invoiceNumber: input.invoiceNumber ?? null,
          invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          paymentStatus: "pending",
          evidenceUrl: input.evidenceUrl ?? null,
          chequeImageUrl: input.chequeImageUrl ?? null,
          chequeNumber: input.chequeNumber ?? null,
          chequeDate: input.chequeDate ? new Date(input.chequeDate) : null,
          chequeAmount: input.chequeAmount ?? null,
          createdById: ctx.user.id,
        } as any);
        return { success: true, id: (result as any)?.insertId };
      }),

    authorise: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return { success: true };
        const { eq } = await import("drizzle-orm");
        const { invoices } = await import("../drizzle/schema");
        const now = new Date();
        await db.update(invoices).set({ authorisedById: ctx.user.id, authorisedByName: ctx.user.name ?? "Admin", authorisedAt: now, rejectedById: null, rejectedAt: null, rejectionComment: null, deferredToMonth: null, deferredToYear: null } as any).where(eq(invoices.id, input.id));
        return { success: true, authorisedAt: now, authorisedByName: ctx.user.name ?? "Admin" };
      }),

    reject: adminProcedure
      .input(z.object({ id: z.number(), comment: z.string().optional(), month: z.number(), year: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return { success: true };
        const { eq } = await import("drizzle-orm");
        const { invoices } = await import("../drizzle/schema");
        const now = new Date();
        const nextMonth = input.month === 12 ? 1 : input.month + 1;
        const nextYear = input.month === 12 ? input.year + 1 : input.year;
        await db.update(invoices).set({ rejectedById: ctx.user.id, rejectedByName: ctx.user.name ?? "Admin", rejectedAt: now, rejectionComment: input.comment ?? "", deferredToMonth: nextMonth, deferredToYear: nextYear, paymentStatus: "withheld", withheldAt: now, withheldReason: input.comment ?? "", authorisedById: null, authorisedAt: null } as any).where(eq(invoices.id, input.id));
        return { success: true, rejectedAt: now, deferredToMonth: nextMonth, deferredToYear: nextYear };
      }),

    markPaid: adminProcedure
      .input(z.object({ id: z.number(), chequeNumber: z.string().optional(), chequeImageUrl: z.string().optional(), evidenceUrl: z.string().optional(), paymentMethod: z.enum(["cheque", "bank_transfer", "cash"]).optional() }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return { success: true };
        const { eq } = await import("drizzle-orm");
        const { invoices } = await import("../drizzle/schema");
        const now = new Date();
        await db.update(invoices).set({ paymentStatus: "paid", paidAt: now, chequeNumber: input.chequeNumber ?? null, chequeImageUrl: input.chequeImageUrl ?? null, evidenceUrl: input.evidenceUrl ?? null, paymentMethod: input.paymentMethod ?? "cheque" } as any).where(eq(invoices.id, input.id));
        return { success: true, paidAt: now };
      }),

    delete: superAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq } = await import('drizzle-orm');
        const { invoices } = await import('../drizzle/schema');
        const rows = await db.select().from(invoices).where(eq(invoices.id, input.id)).limit(1);
        if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCanDelete(ctx.user);
        await db.delete(invoices).where(eq(invoices.id, input.id));
        return { success: true };
      }),
  }),

  // ─── UNIVERSAL AI DOCUMENT EXTRACTION ────────────────────────────────────
  documents: router({
    extract: protectedProcedure
      .input(z.object({
        fileUrl: z.string(),
        mimeType: z.string(),
        moduleType: z.enum([
          'income_rental', 'loan_repayment', 'loan_application',
          'invoice', 'payroll', 'friday_collection',
          'fundraising_donation', 'receipt', 'bank_statement',
          'handwritten_collection', 'business_card', 'bank_transfer_screenshot', 'crm_donor', 'staff_profile'
        ]),
        // Optional: existing record IDs to check for discrepancies
        existingRecordIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const isImage = input.mimeType.startsWith('image/');
        const isPdf = input.mimeType === 'application/pdf';
        const isCsv = input.mimeType === 'text/csv' || input.mimeType === 'application/csv';

        const MODULE_PROMPTS: Record<string, string> = {
          income_rental: `You are a UK property rental payment extractor. Extract from this document:
- tenantName: full name of the tenant/payer
- amount: payment amount in GBP (number)
- paymentDate: date of payment (YYYY-MM-DD)
- periodStart: rental period start date (YYYY-MM-DD or null)
- periodEnd: rental period end date (YYYY-MM-DD or null)
- propertyUnit: room, unit, or property name/number
- paymentMethod: cash/bank_transfer/cheque/standing_order or null
- reference: payment reference or null
- category: best matching category from: Student Accommodation, Office Rental, Hall Hire, Coffee Shop, Stalls, Events, Weddings, Nikah, Friday Collection, or Other
- notes: any additional notes
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

          loan_repayment: `You are a Qarde Hasan (interest-free loan) repayment extractor. Extract from this document:
- borrowerName: full name of the borrower
- amount: repayment amount in GBP (number)
- paymentDate: date of payment (YYYY-MM-DD)
- reference: payment reference or null
- paymentMethod: cash/bank_transfer/cheque or null
- notes: any additional notes
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

          loan_application: `You are a Qarde Hasan loan application extractor. Extract from this document:
- applicantName: full name of the applicant
- amountRequested: loan amount requested in GBP (number)
- purpose: purpose of the loan
- monthlyIncome: monthly income in GBP (number or null)
- employmentStatus: employed/self-employed/unemployed/student or null
- repaymentTerm: number of months (number or null)
- guarantorName: guarantor full name or null
- notes: any additional notes
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

          invoice: `You are a UK invoice/expense extractor. Extract from this document:
- vendorName: name of the supplier/vendor
- invoiceNumber: invoice number or reference
- amount: total amount in GBP (number)
- vatAmount: VAT amount in GBP (number or null)
- invoiceDate: invoice date (YYYY-MM-DD)
- dueDate: payment due date (YYYY-MM-DD or null)
- description: description of goods/services
- category: best matching from: Restaurant/Bistro, Cleaning & Hygiene, Events & Activities, Wholesale & Supplies, Travel & Transport, Maintenance & Repairs, Utilities, Professional Services, IT & Technology, Printing & Stationery, Staff Welfare, Ramadan, Other
- paymentMethod: cheque/bank_transfer/cash or null
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

          payroll: `You are a UK payroll document extractor. Extract from this document:
- employeeName: full name of the employee
- grossPay: gross salary in GBP (number)
- deductions: total deductions in GBP (number or null)
- netPay: net take-home pay in GBP (number)
- payPeriod: pay period month (1-12) or null
- payYear: pay period year (YYYY) or null
- niNumber: National Insurance number or null
- taxCode: tax code or null
- department: department name or null
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

          friday_collection: `You are a Friday mosque collection extractor. Extract from this document:
- collectionDate: date of Friday collection (YYYY-MM-DD)
- bucketTotal: total from collection buckets in GBP (number or null)
- cardTerminalTotal: total from card terminal in GBP (number or null)
- totalAmount: overall total in GBP (number)
- collectedBy: name of person who collected or null
- notes: any additional notes
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

          fundraising_donation: `You are a donation/fundraising extractor for a UK Islamic charity. Extract from this document:
- donorName: full name of donor
- donorPhone: UK phone number of donor (e.g. +44 7700 000000) or null
- donorEmail: email address of donor or null
- donorAddress: full postal address of donor (for Gift Aid) or null
- amount: donation amount in GBP (number)
- donationDate: date of donation (YYYY-MM-DD)
- paymentMethod: cash/bank_transfer/cheque/online or null
- reference: payment reference or null
- campaignName: fundraising campaign name or null
- giftAid: whether gift aid applies (true/false or null)
- beneficiaryName: if this is a Sadaqah Jariyah donation, the name of the person it is dedicated to (e.g. 'For my late father Ahmad') or null
- notes: any additional notes
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

          receipt: `You are a UK expense receipt extractor. Extract from this document:
- vendorName: name of the shop/vendor
- totalAmount: total amount paid in GBP (number)
- purchaseDate: date of purchase (YYYY-MM-DD)
- items: brief description of items purchased
- category: best matching from: Food & Catering, Cleaning & Hygiene, Maintenance & Repairs, IT & Technology, Printing & Stationery, Travel & Transport, Other
- vatAmount: VAT amount in GBP (number or null)
- paymentMethod: cash/card or null
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

          bank_statement: `You are a UK bank statement parser. Extract from this document:
- closingBalance: closing/end balance in GBP (number)
- statementDate: statement date or period end date (YYYY-MM-DD)
- accountName: account holder name
- sortCode: sort code (XX-XX-XX format)
- accountNumber: account number
- bankName: name of the bank
- openingBalance: opening balance in GBP (number or null)
- transactions: array of up to 10 most recent transactions, each with {date, description, debit, credit} (or null)
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

          handwritten_collection: `You are an expert at reading handwritten UK charity collection sheets. This image may be a handwritten form, table, or list. Extract ALL donor entries you can see. For each entry extract:
- donorName: full name of donor (read carefully, even if handwriting is unclear)
- donorPhone: phone number if visible (UK format preferred)
- donorEmail: email address if visible
- amount: donation amount in GBP (number, look for £ signs or numbers in amount columns)
- donationDate: date (YYYY-MM-DD) if visible, otherwise null
- campaignName: campaign or project name if written at top of sheet or next to entry
- giftAid: true if there is a tick, 'GA', 'Gift Aid', or 'Y' next to the entry, false otherwise
- paymentMethod: cash/cheque/bank_transfer based on any method column or notes
- notes: any additional notes or comments next to this entry
Return JSON with key "records" containing an array of all donors found. If only one donor is visible, still return as array. Use null for missing fields.`,

          business_card: `You are an expert at reading business cards. Extract from this business card image:
- donorName: full name (first and last name)
- donorPhone: phone number (prefer mobile/WhatsApp number, UK format)
- donorEmail: email address
- donorAddress: business address if shown
- organisation: company or organisation name
- jobTitle: job title or role
- website: website URL if shown
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

          bank_transfer_screenshot: `You are an expert at reading UK bank transfer confirmation screenshots. Extract from this screenshot:
- donorName: sender name or account name
- amount: transferred amount in GBP (number)
- donationDate: date of transfer (YYYY-MM-DD)
- reference: payment reference or description text
- senderBank: name of sender's bank if visible
- senderSortCode: sort code if visible
- senderAccountNumber: account number if visible
- recipientName: recipient account name
- transactionId: transaction ID or reference number
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,

          crm_donor: `You are an expert at extracting donor information for a UK Islamic charity CRM. This image may be a donor form, pledge card, or handwritten note. Extract:
- donorName: full name
- donorPhone: UK phone number (mobile preferred for WhatsApp)
- donorEmail: email address
- donorAddress: full postal address (important for Gift Aid)
- amount: donation or pledge amount in GBP (number)
- donationDate: date (YYYY-MM-DD)
- campaignName: campaign or project name
- giftAid: true if Gift Aid is ticked/declared, false otherwise
- beneficiaryName: if this is a Sadaqah Jariyah dedication, the name of the person it is for
- notes: any additional notes
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,
          staff_profile: `You are an expert at extracting staff and trustee profile information for a UK Islamic charity. This image may be a CV, ID document, business card, WhatsApp message, or staff form.

IMPORTANT RULES:
- "phone" = the PERSON'S OWN contact number (labelled "Contact number", "Mobile", "Tel", or similar for the main person)
- "nokPhone" = the NEXT OF KIN'S phone number ONLY (found after "Next of kin" or "NOK" section)
- "nokEmail" = the NEXT OF KIN'S email address ONLY (found after "Next of kin" or "NOK" section, labelled "Email" within that section)
- "email" = the PERSON'S OWN email address (NOT the NOK's email)
- If the document only shows a NOK phone and no separate member phone, set phone to null — do NOT copy the NOK phone into the phone field
- addressLine1/city/postcode = the PERSON'S OWN address (not NOK address)

Extract these fields:
- fullName: full legal name of the person
- role: job title or role (e.g. Trustee, Manager, Staff, Volunteer)
- email: the person's own email address
- phone: the person's own UK phone number (NOT the NOK phone)
- dateOfBirth: date of birth in format DD/MM/YYYY or YYYY-MM-DD
- addressLine1: person's street address (house number and street name)
- addressLine2: second address line if present
- city: person's city or town
- postcode: person's UK postcode
- nokName: next of kin full name
- nokPhone: next of kin phone number
- nokEmail: next of kin email address
- nokRelationship: relationship to next of kin (e.g. Wife, Husband, Parent, Sibling)
- notes: any additional notes
Return ONLY valid JSON with these exact fields. Use null for missing fields.`,
        };

        const systemPrompt = MODULE_PROMPTS[input.moduleType] || MODULE_PROMPTS['receipt'];

        let extractedData: Record<string, unknown> = {};
        let confidence = 0.8;
        let rawText = '';

        if (isCsv) {
          // For CSV: fetch the file and parse it as text
          const response = await fetch(input.fileUrl);
          rawText = await response.text();
          const csvResult = await invokeLLM({
            messages: [
              { role: 'system', content: systemPrompt + '\n\nThe input is CSV text. Parse all rows and return an array of records under the key "records". Each record should match the schema above.' },
              { role: 'user', content: `CSV content:\n${rawText.slice(0, 8000)}` },
            ],
            response_format: { type: 'json_schema', json_schema: { name: 'csv_extraction', strict: false, schema: { type: 'object', properties: { records: { type: 'array', items: { type: 'object' } } }, required: ['records'], additionalProperties: true } } },
          });
          const content = csvResult?.choices?.[0]?.message?.content;
          extractedData = typeof content === 'string' ? JSON.parse(content) : (content as unknown as Record<string, unknown>);
          confidence = 0.9;
        } else {
          // Image or PDF
          const contentType = isPdf ? 'file_url' : 'image_url';
          const userContent = contentType === 'image_url'
            ? [{ type: 'image_url' as const, image_url: { url: input.fileUrl, detail: 'high' as const } }]
            : [{ type: 'file_url' as const, file_url: { url: input.fileUrl, mime_type: 'application/pdf' as const } }];
          const llmResult = await invokeLLM({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
          });
          const content = llmResult?.choices?.[0]?.message?.content;
          if (!content) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI extraction failed — no response from model' });
          try {
            extractedData = typeof content === 'string' ? JSON.parse(content) : (content as unknown as Record<string, unknown>);
          } catch {
            // Try to extract JSON from the response
            const match = (content as string).match(/\{[\s\S]*\}/);
            if (match) extractedData = JSON.parse(match[0]);
            else throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI returned non-JSON response' });
          }
          confidence = 0.85;
        }

        // Discrepancy detection: compare extracted values against existing DB records
        const discrepancies: Array<{ field: string; extracted: unknown; existing: unknown; severity: 'warning' | 'error' }> = [];

        if (input.existingRecordIds && input.existingRecordIds.length > 0 && input.moduleType === 'loan_repayment') {
          // Check loan repayment amounts against scheduled instalments
          const db = await getDb();
          if (db) {
            const { loanRepayments, loanApplications } = await import('../drizzle/schema');
            const { inArray } = await import('drizzle-orm');
            const existing = await db.select().from(loanRepayments).where(inArray(loanRepayments.id, input.existingRecordIds));
            for (const record of existing) {
              const extractedAmount = extractedData['amount'] as number | null;
              if (extractedAmount && record.amount) {
                const diff = Math.abs(extractedAmount - Number(record.amount));
                if (diff > 1) {
                  discrepancies.push({ field: 'amount', extracted: extractedAmount, existing: record.amount, severity: diff > 50 ? 'error' : 'warning' });
                }
              }
            }
          }
        }

        return {
          extractedData,
          discrepancies,
          confidence,
          moduleType: input.moduleType,
          isBulk: 'records' in extractedData,
        };
      }),

    // ─── BASE64 UPLOAD (bypasses multer/multipart for iOS compatibility) ─────────────────────────
    uploadBase64: protectedProcedure
      .input(z.object({
        base64: z.string(), // base64-encoded image data (no data: prefix)
        mimeType: z.string(),
        fileName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ext = input.mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
        const fileName = input.fileName || `scan-${Date.now()}.${ext}`;
        const key = `receipts/${ctx.user.id}/${nanoid(8)}-${fileName}`;
        const buffer = Buffer.from(input.base64, 'base64');
        const { url } = await storagePut(key, buffer, input.mimeType);
        return { url, key };
      }),

    // ─── PROFILE MATCHER ───────────────────────────────────────────────────────────────────────────
    // Fuzzy-match an extracted name against existing records in the database.
    // Returns up to 3 candidate matches with a similarity score (0-100).
    // Used by SmartUpload to auto-select the matching existing profile.
    matchProfile: seniorProcedure
      .input(z.object({
        name: z.string(),
        email: z.string().optional(),
        phone: z.string().optional(),
        moduleType: z.enum([
          'staff_profile', 'crm_donor', 'income_rental', 'fundraising_donation',
          'loan_application', 'receipt', 'invoice', 'payroll', 'bank_statement',
          'friday_collection', 'handwritten_collection', 'business_card',
          'bank_transfer_screenshot', 'loan_repayment',
        ]),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { matches: [] };

        function normaliseName(n: string): string {
          return n.toLowerCase()
            .replace(/^(mr\.?|mrs\.?|ms\.?|dr\.?|prof\.?|rev\.?|sheikh\.?|shaikh\.?)\s+/i, '')
            .replace(/[^a-z0-9 ]/g, '').trim();
        }

        function diceSimilarity(a: string, b: string): number {
          if (!a || !b) return 0;
          if (a === b) return 1;
          const bigrams = (s: string) => {
            const bg = new Set<string>();
            for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
            return bg;
          };
          const bgA = bigrams(a);
          const bgB = bigrams(b);
          let intersection = 0;
          bgA.forEach(bg => { if (bgB.has(bg)) intersection++; });
          return (2 * intersection) / (bgA.size + bgB.size);
        }

        function tokenOverlap(a: string, b: string): number {
          const tokA = a.split(' ').filter(Boolean);
          const tokB = b.split(' ').filter(Boolean);
          const [shorter, longer] = tokA.length <= tokB.length ? [tokA, tokB] : [tokB, tokA];
          const matches = shorter.filter(t => longer.some(lt => lt.startsWith(t) || t.startsWith(lt)));
          return shorter.length ? matches.length / shorter.length : 0;
        }

        function scoreCandidate(candidateName: string, candidateEmail?: string | null, candidatePhone?: string | null): number {
          const normInput = normaliseName(input.name);
          const normCandidate = normaliseName(candidateName);
          let s = Math.max(
            diceSimilarity(normInput, normCandidate),
            tokenOverlap(normInput, normCandidate) * 0.9,
          );
          if (input.email && candidateEmail && input.email.toLowerCase() === candidateEmail.toLowerCase()) s = Math.max(s, 0.95);
          if (input.phone && candidatePhone) {
            const normPhone = (p: string) => p.replace(/[^0-9]/g, '').slice(-10);
            if (normPhone(input.phone) === normPhone(candidatePhone)) s = Math.max(s, 0.92);
          }
          return s;
        }

        type MatchCandidate = {
          id: number; name: string; subtitle: string;
          email?: string | null; phone?: string | null;
          score: number; table: string;
          currentFields?: Record<string, unknown>;
        };
        const candidates: MatchCandidate[] = [];

        const staffTypes = ['staff_profile', 'payroll', 'business_card'];
        const donorTypes = ['crm_donor', 'fundraising_donation', 'handwritten_collection'];
        const tenantTypes = ['income_rental'];
        const loanTypes = ['loan_application', 'loan_repayment'];

        if (staffTypes.includes(input.moduleType)) {
          const [trusteeRows] = await db.execute(
            'SELECT id, fullName, role, email, phone, dateOfBirth, addressLine1, addressLine2, city, postcode, nokName, nokPhone, nokEmail, nokRelationship, notes FROM trustees WHERE isActive = 1 LIMIT 200'
          ) as any;
          for (const row of (trusteeRows as any[])) {
            const s = scoreCandidate(row.fullName, row.email, row.phone);
            if (s > 0.3) candidates.push({ id: row.id, name: row.fullName, subtitle: row.role, email: row.email, phone: row.phone, score: s, table: 'trustees', currentFields: { fullName: row.fullName, role: row.role, email: row.email, phone: row.phone, dateOfBirth: row.dateOfBirth, addressLine1: row.addressLine1, addressLine2: row.addressLine2, city: row.city, postcode: row.postcode, nokName: row.nokName, nokPhone: row.nokPhone, nokEmail: row.nokEmail, nokRelationship: row.nokRelationship, notes: row.notes } });
          }
          const [spRows] = await db.execute(
            'SELECT sp.id, COALESCE(sp.fullName, u.name) AS displayName, u.email, sp.fullName, sp.contractType, sp.niNumber, sp.taxCode, sp.bankName, sp.bankAccountNumber, sp.bankSortCode, sp.startDate, sp.annualSalary, sp.hourlyRate FROM staff_profiles sp JOIN users u ON sp.userId = u.id LIMIT 200'
          ) as any;
          for (const row of (spRows as any[])) {
            const s = scoreCandidate(row.displayName, row.email);
            if (s > 0.3) candidates.push({ id: row.id, name: row.displayName, subtitle: row.contractType || 'Staff', email: row.email, score: s, table: 'staff_profiles', currentFields: { fullName: row.fullName, email: row.email, contractType: row.contractType, niNumber: row.niNumber, taxCode: row.taxCode, bankName: row.bankName, bankAccountNumber: row.bankAccountNumber, bankSortCode: row.bankSortCode, startDate: row.startDate, annualSalary: row.annualSalary, hourlyRate: row.hourlyRate } });
          }
          const [omRows] = await db.execute(
            'SELECT id, name, title FROM org_members WHERE isActive = 1 LIMIT 200'
          ) as any;
          for (const row of (omRows as any[])) {
            const s = scoreCandidate(row.name);
            if (s > 0.3) candidates.push({ id: row.id, name: row.name, subtitle: row.title, score: s, table: 'org_members' });
          }
        }

        if (donorTypes.includes(input.moduleType)) {
          const [donorRows] = await db.execute(
            'SELECT id, name, email, phone, address, isRegular, notes FROM donors LIMIT 500'
          ) as any;
          for (const row of (donorRows as any[])) {
            const s = scoreCandidate(row.name, row.email, row.phone);
            if (s > 0.3) candidates.push({ id: row.id, name: row.name, subtitle: 'Donor', email: row.email, phone: row.phone, score: s, table: 'donors', currentFields: { name: row.name, email: row.email, phone: row.phone, address: row.address, isRegular: row.isRegular, notes: row.notes } });
          }
        }

        if (tenantTypes.includes(input.moduleType)) {
          const [tenantRows] = await db.execute(
            'SELECT id, tenantName FROM income_records GROUP BY tenantName LIMIT 200'
          ) as any;
          for (const row of (tenantRows as any[])) {
            const s = scoreCandidate(row.tenantName);
            if (s > 0.3) candidates.push({ id: row.id, name: row.tenantName, subtitle: 'Tenant', score: s, table: 'income_records' });
          }
        }

        if (loanTypes.includes(input.moduleType)) {
          const [loanRows] = await db.execute(
            'SELECT id, borrowerName, borrowerEmail, borrowerPhone FROM loan_applications LIMIT 200'
          ) as any;
          for (const row of (loanRows as any[])) {
            const s = scoreCandidate(row.borrowerName, row.borrowerEmail, row.borrowerPhone);
            if (s > 0.3) candidates.push({ id: row.id, name: row.borrowerName, subtitle: 'Loan Applicant', email: row.borrowerEmail, phone: row.borrowerPhone, score: s, table: 'loan_applications' });
          }
        }

        if (['receipt', 'invoice', 'bank_statement', 'bank_transfer_screenshot', 'friday_collection'].includes(input.moduleType)) {
          const [userRows] = await db.execute(
            "SELECT id, name, email FROM users WHERE status = 'active' LIMIT 200"
          ) as any;
          for (const row of (userRows as any[])) {
            const s = scoreCandidate(row.name, row.email);
            if (s > 0.3) candidates.push({ id: row.id, name: row.name, subtitle: 'User', email: row.email, score: s, table: 'users' });
          }
        }

        candidates.sort((a, b) => b.score - a.score);
        const seen = new Set<string>();
        const unique = candidates.filter(c => {
          const key = `${c.table}:${c.id}`;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        });

        return {
          matches: unique.slice(0, 3).map(c => ({
            id: c.id,
            name: c.name,
            subtitle: c.subtitle,
            email: c.email ?? null,
            phone: c.phone ?? null,
            score: Math.round(c.score * 100),
            table: c.table,
            currentFields: c.currentFields ?? null,
           })),
        };
      }),

    // Universal AI OCR: extract fields from any document type
    extractFields: seniorProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        mimeType: z.string(),
        targetType: z.enum([
          "training_certificate", "policy_document", "decision_minutes",
          "receipt", "invoice", "donor_form", "staff_profile", "loan_application",
          "payroll", "bank_statement", "general",
        ]),
      }))
      .mutation(async ({ input }) => {
        const PROMPTS: Record<string, string> = {
          training_certificate: `Extract training certificate details. Return JSON with: userName (string|null), module (string|null), provider (string|null), completedAt (YYYY-MM-DD|null), expiresAt (YYYY-MM-DD|null), certificateNumber (string|null), notes (string|null). Use null for missing fields.`,
          policy_document: `Extract policy document details. Return JSON with: title (string|null), category (string|null), owner (string|null), version (string|null), reviewDate (YYYY-MM-DD|null), approvedAt (YYYY-MM-DD|null), approvedBy (string|null), status ("draft"|"active"|"archived"|null), notes (string|null). Use null for missing fields.`,
          decision_minutes: `Extract trustee meeting decision details. Return JSON with: title (string|null), motionText (string|null), proposer (string|null), seconder (string|null), votesFor (number|null), votesAgainst (number|null), abstentions (number|null), outcome ("passed"|"rejected"|"deferred"|"pending"|null), meetingDate (YYYY-MM-DD|null), notes (string|null). Use null for missing fields.`,
          receipt: `Extract receipt details. Return JSON with: vendor (string|null), date (YYYY-MM-DD|null), amount (number|null), tax (number|null), currency (string), paymentMethod (string|null), receiptNumber (string|null), categoryName (string|null), departmentGuess (string|null), notes (string|null). Use null for missing fields.`,
          invoice: `Extract invoice details. Return JSON with: vendorName (string|null), invoiceNumber (string|null), amount (number|null), vatAmount (number|null), invoiceDate (YYYY-MM-DD|null), dueDate (YYYY-MM-DD|null), description (string|null), category (string|null). Use null for missing fields.`,
          donor_form: `Extract donor registration details. Return JSON with: name (string|null), email (string|null), phone (string|null), addressLine1 (string|null), city (string|null), postcode (string|null), giftAid (boolean|null), donationType (string|null), amount (number|null), notes (string|null). Use null for missing fields.`,
          staff_profile: `Extract staff profile details. Return JSON with: fullName (string|null), email (string|null), phone (string|null), contractType (string|null), niNumber (string|null), taxCode (string|null), startDate (YYYY-MM-DD|null), role (string|null), department (string|null), notes (string|null). Use null for missing fields.`,
          loan_application: `Extract loan application details. Return JSON with: applicantName (string|null), amountRequested (number|null), purpose (string|null), monthlyIncome (number|null), employmentStatus (string|null), repaymentTerm (number|null), guarantorName (string|null), notes (string|null). Use null for missing fields.`,
          payroll: `Extract payroll details. Return JSON with: employeeName (string|null), grossPay (number|null), netPay (number|null), deductions (number|null), payPeriod (number|null), payYear (number|null), niNumber (string|null), taxCode (string|null), notes (string|null). Use null for missing fields.`,
          bank_statement: `Extract bank statement details. Return JSON with: accountName (string|null), accountNumber (string|null), sortCode (string|null), statementDate (YYYY-MM-DD|null), openingBalance (number|null), closingBalance (number|null), currency (string), notes (string|null). Use null for missing fields.`,
          general: `Extract all key information from this document. Return JSON with: title (string|null), date (YYYY-MM-DD|null), author (string|null), summary (string|null), keyFields (object with any relevant key-value pairs). Use null for missing fields.`,
        };
        const prompt = PROMPTS[input.targetType] ?? PROMPTS.general;
        const isImage = input.mimeType.startsWith("image/");
        const userContent = isImage
          ? [{ type: "image_url" as const, image_url: { url: input.fileUrl, detail: "high" as const } }, { type: "text" as const, text: prompt }]
          : [{ type: "file_url" as const, file_url: { url: input.fileUrl, mime_type: input.mimeType as any } }, { type: "text" as const, text: prompt }];
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are a precise document data extraction assistant for a UK charity. Always return valid JSON only, no markdown, no explanation." },
            { role: "user", content: userContent as any },
          ],
        });
        const raw = response.choices?.[0]?.message?.content;
        if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No response from AI" });
        const content = typeof raw === "string" ? raw : JSON.stringify(raw);
        // Strip markdown code fences if present
        const cleaned = content.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
        try {
          const fields = JSON.parse(cleaned);
          return { fields, targetType: input.targetType };
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned invalid JSON" });
        }
      }),
  }),
  // ─── BANK STATEMENT AI READER ─────────────────────────────────────────────
  bankStatement: router({
    extract: adminProcedure
      .input(z.object({
        fileUrl: z.string(),
        mimeType: z.string().default('image/jpeg'),
      }))
      .mutation(async ({ input }) => {
        const contentType = input.mimeType.includes('pdf') ? 'file_url' : 'image_url';
        const prompt = `You are a UK bank statement parser. Extract the following from this bank statement image or PDF:
- closingBalance: the closing/end balance (number, GBP)
- statementDate: the statement date or period end date (ISO string YYYY-MM-DD)
- accountName: the account holder name
- sortCode: sort code (XX-XX-XX format)
- accountNumber: account number
- bankName: name of the bank

Return ONLY valid JSON with these exact fields. If a field is not found, use null.`;
        const userContent = contentType === 'image_url'
          ? [{ type: 'image_url' as const, image_url: { url: input.fileUrl, detail: 'high' as const } }]
          : [{ type: 'file_url' as const, file_url: { url: input.fileUrl, mime_type: 'application/pdf' as const } }];
        const llmResponse = await invokeLLM({
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: userContent },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'bank_statement_data',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  closingBalance: { type: ['number', 'null'] },
                  statementDate: { type: ['string', 'null'] },
                  accountName: { type: ['string', 'null'] },
                  sortCode: { type: ['string', 'null'] },
                  accountNumber: { type: ['string', 'null'] },
                  bankName: { type: ['string', 'null'] },
                },
                required: ['closingBalance', 'statementDate', 'accountName', 'sortCode', 'accountNumber', 'bankName'],
                additionalProperties: false,
              },
            },
          },
        });
        const content = llmResponse?.choices?.[0]?.message?.content;
        if (!content) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI extraction failed' });
        const data = typeof content === 'string' ? JSON.parse(content) : content;
        return data as {
          closingBalance: number | null;
          statementDate: string | null;
          accountName: string | null;
          sortCode: string | null;
          accountNumber: string | null;
          bankName: string | null;
        };
      }),
  }),
  orgChart: router({
    list: protectedProcedure.query(async () => {
      return getOrgMembers();
    }),
    upsert: seniorProcedure
      .input(z.object({
        id: z.number().optional(),
        name: z.string().min(1),
        title: z.string().min(1),
        department: z.string().optional(),
        photoUrl: z.string().optional(),
        parentId: z.number().nullable().optional(),
        sortOrder: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        if (input.id) {
          await updateOrgMember(input.id, input);
          return getOrgMemberById(input.id);
        }
        return createOrgMember({ ...input, isActive: true });
      }),
    remove: superAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteOrgMember(input.id);
        return { success: true };
      }),
  }),

  // ─── COMMUNICATIONS HUB ─────────────────────────────────────────────────────
  comms: router({
    listChannels: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(commChannels).orderBy(commChannels.sortOrder);
    }),

    createChannel: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        // Get max sortOrder to place new channel at the end
        const existing = await db.select().from(commChannels).orderBy(commChannels.sortOrder);
        const maxSort = existing.length ? Math.max(...existing.map((c: any) => c.sortOrder ?? 0)) : 0;
        await db.insert(commChannels).values({
          name: input.name,
          description: input.description ?? null,
          memberRoles: 'trustee,chair,manager,deputy',
          sortOrder: maxSort + 10,
        } as any);
        const created = await db.select().from(commChannels).orderBy(commChannels.sortOrder);
        return created[created.length - 1];
      }),
    deleteChannel: superAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        await db.delete(commMessages).where(eq(commMessages.channelId, input.id));
        await db.delete(commChannels).where(eq(commChannels.id, input.id));
        return { success: true };
      }),
    updateChannel: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        channelMemberIds: z.array(z.number()).optional(),
        whatsappGroupLink: z.string().url().optional().nullable(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const updateData: Record<string, any> = { name: input.name, description: input.description ?? null };
        if (input.channelMemberIds !== undefined) {
          updateData.channelMemberIds = JSON.stringify(input.channelMemberIds);
        }
        if (input.whatsappGroupLink !== undefined) {
          updateData.whatsappGroupLink = input.whatsappGroupLink ?? null;
        }
        if (input.sortOrder !== undefined) {
          updateData.sortOrder = input.sortOrder;
        }
        await db.update(commChannels).set(updateData).where(eq(commChannels.id, input.id));
        return { success: true };
      }),

    listMessages: protectedProcedure
      .input(z.object({ channelId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db.select().from(commMessages)
          .where(eq(commMessages.channelId, input.channelId))
          .orderBy(commMessages.sentAt);
      }),

    sendEmail: adminProcedure
      .input(z.object({
        channelId: z.number(),
        recipients: z.array(z.object({ name: z.string(), email: z.string() })),
        subject: z.string().min(1),
        body: z.string().min(1),
        isBulk: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const fromName = ctx.user.name || 'AQS Admin';
        const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.GMAIL_FROM_EMAIL || 'noreply@aqs.org.uk';
        const errors: string[] = [];
        for (const r of input.recipients) {
          try {
            const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#5C1A1A;padding:24px;text-align:center">
                <h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1>
              </div>
              <div style="padding:24px;background:#fff">
                <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, Dear ${r.name},</p>
                ${input.body.replace(/\n/g, '<br/>')}
                <br/><br/>
                <p>JazakAllahu Khayran,<br/><strong>${fromName}</strong><br/>Abdullah Quilliam Society</p>
              </div>
              <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">This message was sent via the AQS Communications Hub.</div>
            </div>`;
            await sendGmail(r.email, r.name, input.subject, html);
          } catch (e: any) {
            errors.push(`${r.email}: ${e.message}`);
          }
        }
        // Log to DB
        await db.insert(commMessages).values({
          channelId: input.channelId,
          direction: 'sent',
          fromName,
          fromEmail,
          toEmailsJson: JSON.stringify(input.recipients),
          subject: input.subject,
          body: input.body,
          isRead: true,
        });
        return { success: true, sent: input.recipients.length - errors.length, errors };
      }),

    getWhatsAppLinks: protectedProcedure
      .input(z.object({ channelId: z.number(), message: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const channel = await db.select().from(commChannels).where(eq(commChannels.id, input.channelId)).limit(1);
        if (!channel[0]) return [];
        const roles = (channel[0].memberRoles ?? '').split(',').map((r: string) => r.trim().toLowerCase());
        const trustees = await db.select().from(commChannels);
        // Get trustees matching channel roles
        const { trustees: trusteesTable } = await import('../drizzle/schema');
        const allTrustees = await db.select().from(trusteesTable).where(eq(trusteesTable.isActive, true));
        const matching = allTrustees.filter((t: any) => {
          const r = (t.role ?? '').toLowerCase();
          return roles.some((role: string) => r.includes(role));
        });
        return matching.map((t: any) => ({
          name: t.fullName,
          phone: t.phone,
          link: t.phone ? buildWhatsAppUrl(t.phone, input.message) : null,
        }));
      }),

    logWhatsApp: adminProcedure
      .input(z.object({
        channelId: z.number(),
        recipients: z.array(z.object({ name: z.string(), phone: z.string() })),
        message: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        await db.insert(commMessages).values({
          channelId: input.channelId,
          direction: 'sent',
          fromName: ctx.user.name || 'AQS Admin',
          fromEmail: null,
          whatsappNumbersJson: JSON.stringify(input.recipients),
          subject: 'WhatsApp Message',
          body: input.message,
          isRead: true,
        });
        return { success: true };
      }),

    logIncoming: adminProcedure
      .input(z.object({
        channelId: z.number(),
        fromName: z.string().min(1),
        body: z.string().min(1),
        via: z.enum(['email', 'whatsapp']).default('whatsapp'),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        await db.insert(commMessages).values({
          channelId: input.channelId,
          direction: 'received',
          fromName: input.fromName,
          fromEmail: null,
          whatsappNumbersJson: input.via === 'whatsapp' ? JSON.stringify([{ name: input.fromName, phone: '' }]) : null,
          subject: input.via === 'email' ? `Reply from ${input.fromName}` : 'WhatsApp Reply',
          body: input.body,
          isRead: false,
        });
        return { success: true };
      }),

    getUnreadCounts: protectedProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) return {};
        const rows = await db
          .select({ channelId: commMessages.channelId, count: sql<number>`COUNT(*)` })
          .from(commMessages)
          .where(and(eq(commMessages.direction, 'received'), eq(commMessages.isRead, false)))
          .groupBy(commMessages.channelId);
        const result: Record<number, number> = {};
        rows.forEach(r => { result[r.channelId] = Number(r.count); });
        return result;
      }),

    markChannelRead: protectedProcedure
      .input(z.object({ channelId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.update(commMessages)
          .set({ isRead: true })
          .where(and(eq(commMessages.channelId, input.channelId), eq(commMessages.direction, 'received')));
        return { success: true };
      }),

    markReplied: protectedProcedure
      .input(z.object({ messageId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.update(commMessages)
          .set({ isReplied: true, repliedAt: new Date() })
          .where(eq(commMessages.id, input.messageId));
        return { success: true };
      }),

    // ─── Sent log ────────────────────────────────────────────────────────────
    listSent: protectedProcedure
      .input(z.object({ channelId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db.select().from(commMessages)
          .where(and(eq(commMessages.channelId, input.channelId), eq(commMessages.direction, 'sent')))
          .orderBy(sql`${commMessages.sentAt} DESC`)
          .limit(100);
      }),

    // ─── Message templates ────────────────────────────────────────────────────
    listTemplates: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(commTemplates).orderBy(commTemplates.name);
    }),
    saveTemplate: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        name: z.string().min(1),
        subject: z.string().optional(),
        body: z.string().optional(),
        priority: z.string().optional(),
        replyBy: z.string().optional(),
        actionBy: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const vals: any = {
          name: input.name,
          subject: input.subject ?? null,
          body: input.body ?? null,
          priority: input.priority ?? 'Normal',
          replyBy: input.replyBy ?? null,
          actionBy: input.actionBy ?? null,
        };
        if (input.id) {
          await db.update(commTemplates).set(vals).where(eq(commTemplates.id, input.id));
          return { success: true, id: input.id };
        } else {
          await db.insert(commTemplates).values(vals);
          const rows = await db.select().from(commTemplates).orderBy(sql`id DESC`).limit(1);
          return { success: true, id: rows[0]?.id };
        }
      }),
    deleteTemplate: superAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        await db.delete(commTemplates).where(eq(commTemplates.id, input.id));
        return { success: true };
      }),
    /** Update the category on a template */
    updateTemplateCategory: adminProcedure
      .input(z.object({ id: z.number(), category: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        await db.update(commTemplates).set({ category: input.category }).where(eq(commTemplates.id, input.id));
        return { success: true };
      }),
    /** Update the sendStatus of a message (pending → sent/failed) */
    updateSentStatus: adminProcedure
      .input(z.object({ messageId: z.number(), sendStatus: z.enum(['pending', 'sent', 'failed']) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        await db.update(commMessages).set({ sendStatus: input.sendStatus }).where(eq(commMessages.id, input.messageId));
        return { success: true };
      }),
    /** Update the replyStatus of a sent message */
    updateReplyStatus: protectedProcedure
      .input(z.object({ messageId: z.number(), replyStatus: z.enum(['awaiting', 'replied', 'none']) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const vals: any = { replyStatus: input.replyStatus };
        if (input.replyStatus === 'replied') vals.repliedAt = new Date();
        await db.update(commMessages).set(vals).where(eq(commMessages.id, input.messageId));
        return { success: true };
      }),
    /** Schedule a message for later send — inserts with sendStatus=pending and scheduledAt set */
    scheduleMessage: adminProcedure
      .input(z.object({
        channelId: z.number(),
        subject: z.string().optional(),
        body: z.string().optional(),
        fromName: z.string().optional(),
        fromEmail: z.string().optional(),
        toEmailsJson: z.string().optional(),
        whatsappNumbersJson: z.string().optional(),
        scheduledAt: z.string(), // ISO string
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        await db.insert(commMessages).values({
          channelId: input.channelId,
          direction: 'sent',
          fromName: input.fromName ?? ctx.user.name,
          fromEmail: input.fromEmail ?? ctx.user.email ?? null,
          toEmailsJson: input.toEmailsJson ?? null,
          whatsappNumbersJson: input.whatsappNumbersJson ?? null,
          subject: input.subject ?? null,
          body: input.body ?? null,
          isRead: true,
          isReplied: false,
          scheduledAt: new Date(input.scheduledAt),
          sendStatus: 'pending',
          replyStatus: 'awaiting',
        } as any);
        return { success: true };
      }),
  }),

  // ─── MASTER COMMUNICATIONS HUB ───────────────────────────────────────────────
  commsHub: router({
    // ── Sections ──────────────────────────────────────────────────────────────
    listSections: seniorProcedure.query(async ({ ctx }) => {
      const rows = await (await getDb())!.execute(
        sql`SELECT * FROM comms_sections WHERE isArchived = 0 ORDER BY sortOrder ASC, id ASC`
      );
      return rows[0] as unknown as any[];
    }),

    createSection: seniorProcedure
      .input(z.object({
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        icon: z.string().optional().default('hash'),
        color: z.string().optional().default('#635BFF'),
      }))
      .mutation(async ({ ctx, input }) => {
        const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
        await (await getDb())!.execute(
          sql`INSERT INTO comms_sections (name, slug, description, icon, color, sortOrder, isSystem, createdById)
              VALUES (${input.name}, ${slug}, ${input.description ?? null}, ${input.icon}, ${input.color},
                      (SELECT COALESCE(MAX(s2.sortOrder),0)+1 FROM comms_sections s2), 0, ${ctx.user.id})`
        );
        return { success: true, slug };
      }),

    updateSection: seniorProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...fields } = input;
        if (fields.name) await (await getDb())!.execute(sql`UPDATE comms_sections SET name=${fields.name} WHERE id=${id}`);
        if (fields.description !== undefined) await (await getDb())!.execute(sql`UPDATE comms_sections SET description=${fields.description} WHERE id=${id}`);
        if (fields.icon) await (await getDb())!.execute(sql`UPDATE comms_sections SET icon=${fields.icon} WHERE id=${id}`);
        if (fields.color) await (await getDb())!.execute(sql`UPDATE comms_sections SET color=${fields.color} WHERE id=${id}`);
        return { success: true };
      }),

    archiveSection: seniorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const rows = await (await getDb())!.execute(sql`SELECT isSystem FROM comms_sections WHERE id=${input.id}`) as any;
        if (rows[0]?.[0]?.isSystem) throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot archive a system section' });
        await (await getDb())!.execute(sql`UPDATE comms_sections SET isArchived=1 WHERE id=${input.id}`);
        return { success: true };
      }),

    // ── Messages ───────────────────────────────────────────────────────────────
    listMessages: seniorProcedure
      .input(z.object({
        sectionId: z.number().optional(),
        status: z.enum(['unread','read','actioned','archived','flagged']).optional(),
        priority: z.enum(['urgent','high','normal','low']).optional(),
        search: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }))
      .query(async ({ ctx, input }) => {
        let whereClause = '1=1';
        if (input.sectionId) whereClause += ` AND m.sectionId = ${input.sectionId}`;
        if (input.status) whereClause += ` AND m.status = '${input.status}'`;
        if (input.priority) whereClause += ` AND m.priority = '${input.priority}'`;
        if (input.search) {
          const q = input.search.replace(/'/g, "''");
          whereClause += ` AND (m.subject LIKE '%${q}%' OR m.fromName LIKE '%${q}%' OR m.fromEmail LIKE '%${q}%')`;
        }
        const rows = await (await getDb())!.execute(
          sql.raw(`SELECT m.*, s.name as sectionName, s.color as sectionColor, s.icon as sectionIcon,
                   (SELECT COUNT(*) FROM comms_attachments a WHERE a.messageId = m.id) as attachmentCount,
                   (SELECT COUNT(*) FROM comms_replies r WHERE r.messageId = m.id) as replyCount
                   FROM comms_messages m
                   LEFT JOIN comms_sections s ON s.id = m.sectionId
                   WHERE ${whereClause}
                   ORDER BY m.isPinned DESC, m.receivedAt DESC
                   LIMIT ${input.limit} OFFSET ${input.offset}`)
        );
        return rows[0] as unknown as any[];
      }),

    getMessage: seniorProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const rows = await (await getDb())!.execute(
          sql`SELECT m.*, s.name as sectionName, s.color as sectionColor
              FROM comms_messages m
              LEFT JOIN comms_sections s ON s.id = m.sectionId
              WHERE m.id = ${input.id}`
        ) as any;
        const msg = rows[0]?.[0];
        if (!msg) throw new TRPCError({ code: 'NOT_FOUND' });
        if (msg.status === 'unread') {
          await (await getDb())!.execute(
            sql`UPDATE comms_messages SET status='read', readAt=NOW(), readById=${ctx.user.id} WHERE id=${input.id}`
          );
          msg.status = 'read';
        }
        const attRows = await (await getDb())!.execute(
          sql`SELECT * FROM comms_attachments WHERE messageId=${input.id} ORDER BY uploadedAt ASC`
        ) as any;
        const repRows = await (await getDb())!.execute(
          sql`SELECT * FROM comms_replies WHERE messageId=${input.id} ORDER BY createdAt ASC`
        ) as any;
        return { ...msg, attachments: attRows[0] ?? [], replies: repRows[0] ?? [] };
      }),

    createMessage: seniorProcedure
      .input(z.object({
        sectionId: z.number(),
        subject: z.string().min(1).max(500),
        fromName: z.string().optional(),
        fromEmail: z.string().email().optional(),
        toNames: z.string().optional(),
        body: z.string().optional(),
        priority: z.enum(['urgent','high','normal','low']).default('normal'),
        visibility: z.enum(['all_senior','trustees_only','chair_only']).default('all_senior'),
        source: z.enum(['gmail_push','internal_compose','manual_entry']).default('manual_entry'),
        gmailMessageId: z.string().optional(),
        gmailThreadId: z.string().optional(),
        receivedAt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
        const result = await (await getDb())!.execute(
          sql`INSERT INTO comms_messages
              (sectionId, source, subject, fromName, fromEmail, toNames, body, priority, visibility,
               gmailMessageId, gmailThreadId, status, receivedAt, createdById)
              VALUES
              (${input.sectionId}, ${input.source}, ${input.subject}, ${input.fromName ?? null},
               ${input.fromEmail ?? null}, ${input.toNames ?? null}, ${input.body ?? null},
               ${input.priority}, ${input.visibility},
               ${input.gmailMessageId ?? null}, ${input.gmailThreadId ?? null},
               'unread', ${receivedAt}, ${ctx.user.id})`
        ) as any;
        return { success: true, id: result[0]?.insertId };
      }),

    updateMessageStatus: seniorProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['unread','read','actioned','archived','flagged']).optional(),
        priority: z.enum(['urgent','high','normal','low']).optional(),
        isStarred: z.boolean().optional(),
        isPinned: z.boolean().optional(),
        sectionId: z.number().optional(),
        actionNote: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...fields } = input;
        if (fields.status !== undefined) {
          await (await getDb())!.execute(sql`UPDATE comms_messages SET status=${fields.status} WHERE id=${id}`);
          if (fields.status === 'actioned') {
            await (await getDb())!.execute(sql`UPDATE comms_messages SET actionedAt=NOW(), actionedById=${ctx.user.id}, actionNote=${fields.actionNote ?? null} WHERE id=${id}`);
          }
        }
        if (fields.priority !== undefined) await (await getDb())!.execute(sql`UPDATE comms_messages SET priority=${fields.priority} WHERE id=${id}`);
        if (fields.isStarred !== undefined) await (await getDb())!.execute(sql`UPDATE comms_messages SET isStarred=${fields.isStarred?1:0} WHERE id=${id}`);
        if (fields.isPinned !== undefined) await (await getDb())!.execute(sql`UPDATE comms_messages SET isPinned=${fields.isPinned?1:0} WHERE id=${id}`);
        if (fields.sectionId !== undefined) await (await getDb())!.execute(sql`UPDATE comms_messages SET sectionId=${fields.sectionId} WHERE id=${id}`);
        return { success: true };
      }),

    deleteMessage: seniorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await (await getDb())!.execute(sql`DELETE FROM comms_attachments WHERE messageId=${input.id}`);
        await (await getDb())!.execute(sql`DELETE FROM comms_replies WHERE messageId=${input.id}`);
        await (await getDb())!.execute(sql`DELETE FROM comms_messages WHERE id=${input.id}`);
        return { success: true };
      }),

    // ── AI Summarise ───────────────────────────────────────────────────────────
    summariseMessage: seniorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const rows = await (await getDb())!.execute(
          sql`SELECT subject, fromName, fromEmail, body, receivedAt FROM comms_messages WHERE id=${input.id}`
        ) as any;
        const msg = rows[0]?.[0];
        if (!msg) throw new TRPCError({ code: 'NOT_FOUND' });
        const attRows = await (await getDb())!.execute(
          sql`SELECT fileName, ocrText FROM comms_attachments WHERE messageId=${input.id} AND ocrText IS NOT NULL`
        ) as any;
        const attachmentContext = (attRows[0] ?? []).map((a: any) =>
          `[Attachment: ${a.fileName}]\n${a.ocrText}`
        ).join('\n\n');
        const content = [
          `Subject: ${msg.subject}`,
          `From: ${msg.fromName ?? ''} <${msg.fromEmail ?? ''}>`,
          `Received: ${msg.receivedAt}`,
          `Body:\n${msg.body ?? '(no body)'}`,
          attachmentContext ? `Attachments:\n${attachmentContext}` : '',
        ].filter(Boolean).join('\n');
        const aiResp = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are an executive assistant for a mosque charity. Summarise emails concisely for the chair and trustees. Return JSON with keys: summary (2-3 sentences), keyPoints (array of strings, max 5), actionItems (array of strings, max 5), urgency (low|normal|high|urgent).' },
            { role: 'user', content: `Please summarise this email:\n\n${content}` },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'email_summary',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  summary: { type: 'string' },
                  keyPoints: { type: 'array', items: { type: 'string' } },
                  actionItems: { type: 'array', items: { type: 'string' } },
                  urgency: { type: 'string', enum: ['low','normal','high','urgent'] },
                },
                required: ['summary','keyPoints','actionItems','urgency'],
                additionalProperties: false,
              },
            },
          },
        });
        const parsed = JSON.parse(aiResp.choices[0].message.content as string);
        await (await getDb())!.execute(
          sql`UPDATE comms_messages
              SET aiSummary=${parsed.summary},
                  aiKeyPoints=${JSON.stringify(parsed.keyPoints)},
                  aiActionItems=${JSON.stringify(parsed.actionItems)},
                  aiSummarisedAt=NOW(),
                  aiSummarisedById=${ctx.user.id}
              WHERE id=${input.id}`
        );
        return parsed;
      }),

    // ── OCR Attachment ─────────────────────────────────────────────────────────
    ocrAttachment: seniorProcedure
      .input(z.object({ attachmentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const rows = await (await getDb())!.execute(
          sql`SELECT * FROM comms_attachments WHERE id=${input.attachmentId}`
        ) as any;
        const att = rows[0]?.[0];
        if (!att) throw new TRPCError({ code: 'NOT_FOUND' });
        const aiResp = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are an OCR assistant. Extract all text from the provided image or document. Return JSON with keys: text (full extracted text), summary (2-3 sentence summary of the document content).' },
            { role: 'user', content: [
              { type: 'text' as const, text: 'Please extract all text from this document and summarise it.' },
              { type: 'image_url' as const, image_url: { url: att.fileUrl, detail: 'high' as const } },
            ]},
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'ocr_result',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  summary: { type: 'string' },
                },
                required: ['text','summary'],
                additionalProperties: false,
              },
            },
          },
        });
        const parsed = JSON.parse(aiResp.choices[0].message.content as string);
        await (await getDb())!.execute(
          sql`UPDATE comms_attachments
              SET ocrText=${parsed.text}, ocrSummary=${parsed.summary}, ocrProcessedAt=NOW()
              WHERE id=${input.attachmentId}`
        );
        return parsed;
      }),

    // ── Replies ────────────────────────────────────────────────────────────────
    addReply: seniorProcedure
      .input(z.object({
        messageId: z.number(),
        body: z.string().min(1),
        isInternal: z.boolean().default(true),
        sendEmail: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        await (await getDb())!.execute(
          sql`INSERT INTO comms_replies (messageId, body, fromName, fromEmail, isInternal, sentViaEmail, createdById)
              VALUES (${input.messageId}, ${input.body}, ${ctx.user.name ?? null},
                      ${ctx.user.email ?? null}, ${input.isInternal?1:0}, ${input.sendEmail?1:0}, ${ctx.user.id})`
        );
        if (input.sendEmail) {
          await (await getDb())!.execute(
            sql`UPDATE comms_messages SET status='actioned', actionedAt=NOW(), actionedById=${ctx.user.id} WHERE id=${input.messageId}`
          );
        }
        return { success: true };
      }),

    // ── Attachments ────────────────────────────────────────────────────────────
    addAttachment: seniorProcedure
      .input(z.object({
        messageId: z.number(),
        fileName: z.string(),
        fileKey: z.string(),
        fileUrl: z.string(),
        mimeType: z.string().optional(),
        fileSizeBytes: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await (await getDb())!.execute(
          sql`INSERT INTO comms_attachments (messageId, fileName, fileKey, fileUrl, mimeType, fileSizeBytes, uploadedById)
              VALUES (${input.messageId}, ${input.fileName}, ${input.fileKey}, ${input.fileUrl},
                      ${input.mimeType ?? null}, ${input.fileSizeBytes ?? null}, ${ctx.user.id})`
        );
        return { success: true };
      }),

    // ── Gmail Push-In ──────────────────────────────────────────────────────────
    pushGmailMessage: seniorProcedure
      .input(z.object({
        subject: z.string(),
        fromName: z.string().optional(),
        fromEmail: z.string().optional(),
        toNames: z.string().optional(),
        body: z.string().optional(),
        htmlBody: z.string().optional(),
        gmailMessageId: z.string().optional(),
        gmailThreadId: z.string().optional(),
        gmailLabels: z.string().optional(),
        receivedAt: z.string().optional(),
        suggestedSectionSlug: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        let sectionSlug = input.suggestedSectionSlug ?? 'general';
        const fromLower = (input.fromEmail ?? '').toLowerCase();
        const fromName = (input.fromName ?? '').toLowerCase();
        const subjectLower = (input.subject ?? '').toLowerCase();
        if (fromName.includes('galib') || fromLower.includes('galib')) sectionSlug = 'galib-khan';
        else if (fromLower.includes('hmrc') || subjectLower.includes('hmrc') || subjectLower.includes('gift aid')) sectionSlug = 'accountants';
        else if (subjectLower.includes('urgent') || subjectLower.includes('asap')) sectionSlug = 'urgent';
        else if (subjectLower.includes('booking') || subjectLower.includes('facilities')) sectionSlug = 'facilities';
        else if (subjectLower.includes('accommodation') || subjectLower.includes('student') || subjectLower.includes('tenancy')) sectionSlug = 'student-accommodation';
        const secRows = await (await getDb())!.execute(
          sql`SELECT id FROM comms_sections WHERE slug=${sectionSlug} LIMIT 1`
        ) as any;
        const sectionId = secRows[0]?.[0]?.id;
        if (!sectionId) throw new TRPCError({ code: 'NOT_FOUND', message: `Section '${sectionSlug}' not found` });
        const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
        const result = await (await getDb())!.execute(
          sql`INSERT INTO comms_messages
              (sectionId, source, subject, fromName, fromEmail, toNames, body, htmlBody,
               gmailMessageId, gmailThreadId, gmailLabels, status, receivedAt, createdById)
              VALUES
              (${sectionId}, 'gmail_push', ${input.subject}, ${input.fromName ?? null},
               ${input.fromEmail ?? null}, ${input.toNames ?? null}, ${input.body ?? null},
               ${input.htmlBody ?? null}, ${input.gmailMessageId ?? null},
               ${input.gmailThreadId ?? null}, ${input.gmailLabels ?? null},
               'unread', ${receivedAt}, ${ctx.user.id})`
        ) as any;
        return { success: true, id: result[0]?.insertId, sectionSlug };
      }),

    // ── Stats ──────────────────────────────────────────────────────────────────
    getStats: seniorProcedure.query(async ({ ctx }) => {
      const rows = await (await getDb())!.execute(
        sql`SELECT s.id, s.name, s.slug, s.color, s.icon,
                   COUNT(m.id) as total,
                   SUM(CASE WHEN m.status='unread' THEN 1 ELSE 0 END) as unread,
                   SUM(CASE WHEN m.priority='urgent' THEN 1 ELSE 0 END) as urgent
            FROM comms_sections s
            LEFT JOIN comms_messages m ON m.sectionId = s.id AND m.status != 'archived'
            WHERE s.isArchived = 0
            GROUP BY s.id, s.name, s.slug, s.color, s.icon
            ORDER BY s.sortOrder ASC`
      );
      return rows[0] as unknown as any[];
    }),
  }),

  // ─── SCAN MERGE UNDO ──────────────────────────────────────────────────────
  scanMerge: router({
    /**
     * Revert a scan-merge by restoring the record from the snapshot.
     * Only allowed within 10 minutes of the merge (enforced server-side).
     */
    revert: seniorProcedure
      .input(z.object({ snapshotId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { scanMergeSnapshots, trustees: trusteesTable, donors: donorsTable, staffProfiles } = await import('../drizzle/schema');
        // Fetch the snapshot
        const [snap] = await db.select().from(scanMergeSnapshots).where(eq(scanMergeSnapshots.id, input.snapshotId)).limit(1);
        if (!snap) throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
        // Enforce 10-minute window
        const ageMs = Date.now() - new Date(snap.mergedAt).getTime();
        if (ageMs > 10 * 60 * 1000) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Undo window has expired (10 minutes)' });
        }
        // Parse the snapshot
        const original = JSON.parse(snap.snapshotJson);
        // Restore the record
        if (snap.tableName === 'trustees') {
          // Strip non-updatable fields
          const { id: _id, createdAt: _ca, updatedAt: _ua, ...restoreFields } = original;
          await db.update(trusteesTable).set(restoreFields).where(eq(trusteesTable.id, snap.recordId));
        } else if (snap.tableName === 'donors') {
          const { id: _id, createdAt: _ca, updatedAt: _ua, ...restoreFields } = original;
          await db.update(donorsTable).set(restoreFields).where(eq(donorsTable.id, snap.recordId));
        } else if (snap.tableName === 'staff_profiles') {
          const { id: _id, createdAt: _ca, updatedAt: _ua, userId: _uid, ...restoreFields } = original;
          await db.update(staffProfiles).set(restoreFields).where(eq(staffProfiles.id, snap.recordId));
        } else {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Revert not supported for table: ${snap.tableName}` });
        }
        // Mark snapshot as reverted
        await db.update(scanMergeSnapshots).set({ revertedAt: new Date() }).where(eq(scanMergeSnapshots.id, snap.id));
        // Notify owner of the full revert
        const revokerName = ctx.user?.name ?? ctx.user?.email ?? 'Unknown user';
        await notifyOwner({
          title: `Scan Merge Reverted — ${snap.tableName} #${snap.recordId}`,
          content: `${revokerName} performed a full undo of a scan import on ${snap.tableName} record #${snap.recordId} (originally merged by ${snap.mergedByName ?? 'unknown'} at ${new Date(snap.mergedAt).toLocaleString()}).`,
        }).catch(() => {});
        return { success: true, tableName: snap.tableName, recordId: snap.recordId };
      }),

    /**
     * Get the most recent snapshot for a record (to check if undo is available).
     * Returns null if no snapshot exists or the 10-minute window has passed.
     */
    getLatest: seniorProcedure
      .input(z.object({ tableName: z.string(), recordId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const { scanMergeSnapshots } = await import('../drizzle/schema');
        const [snap] = await db
          .select()
          .from(scanMergeSnapshots)
          .where(
            and(
              eq(scanMergeSnapshots.tableName, input.tableName),
              eq(scanMergeSnapshots.recordId, input.recordId)
            )
          )
          .orderBy(sql`mergedAt DESC`)
          .limit(1);
        if (!snap) return null;
        const ageMs = Date.now() - new Date(snap.mergedAt).getTime();
        if (ageMs > 10 * 60 * 1000) return null; // expired
        return { snapshotId: snap.id, mergedAt: snap.mergedAt, mergedByName: snap.mergedByName, expiresInMs: 10 * 60 * 1000 - ageMs };
      }),

    /**
     * Paginated audit log of all scan-merge snapshots.
     * Accessible to senior staff (seniorProcedure).
     */
    listHistory: seniorProcedure
      .input(z.object({
        tableName: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { rows: [], total: 0 };
        const { scanMergeSnapshots } = await import('../drizzle/schema');
        const conditions = input.tableName
          ? [eq(scanMergeSnapshots.tableName, input.tableName)]
          : [];
        const rows = await db
          .select({
            id: scanMergeSnapshots.id,
            tableName: scanMergeSnapshots.tableName,
            recordId: scanMergeSnapshots.recordId,
            mergedByName: scanMergeSnapshots.mergedByName,
            mergedAt: scanMergeSnapshots.mergedAt,
            revertedAt: scanMergeSnapshots.revertedAt,
            snapshotJson: scanMergeSnapshots.snapshotJson,
          })
          .from(scanMergeSnapshots)
          .where(conditions.length > 0 ? conditions[0] : sql`1=1`)
          .orderBy(sql`mergedAt DESC`)
          .limit(input.limit)
          .offset(input.offset);
        const [{ count }] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(scanMergeSnapshots)
          .where(conditions.length > 0 ? conditions[0] : sql`1=1`);
        return { rows, total: Number(count) };
      }),

    /**
     * Partially revert a scan-merge by restoring only selected fields from the snapshot.
     * Only allowed within 10 minutes of the merge (enforced server-side).
     */
    revertFields: seniorProcedure
      .input(z.object({
        snapshotId: z.number(),
        fields: z.array(z.string()).min(1),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { scanMergeSnapshots, trustees: trusteesTable, donors: donorsTable, staffProfiles } = await import('../drizzle/schema');
        const [snap] = await db.select().from(scanMergeSnapshots).where(eq(scanMergeSnapshots.id, input.snapshotId)).limit(1);
        if (!snap) throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
        const ageMs = Date.now() - new Date(snap.mergedAt).getTime();
        if (ageMs > 10 * 60 * 1000) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Undo window has expired (10 minutes)' });
        }
        const original = JSON.parse(snap.snapshotJson);
        // Build update object with only the requested fields
        const NON_UPDATABLE = new Set(['id', 'createdAt', 'updatedAt', 'userId']);
        const partialUpdate: Record<string, unknown> = {};
        for (const field of input.fields) {
          if (!NON_UPDATABLE.has(field) && field in original) {
            partialUpdate[field] = original[field];
          }
        }
        if (Object.keys(partialUpdate).length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No valid fields to revert' });
        }
        if (snap.tableName === 'trustees') {
          await db.update(trusteesTable).set(partialUpdate as any).where(eq(trusteesTable.id, snap.recordId));
        } else if (snap.tableName === 'donors') {
          await db.update(donorsTable).set(partialUpdate as any).where(eq(donorsTable.id, snap.recordId));
        } else if (snap.tableName === 'staff_profiles') {
          await db.update(staffProfiles).set(partialUpdate as any).where(eq(staffProfiles.id, snap.recordId));
        } else {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Partial revert not supported for table: ${snap.tableName}` });
        }
        // Notify owner of the partial revert
        const revertedFieldList = Object.keys(partialUpdate).join(', ');
        await notifyOwner({
          title: `Partial Scan Merge Revert — ${snap.tableName} #${snap.recordId}`,
          content: `A partial undo was applied to ${snap.tableName} record #${snap.recordId}. Fields restored: ${revertedFieldList}. (Originally merged by ${snap.mergedByName ?? 'unknown'} at ${new Date(snap.mergedAt).toLocaleString()})`,
        }).catch(() => {});
        return { success: true, revertedFields: Object.keys(partialUpdate) };
      }),
  }),

  // ─── Compliance Cockpit ─────────────────────────────────────────────────────
  compliance: router({
    listActions: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        priority: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { complianceActions } = await import('../drizzle/schema');
        let rows = await db.select().from(complianceActions).orderBy(sql`FIELD(status,'critical','high','open','in_progress','overdue','completed','low') ASC, dueDate ASC`);
        if (input?.status) rows = rows.filter(r => r.status === input.status);
        if (input?.priority) rows = rows.filter(r => r.priority === input.priority);
        return rows;
      }),

    upsertAction: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        title: z.string().min(1),
        source: z.string().optional(),
        owner: z.string().optional(),
        dueDate: z.string().optional(),
        status: z.enum(['open', 'in_progress', 'completed', 'overdue']).default('open'),
        priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
        evidenceUrl: z.string().optional(),
        notes: z.string().optional(),
        completedAt: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { complianceActions } = await import('../drizzle/schema');
        const role = ctx.user.role;
        if (!isAdmin(role)) throw new TRPCError({ code: 'FORBIDDEN' });
        const data = {
          title: input.title,
          source: input.source ?? null,
          owner: input.owner ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          status: input.status,
          priority: input.priority,
          evidenceUrl: input.evidenceUrl ?? null,
          notes: input.notes ?? null,
          completedAt: input.completedAt ? new Date(input.completedAt) : null,
          updatedAt: new Date(),
        };
        if (input.id) {
          await db.update(complianceActions).set(data).where(eq(complianceActions.id, input.id));
          return { id: input.id };
        } else {
          const [result] = await db.insert(complianceActions).values({ ...data, createdByUserId: ctx.user.id });
          return { id: (result as any).insertId };
        }
      }),

    listTraining: protectedProcedure
      .input(z.object({ userId: z.number().optional() }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { trainingRecords } = await import('../drizzle/schema');
        let rows = await db.select().from(trainingRecords).orderBy(sql`expiresAt ASC`);
        if (input?.userId) rows = rows.filter(r => r.userId === input.userId);
        // Auto-compute status based on expiry
        const now = Date.now();
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        return rows.map(r => ({
          ...r,
          computedStatus: !r.completedAt ? 'pending'
            : !r.expiresAt ? 'completed'
            : new Date(r.expiresAt).getTime() < now ? 'expired'
            : new Date(r.expiresAt).getTime() - now < THIRTY_DAYS ? 'expiring_soon'
            : 'completed',
        }));
      }),

    upsertTraining: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        userId: z.number(),
        userName: z.string().optional(),
        module: z.string().min(1),
        provider: z.string().optional(),
        completedAt: z.string().optional(),
        expiresAt: z.string().optional(),
        certificateUrl: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { trainingRecords } = await import('../drizzle/schema');
        if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
        const data = {
          userId: input.userId,
          userName: input.userName ?? null,
          module: input.module,
          provider: input.provider ?? null,
          completedAt: input.completedAt ? new Date(input.completedAt) : null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          certificateUrl: input.certificateUrl ?? null,
          notes: input.notes ?? null,
          updatedAt: new Date(),
        };
        if (input.id) {
          await db.update(trainingRecords).set(data).where(eq(trainingRecords.id, input.id));
          return { id: input.id };
        } else {
          const [result] = await db.insert(trainingRecords).values(data);
          return { id: (result as any).insertId };
        }
      }),

    listPolicies: protectedProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { policyDocuments } = await import('../drizzle/schema');
        return db.select().from(policyDocuments).orderBy(sql`reviewDate ASC`);
      }),

    upsertPolicy: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        title: z.string().min(1),
        category: z.string().optional(),
        owner: z.string().optional(),
        version: z.string().optional(),
        reviewDate: z.string().optional(),
        approvedAt: z.string().optional(),
        approvedBy: z.string().optional(),
        fileUrl: z.string().optional(),
        status: z.enum(['current', 'due_review', 'overdue', 'draft']).default('current'),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { policyDocuments } = await import('../drizzle/schema');
        if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
        const data = {
          title: input.title,
          category: input.category ?? null,
          owner: input.owner ?? null,
          version: input.version ?? null,
          reviewDate: input.reviewDate ? new Date(input.reviewDate) : null,
          approvedAt: input.approvedAt ? new Date(input.approvedAt) : null,
          approvedBy: input.approvedBy ?? null,
          fileUrl: input.fileUrl ?? null,
          status: input.status,
          notes: input.notes ?? null,
          updatedAt: new Date(),
        };
        if (input.id) {
          await db.update(policyDocuments).set(data).where(eq(policyDocuments.id, input.id));
          return { id: input.id };
        } else {
          const [result] = await db.insert(policyDocuments).values(data);
          return { id: (result as any).insertId };
        }
      }),

    // Upload evidence (cert URL or policy file URL)
    uploadEvidence: protectedProcedure
      .input(z.object({
        recordType: z.enum(["training", "policy"]),
        recordId: z.number().int(),
        fileUrl: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        if (input.recordType === "training") {
          const { trainingRecords: tr } = await import('../drizzle/schema');
          await db.update(tr).set({ certificateUrl: input.fileUrl }).where(eq(tr.id, input.recordId));
        } else {
          const { policyDocuments: pd } = await import('../drizzle/schema');
          await db.update(pd).set({ fileUrl: input.fileUrl }).where(eq(pd.id, input.recordId));
        }
        return { ok: true };
      }),

    // ── Serious Incident Reporting ────────────────────────────────────────────
    listIncidents: protectedProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { seriousIncidents } = await import('../drizzle/schema');
        return db.select().from(seriousIncidents).orderBy(desc(seriousIncidents.incidentDate));
      }),
    upsertIncident: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        incidentDate: z.string(),
        title: z.string().min(1),
        description: z.string().min(1),
        category: z.enum(['financial_crime', 'safeguarding', 'data_breach', 'fraud', 'terrorism', 'money_laundering', 'governance', 'other']),
        severity: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
        status: z.enum(['draft', 'reported_to_cc', 'under_investigation', 'closed']).default('draft'),
        charityCommissionRef: z.string().optional(),
        reportedToCC: z.boolean().default(false),
        reportedToCCDate: z.string().optional(),
        actionsTaken: z.string().optional(),
        outcome: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { seriousIncidents } = await import('../drizzle/schema');
        const data: any = {
          incidentDate: new Date(input.incidentDate),
          title: input.title,
          description: input.description,
          category: input.category,
          severity: input.severity,
          status: input.status,
          charityCommissionRef: input.charityCommissionRef ?? null,
          reportedToCC: input.reportedToCC,
          reportedToCCDate: input.reportedToCCDate ? new Date(input.reportedToCCDate) : null,
          actionsTaken: input.actionsTaken ?? null,
          outcome: input.outcome ?? null,
          updatedAt: new Date(),
        };
        if (input.id) {
          await db.update(seriousIncidents).set(data).where(eq(seriousIncidents.id, input.id));
          return { id: input.id };
        } else {
          const [result] = await db.insert(seriousIncidents).values({ ...data, reportedByUserId: ctx.user.id });
          return { id: (result as any).insertId };
        }
      }),

    // ── Annual Return Tracker ─────────────────────────────────────────────────
    listAnnualReturns: protectedProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { annualReturns } = await import('../drizzle/schema');
        return db.select().from(annualReturns).orderBy(desc(annualReturns.yearEndDate));
      }),
    upsertAnnualReturn: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        financialYear: z.string().min(1),
        yearEndDate: z.string(),
        submissionDeadline: z.string(),
        status: z.enum(['not_started', 'in_progress', 'submitted', 'overdue']).default('not_started'),
        totalIncome: z.string().optional(),
        totalExpenditure: z.string().optional(),
        charityCommissionRef: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { annualReturns } = await import('../drizzle/schema');
        const data: any = {
          financialYear: input.financialYear,
          yearEndDate: new Date(input.yearEndDate),
          submissionDeadline: new Date(input.submissionDeadline),
          status: input.status,
          totalIncome: input.totalIncome ?? null,
          totalExpenditure: input.totalExpenditure ?? null,
          charityCommissionRef: input.charityCommissionRef ?? null,
          notes: input.notes ?? null,
          updatedAt: new Date(),
        };
        if (input.id) {
          await db.update(annualReturns).set(data).where(eq(annualReturns.id, input.id));
          return { id: input.id };
        } else {
          const [result] = await db.insert(annualReturns).values({ ...data, submittedByUserId: ctx.user.id });
          return { id: (result as any).insertId };
        }
      }),
  }),

  // ── Decisions Register ────────────────────────────────────────────────────
  decisions: router({
    list: protectedProcedure
      .input(z.object({
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
        outcome: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const rows = await db.select().from(trusteeDecisions)
          .orderBy(desc(trusteeDecisions.meetingDate))
          .limit(input.limit).offset(input.offset);
        return rows;
      }),

    upsert: protectedProcedure
      .input(z.object({
        id: z.number().int().optional(),
        title: z.string().min(1).max(500),
        motionText: z.string().optional(),
        proposer: z.string().optional(),
        seconder: z.string().optional(),
        votesFor: z.number().int().min(0).default(0),
        votesAgainst: z.number().int().min(0).default(0),
        abstentions: z.number().int().min(0).default(0),
        outcome: z.enum(["passed", "rejected", "deferred", "pending"]).default("pending"),
        meetingDate: z.string().optional(),
        minutesUrl: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const SENIOR = ["superadmin", "trustee", "admin", "manager"];
        if (!SENIOR.includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
        const data = {
          title: input.title,
          motionText: input.motionText ?? null,
          proposer: input.proposer ?? null,
          seconder: input.seconder ?? null,
          votesFor: input.votesFor,
          votesAgainst: input.votesAgainst,
          abstentions: input.abstentions,
          outcome: input.outcome,
          meetingDate: input.meetingDate ? new Date(input.meetingDate) : null,
          minutesUrl: input.minutesUrl ?? null,
          notes: input.notes ?? null,
          updatedAt: new Date(),
        };
        if (input.id) {
          await db.update(trusteeDecisions).set(data).where(eq(trusteeDecisions.id, input.id));
          return { id: input.id };
        } else {
          const [result] = await db.insert(trusteeDecisions).values({ ...data, createdByUserId: ctx.user.id });
          return { id: (result as any).insertId };
        }
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        assertCanDelete(ctx.user);
        await db.delete(trusteeDecisions).where(eq(trusteeDecisions.id, input.id));
        return { ok: true };
      }),
  }),
  donorPortal: router({
    // Public: look up a donor by their secure portal token
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const [tokenRow] = await db
          .select()
          .from(donorPortalTokens)
          .where(eq(donorPortalTokens.token, input.token))
          .limit(1);
        if (!tokenRow) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or expired link" });
        if (tokenRow.expiresAt < new Date()) throw new TRPCError({ code: "FORBIDDEN", message: "This link has expired" });
        // Single-use enforcement: gift_aid_sign tokens can only be used once
        if (tokenRow.purpose === "gift_aid_sign" && tokenRow.usedAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This Gift Aid signing link has already been used. Please request a new link from the charity." });
        }

        // Handle donor lead tokens (from QuickCapture or Send Portal Link on a lead)
        if (tokenRow.donorLeadId && !tokenRow.donorId) {
          const [lead] = await db.select().from(donorLeads).where(eq(donorLeads.id, tokenRow.donorLeadId)).limit(1);
          if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Donor lead not found" });
          // If lead has been converted to a full donor, use that donor's data
          if (lead.convertedToDonorId) {
            const donor = await getDonorById(lead.convertedToDonorId);
            if (donor) {
              const donorPledges = await db.select().from(pledges).where(eq(pledges.donorId, lead.convertedToDonorId));
              const giftAidDecls = await db.select().from(giftAidDeclarations).where(eq(giftAidDeclarations.donorEmail, donor.email ?? ""));
              return {
                donor: { id: donor.id, name: donor.name, email: donor.email, phone: donor.phone, totalGiven: donor.totalGiven },
                pledges: donorPledges,
                giftAidDeclarations: giftAidDecls,
                tokenPurpose: tokenRow.purpose,
                isLead: false,
              };
            }
          }
          // Return lead data for profile completion flow
          return {
            donor: { id: lead.id, name: lead.name, email: lead.email, phone: lead.whatsapp, totalGiven: "0.00" },
            pledges: [],
            giftAidDeclarations: [],
            tokenPurpose: tokenRow.purpose,
            tokenExpiry: tokenRow.expiresAt.toISOString(),
            isLead: true,
            leadData: {
              isUkTaxpayer: lead.isUkTaxpayer,
              giftAidConsent: lead.giftAidConsent,
              profileComplete: lead.profileComplete,
              address: lead.address,
              postcode: lead.postcode,
            },
          };
        }

        if (!tokenRow.donorId) throw new TRPCError({ code: "NOT_FOUND", message: "No donor linked to this token" });
        const donor = await getDonorById(tokenRow.donorId);
        if (!donor) throw new TRPCError({ code: "NOT_FOUND", message: "Donor not found" });
        const donorPledges = await db.select().from(pledges).where(eq(pledges.donorId, tokenRow.donorId));
        const giftAidDecls = await db.select().from(giftAidDeclarations).where(eq(giftAidDeclarations.donorEmail, donor.email ?? ""));
        return {
          donor: { id: donor.id, name: donor.name, email: donor.email, phone: donor.phone, totalGiven: donor.totalGiven },
          pledges: donorPledges,
          giftAidDeclarations: giftAidDecls,
          tokenPurpose: tokenRow.purpose,
          tokenExpiry: tokenRow.expiresAt.toISOString(),
          isLead: false,
        };
      }),
    // Public: complete a donor lead's profile via portal token
    completeLeadProfile: publicProcedure
      .input(z.object({
        token: z.string(),
        address: z.string().min(5),
        postcode: z.string().min(3).max(10),
        isUkTaxpayer: z.boolean(),
        giftAidConsent: z.boolean(),
        title: z.string().max(20).optional(),
        employer: z.string().max(200).optional(),
        preferredLanguage: z.string().max(50).optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const [tokenRow] = await db.select().from(donorPortalTokens).where(eq(donorPortalTokens.token, input.token)).limit(1);
        if (!tokenRow || tokenRow.expiresAt < new Date()) throw new TRPCError({ code: "FORBIDDEN", message: "Invalid or expired link" });
        if (!tokenRow.donorLeadId) throw new TRPCError({ code: "BAD_REQUEST", message: "This link is not for a donor lead" });
        await db.update(donorLeads)
          .set({
            address: input.address,
            postcode: input.postcode,
            isUkTaxpayer: input.isUkTaxpayer,
            giftAidConsent: input.giftAidConsent,
            profileComplete: true,
            ...(input.title ? { title: input.title } : {}),
            ...(input.employer ? { employer: input.employer } : {}),
            ...(input.preferredLanguage ? { preferredLanguage: input.preferredLanguage } : {}),
          })
          .where(eq(donorLeads.id, tokenRow.donorLeadId));
        return { ok: true };
      }),
    // Public: create a Stripe checkout session for a pledge payment via portal token
    createPledgeCheckout: publicProcedure
      .input(z.object({ token: z.string(), pledgeId: z.number().int(), amount: z.number().positive(), origin: z.string().url() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const [tokenRow] = await db.select().from(donorPortalTokens).where(eq(donorPortalTokens.token, input.token)).limit(1);
        if (!tokenRow || tokenRow.expiresAt < new Date()) throw new TRPCError({ code: "FORBIDDEN", message: "Invalid or expired link" });
        const [pledge] = await db.select().from(pledges).where(eq(pledges.id, input.pledgeId)).limit(1);
        if (!pledge) throw new TRPCError({ code: "NOT_FOUND", message: "Pledge not found" });
        const StripeLib = (await import("stripe")).default;
        const stripe = new StripeLib(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2026-04-22.dahlia" as any });
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{ price_data: { currency: "gbp", product_data: { name: `Pledge Payment — ${pledge.campaignName ?? "AQ Society"}`, description: `Pledge #${pledge.id} for ${pledge.donorName ?? "Donor"}` }, unit_amount: Math.round(input.amount * 100) }, quantity: 1 }],
          mode: "payment",
          success_url: `${input.origin}/give/${input.token}?paid=1`,
          cancel_url: `${input.origin}/give/${input.token}`,
          metadata: { pledgeId: String(input.pledgeId), donorId: String(pledge.donorId), source: "donor_portal" },
        });
        return { url: session.url };
      }),
    // Public: create a Stripe Checkout for a lead to make a donation
    createLeadDonationCheckout: publicProcedure
      .input(z.object({
        token: z.string(),
        amount: z.number().positive().min(0.5),
        campaignName: z.string().optional(),
        origin: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const [tokenRow] = await db.select().from(donorPortalTokens).where(eq(donorPortalTokens.token, input.token)).limit(1);
        if (!tokenRow || tokenRow.expiresAt < new Date()) throw new TRPCError({ code: "FORBIDDEN", message: "Invalid or expired link" });
        if (!tokenRow.donorLeadId) throw new TRPCError({ code: "BAD_REQUEST", message: "This checkout is only for donor leads" });
        const [lead] = await db.select().from(donorLeads).where(eq(donorLeads.id, tokenRow.donorLeadId)).limit(1);
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Donor lead not found" });
        const StripeLib = (await import("stripe")).default;
        const stripe = new StripeLib(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2026-04-22.dahlia" as any });
        const campaignLabel = input.campaignName ?? "AQ Society";
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          customer_email: lead.email ?? undefined,
          line_items: [{
            price_data: {
              currency: "gbp",
              product_data: { name: `Donation — ${campaignLabel}`, description: `From ${lead.name}` },
              unit_amount: Math.round(input.amount * 100),
            },
            quantity: 1,
          }],
          mode: "payment",
          allow_promotion_codes: true,
          success_url: `${input.origin}/give/${input.token}?paid=1`,
          cancel_url: `${input.origin}/give/${input.token}`,
          client_reference_id: `lead_${tokenRow.donorLeadId}`,
          metadata: {
            source: "donor_portal_lead",
            donor_lead_id: String(tokenRow.donorLeadId),
            donor_name: lead.name,
            campaign_name: campaignLabel,
          },
        });
        return { url: session.url };
      }),

    // Protected: generate a portal token for a donor
    generateToken: protectedProcedure
      .input(z.object({ donorId: z.number().int(), purpose: z.enum(["profile_complete", "donation_history", "gift_aid_sign", "annual_summary"]).optional() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const token = nanoid(48);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await db.insert(donorPortalTokens).values({ token, donorId: input.donorId, purpose: input.purpose ?? "donation_history", expiresAt });
        return { token, expiresAt };
      }),

  }),
  // ─── LBMW CORRESPONDENCE TRACKER ─────────────────────────────────────────────
  lbmw: router({
    list: adminProcedure
      .input(z.object({ status: z.string().optional(), priority: z.string().optional() }))
      .query(async ({ input }) => {
        const { lbmwCorrespondence } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) return [];
        let q = db.select().from(lbmwCorrespondence).orderBy(desc(lbmwCorrespondence.dateReceived)).$dynamic();
        if (input.status) q = q.where(eq(lbmwCorrespondence.status, input.status as any));
        return q.limit(200);
      }),
    create: adminProcedure
      .input(z.object({
        contactName: z.string().min(1),
        contactRole: z.string().optional(),
        direction: z.enum(["inbound", "outbound"]),
        channel: z.enum(["email", "letter", "phone", "meeting", "portal"]),
        subject: z.string().min(1),
        summary: z.string().optional(),
        dateReceived: z.string(),
        responseDeadline: z.string().optional(),
        status: z.enum(["pending", "responded", "awaiting_reply", "closed"]).default("pending"),
        priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
        internalNotes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { lbmwCorrespondence } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [result] = await db.insert(lbmwCorrespondence).values({
          ...input,
          dateReceived: new Date(input.dateReceived) as any,
          responseDeadline: input.responseDeadline ? new Date(input.responseDeadline) as any : undefined,
          handledByUserId: ctx.user.id,
        });
        const [row] = await db.select().from(lbmwCorrespondence).where(eq(lbmwCorrespondence.id, (result as any).insertId)).limit(1);
        return row;
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number().int(),
        status: z.enum(["pending", "responded", "awaiting_reply", "closed"]).optional(),
        priority: z.enum(["critical", "high", "medium", "low"]).optional(),
        internalNotes: z.string().optional(),
        responseDeadline: z.string().optional(),
        summary: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { lbmwCorrespondence } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { id, ...data } = input;
        const updateData: any = { ...data };
        if (data.responseDeadline) updateData.responseDeadline = new Date(data.responseDeadline);
        if (data.status === "responded") updateData.respondedAt = new Date();
        await db.update(lbmwCorrespondence).set(updateData).where(eq(lbmwCorrespondence.id, id));
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const { lbmwCorrespondence } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.delete(lbmwCorrespondence).where(eq(lbmwCorrespondence.id, input.id));
        return { success: true };
      }),
    summary: adminProcedure.query(async () => {
      const { lbmwCorrespondence } = await import('../drizzle/schema');
      const { sql: sqlFn } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return { total: 0, pending: 0, overdue: 0 };
      const rows = await db.select().from(lbmwCorrespondence);
      const now = new Date();
      const pending = rows.filter(r => r.status === "pending" || r.status === "awaiting_reply").length;
      const overdue = rows.filter(r => {
        if (!r.responseDeadline) return false;
        return new Date(r.responseDeadline) < now && r.status !== "responded" && r.status !== "closed";
      }).length;
      return { total: rows.length, pending, overdue };
    }),
    // ── Link correspondence to a compliance action ──────────────────────────
    linkToAction: adminProcedure
      .input(z.object({
        correspondenceId: z.number().int(),
        complianceActionId: z.number().int().nullable(),
      }))
      .mutation(async ({ input }) => {
        const { lbmwCorrespondence } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(lbmwCorrespondence)
          .set({ linkedComplianceActionId: input.complianceActionId })
          .where(eq(lbmwCorrespondence.id, input.correspondenceId));
        return { success: true };
      }),
    // ── Auto-create a compliance action from a correspondence item ──────────
    autoCreateAction: adminProcedure
      .input(z.object({
        correspondenceId: z.number().int(),
        title: z.string().min(1),
        owner: z.string().optional(),
        dueDate: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { lbmwCorrespondence, complianceActions } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Create the compliance action
        const [result] = await db.insert(complianceActions).values({
          title: input.title,
          source: "LBMW Correspondence",
          owner: input.owner ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          priority: input.priority ?? "medium",
          notes: input.notes ?? null,
          status: "open",
          createdByUserId: ctx.user.id,
        });
        const newActionId = (result as any).insertId as number;
        // Link the correspondence to the new action
        await db.update(lbmwCorrespondence)
          .set({ linkedComplianceActionId: newActionId })
          .where(eq(lbmwCorrespondence.id, input.correspondenceId));
        return { success: true, complianceActionId: newActionId };
      }),
    // ── List compliance actions (for linking dropdown) ──────────────────────
    listComplianceActions: adminProcedure.query(async () => {
      const { complianceActions } = await import('../drizzle/schema');
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: complianceActions.id,
        title: complianceActions.title,
        status: complianceActions.status,
        priority: complianceActions.priority,
        dueDate: complianceActions.dueDate,
        owner: complianceActions.owner,
      }).from(complianceActions)
        .orderBy(desc(complianceActions.createdAt))
        .limit(100);
    }),

    bulkUpdateStatus: adminProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1),
        status: z.enum(['pending', 'responded', 'awaiting_reply', 'closed']),
      }))
      .mutation(async ({ input }) => {
        const { lbmwCorrespondence } = await import('../drizzle/schema');
        const { inArray } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        await db.update(lbmwCorrespondence)
          .set({ status: input.status, updatedAt: new Date() })
          .where(inArray(lbmwCorrespondence.id, input.ids));
        return { updated: input.ids.length, status: input.status };
      }),

    exportPdf: adminProcedure
      .input(z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        status: z.string().optional(),
        priority: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { lbmwCorrespondence } = await import('../drizzle/schema');
        const { and: andOp, gte: gteOp, lte: lteOp } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        let q = db.select().from(lbmwCorrespondence).orderBy(desc(lbmwCorrespondence.dateReceived)).$dynamic();
        const conditions: any[] = [];
        if (input.status) conditions.push(eq(lbmwCorrespondence.status, input.status as any));
        if (input.priority) conditions.push(eq(lbmwCorrespondence.priority, input.priority as any));
        if (input.dateFrom) conditions.push(gteOp(lbmwCorrespondence.dateReceived, new Date(input.dateFrom) as any));
        if (input.dateTo) conditions.push(lteOp(lbmwCorrespondence.dateReceived, new Date(input.dateTo) as any));
        if (conditions.length > 0) q = q.where(andOp(...conditions));
        const rows = await q.limit(500);

        const PDFDocument = (await import('pdfkit')).default;
        const doc = new PDFDocument({ size: 'A4', margin: 50, layout: 'landscape' });
        const buffers: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          doc.on('data', (chunk: Buffer) => buffers.push(chunk));
          doc.on('end', resolve);
          doc.on('error', reject);
          const GREEN = '#5C1A1A';
          const GOLD = '#c9a84c';
          const pageW = doc.page.width - 100;
          // Header
          doc.rect(50, 40, pageW, 70).fill(GREEN);
          doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
            .text('ABDULLAH QUILLIAM SOCIETY', 70, 52, { width: pageW - 40 });
          doc.fontSize(10).font('Helvetica')
            .text('LBMW Correspondence Register', 70, 76, { width: pageW - 40 });
          doc.rect(50, 110, pageW, 2).fill(GOLD);
          const dateRange = (input.dateFrom || input.dateTo)
            ? `${input.dateFrom ? fmtDate(new Date(input.dateFrom)) : 'Start'} \u2014 ${input.dateTo ? fmtDate(new Date(input.dateTo)) : 'Today'}`
            : 'All dates';
          doc.moveDown(1.2);
          doc.fillColor('#444').fontSize(9).font('Helvetica')
            .text(`Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}   |   Period: ${dateRange}   |   Records: ${rows.length}`, { align: 'right' });
          doc.moveDown(0.5);
          const cols = [
            { label: 'Date', w: 65 }, { label: 'Contact', w: 110 }, { label: 'Subject', w: 185 },
            { label: 'Channel', w: 65 }, { label: 'Priority', w: 60 }, { label: 'Status', w: 70 },
            { label: 'Deadline', w: 65 }, { label: 'Linked Action', w: 90 },
          ];
          let hx = 50;
          const headerY = doc.y;
          doc.rect(50, headerY, pageW, 18).fill('#f0fdf4');
          cols.forEach(col => {
            doc.fillColor(GREEN).fontSize(8).font('Helvetica-Bold')
              .text(col.label, hx + 3, headerY + 4, { width: col.w - 6, ellipsis: true });
            hx += col.w;
          });
          doc.y = headerY + 20;
          rows.forEach((row: any, i: number) => {
            if (doc.y > doc.page.height - 80) {
              doc.addPage({ size: 'A4', margin: 50, layout: 'landscape' } as any);
            }
            const rowY = doc.y + 1;
            if (i % 2 === 0) doc.rect(50, rowY, pageW, 16).fill('#fafafa');
            const priorityColor: Record<string, string> = { critical: '#dc2626', high: '#d97706', medium: '#2563eb', low: '#6b7280' };
            const statusColor: Record<string, string> = { pending: '#d97706', responded: '#16a34a', awaiting_reply: '#2563eb', closed: '#6b7280' };
            let cx = 50;
            const cells = [
              { val: row.dateReceived ? fmtDate(new Date(row.dateReceived)) : '\u2014', color: '#333', w: cols[0].w },
              { val: `${row.contactName || '\u2014'}${row.contactRole ? ` (${row.contactRole})` : ''}`, color: '#333', w: cols[1].w },
              { val: row.subject || '\u2014', color: '#111', w: cols[2].w },
              { val: row.channel || '\u2014', color: '#555', w: cols[3].w },
              { val: (row.priority || '\u2014').toUpperCase(), color: priorityColor[row.priority] || '#333', w: cols[4].w },
              { val: (row.status || '\u2014').replace('_', ' ').toUpperCase(), color: statusColor[row.status] || '#333', w: cols[5].w },
              { val: row.responseDeadline ? fmtDate(new Date(row.responseDeadline)) : '\u2014', color: '#333', w: cols[6].w },
              { val: row.linkedComplianceActionId ? `Action #${row.linkedComplianceActionId}` : '\u2014', color: '#555', w: cols[7].w },
            ];
            cells.forEach(cell => {
              doc.fillColor(cell.color).fontSize(7.5).font('Helvetica')
                .text(cell.val, cx + 3, rowY + 3, { width: cell.w - 6, ellipsis: true });
              cx += cell.w;
            });
            doc.rect(50, rowY + 16, pageW, 0.5).fill('#e5e7eb');
            doc.y = rowY + 18;
          });
          doc.rect(50, doc.page.height - 40, pageW, 1).fill(GOLD);
          doc.fillColor('#888').fontSize(8).font('Helvetica')
            .text('AQ Society \u2014 LBMW Correspondence Register \u2014 Confidential', 50, doc.page.height - 30, { align: 'center', width: pageW });
          doc.end();
        });
        const pdfBuffer = Buffer.concat(buffers);
        const fileKey = `lbmw/correspondence-report-${Date.now()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, 'application/pdf');
        return { url };
      }),

    sendPdfToTrustees: adminProcedure
      .input(z.object({ pdfUrl: z.string(), dateRange: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { trustees } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const allTrustees = await db.select().from(trustees).where(eq(trustees.isActive, true));
        const emailTrustees = (allTrustees as any[]).filter((t: any) => t.email);
        if (emailTrustees.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No trustees with email addresses found' });
        const subject = `LBMW Correspondence Register${input.dateRange ? ` \u2014 ${input.dateRange}` : ''}`;
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#5C1A1A;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">LBMW Correspondence Register</p></div><div style="padding:24px;background:#fff"><p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh,</p><p>Please find the LBMW Correspondence Register${input.dateRange ? ` for the period <strong>${input.dateRange}</strong>` : ''} for your review.</p><p><a href="${input.pdfUrl}" style="display:inline-block;background:#5C1A1A;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold">Download PDF Report</a></p><p style="margin-top:16px;font-size:12px;color:#666">Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</p><p>JazakAllahu Khayran,<br><strong>AQ Society Administration</strong></p></div><div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">AQ Society \u2014 LBMW Correspondence Register \u2014 Confidential</div></div>`;
        let sent = 0;
        for (const trustee of emailTrustees) {
          try { await sendGmail(trustee.email, trustee.fullName || 'Trustee', subject, html); sent++; } catch (e) { console.error(`[LBMW] Email failed for ${trustee.fullName}:`, e); }
        }
        return { sent, total: emailTrustees.length };
      }),
  }),
});
export type AppRouter = typeof appRouter;
// ─── ORG CHART ROUTER (appended) ─────────────────────────────────────────────
// NOTE: This is intentionally outside the main appRouter export above.
// It is exported separately and merged in a separate file if needed,
// or we add it inline. Since appRouter is already closed, we export a helper.
