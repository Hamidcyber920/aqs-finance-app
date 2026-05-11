import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { pledges, pledgePayments, donors } from "../../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { logAudit } from "./auditTrail";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2026-04-22.dahlia" });

export const pledgesRouter = router({
  // List all pledges, optionally filtered by donorId or status
  list: protectedProcedure
    .input(z.object({
      donorId: z.number().int().optional(),
      status: z.enum(["active", "fulfilled", "lapsed", "cancelled"]).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const conditions = [];
      if (input.donorId) conditions.push(eq(pledges.donorId, input.donorId));
      if (input.status) conditions.push(eq(pledges.status, input.status));
      const rows = await db
        .select()
        .from(pledges)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(pledges.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows;
    }),

  // Get a single pledge by ID
  getById: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [pledge] = await db.select().from(pledges).where(eq(pledges.id, input.id));
      if (!pledge) throw new TRPCError({ code: "NOT_FOUND", message: "Pledge not found" });
      const payments = await db.select().from(pledgePayments).where(eq(pledgePayments.pledgeId, input.id)).orderBy(desc(pledgePayments.createdAt));
      return { ...pledge, payments };
    }),

  // Create a new pledge
  create: protectedProcedure
    .input(z.object({
      donorId: z.number().int(),
      donorName: z.string().optional(),
      campaignId: z.number().int().optional(),
      campaignName: z.string().optional(),
      totalAmount: z.string(),
      frequency: z.enum(["one_off", "monthly", "quarterly", "annual"]).default("one_off"),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      nextDueDate: z.string().optional(),
      isGiftAid: z.boolean().default(false),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(pledges).values({
        donorId: input.donorId,
        donorName: input.donorName ?? null,
        campaignId: input.campaignId ?? null,
        campaignName: input.campaignName ?? null,
        totalAmount: input.totalAmount,
        frequency: input.frequency,
        paidAmount: "0",
        balanceOwing: input.totalAmount,
        status: "active",
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        nextDueDate: input.nextDueDate ? new Date(input.nextDueDate) : null,
        isGiftAid: input.isGiftAid,
        notes: input.notes ?? null,
        createdById: ctx.user.id,
      });
      const pledgeId = (result as any).insertId;
      await logAudit({
        userId: ctx.user.id,
        userName: ctx.user.name ?? ctx.user.email ?? undefined,
        action: "create",
        entity: "pledge",
        entityId: Number(pledgeId),
        meta: { donorId: input.donorId, totalAmount: input.totalAmount, frequency: input.frequency },
      });
      return { id: pledgeId };
    }),

  // Update a pledge (status, notes, nextDueDate)
  update: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      status: z.enum(["active", "fulfilled", "lapsed", "cancelled"]).optional(),
      nextDueDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const data: Record<string, unknown> = { updatedAt: new Date() };
      if (input.status !== undefined) data.status = input.status;
      if (input.nextDueDate !== undefined) data.nextDueDate = new Date(input.nextDueDate);
      if (input.notes !== undefined) data.notes = input.notes;
      await db.update(pledges).set(data).where(eq(pledges.id, input.id));
      await logAudit({
        userId: ctx.user.id,
        userName: ctx.user.name ?? ctx.user.email ?? undefined,
        action: "update",
        entity: "pledge",
        entityId: Number(input.id),
        meta: { status: input.status },
      });
      return { ok: true };
    }),

  // Record a payment against a pledge
  markPaid: protectedProcedure
    .input(z.object({
      pledgeId: z.number().int(),
      amount: z.string(),
      paymentDate: z.string(),
      paymentMethod: z.enum(["cash", "card", "bacs", "cheque", "paypal", "stripe", "other"]).default("cash"),
      reference: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [pledge] = await db.select().from(pledges).where(eq(pledges.id, input.pledgeId));
      if (!pledge) throw new TRPCError({ code: "NOT_FOUND", message: "Pledge not found" });
      // Insert payment record
      await db.insert(pledgePayments).values({
        pledgeId: input.pledgeId,
        donorId: pledge.donorId,
        amount: input.amount,
        paymentDate: new Date(input.paymentDate),
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        recordedById: ctx.user.id,
      });
      // Update pledge paidAmount and balanceOwing
      const newPaid = (parseFloat(pledge.paidAmount) + parseFloat(input.amount)).toFixed(2);
      const newBalance = (parseFloat(pledge.totalAmount) - parseFloat(newPaid)).toFixed(2);
      const newStatus = parseFloat(newBalance) <= 0 ? "fulfilled" : "active";
      await db.update(pledges).set({
        paidAmount: newPaid,
        balanceOwing: newBalance,
        status: newStatus,
        updatedAt: new Date(),
      }).where(eq(pledges.id, input.pledgeId));
      await logAudit({
        userId: ctx.user.id,
        userName: ctx.user.name ?? ctx.user.email ?? undefined,
        action: "payment",
        entity: "pledge",
        entityId: Number(input.pledgeId),
        meta: { amount: input.amount, newStatus },
      });
      return { ok: true, newStatus };
    }),

  // Create a Stripe Checkout session for a pledge payment
  createPledgeCheckout: protectedProcedure
    .input(z.object({
      pledgeId: z.number().int(),
      origin: z.string(), // window.location.origin from frontend
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [pledge] = await db.select().from(pledges).where(eq(pledges.id, input.pledgeId));
      if (!pledge) throw new TRPCError({ code: "NOT_FOUND", message: "Pledge not found" });
      if (pledge.status === "fulfilled") throw new TRPCError({ code: "BAD_REQUEST", message: "Pledge is already fulfilled" });
      const balanceOwing = parseFloat(pledge.balanceOwing);
      if (balanceOwing < 0.5) throw new TRPCError({ code: "BAD_REQUEST", message: "Balance owing is below minimum payment amount (£0.50)" });
      // Look up donor email if available
      let donorEmail: string | undefined;
      if (pledge.donorId) {
        const [donor] = await db.select({ email: donors.email }).from(donors).where(eq(donors.id, pledge.donorId));
        donorEmail = donor?.email ?? undefined;
      }
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "bacs_debit"],
        line_items: [{
          price_data: {
            currency: "gbp",
            product_data: {
              name: pledge.campaignName ? `Pledge Payment — ${pledge.campaignName}` : "AQ Society Pledge Payment",
              description: `Pledge #${pledge.id} — Balance owing: £${balanceOwing.toFixed(2)}`,
            },
            unit_amount: Math.round(balanceOwing * 100),
          },
          quantity: 1,
        }],
        mode: "payment",
        customer_email: donorEmail,
        client_reference_id: String(pledge.id),
        metadata: {
          pledge_id: String(pledge.id),
          donor_name: pledge.donorName ?? "",
          campaign_name: pledge.campaignName ?? "",
          balance_owing: String(balanceOwing),
        },
        success_url: `${input.origin}/pledges?paid=1&pledge_id=${pledge.id}`,
        cancel_url: `${input.origin}/pledges?cancelled=1&pledge_id=${pledge.id}`,
        allow_promotion_codes: true,
      });
      return { checkoutUrl: session.url, pledgeId: pledge.id, amount: balanceOwing };
    }),

  // Summary stats for dashboard
  stats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const rows = await db
      .select({
        status: pledges.status,
        count: sql<number>`COUNT(*)`,
        totalAmount: sql<string>`SUM(${pledges.totalAmount})`,
        paidAmount: sql<string>`SUM(${pledges.paidAmount})`,
        balanceOwing: sql<string>`SUM(${pledges.balanceOwing})`,
      })
      .from(pledges)
      .groupBy(pledges.status);
    return rows;
  }),
});
