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
import { facilityRooms, facilityBookings, incomeRecords, incomeCategories, facilityEnquiries, enquiryPayments, enquiryAuditTrail, facilityBuildings, enquiryReplies, commMessages, commChannels, facilitySettings } from "../../drizzle/schema";
import { storagePut } from "../storage";
import { buildWhatsAppUrl } from "../lib/whatsapp";
import { logAudit } from "./auditTrail";
import { fmtDate, fmtDateLong } from "../dateUtils";

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
      const newId = (result as any).insertId;
      await logAudit({ userId: ctx.user.id, entity: "facility_booking", entityId: newId, action: "create", newValue: { roomId: input.roomId, title: input.title, startDatetime: input.startDatetime, endDatetime: input.endDatetime, agreedAmount: input.agreedAmount }, ipAddress: (ctx.req as any).ip || "unknown" });
      return { id: newId };
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
      await logAudit({ userId: ctx.user.id, entity: "facility_booking", entityId: id, action: "update", newValue: rest, ipAddress: (ctx.req as any).ip || "unknown" });
      return { success: true };
    }),

  deleteBooking: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(facilityBookings).where(eq(facilityBookings.id, input.id));
      await logAudit({ userId: ctx.user.id, entity: "facility_booking", entityId: input.id, action: "delete", newValue: { deleted: true }, ipAddress: (ctx.req as any).ip || "unknown" });
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

  // ── Enquiries ─────────────────────────────────────────────────────────────────
  createEnquiry: protectedProcedure
    .input(z.object({
      stage: z.enum(["general_enquiry", "interested", "going_ahead"]).default("general_enquiry"),
      eventType: z.enum(["wedding", "conference", "community_event", "funeral", "birthday", "corporate", "charity", "religious", "other"]).default("other"),
      eventTypeOther: z.string().optional(),
      eventDate: z.string().optional(),
      eventStartTime: z.string().optional(),
      eventEndTime: z.string().optional(),
      expectedAttendees: z.number().optional(),
      contactName: z.string().min(1),
      contactEmail: z.string().optional(),
      contactPhone: z.string().optional(),
      contactAddress: z.string().optional(),
      isOrganisation: z.boolean().default(false),
      organisationName: z.string().optional(),
      organisationAddress: z.string().optional(),
      leadContactName: z.string().optional(),
      leadContactRole: z.string().optional(),
      roomId: z.number().optional(),
      roomPreference: z.string().optional(),
      foodRequired: z.boolean().default(false),
      foodHeadcount: z.number().optional(),
      cateringType: z.enum(["internal", "external", "self_catering", "none"]).default("none"),
      teaCoffeeRequired: z.boolean().default(false),
      tablesRequired: z.boolean().default(false),
      tablesCount: z.number().optional(),
      chairsRequired: z.boolean().default(false),
      chairsCount: z.number().optional(),
      cutleryPlatesRequired: z.boolean().default(false),
      cutleryPlatesCount: z.number().optional(),
      decorRequired: z.boolean().default(false),
      decorType: z.enum(["internal", "external", "both", "none"]).default("none"),
      decorNotes: z.string().optional(),
      speakersRequired: z.boolean().default(false),
      micSystemRequired: z.boolean().default(false),
      avNotes: z.string().optional(),
      meetAndGreetRoom: z.boolean().default(false),
      groomRoom: z.boolean().default(false),
      brideRoom: z.boolean().default(false),
      additionalRoomNotes: z.string().optional(),
      parkingRequired: z.boolean().default(false),
      parkingSpaces: z.number().optional(),
      beveragesRequired: z.boolean().default(false),
      beveragesNotes: z.string().optional(),
      agreedAmount: z.string().optional(),
      depositAmount: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = (await db.insert(facilityEnquiries).values({
        ...input,
        eventDate: input.eventDate || null,
        createdByUserId: ctx.user.id,
      })) as any;
      await db.insert(enquiryAuditTrail).values({
        enquiryId: result.insertId,
        action: "enquiry_created",
        description: `New ${input.eventType} enquiry from ${input.contactName}`,
        performedByUserId: ctx.user.id,
        performedByName: ctx.user.name || "System",
      });
      return { id: result.insertId };
    }),

  listEnquiries: protectedProcedure
    .input(z.object({
      stage: z.enum(["general_enquiry", "interested", "going_ahead", "confirmed", "cancelled"]).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const conditions: any[] = [];
      if (input?.stage) conditions.push(eq(facilityEnquiries.stage, input.stage));
      if (input?.dateFrom) conditions.push(gte(facilityEnquiries.createdAt, new Date(input.dateFrom)));
      if (input?.dateTo) conditions.push(lte(facilityEnquiries.createdAt, new Date(input.dateTo + "T23:59:59")));
      const where = conditions.length ? and(...conditions) : undefined;
      return db.select().from(facilityEnquiries).where(where).orderBy(desc(facilityEnquiries.createdAt));
    }),

  getEnquiry: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [enquiry] = await db.select().from(facilityEnquiries).where(eq(facilityEnquiries.id, input.id));
      if (!enquiry) throw new TRPCError({ code: "NOT_FOUND", message: "Enquiry not found" });
      const payments = await db.select().from(enquiryPayments).where(eq(enquiryPayments.enquiryId, input.id)).orderBy(desc(enquiryPayments.createdAt));
      const audit = await db.select().from(enquiryAuditTrail).where(eq(enquiryAuditTrail.enquiryId, input.id)).orderBy(desc(enquiryAuditTrail.timestamp));
      return { ...enquiry, payments, audit };
    }),

  updateEnquiryStage: protectedProcedure
    .input(z.object({ id: z.number(), stage: z.enum(["general_enquiry", "interested", "going_ahead", "confirmed", "cancelled"]) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(facilityEnquiries).where(eq(facilityEnquiries.id, input.id));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(facilityEnquiries).set({ stage: input.stage }).where(eq(facilityEnquiries.id, input.id));
      await db.insert(enquiryAuditTrail).values({
        enquiryId: input.id,
        action: "stage_changed",
        description: `Stage changed from ${existing.stage} to ${input.stage}`,
        performedByUserId: ctx.user.id,
        performedByName: ctx.user.name || "System",
        metadata: JSON.stringify({ oldStage: existing.stage, newStage: input.stage }),
      });
      return { success: true };
    }),

  updateEnquiry: protectedProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(facilityEnquiries).set(input.data).where(eq(facilityEnquiries.id, input.id));
      await db.insert(enquiryAuditTrail).values({
        enquiryId: input.id,
        action: "enquiry_updated",
        description: "Enquiry details updated",
        performedByUserId: ctx.user.id,
        performedByName: ctx.user.name || "System",
      });
      return { success: true };
    }),

  // ── Enquiry Payments ───────────────────────────────────────────────────────────
  recordPayment: protectedProcedure
    .input(z.object({
      enquiryId: z.number(),
      paymentType: z.enum(["deposit", "fifty_percent", "full_payment", "other"]),
      amount: z.string(),
      dueDate: z.string().optional(),
      paymentMethod: z.enum(["cash", "bank_transfer", "card", "cheque"]).optional(),
      reference: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = (await db.insert(enquiryPayments).values({
        enquiryId: input.enquiryId,
        paymentType: input.paymentType,
        amount: input.amount,
        dueDate: input.dueDate || null,
        paymentMethod: input.paymentMethod || null,
        reference: input.reference || null,
      })) as any;
      await db.insert(enquiryAuditTrail).values({
        enquiryId: input.enquiryId,
        action: "payment_recorded",
        description: `${input.paymentType} payment of \u00a3${input.amount} recorded`,
        performedByUserId: ctx.user.id,
        performedByName: ctx.user.name || "System",
      });
      return { id: result.insertId };
    }),

  authorisePayment: protectedProcedure
    .input(z.object({ paymentId: z.number(), enquiryId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(enquiryPayments).set({
        status: "received",
        paidAt: new Date(),
        authorisedByUserId: ctx.user.id,
        authorisedByName: ctx.user.name || "System",
        authorisedAt: new Date(),
      }).where(eq(enquiryPayments.id, input.paymentId));
      await db.insert(enquiryAuditTrail).values({
        enquiryId: input.enquiryId,
        action: "payment_authorised",
        description: `Payment #${input.paymentId} authorised by ${ctx.user.name}`,
        performedByUserId: ctx.user.id,
        performedByName: ctx.user.name || "System",
      });
      return { success: true };
    }),

  uploadPaymentEvidence: protectedProcedure
    .input(z.object({ paymentId: z.number(), enquiryId: z.number(), fileBase64: z.string(), fileName: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const buf = Buffer.from(input.fileBase64, "base64");
      const ext = input.fileName.split(".").pop() || "pdf";
      const key = `enquiry-evidence/${input.enquiryId}/${input.paymentId}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buf, ext === "pdf" ? "application/pdf" : `image/${ext}`);
      await db.update(enquiryPayments).set({ evidenceUrl: url }).where(eq(enquiryPayments.id, input.paymentId));
      await db.insert(enquiryAuditTrail).values({
        enquiryId: input.enquiryId,
        action: "evidence_uploaded",
        description: `Payment evidence uploaded for payment #${input.paymentId}`,
        performedByUserId: ctx.user.id,
        performedByName: ctx.user.name || "System",
      });
      return { url };
    }),

  // ── Communications ─────────────────────────────────────────────────────────────
  sendEnquiryForm: protectedProcedure
    .input(z.object({ enquiryId: z.number(), method: z.enum(["email", "whatsapp", "both"]) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [enquiry] = await db.select().from(facilityEnquiries).where(eq(facilityEnquiries.id, input.enquiryId));
      if (!enquiry) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(facilityEnquiries).set({ formSentAt: new Date(), formSentBy: ctx.user.id }).where(eq(facilityEnquiries.id, input.enquiryId));
      await db.insert(enquiryAuditTrail).values({
        enquiryId: input.enquiryId,
        action: "form_sent",
        description: `Enquiry form sent via ${input.method} to ${enquiry.contactName}`,
        performedByUserId: ctx.user.id,
        performedByName: ctx.user.name || "System",
        metadata: JSON.stringify({ method: input.method, contactEmail: enquiry.contactEmail, contactPhone: enquiry.contactPhone }),
      });
      return { success: true, message: `Form sent via ${input.method}` };
    }),

  sendPaymentConfirmation: protectedProcedure
    .input(z.object({ enquiryId: z.number(), paymentId: z.number(), method: z.enum(["email", "whatsapp", "both"]) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(enquiryPayments).set({ confirmationSentAt: new Date(), confirmationMethod: input.method }).where(eq(enquiryPayments.id, input.paymentId));
      await db.insert(enquiryAuditTrail).values({
        enquiryId: input.enquiryId,
        action: "confirmation_sent",
        description: `Payment confirmation sent via ${input.method}`,
        performedByUserId: ctx.user.id,
        performedByName: ctx.user.name || "System",
      });
      return { success: true };
    }),

  // ── Enquiry → Booking Conversion ───────────────────────────────────────────────
  convertToBooking: protectedProcedure
    .input(z.object({ enquiryId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [enquiry] = await db.select().from(facilityEnquiries).where(eq(facilityEnquiries.id, input.enquiryId));
      if (!enquiry) throw new TRPCError({ code: "NOT_FOUND" });
      if (!enquiry.roomId) throw new TRPCError({ code: "BAD_REQUEST", message: "Room must be selected before converting to booking" });
      const startDt = enquiry.eventDate ? new Date(`${enquiry.eventDate}T${enquiry.eventStartTime || "09:00"}`) : new Date();
      const endDt = enquiry.eventDate ? new Date(`${enquiry.eventDate}T${enquiry.eventEndTime || "17:00"}`) : new Date();
      const [booking] = await db.insert(facilityBookings).values({
        roomId: enquiry.roomId,
        bookedByUserId: ctx.user.id,
        bookerName: enquiry.contactName,
        bookerEmail: enquiry.contactEmail || "",
        bookerPhone: enquiry.contactPhone || "",
        organisation: enquiry.organisationName || "",
        title: `${enquiry.eventType} - ${enquiry.contactName}`,
        purpose: enquiry.notes || "",
        startDatetime: startDt,
        endDatetime: endDt,
        attendeeCount: enquiry.expectedAttendees || 0,
        rateType: "custom",
        agreedAmount: enquiry.agreedAmount || "0",
        depositAmount: enquiry.depositAmount || "0",
        status: "confirmed",
        paymentStatus: "unpaid",
      });
      await db.update(facilityEnquiries).set({ stage: "confirmed", bookingId: booking.insertId }).where(eq(facilityEnquiries.id, input.enquiryId));
      await db.insert(enquiryAuditTrail).values({
        enquiryId: input.enquiryId,
        action: "converted_to_booking",
        description: `Enquiry converted to booking #${booking.insertId}`,
        performedByUserId: ctx.user.id,
        performedByName: ctx.user.name || "System",
      });
      return { bookingId: booking.insertId };
    }),

  // ── AI OCR Scan ────────────────────────────────────────────────────────────────
  scanEnquiryForm: protectedProcedure
    .input(z.object({ fileBase64: z.string(), fileName: z.string() }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("../_core/llm");
      const buf = Buffer.from(input.fileBase64, "base64");
      const ext = input.fileName.split(".").pop() || "jpg";
      const mimeType = ext === "pdf" ? "application/pdf" : `image/${ext}`;
      const key = `enquiry-scans/${Date.now()}-${input.fileName}`;
      const { url } = await storagePut(key, buf, mimeType);
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are an AI assistant that extracts facility booking enquiry information from scanned forms. Return a JSON object with these fields (use null for missing): contactName, contactEmail, contactPhone, contactAddress, organisationName, eventType (one of: wedding, conference, community_event, funeral, birthday, corporate, charity, religious, other), eventDate (YYYY-MM-DD), eventStartTime (HH:MM), eventEndTime (HH:MM), expectedAttendees (number), foodRequired (boolean), foodHeadcount (number), cateringType (internal/external/self_catering/none), teaCoffeeRequired (boolean), tablesRequired (boolean), tablesCount (number), chairsRequired (boolean), chairsCount (number), cutleryPlatesRequired (boolean), decorRequired (boolean), decorType (internal/external/both/none), speakersRequired (boolean), micSystemRequired (boolean), meetAndGreetRoom (boolean), groomRoom (boolean), brideRoom (boolean), parkingRequired (boolean), parkingSpaces (number), beveragesRequired (boolean), notes (string)." },
          { role: "user", content: [{ type: "image_url", image_url: { url, detail: "high" } }, { type: "text", text: "Extract all booking enquiry information from this form/document." }] as any },
        ],
      });
      let extracted = {};
      try { extracted = JSON.parse((response.choices[0].message.content as string) || "{}"); } catch { extracted = {}; }
      return { extracted, sourceDocument: url };
    }),

  // ── Audit Trail ────────────────────────────────────────────────────────────────
  getAuditTrail: protectedProcedure
    .input(z.object({ enquiryId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      return db.select().from(enquiryAuditTrail).where(eq(enquiryAuditTrail.enquiryId, input.enquiryId)).orderBy(desc(enquiryAuditTrail.timestamp));
    }),

  // ── Buildings CRUD ─────────────────────────────────────────────────────────────
  listBuildings: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      return db.select().from(facilityBuildings).where(eq(facilityBuildings.isActive, true)).orderBy(facilityBuildings.sortOrder, facilityBuildings.name);
    }),

  createBuilding: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      address: z.string().optional(),
      notes: z.string().optional(),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(facilityBuildings).values({
        name: input.name,
        address: input.address,
        notes: input.notes,
        sortOrder: input.sortOrder,
      });
      return { id: (result as any).insertId, ...input };
    }),

  updateBuilding: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
      sortOrder: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      await db.update(facilityBuildings).set(updates).where(eq(facilityBuildings.id, id));
      return { success: true };
    }),

  deleteBuilding: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Soft delete
      await db.update(facilityBuildings).set({ isActive: false }).where(eq(facilityBuildings.id, input.id));
      return { success: true };
    }),

  // ── Upcoming Bookings (7-day summary) ─────────────────────────────────────────
  upcomingBookings: protectedProcedure
    .input(z.object({ days: z.number().default(7) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const now = new Date();
      const future = new Date(now.getTime() + input.days * 24 * 60 * 60 * 1000);
      return db.select({
        id: facilityBookings.id,
        title: facilityBookings.title,
        bookerName: facilityBookings.bookerName,
        startDatetime: facilityBookings.startDatetime,
        endDatetime: facilityBookings.endDatetime,
        attendeeCount: facilityBookings.attendeeCount,
        status: facilityBookings.status,
        agreedAmount: facilityBookings.agreedAmount,
        roomId: facilityBookings.roomId,
        roomName: facilityRooms.name,
        building: facilityRooms.building,
      })
        .from(facilityBookings)
        .leftJoin(facilityRooms, eq(facilityBookings.roomId, facilityRooms.id))
        .where(and(
          gte(facilityBookings.startDatetime, now),
          lte(facilityBookings.startDatetime, future),
          or(
            eq(facilityBookings.status, "confirmed"),
            eq(facilityBookings.status, "completed")
          )
        ))
        .orderBy(facilityBookings.startDatetime);
    }),

  // ── Conflict Detection ─────────────────────────────────────────────────────────
  checkConflicts: protectedProcedure
    .input(z.object({
      roomId: z.number(),
      startDatetime: z.date(),
      endDatetime: z.date(),
      excludeBookingId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      let q = db.select().from(facilityBookings).where(
        and(
          eq(facilityBookings.roomId, input.roomId),
          or(
            eq(facilityBookings.status, "confirmed"),
            eq(facilityBookings.status, "enquiry")
          ),
          // Overlapping: existing.start < new.end AND existing.end > new.start
          lte(facilityBookings.startDatetime, input.endDatetime),
          gte(facilityBookings.endDatetime, input.startDatetime),
        )
      ).$dynamic();
      const conflicts = await q;
      const filtered = input.excludeBookingId
        ? conflicts.filter(b => b.id !== input.excludeBookingId)
        : conflicts;
      return { hasConflict: filtered.length > 0, conflicts: filtered };
    }),

  // ── PDF Generation ────────────────────────────────────────────────────────────
  generateEnquiryPdf: protectedProcedure
    .input(z.object({ enquiryId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [enquiry] = await db.select().from(facilityEnquiries).where(eq(facilityEnquiries.id, input.enquiryId));
      if (!enquiry) throw new TRPCError({ code: "NOT_FOUND" });
      // Fetch AQS logo for embedding
      const _logoUrl = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663490667955/JVWlqjXdBONOHBPY.png";
      let _logoBuffer: Buffer | null = null;
      try {
        const _https = await import("https");
        _logoBuffer = await new Promise<Buffer>((res, rej) => {
          _https.default.get(_logoUrl, (response: any) => {
            const parts: Buffer[] = [];
            response.on("data", (c: Buffer) => parts.push(c));
            response.on("end", () => res(Buffer.concat(parts)));
            response.on("error", rej);
          }).on("error", rej);
        });
      } catch { _logoBuffer = null; }

      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ size: "A4", margin: 50, autoFirstPage: true });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      await new Promise<void>((resolve) => {
        doc.on("end", resolve);
        // ── Top colour bar
        doc.rect(0, 0, 595, 8).fill("#1e3a5f");
        doc.rect(0, 8, 595, 3).fill("#c9a84c");
        // ── Logo
        const _logoW = 160;
        const _logoH = Math.round(_logoW * (467 / 500));
        let _afterLogoY = 18;
        if (_logoBuffer) {
          doc.image(_logoBuffer, (595 - _logoW) / 2, 18, { width: _logoW, height: _logoH });
          _afterLogoY = 18 + _logoH + 6;
        }
        doc.y = _afterLogoY;
        // ── Gold rule
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#c9a84c").lineWidth(1).stroke();
        doc.lineWidth(1);
        doc.moveDown(0.25);
        // ── Address block
        doc.fontSize(8.5).font("Helvetica").fillColor("#333")
          .text("1-12 Brougham Terrace, Liverpool, Merseyside, L6 1AE", { align: "center" });
        doc.fontSize(7.5).fillColor("#555")
          .text("Tel: 0151 260 3986   |   admin@abdullahquilliam.org   |   Charity No: 1194942", { align: "center" });
        doc.moveDown(0.4);
        // ── Form title banner
        const _bannerY = doc.y;
        doc.rect(50, _bannerY, 495, 22).fill("#1e3a5f");
        doc.fontSize(11).font("Helvetica-Bold").fillColor("#ffffff")
          .text("FACILITIES BOOKING ENQUIRY FORM", 50, _bannerY + 5, { width: 495, align: "center" });
        doc.fillColor("#000");
        doc.y = _bannerY + 28;
        // ── Enquiry ref + date
        doc.fontSize(7.5).fillColor("#888")
          .text(`Enquiry #${enquiry.id}   |   Generated: ${fmtDateLong(new Date())}`, { align: "right" });
        doc.fillColor("#000");
        doc.moveDown(0.5);
        // Section helper
        const section = (title: string) => {
          doc.moveDown(0.5);
          doc.fontSize(11).font("Helvetica-Bold").fillColor("#1e3a5f").text(title.toUpperCase());
          doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#1e3a5f").stroke();
          doc.fillColor("#000").moveDown(0.3);
        };
        const field = (label: string, value: string | null | undefined) => {
          doc.fontSize(10).font("Helvetica-Bold").text(`${label}: `, { continued: true });
          doc.font("Helvetica").text(value || "—");
        };
        const yesNo = (v: boolean | null | undefined) => v ? "Yes" : "No";
        // Contact
        section("Contact Details");
        field("Full Name", enquiry.contactName);
        field("Email", enquiry.contactEmail);
        field("Phone", enquiry.contactPhone);
        field("Address", enquiry.contactAddress);
        if (enquiry.isOrganisation) {
          field("Organisation", enquiry.organisationName);
          field("Lead Contact", enquiry.leadContactName);
          field("Role", enquiry.leadContactRole);
        }
        // Event
        section("Event Details");
        field("Event Type", enquiry.eventTypeOther || enquiry.eventType);
        field("Date", enquiry.eventDate ? fmtDate(new Date(enquiry.eventDate)) : null);
        field("Start Time", enquiry.eventStartTime);
        field("End Time", enquiry.eventEndTime);
        field("Expected Attendees", enquiry.expectedAttendees?.toString());
        field("Room Preference", enquiry.roomPreference);
        // Food & Catering
        section("Food & Catering");
        field("Food Required", yesNo(enquiry.foodRequired));
        if (enquiry.foodRequired) {
          field("Headcount", enquiry.foodHeadcount?.toString());
          field("Catering Type", enquiry.cateringType);
          field("Food Preferences", enquiry.foodPreferences);
          field("Halal Required", yesNo(enquiry.halalRequired));
          field("Vegetarian Required", yesNo(enquiry.vegetarianRequired));
          field("Vegan Required", yesNo(enquiry.veganRequired));
          field("Allergy Notes", enquiry.allergyNotes);
          field("Menu Choices", enquiry.menuChoices);
        }
        field("Tea / Coffee", yesNo(enquiry.teaCoffeeRequired));
        // Linen
        section("Linen & Table Covers");
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#c0392b").text("MANDATORY CHARGEABLE SERVICE");
        doc.fillColor("#000");
        field("Linen Hire", enquiry.linenHireRequired === "hire" ? "Hire from AQS (chargeable)" : "Own linen / table covers");
        field("Linen Notes", enquiry.linenHireNotes);
        // Equipment
        section("Equipment & Furniture");
        field("Tables", enquiry.tablesRequired ? `Yes (${enquiry.tablesCount || "TBC"})` : "No");
        field("Chairs", enquiry.chairsRequired ? `Yes (${enquiry.chairsCount || "TBC"})` : "No");
        field("Cutlery / Plates", enquiry.cutleryPlatesRequired ? `Yes (${enquiry.cutleryPlatesCount || "TBC"})` : "No");
        // AV
        section("AV & Sound");
        field("Speakers", yesNo(enquiry.speakersRequired));
        field("Microphone System", yesNo(enquiry.micSystemRequired));
        field("AV Notes", enquiry.avNotes);
        // Decor
        section("Decor");
        field("Decor Required", yesNo(enquiry.decorRequired));
        field("Decor Type", enquiry.decorType);
        field("Decor Notes", enquiry.decorNotes);
        // Additional Rooms
        section("Additional Rooms");
        field("Meet & Greet Room", yesNo(enquiry.meetAndGreetRoom));
        field("Groom Room", yesNo(enquiry.groomRoom));
        field("Bride Room", yesNo(enquiry.brideRoom));
        field("Notes", enquiry.additionalRoomNotes);
        // Parking
        section("Parking & Beverages");
        field("Parking Required", enquiry.parkingRequired ? `Yes (${enquiry.parkingSpaces || "TBC"} spaces)` : "No");
        field("Beverages", yesNo(enquiry.beveragesRequired));
        field("Beverages Notes", enquiry.beveragesNotes);
        // Pricing
        section("Pricing");
        field("Agreed Amount", enquiry.agreedAmount ? `£${parseFloat(enquiry.agreedAmount).toFixed(2)}` : null);
        field("Deposit Amount", enquiry.depositAmount ? `£${parseFloat(enquiry.depositAmount).toFixed(2)}` : null);
        // Notes
        if (enquiry.notes) {
          section("Additional Notes");
          doc.fontSize(10).font("Helvetica").text(enquiry.notes);
        }
        // Signature block
        doc.moveDown(2);
        doc.fontSize(10).font("Helvetica").text("Client Signature: ________________________     Date: _______________");
        doc.moveDown(1);
        doc.text("AQS Representative: ____________________     Date: _______________");
        doc.moveDown(2);
        doc.fontSize(8).fillColor("#888").text("Abdullah Quilliam Society · Facilities Booking · This form is confidential", { align: "center" });
        doc.end();
      });
      const pdfBuffer = Buffer.concat(chunks);
      const key = `enquiry-forms/enquiry-${enquiry.id}-${Date.now()}.pdf`;
      const { url } = await storagePut(key, pdfBuffer, "application/pdf");
      await db.update(facilityEnquiries).set({ pdfUrl: url, pdfGeneratedAt: new Date() }).where(eq(facilityEnquiries.id, input.enquiryId));
      await db.insert(enquiryAuditTrail).values({
        enquiryId: input.enquiryId,
        action: "pdf_generated",
        description: `Enquiry form PDF generated`,
        performedByUserId: ctx.user.id,
        performedByName: ctx.user.name || "System",
      });
      return { url };
    }),

  // ── Sync to Google Drive ──────────────────────────────────────────────────────
  syncEnquiryToDrive: protectedProcedure
    .input(z.object({ enquiryId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [enquiry] = await db.select().from(facilityEnquiries).where(eq(facilityEnquiries.id, input.enquiryId));
      if (!enquiry) throw new TRPCError({ code: "NOT_FOUND" });
      if (!enquiry.pdfUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Generate PDF first" });
      try {
        const { uploadToDrive } = await import("../googleServices");
        const response = await fetch(enquiry.pdfUrl);
        const pdfBuffer = Buffer.from(await response.arrayBuffer());
        const fileName = `Enquiry-${enquiry.id}-${enquiry.contactName.replace(/[^a-z0-9]/gi, "-")}-${new Date().toISOString().split("T")[0]}.pdf`;
        const { fileId, webViewLink } = await uploadToDrive(fileName, pdfBuffer, "application/pdf");
        await db.update(facilityEnquiries).set({
          driveFileId: fileId,
          driveFileUrl: webViewLink,
          driveSyncedAt: new Date(),
        }).where(eq(facilityEnquiries.id, input.enquiryId));
        await db.insert(enquiryAuditTrail).values({
          enquiryId: input.enquiryId,
          action: "synced_to_drive",
          description: `PDF synced to Google Drive: ${fileName}`,
          performedByUserId: ctx.user.id,
          performedByName: ctx.user.name || "System",
          metadata: JSON.stringify({ fileId, webViewLink }),
        });
        return { success: true, fileId, webViewLink };
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Drive sync failed: ${err.message}` });
      }
    }),

  // ── Send Enquiry Email ────────────────────────────────────────────────────────
  sendEnquiryEmail: protectedProcedure
    .input(z.object({
      enquiryId: z.number(),
      subject: z.string(),
      body: z.string(),
      attachPdf: z.boolean().default(true),
      linkToComms: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [enquiry] = await db.select().from(facilityEnquiries).where(eq(facilityEnquiries.id, input.enquiryId));
      if (!enquiry) throw new TRPCError({ code: "NOT_FOUND" });
      if (!enquiry.contactEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "No email address on this enquiry" });
      const { sendGmailMessage } = await import("../googleServices");
      // Build email body with PDF link if available
      let fullBody = input.body;
      if (input.attachPdf && enquiry.pdfUrl) {
        fullBody += `\n\n---\nYour enquiry form is available to view/download here:\n${enquiry.pdfUrl}`;
      }
      const result = await sendGmailMessage(enquiry.contactEmail, input.subject, fullBody);
      // Record as sent reply
      await db.insert(enquiryReplies).values({
        enquiryId: input.enquiryId,
        direction: "sent",
        method: "email",
        fromName: ctx.user.name || "AQS",
        fromEmail: process.env.GMAIL_FROM_EMAIL || "",
        subject: input.subject,
        body: input.body,
        recordedByUserId: ctx.user.id,
        recordedByName: ctx.user.name || "System",
        gmailMessageId: result.messageId,
      });
      // Update reply count
      await db.update(facilityEnquiries).set({
        formSentAt: new Date(),
        formSentBy: ctx.user.id,
        replyCount: sql`${facilityEnquiries.replyCount} + 1`,
        lastReplyAt: new Date(),
      }).where(eq(facilityEnquiries.id, input.enquiryId));
      // Link to comms if requested
      if (input.linkToComms) {
        // Find or create a Bookings Enquiries comm channel
        let channelId = enquiry.commChannelId;
        if (!channelId) {
          const [existing] = await db.select().from(commChannels).where(eq(commChannels.name, "Bookings Enquiries")).limit(1);
          channelId = existing?.id;
        }
        if (channelId) {
          const [msg] = await db.insert(commMessages).values({
            channelId,
            direction: "sent",
            fromName: ctx.user.name || "AQS",
            fromEmail: process.env.GMAIL_FROM_EMAIL || "",
            toEmailsJson: JSON.stringify([{ name: enquiry.contactName, email: enquiry.contactEmail }]),
            subject: input.subject,
            body: input.body,
            sendStatus: result.success ? "sent" : "failed",
            sentAt: new Date(),
          });
          if (!enquiry.commChannelId) {
            await db.update(facilityEnquiries).set({ commChannelId: channelId }).where(eq(facilityEnquiries.id, input.enquiryId));
          }
        }
      }
      await db.insert(enquiryAuditTrail).values({
        enquiryId: input.enquiryId,
        action: "email_sent",
        description: `Email sent to ${enquiry.contactEmail}: ${input.subject}`,
        performedByUserId: ctx.user.id,
        performedByName: ctx.user.name || "System",
      });
      return { success: result.success, messageId: result.messageId, error: result.error };
    }),

  // ── Add Reply (manual / scanned) ──────────────────────────────────────────────
  addEnquiryReply: protectedProcedure
    .input(z.object({
      enquiryId: z.number(),
      direction: z.enum(["sent", "received"]).default("received"),
      method: z.enum(["email", "whatsapp", "phone", "in_person", "manual_entry", "scanned"]),
      fromName: z.string().optional(),
      fromEmail: z.string().optional(),
      fromPhone: z.string().optional(),
      subject: z.string().optional(),
      body: z.string(),
      scanUrl: z.string().optional(),
      receivedAt: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.insert(enquiryReplies).values({
        enquiryId: input.enquiryId,
        direction: input.direction,
        method: input.method,
        fromName: input.fromName,
        fromEmail: input.fromEmail,
        fromPhone: input.fromPhone,
        subject: input.subject,
        body: input.body,
        scanUrl: input.scanUrl,
        recordedByUserId: ctx.user.id,
        recordedByName: ctx.user.name || "System",
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
      });
      await db.update(facilityEnquiries).set({
        replyCount: sql`${facilityEnquiries.replyCount} + 1`,
        lastReplyAt: new Date(),
        formReturnedAt: input.direction === "received" ? new Date() : undefined,
      }).where(eq(facilityEnquiries.id, input.enquiryId));
      await db.insert(enquiryAuditTrail).values({
        enquiryId: input.enquiryId,
        action: "reply_added",
        description: `${input.direction === "received" ? "Reply received" : "Message sent"} via ${input.method}`,
        performedByUserId: ctx.user.id,
        performedByName: ctx.user.name || "System",
      });
      return { success: true };
    }),

  // ── List Replies ──────────────────────────────────────────────────────────────
  listEnquiryReplies: protectedProcedure
    .input(z.object({ enquiryId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      return db.select().from(enquiryReplies)
        .where(eq(enquiryReplies.enquiryId, input.enquiryId))
        .orderBy(desc(enquiryReplies.receivedAt));
    }),

  // ── Scan Reply (OCR) ──────────────────────────────────────────────────────────
  scanReplyDocument: protectedProcedure
    .input(z.object({ enquiryId: z.number(), fileBase64: z.string(), fileName: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { invokeLLM } = await import("../_core/llm");
      const buf = Buffer.from(input.fileBase64, "base64");
      const ext = input.fileName.split(".").pop() || "jpg";
      const mimeType = ext === "pdf" ? "application/pdf" : `image/${ext}`;
      const key = `enquiry-replies/${Date.now()}-${input.fileName}`;
      const { url } = await storagePut(key, buf, mimeType);
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are an AI assistant that reads scanned reply documents or emails from clients regarding facility booking enquiries. Extract the key information and return a JSON object with: senderName (string), senderEmail (string|null), senderPhone (string|null), subject (string), body (string — full text of the reply), receivedDate (YYYY-MM-DD or null)." },
          { role: "user", content: [{ type: "image_url", image_url: { url, detail: "high" } }, { type: "text", text: "Extract the reply information from this document." }] as any },
        ],
        response_format: { type: "json_schema", json_schema: { name: "reply_extract", strict: true, schema: { type: "object", properties: { senderName: { type: "string" }, senderEmail: { type: ["string", "null"] }, senderPhone: { type: ["string", "null"] }, subject: { type: "string" }, body: { type: "string" }, receivedDate: { type: ["string", "null"] } }, required: ["senderName", "senderEmail", "senderPhone", "subject", "body", "receivedDate"], additionalProperties: false } } },
      });
      const extracted = JSON.parse(response.choices[0].message.content as string);
      return { ...extracted, scanUrl: url };
    }),

  // ── Get WhatsApp Link ─────────────────────────────────────────────────────────
  getWhatsAppLink: protectedProcedure
    .input(z.object({ enquiryId: z.number(), message: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [enquiry] = await db.select().from(facilityEnquiries).where(eq(facilityEnquiries.id, input.enquiryId));
      if (!enquiry) throw new TRPCError({ code: "NOT_FOUND" });
      const phone = enquiry.contactPhone?.replace(/[^0-9+]/g, "") || "";
      const msg = input.message || `AssalamuAlaikum ${enquiry.contactName},\n\nThank you for your enquiry regarding our facilities. We are pleased to follow up with you regarding your booking request.\n\nPlease let us know if you have any questions.\n\nJazakAllah Khair,\nAbdullah Quilliam Society`;
      const waLink = buildWhatsAppUrl(phone, msg);
      return { phone, waLink, contactName: enquiry.contactName };
    }),

  // ── Facility Settings ─────────────────────────────────────────────────────────
  getFacilitySettings: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(facilitySettings);
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key] = r.value || "";
      return map;
    }),

  updateFacilitySetting: protectedProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(facilitySettings)
        .set({ value: input.value })
        .where(eq(facilitySettings.key, input.key));
      return { success: true };
    }),

  // ── Generate Blank Enquiry PDF ────────────────────────────────────────────────
  generateBlankEnquiryPdf: protectedProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const settingsRows = await db.select().from(facilitySettings);
      const settings: Record<string, string> = {};
      for (const r of settingsRows) settings[r.key] = r.value || "";
            const googleFormUrl = settings["google_form_url"] || "";

      // Fetch AQS logo for embedding (new official black-and-white crest)
      const logoUrl = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663490667955/JVWlqjXdBONOHBPY.png";
      let logoBuffer: Buffer | null = null;
      try {
        const https = await import("https");
        logoBuffer = await new Promise<Buffer>((res, rej) => {
          https.default.get(logoUrl, (response: any) => {
            const parts: Buffer[] = [];
            response.on("data", (c: Buffer) => parts.push(c));
            response.on("end", () => res(Buffer.concat(parts)));
            response.on("error", rej);
          }).on("error", rej);
        });
      } catch { logoBuffer = null; }

      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ margin: 50, size: "A4", autoFirstPage: true });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      await new Promise<void>((resolve) => {
        doc.on("end", resolve);

        // ── Top colour bar ────────────────────────────────────────────────────────
        doc.rect(0, 0, 595, 8).fill("#1e3a5f");
        doc.rect(0, 8, 595, 3).fill("#c9a84c");

        // ── Logo (includes org name + tagline) ──────────────────────────────────
        // Logo image is 500x467 (ratio ~0.934 h/w)
        const logoW = 160;
        const logoH = Math.round(logoW * (467 / 500));
        let afterLogoY = 18;
        if (logoBuffer) {
          doc.image(logoBuffer, (595 - logoW) / 2, 18, { width: logoW, height: logoH });
          afterLogoY = 18 + logoH + 6;
        }
        doc.y = afterLogoY;

        // ── Gold rule ────────────────────────────────────────────────────────────
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#c9a84c").lineWidth(1).stroke();
        doc.lineWidth(1);
        doc.moveDown(0.25);

        // ── Address block ────────────────────────────────────────────────────────
        doc.fontSize(8.5).font("Helvetica").fillColor("#333")
          .text("1-12 Brougham Terrace, Liverpool, Merseyside, L6 1AE", { align: "center" });
        doc.fontSize(7.5).fillColor("#555")
          .text("Tel: 0151 260 3986   |   admin@abdullahquilliam.org   |   Charity No: 1194942", { align: "center" });
        doc.moveDown(0.4);

        // ── Form title banner ────────────────────────────────────────────────────
        const bannerY = doc.y;
        doc.rect(50, bannerY, 495, 22).fill("#1e3a5f");
        doc.fontSize(11).font("Helvetica-Bold").fillColor("#ffffff")
          .text("FACILITIES BOOKING ENQUIRY FORM", 50, bannerY + 5, { width: 495, align: "center" });
        doc.fillColor("#000");
        doc.y = bannerY + 28;

        // ── Date ─────────────────────────────────────────────────────────────────
        doc.fontSize(7.5).fillColor("#888")
          .text(`Generated: ${fmtDateLong(new Date())}`, { align: "right" });
        doc.fillColor("#000");
        doc.moveDown(0.5);
        // ── Assalamu Alaikum intro ──────────────────────────────────────────────
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#1e3a5f")
          .text("Assalamu Alaikum wa Rahmatullahi wa Barakatuh,");
        doc.moveDown(0.3);
        doc.fontSize(9.5).font("Helvetica").fillColor("#333")
          .text("Thank you for your enquiry regarding our facilities at the Abdullah Quilliam Society — Home of Britain's First Mosque. Please complete all sections of this form clearly and return it to us at your earliest convenience.");
        doc.moveDown(0.25);
        doc.fontSize(9.5).font("Helvetica").fillColor("#333")
          .text("Please email the completed form to: ", { continued: true })
          .font("Helvetica-Bold").fillColor("#1e3a5f").text("admin@abdullahquilliam.org", { continued: true })
          .font("Helvetica").fillColor("#333").text("  or call us on 0151 260 3986 if you need any assistance.");
        doc.moveDown(0.5);
        doc.fillColor("#000");

        const section = (title: string) => {
          doc.moveDown(0.5);
          doc.fontSize(11).font("Helvetica-Bold").fillColor("#1e3a5f").text(title.toUpperCase());
          doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#1e3a5f").stroke();
          doc.fillColor("#000").moveDown(0.3);
        };
        const blankLine = (label: string, lines = 1) => {
          doc.fontSize(10).font("Helvetica-Bold").text(`${label}:`, { continued: false });
          for (let i = 0; i < lines; i++) {
            doc.moveDown(0.2);
            doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#aaa").lineWidth(0.5).stroke();
            doc.moveDown(0.5);
          }
          doc.lineWidth(1);
        };
        const checkBox = (label: string) => {
          // Draw a real square box using vector graphics (avoids Unicode font issues)
          const x = doc.x + 10;
          const y = doc.y + 1;
          const size = 9;
          doc.save()
            .rect(x, y, size, size)
            .lineWidth(0.8)
            .strokeColor("#000")
            .stroke()
            .restore();
          doc.fontSize(10).font("Helvetica")
            .text(`   ${label}`, { indent: 22, lineGap: 1 });
        };

        // SECTION 1: Contact Details
        section("1. Contact Details");
        blankLine("Full Name");
        blankLine("Email Address");
        blankLine("Telephone / Mobile");
        blankLine("Home Address", 2);
        doc.moveDown(0.3);
        doc.fontSize(10).font("Helvetica-Bold").text("Booking on behalf of an organisation?");
        checkBox("Yes"); checkBox("No");
        doc.moveDown(0.3);
        blankLine("Organisation Name (if applicable)");
        blankLine("Lead Contact Name & Role");

        // SECTION 2: Event Details
        section("2. Event Details");
        doc.fontSize(10).font("Helvetica-Bold").text("Event Type:");
        ["Wedding", "Conference", "Community Event", "Funeral / Janazah", "Birthday / Celebration", "Corporate Event", "Charity Event", "Religious Event", "Other (please specify):"].forEach(t => checkBox(t));
        doc.moveDown(0.3);
        blankLine("Event Date");
        blankLine("Start Time");
        blankLine("End Time");
        blankLine("Expected Number of Attendees");
        blankLine("Room / Venue Preference");

        // SECTION 3: Food & Catering
        section("3. Food & Catering");
        doc.fontSize(10).font("Helvetica-Bold").text("Food Required?");
        checkBox("Yes"); checkBox("No");
        doc.moveDown(0.3);
        blankLine("Number of Guests Requiring Food");
        doc.fontSize(10).font("Helvetica-Bold").text("Catering Type:");
        ["Internal (AQS Catering)", "External Caterer", "Self Catering", "None"].forEach(t => checkBox(t));
        doc.moveDown(0.3);
        doc.fontSize(10).font("Helvetica-Bold").text("Dietary Requirements (tick all that apply):");
        ["Halal", "Vegetarian", "Vegan"].forEach(t => checkBox(t));
        blankLine("Allergy Notes");
        blankLine("Food Preferences / Special Requests", 2);
        blankLine("Menu Choices (if known)", 2);
        doc.moveDown(0.3);
        doc.fontSize(10).font("Helvetica-Bold").text("Tea & Coffee Facilities Required?");
        checkBox("Yes"); checkBox("No");

        // SECTION 4: Linen (mandatory)
        section("4. Linen & Table Covers  \u2014  MANDATORY CHARGEABLE SERVICE");
        doc.fontSize(9).fillColor("#c0392b").font("Helvetica-Bold").text("All events must either hire linen from AQS (chargeable) or bring their own linen and table covers.");
        doc.fillColor("#000");
        doc.moveDown(0.3);
        doc.fontSize(10).font("Helvetica-Bold").text("Linen Option (please select one):");
        checkBox("Hire from AQS (chargeable) \u2014 please specify colours, style, quantity below");
        checkBox("Own linen / table covers");
        blankLine("Linen Notes (colours, style, quantity)", 2);

        // SECTION 5: Equipment & Furniture
        section("5. Equipment & Furniture");
        doc.fontSize(10).font("Helvetica-Bold").text("Tables Required?");
        checkBox("Yes  \u2014  How many? ____"); checkBox("No");
        doc.moveDown(0.3);
        doc.fontSize(10).font("Helvetica-Bold").text("Chairs Required?");
        checkBox("Yes  \u2014  How many? ____"); checkBox("No");
        doc.moveDown(0.3);
        doc.fontSize(10).font("Helvetica-Bold").text("Cutlery & Plates Required?");
        checkBox("Yes  \u2014  How many settings? ____"); checkBox("No");

        // SECTION 6: AV & Sound
        section("6. AV & Sound");
        doc.fontSize(10).font("Helvetica-Bold").text("Speakers Required?");
        checkBox("Yes"); checkBox("No");
        doc.moveDown(0.3);
        doc.fontSize(10).font("Helvetica-Bold").text("Microphone System Required?");
        checkBox("Yes"); checkBox("No");
        blankLine("AV Notes");

        // SECTION 7: Decor
        section("7. Decor");
        doc.fontSize(10).font("Helvetica-Bold").text("Decor Required?");
        checkBox("Yes"); checkBox("No");
        doc.moveDown(0.3);
        doc.fontSize(10).font("Helvetica-Bold").text("Decor Type:");
        ["Balloons", "Flowers", "Themed", "Minimal", "Other"].forEach(t => checkBox(t));
        blankLine("Decor Notes");

        // SECTION 8: Additional Rooms
        section("8. Additional Rooms");
        ["Meet & Greet Room", "Groom's Room", "Bride's Room"].forEach(t => {
          doc.fontSize(10).font("Helvetica-Bold").text(`${t}?`);
          checkBox("Yes"); checkBox("No"); doc.moveDown(0.2);
        });
        blankLine("Additional Room Notes");

        // SECTION 9: Parking & Beverages
        section("9. Parking & Beverages");
        doc.fontSize(10).font("Helvetica-Bold").text("Parking Required?");
        checkBox("Yes  \u2014  How many spaces? ____"); checkBox("No");
        doc.moveDown(0.3);
        doc.fontSize(10).font("Helvetica-Bold").text("Beverages Required?");
        checkBox("Yes"); checkBox("No");
        blankLine("Beverages Notes");

        // SECTION 10: Pricing & Notes
        section("10. Pricing & Additional Notes");
        blankLine("Agreed Hire Amount (\u00a3)");
        blankLine("Deposit Amount (\u00a3)");
        blankLine("Additional Notes / Requirements", 3);

        // Google Form link
        if (googleFormUrl) {
          doc.moveDown(1);
          doc.fontSize(10).font("Helvetica-Bold").fillColor("#1e3a5f").text("You can also complete this form online:");
          doc.fontSize(10).font("Helvetica").fillColor("#0000ee").text(googleFormUrl, { link: googleFormUrl, underline: true });
          doc.fillColor("#000");
        }

        // Signature
        doc.moveDown(1);
        section("Declaration");
        doc.fontSize(9).font("Helvetica").text("I confirm that the information provided above is accurate and I agree to the terms and conditions of the Abdullah Quilliam Society facilities hire.");
        doc.moveDown(1);
        doc.fontSize(10).font("Helvetica-Bold").text("Signature: ", { continued: true }).font("Helvetica").text("_______________________________   Date: ________________");
        doc.end();
      });

      const pdfBuffer = Buffer.concat(chunks);
      const key = `facility-forms/blank-enquiry-form-${Date.now()}.pdf`;
      const { url } = await storagePut(key, pdfBuffer, "application/pdf");

      return { url };
    }),

  // ── Send Blank Form via Email ─────────────────────────────────────────────────
  sendBlankFormEmail: protectedProcedure
    .input(z.object({
      toEmail: z.string().email(),
      toName: z.string(),
      subject: z.string().optional(),
      body: z.string().optional(),
      pdfUrl: z.string().optional(),
      googleFormUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { sendGmailMessage } = await import("../googleServices");
      const subject = input.subject || "Facilities Booking Enquiry Form \u2014 Abdullah Quilliam Society";
      let body = input.body || `AssalamuAlaikum wa Rahmatullahi wa Barakatuh,\n\nDear ${input.toName},\n\nThank you for your interest in hiring our facilities at the Abdullah Quilliam Society.\n\nPlease find our Facilities Booking Enquiry Form linked below. Kindly complete all sections and return it to us at your earliest convenience.`;
      if (input.pdfUrl) {
        body += `\n\n\ud83d\udcc4 Download / Print the form here:\n${input.pdfUrl}`;
      }
      if (input.googleFormUrl) {
        body += `\n\n\ud83d\udcbb Or complete the form online here:\n${input.googleFormUrl}`;
      }
      body += `\n\nIf you have any questions, please do not hesitate to contact us.\n\nJazakAllah Khair,\nAQS Facilities Team`;
      const result = await sendGmailMessage(input.toEmail, subject, body);
      return { success: result.success, messageId: result.messageId };
    }),
});

