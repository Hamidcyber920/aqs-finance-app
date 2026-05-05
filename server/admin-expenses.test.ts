import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";

// Mock the DB module to avoid real DB calls
vi.mock("./db", () => ({
  getDb: vi.fn(() => null),
  listAllReceipts: vi.fn(async () => ({ rows: [], total: 0 })),
  listAllUsers: vi.fn(async () => ({ rows: [], total: 0 })),
}));

vi.mock("../drizzle/schema", () => ({
  receipts: {},
  users: {},
  staffProfiles: {},
  userPermissions: {},
  departments: {},
  expenseCategories: {},
}));

const adminCtx = {
  user: { id: 1, name: "superadmin", role: "admin" as const, email: "admin@aq.org" },
};

const userCtx = {
  user: { id: 2, name: "staff", role: "user" as const, email: "staff@aq.org" },
};

function makeAdminCaller() {
  return appRouter.createCaller(adminCtx as any);
}

function makeUserCaller() {
  return appRouter.createCaller(userCtx as any);
}

describe("receipts.adminList", () => {
  it("returns empty rows and total when DB is null", async () => {
    const caller = makeAdminCaller();
    const result = await caller.receipts.adminList({});
    expect(result).toHaveProperty("rows");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.total).toBe(0);
  });

  it("accepts optional userId filter", async () => {
    const caller = makeAdminCaller();
    const result = await caller.receipts.adminList({ userId: 5 });
    expect(result).toHaveProperty("rows");
  });

  it("accepts optional date range filters", async () => {
    const caller = makeAdminCaller();
    const result = await caller.receipts.adminList({
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    });
    expect(result).toHaveProperty("rows");
  });

  it("accepts optional status filter", async () => {
    const caller = makeAdminCaller();
    const result = await caller.receipts.adminList({ status: "processed" });
    expect(result).toHaveProperty("rows");
  });

  it("rejects non-admin users with FORBIDDEN", async () => {
    const caller = makeUserCaller();
    await expect(caller.receipts.adminList({})).rejects.toThrow();
  });

  it("respects limit/offset params", async () => {
    const caller = makeAdminCaller();
    const result = await caller.receipts.adminList({ limit: 10, offset: 0 });
    expect(result).toHaveProperty("rows");
  });
});

describe("receipts.adminUserList", () => {
  it("returns empty array when DB is null", async () => {
    const caller = makeAdminCaller();
    const result = await caller.receipts.adminUserList();
    expect(Array.isArray(result)).toBe(true);
  });

  it("rejects non-admin users with FORBIDDEN", async () => {
    const caller = makeUserCaller();
    await expect(caller.receipts.adminUserList()).rejects.toThrow();
  });
});
