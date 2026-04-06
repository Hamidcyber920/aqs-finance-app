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

async function createLocalSession(userId: number, email: string, name: string): Promise<string> {
  // We reuse the existing JWT infrastructure but store userId in the openId field
  // so the existing authenticateRequest still works
  return sdk.signSession({
    openId: `local:${userId}`,
    appId: ENV.appId,
    name: name || email,
  }, { expiresInMs: ONE_YEAR_MS });
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
      const userId = await createLocalUser({
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash,
      });

      const user = await getUserById(userId);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create account" });

      const token = await createLocalSession(userId, user.email!, user.name ?? "");
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Notify owner of new registration
      await notifyOwner({
        title: "New User Registered",
        content: `${input.name} (${input.email}) has created an account on the Receipt Scanner.`,
      }).catch(() => {});

      return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await getUserByEmail(input.email.toLowerCase());
      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }
      if (!user.isActive) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been suspended. Please contact an administrator." });
      }

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      await updateLastSignedIn(user.id);

      const token = await createLocalSession(user.id, user.email!, user.name ?? "");
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

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
});

// Admin-only procedures
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
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

  updateUserRole: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]) }))
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
