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

describe("payroll.analyzePayslipBulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns array of employees from multi-employee PDF", async () => {
    const { invokeLLM } = await import("./_core/llm");
    vi.mocked(invokeLLM).mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            employees: [
              { employeeName: "Farid Ahmed", employeeId: "A002", taxCode: "1257L", niNumber: "SN138587D", period: "January 2026", month: 1, year: 2026, grossPay: 1591.57, incomeTax: 108.80, nationalInsurance: 43.48, pensionContribution: 42.87, otherDeductions: 0, netPay: 1396.42, paymentMethod: "bank_transfer" },
              { employeeName: "Sara Khan", employeeId: "A003", taxCode: "1257L", niNumber: "AB123456C", period: "January 2026", month: 1, year: 2026, grossPay: 2000.00, incomeTax: 200.00, nationalInsurance: 100.00, pensionContribution: 50.00, otherDeductions: 0, netPay: 1650.00, paymentMethod: "bank_transfer" },
            ],
          }),
        },
      }],
    } as any);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.payroll.analyzePayslipBulk({
      fileUrl: "https://cdn.example.com/payroll-jan-26.pdf",
      mimeType: "application/pdf",
    });

    expect(result.employees).toHaveLength(2);
    expect(result.employees[0].employeeName).toBe("Farid Ahmed");
    // Month should be 1 (January) from payment date, NOT 10 (internal month number)
    expect(result.employees[0].month).toBe(1);
    expect(result.employees[0].year).toBe(2026);
    expect(result.employees[0].grossPay).toBe(1591.57);
    expect(result.employees[0].netPay).toBe(1396.42);
    expect(result.employees[1].employeeName).toBe("Sara Khan");
  });

  it("returns empty employees array when LLM finds nothing", async () => {
    const { invokeLLM } = await import("./_core/llm");
    vi.mocked(invokeLLM).mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ employees: [] }) } }],
    } as any);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.payroll.analyzePayslipBulk({ fileUrl: "https://cdn.example.com/blank.pdf" });
    expect(result.employees).toHaveLength(0);
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.payroll.analyzePayslipBulk({ fileUrl: "https://cdn.example.com/payslip.pdf" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects non-admin callers", async () => {
    const caller = appRouter.createCaller(makeCtx({ ...adminUser, role: "user" as any }));
    await expect(
      caller.payroll.analyzePayslipBulk({ fileUrl: "https://cdn.example.com/payslip.pdf" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws INTERNAL_SERVER_ERROR when LLM returns malformed JSON", async () => {
    const { invokeLLM } = await import("./_core/llm");
    vi.mocked(invokeLLM).mockResolvedValueOnce({
      choices: [{ message: { content: "not valid json {{" } }],
    } as any);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.payroll.analyzePayslipBulk({ fileUrl: "https://cdn.example.com/payslip.pdf" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("payroll.create with employeeName", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("creates record with free-text employee name (no user account)", async () => {
    const { createPayrollRecord } = await import("./db");
    vi.mocked(createPayrollRecord).mockResolvedValueOnce({ id: 99 } as any);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.payroll.create({
      userId: 0,
      employeeName: "Farid Ahmed",
      month: 1,
      year: 2026,
      grossPay: "1591.57",
      incomeTax: "108.80",
      nationalInsurance: "43.48",
      pensionContribution: "42.87",
      otherDeductions: "0",
      netPay: "1396.42",
      paymentMethod: "bank_transfer",
    });
    expect(createPayrollRecord).toHaveBeenCalledWith(
      expect.objectContaining({ employeeName: "Farid Ahmed", month: 1, year: 2026 })
    );
    expect(result).toMatchObject({ id: 99 });
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
