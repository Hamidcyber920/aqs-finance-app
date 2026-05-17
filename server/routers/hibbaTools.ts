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
  getDonorById,
  getPayrollRecords,
  getIncomeRecords,
  getMonthlyTotal,
  getFundraisingCampaigns,
  getTrustees,
  getFridayCollections,
  listAllUsers,
} from "../db";
import {
  getAllTenants,
  getOverdueRentPayments,
  getUpcomingRentDue,
} from "../db.accommodation";

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
   * Get prayer times for Liverpool from Aladhan API
   */
  prayerTimes: protectedProcedure
    .query(async () => {
      try {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, "0");
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const yyyy = today.getFullYear();
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
   * Search donors by name
   */
  searchDonors: protectedProcedure
    .input(z.object({
      nameOrId: z.string(),
      limit: z.number().min(1).max(10).default(5),
    }))
    .query(async ({ input }) => {
      // Try numeric ID first
      const numId = parseInt(input.nameOrId);
      if (!isNaN(numId)) {
        const donor = await getDonorById(numId);
        if (donor) return { total: 1, donors: [{ id: donor.id, name: donor.name, email: donor.email, phone: (donor as any).phone, totalGiven: donor.totalGiven, isRegular: donor.isRegular, giftAidDeclared: (donor as any).giftAidDeclared ?? false }] };
      }
      // Search by name
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
      // Prayer times
      let prayerTimes = null;
      try {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, "0");
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const yyyy = today.getFullYear();
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
});
