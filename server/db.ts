import { eq, and, gte, lte, like, desc, sql, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, userPermissions, InsertUserPermissions,
  departments, expenseCategories,
  receipts, InsertReceipt, Receipt,
  fundraisingCampaigns, fundraisingItems, fundraisingDonations, fridayCollections,
  loanApplications, InsertLoanApplication, loanRepayments,
  incomeCategories, incomeRecords, InsertIncomeRecord,
  donors, InsertDonor,
  campaigns, InsertCampaign,
  staffProfiles, payrollRecords, InsertPayrollRecord,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); }
    catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

// ─── USERS & AUTH ─────────────────────────────────────────────────────────────

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
      values[field] = normalized; updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'superadmin'; updateSet.role = 'superadmin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

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

export async function createLocalUser(data: { name: string; email: string; passwordHash: string; role?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if this is the very first user — auto-approve as superadmin
  const existingCount = await db.select({ id: users.id }).from(users).limit(2);
  const isFirstUser = existingCount.length === 0;

  await db.insert(users).values({
    name: data.name, email: data.email, passwordHash: data.passwordHash,
    loginMethod: "local",
    role: isFirstUser ? "superadmin" : ((data.role as any) ?? "assistant"),
    status: isFirstUser ? "active" : "pending",
    isActive: isFirstUser,
    lastSignedIn: new Date(),
  });
  return (await getUserByEmail(data.email))!;
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ passwordHash, resetToken: null, resetTokenExpiry: null }).where(eq(users.id, userId));
}

export async function setResetToken(userId: number, token: string, expiry: Date) {
  const db = await getDb();
  if (!db) return;
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

export async function approveUser(userId: number, approvedById: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ status: "active", approvedById, approvedAt: new Date(), isActive: true }).where(eq(users.id, userId));
  const existing = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId)).limit(1);
  if (existing.length === 0) {
    await db.insert(userPermissions).values({ userId, canManageExpenses: true, canViewOwnPayslip: true });
  }
}

export async function rejectUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ status: "suspended", isActive: false }).where(eq(users.id, userId));
}

export async function getPendingUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(eq(users.status, "pending")).orderBy(desc(users.createdAt));
}

export async function listAllUsers(limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };
  const [rows, countResult] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(users),
  ]);
  return { rows, total: Number(countResult[0]?.count ?? 0) };
}

export async function updateUserRole(userId: number, role: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role: role as any }).where(eq(users.id, userId));
}

export async function setUserActive(userId: number, isActive: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ isActive, status: isActive ? "active" : "suspended" }).where(eq(users.id, userId));
}

export async function setDelegateApprover(superadminId: number, delegateId: number | null) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ delegateApproverId: delegateId }).where(eq(users.id, superadminId));
}

// ─── PERMISSIONS ──────────────────────────────────────────────────────────────

export async function getUserPermissions(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId)).limit(1);
  return result[0] ?? null;
}

export async function upsertUserPermissions(userId: number, perms: Partial<InsertUserPermissions>) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId)).limit(1);
  if (existing.length > 0) {
    await db.update(userPermissions).set(perms).where(eq(userPermissions.userId, userId));
  } else {
    await db.insert(userPermissions).values({ userId, ...perms });
  }
}

// ─── DEPARTMENTS & CATEGORIES ─────────────────────────────────────────────────

export async function getDepartments() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(departments).orderBy(departments.name);
}

export async function getExpenseCategories(departmentId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (departmentId) return db.select().from(expenseCategories).where(eq(expenseCategories.departmentId, departmentId));
  return db.select().from(expenseCategories).orderBy(expenseCategories.name);
}

export async function getAllCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(expenseCategories).orderBy(expenseCategories.name);
}

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

