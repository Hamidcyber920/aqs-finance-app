/**
 * Hibba Tools Router — Server-side data queries invoked by the voice agent.
 * All procedures are protected (require auth) and read-only.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getDashboardStats,
  listReceipts,
  getLoans,
  getDonors,
  getPayrollRecords,
  getIncomeRecords,
  getMonthlyTotal,
} from "../db";

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
});
