import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { majorDonorDueDiligence } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

const DUE_DILIGENCE_THRESHOLD = 25000; // £25,000

export const majorDonorRouter = router({
  // List all due diligence cases
  list: protectedProcedure
    .input(z.object({
      status: z.enum(["open", "cleared", "escalated", "sir_filed"]).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const conditions = [];
      if (input.status) conditions.push(eq(majorDonorDueDiligence.status, input.status));
      return db
        .select()
        .from(majorDonorDueDiligence)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(majorDonorDueDiligence.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // Get a single case
  getById: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.select().from(majorDonorDueDiligence).where(eq(majorDonorDueDiligence.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });
      return row;
    }),

  // Trigger a new due diligence case (called when donation ≥ £25k)
  trigger: protectedProcedure
    .input(z.object({
      donorId: z.number().int().optional(),
      donorName: z.string().optional(),
      donationAmount: z.string(),
      donationSource: z.string().optional(),
      donationRef: z.string().optional(),
      isAnonymous: z.boolean().default(false),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const amount = parseFloat(input.donationAmount);
      const sanctionsRequired = amount >= DUE_DILIGENCE_THRESHOLD;
      const [result] = await db.insert(majorDonorDueDiligence).values({
        donorId: input.donorId ?? null,
        donorName: input.donorName ?? null,
        donationAmount: input.donationAmount,
        donationSource: input.donationSource ?? null,
        donationRef: input.donationRef ?? null,
        isAnonymous: input.isAnonymous,
        sanctionsCheckStatus: sanctionsRequired ? "pending" : "not_required",
        trusteeSignOffRequired: amount >= DUE_DILIGENCE_THRESHOLD,
        status: "open",
        notes: input.notes ?? null,
      });
      const caseId = (result as any).insertId;
      // Notify owner
      await notifyOwner({
        title: `⚠️ Major Donor Due Diligence Required — £${amount.toLocaleString()}`,
        content: `A donation of £${amount.toLocaleString()} from ${input.donorName ?? "Anonymous"} requires due diligence review. Case #${caseId} has been opened. Please review sanctions check and obtain trustee sign-off.`,
      });
      return { id: caseId };
    }),

  // Update sanctions check status
  updateSanctionsCheck: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      sanctionsCheckStatus: z.enum(["pending", "clear", "flagged", "not_required"]),
      sanctionsCheckNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(majorDonorDueDiligence).set({
        sanctionsCheckStatus: input.sanctionsCheckStatus,
        sanctionsCheckNotes: input.sanctionsCheckNotes ?? null,
        sanctionsCheckedAt: new Date(),
        sanctionsCheckedById: ctx.user.id,
        updatedAt: new Date(),
      }).where(eq(majorDonorDueDiligence.id, input.id));
      return { ok: true };
    }),

  // Trustee sign-off
  trusteeSignOff: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      notes: z.string().optional(),
      escalate: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Only trustees and superadmins may sign off on major donor due diligence
      if (!(["trustee", "superadmin"] as string[]).includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only trustees may sign off on major donor due diligence cases" });
      }
      const newStatus = input.escalate ? "escalated" : "cleared";
      await db.update(majorDonorDueDiligence).set({
        trusteeSignOffUserId: ctx.user.id,
        trusteeSignOffAt: new Date(),
        trusteeSignOffNotes: input.notes ?? null,
        status: newStatus,
        updatedAt: new Date(),
      }).where(eq(majorDonorDueDiligence.id, input.id));
      return { ok: true, status: newStatus };
    }),

  // File a Serious Incident Report
  fileSIR: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(majorDonorDueDiligence).set({
        sirRequired: true,
        sirFiledAt: new Date(),
        status: "sir_filed",
        notes: input.notes ?? null,
        updatedAt: new Date(),
      }).where(eq(majorDonorDueDiligence.id, input.id));
      await notifyOwner({
        title: "🚨 Serious Incident Report Filed",
        content: `A Serious Incident Report has been filed for due diligence case #${input.id}. Please notify the Charity Commission within 7 days.`,
      });
      return { ok: true };
    }),
});

export { DUE_DILIGENCE_THRESHOLD };
