/**
 * Facilities & Room Booking router
 * Manages bookable rooms/spaces across AQS buildings (QLH, Bistro, Accommodation)
 * with calendar view, pricing, and payment tracking.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, gte, lte, desc, or, sql } from "drizzle-orm";
import { facilityRooms, facilityBookings, incomeRecords, incomeCategories } from "../../drizzle/schema";

const ADMIN_ROLES = ["superadmin", "trustee", "manager", "admin"];

export const facilitiesRouter = router({
  // ── Rooms ────────────────────────────────────────────────────────────────────
  listRooms: protectedProcedure
    .input(z.object({ building: z.string().optional(), activeOnly: z.boolean().default(true) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      let q = db.select().from(facilityRooms).$dynamic();
      if (input.activeOnly) q = q.where(eq(facilityRooms.isActive, true));
      if (input.building) q = q.where(eq(facilityRooms.building, input.building));
      return q.orderBy(facilityRooms.building, facilityRooms.name);
    }),

  getRoom: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [room] = await db.select().from(facilityRooms).where(eq(facilityRooms.id, input.id));
      if (!room) throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
      return room;
    }),

  createRoom: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      building: z.string().default("QLH"),
      capacity: z.number().optional(),
      description: z.string().optional(),
      amenities: z.string().optional(),
      hourlyRate: z.string().optional(),
      halfDayRate: z.string().optional(),
      fullDayRate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(facilityRooms).values({
        name: input.name,
        building: input.building,
        capacity: input.capacity ?? null,
        description: input.description ?? null,
        amenities: input.amenities ?? null,
        hourlyRate: input.hourlyRate ?? null,
        halfDayRate: input.halfDayRate ?? null,
        fullDayRate: input.fullDayRate ?? null,
        notes: input.notes ?? null,
      });
      return { id: (result as any).insertId };
    }),

  updateRoom: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      building: z.string().optional(),
      capacity: z.number().optional().nullable(),
      description: z.string().optional().nullable(),
      amenities: z.string().optional().nullable(),
      hourlyRate: z.string().optional().nullable(),
      halfDayRate: z.string().optional().nullable(),
      fullDayRate: z.string().optional().nullable(),
      isActive: z.boolean().optional(),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...data } = input;
      await db.update(facilityRooms).set(data).where(eq(facilityRooms.id, id));
      return { success: true };
    }),

  // ── Bookings ─────────────────────────────────────────────────────────────────
  listBookings: protectedProcedure
    .input(z.object({
      roomId: z.number().optional(),
      status: z.enum(["enquiry", "confirmed", "cancelled", "completed"]).optional(),
      from: z.string().optional(), // ISO date string
      to: z.string().optional(),
      limit: z.number().default(100),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      let q = db.select({
        booking: facilityBookings,
        roomName: facilityRooms.name,
        building: facilityRooms.building,
      })
        .from(facilityBookings)
        .leftJoin(facilityRooms, eq(facilityBookings.roomId, facilityRooms.id))
        .$dynamic();
      if (input.roomId) q = q.where(eq(facilityBookings.roomId, input.roomId));
      if (input.status) q = q.where(eq(facilityBookings.status, input.status));
      if (input.from) q = q.where(gte(facilityBookings.startDatetime, new Date(input.from)));
      if (input.to) q = q.where(lte(facilityBookings.endDatetime, new Date(input.to)));
      return q.orderBy(desc(facilityBookings.startDatetime)).limit(input.limit);
    }),

  getBooking: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.select({
        booking: facilityBookings,
        roomName: facilityRooms.name,
        building: facilityRooms.building,
      })
        .from(facilityBookings)
        .leftJoin(facilityRooms, eq(facilityBookings.roomId, facilityRooms.id))
        .where(eq(facilityBookings.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  /** Check availability: returns conflicting bookings for a room in a time window */
  checkAvailability: protectedProcedure
    .input(z.object({
      roomId: z.number(),
      startDatetime: z.string(),
      endDatetime: z.string(),
      excludeBookingId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const start = new Date(input.startDatetime);
      const end = new Date(input.endDatetime);
      const conflicts = await db.select().from(facilityBookings).where(
        and(
          eq(facilityBookings.roomId, input.roomId),
          or(
            eq(facilityBookings.status, "enquiry"),
            eq(facilityBookings.status, "confirmed"),
          ),
          lte(facilityBookings.startDatetime, end),
          gte(facilityBookings.endDatetime, start),
          input.excludeBookingId ? sql`${facilityBookings.id} != ${input.excludeBookingId}` : undefined,
        )
      );
      return { available: conflicts.length === 0, conflicts };
    }),

  createBooking: protectedProcedure
    .input(z.object({
      roomId: z.number(),
      bookerName: z.string().min(1),
      bookerEmail: z.string().email().optional(),
      bookerPhone: z.string().optional(),
      organisation: z.string().optional(),
      title: z.string().min(1),
      purpose: z.string().optional(),
      startDatetime: z.string(),
      endDatetime: z.string(),
      attendeeCount: z.number().optional(),
      rateType: z.enum(["hourly", "half_day", "full_day", "custom", "free"]).default("hourly"),
      agreedAmount: z.string().default("0"),
      depositAmount: z.string().optional(),
      internalNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(facilityBookings).values({
        roomId: input.roomId,
        bookedByUserId: ctx.user.id,
        bookerName: input.bookerName,
        bookerEmail: input.bookerEmail ?? null,
        bookerPhone: input.bookerPhone ?? null,
        organisation: input.organisation ?? null,
        title: input.title,
        purpose: input.purpose ?? null,
        startDatetime: new Date(input.startDatetime),
        endDatetime: new Date(input.endDatetime),
        attendeeCount: input.attendeeCount ?? null,
        rateType: input.rateType,
        agreedAmount: input.agreedAmount,
        depositAmount: input.depositAmount ?? "0",
        internalNotes: input.internalNotes ?? null,
        status: "enquiry",
      });
      return { id: (result as any).insertId };
    }),

  updateBooking: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["enquiry", "confirmed", "cancelled", "completed"]).optional(),
      cancellationReason: z.string().optional(),
      paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
      paymentMethod: z.enum(["cash", "bank_transfer", "card", "invoice"]).optional().nullable(),
      depositPaid: z.boolean().optional(),
      agreedAmount: z.string().optional(),
      internalNotes: z.string().optional().nullable(),
      bookerName: z.string().optional(),
      bookerEmail: z.string().optional().nullable(),
      bookerPhone: z.string().optional().nullable(),
      organisation: z.string().optional().nullable(),
      title: z.string().optional(),
      purpose: z.string().optional().nullable(),
      attendeeCount: z.number().optional().nullable(),
      startDatetime: z.string().optional(),
      endDatetime: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, startDatetime, endDatetime, ...rest } = input;
      const data: Record<string, any> = { ...rest };
      if (startDatetime) data.startDatetime = new Date(startDatetime);
      if (endDatetime) data.endDatetime = new Date(endDatetime);
      await db.update(facilityBookings).set(data).where(eq(facilityBookings.id, id));
      return { success: true };
    }),

  deleteBooking: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(facilityBookings).where(eq(facilityBookings.id, input.id));
      return { success: true };
    }),

  /** Summary stats for the dashboard */
  stats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [totalRooms] = await db.select({ count: sql<number>`COUNT(*)` }).from(facilityRooms).where(eq(facilityRooms.isActive, true));
    const [thisMonth] = await db.select({ count: sql<number>`COUNT(*)`, revenue: sql<string>`COALESCE(SUM(agreedAmount), 0)` })
      .from(facilityBookings)
      .where(and(
        gte(facilityBookings.startDatetime, monthStart),
        lte(facilityBookings.startDatetime, monthEnd),
        or(eq(facilityBookings.status, "confirmed"), eq(facilityBookings.status, "completed")),
      ));
    const [pending] = await db.select({ count: sql<number>`COUNT(*)` }).from(facilityBookings).where(eq(facilityBookings.status, "enquiry"));
    const upcoming = await db.select({
      booking: facilityBookings,
      roomName: facilityRooms.name,
    })
      .from(facilityBookings)
      .leftJoin(facilityRooms, eq(facilityBookings.roomId, facilityRooms.id))
      .where(and(
        gte(facilityBookings.startDatetime, now),
        or(eq(facilityBookings.status, "enquiry"), eq(facilityBookings.status, "confirmed")),
      ))
      .orderBy(facilityBookings.startDatetime)
      .limit(5);

    return {
      totalRooms: totalRooms.count,
      thisMonthBookings: thisMonth.count,
      thisMonthRevenue: thisMonth.revenue,
      pendingEnquiries: pending.count,
      upcoming,
    };
  }),
});
