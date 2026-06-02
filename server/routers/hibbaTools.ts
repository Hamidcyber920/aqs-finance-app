/**
 * Hibba Tools Router — Server-side data queries and actions invoked by the voice agent.
 * All procedures are protected (require auth).
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import {
  getDashboardStats,
  listReceipts,
  listAllReceipts,
  getLoans,
  getLoanById,
  getLoanRepayments,
  getDb,
  getDonors,
  getDonorById,
  getPayrollRecords,
  getIncomeRecords,
  getMonthlyTotal,
  getFundraisingCampaigns,
  getTrustees,
  getFridayCollections,
  listAllUsers,
  getCategoryTotals,
} from "../db";
import { fmtDate } from "../dateUtils";
import {
  getAllTenants,
  getOverdueRentPayments,
  getUpcomingRentDue,
} from "../db.accommodation";
import { TRPCError } from "@trpc/server";

// ─── Shared email helper ──────────────────────────────────────────────────────
async function sendGmail(to: string, name: string, subject: string, htmlBody: string) {
  const nodemailer = await import("nodemailer");
  const { google } = await import("googleapis");
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const { token: accessToken } = await oauth2Client.getAccessToken();
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { type: "OAuth2", user: process.env.GMAIL_FROM_EMAIL, accessToken: accessToken! },
  });
  await transporter.sendMail({
    from: `"AQ Society Finance" <${process.env.GMAIL_FROM_EMAIL}>`,
    to,
    subject,
    html: htmlBody,
  });
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const hibbaToolsRouter = router({
  /**
   * Get a high-level financial summary (total expenses, income, loans, fundraising)
   */
  dashboardSummary: protectedProcedure
    .query(async () => {
      const stats = await getDashboardStats();
      if (!stats) return { error: "Database unavailable" };
      return {
        totalExpenses: stats.totalExpenses,
        expenseCount: stats.expenseCount,
        totalIncome: stats.totalIncome,
        activeLoanTotal: stats.activeLoanTotal,
        activeLoanCount: stats.activeLoanCount,
        fundraisingRaised: stats.fundraisingRaised,
        fundraisingTarget: stats.fundraisingTarget,
        pendingApprovals: stats.pendingApprovals,
      };
    }),

  /**
   * Query receipts/expenses with optional filters
   */
  queryReceipts: protectedProcedure
    .input(z.object({
      vendor: z.string().optional(),
      status: z.enum(["pending", "approved", "rejected"]).optional(),
      limit: z.number().min(1).max(20).default(5),
    }).optional())
    .query(async ({ input, ctx }) => {
      const filter = {
        userId: ctx.user.id,
        vendor: input?.vendor,
        status: input?.status,
        limit: input?.limit ?? 5,
      };
      const { rows, total } = await listReceipts(filter);
      return {
        total,
        receipts: rows.slice(0, input?.limit ?? 5).map(r => ({
          id: r.id,
          vendor: r.vendor,
          amount: r.amount,
          category: r.categoryName,
          department: r.departmentName,
          status: r.status,
          date: r.receiptDate,
          notes: r.notes,
        })),
      };
    }),

  /**
   * Get monthly expense total for the current user
   */
  monthlyExpenseTotal: protectedProcedure
    .input(z.object({
      year: z.number(),
      month: z.number().min(1).max(12),
    }))
    .query(async ({ input, ctx }) => {
      const total = await getMonthlyTotal(ctx.user.id, input.year, input.month);
      return { year: input.year, month: input.month, total };
    }),

  /**
   * Query loans with optional status filter
   */
  queryLoans: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      limit: z.number().min(1).max(10).default(5),
    }).optional())
    .query(async ({ input }) => {
      const loans = await getLoans(input?.status);
      const limited = loans.slice(0, input?.limit ?? 5);
      return {
        total: loans.length,
        loans: limited.map(l => ({
          id: l.id,
          borrowerName: l.borrowerName,
          amount: l.amount,
          status: l.status,
          purpose: l.purpose,
          monthlyRepayment: l.monthlyRepayment,
          totalRepaid: l.totalRepaid,
          startDate: l.startDate,
        })),
      };
    }),

  /**
   * Get detailed info for a specific loan by ID or borrower name search
   */
  getLoanDetails: protectedProcedure
    .input(z.object({
      loanId: z.number().optional(),
      borrowerName: z.string().optional(),
    }))
    .query(async ({ input }) => {
      if (input.loanId) {
        const loan = await getLoanById(input.loanId);
        if (!loan) return { error: "Loan not found" };
        const repayments = await getLoanRepayments(loan.id);
        const outstanding = Math.max(0, parseFloat(String(loan.amount)) - parseFloat(String(loan.totalRepaid ?? 0)));
        return {
          id: loan.id,
          borrowerName: loan.borrowerName,
          borrowerEmail: loan.borrowerEmail,
          borrowerPhone: loan.borrowerPhone,
          amount: loan.amount,
          totalRepaid: loan.totalRepaid,
          outstanding,
          status: loan.status,
          purpose: loan.purpose,
          startDate: loan.startDate,
          endDate: loan.endDate,
          monthlyRepayment: loan.monthlyRepayment,
          repaymentCount: repayments.length,
          lastRepaymentDate: loan.lastRepaymentDate,
        };
      }
      if (input.borrowerName) {
        const all = await getLoans();
        const match = all.filter(l =>
          l.borrowerName?.toLowerCase().includes(input.borrowerName!.toLowerCase())
        );
        return {
          total: match.length,
          loans: match.slice(0, 5).map(l => ({
            id: l.id,
            borrowerName: l.borrowerName,
            amount: l.amount,
            totalRepaid: l.totalRepaid,
            outstanding: Math.max(0, parseFloat(String(l.amount)) - parseFloat(String(l.totalRepaid ?? 0))),
            status: l.status,
          })),
        };
      }
      return { error: "Provide loanId or borrowerName" };
    }),

  /**
   * Get repayment history for a specific loan
   */
  getLoanRepayments: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .query(async ({ input }) => {
      const loan = await getLoanById(input.loanId);
      if (!loan) return { error: "Loan not found" };
      const repayments = await getLoanRepayments(input.loanId);
      const totalRepaid = repayments.reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
      const outstanding = Math.max(0, parseFloat(String(loan.amount)) - totalRepaid);
      return {
        loanId: input.loanId,
        borrowerName: loan.borrowerName,
        loanAmount: loan.amount,
        totalRepaid,
        outstanding,
        repaymentCount: repayments.length,
        repayments: repayments.slice(0, 10).map(r => ({
          id: r.id,
          amount: r.amount,
          paidAt: r.paidAt,
          paymentMethod: r.paymentMethod,
          status: r.status,
          notes: r.notes,
        })),
      };
    }),

  /**
   * Get all loans with overdue repayments
   */
  getOverdueLoans: protectedProcedure
    .query(async () => {
      const loans = await getLoans("active");
      if (!loans.length) return { total: 0, overdueLoans: [] };
      const now = new Date();
      // Batch fetch all repayments in a single query instead of N+1
      const db = await getDb();
      if (!db) return { total: 0, overdueLoans: [] };
      const { loanRepayments } = await import("../../drizzle/schema");
      const { inArray, isNull } = await import("drizzle-orm");
      const loanIds = loans.map(l => l.id);
      const allRepayments = await db
        .select()
        .from(loanRepayments)
        .where(inArray(loanRepayments.loanId, loanIds));
      // Group by loanId in memory
      const repByLoan = new Map<number, typeof allRepayments>();
      for (const r of allRepayments) {
        const arr = repByLoan.get(r.loanId) ?? [];
        arr.push(r);
        repByLoan.set(r.loanId, arr);
      }
      const overdue = [];
      for (const loan of loans) {
        const repayments = repByLoan.get(loan.id) ?? [];
        const overdueReps = repayments.filter((r: any) =>
          !r.trusteeApprovedAt && r.dueDate && new Date(r.dueDate) < now
        );
        if (overdueReps.length > 0) {
          const overdueTotal = overdueReps.reduce((s: number, r: any) => s + parseFloat(String(r.amount ?? 0)), 0);
          overdue.push({
            id: loan.id,
            borrowerName: loan.borrowerName,
            borrowerEmail: loan.borrowerEmail,
            loanAmount: loan.amount,
            overdueCount: overdueReps.length,
            overdueTotal,
          });
        }
      }
      return { total: overdue.length, overdueLoans: overdue };
    }),

  /**
   * Get expense breakdown by category for a given month
   */
  getExpensesByCategory: protectedProcedure
    .input(z.object({
      year: z.number(),
      month: z.number().min(1).max(12),
    }))
    .query(async ({ input, ctx }) => {
      const dateFrom = new Date(input.year, input.month - 1, 1);
      const dateTo = new Date(input.year, input.month, 0, 23, 59, 59);
      const totals = await getCategoryTotals(ctx.user.id, dateFrom, dateTo);
      const grandTotal = totals.reduce((s, t) => s + Number(t.total), 0);
      return {
        year: input.year,
        month: input.month,
        grandTotal,
        categories: totals.map(t => ({
          category: t.categoryName || "Uncategorised",
          total: Number(t.total),
          count: Number(t.count),
        })),
      };
    }),

  /**
   * Get all-user expense breakdown by category (admin view)
   */
  getExpensesByCategoryAdmin: adminProcedure
    .input(z.object({
      year: z.number(),
      month: z.number().min(1).max(12),
    }))
    .query(async ({ input }) => {
      const dateFrom = new Date(input.year, input.month - 1, 1);
      const dateTo = new Date(input.year, input.month, 0, 23, 59, 59);
      const { rows } = await listAllReceipts({
        allUsers: true,
        dateFrom,
        dateTo,
        status: "approved",
        limit: 500,
      });
      // Aggregate by category
      const byCategory: Record<string, { total: number; count: number }> = {};
      for (const r of rows) {
        const cat = r.categoryName || "Uncategorised";
        if (!byCategory[cat]) byCategory[cat] = { total: 0, count: 0 };
        byCategory[cat].total += parseFloat(String(r.amount ?? 0));
        byCategory[cat].count++;
      }
      const categories = Object.entries(byCategory)
        .map(([category, v]) => ({ category, total: v.total, count: v.count }))
        .sort((a, b) => b.total - a.total);
      const grandTotal = categories.reduce((s, c) => s + c.total, 0);
      return { year: input.year, month: input.month, grandTotal, categories };
    }),

  /**
   * Get income breakdown by month
   */
  getIncomeByMonth: protectedProcedure
    .input(z.object({
      year: z.number(),
      month: z.number().min(1).max(12),
    }))
    .query(async ({ input }) => {
      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 0, 23, 59, 59);
      const records = await getIncomeRecords({ startDate, endDate, limit: 100 });
      const paid = records.filter(r => r.paymentStatus === "paid");
      const pending = records.filter(r => r.paymentStatus !== "paid");
      const totalPaid = paid.reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
      const totalPending = pending.reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
      return {
        year: input.year,
        month: input.month,
        totalPaid,
        totalPending,
        recordCount: records.length,
        records: records.slice(0, 10).map(r => ({
          id: r.id,
          amount: r.amount,
          paymentStatus: r.paymentStatus,
          period: r.period,
          notes: r.notes,
        })),
      };
    }),

  /**
   * Query donors
   */
  queryDonors: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      isRegular: z.boolean().optional(),
      limit: z.number().min(1).max(10).default(5),
    }).optional())
    .query(async ({ input }) => {
      const donors = await getDonors({
        search: input?.search,
        isRegular: input?.isRegular,
        limit: input?.limit ?? 5,
      });
      return {
        total: donors.length,
        donors: donors.map(d => ({
          id: d.id,
          name: d.name,
          email: d.email,
          totalGiven: d.totalGiven,
          isRegular: d.isRegular,
          lastGiftDate: d.lastGiftDate,
        })),
      };
    }),

  /**
   * Search donors by name or ID
   */
  searchDonors: protectedProcedure
    .input(z.object({
      nameOrId: z.string(),
      limit: z.number().min(1).max(10).default(5),
    }))
    .query(async ({ input }) => {
      const numId = parseInt(input.nameOrId);
      if (!isNaN(numId)) {
        const donor = await getDonorById(numId);
        if (donor) return { total: 1, donors: [{ id: donor.id, name: donor.name, email: donor.email, phone: (donor as any).phone, totalGiven: donor.totalGiven, isRegular: donor.isRegular, giftAidDeclared: (donor as any).giftAidDeclared ?? false }] };
      }
      const donors = await getDonors({ search: input.nameOrId, limit: input.limit });
      return {
        total: donors.length,
        donors: donors.map(d => ({
          id: d.id,
          name: d.name,
          email: d.email,
          phone: (d as any).phone,
          totalGiven: d.totalGiven,
          isRegular: d.isRegular,
          giftAidDeclared: (d as any).giftAidDeclared ?? false,
        })),
      };
    }),

  /**
   * Query payroll records
   */
  queryPayroll: protectedProcedure
    .input(z.object({
      month: z.number().min(1).max(12).optional(),
      year: z.number().optional(),
      limit: z.number().min(1).max(10).default(5),
    }).optional())
    .query(async ({ input }) => {
      const month = input?.month ?? new Date().getMonth() + 1;
      const year = input?.year ?? new Date().getFullYear();
      const records = await getPayrollRecords(undefined, year, month);
      const limited = records.slice(0, input?.limit ?? 5);
      const totalGross = records.reduce((s, r) => s + Number(r.grossPay ?? 0), 0);
      const totalNet = records.reduce((s, r) => s + Number(r.netPay ?? 0), 0);
      return {
        month,
        year,
        employeeCount: records.length,
        totalGross,
        totalNet,
        records: limited.map(r => ({
          displayName: r.displayName,
          grossPay: r.grossPay,
          netPay: r.netPay,
          paymentMethod: r.paymentMethod,
          paymentStatus: r.paymentStatus,
        })),
      };
    }),

  /**
   * Get prayer times for Liverpool from Aladhan API
   */
  prayerTimes: protectedProcedure
    .query(async () => {
      try {
        const ukDateStr = fmtDate(new Date());
        const [dd, mm, yyyy] = ukDateStr.split("/");
        const res = await fetch(
          `https://api.aladhan.com/v1/timingsByCity/${dd}-${mm}-${yyyy}?city=Liverpool&country=United+Kingdom&method=2`
        );
        const json = await res.json();
        if (json.code === 200 && json.data?.timings) {
          const t = json.data.timings;
          return {
            fajr: t.Fajr,
            sunrise: t.Sunrise,
            dhuhr: t.Dhuhr,
            asr: t.Asr,
            maghrib: t.Maghrib,
            isha: t.Isha,
            date: json.data.date?.readable || `${dd}-${mm}-${yyyy}`,
            hijriDate: json.data.date?.hijri?.date || null,
          };
        }
        return { error: "Could not fetch prayer times" };
      } catch (e: any) {
        return { error: e?.message || "Prayer times API unavailable" };
      }
    }),

  /**
   * Get fundraising campaigns
   */
  fundraisingCampaigns: protectedProcedure
    .query(async () => {
      const campaigns = await getFundraisingCampaigns();
      return {
        total: campaigns.length,
        campaigns: campaigns.slice(0, 10).map((c: any) => ({
          id: c.id,
          name: c.name,
          targetAmount: c.targetAmount,
          currentAmount: c.currentAmount,
          status: c.status,
          startDate: c.startDate,
          endDate: c.endDate,
        })),
      };
    }),

  /**
   * Get trustees list
   */
  trustees: protectedProcedure
    .query(async () => {
      const trustees = await getTrustees(true);
      return {
        total: trustees.length,
        trustees: trustees.map((t: any) => ({
          id: t.id,
          name: t.name,
          role: t.role,
          email: t.email,
          phone: t.phone,
          status: t.status,
        })),
      };
    }),

  /**
   * Get Friday collections
   */
  fridayCollections: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(20).default(5),
    }).optional())
    .query(async ({ input }) => {
      const collections = await getFridayCollections(input?.limit ?? 5);
      return {
        total: collections.length,
        collections: collections.map((c: any) => ({
          id: c.id,
          date: c.date,
          amount: c.amount,
          notes: c.notes,
        })),
      };
    }),

  /**
   * Get staff directory
   */
  staffDirectory: protectedProcedure
    .query(async () => {
      const { rows, total } = await listAllUsers(50, 0);
      return {
        total,
        staff: rows.map((u: any) => ({
          id: u.id,
          name: u.fullName || u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
        })),
      };
    }),

  /**
   * Get current user identity and role
   */
  getCurrentUser: protectedProcedure
    .query(async ({ ctx }) => {
      return {
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
        role: ctx.user.role,
      };
    }),

  /**
   * Get accommodation status — tenants, overdue rent, upcoming rent
   */
  accommodationStatus: protectedProcedure
    .query(async () => {
      try {
        const tenants = await getAllTenants();
        const overdue = await getOverdueRentPayments();
        const upcoming = await getUpcomingRentDue(7);
        const activeTenants = tenants.filter((t: any) => t.status === "active");
        return {
          totalTenants: tenants.length,
          activeTenants: activeTenants.length,
          overduePayments: overdue.length,
          overdueTotal: overdue.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0),
          upcomingDue: upcoming.length,
          tenants: activeTenants.slice(0, 10).map((t: any) => ({
            name: t.fullName || t.name,
            room: t.roomNumber,
            monthlyRent: t.monthlyRent,
            status: t.status,
          })),
        };
      } catch {
        return { error: "Accommodation data unavailable" };
      }
    }),

  /**
   * Get strategic briefing — combines dashboard, urgent items, prayer times
   */
  strategicBriefing: protectedProcedure
    .query(async ({ ctx }) => {
      const stats = await getDashboardStats();
      const loans = await getLoans("active");
      const campaigns = await getFundraisingCampaigns();
      const activeCampaigns = campaigns.filter((c: any) => c.status === "active");
      let prayerTimes = null;
      try {
        const ukDateStr = fmtDate(new Date());
        const [dd, mm, yyyy] = ukDateStr.split("/");
        const res = await fetch(`https://api.aladhan.com/v1/timingsByCity/${dd}-${mm}-${yyyy}?city=Liverpool&country=United+Kingdom&method=2`);
        const json = await res.json();
        if (json.code === 200) prayerTimes = json.data?.timings;
      } catch { /* ignore */ }
      return {
        user: { name: ctx.user.name, role: ctx.user.role },
        financials: stats ? {
          totalExpenses: stats.totalExpenses,
          totalIncome: stats.totalIncome,
          activeLoanTotal: stats.activeLoanTotal,
          activeLoanCount: stats.activeLoanCount,
          pendingApprovals: stats.pendingApprovals,
        } : null,
        activeLoans: loans.length,
        activeCampaigns: activeCampaigns.length,
        campaignHighlights: activeCampaigns.slice(0, 3).map((c: any) => ({
          name: c.name,
          raised: c.currentAmount,
          target: c.targetAmount,
        })),
        prayerTimes: prayerTimes ? {
          fajr: prayerTimes.Fajr,
          dhuhr: prayerTimes.Dhuhr,
          asr: prayerTimes.Asr,
          maghrib: prayerTimes.Maghrib,
          isha: prayerTimes.Isha,
        } : null,
      };
    }),

  /**
   * Query income records
   */
  queryIncome: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(10).default(5),
    }).optional())
    .query(async ({ input }) => {
      const records = await getIncomeRecords({ limit: input?.limit ?? 5 });
      const totalPaid = records.reduce((s, r) => s + (r.paymentStatus === "paid" ? Number(r.amount ?? 0) : 0), 0);
      return {
        total: records.length,
        totalPaidAmount: totalPaid,
        records: records.map(r => ({
          id: r.id,
          tenantName: r.tenantName,
          amount: r.amount,
          paymentStatus: r.paymentStatus,
          period: r.period,
          notes: r.notes,
        })),
      };
    }),

  /**
   * Send a loan reminder email to a borrower (admin only)
   */
  sendLoanReminderEmail: adminProcedure
    .input(z.object({
      loanId: z.number(),
      type: z.enum(["reminder", "overdue"]).default("reminder"),
    }))
    .mutation(async ({ input }) => {
      const loan = await getLoanById(input.loanId);
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      if (!loan.borrowerEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "Borrower has no email on file" });
      const firstName = (loan.borrowerName ?? "").split(" ")[0];
      const remaining = Math.max(0, parseFloat(String(loan.amount)) - parseFloat(String((loan as any).totalRepaid ?? 0)));
      const baseStyle = `font-family:Arial,sans-serif;max-width:600px;margin:0 auto`;
      const header = `<div style="background:#5C1A1A;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Amanah — Rimmers Building Project</p></div>`;
      const footer = `<div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">JazakAllahu Khayran — AQ Society Finance System</div>`;
      const subject = input.type === "overdue"
        ? `Project Milestone Update — Outstanding Amanah Balance — AQ Society`
        : `Project Milestone Update — Qarde Hasan Amanah — AQ Society`;
      const htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px"><p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p><p>May Allah (SWT) bless you and your family abundantly. We are writing to provide a project milestone update on your Qarde Hasan Amanah for the <strong>Rimmers Building Project</strong>.</p><p>The outstanding balance on your Amanah is currently <strong>&pound;${remaining.toFixed(2)}</strong>. We kindly request that you arrange payment at your earliest convenience. If you have already made payment, please disregard this message, and JazakAllahu Khayran.</p><p>Your generosity is a pillar of this House of Allah — the Prophet (PBUH) said: <em>"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah."</em></p><p>JazakAllahu Khayran,<br><strong>AQ Society Finance Team</strong><br><em>Abdullah Quilliam Society</em></p></div>${footer}</div>`;
      try {
        await sendGmail(loan.borrowerEmail, loan.borrowerName ?? "", subject, htmlBody);
        return { success: true, sentTo: loan.borrowerEmail, borrowerName: loan.borrowerName };
      } catch (e: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Email failed: ${e?.message ?? String(e)}` });
      }
    }),

  /**
   * Send a repayment confirmation email for a specific repayment (admin only)
   */
  sendRepaymentConfirmationEmail: adminProcedure
    .input(z.object({ repaymentId: z.number() }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("../db");
      const { loanRepayments } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rep] = await db.select().from(loanRepayments).where(eq(loanRepayments.id, input.repaymentId));
      if (!rep) throw new TRPCError({ code: "NOT_FOUND", message: "Repayment not found" });
      const loan = await getLoanById((rep as any).loanId);
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      if (!loan.borrowerEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "Borrower has no email on file" });
      const firstName = (loan.borrowerName ?? "").split(" ")[0];
      const amount = parseFloat(String(rep.amount ?? 0)).toFixed(2);
      const baseStyle = `font-family:Arial,sans-serif;max-width:600px;margin:0 auto`;
      const header = `<div style="background:#5C1A1A;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1><p style="color:#c9a84c;margin:4px 0 0">Qarde Hasan Amanah — Rimmers Building Project</p></div>`;
      const footer = `<div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">JazakAllahu Khayran — AQ Society Finance System</div>`;
      const htmlBody = `<div style="${baseStyle}">${header}<div style="padding:24px"><p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName},</p><p>We are pleased to confirm receipt of your repayment of <strong>&pound;${amount}</strong> towards your Qarde Hasan Amanah for the <strong>Rimmers Building Project</strong>.</p><p>JazakAllahu Khayran for your continued generosity and trust in the AQ Society. May Allah (SWT) accept this as Sadaqah Jariyah.</p><p>Warm Islamic greetings,<br><strong>AQ Society Finance Team</strong><br><em>Abdullah Quilliam Society</em></p></div>${footer}</div>`;
      try {
        await sendGmail(loan.borrowerEmail, loan.borrowerName ?? "", `Qarde Hasan Amanah — Repayment Confirmation £${amount} — AQ Society`, htmlBody);
        return { success: true, sentTo: loan.borrowerEmail, borrowerName: loan.borrowerName, amount };
      } catch (e: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Email failed: ${e?.message ?? String(e)}` });
      }
    }),

  /**
   * Generate the monthly close report (admin only) — returns PDF URL
   */
  generateMonthlyReport: adminProcedure
    .input(z.object({
      year: z.number().int().min(2020).max(2030),
      month: z.number().int().min(1).max(12),
      sendToTrustees: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      // Delegate to the trusteeFinance router's generateMonthlyCloseReport
      // We re-use the same logic by calling it via the shared db helpers
      const { getDashboardStats, listAllReceipts } = await import("../db");
      const dateFrom = new Date(input.year, input.month - 1, 1);
      const dateTo = new Date(input.year, input.month, 0, 23, 59, 59);
      const stats = await getDashboardStats(dateFrom, dateTo);
      const { rows: expenseRows } = await listAllReceipts({ allUsers: true, dateFrom, dateTo, limit: 500 });
      const monthName = new Date(input.year, input.month - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
      const totalExpenses = expenseRows.filter(r => ["approved", "processed"].includes(r.status)).reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
      const pendingCount = expenseRows.filter(r => ["pending", "processing"].includes(r.status)).length;
      // Return summary (full PDF generation is available via the Trustee Finance page)
      return {
        success: true,
        period: monthName,
        totalExpenses,
        totalIncome: stats?.totalIncome ?? 0,
        pendingApprovals: pendingCount,
        message: `Monthly report summary for ${monthName} is ready. For the full PDF, go to Trustee Finance → Generate Report.`,
      };
    }),

  /**
   * Get pending expense approvals (admin view)
   */
  getPendingApprovals: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(20).default(10),
    }).optional())
    .query(async ({ input }) => {
      const { rows, total } = await listAllReceipts({ allUsers: true, status: "pending", limit: input?.limit ?? 10 });
      return {
        total,
        receipts: rows.map(r => ({
          id: r.id,
          vendor: r.vendor,
          amount: r.amount,
          category: r.categoryName,
          submittedBy: r.submitterFullName || r.submitterName,
          date: r.receiptDate,
          notes: r.notes,
        })),
      };
    }),
});
