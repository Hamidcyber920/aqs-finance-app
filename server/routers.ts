import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateLoanPdf } from "./loanPdf";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { notifyOwner } from "./_core/notification";
import { nanoid } from "nanoid";
import { localAuthRouter, adminRouter } from "./routers/localAuth";
import {
  createReceipt, deleteReceipt, getAllCategories, getCategoryTotals, getMonthlyTotal,
  getReceiptById, listReceipts, seedDefaultCategories, updateReceipt, getAdminReceiptStats,
  getDepartments, getExpenseCategories, seedDepartmentsAndCategories,
  getUserPermissions, upsertUserPermissions,
  listAllUsers, updateUserRole, setUserActive, getPendingUsers, approveUser, rejectUser, setDelegateApprover,
  getUserById,
  getFundraisingCampaigns, getCampaignById, createFundraisingCampaign, updateCampaignAmount,
  getCampaignItems, getCampaignDonations, createDonation, getFridayCollections, createFridayCollection,
  getLoans, getLoanById, createLoan, updateLoan, getLoanRepayments, createLoanRepayment,
  getIncomeCategories, getIncomeRecords, createIncomeRecord, updateIncomeRecord,
  getDonors, getDonorById, createDonor, updateDonor,
  getEmailCampaigns, getEmailCampaignById, createEmailCampaign, updateEmailCampaign,
  getPayrollRecords, createPayrollRecord, updatePayrollRecord, getStaffProfile, upsertStaffProfile,
  getDashboardStats,
} from "./db";

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
  const { google } = await import("googleapis");
  const oauth2Client = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const fromEmail = process.env.GMAIL_FROM_EMAIL ?? "noreply@example.com";
  const message = [`From: Abdullah Quilliam Society <${fromEmail}>`, `To: ${name} <${to}>`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/html; charset=utf-8", "", htmlBody].join("\n");
  const encoded = Buffer.from(message).toString("base64url");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });
}