export async function seedDepartmentsAndCategories() {
  const db = await getDb();
  if (!db) return;
  const depts = [
    { name: "Mosque", description: "Mosque operations and facilities", color: "#1B4332" },
    { name: "Restaurant / Bistro", description: "Restaurant and bistro expenses", color: "#C9A84C" },
    { name: "Ramadan", description: "Ramadan events and consumables", color: "#2D6A4F" },
    { name: "Staff / Payroll", description: "Staff and payroll related expenses", color: "#40916C" },
  ];
  for (const dept of depts) {
    const existing = await db.select().from(departments).where(eq(departments.name, dept.name)).limit(1);
    if (existing.length === 0) await db.insert(departments).values(dept);
  }
  const allDepts = await db.select().from(departments);
  const deptMap = Object.fromEntries(allDepts.map(d => [d.name, d.id]));
  const cats = [
    { departmentId: deptMap["Mosque"], name: "Cleaning", color: "#52B788", icon: "sparkles" },
    { departmentId: deptMap["Mosque"], name: "Electricity", color: "#F4A261", icon: "zap" },
    { departmentId: deptMap["Mosque"], name: "Water", color: "#4CC9F0", icon: "droplets" },
    { departmentId: deptMap["Mosque"], name: "Utilities", color: "#7209B7", icon: "flame" },
    { departmentId: deptMap["Mosque"], name: "Heating", color: "#E63946", icon: "thermometer" },
    { departmentId: deptMap["Mosque"], name: "Lighting", color: "#FFD60A", icon: "lightbulb" },
    { departmentId: deptMap["Mosque"], name: "Plumbing", color: "#023E8A", icon: "wrench" },
    { departmentId: deptMap["Mosque"], name: "Facilities", color: "#6D6875", icon: "building" },
    { departmentId: deptMap["Restaurant / Bistro"], name: "Regular Grocery", color: "#2D6A4F", icon: "shopping-basket" },
    { departmentId: deptMap["Restaurant / Bistro"], name: "Old Sailor Purchases", color: "#1B4332", icon: "anchor" },
    { departmentId: deptMap["Restaurant / Bistro"], name: "Meat & Fast Food", color: "#E63946", icon: "beef" },
    { departmentId: deptMap["Restaurant / Bistro"], name: "Biryani Supplies", color: "#C9A84C", icon: "utensils" },
    { departmentId: deptMap["Restaurant / Bistro"], name: "Coffee Shop", color: "#6F4E37", icon: "coffee" },
    { departmentId: deptMap["Ramadan"], name: "Iftar Dates", color: "#C9A84C", icon: "moon" },
    { departmentId: deptMap["Ramadan"], name: "Consumables", color: "#52B788", icon: "package" },
    { departmentId: deptMap["Ramadan"], name: "Grand Iftar", color: "#1B4332", icon: "star" },
    { departmentId: deptMap["Ramadan"], name: "Family & Kids Events", color: "#F4A261", icon: "heart" },
    { departmentId: deptMap["Staff / Payroll"], name: "Volunteer Cash Payment", color: "#40916C", icon: "banknote" },
    { departmentId: deptMap["Staff / Payroll"], name: "Staff Bank Transfer", color: "#1B4332", icon: "building-2" },
    { departmentId: deptMap["Staff / Payroll"], name: "Training & Development", color: "#7209B7", icon: "graduation-cap" },
    { departmentId: deptMap["Staff / Payroll"], name: "Office Supplies", color: "#023E8A", icon: "paperclip" },
  ];
  for (const cat of cats) {
    if (!cat.departmentId) continue;
    const existing = await db.select().from(expenseCategories)
      .where(and(eq(expenseCategories.name, cat.name), eq(expenseCategories.departmentId, cat.departmentId))).limit(1);
    if (existing.length === 0) await db.insert(expenseCategories).values(cat);
  }
  // Income categories
  const incCats = [
    { name: "Student Accommodation", description: "Weekly/monthly student room payments", color: "#1B4332" },
    { name: "Internal Stalls", description: "Internal market stall rentals", color: "#C9A84C" },
    { name: "External Stalls", description: "External market stall rentals", color: "#40916C" },
    { name: "Office Rental", description: "Office space rentals", color: "#2D6A4F" },
    { name: "Coffee Shop Rental", description: "Coffee shop and restaurant area rentals", color: "#6F4E37" },
    { name: "Hall Hire", description: "Hall hire for weddings, birthdays, bazaars", color: "#7209B7" },
    { name: "Friday Collection", description: "Friday prayer donation collections", color: "#F4A261" },
  ];
  for (const cat of incCats) {
    const existing = await db.select().from(incomeCategories).where(eq(incomeCategories.name, cat.name)).limit(1);
    if (existing.length === 0) await db.insert(incomeCategories).values(cat);
  }
}

