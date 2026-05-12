/**
 * Bills & Utilities Router
 *
 * Manages utility accounts (electricity, gas, water, broadband, etc.) and
 * individual bill records for AQS buildings. Supports anomaly detection,
 * contract renewal alerts, auto-fill into monthly expenses, and editable
 * buildings/categories lists.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { utilityAccounts, utilityBills, utilityBuildings, utilityCategories, supplierContacts, scheduledPayments } from "../../drizzle/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";

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

      // Attach supplier contact details
      const contactIds = Array.from(new Set(rows.map(r => r.supplierContactId).filter(Boolean))) as number[];
      let contactMap: Record<number, any> = {};
      if (contactIds.length > 0) {
        const contacts = await db.select().from(supplierContacts)
          .where(eq(supplierContacts.id, contactIds[0])); // fetch all by iterating
        // Fetch all contacts in one query using IN-like approach
        const allContacts = await db.select().from(supplierContacts);
        contactMap = Object.fromEntries(allContacts.map(c => [c.id, c]));
      }

      // Attach contract expiry warning
      const now = new Date();
      const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      return rows.map(r => ({
        ...r,
        contractExpiringSoon: r.contractEndDate ? new Date(r.contractEndDate) <= in60Days : false,
        contractExpired: r.contractEndDate ? new Date(r.contractEndDate) < now : false,
        supplierContact: r.supplierContactId ? (contactMap[r.supplierContactId] ?? null) : null,
      }));
    }),

  getAccount: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [account] = await db.select().from(utilityAccounts).where(eq(utilityAccounts.id, input.id));
      if (!account) throw new Error("Account not found");

      const bills = await db.select().from(utilityBills)
        .where(eq(utilityBills.accountId, input.id))
        .orderBy(desc(utilityBills.billDate))
        .limit(24);

      const recentBills = bills.slice(0, 3);
      const avg3m = recentBills.length > 0
        ? recentBills.reduce((s, b) => s + parseFloat(b.amount), 0) / recentBills.length
        : null;

      return { account, bills, avg3m };
    }),

  createAccount: protectedProcedure
    .input(z.object({
      building: z.string().min(1),
      supplier: z.string().min(1),
      accountNumber: z.string().optional(),
      category: z.string().min(1),
      tariff: z.string().optional(),
      contractStartDate: z.string().optional(),
      contractEndDate: z.string().optional(),
      mpan: z.string().optional(),
      directDebitAmount: z.string().optional(),
      billingDay: z.number().int().min(1).max(31).optional(),
      notes: z.string().optional(),
      supplierContactId: z.number().optional().nullable(),
      monthlyBudget: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(utilityAccounts).values({
        building: input.building,
        supplier: input.supplier,
        accountNumber: input.accountNumber ?? null,
        category: input.category as any,
        tariff: input.tariff ?? null,
        contractStartDate: input.contractStartDate ? new Date(input.contractStartDate) : null,
        contractEndDate: input.contractEndDate ? new Date(input.contractEndDate) : null,
        mpan: input.mpan ?? null,
        directDebitAmount: input.directDebitAmount ?? null,
        billingDay: input.billingDay ?? null,
        notes: input.notes ?? null,
        supplierContactId: input.supplierContactId ?? null,
        monthlyBudget: input.monthlyBudget ?? null,
      }).$returningId();
      return { id: result.id };
    }),

  updateAccount: protectedProcedure
    .input(z.object({
      id: z.number(),
      building: z.string().optional(),
      supplier: z.string().min(1).optional(),
      accountNumber: z.string().optional(),
      category: z.string().optional(),
      tariff: z.string().optional(),
      contractStartDate: z.string().optional().nullable(),
      contractEndDate: z.string().optional().nullable(),
      mpan: z.string().optional(),
      directDebitAmount: z.string().optional(),
      billingDay: z.number().int().min(1).max(31).optional().nullable(),
      notes: z.string().optional(),
      supplierContactId: z.number().optional().nullable(),
      monthlyBudget: z.string().optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, contractStartDate, contractEndDate, ...rest } = input;
      const updateData: any = {
        ...rest,
        contractStartDate: contractStartDate ? new Date(contractStartDate) : contractStartDate === null ? null : undefined,
        contractEndDate: contractEndDate ? new Date(contractEndDate) : contractEndDate === null ? null : undefined,
      };
      await db.update(utilityAccounts).set(updateData).where(eq(utilityAccounts.id, id));
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
      autoFillExpense: z.boolean().default(true),
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

      // Fetch the account for context
      const [account] = await db.select().from(utilityAccounts).where(eq(utilityAccounts.id, input.accountId)).limit(1);

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
      const billId = result.id;

      // Update lastBillDate and lastBillAmount on the account
      await db.update(utilityAccounts).set({
        lastBillDate: new Date(input.billDate),
        lastBillAmount: input.amount,
      }).where(eq(utilityAccounts.id, input.accountId));

      // ── Auto-fill into monthly expenses ──────────────────────────────────────
      let autoExpenseId: number | null = null;
      if (input.autoFillExpense && account) {
        const { receipts } = await import("../../drizzle/schema");
        const vendor = account.supplier;
        const categoryName = `Bills & Utilities — ${account.category.charAt(0).toUpperCase() + account.category.slice(1)}`;
        const [expResult] = await db.insert(receipts).values({
          userId: ctx.user.id,
          vendor,
          receiptDate: new Date(input.billDate),
          amount: input.amount,
          departmentName: account.building,
          categoryName,
          status: "approved",
          notes: `Auto-filled from Bills & Utilities: ${account.building} — ${account.supplier} (${account.category})${input.notes ? `\n${input.notes}` : ""}`,
          currency: "GBP",
          paymentStatus: "pending",
        } as any);
        autoExpenseId = (expResult as any).insertId as number;

        // Link the bill to the expense
        await db.update(utilityBills)
          .set({ autoExpenseLinkedId: autoExpenseId })
          .where(eq(utilityBills.id, billId));
      }

      return { id: billId, isAnomaly, avg3m: avg3m?.toFixed(2) ?? null, autoExpenseId };
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

      const totalDD = accounts.reduce((s, a) => s + parseFloat(a.directDebitAmount ?? "0"), 0);

      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const allBills = await db.select().from(utilityBills)
        .where(and(gte(utilityBills.billDate, monthStart), lte(utilityBills.billDate, monthEnd)));
      const totalBillsThisMonth = allBills.reduce((s, b) => s + parseFloat(b.amount), 0);

      // Get all unique buildings (static + dynamic)
      const allBuildings = Array.from(new Set(accounts.map(a => a.building)));
      // Next upcoming DD date
      const todayDay = now.getDate();
      const accountsWithDD = accounts.filter(a => a.billingDay && a.directDebitAmount);
      let nextDue: { supplier: string; amount: string; daysAway: number } | null = null;
      if (accountsWithDD.length > 0) {
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const withDays = accountsWithDD.map(a => {
          const day = a.billingDay as number;
          const daysAway = day >= todayDay ? day - todayDay : (daysInMonth - todayDay + day);
          return { supplier: a.supplier, amount: a.directDebitAmount ?? '0', daysAway };
        });
        withDays.sort((a, b) => a.daysAway - b.daysAway);
        nextDue = withDays[0];
      }
      // Upcoming scheduled payments count
      const upcomingPmts = await db.select().from(scheduledPayments)
        .where(and(gte(scheduledPayments.dueDate, now), eq(scheduledPayments.status, 'pending')));
      return {
        totalAccounts: accounts.length,
        expiringSoon: expiringSoon.length,
        expired: expired.length,
        totalMonthlyDD: totalDD.toFixed(2),
        totalBillsThisMonth: totalBillsThisMonth.toFixed(2),
        nextDue,
        upcomingPaymentsCount: upcomingPmts.length,
        byBuilding: allBuildings.map(b => ({
          building: b,
          count: accounts.filter(a => a.building === b).length,
          totalDD: accounts.filter(a => a.building === b).reduce((s, a) => s + parseFloat(a.directDebitAmount ?? "0"), 0).toFixed(2),
        })),
      };
    }),

  // ── Editable Buildings ────────────────────────────────────────────────────────
  listBuildings: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const custom = await db.select().from(utilityBuildings).orderBy(utilityBuildings.name);
    // Merge with static defaults (dedup by name)
    const customNames = new Set(custom.map(b => b.name));
    const defaults = BUILDINGS.filter(b => !customNames.has(b)).map((b, i) => ({
      id: -(i + 1), name: b, address: null, notes: null, isActive: true, createdAt: new Date(),
    }));
    return [...defaults, ...custom];
  }),

  addBuilding: adminProcedure
    .input(z.object({ name: z.string().min(1), address: z.string().optional(), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [r] = await db.insert(utilityBuildings).values({
        name: input.name,
        address: input.address ?? null,
        notes: input.notes ?? null,
        isActive: true,
      }).$returningId();
      return { id: r.id };
    }),

  updateBuilding: adminProcedure
    .input(z.object({ id: z.number().int(), name: z.string().min(1).optional(), address: z.string().optional(), notes: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(utilityBuildings).set(data).where(eq(utilityBuildings.id, id));
      return { success: true };
    }),

  deleteBuilding: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(utilityBuildings).where(eq(utilityBuildings.id, input.id));
      return { success: true };
    }),

  // ── Editable Categories ───────────────────────────────────────────────────────
  listCategories: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const custom = await db.select().from(utilityCategories).orderBy(utilityCategories.name);
    const customNames = new Set(custom.map(c => c.name));
    const CATEGORY_COLOURS: Record<string, string> = {
      electricity: "#f59e0b",
      gas: "#f97316",
      water: "#3b82f6",
      broadband: "#8b5cf6",
      telephone: "#06b6d4",
      insurance: "#10b981",
      other: "#6b7280",
    };
    const defaults = CATEGORIES.filter(c => !customNames.has(c)).map((c, i) => ({
      id: -(i + 1), name: c, colour: CATEGORY_COLOURS[c] ?? "#6b7280", isActive: true, createdAt: new Date(),
    }));
    return [...defaults, ...custom];
  }),

  addCategory: adminProcedure
    .input(z.object({ name: z.string().min(1), colour: z.string().default("#6b7280") }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [r] = await db.insert(utilityCategories).values({
        name: input.name,
        colour: input.colour,
        isActive: true,
      }).$returningId();
      return { id: r.id };
    }),

  updateCategory: adminProcedure
    .input(z.object({ id: z.number().int(), name: z.string().min(1).optional(), colour: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(utilityCategories).set(data).where(eq(utilityCategories.id, id));
      return { success: true };
    }),

  deleteCategory: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(utilityCategories).where(eq(utilityCategories.id, input.id));
      return { success: true };
    }),

  // ── Cash Flow: Generate upcoming scheduled payments ───────────────────────────
  // Generates DD payments for the next 3 months from utility accounts with billingDay set.
  // Also returns any existing scheduled_payments records in the window.
  generateUpcoming: adminProcedure
    .input(z.object({
      months: z.number().int().min(1).max(6).default(3),
    }).optional())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const months = input?.months ?? 3;
      const now = new Date();
      const cutoff = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());

      // Get all accounts with a billingDay and directDebitAmount
      const accounts = await db.select().from(utilityAccounts);
      const ddAccounts = accounts.filter(a => a.billingDay && a.directDebitAmount && parseFloat(a.directDebitAmount) > 0);

      let created = 0;
      for (const account of ddAccounts) {
        const day = account.billingDay!;
        // Generate one entry per month for the next `months` months
        for (let m = 0; m < months; m++) {
          const dueDate = new Date(now.getFullYear(), now.getMonth() + m, day);
          if (dueDate < now) continue; // skip past dates
          if (dueDate > cutoff) break;

          const dueDateStr = dueDate.toISOString().slice(0, 10);
          const description = `${account.supplier} — ${account.category} DD (${account.building})`;

          // Check if already exists (same accountId + dueDate + source=dd)
          const existing = await db.select().from(scheduledPayments)
            .where(and(
              eq(scheduledPayments.accountId, account.id),
              eq(scheduledPayments.source, "dd"),
              eq(scheduledPayments.dueDate, new Date(dueDateStr))
            ))
            .limit(1);

          if (existing.length === 0) {
            await db.insert(scheduledPayments).values({
              source: "dd",
              accountId: account.id,
              description,
              supplier: account.supplier,
              building: account.building,
              utilityType: account.category,
              dueDate: new Date(dueDateStr),
              amount: account.directDebitAmount!,
              status: "pending",
            });
            created++;
          }
        }
      }

      return { created, message: `Generated ${created} new upcoming DD payments` };
    }),

  // List all scheduled payments (pending, paid, held) in a date window
  listScheduled: protectedProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      status: z.enum(["pending", "paid", "held", "all"]).default("all"),
      building: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const now = new Date();
      const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      const defaultTo = new Date(now.getFullYear(), now.getMonth() + 3, 0);

      const fromDate = input?.from ? new Date(input.from) : defaultFrom;
      const toDate = input?.to ? new Date(input.to) : defaultTo;

      let rows = await db.select().from(scheduledPayments)
        .where(and(
          gte(scheduledPayments.dueDate, fromDate),
          lte(scheduledPayments.dueDate, toDate)
        ))
        .orderBy(scheduledPayments.dueDate);

      if (input?.status && input.status !== "all") {
        rows = rows.filter(r => r.status === input.status);
      }
      if (input?.building) {
        rows = rows.filter(r => r.building === input.building);
      }

      return rows;
    }),

  // Mark a scheduled payment as paid
  markScheduledPaid: protectedProcedure
    .input(z.object({ id: z.number(), note: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(scheduledPayments).set({
        status: "paid",
        paidAt: Date.now(),
        paidByUserId: ctx.user.id,
        paidByName: ctx.user.name ?? ctx.user.email ?? "Unknown",
        note: input.note ?? null,
      }).where(eq(scheduledPayments.id, input.id));
      return { success: true };
    }),

  // Mark a scheduled payment as held (requires a note explaining why)
  markScheduledHeld: protectedProcedure
    .input(z.object({ id: z.number(), note: z.string().min(1, "A reason is required when holding a payment") }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(scheduledPayments).set({
        status: "held",
        heldAt: Date.now(),
        heldByUserId: ctx.user.id,
        heldByName: ctx.user.name ?? ctx.user.email ?? "Unknown",
        note: input.note,
      }).where(eq(scheduledPayments.id, input.id));
      return { success: true };
    }),

  // Reset a held/paid payment back to pending
  resetScheduled: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(scheduledPayments).set({
        status: "pending",
        paidAt: null,
        paidByUserId: null,
        paidByName: null,
        heldAt: null,
        heldByUserId: null,
        heldByName: null,
        note: null,
      }).where(eq(scheduledPayments.id, input.id));
      return { success: true };
    }),

  // Update note on a scheduled payment
  updateScheduledNote: protectedProcedure
    .input(z.object({ id: z.number(), note: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(scheduledPayments).set({ note: input.note }).where(eq(scheduledPayments.id, input.id));
      return { success: true };
    }),

  // Per-account payment history: bills + scheduled payments (paid/held/pending)
  paymentHistory: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      limit: z.number().optional().default(100),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Get bills for this account
      const bills = await db.select().from(utilityBills)
        .where(eq(utilityBills.accountId, input.accountId))
        .orderBy(desc(utilityBills.billDate))
        .limit(input.limit);
      // Get scheduled payments linked to this account
      const scheduled = await db.select().from(scheduledPayments)
        .where(eq(scheduledPayments.accountId, input.accountId))
        .orderBy(desc(scheduledPayments.dueDate))
        .limit(input.limit);
      // Merge into a unified timeline sorted by date descending
      const billItems = bills.map(b => ({
        id: `bill-${b.id}`,
        type: "bill" as const,
        date: b.billDate,
        amount: b.amount,
        description: `Bill — ${b.periodStart ? new Date(b.periodStart as any).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : ""} to ${b.periodEnd ? new Date(b.periodEnd as any).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : ""}`.trim(),
        status: "paid" as const,
        note: b.notes ?? null,
        fileUrl: b.billUrl ?? null,
        consumption: b.consumptionUnits ? `${b.consumptionUnits} ${b.unitType ?? ""}`.trim() : null,
        autoExpenseLinkedId: b.autoExpenseLinkedId ?? null,
        rawDate: b.billDate instanceof Date ? b.billDate.getTime() : new Date(b.billDate as any).getTime(),
      }));
      const scheduledItems = scheduled.map(s => ({
        id: `sched-${s.id}`,
        type: "scheduled" as const,
        date: s.dueDate,
        amount: s.amount ?? "0",
        description: s.description ?? "Scheduled Payment",
        status: s.status as "pending" | "paid" | "held",
        note: s.note ?? null,
        fileUrl: null,
        consumption: null,
        autoExpenseLinkedId: null,
        rawDate: s.dueDate instanceof Date ? s.dueDate.getTime() : new Date(s.dueDate as any).getTime(),
        paidAt: s.paidAt ?? null,
        heldAt: s.heldAt ?? null,
      }));
      const merged = [...billItems, ...scheduledItems].sort((a, b) => b.rawDate - a.rawDate);
      return merged;
    }),

  // Add a manual one-off future payment
  addManualScheduled: protectedProcedure
    .input(z.object({
      description: z.string().min(1),
      supplier: z.string().optional(),
      building: z.string().optional(),
      utilityType: z.string().optional(),
      dueDate: z.string(),
      amount: z.string(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [r] = await db.insert(scheduledPayments).values({
        source: "manual",
        description: input.description,
        supplier: input.supplier ?? null,
        building: input.building ?? null,
        utilityType: input.utilityType ?? null,
        dueDate: new Date(input.dueDate),
        amount: input.amount,
        status: "pending",
        note: input.note ?? null,
      }).$returningId();
      return { id: r.id };
    }),
});
