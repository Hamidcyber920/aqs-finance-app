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
  isOwnerDelegate: boolean("isOwnerDelegate").default(false).notNull(), // designated emergency succession delegate
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
  // CRM linkage
  donorLeadId: int("donorLeadId"),
  // Gift Aid
  giftAidDeclared: boolean("giftAidDeclared").default(false).notNull(),
  giftAidAddress: text("giftAidAddress"),
  giftAidSignedAt: timestamp("giftAidSignedAt"),
  giftAidIpAddress: varchar("giftAidIpAddress", { length: 45 }),
  // Sadaqah Jariyah beneficiaries (JSON array of {name, relation, dua})
  beneficiaryNames: text("beneficiaryNames"),
  // Payment reference
  referenceCode: varchar("referenceCode", { length: 50 }),
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
  // Cash withheld sub-entry (dual authority)
  cashWithheld: decimal("cashWithheld", { precision: 10, scale: 2 }),
  cashWithheldReason: text("cashWithheldReason"),
  cashWithheldRecordedById: int("cashWithheldRecordedById"),
  cashWithheldRecordedAt: timestamp("cashWithheldRecordedAt"),
  cashWithheldRecordedByName: varchar("cashWithheldRecordedByName", { length: 200 }),
  cashWithheldConfirmedById: int("cashWithheldConfirmedById"),
  cashWithheldConfirmedAt: timestamp("cashWithheldConfirmedAt"),
  cashWithheldConfirmedByName: varchar("cashWithheldConfirmedByName", { length: 200 }),
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
  // Waqf / Donation Conversion
  waqfConvertedAt: timestamp("waqfConvertedAt"),
  waqfCertificateUrl: text("waqfCertificateUrl"),
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
  dueDate: timestamp("dueDate"),
  lenderConfirmedAt: timestamp("lenderConfirmedAt"),
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
  subcategory: varchar("subcategory", { length: 150 }),
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
  // Friday Collections breakdown fields
  bucketCollection: decimal("bucketCollection", { precision: 10, scale: 2 }),
  cardPayment: decimal("cardPayment", { precision: 10, scale: 2 }),
  cashWithheld: decimal("cashWithheld", { precision: 10, scale: 2 }),
  cashWithheldReason: varchar("cashWithheldReason", { length: 300 }),
  totalBanked: decimal("totalBanked", { precision: 10, scale: 2 }),
  totalBankedDate: varchar("totalBankedDate", { length: 50 }),
  // Sign-off fields (legacy)
  signedByManager: varchar("signedByManager", { length: 200 }),
  signedByTrustee: varchar("signedByTrustee", { length: 200 }),
  signedAt: timestamp("signedAt"),
  // Two-step authorisation: Farid Ahmed + Mumin Khan
  checkedByFaridAt: timestamp("checkedByFaridAt"),
  checkedByMuminAt: timestamp("checkedByMuminAt"),
  // Trustee verification (Dr Abdul Hamid OR Galib Khan)
  trusteeVerifiedBy: varchar("trusteeVerifiedBy", { length: 200 }),
  trusteeVerifiedAt: timestamp("trusteeVerifiedAt"),
  // Rental date range
  rentalDateFrom: date("rentalDateFrom"),
  rentalDateTo: date("rentalDateTo"),
  // Additional evidence
  evidenceUrl2: text("evidenceUrl2"),
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

// ─── INCOME DONORS (links income records to donor profiles) ─────────────────

