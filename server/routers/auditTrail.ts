/**
 * Wave 5 – Audit Trail Router
 * Provides read access to the audit_log table with filtering, pagination, and export.
 * Write access is done inline by other procedures via the logAudit helper.
 */
import { z } from "zod";
import { desc, and, eq, gte, lte, like, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { auditLog } from "../../drizzle/schema";

// ── Helper: write an audit log entry ─────────────────────────────────────────
export async function logAudit(params: {
  userId?: number;
  userName?: string;
  action: string;
  entity: string;
  entityId?: number;
  meta?: Record<string, unknown>;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(auditLog).values({
      userId: params.userId ?? null,
      userName: params.userName ?? null,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      meta: params.meta ?? null,
    });
  } catch {
    // Non-critical — never let audit logging break the main flow
  }
}

// ── Router ────────────────────────────────────────────────────────────────────
export const auditTrailRouter = router({
  /** List audit log entries with optional filters and pagination */
  list: protectedProcedure
    .input(z.object({
      page:     z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(200).default(50),
      entity:   z.string().optional(),
      action:   z.string().optional(),
      userId:   z.number().int().optional(),
      search:   z.string().optional(),
      dateFrom: z.number().optional(),  // Unix ms
      dateTo:   z.number().optional(),  // Unix ms
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };

      const conditions = [];
      if (input.entity)   conditions.push(eq(auditLog.entity, input.entity));
      if (input.action)   conditions.push(eq(auditLog.action, input.action));
      if (input.userId)   conditions.push(eq(auditLog.userId, input.userId));
      if (input.search)   conditions.push(like(auditLog.userName, `%${input.search}%`));
      if (input.dateFrom) conditions.push(gte(auditLog.createdAt, new Date(input.dateFrom)));
      if (input.dateTo)   conditions.push(lte(auditLog.createdAt, new Date(input.dateTo)));

      const where = conditions.length ? and(...conditions) : undefined;
      const offset = (input.page - 1) * input.pageSize;

      const [rows, [{ total }]] = await Promise.all([
        db.select().from(auditLog)
          .where(where)
          .orderBy(desc(auditLog.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db.select({ total: sql<number>`count(*)` }).from(auditLog).where(where),
      ]);

      return { rows, total: Number(total) };
    }),

  /** Get distinct entity types for filter dropdown */
  getEntityTypes: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .selectDistinct({ entity: auditLog.entity })
      .from(auditLog)
      .orderBy(auditLog.entity);
    return rows.map(r => r.entity);
  }),

  /** Get distinct action types for filter dropdown */
  getActionTypes: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .selectDistinct({ action: auditLog.action })
      .from(auditLog)
      .orderBy(auditLog.action);
    return rows.map(r => r.action);
  }),

  /** Get audit log entries for a specific entity record */
  getForEntity: protectedProcedure
    .input(z.object({ entity: z.string(), entityId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(auditLog)
        .where(and(eq(auditLog.entity, input.entity), eq(auditLog.entityId, input.entityId)))
        .orderBy(desc(auditLog.createdAt))
        .limit(100);
    }),

  /** Summary stats: total entries, unique users, most active entity */
  stats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, uniqueUsers: 0, topEntity: null, todayCount: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [[{ total }], [{ uniqueUsers }], [{ todayCount }], topRows] = await Promise.all([
      db.select({ total: sql<number>`count(*)` }).from(auditLog),
      db.select({ uniqueUsers: sql<number>`count(distinct userId)` }).from(auditLog),
      db.select({ todayCount: sql<number>`count(*)` }).from(auditLog).where(gte(auditLog.createdAt, today)),
      db.select({ entity: auditLog.entity, cnt: sql<number>`count(*) as cnt` })
        .from(auditLog)
        .groupBy(auditLog.entity)
        .orderBy(desc(sql`cnt`))
        .limit(1),
    ]);

    return {
      total: Number(total),
      uniqueUsers: Number(uniqueUsers),
      todayCount: Number(todayCount),
      topEntity: topRows[0]?.entity ?? null,
    };
  }),
});