// ─── MAIN ROUTER ─────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  localAuth: localAuthRouter,
  admin: adminRouter,

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
  }),

  departments: router({
    list: protectedProcedure.query(() => getDepartments()),
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
      if (!isAdmin(ctx.user.role) && receipt.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await deleteReceipt(input.id);
      return { success: true };
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
    updatePermissions: adminProcedure
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
      .input(z.object({ applicantName: z.string(), applicantEmail: z.string().optional(), applicantPhone: z.string().optional(), applicantAddress: z.string().optional(), purpose: z.string(), amount: z.string(), repaymentPeriodMonths: z.number(), monthlyRepayment: z.string().optional(), startDate: z.date().optional(), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const loan = await createLoan({ borrowerName: input.applicantName, borrowerEmail: input.applicantEmail, borrowerPhone: input.applicantPhone, borrowerAddress: input.applicantAddress, purpose: input.purpose, amount: input.amount, termMonths: input.repaymentPeriodMonths, monthlyRepayment: input.monthlyRepayment, startDate: input.startDate, notes: input.notes } as any);
        if (input.applicantEmail) {
          const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#1a4731;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Loan Application</p></div><div style="padding:24px;background:#fff"><p>Dear ${input.applicantName},</p><p>Thank you for submitting your Qarde Hasan (interest-free loan) application. We have received your application and it is currently under review by our trustees.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Amount Requested</td><td style="padding:8px">&pound;${parseFloat(input.amount).toFixed(2)}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Purpose</td><td style="padding:8px">${input.purpose}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Repayment Term</td><td style="padding:8px">${input.repaymentPeriodMonths} months</td></tr></table><p>You will be notified once your application has been reviewed. If you have any questions, please contact us directly.</p><p>Jazakallahu Khayran,<br><strong>Abdullah Quilliam Society Finance Team</strong></p></div><div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">This is an automated message from the AQ Society Finance System.</div></div>`;
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
          const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#1a4731;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Loan &mdash; Approved</p></div><div style="padding:24px;background:#fff"><p>Dear ${loan.borrowerName},</p><p>We are pleased to inform you that your Qarde Hasan loan application has been <strong style="color:#1a4731">approved</strong> by the Abdullah Quilliam Society trustees.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Loan Amount</td><td style="padding:8px">&pound;${parseFloat(String(loan.amount)).toFixed(2)}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Monthly Repayment</td><td style="padding:8px">&pound;${loan.monthlyRepayment ? parseFloat(String(loan.monthlyRepayment)).toFixed(2) : "TBC"}</td></tr><tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Repayment Term</td><td style="padding:8px">${loan.termMonths} months</td></tr></table><p>Please contact us to arrange collection of funds and to sign your loan agreement document.</p><p>Jazakallahu Khayran,<br><strong>Abdullah Quilliam Society Finance Team</strong></p></div><div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">This is an automated message from the AQ Society Finance System.</div></div>`;
          await sendGmail(loan.borrowerEmail, loan.borrowerName, "Your Qarde Hasan Loan Has Been Approved — Abdullah Quilliam Society", html).catch(() => {});
        }
        return { success: true };
      }),
    reject: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => { await updateLoan(input.id, { status: "rejected" }); return { success: true }; }),
    recordRepayment: adminProcedure
      .input(z.object({ loanId: z.number(), amount: z.string(), paymentMethod: z.string().default("bank_transfer"), evidenceUrl: z.string().optional(), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const repayment = await createLoanRepayment({ ...input, paymentMethod: input.paymentMethod as any, recordedById: ctx.user.id });
        const loan = await getLoanById(input.loanId);
        if (loan && parseFloat(loan.totalRepaid?.toString() ?? "0") >= parseFloat(loan.amount.toString())) {
          await updateLoan(input.loanId, { status: "completed" });
        }
        return repayment;
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
          monthlyRepayment: loan.monthlyRepayment, startDate: loan.startDate,
          createdAt: loan.createdAt, status: loan.status,
          chairSignatureUrl: loan.chairSignatureUrl, trusteeSignatureUrl: loan.trusteeSignatureUrl, notes: loan.notes,
        });
        const fileKey = `loans/agreement-${loan.id}-${Date.now()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
        return { url, filename: `AQS-Loan-Agreement-${String(loan.id).padStart(4, "0")}.pdf` };
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
          htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px"><p>Dear ${loan.borrowerName},</p><p>Your loan application for <strong>&pound;${parseFloat(String(loan.amount)).toFixed(2)}</strong> has been received and is under review.</p><p>Jazakallahu Khayran,<br><strong>AQ Society Finance Team</strong></p></div>${footer}</div>`;
        } else if (input.type === "approved") {
          subject = "Your Qarde Hasan Loan Has Been Approved — Abdullah Quilliam Society";
          htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px"><p>Dear ${loan.borrowerName},</p><p>Your Qarde Hasan loan of <strong>&pound;${parseFloat(String(loan.amount)).toFixed(2)}</strong> has been <strong style="color:#1a4731">approved</strong>. Please contact us to arrange collection.</p><p>Jazakallahu Khayran,<br><strong>AQ Society Finance Team</strong></p></div>${footer}</div>`;
        } else if (input.type === "reminder") {
          const remaining = parseFloat(String(loan.amount)) - parseFloat(String(loan.totalRepaid ?? 0));
          subject = "Qarde Hasan Loan Repayment Reminder — Abdullah Quilliam Society";
          htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px"><p>Dear ${loan.borrowerName},</p><p>This is a friendly reminder that your outstanding balance is <strong>&pound;${remaining.toFixed(2)}</strong>. If you have any difficulties, please contact us.</p><p>Jazakallahu Khayran,<br><strong>AQ Society Finance Team</strong></p></div>${footer}</div>`;
        } else if (input.type === "custom" && input.customSubject && input.customBody) {
          subject = input.customSubject;
          htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px">${input.customBody}</div>${footer}</div>`;
        } else { throw new TRPCError({ code: "BAD_REQUEST", message: "Custom email requires subject and body" }); }
        await sendGmail(loan.borrowerEmail, loan.borrowerName, subject, htmlBody);
        return { success: true, sentTo: loan.borrowerEmail };
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
        const payrollRows = await db
          .select({ id: payrollRecords.id, employeeName: payrollRecords.employeeName, userId: payrollRecords.userId, month: payrollRecords.month, year: payrollRecords.year, netPay: payrollRecords.netPay, paymentMethod: payrollRecords.paymentMethod, paymentStatus: payrollRecords.paymentStatus, chequeNumber: payrollRecords.chequeNumber, chequeImageUrl: payrollRecords.chequeImageUrl, chequeIssuedAt: payrollRecords.chequeIssuedAt, bankingStatus: payrollRecords.bankingStatus, bankedAt: payrollRecords.bankedAt, paidAt: payrollRecords.paidAt, notes: payrollRecords.notes, userName: users.name })
          .from(payrollRecords)
          .leftJoin(users, eq(payrollRecords.userId, users.id))
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
          payroll: payrollRows.map(r => ({ ...r, displayName: r.employeeName ?? r.userName ?? `Employee #${r.userId}`, type: "payroll" as const })),
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
      .input(z.object({ type: z.enum(["payroll", "receipt", "volunteer"]), id: z.number(), chequeNumber: z.string().optional(), chequeImageUrl: z.string().optional(), invoiceUrl: z.string().optional() }))
      .mutation(async ({ input }) => {
        const now = new Date();
        if (input.type === "payroll") {
          await updatePayrollRecord(input.id, { paymentStatus: "paid" as any, paidAt: now, chequeIssuedAt: now, chequeNumber: input.chequeNumber, chequeImageUrl: input.chequeImageUrl, invoiceUrl: input.invoiceUrl } as any);
        } else if (input.type === "receipt") {
          await updateReceipt(input.id, { status: "approved" as any, paidAt: now, chequeIssuedAt: now, chequeNumber: input.chequeNumber, chequeImageUrl: input.chequeImageUrl, invoiceUrl: input.invoiceUrl } as any);
        } else {
          const db = await (await import("./db")).getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          const { eq } = await import("drizzle-orm");
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
              <p>Dear ${input.recipientName},</p>
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

    // Staff + volunteer directory for email recipient dropdown
    staffDirectory: adminProcedure.query(async () => {
      const { rows } = await listAllUsers(500);
      const staff = rows
        .filter((u: any) => u.email)
        .map((u: any) => ({ id: u.id, name: u.name ?? u.email ?? "", email: u.email ?? "", role: u.role, type: "user" as const }));
      return staff;
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
      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const db = await (await import("./db")).getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          const { eq } = await import("drizzle-orm");
          const { volunteerPayments } = await import("../drizzle/schema");
          await db.delete(volunteerPayments).where(eq(volunteerPayments.id, input.id));
          return { success: true };
        }),
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
    list: adminProcedure
      .input(z.object({ categoryId: z.number().optional(), paymentStatus: z.string().optional(), startDate: z.date().optional(), endDate: z.date().optional(), limit: z.number().default(100), offset: z.number().default(0) }))
      .query(({ input }) => getIncomeRecords(input)),
    create: adminProcedure
      .input(z.object({ categoryId: z.number(), description: z.string(), amount: z.string(), paymentStatus: z.string().default("paid"), payerName: z.string().optional(), payerEmail: z.string().optional(), payerPhone: z.string().optional(), reference: z.string().optional(), periodStart: z.date().optional(), periodEnd: z.date().optional(), receiptUrl: z.string().optional(), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => createIncomeRecord({ ...input, tenantName: input.payerName ?? "", paymentStatus: input.paymentStatus as any, recordedById: ctx.user.id })),
    update: adminProcedure
      .input(z.object({ id: z.number(), paymentStatus: z.string().optional(), amount: z.string().optional(), notes: z.string().optional() }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await updateIncomeRecord(id, data as any); return { success: true }; }),
  }),

  // ─── DONORS ───────────────────────────────────────────────────────────────

  donors: router({
    list: adminProcedure.input(z.object({ isRegular: z.boolean().optional(), search: z.string().optional(), limit: z.number().default(100), offset: z.number().default(0) })).query(({ input }) => getDonors(input)),
    get: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => { const d = await getDonorById(input.id); if (!d) throw new TRPCError({ code: "NOT_FOUND" }); return d; }),
    create: adminProcedure.input(z.object({ name: z.string(), email: z.string().optional(), phone: z.string().optional(), address: z.string().optional(), isRegular: z.boolean().default(false), isGiftAid: z.boolean().default(false), notes: z.string().optional() })).mutation(({ input }) => createDonor(input)),
    update: adminProcedure.input(z.object({ id: z.number(), name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), isRegular: z.boolean().optional(), isGiftAid: z.boolean().optional(), notes: z.string().optional(), totalGiven: z.string().optional() })).mutation(async ({ input }) => { const { id, ...data } = input; await updateDonor(id, data as any); return { success: true }; }),
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
      .mutation(async ({ input }) => {
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
      }),

    // Keep single-employee alias for backward compat
    analyzePayslip: adminProcedure
      .input(z.object({ fileUrl: z.string(), mimeType: z.string().default("application/pdf") }))
      .mutation(async ({ input, ctx }) => {
        // delegate to bulk, return first employee
        const bulk = await appRouter.createCaller(ctx).payroll.analyzePayslipBulk(input);
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
        .input(z.object({ userId: z.number(), niNumber: z.string().optional(), taxCode: z.string().optional(), bankName: z.string().optional(), bankAccountNumber: z.string().optional(), bankSortCode: z.string().optional(), startDate: z.date().optional(), contractType: z.string().optional(), paymentMethod: z.string().optional(), annualSalary: z.string().optional(), hourlyRate: z.string().optional() }))
        .mutation(async ({ input }) => { const { userId, ...data } = input; await upsertStaffProfile(userId, data as any); return { success: true }; }),
    }),
  }),
});

export type AppRouter = typeof appRouter;