export const incomeDonors = mysqlTable("income_donors", {
  id: int("id").autoincrement().primaryKey(),
  incomeRecordId: int("incomeRecordId").notNull(),
  donorId: int("donorId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type IncomeDonor = typeof incomeDonors.$inferSelect;
export type InsertIncomeDonor = typeof incomeDonors.$inferInsert;

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
  // Extended profile fields
  dateOfBirth: date("dateOfBirth"),
  addressLine1: varchar("addressLine1", { length: 255 }),
  addressLine2: varchar("addressLine2", { length: 255 }),
  city: varchar("city", { length: 100 }),
  postcode: varchar("postcode", { length: 20 }),
  // Next of kin
  nokName: varchar("nokName", { length: 200 }),
  nokPhone: varchar("nokPhone", { length: 30 }),
  nokEmail: varchar("nokEmail", { length: 320 }),
  nokRelationship: varchar("nokRelationship", { length: 100 }),
  seniorityOrder: int("seniorityOrder").default(99).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Trustee = typeof trustees.$inferSelect;
export type InsertTrustee = typeof trustees.$inferInsert;

// ─── ORGANISATION CHART ───────────────────────────────────────────────────────
export const orgMembers = mysqlTable("org_members", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  department: varchar("department", { length: 200 }),
  photoUrl: text("photoUrl"),
  parentId: int("parentId"),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OrgMember = typeof orgMembers.$inferSelect;
export type InsertOrgMember = typeof orgMembers.$inferInsert;

// ─── SYSTEM BACKUPS ───────────────────────────────────────────────────────────
export const systemBackups = mysqlTable("system_backups", {
  id: int("id").autoincrement().primaryKey(),
  filename: varchar("filename", { length: 300 }).notNull(),
  s3Key: varchar("s3Key", { length: 500 }).notNull(),
  s3Url: text("s3Url").notNull(),
  sizeBytes: int("sizeBytes").default(0).notNull(),
  tableCount: int("tableCount").default(0).notNull(),
  recordCount: int("recordCount").default(0).notNull(),
  triggeredBy: varchar("triggeredBy", { length: 50 }).default("scheduled").notNull(),
  triggeredByUserId: int("triggeredByUserId"),
  triggeredByName: varchar("triggeredByName", { length: 200 }),
  status: mysqlEnum("status", ["success", "failed"]).default("success").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SystemBackup = typeof systemBackups.$inferSelect;
export type InsertSystemBackup = typeof systemBackups.$inferInsert;

// ─── COMMUNICATIONS HUB ───────────────────────────────────────────────────────

export const commChannels = mysqlTable("comm_channels", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }).default("hash").notNull(),
  color: varchar("color", { length: 30 }).default("#635BFF").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  isEditable: boolean("isEditable").default(true).notNull(),
  // Comma-separated roles that belong to this channel (e.g. "trustee,chair")
  memberRoles: varchar("memberRoles", { length: 500 }),
  // JSON array of trustee IDs explicitly added to channel (overrides role-based if set)
  channelMemberIds: text("channelMemberIds"),
  // Optional WhatsApp group invite link for this channel
  whatsappGroupLink: varchar("whatsappGroupLink", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CommChannel = typeof commChannels.$inferSelect;
export type InsertCommChannel = typeof commChannels.$inferInsert;

export const commMessages = mysqlTable("comm_messages", {
  id: int("id").autoincrement().primaryKey(),
  channelId: int("channelId").notNull(),
  // direction: "sent" = we sent it, "received" = incoming
  direction: mysqlEnum("direction", ["sent", "received"]).default("sent").notNull(),
  fromName: varchar("fromName", { length: 200 }),
  fromEmail: varchar("fromEmail", { length: 320 }),
  toEmailsJson: text("toEmailsJson"),       // JSON array of {name, email}
  whatsappNumbersJson: text("whatsappNumbersJson"), // JSON array of {name, phone}
  subject: varchar("subject", { length: 500 }),
  body: text("body"),
  isRead: boolean("isRead").default(true).notNull(),
  isReplied: boolean("isReplied").default(false).notNull(),
  repliedAt: timestamp("repliedAt"),
  // Scheduled send support
  scheduledAt: timestamp("scheduledAt"),   // null = send immediately
  sendStatus: mysqlEnum("sendStatus", ["pending", "sent", "failed"]).default("sent").notNull(),
  // Reply tracking
  replyStatus: mysqlEnum("replyStatus", ["awaiting", "replied", "none"]).default("none").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CommMessage = typeof commMessages.$inferSelect;
export type InsertCommMessage = typeof commMessages.$inferInsert;

// ─── COMM TEMPLATES ──────────────────────────────────────────────────────────

export const commTemplates = mysqlTable("comm_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 100 }).default("General").notNull(),
  subject: varchar("subject", { length: 500 }),
  body: text("body"),
  priority: varchar("priority", { length: 50 }).default("Normal"),
  replyBy: varchar("replyBy", { length: 100 }),
  actionBy: varchar("actionBy", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CommTemplate = typeof commTemplates.$inferSelect;
export type InsertCommTemplate = typeof commTemplates.$inferInsert;

// ─── SUCCESSION EVENTS ───────────────────────────────────────────────────────

export const successionEvents = mysqlTable("succession_events", {
  id: int("id").autoincrement().primaryKey(),
  eventType: mysqlEnum("eventType", [
    "delegate_assigned",
    "delegate_removed",
    "inactivity_alert",
    "succession_triggered",
    "manual_succession",
    "owner_resumed",
  ]).notNull(),
  triggeredByUserId: int("triggeredByUserId"),   // who triggered it (null = system)
  delegateUserId: int("delegateUserId"),           // the trustee delegate involved
  delegateTrusteeId: int("delegateTrusteeId"),     // trustees table id (if from trustees table)
  notes: text("notes"),
  notifiedTrusteesJson: text("notifiedTrusteesJson"), // JSON array of {name, email} notified
  triggeredAt: timestamp("triggeredAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SuccessionEvent = typeof successionEvents.$inferSelect;
export type InsertSuccessionEvent = typeof successionEvents.$inferInsert;

// ─── STUDENT ACCOMMODATION ────────────────────────────────────────────────────

export const accommodationTenants = mysqlTable("accommodation_tenants", {
  id: int("id").autoincrement().primaryKey(),
  // Identity
  fullName: varchar("fullName", { length: 200 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  whatsappPhone: varchar("whatsappPhone", { length: 30 }), // may differ from phone
  // Room / unit
  roomNumber: varchar("roomNumber", { length: 50 }),
  propertyAddress: text("propertyAddress"),
  // Contract
  contractStartDate: date("contractStartDate"),
  contractEndDate: date("contractEndDate"),
  contractDocUrl: text("contractDocUrl"), // S3 URL of uploaded contract
  // Financials
  rentAmount: decimal("rentAmount", { precision: 10, scale: 2 }).notNull(),
  rentFrequency: mysqlEnum("rentFrequency", ["weekly", "monthly", "quarterly"]).default("monthly").notNull(),
  rentDueDay: int("rentDueDay").default(1).notNull(), // day of month (1-28) or day of week (1-7 for weekly)
  depositAmount: decimal("depositAmount", { precision: 10, scale: 2 }),
  depositPaidDate: date("depositPaidDate"),
  depositRefundedDate: date("depositRefundedDate"),
  depositNotes: text("depositNotes"),
  // Status
  status: mysqlEnum("status", ["active", "inactive", "notice_given", "vacated"]).default("active").notNull(),
  // Emergency contact
  emergencyContactName: varchar("emergencyContactName", { length: 200 }),
  emergencyContactPhone: varchar("emergencyContactPhone", { length: 30 }),
  // Notes
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AccommodationTenant = typeof accommodationTenants.$inferSelect;
export type InsertAccommodationTenant = typeof accommodationTenants.$inferInsert;

export const accommodationRentPayments = mysqlTable("accommodation_rent_payments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  // Period this payment covers
  periodLabel: varchar("periodLabel", { length: 100 }).notNull(), // e.g. "May 2026" or "Week 20 2026"
  periodStart: date("periodStart").notNull(),
  periodEnd: date("periodEnd").notNull(),
  dueDate: date("dueDate").notNull(),
  // Amount
  amountDue: decimal("amountDue", { precision: 10, scale: 2 }).notNull(),
  amountPaid: decimal("amountPaid", { precision: 10, scale: 2 }),
  // Payment status
  status: mysqlEnum("status", ["pending", "paid", "partial", "overdue", "waived"]).default("pending").notNull(),
  paidDate: date("paidDate"),
  paymentMethod: mysqlEnum("paymentMethod", ["bank_transfer", "cash", "cheque", "standing_order", "other"]),
  receiptUrl: text("receiptUrl"), // S3 URL of payment receipt/evidence
  // Confirmation (sign-off by manager/deputy)
  confirmedByUserId: int("confirmedByUserId"),
  confirmedByName: varchar("confirmedByName", { length: 200 }),
  confirmedAt: timestamp("confirmedAt"),
  // Two-step authorisation: Farid Ahmed + Mumin Khan
  checkedByFaridAt: timestamp("checkedByFaridAt"),
  checkedByMuminAt: timestamp("checkedByMuminAt"),
  // Trustee verification (Dr Abdul Hamid OR Galib Khan)
  trusteeVerifiedBy: varchar("trusteeVerifiedBy", { length: 200 }),
  trusteeVerifiedAt: timestamp("trusteeVerifiedAt"),
  // Reminders sent
  reminderSentAt: timestamp("reminderSentAt"),    // 7-day due reminder
  overdueSentAt: timestamp("overdueSentAt"),       // 8-day overdue reminder
  escalationSentAt: timestamp("escalationSentAt"), // 14-day escalation to trustees
  // Notes
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AccommodationRentPayment = typeof accommodationRentPayments.$inferSelect;
export type InsertAccommodationRentPayment = typeof accommodationRentPayments.$inferInsert;

// ─── STRIPE PAYMENT SESSIONS ──────────────────────────────────────────────────
export const stripePaymentSessions = mysqlTable("stripe_payment_sessions", {
  id: int("id").autoincrement().primaryKey(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  stripeSessionId: varchar("stripeSessionId", { length: 255 }),
  donorName: varchar("donorName", { length: 200 }).notNull(),
  donorEmail: varchar("donorEmail", { length: 320 }),
  donorPhone: varchar("donorPhone", { length: 30 }),
  campaignId: int("campaignId"),
  campaignName: varchar("campaignName", { length: 200 }),
  referenceCode: varchar("referenceCode", { length: 50 }),
  amount: decimal("amount", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("gbp"),
  giftAidDeclared: boolean("giftAidDeclared").default(false).notNull(),
  giftAidAddress: text("giftAidAddress"),
  status: mysqlEnum("status", ["pending", "completed", "failed", "cancelled"]).default("pending").notNull(),
  paymentMethod: varchar("paymentMethod", { length: 50 }),
  provider: mysqlEnum("provider", ["stripe", "paypal", "open_banking", "bank_transfer"]).default("stripe").notNull(),
  externalOrderId: varchar("externalOrderId", { length: 255 }),
  webhookConfirmedAt: timestamp("webhookConfirmedAt"),
  thankYouWhatsAppSentAt: timestamp("thankYouWhatsAppSentAt"),
  fundraisingDonationId: int("fundraisingDonationId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type StripePaymentSession = typeof stripePaymentSessions.$inferSelect;
export type InsertStripePaymentSession = typeof stripePaymentSessions.$inferInsert;

// ─── GIFT AID DECLARATIONS ────────────────────────────────────────────────────
export const giftAidDeclarations = mysqlTable("gift_aid_declarations", {
  id: int("id").autoincrement().primaryKey(),
  donorName: varchar("donorName", { length: 200 }).notNull(),
  donorEmail: varchar("donorEmail", { length: 320 }),
  donorAddress: text("donorAddress"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  donationDate: date("donationDate").notNull(),
  campaignName: varchar("campaignName", { length: 200 }),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  stripeTransactionRef: varchar("stripeTransactionRef", { length: 255 }),
  declarationMethod: mysqlEnum("declarationMethod", ["online_stripe", "manual", "paper"]).default("online_stripe").notNull(),
  exportedAt: timestamp("exportedAt"),
  exportBatch: varchar("exportBatch", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type GiftAidDeclaration = typeof giftAidDeclarations.$inferSelect;
export type InsertGiftAidDeclaration = typeof giftAidDeclarations.$inferInsert;

// ─── DONOR LEADS (Two-Click QuickCapture — Progressive Profiling) ─────────────
export const donorLeads = mysqlTable("donor_leads", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  whatsapp: varchar("whatsapp", { length: 30 }).notNull(),
  email: varchar("email", { length: 320 }),
  title: varchar("title", { length: 20 }),
  dateOfBirth: date("dateOfBirth"),
  address: text("address"),
  postcode: varchar("postcode", { length: 20 }),
  isUkTaxpayer: boolean("isUkTaxpayer").default(false),
  giftAidConsent: boolean("giftAidConsent").default(false),
  marketingConsent: boolean("marketingConsent").default(false),
  profileComplete: boolean("profileComplete").default(false).notNull(),
  incompleteProfileFlaggedAt: timestamp("incompleteProfileFlaggedAt"),
  welcomeMessageSentAt: timestamp("welcomeMessageSentAt"),
  convertedToDonorId: int("convertedToDonorId"),
  source: mysqlEnum("source", ["quickcapture", "stripe", "manual", "portal"]).default("quickcapture").notNull(),
  campaignId: int("campaignId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DonorLead = typeof donorLeads.$inferSelect;
export type InsertDonorLead = typeof donorLeads.$inferInsert;

// ─── DONOR PORTAL TOKENS (Magic Link — no password required) ─────────────────
export const donorPortalTokens = mysqlTable("donor_portal_tokens", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  donorId: int("donorId"),
  donorLeadId: int("donorLeadId"),
  email: varchar("email", { length: 320 }),
  whatsapp: varchar("whatsapp", { length: 30 }),
  purpose: mysqlEnum("purpose", ["profile_complete", "donation_history", "gift_aid_sign", "annual_summary"]).default("donation_history").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DonorPortalToken = typeof donorPortalTokens.$inferSelect;
export type InsertDonorPortalToken = typeof donorPortalTokens.$inferInsert;

// ─── GIFT AID E-SIGNATURE CERTIFICATES ────────────────────────────────────────
export const giftAidCertificates = mysqlTable("gift_aid_certificates", {
  id: int("id").autoincrement().primaryKey(),
  donorId: int("donorId"),
  donorLeadId: int("donorLeadId"),
  donorName: varchar("donorName", { length: 200 }).notNull(),
  donorAddress: text("donorAddress").notNull(),
  donorPostcode: varchar("donorPostcode", { length: 20 }),
  declarationText: text("declarationText").notNull(),
  signatureMethod: mysqlEnum("signatureMethod", ["click_to_sign", "typed_name", "checkbox"]).default("click_to_sign").notNull(),
  signedAt: timestamp("signedAt"),
  signedIp: varchar("signedIp", { length: 45 }),
  coversFrom: date("coversFrom"),
  coversTo: date("coversTo"),
  isActive: boolean("isActive").default(true).notNull(),
  revokedAt: timestamp("revokedAt"),
  certificateUrl: varchar("certificateUrl", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type GiftAidCertificate = typeof giftAidCertificates.$inferSelect;
export type InsertGiftAidCertificate = typeof giftAidCertificates.$inferInsert;

// ─── SADAQAH JARIYAH ENTRIES (Beneficiary Metadata for £1k+ donors) ──────────
export const sadaqahJariyahEntries = mysqlTable("sadaqah_jariyah_entries", {
  id: int("id").autoincrement().primaryKey(),
  donorId: int("donorId"),
  donorLeadId: int("donorLeadId"),
  campaignId: int("campaignId").notNull(),
  donationId: int("donationId"),
  stripeSessionId: int("stripeSessionId"),
  beneficiaryName: varchar("beneficiaryName", { length: 200 }).notNull(),
  beneficiaryRelation: varchar("beneficiaryRelation", { length: 100 }),
  beneficiaryNotes: text("beneficiaryNotes"),
  impactTitle: varchar("impactTitle", { length: 300 }),
  impactDescription: text("impactDescription"),
  impactImageUrl: varchar("impactImageUrl", { length: 500 }),
  impactDate: date("impactDate"),
  displayOnDonorWall: boolean("displayOnDonorWall").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SadaqahJariyahEntry = typeof sadaqahJariyahEntries.$inferSelect;
export type InsertSadaqahJariyahEntry = typeof sadaqahJariyahEntries.$inferInsert;

// ─── CAMPAIGN MILESTONES (Impact Timeline for Donors) ────────────────────────
export const campaignMilestones = mysqlTable("campaign_milestones", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  imageUrl: varchar("imageUrl", { length: 500 }),
  milestoneDate: date("milestoneDate").notNull(),
  isPublished: boolean("isPublished").default(false).notNull(),
  notifyDonors: boolean("notifyDonors").default(false).notNull(),
  notifiedAt: timestamp("notifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CampaignMilestone = typeof campaignMilestones.$inferSelect;
export type InsertCampaignMilestone = typeof campaignMilestones.$inferInsert;
