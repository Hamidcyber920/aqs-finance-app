import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { savedViews } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";

export const savedViewsRouter = router({
  list: protectedProcedure
    .input(z.object({ module: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (input.module) {
        return db.select().from(savedViews).where(sql`${savedViews.userId} = ${ctx.user.id} AND ${savedViews.module} = ${input.module}`).orderBy(desc(savedViews.createdAt));
      }
      return db.select().from(savedViews).where(eq(savedViews.userId, ctx.user.id)).orderBy(desc(savedViews.createdAt));
    }),

  save: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      module: z.string().default("donors"),
      filters: z.record(z.string(), z.unknown()),
      isDefault: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // If setting as default, unset other defaults for this user+module
      if (input.isDefault) {
        await db.update(savedViews).set({ isDefault: false }).where(
          sql`${savedViews.userId} = ${ctx.user.id} AND ${savedViews.module} = ${input.module}`
        );
      }
      const [result] = await db.insert(savedViews).values({
        userId: ctx.user.id,
        name: input.name,
        module: input.module,
        filters: input.filters,
        isDefault: input.isDefault,
      });
      return { id: (result as any).insertId as number };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(savedViews).where(sql`${savedViews.id} = ${input.id} AND ${savedViews.userId} = ${ctx.user.id}`);
      return { ok: true };
    }),
});
export type SavedViewsRouter = typeof savedViewsRouter;
