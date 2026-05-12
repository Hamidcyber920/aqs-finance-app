/**
 * Bills & Utilities Router
 *
 * Manages utility accounts (electricity, gas, water, broadband, etc.) and
 * individual bill records for AQS buildings. Supports anomaly detection
 * (comparing current bill to 3-month average) and contract renewal alerts.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { utilityAccounts, utilityBills } from "../../drizzle/schema";
import { eq, desc, and, gte, lte, avg, sql } from "drizzle-orm";

const BUILDINGS = ["QLH", "Bistro", "Accommodation", "Other"] as const;
const CATEGORIES = ["electricity", "gas", "water", "broadband", "telephone", "insurance", "other"] as const;

export const billsRouter = router({
  // ── Utility Accounts ─────────────────────────────────────────────────────────
  listAccounts: protectedProcedure
    .input(z.object({
      building: z.string().optional(),
      category: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      let rows = await db.select().from(utilityAccounts).orderBy(utilityAccounts.building, utilityAccounts.category);
      if (input?.building) rows = rows.filter(r => r.building === input.building);
      if (input?.category) rows = rows.filter(r => r.category === input.category);

      // Attach contract expiry warning
      const now = new Date();
      const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      return rows.map(r => ({
        ...r,
        contractExpiringSoon: r.contractEndDate ? new Date(r.contractEndDate) <= in60Days : false,
        contractExpired: r.contractEndDate ? new Date(r.contractEndDate) < now : false,
      }));
    }),

  getAccount: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [account] = await db.select().from(utilityAccounts).where(eq(utilityAccounts.id, input.id));
      if (!account) throw new Error("Account not found");

      // Get bills for this account
      const bills = await db.select().from(utilityBills)
        .where(eq(utilityBills.accountId, input.id))
        .orderBy(desc(utilityBills.billDate))
        .limit(24);

      // Calculate 3-month average for anomaly detection
      const recentBills = bills.slice(0, 3);
      const avg3m = recentBills.length > 0
        ? recentBills.reduce((s, b) => s + parseFloat(b.amount), 0) / recentBills.length
        : null;

      return { account, bills, avg3m };
    }),

  createAccount: protectedProcedure
    .input(z.object({
      building: z.enum(BUILDINGS),
      supplier: z.string().min(1),
      accountNumber: z.string().optional(),
      category: z.enum(CATEGORIES),
      tariff: z.string().optional(),
      contractStartDate: z.string().optional(),
      contractEndDate: z.string().optional(),
      mpan: z.string().optional(),
      directDebitAmount: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(utilityAccounts).values({
        building: input.building,
        supplier: input.supplier,
        accountNumber: input.accountNumber ?? null,
        category: input.category,
        tariff: input.tariff ?? null,
        contractStartDate: input.contractStartDate ? new Date(input.contractStartDate) : null,
        contractEndDate: input.contractEndDate ? new Date(input.contractEndDate) : null,
        mpan: input.mpan ?? null,
        directDebitAmount: input.directDebitAmount ?? null,
        notes: input.notes ?? null,
      }).$returningId();
      return { id: result.id };
    }),

  updateAccount: protectedProcedure
    .input(z.object({
      id: z.number(),
      building: z.enum(BUILDINGS).optional(),
      supplier: z.string().min(1).optional(),
      accountNumber: z.string().optional(),
      category: z.enum(CATEGORIES).optional(),
      tariff: z.string().optional(),
      contractStartDate: z.string().optional().nullable(),
      contractEndDate: z.string().optional().nullable(),
      mpan: z.string().optional(),
      directDebitAmount: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, contractStartDate, contractEndDate, ...rest } = input;
      await db.update(utilityAccounts).set({
        ...rest,
        contractStartDate: contractStartDate ? new Date(contractStartDate) : contractStartDate === null ? null : undefined,
        contractEndDate: contractEndDate ? new Date(contractEndDate) : contractEndDate === null ? null : undefined,
      }).where(eq(utilityAccounts.id, id));
      return { success: true };
    }),

  deleteAccount: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(utilityBills).where(eq(utilityBills.accountId, input.id));
      await db.delete(utilityAccounts).where(eq(utilityAccounts.id, input.id));
      return { success: true };
    }),

  // ── Utility Bills ─────────────────────────────────────────────────────────────
  listBills: protectedProcedure
    .input(z.object({
      accountId: z.number().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().optional().default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      let rows = await db.select().from(utilityBills)
        .orderBy(desc(utilityBills.billDate))
        .limit(input?.limit ?? 50);
      if (input?.accountId) rows = rows.filter(r => r.accountId === input.accountId);
      return rows;
    }),

  addBill: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      billDate: z.string(),
      periodStart: z.string().optional(),
      periodEnd: z.string().optional(),
      amount: z.string(),
      consumptionUnits: z.string().optional(),
      unitType: z.string().optional(),
      billUrl: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Anomaly detection: compare to 3-month average
      const recentBills = await db.select().from(utilityBills)
        .where(eq(utilityBills.accountId, input.accountId))
        .orderBy(desc(utilityBills.billDate))
        .limit(3);
      const avg3m = recentBills.length > 0
        ? recentBills.reduce((s, b) => s + parseFloat(b.amount), 0) / recentBills.length
        : null;
      const currentAmount = parseFloat(input.amount);
      const isAnomaly = avg3m !== null && currentAmount > avg3m * 1.5;

      const [result] = await db.insert(utilityBills).values({
        accountId: input.accountId,
        billDate: new Date(input.billDate),
        periodStart: input.periodStart ? new Date(input.periodStart) : null,
        periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
        amount: input.amount,
        consumptionUnits: input.consumptionUnits ?? null,
        unitType: input.unitType ?? null,
        billUrl: input.billUrl ?? null,
        notes: input.notes ?? null,
        uploadedById: ctx.user.id,
      }).$returningId();

      // Update lastBillDate and lastBillAmount on the account
      await db.update(utilityAccounts).set({
        lastBillDate: new Date(input.billDate),
        lastBillAmount: input.amount,
      }).where(eq(utilityAccounts.id, input.accountId));

      return { id: result.id, isAnomaly, avg3m: avg3m?.toFixed(2) ?? null };
    }),

  deleteBill: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(utilityBills).where(eq(utilityBills.id, input.id));
      return { success: true };
    }),

  // ── Summary ───────────────────────────────────────────────────────────────────
  summary: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const accounts = await db.select().from(utilityAccounts);
      const now = new Date();
      const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

      const expiringSoon = accounts.filter(a => a.contractEndDate && new Date(a.contractEndDate) <= in60Days && new Date(a.contractEndDate) >= now);
      const expired = accounts.filter(a => a.contractEndDate && new Date(a.contractEndDate) < now);

      // Total monthly direct debit
      const totalDD = accounts.reduce((s, a) => s + parseFloat(a.directDebitAmount ?? "0"), 0);

      // Bills this month
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const allBills = await db.select().from(utilityBills)
        .where(and(gte(utilityBills.billDate, monthStart), lte(utilityBills.billDate, monthEnd)));
      const totalBillsThisMonth = allBills.reduce((s, b) => s + parseFloat(b.amount), 0);

      return {
        totalAccounts: accounts.length,
        expiringSoon: expiringSoon.length,
        expired: expired.length,
        totalMonthlyDD: totalDD.toFixed(2),
        totalBillsThisMonth: totalBillsThisMonth.toFixed(2),
        byBuilding: BUILDINGS.map(b => ({
          building: b,
          count: accounts.filter(a => a.building === b).length,
          totalDD: accounts.filter(a => a.building === b).reduce((s, a) => s + parseFloat(a.directDebitAmount ?? "0"), 0).toFixed(2),
        })),
      };
    }),
});
