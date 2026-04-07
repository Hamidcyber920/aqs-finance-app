import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// Mock the db module
vi.mock("./db", () => ({
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  createLocalUser: vi.fn(),
  updateLastSignedIn: vi.fn(),
  setResetToken: vi.fn(),
  getUserByResetToken: vi.fn(),
  updateUserPassword: vi.fn(),
  listAllUsers: vi.fn(),
  updateUserRole: vi.fn(),
  setUserActive: vi.fn(),
  getAdminReceiptStats: vi.fn(),
  listReceipts: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

vi.mock("./storage", () => ({ storagePut: vi.fn() }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn().mockResolvedValue(true) }));

import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeCtx(user?: TrpcContext["user"]): TrpcContext {
  const cookies: Record<string, string> = {};
  return {
    user: user ?? null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

const adminUser: NonNullable<TrpcContext["user"]> = {
  id: 1,
  openId: null,
  email: "admin@aq.org",
  name: "Admin",
  loginMethod: "local",
  role: "admin",
  passwordHash: null,
  resetToken: null,
  resetTokenExpiry: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const regularUser: NonNullable<TrpcContext["user"]> = {
  ...adminUser,
  id: 2,
  email: "user@aq.org",
  name: "Regular User",
  role: "user",
};

describe("localAuth.register", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects duplicate email", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(regularUser as any);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.localAuth.register({ name: "Test", email: "user@aq.org", password: "password123" })
    ).rejects.toThrow(TRPCError);
  });

  it("creates a new user and sets a session cookie", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    const newUser = { ...regularUser, id: 10, email: "new@aq.org", name: "New User", status: "active", isActive: true } as any;
    vi.mocked(db.createLocalUser).mockResolvedValue(newUser);

    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.localAuth.register({
      name: "New User",
      email: "new@aq.org",
      password: "securepassword",
    });

    expect(result.success).toBe(true);
    expect(result.user.email).toBe("new@aq.org");
    expect(ctx.res.cookie).toHaveBeenCalled();
  });
});

describe("localAuth.login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unknown email", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.localAuth.login({ email: "nobody@aq.org", password: "pass" })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects suspended account", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue({ ...regularUser, isActive: false } as any);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.localAuth.login({ email: "user@aq.org", password: "pass" })
    ).rejects.toThrow(TRPCError);
  });
});

describe("localAuth.forgotPassword", () => {
  it("always returns success (no email enumeration)", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.localAuth.forgotPassword({ email: "nobody@aq.org" });
    expect(result.success).toBe(true);
  });

  it("sets a reset token when user exists", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue({ ...regularUser, passwordHash: "hash" } as any);
    vi.mocked(db.setResetToken).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx());
    await caller.localAuth.forgotPassword({ email: "user@aq.org" });
    expect(db.setResetToken).toHaveBeenCalled();
  });
});

describe("localAuth.resetPassword", () => {
  it("rejects invalid token", async () => {
    vi.mocked(db.getUserByResetToken).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.localAuth.resetPassword({ token: "bad-token", password: "newpassword" })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects expired token", async () => {
    vi.mocked(db.getUserByResetToken).mockResolvedValue({
      ...regularUser,
      resetToken: "tok",
      resetTokenExpiry: new Date(Date.now() - 1000), // expired
    } as any);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.localAuth.resetPassword({ token: "tok", password: "newpassword" })
    ).rejects.toThrow(TRPCError);
  });

  it("updates password with valid token", async () => {
    vi.mocked(db.getUserByResetToken).mockResolvedValue({
      ...regularUser,
      resetToken: "valid-tok",
      resetTokenExpiry: new Date(Date.now() + 60_000),
    } as any);
    vi.mocked(db.updateUserPassword).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.localAuth.resetPassword({ token: "valid-tok", password: "newpassword" });
    expect(result.success).toBe(true);
    expect(db.updateUserPassword).toHaveBeenCalled();
  });
});

describe("admin procedures", () => {
  it("rejects non-admin users", async () => {
    vi.mocked(db.listAllUsers).mockResolvedValue({ rows: [], total: 0 });
    const caller = appRouter.createCaller(makeCtx(regularUser));
    await expect(
      caller.admin.listUsers({ limit: 10, offset: 0 })
    ).rejects.toThrow(TRPCError);
  });

  it("allows admin to list users", async () => {
    vi.mocked(db.listAllUsers).mockResolvedValue({ rows: [regularUser as any], total: 1 });
    const caller = appRouter.createCaller(makeCtx(adminUser));
    const result = await caller.admin.listUsers({ limit: 10, offset: 0 });
    expect(result.total).toBe(1);
  });

  it("allows admin to update user role", async () => {
    vi.mocked(db.updateUserRole).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx(adminUser));
    const result = await caller.admin.updateUserRole({ userId: 2, role: "admin" });
    expect(result.success).toBe(true);
  });

  it("allows admin to suspend a user", async () => {
    vi.mocked(db.setUserActive).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx(adminUser));
    const result = await caller.admin.suspendUser({ userId: 2, suspend: true });
    expect(result.success).toBe(true);
  });
});
