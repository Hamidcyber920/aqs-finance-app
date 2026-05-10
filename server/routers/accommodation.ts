import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import {
  getAllTenants, getTenantById, createTenant, updateTenant,
  getRentPaymentsForTenant, getAllRentPayments, createRentPayment, updateRentPayment,
  getUpcomingRentDue, getOverdueRentPayments,
} from "../db.accommodation";
import { getDb } from "../db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAdminOrManager(role: string) {
  return ["superadmin", "admin", "manager", "trustee"].includes(role);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const accommodationRouter = router({

  // ── Tenants ──────────────────────────────────────────────────────────────

  listTenants: protectedProcedure.query(async () => {
    return getAllTenants();
  }),

  getTenant: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const t = await getTenantById(input.id);
      if (!t) throw new TRPCError({ code: "NOT_FOUND" });
      return t;
    }),

  createTenant: protectedProcedure
    .input(z.object({
      fullName: z.string().min(1),
      email: z.string().email().optional().nullable(),
      phone: z.string().optional().nullable(),
      whatsappPhone: z.string().optional().nullable(),
      roomNumber: z.string().optional().nullable(),
      propertyAddress: z.string().optional().nullable(),
      contractStartDate: z.string().optional().nullable(),  // YYYY-MM-DD
      contractEndDate: z.string().optional().nullable(),    // YYYY-MM-DD
      rentAmount: z.string(),                               // decimal string
      rentFrequency: z.enum(["weekly", "monthly", "quarterly"]).default("monthly"),
      rentDueDay: z.number().int().min(1).max(28).default(1),
      depositAmount: z.string().optional().nullable(),
      depositPaidDate: z.string().optional().nullable(),
      depositNotes: z.string().optional().nullable(),
      emergencyContactName: z.string().optional().nullable(),
      emergencyContactPhone: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      contractDocUrl: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminOrManager(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const id = await createTenant(input as any);
      return { id };
    }),

  updateTenant: protectedProcedure
    .input(z.object({
      id: z.number(),
      fullName: z.string().min(1).optional(),
      email: z.string().email().optional().nullable(),
      phone: z.string().optional().nullable(),
      whatsappPhone: z.string().optional().nullable(),
      roomNumber: z.string().optional().nullable(),
      propertyAddress: z.string().optional().nullable(),
      contractStartDate: z.string().optional().nullable(),
      contractEndDate: z.string().optional().nullable(),
      rentAmount: z.string().optional(),
      rentFrequency: z.enum(["weekly", "monthly", "quarterly"]).optional(),
      rentDueDay: z.number().int().min(1).max(28).optional(),
      depositAmount: z.string().optional().nullable(),
      depositPaidDate: z.string().optional().nullable(),
      depositNotes: z.string().optional().nullable(),
      emergencyContactName: z.string().optional().nullable(),
      emergencyContactPhone: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      contractDocUrl: z.string().optional().nullable(),
      status: z.enum(["active", "inactive", "notice_given", "vacated"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminOrManager(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const { id, ...data } = input;
      await updateTenant(id, data as any);
      return { success: true };
    }),

  // ── Rent Payments ─────────────────────────────────────────────────────────

  listRentPayments: protectedProcedure
    .input(z.object({ tenantId: z.number().optional() }))
    .query(async ({ input }) => {
      if (input.tenantId) {
        return getRentPaymentsForTenant(input.tenantId);
      }
      return getAllRentPayments();
    }),

  createRentPayment: protectedProcedure
    .input(z.object({
      tenantId: z.number(),
      dueDate: z.string(),            // YYYY-MM-DD
      periodLabel: z.string(),
      periodStart: z.string(),        // YYYY-MM-DD
      periodEnd: z.string(),          // YYYY-MM-DD
      amountDue: z.string(),          // decimal string
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminOrManager(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const id = await createRentPayment({
        ...input,
        status: "pending",
      } as any);
      return { id };
    }),

  confirmPayment: protectedProcedure
    .input(z.object({
      id: z.number(),
      paidDate: z.string(),           // YYYY-MM-DD
      amountPaid: z.string().optional().nullable(),
      paymentMethod: z.enum(["bank_transfer", "cash", "cheque", "standing_order", "other"]).optional().nullable(),
      receiptUrl: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateRentPayment(id, {
        status: "paid",
        paidDate: data.paidDate as any,
        amountPaid: data.amountPaid ?? undefined,
        paymentMethod: data.paymentMethod ?? undefined,
        confirmedByUserId: ctx.user.id,
        confirmedByName: ctx.user.name ?? ctx.user.email ?? "Staff",
        confirmedAt: new Date(),
        receiptUrl: data.receiptUrl ?? null,
        notes: data.notes ?? null,
      } as any);
      return { success: true };
    }),

  markOverdue: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminOrManager(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await updateRentPayment(input.id, { status: "overdue" });
      return { success: true };
    }),

  // ── Dashboard helpers ─────────────────────────────────────────────────────

  upcomingRent: protectedProcedure
    .input(z.object({ daysAhead: z.number().default(7) }))
    .query(async ({ input }) => {
      return getUpcomingRentDue(input.daysAhead);
    }),

  overdueRent: protectedProcedure.query(async () => {
    return getOverdueRentPayments();
  }),

  // ── AI Document Extraction ────────────────────────────────────────────────

  extractTenantDocument: protectedProcedure
    .input(z.object({
      fileUrl: z.string().url(),
    }))
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a tenancy document extractor. Extract all available fields from the provided document and return JSON with these keys (use null for missing fields):
{
  "fullName": string | null,
  "email": string | null,
  "phone": string | null,
  "roomNumber": string | null,
  "contractStartDate": "YYYY-MM-DD" | null,
  "contractEndDate": "YYYY-MM-DD" | null,
  "rentAmount": string | null,
  "rentFrequency": "weekly" | "monthly" | "quarterly" | null,
  "depositAmount": string | null,
  "notes": string | null
}`,
          },
          {
            role: "user",
            content: `Please extract tenancy information from this document: ${input.fileUrl}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "tenancy_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                fullName: { type: ["string", "null"] },
                email: { type: ["string", "null"] },
                phone: { type: ["string", "null"] },
                roomNumber: { type: ["string", "null"] },
                contractStartDate: { type: ["string", "null"] },
                contractEndDate: { type: ["string", "null"] },
                rentAmount: { type: ["string", "null"] },
                rentFrequency: { type: ["string", "null"] },
                depositAmount: { type: ["string", "null"] },
                notes: { type: ["string", "null"] },
              },
              required: ["fullName", "email", "phone", "roomNumber", "contractStartDate", "contractEndDate", "rentAmount", "rentFrequency", "depositAmount", "notes"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = response.choices?.[0]?.message?.content ?? "{}";
      try {
        return JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
      } catch {
        return {};
      }
    }),

  // ── File Upload ───────────────────────────────────────────────────────────

  uploadFile: protectedProcedure
    .input(z.object({
      base64: z.string(),
      mimeType: z.string(),
      filename: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const buf = Buffer.from(input.base64, "base64");
      const key = `accommodation/${ctx.user.id}/${Date.now()}-${input.filename}`;
      const { url } = await storagePut(key, buf, input.mimeType);
      return { url };
    }),

  // ── Authorisation: Farid Ahmed tick ──────────────────────────────────────

  checkFarid: protectedProcedure
    .input(z.object({ id: z.number(), undo: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const { eq } = await import('drizzle-orm');
      const { accommodationRentPayments } = await import('../../drizzle/schema');
      await db.update(accommodationRentPayments)
        .set({ checkedByFaridAt: input.undo ? null : new Date() })
        .where(eq(accommodationRentPayments.id, input.id));
      return { success: true };
    }),

  // ── Authorisation: Mumin Khan tick ───────────────────────────────────────

  checkMumin: protectedProcedure
    .input(z.object({ id: z.number(), undo: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const { eq } = await import('drizzle-orm');
      const { accommodationRentPayments } = await import('../../drizzle/schema');
      await db.update(accommodationRentPayments)
        .set({ checkedByMuminAt: input.undo ? null : new Date() })
        .where(eq(accommodationRentPayments.id, input.id));
      return { success: true };
    }),

  // ── Trustee verification (Dr Abdul Hamid OR Galib Khan) ───────────────────

  trusteeVerify: protectedProcedure
    .input(z.object({ id: z.number(), trusteeName: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const { eq } = await import('drizzle-orm');
      const { accommodationRentPayments } = await import('../../drizzle/schema');
      await db.update(accommodationRentPayments)
        .set({
          trusteeVerifiedBy: input.trusteeName,
          trusteeVerifiedAt: input.trusteeName ? new Date() : null,
        })
        .where(eq(accommodationRentPayments.id, input.id));
      return { success: true };
    }),
});
