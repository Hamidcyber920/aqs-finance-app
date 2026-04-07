import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getLoanById: vi.fn(),
    createLoanRepayment: vi.fn(),
    getLoanRepayments: vi.fn(),
    getLoans: vi.fn(),
    createLoan: vi.fn(),
    updateLoan: vi.fn(),
    getPayrollRecords: vi.fn().mockResolvedValue([]),
    createPayrollRecord: vi.fn().mockResolvedValue({ id: 1 }),
    updatePayrollRecord: vi.fn().mockResolvedValue(undefined),
    getStaffProfile: vi.fn().mockResolvedValue(null),
    upsertStaffProfile: vi.fn().mockResolvedValue(undefined),
    listAllUsers: vi.fn().mockResolvedValue([]),
    getPendingUsers: vi.fn().mockResolvedValue([]),
    getUserById: vi.fn().mockResolvedValue(null),
    approveUser: vi.fn().mockResolvedValue(undefined),
    rejectUser: vi.fn().mockResolvedValue(undefined),
    updateUserRole: vi.fn().mockResolvedValue(undefined),
    setUserActive: vi.fn().mockResolvedValue(undefined),
    setDelegateApprover: vi.fn().mockResolvedValue(undefined),
    getUserPermissions: vi.fn().mockResolvedValue(null),
    upsertUserPermissions: vi.fn().mockResolvedValue(undefined),
    getDashboardStats: vi.fn().mockResolvedValue({}),
    getAdminReceiptStats: vi.fn().mockResolvedValue({}),
    getFundraisingCampaigns: vi.fn().mockResolvedValue([]),
    getCampaignById: vi.fn().mockResolvedValue(null),
    getCampaignItems: vi.fn().mockResolvedValue([]),
    getCampaignDonations: vi.fn().mockResolvedValue([]),
    createFundraisingCampaign: vi.fn().mockResolvedValue({ id: 1 }),
    createDonation: vi.fn().mockResolvedValue({ id: 1 }),
    updateCampaignAmount: vi.fn().mockResolvedValue(undefined),
    getFridayCollections: vi.fn().mockResolvedValue([]),
    createFridayCollection: vi.fn().mockResolvedValue({ id: 1 }),
    getIncomeCategories: vi.fn().mockResolvedValue([]),
    getIncomeRecords: vi.fn().mockResolvedValue([]),
    createIncomeRecord: vi.fn().mockResolvedValue({ id: 1 }),
    updateIncomeRecord: vi.fn().mockResolvedValue(undefined),
    getDonors: vi.fn().mockResolvedValue([]),
    getDonorById: vi.fn().mockResolvedValue(null),
    createDonor: vi.fn().mockResolvedValue({ id: 1 }),
    updateDonor: vi.fn().mockResolvedValue(undefined),
    getEmailCampaigns: vi.fn().mockResolvedValue([]),
    getEmailCampaignById: vi.fn().mockResolvedValue(null),
    createEmailCampaign: vi.fn().mockResolvedValue({ id: 1 }),
    updateEmailCampaign: vi.fn().mockResolvedValue(undefined),
    listReceipts: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    getReceiptById: vi.fn().mockResolvedValue(null),
    createReceipt: vi.fn().mockResolvedValue(1),
    updateReceipt: vi.fn().mockResolvedValue(undefined),
    deleteReceipt: vi.fn().mockResolvedValue(undefined),
    getCategoryTotals: vi.fn().mockResolvedValue([]),
    getMonthlyTotal: vi.fn().mockResolvedValue(0),
    getReceiptCategories: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/payslip.pdf", key: "payroll/payslip.pdf" }),
  storageGet: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/payslip.pdf", key: "payroll/payslip.pdf" }),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          employeeName: "John Smith",
          employeeId: "EMP001",
          taxCode: "1257L",
          niNumber: "AB123456C",
          period: "April 2026",
          month: 4,
          year: 2026,
          grossPay: 2500.00,
          incomeTax: 300.00,
          nationalInsurance: 200.00,
          pensionContribution: 100.00,
          otherDeductions: 0,
          netPay: 1900.00,
          paymentMethod: "bank_transfer",
        }),
      },
    }],
  }),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
      })),
    },
    gmail: vi.fn().mockReturnValue({
      users: { messages: { send: vi.fn().mockResolvedValue({ data: { id: "mock-id" } }) } },
    }),
  },
}));

