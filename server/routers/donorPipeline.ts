import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { donorPipeline, donorNotes } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { logAudit } from "./auditTrail";

const STAGES = ["identification", "qualification", "cultivation", "solicitation", "stewardship"] as const;

export const donorPipelineRouter = router({
  // List all pipeline entries, optionally filtered by stage
  list: protectedProcedure
    .input(z.object({
      stage: z.enum(STAGES).optional(),
      assignedToUserId: z.number().int().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const conditions = [];
      if (input.stage) conditions.push(eq(donorPipeline.stage, input.stage));
      if (input.assignedToUserId) conditions.push(eq(donorPipeline.assignedToUserId, input.assignedToUserId));
      const rows = await db
        .select()
        .from(donorPipeline)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(donorPipeline.updatedAt));
      return rows;
    }),

  // Get all pipeline entries grouped by stage (for Kanban)
  kanban: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const rows = await db.select().from(donorPipeline).orderBy(desc(donorPipeline.updatedAt));
    const grouped: Record<string, typeof rows> = {};
    for (const stage of STAGES) grouped[stage] = [];
    for (const row of rows) grouped[row.stage].push(row);
    return grouped;
  }),

  // Create a pipeline entry
  create: protectedProcedure
    .input(z.object({
      donorId: z.number().int(),
      donorName: z.string().optional(),
      stage: z.enum(STAGES).default("identification"),
      targetAmount: z.string().optional(),
      campaignId: z.number().int().optional(),
      assignedToUserId: z.number().int().optional(),
      assignedToName: z.string().optional(),
      nextAction: z.string().optional(),
      nextActionDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(donorPipeline).values({
        donorId: input.donorId,
        donorName: input.donorName ?? null,
        stage: input.stage,
        targetAmount: input.targetAmount ?? null,
        campaignId: input.campaignId ?? null,
        assignedToUserId: input.assignedToUserId ?? null,
        assignedToName: input.assignedToName ?? null,
        nextAction: input.nextAction ?? null,
        nextActionDate: input.nextActionDate ? new Date(input.nextActionDate) : null,
        notes: input.notes ?? null,
        stageChangedAt: new Date(),
        createdById: ctx.user.id,
      });
      const entryId = (result as any).insertId;
      await logAudit({
        userId: ctx.user.id,
        userName: ctx.user.name ?? ctx.user.email ?? undefined,
        action: "create",
        entity: "donor_pipeline",
        entityId: Number(entryId),
        meta: { donorId: input.donorId, stage: input.stage },
      });
      return { id: entryId };
    }),

  // Move a donor to a different stage
  moveStage: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      stage: z.enum(STAGES),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(donorPipeline).set({
        stage: input.stage,
        notes: input.notes ?? undefined,
        stageChangedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(donorPipeline.id, input.id));
      await logAudit({
        userId: ctx.user.id,
        userName: ctx.user.name ?? ctx.user.email ?? undefined,
        action: "move_stage",
        entity: "donor_pipeline",
        entityId: Number(input.id),
        meta: { stage: input.stage },
      });
      return { ok: true };
    }),

  // Update next action
  updateNextAction: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      nextAction: z.string(),
      nextActionDate: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(donorPipeline).set({
        nextAction: input.nextAction,
        nextActionDate: input.nextActionDate ? new Date(input.nextActionDate) : null,
        updatedAt: new Date(),
      }).where(eq(donorPipeline.id, input.id));
      return { ok: true };
    }),

  // Delete a pipeline entry
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(donorPipeline).where(eq(donorPipeline.id, input.id));
      return { ok: true };
    }),

  // Donor notes CRUD (nested under pipeline router for convenience)
  listNotes: protectedProcedure
    .input(z.object({ donorId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      return db.select().from(donorNotes).where(eq(donorNotes.donorId, input.donorId)).orderBy(desc(donorNotes.createdAt));
    }),

  addNote: protectedProcedure
    .input(z.object({
      donorId: z.number().int(),
      note: z.string().min(1),
      isPinned: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(donorNotes).values({
        donorId: input.donorId,
        note: input.note,
        isPinned: input.isPinned,
        createdById: ctx.user.id,
        createdByName: ctx.user.name ?? null,
      });
      return { id: (result as any).insertId };
    }),

  deleteNote: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(donorNotes).where(eq(donorNotes.id, input.id));
      return { ok: true };
    }),
});
