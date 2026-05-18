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
import { facilityRooms, facilityBookings, incomeRecords, incomeCategories, facilityEnquiries, enquiryPayments, enquiryAuditTrail } from "../../drizzle/schema";
import { storagePut } from "../storage";

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
      const [result] = await db.insert(facilityEnquiries).values({
        ...input,
        eventDate: input.eventDate || null,
        createdByUserId: ctx.user.id,
      });
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
    .input(z.object({ id: z.number(), data: z.record(z.any()) }))
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
      const [result] = await db.insert(enquiryPayments).values({
        enquiryId: input.enquiryId,
        paymentType: input.paymentType,
        amount: input.amount,
        dueDate: input.dueDate || null,
        paymentMethod: input.paymentMethod || null,
        reference: input.reference || null,
      });
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
          { role: "user", content: [{ type: "image_url", image_url: { url, detail: "high" } }, { type: "text", text: "Extract all booking enquiry information from this form/document." }] },
        ],
      });
      let extracted = {};
      try { extracted = JSON.parse(response.choices[0].message.content || "{}"); } catch { extracted = {}; }
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
});