// ─── RECEIPTS ─────────────────────────────────────────────────────────────────

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
  userId?: number; categoryName?: string; vendor?: string;
  dateFrom?: Date; dateTo?: Date; status?: string;
  departmentId?: number; limit?: number; offset?: number;
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
  if (filter.departmentId) conditions.push(eq(receipts.departmentId, filter.departmentId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countResult] = await Promise.all([
    db.select().from(receipts).where(where).orderBy(desc(receipts.createdAt)).limit(filter.limit ?? 50).offset(filter.offset ?? 0),
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
  return db.select({
    categoryName: receipts.categoryName,
    total: sql<number>`COALESCE(SUM(CAST(${receipts.amount} AS DECIMAL(10,2))), 0)`,
    count: sql<number>`COUNT(*)`,
  }).from(receipts).where(and(...conditions)).groupBy(receipts.categoryName).orderBy(desc(sql`total`));
}

export async function getMonthlyTotal(userId: number, year: number, month: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const dateFrom = new Date(year, month - 1, 1);
  const dateTo = new Date(year, month, 0, 23, 59, 59);
  const result = await db.select({ total: sql<number>`COALESCE(SUM(CAST(${receipts.amount} AS DECIMAL(10,2))), 0)` })
    .from(receipts).where(and(eq(receipts.userId, userId), gte(receipts.receiptDate, dateFrom), lte(receipts.receiptDate, dateTo)));
  return Number(result[0]?.total ?? 0);
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

// ─── FUNDRAISING ──────────────────────────────────────────────────────────────

export async function getFundraisingCampaigns() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fundraisingCampaigns).orderBy(desc(fundraisingCampaigns.createdAt));
}

export async function getCampaignById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(fundraisingCampaigns).where(eq(fundraisingCampaigns.id, id)).limit(1);
  return result[0];
}

export async function createFundraisingCampaign(data: typeof fundraisingCampaigns.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(fundraisingCampaigns).values(data);
  const result = await db.select().from(fundraisingCampaigns).orderBy(desc(fundraisingCampaigns.createdAt)).limit(1);
  return result[0];
}

export async function updateCampaignAmount(campaignId: number, amount: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(fundraisingCampaigns).set({ currentAmount: sql`currentAmount + ${amount}` }).where(eq(fundraisingCampaigns.id, campaignId));
}

export async function getCampaignItems(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fundraisingItems).where(eq(fundraisingItems.campaignId, campaignId));
}

export async function getCampaignDonations(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fundraisingDonations).where(eq(fundraisingDonations.campaignId, campaignId)).orderBy(desc(fundraisingDonations.donatedAt));
}

export async function createDonation(data: typeof fundraisingDonations.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(fundraisingDonations).values(data);
  const result = await db.select().from(fundraisingDonations).orderBy(desc(fundraisingDonations.createdAt)).limit(1);
  return result[0];
}

export async function getFridayCollections(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fridayCollections).orderBy(desc(fridayCollections.collectionDate)).limit(limit);
}

export async function createFridayCollection(data: typeof fridayCollections.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(fridayCollections).values(data);
  const result = await db.select().from(fridayCollections).orderBy(desc(fridayCollections.createdAt)).limit(1);
  return result[0];
}

// ─── LOANS ────────────────────────────────────────────────────────────────────

export async function getLoans(status?: string) {
  const db = await getDb();
  if (!db) return [];
  if (status) return db.select().from(loanApplications).where(eq(loanApplications.status, status as any)).orderBy(desc(loanApplications.createdAt));
  return db.select().from(loanApplications).orderBy(desc(loanApplications.createdAt));
}

export async function getLoanById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(loanApplications).where(eq(loanApplications.id, id)).limit(1);
  return result[0];
}

export async function createLoan(data: InsertLoanApplication) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(loanApplications).values(data);
  const result = await db.select().from(loanApplications).orderBy(desc(loanApplications.createdAt)).limit(1);
  return result[0];
}

export async function updateLoan(id: number, data: Partial<InsertLoanApplication>) {
  const db = await getDb();
  if (!db) return;
  await db.update(loanApplications).set(data).where(eq(loanApplications.id, id));
}

export async function getLoanRepayments(loanId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(loanRepayments).where(eq(loanRepayments.loanId, loanId)).orderBy(desc(loanRepayments.paidAt));
}

