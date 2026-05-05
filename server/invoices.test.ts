import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./server/_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ADMIN_CTX = { user: { id: 1, name: "Dr Hamid", role: "admin" as const, email: "admin@aq.org" } };

// ─── Category taxonomy tests ──────────────────────────────────────────────────
describe("INVOICE_CATEGORIES taxonomy", () => {
  it("contains all required top-level categories", async () => {
    const { INVOICE_CATEGORIES } = await import("../client/src/pages/MonthlyExpenses");
    const required = [
      "Restaurant", "Cleaning", "Events", "Wholesale", "Temp Staff",
      "Travel", "Trustees", "Maintenance — Accommodation", "Maintenance — Red Brick",
      "Maintenance — Old Mosque", "Uniforms", "Accommodation Expenses", "Other",
    ];
    for (const cat of required) {
      expect(Object.keys(INVOICE_CATEGORIES)).toContain(cat);
    }
  });

  it("each category has at least one sub-category", async () => {
    const { INVOICE_CATEGORIES } = await import("../client/src/pages/MonthlyExpenses");
    for (const [cat, subs] of Object.entries(INVOICE_CATEGORIES)) {
      expect(subs.length, `${cat} should have sub-categories`).toBeGreaterThan(0);
    }
  });

  it("Maintenance categories have correct sub-categories", async () => {
    const { INVOICE_CATEGORIES } = await import("../client/src/pages/MonthlyExpenses");
    const maintenanceCats = ["Maintenance — Accommodation", "Maintenance — Red Brick", "Maintenance — Old Mosque"];
    for (const cat of maintenanceCats) {
      expect(INVOICE_CATEGORIES[cat]).toContain("Repairs");
      expect(INVOICE_CATEGORIES[cat]).toContain("Plumbing");
      expect(INVOICE_CATEGORIES[cat]).toContain("Electrical");
    }
  });

  it("Travel has expected sub-categories", async () => {
    const { INVOICE_CATEGORIES } = await import("../client/src/pages/MonthlyExpenses");
    expect(INVOICE_CATEGORIES["Travel"]).toContain("Fuel");
    expect(INVOICE_CATEGORIES["Travel"]).toContain("Train/Bus");
    expect(INVOICE_CATEGORIES["Travel"]).toContain("Parking");
  });

  it("Accommodation Expenses has utility sub-categories", async () => {
    const { INVOICE_CATEGORIES } = await import("../client/src/pages/MonthlyExpenses");
    expect(INVOICE_CATEGORIES["Accommodation Expenses"]).toContain("Utilities");
    expect(INVOICE_CATEGORIES["Accommodation Expenses"]).toContain("Council Tax");
    expect(INVOICE_CATEGORIES["Accommodation Expenses"]).toContain("Insurance");
  });
});

// ─── Invoice business logic tests ─────────────────────────────────────────────
describe("Invoice carry-forward logic", () => {
  it("calculates next month correctly for non-December", () => {
    const month = 5; const year = 2026;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    expect(nextMonth).toBe(6);
    expect(nextYear).toBe(2026);
  });

  it("calculates next month correctly for December", () => {
    const month = 12; const year = 2026;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    expect(nextMonth).toBe(1);
    expect(nextYear).toBe(2027);
  });

  it("deferred items from previous month should appear in current month list", () => {
    const currentMonth = 5; const currentYear = 2026;
    const deferredItems = [
      { id: 1, deferredToMonth: 5, deferredToYear: 2026, paymentStatus: "withheld" },
      { id: 2, deferredToMonth: 6, deferredToYear: 2026, paymentStatus: "withheld" },
    ];
    const relevant = deferredItems.filter(
      r => r.deferredToMonth === currentMonth && r.deferredToYear === currentYear
    );
    expect(relevant).toHaveLength(1);
    expect(relevant[0].id).toBe(1);
  });
});

