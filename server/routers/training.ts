/**
 * Training Tracker Router
 *
 * Manages training records for staff, volunteers, and trustees.
 * Supports mandatory/optional courses, expiry tracking, and renewal reminders.
 * Uses the existing trainingRecords table in the schema.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { trainingRecords } from "../../drizzle/schema";
import { eq, desc, and, lte, gte, like, or } from "drizzle-orm";

const CATEGORIES = [
  "safeguarding", "health_safety", "fire_safety", "data_protection",
  "food_hygiene", "first_aid", "prevent_duty", "equality_diversity",
  "finance", "other"
] as const;

const STATUS_VALUES = ["pending", "completed", "expired", "expiring_soon"] as const;

export const trainingRouter = router({
  // ── List / search training records ──────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      staffName: z.string().optional(),
      module: z.string().optional(),
      status: z.enum(["all", ...STATUS_VALUES]).optional(),
      limit: z.number().optional().default(100),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      let rows = await db.select().from(trainingRecords)
        .orderBy(desc(trainingRecords.createdAt))
        .limit(input?.limit ?? 100);

      if (input?.staffName) {
        const q = input.staffName.toLowerCase();
        rows = rows.filter(r => (r.userName ?? r.userId?.toString() ?? "").toLowerCase().includes(q));
      }
      if (input?.module) {
        const q = input.module.toLowerCase();
        rows = rows.filter(r => r.module.toLowerCase().includes(q));
      }
      if (input?.status && input.status !== "all") {
        rows = rows.filter(r => r.status === input.status);
      }

      // Compute live status based on expiry
      const now = new Date();
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      return rows.map(r => {
        let liveStatus = r.status;
        if (r.expiresAt) {
          const exp = new Date(r.expiresAt);
          if (exp < now) liveStatus = "expired";
          else if (exp <= in30Days) liveStatus = "expiring_soon";
          else liveStatus = "completed";
        }
        return { ...r, liveStatus };
      });
    }),

  // ── Get a single record ──────────────────────────────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [record] = await db.select().from(trainingRecords).where(eq(trainingRecords.id, input.id));
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Record not found" });
      return record;
    }),

  // ── Add a training record ────────────────────────────────────────────────────
  add: protectedProcedure
    .input(z.object({
      userId: z.number().optional(),
      userName: z.string().min(1),
      module: z.string().min(1),
      provider: z.string().optional(),
      completedAt: z.string(),
      expiresAt: z.string().optional().nullable(),
      certificateUrl: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const now = new Date();
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      let status: "pending" | "completed" | "expired" | "expiring_soon" = "completed";
      if (expiresAt) {
        const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        if (expiresAt < now) status = "expired";
        else if (expiresAt <= in30Days) status = "expiring_soon";
      }

      const [result] = await db.insert(trainingRecords).values({
        userId: input.userId ?? ctx.user.id,
        userName: input.userName,
        module: input.module,
        provider: input.provider ?? null,
        completedAt: new Date(input.completedAt),
        expiresAt,
        certificateUrl: input.certificateUrl ?? null,
        status,
        notes: input.notes ?? null,
      }).$returningId();

      return { id: result.id, status };
    }),

  // ── Bulk enrol multiple staff onto a course ──────────────────────────────────
  bulkEnrol: protectedProcedure
    .input(z.object({
      module: z.string().min(1),
      provider: z.string().optional(),
      completedAt: z.string(),
      expiresAt: z.string().optional().nullable(),
      notes: z.string().optional(),
      // Each staff member: name (required), userId optional
      staff: z.array(z.object({
        userName: z.string().min(1),
        userId: z.number().optional(),
      })).min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const now = new Date();
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      let status: "pending" | "completed" | "expired" | "expiring_soon" = "completed";
      if (expiresAt) {
        const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        if (expiresAt < now) status = "expired";
        else if (expiresAt <= in30Days) status = "expiring_soon";
      }

      const completedAt = new Date(input.completedAt);
      const inserted: number[] = [];

      for (const member of input.staff) {
        const [result] = await db.insert(trainingRecords).values({
          userId: (member.userId ?? 0) as any,
          userName: member.userName,
          module: input.module,
          provider: input.provider ?? null,
          completedAt: completedAt as any,
          expiresAt: expiresAt as any,
          certificateUrl: null,
          status,
          notes: input.notes ?? null,
        }).$returningId();
        inserted.push(result.id);
      }

      return { inserted: inserted.length, ids: inserted };
    }),

  // ── Update a training record ─────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      userName: z.string().optional(),
      module: z.string().optional(),
      provider: z.string().optional(),
      completedAt: z.string().optional(),
      expiresAt: z.string().optional().nullable(),
      certificateUrl: z.string().optional(),
      notes: z.string().optional(),
      status: z.enum(STATUS_VALUES).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, completedAt, expiresAt, ...rest } = input;
      await db.update(trainingRecords).set({
        ...rest,
        completedAt: completedAt ? new Date(completedAt) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : expiresAt === null ? null : undefined,
      }).where(eq(trainingRecords.id, id));
      return { success: true };
    }),

  // ── Delete a training record ─────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(trainingRecords).where(eq(trainingRecords.id, input.id));
      return { success: true };
    }),

  // ── Summary / matrix ─────────────────────────────────────────────────────────
  summary: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const all = await db.select().from(trainingRecords);
      const now = new Date();
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const expired = all.filter(r => r.expiresAt && new Date(r.expiresAt) < now);
      const expiringSoon = all.filter(r => r.expiresAt && new Date(r.expiresAt) >= now && new Date(r.expiresAt) <= in30Days);
      const valid = all.filter(r => !r.expiresAt || new Date(r.expiresAt) > in30Days);

      // Unique staff
      const staffSet = new Set(all.map(r => r.userName ?? r.userId?.toString() ?? "Unknown"));
      // Unique modules
      const moduleSet = new Set(all.map(r => r.module));

      // Per-staff completion matrix
      const staffList = Array.from(staffSet);
      const moduleList = Array.from(moduleSet);
      const matrix = staffList.map(staff => {
        const staffRecords = all.filter(r => (r.userName ?? r.userId?.toString()) === staff);
        return {
          staff,
          modules: moduleList.map(mod => {
            const rec = staffRecords.find(r => r.module === mod);
            if (!rec) return { module: mod, status: "missing" as const };
            if (rec.expiresAt && new Date(rec.expiresAt) < now) return { module: mod, status: "expired" as const };
            if (rec.expiresAt && new Date(rec.expiresAt) <= in30Days) return { module: mod, status: "expiring_soon" as const };
            return { module: mod, status: "valid" as const };
          }),
        };
      });

      return {
        total: all.length,
        valid: valid.length,
        expiringSoon: expiringSoon.length,
        expired: expired.length,
        staffCount: staffList.length,
        moduleCount: moduleList.length,
        modules: moduleList,
        matrix,
        urgentActions: [
          ...expired.map(r => ({ type: "expired" as const, staff: r.userName ?? "Unknown", module: r.module, date: r.expiresAt })),
          ...expiringSoon.map(r => ({ type: "expiring_soon" as const, staff: r.userName ?? "Unknown", module: r.module, date: r.expiresAt })),
        ].sort((a, b) => (a.date ? new Date(a.date).getTime() : 0) - (b.date ? new Date(b.date).getTime() : 0)),
      };
    }),
});
