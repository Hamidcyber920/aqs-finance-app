import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { conflictsOfInterest } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { logAudit } from "./auditTrail";

export const conflictsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(conflictsOfInterest).orderBy(desc(conflictsOfInterest.createdAt)).limit(200);
  }),

  create: protectedProcedure
    .input(z.object({
      trusteeId: z.number().int(),
      trusteeName: z.string().min(1),
      description: z.string().min(1),
      donorId: z.number().int().optional(),
      donorName: z.string().optional(),
      donationAmount: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(conflictsOfInterest).values({
        trusteeId: input.trusteeId,
        trusteeName: input.trusteeName,
        description: input.description,
        donorId: input.donorId ?? null,
        donorName: input.donorName ?? null,
        donationAmount: input.donationAmount ?? null,
        createdById: ctx.user.id,
        status: "open",
      });
      const id = (result as any).insertId as number;
      await logAudit({ userId: ctx.user.id, userName: ctx.user.name ?? ctx.user.email ?? undefined, action: "create", entity: "conflict_of_interest", entityId: id });
      return { id };
    }),

  resolve: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      resolution: z.string().min(1),
      status: z.enum(["resolved", "noted"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(conflictsOfInterest).set({
        resolution: input.resolution,
        status: input.status,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(conflictsOfInterest.id, input.id));
      await logAudit({ userId: ctx.user.id, userName: ctx.user.name ?? ctx.user.email ?? undefined, action: "resolve", entity: "conflict_of_interest", entityId: input.id });
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(conflictsOfInterest).where(eq(conflictsOfInterest.id, input.id));
      await logAudit({ userId: ctx.user.id, userName: ctx.user.name ?? ctx.user.email ?? undefined, action: "delete", entity: "conflict_of_interest", entityId: input.id });
      return { ok: true };
    }),
});
export type ConflictsRouter = typeof conflictsRouter;
