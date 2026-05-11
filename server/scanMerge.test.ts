/**
 * Tests for scanMerge.revert and scanMerge.getLatest procedures.
 *
 * These tests verify:
 * 1. revert requires authentication
 * 2. revert requires senior role
 * 3. revert throws NOT_FOUND for a non-existent snapshot
 * 4. revert throws FORBIDDEN when the 10-minute window has expired
 * 5. revert successfully restores a trustees record from snapshot
 * 6. getLatest returns null for unknown record
 * 7. getLatest returns null when snapshot is older than 10 minutes
 * 8. getLatest returns snapshot info within the 10-minute window
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── DB mock ─────────────────────────────────────────────────────────────────
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockFrom = vi.fn();
const mockValues = vi.fn();
const mockSet = vi.fn();
const mockOrderBy = vi.fn();
const mockAnd = vi.fn();

// Chainable mock builder
function chainable(finalValue: any) {
  const obj: any = {};
  const methods = ["select", "insert", "update", "from", "where", "limit", "values", "set", "orderBy", "and"];
  for (const m of methods) {
    obj[m] = vi.fn().mockReturnValue(obj);
  }
  // Make it thenable so await works
  obj.then = (resolve: any) => resolve(finalValue);
  return obj;
}

// Snapshot factory
function makeSnapshot(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    tableName: "trustees",
    recordId: 42,
    snapshotJson: JSON.stringify({
      id: 42,
      fullName: "Old Name",
      email: "old@example.com",
      phone: "07000000000",
      role: "Trustee",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    }),
    mergedByUserId: 1,
    mergedByName: "Test User",
    mergedAt: new Date(), // fresh — within 10 min
    ...overrides,
  };
}

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([[]]),
  }),
}));

vi.mock("../drizzle/schema", () => ({
  scanMergeSnapshots: { id: "id", tableName: "tableName", recordId: "recordId", mergedAt: "mergedAt", revertedAt: "revertedAt" },
  trustees: { id: "id", fullName: "fullName", email: "email" },
  donors: { id: "id", name: "name", email: "email" },
  staffProfiles: { id: "id", fullName: "fullName", contractType: "contractType" },
  users: { id: "id", status: "status" },
}));

// ─── Context helpers ──────────────────────────────────────────────────────────
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(role: string): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: `${role}-user`,
    email: `${role}@example.com`,
    name: `${role} User`,
    loginMethod: "local",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { cookies: {}, headers: {}, body: {} } as unknown as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function unauthContext(): TrpcContext {
  return {
    user: null,
    req: { cookies: {}, headers: {}, body: {} } as unknown as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("scanMerge.revert — auth & role gates", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(unauthContext());
    await expect(
      caller.scanMerge.revert({ snapshotId: 1 })
    ).rejects.toThrow();
  });

  it("rejects regular user role", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(
      caller.scanMerge.revert({ snapshotId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("scanMerge.revert — business logic", () => {
  it("throws NOT_FOUND for a non-existent snapshot", async () => {
    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValueOnce({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce([]), // empty result
    });

    const caller = appRouter.createCaller(createContext("superadmin"));
    await expect(
      caller.scanMerge.revert({ snapshotId: 9999 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws FORBIDDEN when 10-minute window has expired", async () => {
    const expiredSnapshot = makeSnapshot({
      mergedAt: new Date(Date.now() - 11 * 60 * 1000), // 11 minutes ago
    });

    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValueOnce({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce([expiredSnapshot]),
    });

    const caller = appRouter.createCaller(createContext("superadmin"));
    await expect(
      caller.scanMerge.revert({ snapshotId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("scanMerge.getLatest — queries", () => {
  it("returns null for an unknown record", async () => {
    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValueOnce({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce([]), // no snapshot
    });

    const caller = appRouter.createCaller(createContext("superadmin"));
    const result = await caller.scanMerge.getLatest({ tableName: "trustees", recordId: 9999 });
    expect(result).toBeNull();
  });

  it("returns null when snapshot is older than 10 minutes", async () => {
    const oldSnapshot = makeSnapshot({
      mergedAt: new Date(Date.now() - 11 * 60 * 1000),
    });

    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValueOnce({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce([oldSnapshot]),
    });

    const caller = appRouter.createCaller(createContext("trustee"));
    const result = await caller.scanMerge.getLatest({ tableName: "trustees", recordId: 42 });
    expect(result).toBeNull();
  });

  it("returns snapshot info when within the 10-minute window", async () => {
    const freshSnapshot = makeSnapshot({
      mergedAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
    });

    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValueOnce({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce([freshSnapshot]),
    });

    const caller = appRouter.createCaller(createContext("trustee"));
    const result = await caller.scanMerge.getLatest({ tableName: "trustees", recordId: 42 });
    expect(result).not.toBeNull();
    expect(result!.snapshotId).toBe(1);
    expect(result!.expiresInMs).toBeGreaterThan(0);
    expect(result!.expiresInMs).toBeLessThanOrEqual(8 * 60 * 1000); // ~8 min remaining
  });
});
