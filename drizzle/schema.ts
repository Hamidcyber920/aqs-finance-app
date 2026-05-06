import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  json,
  boolean,
  date,
} from "drizzle-orm/mysql-core";

// ─── USERS & AUTH ────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["superadmin", "trustee", "manager", "deputy", "assistant", "volunteer", "user", "admin", "property_manager"])
    .default("assistant")
    .notNull(),
  // Approval workflow
  status: mysqlEnum("status", ["pending", "active", "suspended"]).default("pending").notNull(),
  approvedById: int("approvedById"),
  approvedAt: timestamp("approvedAt"),
  delegateApproverId: int("delegateApproverId"), // superadmin can delegate approval to this user
  // Local auth
  passwordHash: varchar("passwordHash", { length: 255 }),
  resetToken: varchar("resetToken", { length: 128 }),
  resetTokenExpiry: timestamp("resetTokenExpiry"),
  isActive: boolean("isActive").default(true).notNull(),
  // Supervision hierarchy
  supervisedById: int("supervisedById"), // FK to users.id — who supervises this user
  isPropertyManager: boolean("isPropertyManager").default(false).notNull(),
  // Profile
  phone: varchar("phone", { length: 30 }),
  jobTitle: varchar("jobTitle", { length: 100 }),
  department: varchar("department", { length: 100 }),
  avatarUrl: text("avatarUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Per-user granular module permissions
export const userPermissions = mysqlTable("user_permissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  canViewDashboard: boolean("canViewDashboard").default(false).notNull(),
  canManageExpenses: boolean("canManageExpenses").default(true).notNull(),
  canViewAllExpenses: boolean("canViewAllExpenses").default(false).notNull(),
  canManageFundraising: boolean("canManageFundraising").default(false).notNull(),
  canManageLoans: boolean("canManageLoans").default(false).notNull(),
  canSignLoans: boolean("canSignLoans").default(false).notNull(),
  canManageIncome: boolean("canManageIncome").default(false).notNull(),
  canManagePayroll: boolean("canManagePayroll").default(false).notNull(),
  canViewOwnPayslip: boolean("canViewOwnPayslip").default(true).notNull(),
  canManageDonors: boolean("canManageDonors").default(false).notNull(),
  canSendCampaigns: boolean("canSendCampaigns").default(false).notNull(),
  canManageStaff: boolean("canManageStaff").default(false).notNull(),
  canManageUsers: boolean("canManageUsers").default(false).notNull(),
  canExportReports: boolean("canExportReports").default(false).notNull(),
  // Finance & Reporting
  canViewFinanceReports: boolean("canViewFinanceReports").default(false).notNull(),
  canExportFinanceReports: boolean("canExportFinanceReports").default(false).notNull(),
  canTrackFinance: boolean("canTrackFinance").default(false).notNull(),
  canViewAllIncome: boolean("canViewAllIncome").default(false).notNull(),
  canApproveExpenses: boolean("canApproveExpenses").default(false).notNull(),
  canManageInvoices: boolean("canManageInvoices").default(false).notNull(),
  // Cash & Collections
  canManageCashCollection: boolean("canManageCashCollection").default(false).notNull(),
  canManageFridayCollection: boolean("canManageFridayCollection").default(false).notNull(),
  canReconcileFriday: boolean("canReconcileFriday").default(false).notNull(),
  // Reconciliation
  canViewReconciliation: boolean("canViewReconciliation").default(false).notNull(),
  canManageReconciliation: boolean("canManageReconciliation").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserPermissions = typeof userPermissions.$inferSelect;
export type InsertUserPermissions = typeof userPermissions.$inferInsert;

// ─── DEPARTMENTS & EXPENSE CATEGORIES ────────────────────────────────────────

export const departments = mysqlTable("departments", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  color: varchar("color", { length: 20 }).default("#1B4332").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Department = typeof departments.$inferSelect;

export const expenseCategories = mysqlTable("expense_categories", {
  id: int("id").autoincrement().primaryKey(),
  departmentId: int("departmentId"),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).notNull().default("#6366f1"),
  icon: varchar("icon", { length: 50 }).notNull().default("tag"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ExpenseCategory = typeof expenseCategories.$inferSelect;

// ─── RECEIPTS / EXPENSES ─────────────────────────────────────────────────────

export const receipts = mysqlTable("receipts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  departmentId: int("departmentId"),
  departmentName: varchar("departmentName", { length: 100 }),
  vendor: varchar("vendor", { length: 255 }),
  receiptDate: timestamp("receiptDate"),
  amount: decimal("amount", { precision: 10, scale: 2 }),
  tax: decimal("tax", { precision: 10, scale: 2 }),
  categoryId: int("categoryId"),
  categoryName: varchar("categoryName", { length: 100 }),
  status: mysqlEnum("status", ["pending", "processing", "processed", "failed", "approved", "rejected"])
    .default("pending")
    .notNull(),
  approvedById: int("approvedById"),
  approvedAt: timestamp("approvedAt"),
  imageUrl: text("imageUrl"),
  thumbnailUrl: text("thumbnailUrl"),
  originalFilename: varchar("originalFilename", { length: 255 }),
  mimeType: varchar("mimeType", { length: 100 }),
  rawText: text("rawText"),
  lineItems: json("lineItems").$type<Array<{ description: string; amount: number }>>(),
  notes: text("notes"),
  currency: varchar("currency", { length: 10 }).default("GBP"),
  // Cheque payment fields
  isChequePayment: boolean("isChequePayment").default(false),
  chequeImageUrl: text("chequeImageUrl"),
  chequeNumber: varchar("chequeNumber", { length: 50 }),
  chequeIssuedAt: timestamp("chequeIssuedAt"),
  bankingStatus: mysqlEnum("bankingStatus", ["unbanked", "banked"]).default("unbanked"),
  bankedAt: timestamp("bankedAt"),
  paymentHeld: boolean("paymentHeld").default(false),
  heldAt: timestamp("heldAt"),
  heldReason: text("heldReason"),
  paidAt: timestamp("paidAt"),
  emailSentAt: timestamp("emailSentAt"),
  emailSentTo: varchar("emailSentTo", { length: 320 }),
  invoiceUrl: text("invoiceUrl"),
  // Authorisation workflow
  authorisedById: int("authorisedById"),
  authorisedByName: varchar("authorisedByName", { length: 200 }),
  authorisedAt: timestamp("authorisedAt"),
  rejectedById: int("rejectedById"),
  rejectedByName: varchar("rejectedByName", { length: 200 }),
  rejectedAt: timestamp("rejectedAt"),
  rejectionComment: text("rejectionComment"),
  deferredToMonth: int("deferredToMonth"),
  deferredToYear: int("deferredToYear"),
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid", "withheld"]).default("pending"),
  withheldAt: timestamp("withheldAt"),
  withheldReason: text("withheldReason"),
  chequeAmount: decimal("chequeAmount", { precision: 10, scale: 2 }),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Receipt = typeof receipts.$inferSelect;
export type InsertReceipt = typeof receipts.$inferInsert;

// ─── FUNDRAISING ─────────────────────────────────────────────────────────────

export const fundraisingCampaigns = mysqlTable("fundraising_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  targetAmount: decimal("targetAmount", { precision: 12, scale: 2 }).notNull(),
  currentAmount: decimal("currentAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  startDate: date("startDate"),
  endDate: date("endDate"),
  isActive: boolean("isActive").default(true).notNull(),
  imageUrl: text("imageUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FundraisingCampaign = typeof fundraisingCampaigns.$inferSelect;

export const fundraisingItems = mysqlTable("fundraising_items", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  targetQuantity: int("targetQuantity"),
  currentQuantity: int("currentQuantity").default(0),
  targetAmount: decimal("targetAmount", { precision: 10, scale: 2 }),
  currentAmount: decimal("currentAmount", { precision: 10, scale: 2 }).default("0"),
  type: mysqlEnum("type", ["fixed", "target"]).default("target").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FundraisingItem = typeof fundraisingItems.$inferSelect;

export const fundraisingDonations = mysqlTable("fundraising_donations", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  itemId: int("itemId"),
  donorName: varchar("donorName", { length: 200 }).notNull(),
  donorEmail: varchar("donorEmail", { length: 320 }),
  donorPhone: varchar("donorPhone", { length: 30 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "bank_transfer", "card", "cheque", "online"]).notNull(),
  evidenceUrl: text("evidenceUrl"),
  isFounding: boolean("isFounding").default(false).notNull(),
  certificateUrl: text("certificateUrl"),
  thankYouSent: boolean("thankYouSent").default(false).notNull(),
  notes: text("notes"),
  donatedAt: timestamp("donatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FundraisingDonation = typeof fundraisingDonations.$inferSelect;

// Friday collection entries
export const fridayCollections = mysqlTable("friday_collections", {
  id: int("id").autoincrement().primaryKey(),
  collectionDate: date("collectionDate").notNull(),
  bucketTotal: decimal("bucketTotal", { precision: 10, scale: 2 }).default("0").notNull(),
  cardTerminalTotal: decimal("cardTerminalTotal", { precision: 10, scale: 2 }).default("0").notNull(),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).default("0").notNull(),
  recordedById: int("recordedById").notNull(),
  notes: text("notes"),
  // Two-step authorisation
  authorisedById: int("authorisedById"),
  authorisedAt: timestamp("authorisedAt"),
  authorisedByName: varchar("authorisedByName", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FridayCollection = typeof fridayCollections.$inferSelect;

// ─── QARDE HASAN (INTEREST-FREE LOANS) ───────────────────────────────────────

export const loanApplications = mysqlTable("loan_applications", {
  id: int("id").autoincrement().primaryKey(),
  // Borrower details
  borrowerName: varchar("borrowerName", { length: 200 }).notNull(),
  borrowerEmail: varchar("borrowerEmail", { length: 320 }),
  borrowerPhone: varchar("borrowerPhone", { length: 30 }),
  borrowerAddress: text("borrowerAddress"),
  borrowerNiNumber: varchar("borrowerNiNumber", { length: 20 }),
  // Loan details
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  purpose: text("purpose").notNull(),
  termMonths: int("termMonths").notNull(),
  termValue: int("termValue"),
  termUnit: varchar("termUnit", { length: 10 }).default("months"),
  termNotes: text("termNotes"),
  monthlyRepayment: decimal("monthlyRepayment", { precision: 10, scale: 2 }),
  startDate: date("startDate"),
  endDate: date("endDate"),
  // Status
  status: mysqlEnum("status", ["draft", "pending_review", "approved", "active", "completed", "defaulted", "rejected"])
    .default("draft")
    .notNull(),
  // Signatures
  chairSignatureUrl: text("chairSignatureUrl"),
  chairSignedAt: timestamp("chairSignedAt"),
  chairSignedById: int("chairSignedById"),
  trusteeSignatureUrl: text("trusteeSignatureUrl"),
  trusteeSignedAt: timestamp("trusteeSignedAt"),
  trusteeSignedById: int("trusteeSignedById"),
  managerSignatureUrl: text("managerSignatureUrl"),
  managerSignedAt: timestamp("managerSignedAt"),
  managerSignedById: int("managerSignedById"),
  // Documents
  pdfUrl: text("pdfUrl"),
  evidenceUrl: text("evidenceUrl"), // bank transfer screenshot or cash receipt
  // Dual approval workflow
  adminApprovedById: int("adminApprovedById"),
  adminApprovedByName: varchar("adminApprovedByName", { length: 200 }),
  adminApprovedAt: timestamp("adminApprovedAt"),
  trusteeId: int("trusteeId"),
  trusteeName: varchar("trusteeName", { length: 200 }),
  trusteeApprovedAt: timestamp("trusteeApprovedAt"),
  agreementPdfUrl: text("agreementPdfUrl"),
  whatsappSentAt: timestamp("whatsappSentAt"),
  // Repayments
  totalRepaid: decimal("totalRepaid", { precision: 10, scale: 2 }).default("0"),
  lastRepaymentDate: timestamp("lastRepaymentDate"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LoanApplication = typeof loanApplications.$inferSelect;
export type InsertLoanApplication = typeof loanApplications.$inferInsert;

export const loanRepayments = mysqlTable("loan_repayments", {
  id: int("id").autoincrement().primaryKey(),
  loanId: int("loanId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "bank_transfer", "cheque"]).notNull(),
  evidenceUrl: text("evidenceUrl"),
  recordedById: int("recordedById").notNull(),
  paidAt: timestamp("paidAt").defaultNow().notNull(),
  notes: text("notes"),
  month: int("month"),
  year: int("year"),
  status: mysqlEnum("status", ["pending", "approved", "paid", "withheld"]).default("pending"),
  withheldAt: timestamp("withheldAt"),
  withheldReason: text("withheldReason"),
  chequeNumber: varchar("chequeNumber", { length: 50 }),
  chequeImageUrl: text("chequeImageUrl"),
  invoiceUrl: text("invoiceUrl"),
  // Authorisation workflow
  authorisedById: int("authorisedById"),
  authorisedByName: varchar("authorisedByName", { length: 200 }),
  authorisedAt: timestamp("authorisedAt"),
  rejectedById: int("rejectedById"),
  rejectedByName: varchar("rejectedByName", { length: 200 }),
  rejectedAt: timestamp("rejectedAt"),
  rejectionComment: text("rejectionComment"),
  deferredToMonth: int("deferredToMonth"),
  deferredToYear: int("deferredToYear"),
  // Repayment dual approval
  receivedConfirmedAt: timestamp("receivedConfirmedAt"),
  receivedConfirmedById: int("receivedConfirmedById"),
  adminApprovedById: int("adminApprovedById"),
  adminApprovedByName: varchar("adminApprovedByName", { length: 200 }),
  adminApprovedAt: timestamp("adminApprovedAt"),
  trusteeId: int("trusteeId"),
  trusteeName: varchar("trusteeName", { length: 200 }),
  trusteeApprovedAt: timestamp("trusteeApprovedAt"),
  confirmationPdfUrl: text("confirmationPdfUrl"),
  whatsappSentAt: timestamp("whatsappSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LoanRepayment = typeof loanRepayments.$inferSelect;

// ─── INCOME & ASSET MANAGEMENT ───────────────────────────────────────────────

export const incomeCategories = mysqlTable("income_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  color: varchar("color", { length: 20 }).default("#C9A84C").notNull(),
  // Comma-separated allowed periods: "daily,weekly,monthly,one_off" — null means all
  allowedPeriods: varchar("allowedPeriods", { length: 100 }),
  // Whether this category requires a free-text specification (e.g. Community Hire)
  requiresSpecification: boolean("requiresSpecification").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type IncomeCategory = typeof incomeCategories.$inferSelect;

export const incomeRecords = mysqlTable("income_records", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull(),
  categoryName: varchar("categoryName", { length: 100 }),
  // Tenant / payer details
  tenantName: varchar("tenantName", { length: 200 }).notNull(),
  tenantEmail: varchar("tenantEmail", { length: 320 }),
  tenantPhone: varchar("tenantPhone", { length: 30 }),
  // Room / unit (for student accommodation)
  roomNumber: varchar("roomNumber", { length: 50 }),
  // Financial
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("GBP"),
  period: mysqlEnum("period", ["weekly", "monthly", "one_off", "annual"]).default("monthly").notNull(),
  periodStart: date("periodStart"),
  periodEnd: date("periodEnd"),
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid", "overdue", "partial"]).default("pending").notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "bank_transfer", "card", "cheque"]),
  evidenceUrl: text("evidenceUrl"),
  notes: text("notes"),
  recordedById: int("recordedById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IncomeRecord = typeof incomeRecords.$inferSelect;
export type InsertIncomeRecord = typeof incomeRecords.$inferInsert;

// ─── DONORS ──────────────────────────────────────────────────────────────────

export const donors = mysqlTable("donors", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  address: text("address"),
  donorboxId: varchar("donorboxId", { length: 100 }),
  isRegular: boolean("isRegular").default(false).notNull(),
  totalGiven: decimal("totalGiven", { precision: 12, scale: 2 }).default("0").notNull(),
  lastGiftDate: date("lastGiftDate"),
  lastGiftAmount: decimal("lastGiftAmount", { precision: 10, scale: 2 }),
  preferredContact: mysqlEnum("preferredContact", ["email", "phone", "both"]).default("email"),
  notes: text("notes"),
  tags: json("tags").$type<string[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Donor = typeof donors.$inferSelect;
export type InsertDonor = typeof donors.$inferInsert;

// ─── EMAIL / SMS CAMPAIGNS ────────────────────────────────────────────────────

export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  type: mysqlEnum("type", ["email", "sms", "both"]).default("email").notNull(),
  subject: varchar("subject", { length: 300 }),
  body: text("body").notNull(),
  // Targeting
  targetAudience: mysqlEnum("targetAudience", ["all_donors", "regular_donors", "founding_members", "custom"])
    .default("all_donors")
    .notNull(),
  // Scheduling
  scheduledAt: timestamp("scheduledAt"),
  isRecurring: boolean("isRecurring").default(false).notNull(),
  recurringPattern: varchar("recurringPattern", { length: 100 }), // e.g. "monthly", "ramadan", "eid"
  // Status
  status: mysqlEnum("status", ["draft", "scheduled", "sending", "sent", "failed"]).default("draft").notNull(),
  sentAt: timestamp("sentAt"),
  sentCount: int("sentCount").default(0),
  failedCount: int("failedCount").default(0),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

// ─── STAFF PROFILES & PAYROLL ─────────────────────────────────────────────────

export const staffProfiles = mysqlTable("staff_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  fullName: varchar("fullName", { length: 200 }), // Display name (separate from OAuth username)
  niNumber: varchar("niNumber", { length: 20 }),
  taxCode: varchar("taxCode", { length: 20 }),
  bankName: varchar("bankName", { length: 100 }),
  bankAccountNumber: varchar("bankAccountNumber", { length: 20 }),
  bankSortCode: varchar("bankSortCode", { length: 10 }),
  startDate: date("startDate"),
  contractType: mysqlEnum("contractType", ["full_time", "part_time", "volunteer", "contractor"]).default("full_time"),
  paymentMethod: mysqlEnum("paymentMethod", ["bank_transfer", "cheque", "cash"]).default("bank_transfer"),
  annualSalary: decimal("annualSalary", { precision: 10, scale: 2 }),
  hourlyRate: decimal("hourlyRate", { precision: 8, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StaffProfile = typeof staffProfiles.$inferSelect;

export const payrollRecords = mysqlTable("payroll_records", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().default(0), // 0 = unlinked (name-only record)
  employeeName: varchar("employeeName", { length: 200 }), // free-text name when no user account
  month: int("month").notNull(), // 1-12
  year: int("year").notNull(),
  grossPay: decimal("grossPay", { precision: 10, scale: 2 }).notNull(),
  incomeTax: decimal("incomeTax", { precision: 10, scale: 2 }).default("0"),
  nationalInsurance: decimal("nationalInsurance", { precision: 10, scale: 2 }).default("0"),
  pensionContribution: decimal("pensionContribution", { precision: 10, scale: 2 }).default("0"),
  otherDeductions: decimal("otherDeductions", { precision: 10, scale: 2 }).default("0"),
  totalDeductions: decimal("totalDeductions", { precision: 10, scale: 2 }).default("0"),
  netPay: decimal("netPay", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["bank_transfer", "cheque", "cash"]).default("bank_transfer"),
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid", "withheld"]).default("pending").notNull(),
  payslipUrl: text("payslipUrl"), // Google Drive PDF URL
  driveFileId: varchar("driveFileId", { length: 200 }), // Google Drive file ID
  chequeImageUrl: text("chequeImageUrl"),
  chequeNumber: varchar("chequeNumber", { length: 50 }),
  chequeAmount: decimal("chequeAmount", { precision: 10, scale: 2 }),
  chequeIssuedAt: timestamp("chequeIssuedAt"),
  bankingStatus: mysqlEnum("bankingStatus", ["unbanked", "banked"]).default("unbanked"),
  bankedAt: timestamp("bankedAt"),
  paidAt: timestamp("paidAt"),
  withheldAt: timestamp("withheldAt"),
  withheldReason: text("withheldReason"),
  emailSentAt: timestamp("emailSentAt"),
  emailSentTo: varchar("emailSentTo", { length: 320 }),
  invoiceUrl: text("invoiceUrl"),
  notes: text("notes"),
  // Authorisation workflow
  authorisedById: int("authorisedById"),
  authorisedByName: varchar("authorisedByName", { length: 200 }),
  authorisedAt: timestamp("authorisedAt"),
  rejectedById: int("rejectedById"),
  rejectedByName: varchar("rejectedByName", { length: 200 }),
  rejectedAt: timestamp("rejectedAt"),
  rejectionComment: text("rejectionComment"),
  deferredToMonth: int("deferredToMonth"),
  deferredToYear: int("deferredToYear"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PayrollRecord = typeof payrollRecords.$inferSelect;
export type InsertPayrollRecord = typeof payrollRecords.$inferInsert;

// ─── VOLUNTEER PAYMENTS ───────────────────────────────────────────────────────

export const volunteerPayments = mysqlTable("volunteer_payments", {
  id: int("id").autoincrement().primaryKey(),
  // Recipient — either a linked user or a free-text name
  userId: int("userId"), // nullable — not all volunteers have accounts
  recipientName: varchar("recipientName", { length: 200 }).notNull(),
  recipientEmail: varchar("recipientEmail", { length: 320 }),
  // Payment details
  month: int("month").notNull(), // 1-12
  year: int("year").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "cheque", "bank_transfer"]).default("cash").notNull(),
  // Status workflow
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid", "withheld"]).default("pending").notNull(),
  paidAt: timestamp("paidAt"),
  withheldAt: timestamp("withheldAt"),
  withheldReason: text("withheldReason"),
  // Evidence
  chequeNumber: varchar("chequeNumber", { length: 50 }),
  chequeImageUrl: text("chequeImageUrl"),
  invoiceUrl: text("invoiceUrl"),
  // Banking
  bankingStatus: mysqlEnum("bankingStatus", ["unbanked", "banked"]).default("unbanked"),
  bankedAt: timestamp("bankedAt"),
  // Email
  emailSentAt: timestamp("emailSentAt"),
  emailSentTo: varchar("emailSentTo", { length: 320 }),
  notes: text("notes"),
  createdById: int("createdById").notNull(),
  // Authorisation workflow
  authorisedById: int("authorisedById"),
  authorisedByName: varchar("authorisedByName", { length: 200 }),
  authorisedAt: timestamp("authorisedAt"),
  rejectedById: int("rejectedById"),
  rejectedByName: varchar("rejectedByName", { length: 200 }),
  rejectedAt: timestamp("rejectedAt"),
  rejectionComment: text("rejectionComment"),
  deferredToMonth: int("deferredToMonth"),
  deferredToYear: int("deferredToYear"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VolunteerPayment = typeof volunteerPayments.$inferSelect;
export type InsertVolunteerPayment = typeof volunteerPayments.$inferInsert;

// ─── RECONCILIATION SESSIONS ──────────────────────────────────────────────────

export const reconciliationSessions = mysqlTable("reconciliation_sessions", {
  id: int("id").autoincrement().primaryKey(),
  month: int("month").notNull(), // 1-12
  year: int("year").notNull(),
  bankBalance: decimal("bankBalance", { precision: 12, scale: 2 }).default("0").notNull(),
  status: mysqlEnum("status", ["draft", "finalised"]).default("draft").notNull(),
  notes: text("notes"),
  finalisedAt: timestamp("finalisedAt"),
  finalisedById: int("finalisedById"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReconciliationSession = typeof reconciliationSessions.$inferSelect;
export type InsertReconciliationSession = typeof reconciliationSessions.$inferInsert;

// ─── INVOICES ─────────────────────────────────────────────────────────────────
export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  month: int("month").notNull(),
  year: int("year").notNull(),
  // Category / sub-category
  category: varchar("category", { length: 100 }).notNull(),
  subCategory: varchar("subCategory", { length: 100 }),
  // Description & vendor
  vendor: varchar("vendor", { length: 200 }),
  description: text("description"),
  invoiceNumber: varchar("invoiceNumber", { length: 100 }),
  invoiceDate: date("invoiceDate"),
  // Amount
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  // Payment
  paymentMethod: mysqlEnum("paymentMethod", ["cheque", "bank_transfer", "cash"]).default("cheque"),
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid", "withheld"]).default("pending").notNull(),
  paidAt: timestamp("paidAt"),
  withheldAt: timestamp("withheldAt"),
  withheldReason: text("withheldReason"),
  // Cheque details (AI-extracted)
  chequeNumber: varchar("chequeNumber", { length: 50 }),
  chequeDate: date("chequeDate"),
  chequeAmount: decimal("chequeAmount", { precision: 12, scale: 2 }),
  chequeImageUrl: text("chequeImageUrl"),
  // Evidence
  evidenceUrl: text("evidenceUrl"),
  // Authorisation
  authorisedById: int("authorisedById"),
  authorisedByName: varchar("authorisedByName", { length: 200 }),
  authorisedAt: timestamp("authorisedAt"),
  // Rejection / deferral
  rejectedById: int("rejectedById"),
  rejectedByName: varchar("rejectedByName", { length: 200 }),
  rejectedAt: timestamp("rejectedAt"),
  rejectionComment: text("rejectionComment"),
  deferredToMonth: int("deferredToMonth"),
  deferredToYear: int("deferredToYear"),
  // Audit
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

// ─── TRUSTEES ────────────────────────────────────────────────────────────────

export const trustees = mysqlTable("trustees", {
  id: int("id").autoincrement().primaryKey(),
  fullName: varchar("fullName", { length: 200 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  role: varchar("role", { length: 100 }).default("Trustee").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Trustee = typeof trustees.$inferSelect;
export type InsertTrustee = typeof trustees.$inferInsert;
