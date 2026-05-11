import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { qrCodes } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";

export const qrCodesRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(qrCodes).orderBy(desc(qrCodes.createdAt)).limit(200);
  }),

  create: protectedProcedure
    .input(z.object({
      campaignId: z.number().int().optional(),
      campaignName: z.string().optional(),
      label: z.string().optional(),
      targetUrl: z.string().url(),
      utmSource: z.string().optional(),
      utmMedium: z.string().optional(),
      utmCampaign: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Build the full URL with UTM params
      const url = new URL(input.targetUrl);
      if (input.utmSource) url.searchParams.set("utm_source", input.utmSource);
      if (input.utmMedium) url.searchParams.set("utm_medium", input.utmMedium);
      if (input.utmCampaign) url.searchParams.set("utm_campaign", input.utmCampaign);
      const [result] = await db.insert(qrCodes).values({
        campaignId: input.campaignId ?? null,
        campaignName: input.campaignName ?? null,
        label: input.label ?? null,
        targetUrl: url.toString(),
        utmSource: input.utmSource ?? null,
        utmMedium: input.utmMedium ?? null,
        utmCampaign: input.utmCampaign ?? null,
        createdById: ctx.user.id,
      });
      return { id: (result as any).insertId as number, url: url.toString() };
    }),

  incrementScan: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(qrCodes).set({ scanCount: db.$count(qrCodes) as any }).where(eq(qrCodes.id, input.id));
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(qrCodes).where(eq(qrCodes.id, input.id));
      return { ok: true };
    }),
});
export type QrCodesRouter = typeof qrCodesRouter;
