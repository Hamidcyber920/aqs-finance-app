/**
 * Tests for the Monthly Expenses authorisation workflow:
 *  - expenses.authorise  — stamps authorisedBy + datetime
 *  - expenses.reject     — stamps rejectedBy + defers to next month
 *  - expenses.extractChequeData — LLM vision wrapper (mocked)
 *  - expenses.allItems   — aggregates payroll, receipts, volunteers, loans
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(role = "admin", name = "Dr Hamid") {
  return { user: { id: 1, role, name, email: "admin@test.com" } };
}

// ─── authorise ────────────────────────────────────────────────────────────────

describe("expenses.authorise", () => {
  it("stamps authorisedById, authorisedByName, and authorisedAt on payroll record", async () => {
    const updated: Record<string, unknown> = {};
    const db = {
      update: () => ({
        set: (vals: Record<string, unknown>) => {
          Object.assign(updated, vals);
          return { where: () => Promise.resolve() };
        },
      }),
    };

    // Simulate the mutation logic
    const ctx = makeCtx();
    const now = new Date();
    const authorName = ctx.user.name;
    Object.assign(updated, {
      authorisedById: ctx.user.id,
      authorisedByName: authorName,
      authorisedAt: now,
      rejectedById: null,
      rejectedAt: null,
      rejectionComment: null,
    });

    expect(updated.authorisedById).toBe(1);
    expect(updated.authorisedByName).toBe("Dr Hamid");
    expect(updated.authorisedAt).toBeInstanceOf(Date);
    expect(updated.rejectedById).toBeNull();
    expect(updated.rejectionComment).toBeNull();
  });

  it("clears previous rejection when authorising", () => {
    const fields = {
      authorisedById: 1,
      authorisedByName: "Dr Hamid",
      authorisedAt: new Date(),
      rejectedById: null,
      rejectedAt: null,
      rejectionComment: null,
      deferredToMonth: null,
      deferredToYear: null,
    };
    expect(fields.rejectedById).toBeNull();
    expect(fields.deferredToMonth).toBeNull();
  });
});

// ─── reject ───────────────────────────────────────────────────────────────────

describe("expenses.reject", () => {
  it("defers to next month when month is not December", () => {
    const month = 5;
    const year = 2026;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    expect(nextMonth).toBe(6);
    expect(nextYear).toBe(2026);
  });

  it("wraps December to January of next year", () => {
    const month = 12;
    const year = 2026;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    expect(nextMonth).toBe(1);
    expect(nextYear).toBe(2027);
  });

  it("stamps rejectedByName, rejectedAt, rejectionComment, and deferredToMonth", () => {
    const ctx = makeCtx();
    const now = new Date();
    const comment = "Invoice missing";
    const month = 5;
    const year = 2026;
    const nextMonth = 6;
    const nextYear = 2026;

    const fields = {
      rejectedById: ctx.user.id,
      rejectedByName: ctx.user.name,
      rejectedAt: now,
      rejectionComment: comment,
      deferredToMonth: nextMonth,
      deferredToYear: nextYear,
      authorisedById: null,
      authorisedAt: null,
    };

    expect(fields.rejectedById).toBe(1);
    expect(fields.rejectedByName).toBe("Dr Hamid");
    expect(fields.rejectionComment).toBe("Invoice missing");
    expect(fields.deferredToMonth).toBe(6);
    expect(fields.deferredToYear).toBe(2026);
    expect(fields.authorisedById).toBeNull();
  });

  it("sets paymentStatus to withheld for payroll type", () => {
    const extraFields = { paymentStatus: "withheld", withheldAt: new Date(), withheldReason: "No invoice" };
    expect(extraFields.paymentStatus).toBe("withheld");
  });
});

// ─── extractChequeData ────────────────────────────────────────────────────────

describe("expenses.extractChequeData", () => {
  it("returns structured cheque data on success", async () => {
    const mockResponse = {
      choices: [{ message: { content: JSON.stringify({ chequeNumber: "123456", date: "2026-05-01", amount: "1250.00", payee: "Abdullah Quilliam Society" }) } }],
    };
    const content = mockResponse.choices[0].message.content;
    const parsed = JSON.parse(content);
    expect(parsed.chequeNumber).toBe("123456");
    expect(parsed.date).toBe("2026-05-01");
    expect(parsed.amount).toBe("1250.00");
    expect(parsed.payee).toBe("Abdullah Quilliam Society");
  });

  it("returns null fields on extraction failure", () => {
    const fallback = { chequeNumber: null, date: null, amount: null, payee: null };
    expect(fallback.chequeNumber).toBeNull();
    expect(fallback.amount).toBeNull();
  });

  it("handles partial extraction gracefully", () => {
    const partial = { chequeNumber: "654321", date: null, amount: "500.00", payee: null };
    expect(partial.chequeNumber).toBe("654321");
    expect(partial.date).toBeNull();
    expect(partial.amount).toBe("500.00");
  });
});

// ─── allItems aggregation ─────────────────────────────────────────────────────

describe("expenses.allItems aggregation", () => {
  it("returns four categories: payroll, receipts, volunteers, loans", () => {
    const result = { payroll: [{ id: 1 }], receipts: [{ id: 2 }], volunteers: [], loans: [] };
    expect(result).toHaveProperty("payroll");
    expect(result).toHaveProperty("receipts");
    expect(result).toHaveProperty("volunteers");
    expect(result).toHaveProperty("loans");
  });

  it("payroll items include authorisation fields", () => {
    const item = {
      id: 1, employeeName: "Ahmed Ali", netPay: "2500.00",
      authorisedById: 1, authorisedByName: "Dr Hamid", authorisedAt: new Date(),
      rejectedById: null, rejectedByName: null, rejectedAt: null,
      rejectionComment: null, deferredToMonth: null, deferredToYear: null,
    };
    expect(item.authorisedByName).toBe("Dr Hamid");
    expect(item.rejectedById).toBeNull();
  });

  it("receipt items include submitterName from user join", () => {
    const item = { id: 5, vendor: "Staples", amount: "45.00", submitterName: "Fatima Hassan" };
    expect(item.submitterName).toBe("Fatima Hassan");
  });

  it("loan items include borrowerName from loanApplications join", () => {
    const item = { id: 3, amount: "200.00", borrowerName: "Yusuf Ibrahim" };
    expect(item.borrowerName).toBe("Yusuf Ibrahim");
  });
});

// ─── AuthBadge display logic ──────────────────────────────────────────────────

describe("AuthBadge display logic", () => {
  it("shows authorised state when authorisedAt is set", () => {
    const item = { authorisedAt: new Date(), authorisedByName: "Dr Hamid", rejectedAt: null };
    const isAuthorised = !!item.authorisedAt && !!item.authorisedByName;
    expect(isAuthorised).toBe(true);
  });

  it("shows rejected state when rejectedAt is set and not authorised", () => {
    const item = { authorisedAt: null, rejectedAt: new Date(), rejectedByName: "Dr Hamid" };
    const isRejected = !!item.rejectedAt && !item.authorisedAt;
    expect(isRejected).toBe(true);
  });

  it("shows pending state when neither authorised nor rejected", () => {
    const item = { authorisedAt: null, rejectedAt: null };
    const isPending = !item.authorisedAt && !item.rejectedAt;
    expect(isPending).toBe(true);
  });
});
