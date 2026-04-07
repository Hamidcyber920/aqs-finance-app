import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";

// ─── Mock db module ───────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn(),
  updatePayrollRecord: vi.fn().mockResolvedValue(undefined),
  updateReceipt: vi.fn().mockResolvedValue(undefined),
  createReceipt: vi.fn(),
  deleteReceipt: vi.fn(),
  getAllCategories: vi.fn().mockResolvedValue([]),
  getCategoryTotals: vi.fn().mockResolvedValue([]),
  getMonthlyTotal: vi.fn().mockResolvedValue({ total: "0" }),
  getReceiptById: vi.fn(),
  listReceipts: vi.fn().mockResolvedValue([]),
  seedDefaultCategories: vi.fn(),
  getDepartments: vi.fn().mockResolvedValue([]),
  getExpenseCategories: vi.fn().mockResolvedValue([]),
  seedDepartmentsAndCategories: vi.fn(),
  getUserPermissions: vi.fn().mockResolvedValue(null),
  upsertUserPermissions: vi.fn(),
  listAllUsers: vi.fn().mockResolvedValue([]),
  updateUserRole: vi.fn(),
  setUserActive: vi.fn(),
  getPendingUsers: vi.fn().mockResolvedValue([]),
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
  setDelegateApprover: vi.fn(),
  getUserById: vi.fn(),
  getFundraisingCampaigns: vi.fn().mockResolvedValue([]),
  getCampaignById: vi.fn(),
  createFundraisingCampaign: vi.fn(),
  updateCampaignAmount: vi.fn(),
  getCampaignItems: vi.fn().mockResolvedValue([]),
  getCampaignDonations: vi.fn().mockResolvedValue([]),
  createDonation: vi.fn(),
  getFridayCollections: vi.fn().mockResolvedValue([]),
  createFridayCollection: vi.fn(),
  getLoans: vi.fn().mockResolvedValue([]),
  getLoanById: vi.fn(),
  createLoan: vi.fn(),
  updateLoan: vi.fn(),
  getLoanRepayments: vi.fn().mockResolvedValue([]),
  createLoanRepayment: vi.fn(),
  getIncomeCategories: vi.fn().mockResolvedValue([]),
  getIncomeRecords: vi.fn().mockResolvedValue([]),
  createIncomeRecord: vi.fn(),
  updateIncomeRecord: vi.fn(),
  getDonors: vi.fn().mockResolvedValue([]),
  getDonorById: vi.fn(),
  createDonor: vi.fn(),
  updateDonor: vi.fn(),
  getEmailCampaigns: vi.fn().mockResolvedValue([]),
  getEmailCampaignById: vi.fn(),
  createEmailCampaign: vi.fn(),
  updateEmailCampaign: vi.fn(),
  getPayrollRecords: vi.fn().mockResolvedValue([]),
  createPayrollRecord: vi.fn(),
  updatePayrollRecord: vi.fn().mockResolvedValue(undefined),
  getStaffProfile: vi.fn().mockResolvedValue(null),
  upsertStaffProfile: vi.fn(),
  getDashboardStats: vi.fn().mockResolvedValue({}),
}));

vi.mock("./storage", () => ({ storagePut: vi.fn().mockResolvedValue({ url: "https://s3.example.com/file.pdf", key: "file.pdf" }) }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn().mockResolvedValue(true) }));
vi.mock("./_core/gmail", () => ({ sendGmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));

// ─── Admin context ────────────────────────────────────────────────────────────
const adminCtx = {
  user: { id: 1, name: "Admin", email: "admin@test.com", role: "superadmin", isActive: true, openId: "oid1" },
  req: {} as any, res: {} as any,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("expenses.pendingPayments", () => {
  it("returns empty lists when db returns no rows", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
    };
    (getDb as any).mockResolvedValue(mockDb);

    const caller = appRouter.createCaller(adminCtx as any);
    const result = await caller.expenses.pendingPayments({ month: 4, year: 2026 });

    expect(result.payroll).toEqual([]);
    expect(result.receipts).toEqual([]);
    expect(result.summary.totalPending).toBe(0);
    expect(result.summary.totalPaid).toBe(0);
  });
});

