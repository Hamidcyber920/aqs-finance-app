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
  // Duplicate detection
  imageHash: varchar("imageHash", { length: 64 }),
  // £500+ second approver workflow
  secondApproverRequired: boolean("secondApproverRequired").default(false),
  secondApprovedById: int("secondApprovedById"),
  secondApprovedByName: varchar("secondApprovedByName", { length: 200 }),
  secondApprovedAt: timestamp("secondApprovedAt"),
  // Fund allocation (JSON: [{fund: string, amount: number}])
  fundAllocation: json("fundAllocation").$type<Array<{ fund: string; amount: number }>>(),
  // Expense cross-reference
  linkedExpenseId: int("linkedExpenseId"),
  linkedExpenseNote: text("linkedExpenseNote"),
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
  // RFM scoring
  rfmScore: varchar("rfmScore", { length: 5 }),
  rfmSegment: varchar("rfmSegment", { length: 50 }),
  rfmLastCalculated: timestamp("rfmLastCalculated"),
  // Lawful basis for data processing (GDPR)
  lawfulBasis: mysqlEnum("lawfulBasis", ["consent", "legitimate_interest", "contract", "legal_obligation"]).default("legitimate_interest"),
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
  loanRepaymentId: int("loanRepaymentId"),
  loanApplicationId: int("loanApplicationId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type StripePaymentSession = typeof stripePaymentSessions.$inferSelect;
export type InsertStripePaymentSession = typeof stripePaymentSessions.$inferInsert;

// ─── GIFT AID DECLARATIONS ────────────────────────────────────────────────────
export const giftAidDeclarations = mysqlTable("gift_aid_declarations", {
  id: int("id").autoincrement().primaryKey(),
  donorName: varchar("donorName", { length: 200 }).notNull(),
  // HMRC R68 split name fields
  donorTitle: varchar("donorTitle", { length: 20 }),
  donorFirstName: varchar("donorFirstName", { length: 100 }),
  donorSurname: varchar("donorSurname", { length: 100 }),
  donorEmail: varchar("donorEmail", { length: 320 }),
  donorAddress: text("donorAddress"),
  // HMRC R68 address fields
  donorHouseNumber: varchar("donorHouseNumber", { length: 100 }),
  donorPostcode: varchar("donorPostcode", { length: 20 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  donationDate: date("donationDate").notNull(),
  campaignName: varchar("campaignName", { length: 200 }),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  stripeTransactionRef: varchar("stripeTransactionRef", { length: 255 }),
  // HMRC Unique Reference Number = Stripe payment_intent ID
  uniqueReferenceNumber: varchar("uniqueReferenceNumber", { length: 255 }),
  // Electronic Communications Act 2000 audit fields
  donorIpAddress: varchar("donorIpAddress", { length: 45 }),
  consentTimestamp: timestamp("consentTimestamp"),
  consentStatement: text("consentStatement"),
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

// ─── PAYROLL RUNS (approval workflow) ────────────────────────────────────────
// A payroll run groups all payroll records for a given month/year and tracks
// the two-trustee approval workflow before records are finalised.
export const payrollRuns = mysqlTable("payroll_runs", {
  id: int("id").autoincrement().primaryKey(),
  month: int("month").notNull(),
  year: int("year").notNull(),
  // status: draft → submitted → approved (both trustees) → finalised | rejected
  status: mysqlEnum("status", ["draft", "submitted", "approved", "finalised", "rejected"]).default("draft").notNull(),
  submittedById: int("submittedById"),
  submittedByName: varchar("submittedByName", { length: 200 }),
  submittedAt: timestamp("submittedAt"),
  // First trustee approval
  approver1Id: int("approver1Id"),
  approver1Name: varchar("approver1Name", { length: 200 }),
  approver1At: timestamp("approver1At"),
  approver1Comment: text("approver1Comment"),
  // Second trustee approval
  approver2Id: int("approver2Id"),
  approver2Name: varchar("approver2Name", { length: 200 }),
  approver2At: timestamp("approver2At"),
  approver2Comment: text("approver2Comment"),
  // Rejection
  rejectedById: int("rejectedById"),
  rejectedByName: varchar("rejectedByName", { length: 200 }),
  rejectedAt: timestamp("rejectedAt"),
  rejectionComment: text("rejectionComment"),
  // FPS export
  fpsXmlUrl: text("fpsXmlUrl"),
  fpsExportedAt: timestamp("fpsExportedAt"),
  fpsExportedById: int("fpsExportedById"),
  // Totals snapshot at time of submission
  totalGross: decimal("totalGross", { precision: 12, scale: 2 }).default("0"),
  totalTax: decimal("totalTax", { precision: 12, scale: 2 }).default("0"),
  totalNI: decimal("totalNI", { precision: 12, scale: 2 }).default("0"),
  totalPension: decimal("totalPension", { precision: 12, scale: 2 }).default("0"),
  totalNet: decimal("totalNet", { precision: 12, scale: 2 }).default("0"),
  employeeCount: int("employeeCount").default(0),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PayrollRun = typeof payrollRuns.$inferSelect;
export type InsertPayrollRun = typeof payrollRuns.$inferInsert;

// ─── PENSION AUTO-ENROLMENT ───────────────────────────────────────────────────
// Tracks each employee's auto-enrolment status and contribution schedule.
// UK auto-enrolment threshold (2024/25): £10,000 p.a. / £833/month qualifying earnings.
export const pensionEnrolments = mysqlTable("pension_enrolments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().default(0),
  employeeName: varchar("employeeName", { length: 200 }).notNull(),
  niNumber: varchar("niNumber", { length: 20 }),
  // Status: not_eligible | eligible_not_enrolled | enrolled | opted_out | postponed
  status: mysqlEnum("status", ["not_eligible", "eligible_not_enrolled", "enrolled", "opted_out", "postponed"]).default("not_eligible").notNull(),
  // Qualifying earnings (monthly)
  monthlyQualifyingEarnings: decimal("monthlyQualifyingEarnings", { precision: 10, scale: 2 }).default("0"),
  // Contribution rates (%)
  employeeContributionPct: decimal("employeeContributionPct", { precision: 5, scale: 2 }).default("5.00"),
  employerContributionPct: decimal("employerContributionPct", { precision: 5, scale: 2 }).default("3.00"),
  // Dates
  assessmentDate: date("assessmentDate"),
  enrolmentDate: date("enrolmentDate"),
  optOutDate: date("optOutDate"),
  postponementEndDate: date("postponementEndDate"),
  // Pension provider details
  pensionProvider: varchar("pensionProvider", { length: 200 }),
  pensionSchemeRef: varchar("pensionSchemeRef", { length: 100 }),
  // Flags
  approachingThreshold: boolean("approachingThreshold").default(false), // within 10% of threshold
  notifiedAt: timestamp("notifiedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PensionEnrolment = typeof pensionEnrolments.$inferSelect;
export type InsertPensionEnrolment = typeof pensionEnrolments.$inferInsert;

// ─── MASTER COMMUNICATIONS HUB ───────────────────────────────────────────────
// Sections (inbox categories) — chair/trustees/managers can create custom ones
export const commsSections = mysqlTable("comms_sections", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }).default("hash"),
  color: varchar("color", { length: 20 }).default("#635BFF"),
  sortOrder: int("sortOrder").default(0).notNull(),
  isSystem: boolean("isSystem").default(false).notNull(),
  isArchived: boolean("isArchived").default(false).notNull(),
  createdById: int("createdById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CommsSection = typeof commsSections.$inferSelect;
export type InsertCommsSection = typeof commsSections.$inferInsert;

// Messages — emails pushed in from Gmail or composed internally
export const commsMessages = mysqlTable("comms_messages", {
  id: int("id").autoincrement().primaryKey(),
  sectionId: int("sectionId").notNull(),
  source: mysqlEnum("source", ["gmail_push", "internal_compose", "manual_entry"]).default("manual_entry").notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  fromName: varchar("fromName", { length: 200 }),
  fromEmail: varchar("fromEmail", { length: 320 }),
  toNames: text("toNames"),
  ccNames: text("ccNames"),
  body: text("body"),
  htmlBody: text("htmlBody"),
  aiSummary: text("aiSummary"),
  aiKeyPoints: text("aiKeyPoints"),
  aiActionItems: text("aiActionItems"),
  aiSummarisedAt: timestamp("aiSummarisedAt"),
  aiSummarisedById: int("aiSummarisedById"),
  gmailMessageId: varchar("gmailMessageId", { length: 200 }),
  gmailThreadId: varchar("gmailThreadId", { length: 200 }),
  gmailLabels: text("gmailLabels"),
  status: mysqlEnum("status", ["unread", "read", "actioned", "archived", "flagged"]).default("unread").notNull(),
  priority: mysqlEnum("priority", ["urgent", "high", "normal", "low"]).default("normal").notNull(),
  isStarred: boolean("isStarred").default(false).notNull(),
  isPinned: boolean("isPinned").default(false).notNull(),
  visibility: mysqlEnum("visibility", ["all_senior", "trustees_only", "chair_only"]).default("all_senior").notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  readAt: timestamp("readAt"),
  readById: int("readById"),
  actionedAt: timestamp("actionedAt"),
  actionedById: int("actionedById"),
  actionNote: text("actionNote"),
  createdById: int("createdById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CommsMessage = typeof commsMessages.$inferSelect;
export type InsertCommsMessage = typeof commsMessages.$inferInsert;

// Attachments — files/images attached to messages
export const commsAttachments = mysqlTable("comms_attachments", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  fileName: varchar("fileName", { length: 300 }).notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  mimeType: varchar("mimeType", { length: 100 }),
  fileSizeBytes: int("fileSizeBytes"),
  ocrText: text("ocrText"),
  ocrSummary: text("ocrSummary"),
  ocrProcessedAt: timestamp("ocrProcessedAt"),
  uploadedById: int("uploadedById"),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type CommsAttachment = typeof commsAttachments.$inferSelect;
export type InsertCommsAttachment = typeof commsAttachments.$inferInsert;

// Message replies / internal thread notes
export const commsReplies = mysqlTable("comms_replies", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  body: text("body").notNull(),
  fromName: varchar("fromName", { length: 200 }),
  fromEmail: varchar("fromEmail", { length: 320 }),
  isInternal: boolean("isInternal").default(true).notNull(),
  sentViaEmail: boolean("sentViaEmail").default(false).notNull(),
  createdById: int("createdById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CommsReply = typeof commsReplies.$inferSelect;
export type InsertCommsReply = typeof commsReplies.$inferInsert;

// ─── SCAN MERGE SNAPSHOTS (undo/revert support) ───────────────────────────────
// Stores a JSON snapshot of a record immediately before a scan-merge overwrites it.
// The revert procedure restores the record from this snapshot within 10 minutes.
export const scanMergeSnapshots = mysqlTable("scan_merge_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  tableName: varchar("tableName", { length: 100 }).notNull(),  // e.g. "trustees", "donors"
  recordId: int("recordId").notNull(),
  snapshotJson: text("snapshotJson").notNull(),  // JSON.stringify of the full record before merge
  mergedByUserId: int("mergedByUserId"),
  mergedByName: varchar("mergedByName", { length: 200 }),
  mergedAt: timestamp("mergedAt").defaultNow().notNull(),
  revertedAt: timestamp("revertedAt"),  // set when the snapshot is reverted
});
export type ScanMergeSnapshot = typeof scanMergeSnapshots.$inferSelect;
export type InsertScanMergeSnapshot = typeof scanMergeSnapshots.$inferInsert;

// ─── Compliance Cockpit ───────────────────────────────────────────────────────

export const complianceActions = mysqlTable("compliance_actions", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  source: varchar("source", { length: 200 }),          // e.g. "Charity Commission inquiry", "LBMW"
  owner: varchar("owner", { length: 200 }),             // responsible person name
  dueDate: timestamp("dueDate"),
  status: varchar("status", { length: 50 }).default("open").notNull(), // open | in_progress | completed | overdue
  priority: varchar("priority", { length: 20 }).default("medium").notNull(), // low | medium | high | critical
  evidenceUrl: text("evidenceUrl"),
  notes: text("notes"),
  completedAt: timestamp("completedAt"),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ComplianceAction = typeof complianceActions.$inferSelect;
export type InsertComplianceAction = typeof complianceActions.$inferInsert;

export const trainingRecords = mysqlTable("training_records", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 200 }),       // denormalised for display
  module: varchar("module", { length: 300 }).notNull(), // e.g. "Safeguarding", "GDPR", "First Aid"
  provider: varchar("provider", { length: 200 }),
  completedAt: timestamp("completedAt"),
  expiresAt: timestamp("expiresAt"),
  certificateUrl: text("certificateUrl"),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending | completed | expired | expiring_soon
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type TrainingRecord = typeof trainingRecords.$inferSelect;
export type InsertTrainingRecord = typeof trainingRecords.$inferInsert;

export const policyDocuments = mysqlTable("policy_documents", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  category: varchar("category", { length: 100 }),       // e.g. "Safeguarding", "Finance", "HR"
  owner: varchar("owner", { length: 200 }),
  version: varchar("version", { length: 50 }),          // e.g. "v2.1"
  reviewDate: timestamp("reviewDate"),                   // next scheduled review
  approvedAt: timestamp("approvedAt"),
  approvedBy: varchar("approvedBy", { length: 200 }),
  fileUrl: text("fileUrl"),
  status: varchar("status", { length: 50 }).default("current").notNull(), // current | due_review | overdue | draft
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type PolicyDocument = typeof policyDocuments.$inferSelect;
export type InsertPolicyDocument = typeof policyDocuments.$inferInsert;

// ── Trustee Decisions Register ─────────────────────────────────────────────
export const trusteeDecisions = mysqlTable("trustee_decisions", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  motionText: text("motionText"),
  proposer: varchar("proposer", { length: 200 }),
  seconder: varchar("seconder", { length: 200 }),
  votesFor: int("votesFor").default(0).notNull(),
  votesAgainst: int("votesAgainst").default(0).notNull(),
  abstentions: int("abstentions").default(0).notNull(),
  outcome: varchar("outcome", { length: 50 }).default("pending").notNull(), // passed | rejected | deferred | pending
  meetingDate: timestamp("meetingDate"),
  minutesUrl: text("minutesUrl"),
  notes: text("notes"),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TrusteeDecision = typeof trusteeDecisions.$inferSelect;
export type InsertTrusteeDecision = typeof trusteeDecisions.$inferInsert;

// ─── WAVE 3 — PEOPLE MODULE ──────────────────────────────────────────────────

// Donor segments (major / monthly / eid / friday / anonymous)
export const donorSegments = mysqlTable("donor_segments", {
  id: int("id").autoincrement().primaryKey(),
  donorId: int("donorId").notNull(),
  segment: mysqlEnum("segment", ["major", "monthly", "eid", "friday", "anonymous"]).notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  assignedByUserId: int("assignedByUserId"),
});
export type DonorSegment = typeof donorSegments.$inferSelect;
export type InsertDonorSegment = typeof donorSegments.$inferInsert;

// Gift Aid claims — HMRC-ready quarterly claim tracking
export const giftAidClaims = mysqlTable("gift_aid_claims", {
  id: int("id").autoincrement().primaryKey(),
  donorId: int("donorId").notNull(),
  donorName: varchar("donorName", { length: 200 }),
  donorAddress: text("donorAddress"),
  donorPostcode: varchar("donorPostcode", { length: 20 }),
  donationDate: date("donationDate").notNull(),
  donationAmount: decimal("donationAmount", { precision: 10, scale: 2 }).notNull(),
  giftAidAmount: decimal("giftAidAmount", { precision: 10, scale: 2 }), // 25% of donation
  taxYear: varchar("taxYear", { length: 10 }).notNull(), // e.g. "2024-25"
  quarter: mysqlEnum("quarter", ["Q1", "Q2", "Q3", "Q4"]).notNull(),
  claimStatus: mysqlEnum("claimStatus", ["pending", "submitted", "approved", "rejected"]).default("pending").notNull(),
  hmrcRef: varchar("hmrcRef", { length: 100 }),
  claimedAt: timestamp("claimedAt"),
  csvExportedAt: timestamp("csvExportedAt"),
  submittedToHmrc: boolean("submittedToHmrc").default(false).notNull(),
  submittedAt: timestamp("submittedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type GiftAidClaim = typeof giftAidClaims.$inferSelect;
export type InsertGiftAidClaim = typeof giftAidClaims.$inferInsert;

// Donor thank-you log — track automated thank-yous sent
export const donorThankYouLog = mysqlTable("donor_thank_you_log", {
  id: int("id").autoincrement().primaryKey(),
  donorId: int("donorId").notNull(),
  donationId: int("donationId"),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  channel: mysqlEnum("channel", ["email", "sms", "whatsapp"]).default("email").notNull(),
  status: mysqlEnum("status", ["sent", "failed", "pending"]).default("pending").notNull(),
  message: text("message"),
  approvedByUserId: int("approvedByUserId"),
});
export type DonorThankYouLog = typeof donorThankYouLog.$inferSelect;
export type InsertDonorThankYouLog = typeof donorThankYouLog.$inferInsert;

// Payroll V2 — full statutory payroll records
export const payrollV2 = mysqlTable("payroll_v2", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId"), // FK to users.id (nullable for external staff)
  employeeName: varchar("employeeName", { length: 200 }).notNull(),
  niNumber: varchar("niNumber", { length: 20 }),
  taxCode: varchar("taxCode", { length: 20 }),
  month: int("month").notNull(), // 1-12
  year: int("year").notNull(),
  grossPay: decimal("grossPay", { precision: 10, scale: 2 }).notNull(),
  incomeTax: decimal("incomeTax", { precision: 10, scale: 2 }).default("0").notNull(),
  nationalInsurance: decimal("nationalInsurance", { precision: 10, scale: 2 }).default("0").notNull(),
  pensionEmployee: decimal("pensionEmployee", { precision: 10, scale: 2 }).default("0").notNull(),
  pensionEmployer: decimal("pensionEmployer", { precision: 10, scale: 2 }).default("0").notNull(),
  otherDeductions: decimal("otherDeductions", { precision: 10, scale: 2 }).default("0").notNull(),
  netPay: decimal("netPay", { precision: 10, scale: 2 }).notNull(),
  ytdGross: decimal("ytdGross", { precision: 10, scale: 2 }).default("0").notNull(),
  ytdTax: decimal("ytdTax", { precision: 10, scale: 2 }).default("0").notNull(),
  ytdNI: decimal("ytdNI", { precision: 10, scale: 2 }).default("0").notNull(),
  payslipUrl: text("payslipUrl"), // S3 URL of uploaded payslip PDF
  paymentMethod: mysqlEnum("paymentMethod", ["bank_transfer", "cheque", "cash"]).default("bank_transfer").notNull(),
  status: mysqlEnum("status", ["draft", "approved", "paid"]).default("draft").notNull(),
  approvedByUserId: int("approvedByUserId"),
  approvedAt: timestamp("approvedAt"),
  paidAt: timestamp("paidAt"),
  notes: text("notes"),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PayrollV2 = typeof payrollV2.$inferSelect;
export type InsertPayrollV2 = typeof payrollV2.$inferInsert;

// Communications templates
export const commsTemplates = mysqlTable("comms_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  category: mysqlEnum("category", [
    "trustee_meeting", "donor_thankyou", "gift_aid_declaration",
    "commission_response", "staff_bulletin", "supplier_query",
    "training_invite", "general"
  ]).default("general").notNull(),
  type: mysqlEnum("type", ["email", "sms", "letter"]).default("email").notNull(),
  subject: varchar("subject", { length: 500 }),
  body: text("body").notNull(),
  variables: json("variables"), // array of variable names like ["{{name}}", "{{date}}"]
  isActive: boolean("isActive").default(true).notNull(),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CommsTemplate = typeof commsTemplates.$inferSelect;
export type InsertCommsTemplate = typeof commsTemplates.$inferInsert;

// Communications outbox — log of all sent communications
export const commsOutbox = mysqlTable("comms_outbox", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId"),
  recipientGroup: mysqlEnum("recipientGroup", [
    "trustees_all", "staff_all", "donors_all", "donors_major",
    "donors_monthly", "donors_eid", "donors_friday",
    "students_current", "suppliers", "individual", "custom"
  ]).notNull(),
  recipientIds: json("recipientIds"), // array of user/donor IDs
  subject: varchar("subject", { length: 500 }),
  body: text("body").notNull(),
  type: mysqlEnum("type", ["email", "sms", "letter"]).default("email").notNull(),
  status: mysqlEnum("status", ["queued", "sending", "sent", "failed", "cancelled"]).default("queued").notNull(),
  sentCount: int("sentCount").default(0).notNull(),
  failCount: int("failCount").default(0).notNull(),
  scheduledAt: timestamp("scheduledAt"),
  sentAt: timestamp("sentAt"),
  sentByUserId: int("sentByUserId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CommsOutbox = typeof commsOutbox.$inferSelect;
export type InsertCommsOutbox = typeof commsOutbox.$inferInsert;

// Trustee meetings
export const trusteeMeetings = mysqlTable("trustee_meetings", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  meetingType: mysqlEnum("meetingType", ["trustee_board", "finance_committee", "safeguarding_committee", "building_committee", "agm", "extraordinary", "staff"]).default("trustee_board").notNull(),
  scheduledAt: timestamp("scheduledAt").notNull(),
  location: varchar("location", { length: 300 }),
  status: mysqlEnum("status", ["scheduled", "in_progress", "completed", "cancelled"]).default("scheduled").notNull(),
  agendaUrl: text("agendaUrl"),
  minutesUrl: text("minutesUrl"),
  transcriptUrl: text("transcriptUrl"),
  transcriptText: text("transcriptText"),
  aiDecisionsExtracted: boolean("aiDecisionsExtracted").default(false).notNull(),
  attendees: json("attendees"), // array of user IDs
  quorumRequired: int("quorumRequired").default(3).notNull(),
  quorumMet: boolean("quorumMet").default(false).notNull(),
  notes: text("notes"),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TrusteeMeeting = typeof trusteeMeetings.$inferSelect;
export type InsertTrusteeMeeting = typeof trusteeMeetings.$inferInsert;

// Meeting agenda items
export const meetingAgendaItems = mysqlTable("meeting_agenda_items", {
  id: int("id").autoincrement().primaryKey(),
  meetingId: int("meetingId").notNull(),
  itemNumber: int("itemNumber").default(1).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  ownerId: int("ownerId"), // FK to users.id
  actionRequired: boolean("actionRequired").default(false).notNull(),
  linkedComplianceActionId: int("linkedComplianceActionId"),
  linkedDecisionId: int("linkedDecisionId"),
  durationMinutes: int("durationMinutes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MeetingAgendaItem = typeof meetingAgendaItems.$inferSelect;
export type InsertMeetingAgendaItem = typeof meetingAgendaItems.$inferInsert;

// Onboarding / offboarding pipeline
export const onboardingPipeline = mysqlTable("onboarding_pipeline", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // FK to users.id
  pipelineType: mysqlEnum("pipelineType", ["onboarding", "offboarding"]).default("onboarding").notNull(),
  stage: mysqlEnum("stage", [
    "contract", "id_check", "dbs", "induction", "training", "payslip", // onboarding
    "notice_period", "access_revoked", "final_pay", "exit_interview", "p45" // offboarding
  ]).notNull(),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "blocked"]).default("pending").notNull(),
  completedAt: timestamp("completedAt"),
  documentUrl: text("documentUrl"),
  notes: text("notes"),
  assignedToUserId: int("assignedToUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OnboardingPipeline = typeof onboardingPipeline.$inferSelect;
export type InsertOnboardingPipeline = typeof onboardingPipeline.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// WAVE 4 — Master Communications Channel
// ─────────────────────────────────────────────────────────────────────────────

// Sections / categories (editable by admin — e.g. Accounts, HMRC, Gift Aid, Urgent, etc.)
export const emailSections = mysqlTable("email_sections", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),           // e.g. "Accounts", "HMRC", "Gift Aid"
  description: text("description"),
  color: varchar("color", { length: 20 }).default("#6366f1"), // hex colour for UI badge
  icon: varchar("icon", { length: 50 }),                      // lucide icon name
  sortOrder: int("sortOrder").default(0).notNull(),
  isSystem: boolean("isSystem").default(false).notNull(),     // system sections can't be deleted
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailSection = typeof emailSections.$inferSelect;
export type InsertEmailSection = typeof emailSections.$inferInsert;

// Inbound emails pushed from Gmail or entered manually
export const inboundEmails = mysqlTable("inbound_emails", {
  id: int("id").autoincrement().primaryKey(),
  // Gmail metadata
  gmailMessageId: varchar("gmailMessageId", { length: 255 }),  // unique Gmail message ID
  gmailThreadId: varchar("gmailThreadId", { length: 255 }),    // Gmail thread ID
  // Sender / recipient
  fromEmail: varchar("fromEmail", { length: 255 }).notNull(),
  fromName: varchar("fromName", { length: 255 }),
  toEmail: varchar("toEmail", { length: 255 }),
  ccEmails: json("ccEmails").$type<string[]>().default([]),
  // Content
  subject: varchar("subject", { length: 500 }).notNull(),
  bodyText: text("bodyText"),                                   // plain text body
  bodyHtml: text("bodyHtml"),                                   // HTML body
  snippet: varchar("snippet", { length: 500 }),                 // short preview
  // Classification
  sectionId: int("sectionId"),                                  // FK to email_sections.id
  priority: mysqlEnum("priority", ["urgent", "high", "normal", "low"]).default("normal").notNull(),
  status: mysqlEnum("status", ["unread", "read", "actioned", "archived"]).default("unread").notNull(),
  // AI processing
  aiSummary: text("aiSummary"),                                 // AI-generated summary
  aiKeyPoints: json("aiKeyPoints").$type<string[]>().default([]),
  aiActionRequired: boolean("aiActionRequired").default(false).notNull(),
  aiProcessedAt: timestamp("aiProcessedAt"),
  // Linked receipt/expense
  linkedReceiptId: int("linkedReceiptId"),                      // FK to receipts.id
  linkedReceiptNote: varchar("linkedReceiptNote", { length: 255 }),
  // Assignment
  assignedToUserId: int("assignedToUserId"),                    // FK to users.id
  assignedAt: timestamp("assignedAt"),
  // Timestamps
  receivedAt: timestamp("receivedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type InboundEmail = typeof inboundEmails.$inferSelect;
export type InsertInboundEmail = typeof inboundEmails.$inferInsert;

// Attachments on inbound emails (stored in S3)
export const emailAttachments = mysqlTable("email_attachments", {
  id: int("id").autoincrement().primaryKey(),
  emailId: int("emailId").notNull(),                            // FK to inbound_emails.id
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }),
  sizeBytes: int("sizeBytes"),
  s3Url: text("s3Url").notNull(),
  s3Key: varchar("s3Key", { length: 500 }).notNull(),
  // AI OCR
  ocrText: text("ocrText"),                                     // extracted text from image/PDF
  ocrSummary: text("ocrSummary"),                               // AI summary of OCR content
  ocrProcessedAt: timestamp("ocrProcessedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EmailAttachment = typeof emailAttachments.$inferSelect;
export type InsertEmailAttachment = typeof emailAttachments.$inferInsert;

// Email activity log (moves, assignments, status changes)
export const emailActivityLog = mysqlTable("email_activity_log", {
  id: int("id").autoincrement().primaryKey(),
  emailId: int("emailId").notNull(),
  userId: int("userId").notNull(),
  action: mysqlEnum("action", ["received", "read", "moved_section", "assigned", "actioned", "archived", "replied", "forwarded", "ocr_processed", "ai_summarised", "linked_receipt"]).notNull(),
  fromSectionId: int("fromSectionId"),
  toSectionId: int("toSectionId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EmailActivityLog = typeof emailActivityLog.$inferSelect;
export type InsertEmailActivityLog = typeof emailActivityLog.$inferInsert;

// ─── SECTION REPLY TEMPLATES ─────────────────────────────────────────────────
export const sectionReplyTemplates = mysqlTable("section_reply_templates", {
  id: int("id").autoincrement().primaryKey(),
  sectionId: int("sectionId"),                                  // null = global template
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SectionReplyTemplate = typeof sectionReplyTemplates.$inferSelect;
export type InsertSectionReplyTemplate = typeof sectionReplyTemplates.$inferInsert;

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),                                        // null = system action
  userName: varchar("userName", { length: 200 }),
  action: varchar("action", { length: 100 }).notNull(),        // e.g. "approve", "delete", "pay"
  entity: varchar("entity", { length: 100 }).notNull(),        // e.g. "receipt", "loan", "payroll"
  entityId: int("entityId"),
  meta: json("meta").$type<Record<string, unknown>>(),         // extra context
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;


// ─── PLEDGES ─────────────────────────────────────────────────────────────────
export const pledges = mysqlTable("pledges", {
  id: int("id").autoincrement().primaryKey(),
  donorId: int("donorId").notNull(),
  donorName: varchar("donorName", { length: 200 }),
  campaignId: int("campaignId"),
  campaignName: varchar("campaignName", { length: 200 }),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
  frequency: mysqlEnum("frequency", ["one_off", "monthly", "quarterly", "annual"]).default("one_off").notNull(),
  paidAmount: decimal("paidAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  balanceOwing: decimal("balanceOwing", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["active", "fulfilled", "lapsed", "cancelled"]).default("active").notNull(),
  nextDueDate: date("nextDueDate"),
  startDate: date("startDate"),
  endDate: date("endDate"),
  isGiftAid: boolean("isGiftAid").default(false).notNull(),
  notes: text("notes"),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Pledge = typeof pledges.$inferSelect;
export type InsertPledge = typeof pledges.$inferInsert;

// ─── PLEDGE PAYMENTS ─────────────────────────────────────────────────────────
export const pledgePayments = mysqlTable("pledge_payments", {
  id: int("id").autoincrement().primaryKey(),
  pledgeId: int("pledgeId").notNull(),
  donorId: int("donorId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentDate: date("paymentDate").notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "card", "bacs", "cheque", "paypal", "stripe", "other"]).default("cash").notNull(),
  reference: varchar("reference", { length: 200 }),
  notes: text("notes"),
  recordedById: int("recordedById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PledgePayment = typeof pledgePayments.$inferSelect;
export type InsertPledgePayment = typeof pledgePayments.$inferInsert;

// ─── MAJOR DONOR DUE DILIGENCE ────────────────────────────────────────────────
export const majorDonorDueDiligence = mysqlTable("major_donor_due_diligence", {
  id: int("id").autoincrement().primaryKey(),
  donorId: int("donorId"),
  donorName: varchar("donorName", { length: 200 }),
  donationAmount: decimal("donationAmount", { precision: 12, scale: 2 }).notNull(),
  donationSource: varchar("donationSource", { length: 100 }),
  donationRef: varchar("donationRef", { length: 200 }),
  isAnonymous: boolean("isAnonymous").default(false).notNull(),
  sanctionsCheckStatus: mysqlEnum("sanctionsCheckStatus", ["pending", "clear", "flagged", "not_required"]).default("pending").notNull(),
  sanctionsCheckNotes: text("sanctionsCheckNotes"),
  sanctionsCheckedAt: timestamp("sanctionsCheckedAt"),
  sanctionsCheckedById: int("sanctionsCheckedById"),
  trusteeSignOffRequired: boolean("trusteeSignOffRequired").default(true).notNull(),
  trusteeSignOffUserId: int("trusteeSignOffUserId"),
  trusteeSignOffAt: timestamp("trusteeSignOffAt"),
  trusteeSignOffNotes: text("trusteeSignOffNotes"),
  sirRequired: boolean("sirRequired").default(false).notNull(),
  sirFiledAt: timestamp("sirFiledAt"),
  status: mysqlEnum("status", ["open", "cleared", "escalated", "sir_filed"]).default("open").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MajorDonorDueDiligence = typeof majorDonorDueDiligence.$inferSelect;
export type InsertMajorDonorDueDiligence = typeof majorDonorDueDiligence.$inferInsert;

// ─── DONOR PIPELINE (Cultivation Stages) ─────────────────────────────────────
export const donorPipeline = mysqlTable("donor_pipeline", {
  id: int("id").autoincrement().primaryKey(),
  donorId: int("donorId").notNull(),
  donorName: varchar("donorName", { length: 200 }),
  stage: mysqlEnum("stage", ["identification", "qualification", "cultivation", "solicitation", "stewardship"]).default("identification").notNull(),
  targetAmount: decimal("targetAmount", { precision: 12, scale: 2 }),
  campaignId: int("campaignId"),
  assignedToUserId: int("assignedToUserId"),
  assignedToName: varchar("assignedToName", { length: 200 }),
  nextAction: text("nextAction"),
  nextActionDate: date("nextActionDate"),
  notes: text("notes"),
  stageChangedAt: timestamp("stageChangedAt").defaultNow(),
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DonorPipeline = typeof donorPipeline.$inferSelect;
export type InsertDonorPipeline = typeof donorPipeline.$inferInsert;

// ─── DONOR NOTES ─────────────────────────────────────────────────────────────
export const donorNotes = mysqlTable("donor_notes", {
  id: int("id").autoincrement().primaryKey(),
  donorId: int("donorId").notNull(),
  note: text("note").notNull(),
  isPinned: boolean("isPinned").default(false).notNull(),
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DonorNote = typeof donorNotes.$inferSelect;
export type InsertDonorNote = typeof donorNotes.$inferInsert;

// ─── BULK MESSAGE APPROVALS ───────────────────────────────────────────────────
export const bulkMessageApprovals = mysqlTable("bulk_message_approvals", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId"),
  requestedById: int("requestedById").notNull(),
  requestedByName: varchar("requestedByName", { length: 200 }),
  recipientCount: int("recipientCount").notNull(),
  messageSubject: varchar("messageSubject", { length: 300 }),
  messagePreview: text("messagePreview"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedById: int("reviewedById"),
  reviewedByName: varchar("reviewedByName", { length: 200 }),
  reviewedAt: timestamp("reviewedAt"),
  reviewNotes: text("reviewNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BulkMessageApproval = typeof bulkMessageApprovals.$inferSelect;
export type InsertBulkMessageApproval = typeof bulkMessageApprovals.$inferInsert;
