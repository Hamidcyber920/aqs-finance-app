import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateLoanPdf, generateRepaymentPdf } from "./loanPdf";
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
import { voiceAgentRouter } from "./routers/voiceAgent";
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
import { eq } from "drizzle-orm";
import { loanRepayments } from "../drizzle/schema";
// sendGmail is defined locally in this file (line ~123)

// ─── Permission helpers ───────────────────────────────────────────────────────

const ADMIN_ROLES = ["superadmin", "trustee", "manager", "admin"];

function isAdmin(role: string) { return ADMIN_ROLES.includes(role); }

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isAdmin(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  return next({ ctx });
});

const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "superadmin" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Super admin access required" });
  return next({ ctx });
});

// Superadmin or Trustee only — used for AI document import and sensitive data entry
const seniorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "superadmin" && ctx.user.role !== "trustee")
    throw new TRPCError({ code: "FORBIDDEN", message: "Only superadmins and trustees can perform this action" });
  return next({ ctx });
});

// ─── Deletion policy helper ───────────────────────────────────────────────────
// Rules:
//   1. superadmin or trustee can always delete
//   2. Any user can delete their OWN entry within 10 minutes of creation
//   3. All other deletions are forbidden
function canDelete(userRole: string, userId: number, entryUserId: number | null | undefined, createdAt: Date | null | undefined): boolean {
  if (userRole === 'superadmin' || userRole === 'trustee') return true;
  if (!createdAt) return false;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const TEN_MIN = 10 * 60 * 1000;
  return entryUserId === userId && ageMs <= TEN_MIN;
}

function assertCanDelete(userRole: string, userId: number, entryUserId: number | null | undefined, createdAt: Date | null | undefined) {
  if (!canDelete(userRole, userId, entryUserId, createdAt)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: userRole === 'superadmin' || userRole === 'trustee'
        ? 'Delete not permitted'
        : 'Entries can only be deleted within 10 minutes of creation, or by a superadmin/trustee',
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
      const waMsg = encodeURIComponent(`Assalamu Alaikum ${firstName}, your Qarde Hasan loan of £${parseFloat(String(loan.amount)).toFixed(2)} has been approved by Abdullah Quilliam Society. Please download your loan agreement: ${url}`);
      const waLink = whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${waMsg}` : `https://wa.me/?text=${waMsg}`;
      const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#1a4731;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Loan &mdash; Fully Approved</p></div><div style="padding:24px;background:#fff"><p>Assalamu Alaikum, ${firstName},</p><p>Your Qarde Hasan loan application has been <strong style="color:#1a4731">fully approved</strong> by both the Super Admin and Trustee of the Abdullah Quilliam Society.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Loan Amount</td><td style="padding:8px">&pound;${parseFloat(String(loan.amount)).toFixed(2)}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Repayment Term</td><td style="padding:8px">${termLabel}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Monthly Repayment</td><td style="padding:8px">&pound;${monthlyAmt.toFixed(2)}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Approved By (Admin)</td><td style="padding:8px">${loan.adminApprovedByName ?? 'N/A'}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Approved By (Trustee)</td><td style="padding:8px">${loan.trusteeName ?? 'N/A'}</td></tr></table><p><a href="${url}" style="display:inline-block;background:#1a4731;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold">Download Loan Agreement (PDF)</a></p>${whatsappPhone ? `<p style="margin-top:16px"><a href="${waLink}" style="display:inline-block;background:#25D366;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">Open in WhatsApp</a></p>` : ''}<p>Jazakallahu Khayran,<br><strong>Abdullah Quilliam Society Finance Team</strong></p></div><div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">This is an automated message from the AQ Society Finance System.</div></div>`;
      await sendGmail(loan.borrowerEmail, loan.borrowerName, "Your Qarde Hasan Loan Has Been Fully Approved — Abdullah Quilliam Society", html).catch(() => {});
    }
  } catch (e) { console.error("[Loans] Failed to generate PDF or send email on full approval:", e); }
}

