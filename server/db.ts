import { eq, and, gte, lte, like, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, receipts, expenseCategories, InsertReceipt, Receipt } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ── Categories ──────────────────────────────────────────────────────────────

export async function seedDefaultCategories() {
  const db = await getDb();
  if (!db) return;
  const defaults = [
    { name: "Catering & Food", color: "#f59e0b", icon: "utensils" },
    { name: "Utilities", color: "#3b82f6", icon: "zap" },
    { name: "Office Supplies", color: "#8b5cf6", icon: "package" },
    { name: "Maintenance & Repairs", color: "#ef4444", icon: "wrench" },
    { name: "Travel & Transport", color: "#10b981", icon: "car" },
    { name: "IT & Technology", color: "#06b6d4", icon: "monitor" },
    { name: "Events & Activities", color: "#f97316", icon: "calendar" },
    { name: "Printing & Stationery", color: "#84cc16", icon: "printer" },
    { name: "Cleaning & Hygiene", color: "#14b8a6", icon: "sparkles" },
    { name: "Other", color: "#6b7280", icon: "tag" },
  ];
  for (const cat of defaults) {
    await db.insert(expenseCategories).values(cat).onDuplicateKeyUpdate({ set: { color: cat.color } });
  }
}

export async function getAllCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(expenseCategories).orderBy(expenseCategories.name);
}

// ── Receipts ─────────────────────────────────────────────────────────────────

export async function createReceipt(data: InsertReceipt) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(receipts).values(data);
  return result.insertId as number;
}

export async function getReceiptById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(receipts).where(eq(receipts.id, id)).limit(1);
  return result[0];
}

export async function updateReceipt(id: number, data: Partial<InsertReceipt>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(receipts).set(data).where(eq(receipts.id, id));
}

export async function deleteReceipt(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(receipts).where(eq(receipts.id, id));
}

export interface ReceiptFilter {
  userId?: number;
  categoryName?: string;
  vendor?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function listReceipts(filter: ReceiptFilter = {}) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };

  const conditions = [];
  if (filter.userId) conditions.push(eq(receipts.userId, filter.userId));
  if (filter.categoryName) conditions.push(eq(receipts.categoryName, filter.categoryName));
  if (filter.vendor) conditions.push(like(receipts.vendor, `%${filter.vendor}%`));
  if (filter.dateFrom) conditions.push(gte(receipts.receiptDate, filter.dateFrom));
  if (filter.dateTo) conditions.push(lte(receipts.receiptDate, filter.dateTo));
  if (filter.status) conditions.push(eq(receipts.status, filter.status as Receipt["status"]));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select().from(receipts)
      .where(where)
      .orderBy(desc(receipts.createdAt))
      .limit(filter.limit ?? 50)
      .offset(filter.offset ?? 0),
    db.select({ count: sql<number>`count(*)` }).from(receipts).where(where),
  ]);

  return { rows, total: Number(countResult[0]?.count ?? 0) };
}

export async function getCategoryTotals(userId: number, dateFrom?: Date, dateTo?: Date) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(receipts.userId, userId)];
  if (dateFrom) conditions.push(gte(receipts.receiptDate, dateFrom));
  if (dateTo) conditions.push(lte(receipts.receiptDate, dateTo));

  return db
    .select({
      categoryName: receipts.categoryName,
      total: sql<number>`COALESCE(SUM(CAST(${receipts.amount} AS DECIMAL(10,2))), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(receipts)
    .where(and(...conditions))
    .groupBy(receipts.categoryName)
    .orderBy(desc(sql`total`));
}

export async function getMonthlyTotal(userId: number, year: number, month: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const dateFrom = new Date(year, month - 1, 1);
  const dateTo = new Date(year, month, 0, 23, 59, 59);
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(CAST(${receipts.amount} AS DECIMAL(10,2))), 0)` })
    .from(receipts)
    .where(and(eq(receipts.userId, userId), gte(receipts.receiptDate, dateFrom), lte(receipts.receiptDate, dateTo)));
  return Number(result[0]?.total ?? 0);
}

// ── Local Auth Helpers ────────────────────────────────────────────────────────

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function createLocalUser(data: {
  name: string;
  email: string;
  passwordHash: string;
  role?: "user" | "admin";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(users).values({
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    loginMethod: "local",
    role: data.role ?? "user",
    lastSignedIn: new Date(),
  });
  return result.insertId as number;
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordHash, resetToken: null, resetTokenExpiry: null }).where(eq(users.id, userId));
}

export async function setResetToken(userId: number, token: string, expiry: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ resetToken: token, resetTokenExpiry: expiry }).where(eq(users.id, userId));
}

export async function getUserByResetToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.resetToken, token)).limit(1);
  return result[0];
}

export async function updateLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

// ── Admin Helpers ─────────────────────────────────────────────────────────────

export async function listAllUsers(limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };
  const [rows, countResult] = await Promise.all([
    db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      loginMethod: users.loginMethod,
      isActive: users.isActive,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    }).from(users).orderBy(desc(users.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(users),
  ]);
  return { rows, total: Number(countResult[0]?.count ?? 0) };
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function setUserActive(userId: number, isActive: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ isActive }).where(eq(users.id, userId));
}

export async function getAdminReceiptStats() {
  const db = await getDb();
  if (!db) return { total: 0, processed: 0, pending: 0, failed: 0, totalAmount: 0 };
  const result = await db.select({
    total: sql<number>`COUNT(*)`,
    processed: sql<number>`SUM(CASE WHEN ${receipts.status} = 'processed' THEN 1 ELSE 0 END)`,
    pending: sql<number>`SUM(CASE WHEN ${receipts.status} IN ('pending','processing') THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN ${receipts.status} = 'failed' THEN 1 ELSE 0 END)`,
    totalAmount: sql<number>`COALESCE(SUM(CAST(${receipts.amount} AS DECIMAL(10,2))), 0)`,
  }).from(receipts);
  return result[0] ?? { total: 0, processed: 0, pending: 0, failed: 0, totalAmount: 0 };
}
