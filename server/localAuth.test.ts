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
  // DB-backed brute-force lockout helpers
  isUserLockedOutDb: vi.fn().mockResolvedValue(false),
  incrementLoginAttemptsDb: vi.fn().mockResolvedValue(undefined),
  clearLoginAttemptsDb: vi.fn().mockResolvedValue(undefined),
  // TOTP helpers
  setTotpSecretDb: vi.fn().mockResolvedValue(undefined),
  enableTotpDb: vi.fn().mockResolvedValue(undefined),
  disableTotpDb: vi.fn().mockResolvedValue(undefined),
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

describe("localAuth.login — brute-force protection", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear the in-memory lockout map between tests
    const { loginAttempts } = await import("./routers/localAuth");
    loginAttempts.clear();
  });

  it("locks out after 5 failed attempts", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx());

    // Attempt 5 failed logins
    for (let i = 0; i < 5; i++) {
      await expect(
        caller.localAuth.login({ email: "victim@aq.org", password: "wrong" })
      ).rejects.toThrow(TRPCError);
    }

    // 6th attempt should be rate-limited (TOO_MANY_REQUESTS)
    try {
      await caller.localAuth.login({ email: "victim@aq.org", password: "wrong" });
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("TOO_MANY_REQUESTS");
      expect(err.message).toContain("Too many failed login attempts");
    }
  });

  it("clears lockout after successful login", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("correct", 12);
    const user = { ...regularUser, passwordHash: hash, status: "active", isActive: true } as any;

    // First, cause 3 failed attempts (below lockout threshold)
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx());
    for (let i = 0; i < 3; i++) {
      await expect(
        caller.localAuth.login({ email: "user@aq.org", password: "wrong" })
      ).rejects.toThrow(TRPCError);
    }

    // Now provide valid credentials
    vi.mocked(db.getUserByEmail).mockResolvedValue(user);
    vi.mocked(db.updateLastSignedIn).mockResolvedValue(undefined);
    const ctx = makeCtx();
    const caller2 = appRouter.createCaller(ctx);
    const result = await caller2.localAuth.login({ email: "user@aq.org", password: "correct" });
    expect(result.success).toBe(true);

    // After successful login, counter should be reset — another bad attempt should NOT immediately lock
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    const caller3 = appRouter.createCaller(makeCtx());
    await expect(
      caller3.localAuth.login({ email: "user@aq.org", password: "wrong" })
    ).rejects.toThrow(TRPCError);
    // Should be UNAUTHORIZED, not TOO_MANY_REQUESTS (only 1 attempt after reset)
    try {
      await caller3.localAuth.login({ email: "user@aq.org", password: "wrong" });
    } catch (err: any) {
      expect(err.code).toBe("UNAUTHORIZED");
    }
  });
});

describe("receipts.create — amount validation", () => {
  it("rejects negative amounts", async () => {
    const caller = appRouter.createCaller(makeCtx(regularUser));
    await expect(
      caller.receipts.create({
        amount: "-10.50",
        vendor: "Test",
        description: "Test",
      } as any)
    ).rejects.toThrow();
  });

  it("rejects zero amount", async () => {
    const caller = appRouter.createCaller(makeCtx(regularUser));
    await expect(
      caller.receipts.create({
        amount: "0",
        vendor: "Test",
        description: "Test",
      } as any)
    ).rejects.toThrow();
  });

  it("accepts positive amounts", async () => {
    // This will fail at DB level (mocked to null), but should pass Zod validation
    const caller = appRouter.createCaller(makeCtx(regularUser));
    // We just verify it doesn't throw a validation error for positive amounts
    try {
      await caller.receipts.create({
        amount: "25.99",
        vendor: "Tesco",
        description: "Groceries",
      } as any);
    } catch (err: any) {
      // Should NOT be a Zod validation error
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  });
});