async function _fullyApproveRepayment(repayment: any) {
  try {
    const loan = await getLoanById(repayment.loanId);
    if (!loan) return;
    const pdfBuffer = await generateRepaymentPdf({
      repaymentId: repayment.id, loanId: loan.id,
      borrowerName: loan.borrowerName, borrowerEmail: loan.borrowerEmail, borrowerPhone: loan.borrowerPhone,
      amount: repayment.amount, paymentMethod: repayment.paymentMethod,
      paidAt: repayment.paidAt, loanAmount: loan.amount, totalRepaid: loan.totalRepaid ?? "0",
      termMonths: loan.termMonths,
      adminApprovedByName: repayment.adminApprovedByName, adminApprovedAt: repayment.adminApprovedAt,
      trusteeName: repayment.trusteeName, trusteeApprovedAt: repayment.trusteeApprovedAt,
      notes: repayment.notes,
    });
    const fileKey = `loans/repayment-${repayment.id}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
    const db = await getDb();
    if (db) await db.update(loanRepayments).set({ confirmationPdfUrl: url, status: "approved" } as any).where(eq(loanRepayments.id, repayment.id));
    if (loan.borrowerEmail) {
      const firstName = (loan.borrowerName ?? '').split(' ')[0];
      const outstanding = Math.max(0, parseFloat(String(loan.amount)) - parseFloat(String(loan.totalRepaid ?? 0)));
      const whatsappPhone = (loan.borrowerPhone ?? '').replace(/[^0-9]/g, '');
      const waMsg = encodeURIComponent(`Assalamu Alaikum ${firstName}, your repayment of £${parseFloat(String(repayment.amount)).toFixed(2)} to Abdullah Quilliam Society has been confirmed. Outstanding balance: £${outstanding.toFixed(2)}. Download receipt: ${url}`);
      const waLink = whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${waMsg}` : `https://wa.me/?text=${waMsg}`;
      const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#1a4731;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan &mdash; Repayment Confirmed</p></div><div style="padding:24px;background:#fff"><p>Assalamu Alaikum, ${firstName},</p><p>Your repayment of <strong>&pound;${parseFloat(String(repayment.amount)).toFixed(2)}</strong> has been received and confirmed by the Society.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Amount Paid</td><td style="padding:8px">&pound;${parseFloat(String(repayment.amount)).toFixed(2)}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Outstanding Balance</td><td style="padding:8px">&pound;${outstanding.toFixed(2)}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Confirmed By</td><td style="padding:8px">${repayment.adminApprovedByName ?? 'N/A'}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Trustee</td><td style="padding:8px">${repayment.trusteeName ?? 'N/A'}</td></tr></table><p><a href="${url}" style="display:inline-block;background:#1a4731;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold">Download Repayment Receipt (PDF)</a></p>${whatsappPhone ? `<p style="margin-top:16px"><a href="${waLink}" style="display:inline-block;background:#25D366;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold">Open in WhatsApp</a></p>` : ''}<p>Jazakallahu Khayran,<br><strong>Abdullah Quilliam Society Finance Team</strong></p></div><div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">This is an automated message from the AQ Society Finance System.</div></div>`;
      await sendGmail(loan.borrowerEmail, loan.borrowerName, "Qarde Hasan Repayment Confirmed — Abdullah Quilliam Society", html).catch(() => {});
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
  voiceAgent: voiceAgentRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
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
        amount: z.union([z.string(), z.number()]).transform(v => String(v)),
        description: z.string().optional(),
        vendor: z.string().optional(),
        date: z.string().optional(),
        department: z.union([z.string(), z.number()]).optional().transform(v => v != null ? String(v) : undefined),
        notes: z.string().optional(),
        imageUrl: z.string().optional(),
        categoryName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
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
        return { id };
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

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const receipt = await getReceiptById(input.id);
      if (!receipt) throw new TRPCError({ code: "NOT_FOUND" });
      assertCanDelete(ctx.user.role, ctx.user.id, receipt.userId, receipt.createdAt);
      await deleteReceipt(input.id);
      return { success: true };
    }),

    // Returns whether the current user can delete a given receipt (for UI)
    canDelete: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const receipt = await getReceiptById(input.id);
      if (!receipt) return { allowed: false, reason: 'Not found' };
      const allowed = canDelete(ctx.user.role, ctx.user.id, receipt.userId, receipt.createdAt);
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
        const receiptDate = extracted.date ? new Date(extracted.date) : undefined;
        await updateReceipt(input.receiptId, {
          vendor: extracted.vendor ?? undefined, receiptDate,
          amount: extracted.amount != null ? String(extracted.amount) : undefined,
          tax: extracted.tax != null ? String(extracted.tax) : undefined,
          currency: extracted.currency ?? "GBP", categoryName: extracted.categoryName ?? "Other",
          lineItems: extracted.lineItems, rawText: extracted.rawText ?? undefined, status: "processed",
        });
        const updatedReceipt = await getReceiptById(input.receiptId);
        await notifyOwner({ title: "New Receipt Processed", content: `Receipt from "${extracted.vendor ?? "Unknown"}" for £${extracted.amount ?? 0} categorised as "${extracted.categoryName}".` }).catch(() => {});
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
  }),

  // ─── FUNDRAISING ──────────────────────────────────────────────────────────

  fundraising: router({
    listCampaigns: protectedProcedure.query(() => getFundraisingCampaigns()),
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
      .mutation(async ({ ctx, input }) => { const d = await createDonation({ campaignId: input.campaignId, donorName: input.donorName ?? "Anonymous", donorEmail: input.donorEmail, amount: input.amount, paymentMethod: input.paymentMethod as any, notes: input.notes }); await updateCampaignAmount(input.campaignId, parseFloat(input.amount)); return d; }),
    listFridayCollections: protectedProcedure.query(() => getFridayCollections()),
    recordFridayCollection: adminProcedure
      .input(z.object({ collectionDate: z.date(), amount: z.string(), collectedById: z.number().optional(), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => createFridayCollection({ collectionDate: input.collectionDate, totalAmount: input.amount, recordedById: ctx.user.id, notes: input.notes })),
    deleteDonation: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq } = await import('drizzle-orm');
        const { fundraisingDonations } = await import('../drizzle/schema');
        const rows = await db.select().from(fundraisingDonations).where(eq(fundraisingDonations.id, input.id)).limit(1);
        if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCanDelete(ctx.user.role, ctx.user.id, null, rows[0].createdAt);
        await db.delete(fundraisingDonations).where(eq(fundraisingDonations.id, input.id));
        return { success: true };
      }),
    deleteFridayCollection: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq } = await import('drizzle-orm');
        const { fridayCollections } = await import('../drizzle/schema');
        const rows = await db.select().from(fridayCollections).where(eq(fridayCollections.id, input.id)).limit(1);
        if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCanDelete(ctx.user.role, ctx.user.id, rows[0].recordedById, rows[0].createdAt);
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
      .input(z.object({ fullName: z.string(), email: z.string().optional(), phone: z.string().optional(), role: z.string().optional(), notes: z.string().optional() }))
      .mutation(async ({ input }) => createTrustee({ fullName: input.fullName, email: input.email, phone: input.phone, role: input.role ?? "Trustee", notes: input.notes })),
    update: adminProcedure
      .input(z.object({ id: z.number(), fullName: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), role: z.string().optional(), isActive: z.boolean().optional(), notes: z.string().optional() }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await updateTrustee(id, data as any); return { success: true }; }),
    delete: superAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => { await deleteTrustee(input.id); return { success: true }; }),
  }),

  // ─── LOANS (QARDE HASAN) ──────────────────────────────────────────────────

  loans: router({
    list: adminProcedure.input(z.object({ status: z.string().optional() })).query(({ input }) => getLoans(input.status)),
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
          const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#1a4731;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Loan Application</p></div><div style="padding:24px;background:#fff"><p>Assalamu Alaikum, ${firstName1},</p><p>Thank you for submitting your Qarde Hasan (interest-free loan) application. We have received your application and it is currently under review by our trustees.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Amount Requested</td><td style="padding:8px">&pound;${parseFloat(input.amount).toFixed(2)}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Purpose</td><td style="padding:8px">${input.purpose}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Repayment Term</td><td style="padding:8px">${termLabel}</td></tr></table><p>You will be notified once your application has been reviewed. If you have any questions, please contact us directly.</p><p>Jazakallahu Khayran,<br><strong>Abdullah Quilliam Society Finance Team</strong></p></div><div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">This is an automated message from the AQ Society Finance System.</div></div>`;
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
          const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#1a4731;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Loan &mdash; Approved</p></div><div style="padding:24px;background:#fff"><p>Assalamu Alaikum, ${firstName2},</p><p>We are pleased to inform you that your Qarde Hasan loan application has been <strong style="color:#1a4731">approved</strong> by the Abdullah Quilliam Society trustees.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Loan Amount</td><td style="padding:8px">&pound;${parseFloat(String(loan.amount)).toFixed(2)}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Monthly Repayment</td><td style="padding:8px">&pound;${loan.monthlyRepayment ? parseFloat(String(loan.monthlyRepayment)).toFixed(2) : "TBC"}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Repayment Term</td><td style="padding:8px">${loan.termMonths} months</td></tr></table><p>Please contact us to arrange collection of funds and to sign your loan agreement document.</p><p>Jazakallahu Khayran,<br><strong>Abdullah Quilliam Society Finance Team</strong></p></div><div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">This is an automated message from the AQ Society Finance System.</div></div>`;
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
        const pdfBuffer = await generateRepaymentPdf({
          repaymentId: repayment.id, loanId: loan.id,
          borrowerName: loan.borrowerName, borrowerEmail: loan.borrowerEmail, borrowerPhone: loan.borrowerPhone,
          amount: repayment.amount, paymentMethod: repayment.paymentMethod,
          paidAt: repayment.paidAt, loanAmount: loan.amount, totalRepaid: loan.totalRepaid ?? "0",
          termMonths: loan.termMonths,
          adminApprovedByName: (repayment as any).adminApprovedByName, adminApprovedAt: (repayment as any).adminApprovedAt,
          trusteeName: (repayment as any).trusteeName, trusteeApprovedAt: (repayment as any).trusteeApprovedAt,
          notes: repayment.notes,
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
        const header = `<div style="background:#1a4731;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Loan</p></div>`;
        const footer = `<div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">This is an automated message from the AQ Society Finance System.</div>`;
        let subject = ""; let htmlBody = "";
        if (input.type === "application_received") {
          subject = "Qarde Hasan Loan Application Received — Abdullah Quilliam Society";
          const fn1 = (loan.borrowerName ?? '').split(' ')[0];
          htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px"><p>Assalamu Alaikum, ${fn1},</p><p>Your loan application for <strong>&pound;${parseFloat(String(loan.amount)).toFixed(2)}</strong> has been received and is under review.</p><p>Jazakallahu Khayran,<br><strong>AQ Society Finance Team</strong></p></div>${footer}</div>`;
        } else if (input.type === "approved") {
          subject = "Your Qarde Hasan Loan Has Been Approved — Abdullah Quilliam Society";
          const fn2 = (loan.borrowerName ?? '').split(' ')[0];
          htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px"><p>Assalamu Alaikum, ${fn2},</p><p>Your Qarde Hasan loan of <strong>&pound;${parseFloat(String(loan.amount)).toFixed(2)}</strong> has been <strong style="color:#1a4731">approved</strong>. Please contact us to arrange collection.</p><p>Jazakallahu Khayran,<br><strong>AQ Society Finance Team</strong></p></div>${footer}</div>`;
        } else if (input.type === "reminder") {
          const remaining = parseFloat(String(loan.amount)) - parseFloat(String(loan.totalRepaid ?? 0));
          subject = "Qarde Hasan Loan Repayment Reminder — Abdullah Quilliam Society";
          const fn3 = (loan.borrowerName ?? '').split(' ')[0];
          htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px"><p>Assalamu Alaikum, ${fn3},</p><p>This is a friendly reminder that your outstanding balance is <strong>&pound;${remaining.toFixed(2)}</strong>. If you have any difficulties, please contact us.</p><p>Jazakallahu Khayran,<br><strong>AQ Society Finance Team</strong></p></div>${footer}</div>`;
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
        if (!loan.borrowerEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "Borrower has no email address on file" });
        const firstName = (loan.borrowerName ?? '').split(' ')[0];
        const instalmentNum = (rep as any).instalmentNumber ?? '';
        const amount = parseFloat(String((rep as any).amount ?? 0)).toFixed(2);
        const baseStyle = `font-family:Arial,sans-serif;max-width:600px;margin:0 auto`;
        const header = `<div style="background:#1a4731;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Loan</p></div>`;
        const footer = `<div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">This is an automated message from the AQ Society Finance System.</div>`;
        const instalmentLabel = instalmentNum ? ` (Instalment ${instalmentNum})` : '';
        const htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px"><p>Dear ${firstName},</p><p>Assalamu Alaikum,</p><p>This is to confirm that your Qarde Hasan loan repayment of <strong>&pound;${amount}</strong>${instalmentLabel} has been paid.</p><p>Please confirm receipt of the payment at your earliest convenience. If you have any questions, please do not hesitate to contact us.</p><p>Jazakallahu Khayran,<br><strong>AQ Society Finance Team</strong></p></div>${footer}</div>`;
        try {
          await sendGmail(loan.borrowerEmail, loan.borrowerName, `Qarde Hasan Repayment Confirmation — £${amount}${instalmentLabel}`, htmlBody);
          return { success: true, sentTo: loan.borrowerEmail };
        } catch (e: any) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Email failed: ${e?.message ?? String(e)}` });
        }
      }),
  }),

  // ─── MONTHLY EXPENSES PANE ──────────────────────────────────────────────────

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
        const dateStr = input.paidAt ? new Date(input.paidAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#1B4332;padding:20px;text-align:center">
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
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
          const db = await (await import("./db")).getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          const { eq } = await import("drizzle-orm");
          const { volunteerPayments } = await import("../drizzle/schema");
          const rows = await db.select().from(volunteerPayments).where(eq(volunteerPayments.id, input.id)).limit(1);
          if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
          assertCanDelete(ctx.user.role, ctx.user.id, rows[0].createdById, rows[0].createdAt);
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
        periodStart: z.date().optional(), periodEnd: z.date().optional(),
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
        } as any);
      }),
    update: adminProcedure
      .input(z.object({ id: z.number(), paymentStatus: z.string().optional(), amount: z.string().optional(), notes: z.string().optional() }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await updateIncomeRecord(id, data as any); return { success: true }; }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq } = await import('drizzle-orm');
        const { incomeRecords } = await import('../drizzle/schema');
        const rows = await db.select().from(incomeRecords).where(eq(incomeRecords.id, input.id)).limit(1);
        if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCanDelete(ctx.user.role, ctx.user.id, rows[0].recordedById, rows[0].createdAt);
        await db.delete(incomeRecords).where(eq(incomeRecords.id, input.id));
        return { success: true };
      }),
  }),

  // ─── DONORS ───────────────────────────────────────────────────────────────

  donors: router({
    list: adminProcedure.input(z.object({ isRegular: z.boolean().optional(), search: z.string().optional(), limit: z.number().default(100), offset: z.number().default(0) })).query(({ input }) => getDonors(input)),
    get: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => { const d = await getDonorById(input.id); if (!d) throw new TRPCError({ code: "NOT_FOUND" }); return d; }),
    create: adminProcedure.input(z.object({ name: z.string(), email: z.string().optional(), phone: z.string().optional(), address: z.string().optional(), isRegular: z.boolean().default(false), isGiftAid: z.boolean().default(false), notes: z.string().optional() })).mutation(({ input }) => createDonor(input)),
    update: adminProcedure.input(z.object({ id: z.number(), name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), isRegular: z.boolean().optional(), isGiftAid: z.boolean().optional(), notes: z.string().optional(), totalGiven: z.string().optional() })).mutation(async ({ input }) => { const { id, ...data } = input; await updateDonor(id, data as any); return { success: true }; }),
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
        return createPayrollRecord({ userId: userId ?? 0, employeeName, month, year, grossPay, incomeTax: incomeTax ?? "0", nationalInsurance: nationalInsurance ?? "0", pensionContribution: pensionContribution ?? "0", otherDeductions: otherDeductions ?? "0", totalDeductions, netPay, paymentMethod: (paymentMethod as any) ?? "bank_transfer", payslipUrl, notes });
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

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { eq } = await import('drizzle-orm');
        const { invoices } = await import('../drizzle/schema');
        const rows = await db.select().from(invoices).where(eq(invoices.id, input.id)).limit(1);
        if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
        assertCanDelete(ctx.user.role, ctx.user.id, rows[0].createdById, rows[0].createdAt);
        await db.delete(invoices).where(eq(invoices.id, input.id));
        return { success: true };
      }),
  }),

  // ─── UNIVERSAL AI DOCUMENT EXTRACTION ────────────────────────────────────
  documents: router({
    extract: seniorProcedure
      .input(z.object({
        fileUrl: z.string(),
        mimeType: z.string(),
        moduleType: z.enum([
          'income_rental', 'loan_repayment', 'loan_application',
          'invoice', 'payroll', 'friday_collection',
          'fundraising_donation', 'receipt', 'bank_statement'
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

          fundraising_donation: `You are a donation/fundraising extractor. Extract from this document:
- donorName: full name of donor
- amount: donation amount in GBP (number)
- donationDate: date of donation (YYYY-MM-DD)
- paymentMethod: cash/bank_transfer/cheque/online or null
- reference: payment reference or null
- campaignName: fundraising campaign name or null
- giftAid: whether gift aid applies (true/false or null)
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
    remove: seniorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteOrgMember(input.id);
        return { success: true };
      }),
  }),
});
export type AppRouter = typeof appRouter;
// ─── ORG CHART ROUTER (appended) ─────────────────────────────────────────────
// NOTE: This is intentionally outside the main appRouter export above.
// It is exported separately and merged in a separate file if needed,
// or we add it inline. Since appRouter is already closed, we export a helper.
