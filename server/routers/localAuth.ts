import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { notifyOwner } from "../_core/notification";
import { sdk } from "../_core/sdk";
import { ENV } from "../_core/env";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  createLocalUser,
  getUserByEmail,
  getUserById,
  getUserByResetToken,
  setResetToken,
  updateLastSignedIn,
  updateUserPassword,
  listAllUsers,
  updateUserRole,
  setUserActive,
  getAdminReceiptStats,
  listReceipts,
} from "../db";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Brute-force protection ──────────────────────────────────────────────────
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface LoginAttemptRecord {
  attempts: number;
  lockedUntil: number | null; // epoch ms
}

/** In-memory store of failed login attempts per email. Exported for testing. */
export const loginAttempts = new Map<string, LoginAttemptRecord>();

/** Clean up expired lockout entries every 30 minutes */
const _cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts) {
    if (record.lockedUntil && record.lockedUntil < now) {
      loginAttempts.delete(key);
    }
  }
}, 30 * 60 * 1000);
if (_cleanupInterval.unref) _cleanupInterval.unref();

function checkAndRecordFailedAttempt(email: string): void {
  const key = email.toLowerCase();
  const record = loginAttempts.get(key) || { attempts: 0, lockedUntil: null };
  record.attempts += 1;
  if (record.attempts >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  }
  loginAttempts.set(key, record);
}

function isLockedOut(email: string): boolean {
  const key = email.toLowerCase();
  const record = loginAttempts.get(key);
  if (!record || !record.lockedUntil) return false;
  if (Date.now() > record.lockedUntil) {
    loginAttempts.delete(key);
    return false;
  }
  return true;
}

function clearLoginAttempts(email: string): void {
  loginAttempts.delete(email.toLowerCase());
}

async function createLocalSession(userId: number, email: string, name: string): Promise<string> {
  // We reuse the existing JWT infrastructure but store userId in the openId field
  // so the existing authenticateRequest still works
  return sdk.signSession({
    openId: `local:${userId}`,
    appId: ENV.appId,
    name: name || email,
  }, { expiresInMs: SESSION_MAX_AGE_MS });
}

export const localAuthRouter = router({
  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        email: z.string().email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getUserByEmail(input.email.toLowerCase());
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists" });
      }

      const passwordHash = await bcrypt.hash(input.password, 12);
      const user = await createLocalUser({
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash,
      });

      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create account" });

      // Only set session cookie for active users (first user is auto-approved as superadmin)
      if (user.status === "active" && user.isActive) {
        const token = await createLocalSession(user.id, user.email!, user.name ?? "");
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS });
      } else {
        // Notify owner of new registration needing approval
        await notifyOwner({
          title: "New User Registration - Approval Required",
          content: `${input.name} (${input.email}) has registered and is awaiting your approval. Log in to the Admin Panel to approve or reject their access.`,
        }).catch(() => {});
      }

      return {
        success: true,
        status: user.status,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      };
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // ── Brute-force check ──────────────────────────────────────────────
      if (isLockedOut(input.email)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many failed login attempts. Please try again in 15 minutes.",
        });
      }

      const user = await getUserByEmail(input.email.toLowerCase());
      if (!user || !user.passwordHash) {
        checkAndRecordFailedAttempt(input.email);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }
      // Check account status
      if (user.status === "pending") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your account is pending approval. You will be notified once an administrator approves your access." });
      }
      if (user.status === "suspended" || !user.isActive) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been suspended. Please contact an administrator." });
      }

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        checkAndRecordFailedAttempt(input.email);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      // Successful login — clear any failed attempt records
      clearLoginAttempts(input.email);
      await updateLastSignedIn(user.id);

      const token = await createLocalSession(user.id, user.email!, user.name ?? "");
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS });

      return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }),

  forgotPassword: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const user = await getUserByEmail(input.email.toLowerCase());
      // Always return success to prevent email enumeration
      if (!user || !user.passwordHash) return { success: true };

      const token = nanoid(48);
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await setResetToken(user.id, token, expiry);

      // Send reset link via owner notification (acts as email proxy)
      await notifyOwner({
        title: "Password Reset Request",
        content: `${user.name ?? user.email} has requested a password reset.\n\nReset token: ${token}\n\nThis token expires in 1 hour.\n\nIf you have a custom domain set up, the reset link would be: /reset-password?token=${token}`,
      }).catch(() => {});

      return { success: true };
    }),

  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
        password: z.string().min(8, "Password must be at least 8 characters"),
      })
    )
    .mutation(async ({ input }) => {
      const user = await getUserByResetToken(input.token);
      if (!user || !user.resetTokenExpiry) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired reset token" });
      }
      if (new Date() > new Date(user.resetTokenExpiry)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reset token has expired. Please request a new one." });
      }

      const passwordHash = await bcrypt.hash(input.password, 12);
      await updateUserPassword(user.id, passwordHash);

      return { success: true };
    }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await getUserById(ctx.user.id);
      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change password for this account type" });
      }
      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
      }
      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await updateUserPassword(ctx.user.id, passwordHash);
      return { success: true };
    }),
});

// Admin-only procedures
const ADMIN_ROLES_LOCAL = ["superadmin", "admin", "trustee", "manager"];
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ADMIN_ROLES_LOCAL.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});
const superAdminOnlyProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "superadmin" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Super admin access required" });
  }
  return next({ ctx });
});

export const adminRouter = router({
  stats: adminProcedure.query(async () => {
    return getAdminReceiptStats();
  }),

  listUsers: adminProcedure
    .input(z.object({ limit: z.number().default(100), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      return listAllUsers(input.limit, input.offset);
    }),

  updateUserRole: superAdminOnlyProcedure
    .input(z.object({ userId: z.number(), role: z.string() }))
    .mutation(async ({ input }) => {
      await updateUserRole(input.userId, input.role);
      return { success: true };
    }),

  suspendUser: adminProcedure
    .input(z.object({ userId: z.number(), suspend: z.boolean() }))
    .mutation(async ({ input }) => {
      await setUserActive(input.userId, !input.suspend);
      return { success: true };
    }),

  allReceipts: adminProcedure
    .input(
      z.object({
        vendor: z.string().optional(),
        categoryName: z.string().optional(),
        status: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      // Admin sees all receipts (no userId filter)
      return listReceipts({
        categoryName: input.categoryName,
        vendor: input.vendor,
        dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
        dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });
    }),
});