export async function createLoanRepayment(data: typeof loanRepayments.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(loanRepayments).values(data);
  await db.update(loanApplications).set({ totalRepaid: sql`totalRepaid + ${data.amount}`, lastRepaymentDate: new Date() }).where(eq(loanApplications.id, data.loanId));
  const result = await db.select().from(loanRepayments).orderBy(desc(loanRepayments.createdAt)).limit(1);
  return result[0];
}

// ─── INCOME ───────────────────────────────────────────────────────────────────

export async function getIncomeCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(incomeCategories).orderBy(incomeCategories.name);
}

export async function getIncomeRecords(filters?: {
  categoryId?: number; paymentStatus?: string; startDate?: Date; endDate?: Date; limit?: number; offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.categoryId) conditions.push(eq(incomeRecords.categoryId, filters.categoryId));
  if (filters?.paymentStatus) conditions.push(eq(incomeRecords.paymentStatus, filters.paymentStatus as any));
  if (filters?.startDate) conditions.push(gte(incomeRecords.createdAt, filters.startDate));
  if (filters?.endDate) conditions.push(lte(incomeRecords.createdAt, filters.endDate));
  const query = db.select().from(incomeRecords);
  if (conditions.length > 0) query.where(and(...conditions));
  return query.orderBy(desc(incomeRecords.createdAt)).limit(filters?.limit ?? 100).offset(filters?.offset ?? 0);
}

export async function createIncomeRecord(data: InsertIncomeRecord) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(incomeRecords).values(data);
  const result = await db.select().from(incomeRecords).orderBy(desc(incomeRecords.createdAt)).limit(1);
  return result[0];
}

export async function updateIncomeRecord(id: number, data: Partial<InsertIncomeRecord>) {
  const db = await getDb();
  if (!db) return;
  await db.update(incomeRecords).set(data).where(eq(incomeRecords.id, id));
}

// ─── DONORS ───────────────────────────────────────────────────────────────────

export async function getDonors(filters?: { isRegular?: boolean; search?: string; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.isRegular !== undefined) conditions.push(eq(donors.isRegular, filters.isRegular));
  if (filters?.search) conditions.push(or(like(donors.name, `%${filters.search}%`), like(donors.email, `%${filters.search}%`)));
  const query = db.select().from(donors);
  if (conditions.length > 0) query.where(and(...conditions));
  return query.orderBy(desc(donors.totalGiven)).limit(filters?.limit ?? 100).offset(filters?.offset ?? 0);
}

export async function getDonorById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(donors).where(eq(donors.id, id)).limit(1);
  return result[0];
}

export async function createDonor(data: InsertDonor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(donors).values(data);
  const result = await db.select().from(donors).orderBy(desc(donors.createdAt)).limit(1);
  return result[0];
}

export async function updateDonor(id: number, data: Partial<InsertDonor>) {
  const db = await getDb();
  if (!db) return;
  await db.update(donors).set(data).where(eq(donors.id, id));
}

// ─── EMAIL CAMPAIGNS ──────────────────────────────────────────────────────────

export async function getEmailCampaigns() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
}

export async function getEmailCampaignById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return result[0];
}

export async function createEmailCampaign(data: InsertCampaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(campaigns).values(data);
  const result = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(1);
  return result[0];
}

export async function updateEmailCampaign(id: number, data: Partial<InsertCampaign>) {
  const db = await getDb();
  if (!db) return;
  await db.update(campaigns).set(data).where(eq(campaigns.id, id));
}

export async function getScheduledCampaigns() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaigns).where(and(eq(campaigns.status, "scheduled"), lte(campaigns.scheduledAt, new Date()))).orderBy(campaigns.scheduledAt);
}

// ─── STAFF & PAYROLL ──────────────────────────────────────────────────────────

export async function getStaffProfile(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(staffProfiles).where(eq(staffProfiles.userId, userId)).limit(1);
  return result[0];
}

export async function upsertStaffProfile(userId: number, data: Partial<typeof staffProfiles.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(staffProfiles).where(eq(staffProfiles.userId, userId)).limit(1);
  if (existing.length > 0) {
    await db.update(staffProfiles).set(data).where(eq(staffProfiles.userId, userId));
  } else {
    await db.insert(staffProfiles).values({ userId, ...data });
  }
}

