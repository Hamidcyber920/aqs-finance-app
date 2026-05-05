import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";

// Mock the DB module to avoid real DB calls
vi.mock("./db", () => ({
  getDb: vi.fn(() => null),
}));

// Mock drizzle schema imports used inside the procedures
vi.mock("../drizzle/schema", () => ({
  reconciliationSessions: {},
  payrollRecords: {},
  loanRepayments: {},
  loanApplications: {},
  receipts: {},
  volunteerPayments: {},
  staffProfiles: {},
  users: {},
}));

const adminCtx = {
  user: { id: 1, name: "admin", role: "admin" as const, email: "admin@aq.org" },
};

function makeCaller() {
  return appRouter.createCaller(adminCtx as any);
}

describe("reconciliation.allPayments", () => {
  it("returns empty arrays when DB is null", async () => {
    const caller = makeCaller();
    const result = await caller.reconciliation.allPayments({ month: 1, year: 2026 });
    expect(result).toHaveProperty("payroll");
    expect(result).toHaveProperty("loans");
    expect(result).toHaveProperty("expenses");
    expect(result).toHaveProperty("volunteers");
    expect(result).toHaveProperty("session");
    expect(Array.isArray(result.payroll)).toBe(true);
    expect(Array.isArray(result.loans)).toBe(true);
  });

  it("validates month range", async () => {
    const caller = makeCaller();
    await expect(
      caller.reconciliation.allPayments({ month: 13, year: 2026 })
    ).rejects.toThrow();
    await expect(
      caller.reconciliation.allPayments({ month: 0, year: 2026 })
    ).rejects.toThrow();
  });
});

describe("reconciliation.updateBankBalance", () => {
  it("returns success when DB is null (no-op)", async () => {
    const caller = makeCaller();
    // When DB is null the procedure returns success without error
    const result = await caller.reconciliation.updateBankBalance({
      month: 1,
      year: 2026,
      bankBalance: "5000.00",
    });
    expect(result).toEqual({ success: true });
  });
});

describe("reconciliation.withholdPayment", () => {
  it("accepts valid payment types", async () => {
    const caller = makeCaller();
    for (const type of ["loan", "expense", "volunteer"] as const) {
      const result = await caller.reconciliation.withholdPayment({
        type,
        id: 1,
        reason: "Awaiting funds",
      });
      expect(result).toEqual({ success: true });
    }
  });

  it("rejects payroll type (payroll cannot be withheld)", async () => {
    const caller = makeCaller();
    await expect(
      caller.reconciliation.withholdPayment({ type: "payroll" as any, id: 1 })
    ).rejects.toThrow();
  });
});

describe("reconciliation.markPaid", () => {
  it("accepts all payment types", async () => {
    const caller = makeCaller();
    for (const type of ["payroll", "loan", "expense", "volunteer"] as const) {
      const result = await caller.reconciliation.markPaid({ type, id: 1 });
      expect(result).toEqual({ success: true });
    }
  });

  it("accepts optional chequeImageUrl and invoiceUrl", async () => {
    const caller = makeCaller();
    const result = await caller.reconciliation.markPaid({
      type: "payroll",
      id: 1,
      chequeImageUrl: "https://s3.example.com/cheque.jpg",
      invoiceUrl: "https://s3.example.com/invoice.pdf",
    });
    expect(result).toEqual({ success: true });
  });
});

describe("reconciliation.finalise", () => {
  it("finalises a reconciliation session", async () => {
    const caller = makeCaller();
    const result = await caller.reconciliation.finalise({
      month: 1,
      year: 2026,
      notes: "All cheques issued by 25th",
    });
    expect(result).toEqual({ success: true });
  });
});
