import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";

vi.mock("./db", () => ({
  getDb: vi.fn(() => null),
}));

vi.mock("../drizzle/schema", () => ({
  reconciliationSessions: {},
  payrollRecords: {},
  loanRepayments: {},
  loanApplications: {},
  receipts: {},
  volunteerPayments: {},
  staffProfiles: {},
  users: {},
  incomeRecords: {},
  fridayCollections: {},
  fundraisingDonations: {},
}));

const adminCtx = {
  user: { id: 1, name: "admin", role: "admin" as const, email: "admin@aq.org" },
};

const userCtx = {
  user: { id: 2, name: "staff", role: "user" as const, email: "staff@aq.org" },
};

function makeAdmin() {
  return appRouter.createCaller(adminCtx as any);
}

function makeUser() {
  return appRouter.createCaller(userCtx as any);
}

describe("reconciliation.fullStatement", () => {
  it("returns null when DB is null (no connection)", async () => {
    const caller = makeAdmin();
    const result = await caller.reconciliation.fullStatement({ month: 5, year: 2026 });
    // When DB is null the procedure returns null
    expect(result).toBeNull();
  });

  it("rejects non-admin users with FORBIDDEN", async () => {
    const caller = makeUser();
    await expect(
      caller.reconciliation.fullStatement({ month: 5, year: 2026 })
    ).rejects.toThrow();
  });

  it("validates month range — rejects month 0", async () => {
    const caller = makeAdmin();
    await expect(
      caller.reconciliation.fullStatement({ month: 0, year: 2026 })
    ).rejects.toThrow();
  });

  it("validates month range — rejects month 13", async () => {
    const caller = makeAdmin();
    await expect(
      caller.reconciliation.fullStatement({ month: 13, year: 2026 })
    ).rejects.toThrow();
  });

  it("accepts valid month 1", async () => {
    const caller = makeAdmin();
    // Should not throw — returns null because DB is null
    const result = await caller.reconciliation.fullStatement({ month: 1, year: 2026 });
    expect(result).toBeNull();
  });

  it("accepts valid month 12", async () => {
    const caller = makeAdmin();
    const result = await caller.reconciliation.fullStatement({ month: 12, year: 2026 });
    expect(result).toBeNull();
  });
});

describe("reconciliation.allPayments (existing)", () => {
  it("returns empty arrays when DB is null", async () => {
    const caller = makeAdmin();
    const result = await caller.reconciliation.allPayments({ month: 5, year: 2026 });
    expect(result).toHaveProperty("payroll");
    expect(result).toHaveProperty("loans");
    expect(result).toHaveProperty("expenses");
    expect(result).toHaveProperty("volunteers");
    expect(result).toHaveProperty("session");
    expect(Array.isArray(result.payroll)).toBe(true);
  });

  it("rejects non-admin users", async () => {
    const caller = makeUser();
    await expect(
      caller.reconciliation.allPayments({ month: 5, year: 2026 })
    ).rejects.toThrow();
  });
});

describe("reconciliation.withholdPayment (carry-forward trigger)", () => {
  it("returns success when DB is null", async () => {
    const caller = makeAdmin();
    const result = await caller.reconciliation.withholdPayment({ type: "expense", id: 1, reason: "Insufficient funds" });
    expect(result).toHaveProperty("success", true);
  });

  it("rejects non-admin users", async () => {
    const caller = makeUser();
    await expect(
      caller.reconciliation.withholdPayment({ type: "expense", id: 1 })
    ).rejects.toThrow();
  });

  it("accepts all valid types", async () => {
    const caller = makeAdmin();
    for (const type of ["loan", "expense", "volunteer"] as const) {
      const result = await caller.reconciliation.withholdPayment({ type, id: 1 });
      expect(result.success).toBe(true);
    }
  });
});