describe("expenses.markPayrollPaid", () => {
  it("calls updatePayrollRecord with paid status and timestamps", async () => {
    const { updatePayrollRecord } = await import("./db");
    const caller = appRouter.createCaller(adminCtx as any);
    const result = await caller.expenses.markPayrollPaid({ id: 42, chequeNumber: "000123", chequeAmount: "1500.00" });

    expect(result.success).toBe(true);
    expect(result.paidAt).toBeInstanceOf(Date);
    expect(updatePayrollRecord).toHaveBeenCalledWith(42, expect.objectContaining({
      paymentStatus: "paid",
      chequeNumber: "000123",
      chequeAmount: "1500.00",
    }));
  });

  it("marks paid without cheque number for cash payments", async () => {
    const { updatePayrollRecord } = await import("./db");
    (updatePayrollRecord as any).mockClear();
    const caller = appRouter.createCaller(adminCtx as any);
    const result = await caller.expenses.markPayrollPaid({ id: 7 });

    expect(result.success).toBe(true);
    expect(updatePayrollRecord).toHaveBeenCalledWith(7, expect.objectContaining({ paymentStatus: "paid" }));
  });
});

describe("expenses.markReceiptPaid", () => {
  it("calls updateReceipt with approved status and cheque details", async () => {
    const { updateReceipt } = await import("./db");
    (updateReceipt as any).mockClear();
    const caller = appRouter.createCaller(adminCtx as any);
    const result = await caller.expenses.markReceiptPaid({ id: 99, chequeNumber: "000456", chequeImageUrl: "https://s3.example.com/cheque.jpg" });

    expect(result.success).toBe(true);
    expect(updateReceipt).toHaveBeenCalledWith(99, expect.objectContaining({
      status: "approved",
      chequeNumber: "000456",
      chequeImageUrl: "https://s3.example.com/cheque.jpg",
    }));
  });
});

describe("expenses.markBanked", () => {
  it("calls updatePayrollRecord with banked status for payroll type", async () => {
    const { updatePayrollRecord } = await import("./db");
    (updatePayrollRecord as any).mockClear();
    const caller = appRouter.createCaller(adminCtx as any);
    const result = await caller.expenses.markBanked({ type: "payroll", id: 5 });

    expect(result.success).toBe(true);
    expect(updatePayrollRecord).toHaveBeenCalledWith(5, expect.objectContaining({ bankingStatus: "banked" }));
  });

  it("calls updateReceipt with banked status for receipt type", async () => {
    const { updateReceipt } = await import("./db");
    (updateReceipt as any).mockClear();
    const caller = appRouter.createCaller(adminCtx as any);
    const result = await caller.expenses.markBanked({ type: "receipt", id: 12 });

    expect(result.success).toBe(true);
    expect(updateReceipt).toHaveBeenCalledWith(12, expect.objectContaining({ bankingStatus: "banked" }));
  });
});

describe("expenses.monthlySummary", () => {
  it("returns null when db is unavailable", async () => {
    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValue(null);
    const caller = appRouter.createCaller(adminCtx as any);
    const result = await caller.expenses.monthlySummary({ month: 1, year: 2026 });
    expect(result).toBeNull();
  });

  it("returns structured summary with income, expenses, and net balance", async () => {
    const { getDb } = await import("./db");
    const mockRows = { select: vi.fn().mockReturnThis(), from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };
    (getDb as any).mockResolvedValue(mockRows);

    const caller = appRouter.createCaller(adminCtx as any);
    const result = await caller.expenses.monthlySummary({ month: 1, year: 2026 });

    expect(result).not.toBeNull();
    expect(result).toHaveProperty("income");
    expect(result).toHaveProperty("expenses");
    expect(result).toHaveProperty("netBalance");
    expect(result).toHaveProperty("unbankedTotal");
    expect(typeof result!.netBalance).toBe("number");
  });
});
