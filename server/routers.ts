import { z } from "zod";
import { TRPCError } from "@trpc/server";
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
      .mutation(async ({ ctx, input }) => createLoan({ borrowerName: input.applicantName, borrowerEmail: input.applicantEmail, borrowerPhone: input.applicantPhone, borrowerAddress: input.applicantAddress, purpose: input.purpose, amount: input.amount, termMonths: input.repaymentPeriodMonths, monthlyRepayment: input.monthlyRepayment, startDate: input.startDate, notes: input.notes } as any)),
    approve: adminProcedure
      .input(z.object({ id: z.number(), chairSignatureUrl: z.string().optional(), trusteeSignatureUrl: z.string().optional() }))
      .mutation(async ({ ctx, input }) => { await updateLoan(input.id, { status: "approved", approvedAt: new Date(), chairSignatureUrl: input.chairSignatureUrl, trusteeSignatureUrl: input.trusteeSignatureUrl } as any); return { success: true }; }),
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
    create: adminProcedure
      .input(z.object({ userId: z.number(), month: z.number(), year: z.number(), grossPay: z.string(), incomeTax: z.string().default("0"), nationalInsurance: z.string().default("0"), pensionContribution: z.string().default("0"), otherDeductions: z.string().default("0"), netPay: z.string(), paymentMethod: z.string().default("bank_transfer"), payslipUrl: z.string().optional(), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const totalDeductions = (parseFloat(input.incomeTax) + parseFloat(input.nationalInsurance) + parseFloat(input.pensionContribution) + parseFloat(input.otherDeductions)).toFixed(2);
        const { userId, month, year, grossPay, incomeTax, nationalInsurance, pensionContribution, otherDeductions, netPay, paymentMethod, payslipUrl, notes } = input;
        return createPayrollRecord({ userId, month, year, grossPay, incomeTax: incomeTax ?? "0", nationalInsurance: nationalInsurance ?? "0", pensionContribution: pensionContribution ?? "0", otherDeductions: otherDeductions ?? "0", totalDeductions, netPay, paymentMethod: (paymentMethod as any) ?? "bank_transfer", payslipUrl, notes });
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