vi.mock("./loanPdf", () => ({
  generateLoanPdf: vi.fn().mockResolvedValue(Buffer.from("pdf")),
}));

import * as db from "./db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const adminUser: User = {
  id: 1,
  openId: "local:1",
  name: "Admin User",
  email: "admin@aq.org",
  loginMethod: "local",
  role: "admin",
  status: "active",
  isActive: true,
  passwordHash: "hashed",
  resetToken: null,
  resetTokenExpiry: null,
  approvedBy: null,
  approvedAt: null,
  delegateApproverId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
} as any;

function makeCtx(user: User | null = adminUser): TrpcContext {
  return {
    user: user as any,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("payroll.analyzePayslip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns extracted payslip data from LLM for admin user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.payroll.analyzePayslip({
      fileUrl: "https://cdn.example.com/payslip.pdf",
      mimeType: "application/pdf",
    });

    expect(result.employeeName).toBe("John Smith");
    expect(result.grossPay).toBe(2500);
    expect(result.incomeTax).toBe(300);
    expect(result.nationalInsurance).toBe(200);
    expect(result.pensionContribution).toBe(100);
    expect(result.netPay).toBe(1900);
    expect(result.month).toBe(4);
    expect(result.year).toBe(2026);
    expect(result.taxCode).toBe("1257L");
    expect(result.paymentMethod).toBe("bank_transfer");
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.payroll.analyzePayslip({ fileUrl: "https://cdn.example.com/payslip.pdf" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects non-admin callers", async () => {
    const caller = appRouter.createCaller(makeCtx({ ...adminUser, role: "user" as any }));
    await expect(
      caller.payroll.analyzePayslip({ fileUrl: "https://cdn.example.com/payslip.pdf" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws INTERNAL_SERVER_ERROR when LLM returns malformed JSON", async () => {
    const { invokeLLM } = await import("./_core/llm");
    vi.mocked(invokeLLM).mockResolvedValueOnce({
      choices: [{ message: { content: "not valid json {{" } }],
    } as any);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.payroll.analyzePayslip({ fileUrl: "https://cdn.example.com/payslip.pdf" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("loans.recordRepayment with evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records repayment with evidence URL", async () => {
    vi.mocked(db.getLoanById).mockResolvedValue({
      id: 1,
      borrowerName: "Ahmed Hassan",
      amount: "1200.00",
      totalRepaid: "200.00",
      termMonths: 6,
      status: "active",
    } as any);
    vi.mocked(db.createLoanRepayment).mockResolvedValue({ id: 5, amount: "200.00" } as any);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.loans.recordRepayment({
      loanId: 1,
      amount: "200.00",
      paymentMethod: "bank_transfer",
      evidenceUrl: "https://cdn.example.com/evidence.jpg",
      notes: "Monthly payment April",
    });

    expect(db.createLoanRepayment).toHaveBeenCalledWith(
      expect.objectContaining({
        loanId: 1,
        amount: "200.00",
        evidenceUrl: "https://cdn.example.com/evidence.jpg",
      })
    );
    expect(result).toMatchObject({ id: 5 });
  });

  it("records repayment without evidence URL", async () => {
    vi.mocked(db.getLoanById).mockResolvedValue({
      id: 2,
      borrowerName: "Fatima Ali",
      amount: "600.00",
      totalRepaid: "100.00",
      termMonths: 6,
      status: "active",
    } as any);
    vi.mocked(db.createLoanRepayment).mockResolvedValue({ id: 6, amount: "100.00" } as any);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.loans.recordRepayment({
      loanId: 2,
      amount: "100.00",
      paymentMethod: "cash",
    });

    expect(db.createLoanRepayment).toHaveBeenCalledWith(
      expect.objectContaining({
        loanId: 2,
        amount: "100.00",
        paymentMethod: "cash",
      })
    );
    expect(result).toMatchObject({ id: 6 });
  });
});
