/**
 * Bistro 87 - Restaurant/Cafe Management Router
 * Handles menu items, orders, order items, and daily revenue totals.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  bistroMenuItems,
  bistroOrders,
  bistroOrderItems,
  bistroDailyTotals,
} from "../../drizzle/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

export const bistroRouter = router({
  // ─── MENU ──────────────────────────────────────────────────────────────────
  listMenuItems: protectedProcedure
    .input(z.object({ category: z.string().optional(), availableOnly: z.boolean().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      let q = db.select().from(bistroMenuItems);
      const conditions = [];
      if (input.availableOnly) conditions.push(eq(bistroMenuItems.isAvailable, true));
      if (conditions.length) q = (q as any).where(and(...conditions));
      return (q as any).orderBy(bistroMenuItems.category, bistroMenuItems.sortOrder);
    }),

  addMenuItem: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      category: z.string().default("Main"),
      description: z.string().optional(),
      price: z.number().positive(),
      costPrice: z.number().optional(),
      isAvailable: z.boolean().default(true),
      isHalal: z.boolean().default(true),
      allergens: z.string().optional(),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.insert(bistroMenuItems).values({
        name: input.name,
        category: input.category,
        description: input.description,
        price: String(input.price),
        costPrice: input.costPrice ? String(input.costPrice) : null,
        isAvailable: input.isAvailable,
        isHalal: input.isHalal,
        allergens: input.allergens,
        sortOrder: input.sortOrder,
      });
      return { success: true };
    }),

  updateMenuItem: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      category: z.string().optional(),
      description: z.string().optional(),
      price: z.number().optional(),
      costPrice: z.number().optional(),
      isAvailable: z.boolean().optional(),
      isHalal: z.boolean().optional(),
      allergens: z.string().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, price, costPrice, ...rest } = input;
      const updates: any = { ...rest };
      if (price !== undefined) updates.price = String(price);
      if (costPrice !== undefined) updates.costPrice = String(costPrice);
      await db.update(bistroMenuItems).set(updates).where(eq(bistroMenuItems.id, id));
      return { success: true };
    }),

  deleteMenuItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(bistroMenuItems).where(eq(bistroMenuItems.id, input.id));
      return { success: true };
    }),

  // ─── ORDERS ────────────────────────────────────────────────────────────────
  listOrders: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      limit: z.number().default(100),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [];
      if (input.status) conditions.push(eq(bistroOrders.status as any, input.status));
      if (input.dateFrom) conditions.push(gte(bistroOrders.createdAt, new Date(input.dateFrom)));
      if (input.dateTo) conditions.push(lte(bistroOrders.createdAt, new Date(input.dateTo)));
      let q = db.select().from(bistroOrders);
      if (conditions.length) q = (q as any).where(and(...conditions));
      return (q as any).orderBy(desc(bistroOrders.createdAt)).limit(input.limit);
    }),

  getOrderWithItems: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [order] = await db.select().from(bistroOrders).where(eq(bistroOrders.id, input.id));
      if (!order) return null;
      const items = await db.select().from(bistroOrderItems).where(eq(bistroOrderItems.orderId, input.id));
      return { ...order, items };
    }),

  createOrder: protectedProcedure
    .input(z.object({
      tableNumber: z.string().optional(),
      customerName: z.string().optional(),
      orderType: z.enum(["dine_in", "takeaway", "delivery", "event_catering"]).default("dine_in"),
      notes: z.string().optional(),
      items: z.array(z.object({
        menuItemId: z.number(),
        itemName: z.string(),
        quantity: z.number().positive(),
        unitPrice: z.number().positive(),
        notes: z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const orderRef = `B87-${Date.now().toString(36).toUpperCase()}`;
      const subtotal = input.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      const tax = Math.round(subtotal * 0.2 * 100) / 100; // 20% VAT
      const total = Math.round((subtotal + tax) * 100) / 100;
      const [result] = await db.insert(bistroOrders).values({
        orderRef,
        tableNumber: input.tableNumber,
        customerName: input.customerName,
        orderType: input.orderType,
        status: "pending",
        subtotal: String(subtotal),
        tax: String(tax),
        total: String(total),
        paymentStatus: "unpaid",
        notes: input.notes,
        staffId: ctx.user.id,
      });
      const orderId = (result as any).insertId;
      await db.insert(bistroOrderItems).values(
        input.items.map(i => ({
          orderId,
          menuItemId: i.menuItemId,
          itemName: i.itemName,
          quantity: i.quantity,
          unitPrice: String(i.unitPrice),
          lineTotal: String(Math.round(i.unitPrice * i.quantity * 100) / 100),
          notes: i.notes,
        }))
      );
      return { id: orderId, orderRef, total };
    }),

  updateOrderStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "preparing", "ready", "served", "cancelled"]),
      paymentMethod: z.enum(["cash", "card", "online", "account"]).optional(),
      paymentStatus: z.enum(["unpaid", "paid", "refunded"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const updates: any = { status: input.status };
      if (input.paymentMethod) updates.paymentMethod = input.paymentMethod;
      if (input.paymentStatus) updates.paymentStatus = input.paymentStatus;
      await db.update(bistroOrders).set(updates).where(eq(bistroOrders.id, input.id));
      return { success: true };
    }),

  // ─── DAILY TOTALS & ANALYTICS ──────────────────────────────────────────────
  getDailyTotals: protectedProcedure
    .input(z.object({ dateFrom: z.string(), dateTo: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(bistroDailyTotals)
        .where(and(
          sql`DATE(${bistroDailyTotals.date}) >= ${input.dateFrom}`,
          sql`DATE(${bistroDailyTotals.date}) <= ${input.dateTo}`
        ))
        .orderBy(bistroDailyTotals.date);
    }),

  closeDailyTill: protectedProcedure
    .input(z.object({
      date: z.string(),
      cashRevenue: z.number().default(0),
      cardRevenue: z.number().default(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Count orders for the day
      const start = new Date(input.date);
      const end = new Date(input.date);
      end.setDate(end.getDate() + 1);
      const orders = await db.select().from(bistroOrders)
        .where(and(
          gte(bistroOrders.createdAt, start),
          lte(bistroOrders.createdAt, end),
          eq(bistroOrders.paymentStatus as any, "paid")
        ));
      const totalRevenue = input.cashRevenue + input.cardRevenue;
      const dineIn = orders.filter((o: any) => o.orderType === "dine_in").length;
      const takeaway = orders.filter((o: any) => o.orderType === "takeaway").length;
      const catering = orders.filter((o: any) => o.orderType === "event_catering").length;
      await db.insert(bistroDailyTotals).values({
        date: new Date(input.date),
        totalOrders: orders.length,
        totalRevenue: String(totalRevenue),
        cashRevenue: String(input.cashRevenue),
        cardRevenue: String(input.cardRevenue),
        dineInOrders: dineIn,
        takeawayOrders: takeaway,
        cateringOrders: catering,
        notes: input.notes,
      });
      return { success: true, totalOrders: orders.length, totalRevenue };
    }),

  getRevenueStats: protectedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { totalRevenue: 0, totalOrders: 0, avgOrderValue: 0, topItems: [] };
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const orders = await db.select().from(bistroOrders)
        .where(and(
          gte(bistroOrders.createdAt, since),
          eq(bistroOrders.paymentStatus as any, "paid")
        ));
      const totalRevenue = orders.reduce((s: number, o: any) => s + Number(o.total ?? 0), 0);
      const totalOrders = orders.length;
      const avgOrderValue = totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0;
      // Top selling items
      const orderIds = orders.map((o: any) => o.id);
      let topItems: any[] = [];
      if (orderIds.length > 0) {
        const allItems = await db.select().from(bistroOrderItems);
        const filtered = allItems.filter((i: any) => orderIds.includes(i.orderId));
        const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
        for (const item of filtered) {
          const key = item.itemName;
          if (!itemMap[key]) itemMap[key] = { name: key, qty: 0, revenue: 0 };
          itemMap[key].qty += item.quantity;
          itemMap[key].revenue += Number(item.lineTotal ?? 0);
        }
        topItems = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 10);
      }
      return { totalRevenue: Math.round(totalRevenue * 100) / 100, totalOrders, avgOrderValue, topItems };
    }),
});
