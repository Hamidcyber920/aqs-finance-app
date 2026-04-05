import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock db helpers
vi.mock("./db", () => ({
  seedDefaultCategories: vi.fn().mockResolvedValue(undefined),
  getAllCategories: vi.fn().mockResolvedValue([
    { id: 1, name: "Catering & Food", color: "#f59e0b", icon: "utensils", createdAt: new Date() },
    { id: 2, name: "Utilities", color: "#3b82f6", icon: "zap", createdAt: new Date() },
  ]),
  listReceipts: vi.fn().mockResolvedValue({
    rows: [
      {
        id: 1,
        userId: 1,
        vendor: "Test Vendor",
        receiptDate: new Date("2026-03-15"),
        amount: "45.00",
        tax: "7.50",
        categoryName: "Catering & Food",
        status: "processed",
        imageUrl: "https://example.com/receipt.jpg",
        thumbnailUrl: "https://example.com/receipt-thumb.jpg",
        originalFilename: "receipt.jpg",
        mimeType: "image/jpeg",
        rawText: "Test receipt text",
        lineItems: [{ description: "Item 1", amount: 37.50 }, { description: "Tax", amount: 7.50 }],
        notes: "",
        currency: "GBP",
        createdAt: new Date("2026-03-15"),
        updatedAt: new Date("2026-03-15"),
        categoryId: 1,
      },
    ],
    total: 1,
  }),
  getReceiptById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    vendor: "Test Vendor",
    receiptDate: new Date("2026-03-15"),
    amount: "45.00",
    tax: "7.50",
    categoryName: "Catering & Food",
    status: "processed",
    imageUrl: "https://example.com/receipt.jpg",
    thumbnailUrl: null,
    originalFilename: "receipt.jpg",
    mimeType: "image/jpeg",
    rawText: null,
    lineItems: [],
    notes: null,
    currency: "GBP",
    createdAt: new Date("2026-03-15"),
    updatedAt: new Date("2026-03-15"),
    categoryId: 1,
  }),
  updateReceipt: vi.fn().mockResolvedValue(undefined),
  deleteReceipt: vi.fn().mockResolvedValue(undefined),
  createReceipt: vi.fn().mockResolvedValue(42),
  getCategoryTotals: vi.fn().mockResolvedValue([
    { categoryName: "Catering & Food", total: 45.00, count: 1 },
  ]),
  getMonthlyTotal: vi.fn().mockResolvedValue(45.00),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

function makeCtx(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("categories.list", () => {
  it("returns seeded categories", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.categories.list();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Catering & Food");
  });
});

describe("receipts.list", () => {
  it("returns receipts for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.receipts.list({});
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.rows[0].vendor).toBe("Test Vendor");
  });
});

describe("receipts.get", () => {
  it("returns a receipt by id", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.receipts.get({ id: 1 });
    expect(result.id).toBe(1);
    expect(result.vendor).toBe("Test Vendor");
  });

  it("throws FORBIDDEN when userId does not match", async () => {
    const caller = appRouter.createCaller(makeCtx(99));
    await expect(caller.receipts.get({ id: 1 })).rejects.toThrow("FORBIDDEN");
  });
});

describe("receipts.update", () => {
  it("updates receipt fields", async () => {
    const { updateReceipt } = await import("./db");
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.receipts.update({
      id: 1,
      vendor: "Updated Vendor",
      categoryName: "Utilities",
    });
    expect(result.success).toBe(true);
    expect(updateReceipt).toHaveBeenCalledWith(1, expect.objectContaining({ vendor: "Updated Vendor" }));
  });
});

describe("receipts.delete", () => {
  it("deletes a receipt", async () => {
    const { deleteReceipt } = await import("./db");
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.receipts.delete({ id: 1 });
    expect(result.success).toBe(true);
    expect(deleteReceipt).toHaveBeenCalledWith(1);
  });
});

describe("receipts.exportCsv", () => {
  it("generates valid CSV with headers", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.receipts.exportCsv({});
    expect(result.count).toBe(1);
    expect(result.csv).toContain("ID,Vendor,Date,Amount");
    expect(result.csv).toContain("Test Vendor");
    expect(result.csv).toContain("45.00");
  });
});

describe("receipts.categoryTotals", () => {
  it("returns category totals", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.receipts.categoryTotals({});
    expect(result).toHaveLength(1);
    expect(result[0].categoryName).toBe("Catering & Food");
  });
});

describe("upload.getUploadUrl", () => {
  it("creates a pending receipt and returns key", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.upload.getUploadUrl({
      filename: "receipt.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024 * 100,
    });
    expect(result.receiptId).toBe(42);
    expect(result.key).toContain("receipts/1/");
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("rejects oversized files", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.upload.getUploadUrl({
        filename: "big.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 20 * 1024 * 1024,
      })
    ).rejects.toThrow("too large");
  });

  it("rejects unsupported file types", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.upload.getUploadUrl({
        filename: "file.exe",
        mimeType: "application/exe",
        sizeBytes: 1024,
      })
    ).rejects.toThrow("Unsupported");
  });
});
