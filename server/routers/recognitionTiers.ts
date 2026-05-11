import { TRPCError } from "@trpc/server";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { recognitionTiers, fundraisingDonations } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";

export const recognitionTiersRouter = router({
  list: protectedProcedure
    .input(z.object({ campaignId: z.number().int().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      if (input.campaignId) {
        return db.select().from(recognitionTiers).where(eq(recognitionTiers.campaignId, input.campaignId)).orderBy(asc(recognitionTiers.sortOrder));
      }
      return db.select().from(recognitionTiers).orderBy(asc(recognitionTiers.sortOrder)).limit(200);
    }),

  upsert: protectedProcedure
    .input(z.object({
      id: z.number().int().optional(),
      campaignId: z.number().int().optional(),
      name: z.string().min(1),
      minAmount: z.string(),
      maxAmount: z.string().optional(),
      description: z.string().optional(),
      benefitDescription: z.string().optional(),
      color: z.string().optional().default("#4CAF50"),
      sortOrder: z.number().int().optional().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const data = {
        campaignId: input.campaignId ?? null,
        name: input.name,
        minAmount: input.minAmount,
        maxAmount: input.maxAmount ?? null,
        description: input.description ?? null,
        benefitDescription: input.benefitDescription ?? null,
        color: input.color ?? "#4CAF50",
        sortOrder: input.sortOrder ?? 0,
      };
      if (input.id) {
        await db.update(recognitionTiers).set(data).where(eq(recognitionTiers.id, input.id));
        return { id: input.id };
      }
      const [result] = await db.insert(recognitionTiers).values(data);
      return { id: (result as any).insertId as number };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(recognitionTiers).where(eq(recognitionTiers.id, input.id));
      return { ok: true };
    }),

  /**
   * Leaderboard: for a given campaign, aggregate each donor's total giving
   * and assign the highest tier they qualify for.
   */
  leaderboard: protectedProcedure
    .input(z.object({ campaignId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      // Get all tiers for this campaign sorted by minAmount ascending
      const tiers = await db
        .select()
        .from(recognitionTiers)
        .where(eq(recognitionTiers.campaignId, input.campaignId))
        .orderBy(asc(recognitionTiers.sortOrder));
      if (!tiers.length) return [];
      // Aggregate donations per donor for this campaign
      const rows = await db
        .select({
          donorName: fundraisingDonations.donorName,
          donorEmail: fundraisingDonations.donorEmail,
          donorLeadId: fundraisingDonations.donorLeadId,
          totalGiven: sql<string>`SUM(${fundraisingDonations.amount})`,
        })
        .from(fundraisingDonations)
        .where(eq(fundraisingDonations.campaignId, input.campaignId))
        .groupBy(
          fundraisingDonations.donorName,
          fundraisingDonations.donorEmail,
          fundraisingDonations.donorLeadId
        )
        .orderBy(sql`SUM(${fundraisingDonations.amount}) DESC`);
      // Sort tiers by minAmount descending to find the highest qualifying tier
      const sortedTiers = [...tiers].sort((a, b) => Number(b.minAmount) - Number(a.minAmount));
      return rows.map(row => {
        const total = Number(row.totalGiven);
        const tier = sortedTiers.find(t => total >= Number(t.minAmount)) ?? null;
        return { ...row, totalGiven: total, tier };
      });
    }),

  /** Seed default Hibba tiers for a campaign */
  seedDefaults: protectedProcedure
    .input(z.object({ campaignId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const defaults = [
        { name: "Foundation", minAmount: "100", maxAmount: "499", color: "#CD7F32", sortOrder: 1, description: "Foundation supporter — named on website" },
        { name: "Wall", minAmount: "500", maxAmount: "999", color: "#C0C0C0", sortOrder: 2, description: "Wall supporter — named on building plaque" },
        { name: "Roof", minAmount: "1000", maxAmount: "4999", color: "#FFD700", sortOrder: 3, description: "Roof supporter — named on main plaque" },
        { name: "Mihrab", minAmount: "5000", maxAmount: null, color: "#00BCD4", sortOrder: 4, description: "Mihrab patron — named on Mihrab dedication" },
      ];
      for (const tier of defaults) {
        await db.insert(recognitionTiers).values({ ...tier, campaignId: input.campaignId });
      }
      return { ok: true, seeded: defaults.length };
    }),
});
export type RecognitionTiersRouter = typeof recognitionTiersRouter;
