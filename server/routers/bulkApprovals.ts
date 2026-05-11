import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { bulkMessageApprovals } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

const APPROVAL_THRESHOLD = 50; // require second approver when recipient count > 50

export const bulkApprovalsRouter = router({
  // List pending approvals
  list: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "approved", "rejected"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db
        .select()
        .from(bulkMessageApprovals)
        .where(input.status ? eq(bulkMessageApprovals.status, input.status) : undefined)
        .orderBy(desc(bulkMessageApprovals.createdAt));
      return rows;
    }),

  // Request approval for a bulk message
  request: protectedProcedure
    .input(z.object({
      campaignId: z.number().int().optional(),
      recipientCount: z.number().int().min(1),
      messageSubject: z.string().optional(),
      messagePreview: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      if (input.recipientCount <= APPROVAL_THRESHOLD) {
        // No approval needed
        return { requiresApproval: false, id: null };
      }
      const [result] = await db.insert(bulkMessageApprovals).values({
        campaignId: input.campaignId ?? null,
        requestedById: ctx.user.id,
        requestedByName: ctx.user.name ?? null,
        recipientCount: input.recipientCount,
        messageSubject: input.messageSubject ?? null,
        messagePreview: input.messagePreview ?? null,
        status: "pending",
      });
      const id = (result as any).insertId;
      await notifyOwner({
        title: `📧 Bulk Message Approval Required — ${input.recipientCount} recipients`,
        content: `${ctx.user.name ?? "A user"} has requested approval to send a bulk message to ${input.recipientCount} recipients. Subject: "${input.messageSubject ?? "No subject"}". Please review and approve or reject approval request #${id}.`,
      });
      return { requiresApproval: true, id };
    }),

  // Review (approve or reject)
  review: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      decision: z.enum(["approved", "rejected"]),
      reviewNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(bulkMessageApprovals).where(eq(bulkMessageApprovals.id, input.id));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Approval request not found" });
      if (existing.requestedById === ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot approve your own bulk message request" });
      }
      await db.update(bulkMessageApprovals).set({
        status: input.decision,
        reviewedById: ctx.user.id,
        reviewedByName: ctx.user.name ?? null,
        reviewedAt: new Date(),
        reviewNotes: input.reviewNotes ?? null,
      }).where(eq(bulkMessageApprovals.id, input.id));
      return { ok: true, decision: input.decision };
    }),

  // Check if a campaign needs approval
  checkThreshold: protectedProcedure
    .input(z.object({ recipientCount: z.number().int() }))
    .query(({ input }) => {
      return {
        requiresApproval: input.recipientCount > APPROVAL_THRESHOLD,
        threshold: APPROVAL_THRESHOLD,
      };
    }),
});

export { APPROVAL_THRESHOLD };
