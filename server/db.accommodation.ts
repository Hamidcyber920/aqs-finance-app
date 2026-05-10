import { eq, and, desc, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  accommodationTenants,
  InsertAccommodationTenant,
  accommodationRentPayments,
  InsertAccommodationRentPayment,
} from "../drizzle/schema";

// ─── TENANTS ──────────────────────────────────────────────────────────────────

export async function getAllTenants() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accommodationTenants).orderBy(desc(accommodationTenants.createdAt));
}

export async function getTenantById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(accommodationTenants).where(eq(accommodationTenants.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createTenant(data: InsertAccommodationTenant) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(accommodationTenants).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateTenant(id: number, data: Partial<InsertAccommodationTenant>) {
  const db = await getDb();
  if (!db) return;
  await db.update(accommodationTenants).set(data).where(eq(accommodationTenants.id, id));
}

// ─── RENT PAYMENTS ────────────────────────────────────────────────────────────

export async function getRentPaymentsForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accommodationRentPayments)
    .where(eq(accommodationRentPayments.tenantId, tenantId))
    .orderBy(desc(accommodationRentPayments.dueDate));
}

export async function getAllRentPayments() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accommodationRentPayments).orderBy(desc(accommodationRentPayments.dueDate));
}

export async function createRentPayment(data: InsertAccommodationRentPayment) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(accommodationRentPayments).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateRentPayment(id: number, data: Partial<InsertAccommodationRentPayment>) {
  const db = await getDb();
  if (!db) return;
  await db.update(accommodationRentPayments).set(data).where(eq(accommodationRentPayments.id, id));
}

// ─── UPCOMING / OVERDUE HELPERS ───────────────────────────────────────────────

export async function getUpcomingRentDue(daysAhead: number) {
  const db = await getDb();
  if (!db) return [];
  const today = new Date();
  const future = new Date(today);
  future.setDate(future.getDate() + daysAhead);
  const todayStr = today.toISOString().split("T")[0];
  const futureStr = future.toISOString().split("T")[0];
  return db.select({
    payment: accommodationRentPayments,
    tenant: accommodationTenants,
  })
    .from(accommodationRentPayments)
    .innerJoin(accommodationTenants, eq(accommodationRentPayments.tenantId, accommodationTenants.id))
    .where(
      and(
        sql`${accommodationRentPayments.dueDate} >= ${todayStr}`,
        sql`${accommodationRentPayments.dueDate} <= ${futureStr}`,
        eq(accommodationRentPayments.status, "pending"),
      )
    )
    .orderBy(accommodationRentPayments.dueDate);
}

export async function getOverdueRentPayments() {
  const db = await getDb();
  if (!db) return [];
  const todayStr = new Date().toISOString().split("T")[0];
  return db.select({
    payment: accommodationRentPayments,
    tenant: accommodationTenants,
  })
    .from(accommodationRentPayments)
    .innerJoin(accommodationTenants, eq(accommodationRentPayments.tenantId, accommodationTenants.id))
    .where(
      and(
        sql`${accommodationRentPayments.dueDate} < ${todayStr}`,
        or(
          eq(accommodationRentPayments.status, "pending"),
          eq(accommodationRentPayments.status, "overdue"),
        )
      )
    )
    .orderBy(accommodationRentPayments.dueDate);
}