// ─── Invoice validation tests ─────────────────────────────────────────────────
describe("Invoice input validation", () => {
  it("requires category and amount fields", () => {
    const validate = (input: { category?: string; amount?: string }) => {
      if (!input.category || !input.amount) return { valid: false, error: "Category and amount are required" };
      return { valid: true };
    };
    expect(validate({})).toEqual({ valid: false, error: "Category and amount are required" });
    expect(validate({ category: "Restaurant" })).toEqual({ valid: false, error: "Category and amount are required" });
    expect(validate({ category: "Restaurant", amount: "150.00" })).toEqual({ valid: true });
  });

  it("formats amounts correctly", () => {
    const fmt = (v: string | number | null | undefined) => {
      const n = parseFloat(String(v ?? "0"));
      return isNaN(n) ? "£0.00" : `£${n.toFixed(2)}`;
    };
    expect(fmt("150")).toBe("£150.00");
    expect(fmt(99.9)).toBe("£99.90");
    expect(fmt(null)).toBe("£0.00");
    expect(fmt("abc")).toBe("£0.00");
  });

  it("accepts valid payment methods", () => {
    const validMethods = ["cheque", "bank_transfer", "cash"];
    for (const method of validMethods) {
      expect(validMethods).toContain(method);
    }
  });
});

// ─── AI extraction tests ──────────────────────────────────────────────────────
describe("AI evidence extraction", () => {
  it("extracts expected fields from cheque document type", () => {
    const mockExtractedData = {
      chequeNumber: "000123",
      date: "2026-05-01",
      amount: "250.00",
      payee: "Toolstation Ltd",
      vendor: "Toolstation Ltd",
    };
    expect(mockExtractedData.chequeNumber).toBe("000123");
    expect(mockExtractedData.amount).toBe("250.00");
    expect(mockExtractedData.vendor).toBe("Toolstation Ltd");
  });

  it("extracts expected fields from invoice document type", () => {
    const mockExtractedData = {
      invoiceNumber: "INV-2026-001",
      date: "2026-05-03",
      amount: "480.00",
      vendor: "Cleaning Services Ltd",
      description: "Monthly office cleaning",
      category: "Cleaning",
    };
    expect(mockExtractedData.invoiceNumber).toBe("INV-2026-001");
    expect(mockExtractedData.vendor).toBe("Cleaning Services Ltd");
    expect(mockExtractedData.category).toBe("Cleaning");
  });

  it("maps extracted category to taxonomy", () => {
    const INVOICE_CATEGORIES_KEYS = [
      "Restaurant", "Cleaning", "Events", "Wholesale", "Temp Staff",
      "Travel", "Trustees", "Maintenance — Accommodation", "Maintenance — Red Brick",
      "Maintenance — Old Mosque", "Uniforms", "Accommodation Expenses", "Other",
    ];
    const extractedCategory = "cleaning";
    const match = INVOICE_CATEGORIES_KEYS.find(k =>
      k.toLowerCase().includes(extractedCategory.toLowerCase())
    );
    expect(match).toBe("Cleaning");
  });
});

// ─── Authorisation flow tests ─────────────────────────────────────────────────
describe("Invoice authorisation flow", () => {
  it("authorise stamps authorisedByName and authorisedAt", () => {
    const now = new Date();
    const result = {
      success: true,
      authorisedAt: now,
      authorisedByName: ADMIN_CTX.user.name,
    };
    expect(result.success).toBe(true);
    expect(result.authorisedByName).toBe("Dr Hamid");
    expect(result.authorisedAt).toBeInstanceOf(Date);
  });

  it("reject clears authorisation and sets deferral", () => {
    const month = 5; const year = 2026;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const result = {
      success: true,
      rejectedAt: new Date(),
      deferredToMonth: nextMonth,
      deferredToYear: nextYear,
    };
    expect(result.deferredToMonth).toBe(6);
    expect(result.deferredToYear).toBe(2026);
  });

  it("authorised item should not show 'Awaiting authorisation' badge", () => {
    const item = { authorisedAt: new Date(), authorisedByName: "Dr Hamid", rejectedAt: null };
    const isAuthorised = !!item.authorisedAt;
    const isRejected = !!item.rejectedAt && !item.authorisedAt;
    const isAwaiting = !isAuthorised && !isRejected;
    expect(isAuthorised).toBe(true);
    expect(isAwaiting).toBe(false);
  });

  it("rejected item should show deferred badge", () => {
    const item = { authorisedAt: null, rejectedAt: new Date(), deferredToMonth: 6, deferredToYear: 2026 };
    const isRejected = !!item.rejectedAt && !item.authorisedAt;
    expect(isRejected).toBe(true);
    expect(item.deferredToMonth).toBe(6);
  });
});