export async function getPayrollRecords(userId?: number, year?: number, month?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  // userId > 0 means filter by specific user; userId=0 means unlinked records (skip filter)
  if (userId && userId > 0) conditions.push(eq(payrollRecords.userId, userId));
  if (year) conditions.push(eq(payrollRecords.year, year));
  if (month) conditions.push(eq(payrollRecords.month, month));
  const rows = await db
    .select({
      id: payrollRecords.id,
      userId: payrollRecords.userId,
      employeeName: payrollRecords.employeeName,
      month: payrollRecords.month,
      year: payrollRecords.year,
      grossPay: payrollRecords.grossPay,
      incomeTax: payrollRecords.incomeTax,
      nationalInsurance: payrollRecords.nationalInsurance,
      pensionContribution: payrollRecords.pensionContribution,
      otherDeductions: payrollRecords.otherDeductions,
      totalDeductions: payrollRecords.totalDeductions,
      netPay: payrollRecords.netPay,
      paymentMethod: payrollRecords.paymentMethod,
      paymentStatus: payrollRecords.paymentStatus,
      payslipUrl: payrollRecords.payslipUrl,
      chequeImageUrl: payrollRecords.chequeImageUrl,
      chequeNumber: payrollRecords.chequeNumber,
      chequeAmount: payrollRecords.chequeAmount,
      paidAt: payrollRecords.paidAt,
      notes: payrollRecords.notes,
      createdAt: payrollRecords.createdAt,
      updatedAt: payrollRecords.updatedAt,
      userName: users.name,
    })
    .from(payrollRecords)
    .leftJoin(users, eq(payrollRecords.userId, users.id))
    .$dynamic()
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(payrollRecords.year), desc(payrollRecords.month));
  // Merge: prefer employeeName over userName for display
  return rows.map(r => ({
    ...r,
    displayName: r.employeeName ?? r.userName ?? `User #${r.userId}`,
  }));
}

export async function createPayrollRecord(data: InsertPayrollRecord) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(payrollRecords).values(data);
  const result = await db.select().from(payrollRecords).orderBy(desc(payrollRecords.createdAt)).limit(1);
  return result[0];
}

export async function updatePayrollRecord(id: number, data: Partial<InsertPayrollRecord>) {
  const db = await getDb();
  if (!db) return;
  await db.update(payrollRecords).set(data).where(eq(payrollRecords.id, id));
}

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────

export async function getDashboardStats(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return null;
  const conditions = [];
  if (startDate) conditions.push(gte(receipts.receiptDate, startDate));
  if (endDate) conditions.push(lte(receipts.receiptDate, endDate));
  const expenseQuery = db.select({
    total: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL(10,2))), 0)`,
    count: sql<number>`COUNT(*)`,
  }).from(receipts);
  if (conditions.length > 0) expenseQuery.where(and(...conditions));
  const [expenseStats, incomeStats, loanStats, fundraisingStats, pendingUsers] = await Promise.all([
    expenseQuery,
    db.select({ total: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL(10,2))), 0)` }).from(incomeRecords).where(eq(incomeRecords.paymentStatus, "paid")),
    db.select({ total: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL(10,2))), 0)`, count: sql<number>`COUNT(*)` }).from(loanApplications).where(eq(loanApplications.status, "active")),
    db.select({ total: sql<number>`COALESCE(SUM(CAST(currentAmount AS DECIMAL(12,2))), 0)`, target: sql<number>`COALESCE(SUM(CAST(targetAmount AS DECIMAL(12,2))), 0)` }).from(fundraisingCampaigns).where(eq(fundraisingCampaigns.isActive, true)),
    db.select({ count: sql<number>`COUNT(*)` }).from(users).where(eq(users.status, "pending")),
  ]);
  return {
    totalExpenses: Number(expenseStats[0]?.total ?? 0),
    expenseCount: Number(expenseStats[0]?.count ?? 0),
    totalIncome: Number(incomeStats[0]?.total ?? 0),
    activeLoanTotal: Number(loanStats[0]?.total ?? 0),
    activeLoanCount: Number(loanStats[0]?.count ?? 0),
    fundraisingRaised: Number(fundraisingStats[0]?.total ?? 0),
    fundraisingTarget: Number(fundraisingStats[0]?.target ?? 0),
    pendingApprovals: Number(pendingUsers[0]?.count ?? 0),
  };
}
