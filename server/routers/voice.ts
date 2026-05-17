/**
 * Voice Router — Ephemeral Token + Session Tracking + Cost Ceiling
 *
 * Creates short-lived Gemini API tokens so the browser can connect
 * DIRECTLY to Gemini Live API via WebSocket — no server proxy needed.
 *
 * Also tracks sessions, enforces monthly cost ceiling, and logs tool calls.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { GoogleGenAI } from "@google/genai";
import {
  createVoiceSession,
  endVoiceSession,
  errorVoiceSession,
  recordVoiceCost,
  getMonthlyVoiceCost,
  getTotalMonthlyVoiceCost,
  logVoiceToolCall,
  logVoiceTranscript,
  getRecentVoiceSessions,
} from "../db.voice";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = "gemini-2.5-flash-native-audio-latest";

// Monthly cost ceiling in pence (£500 = 50000 pence)
const MONTHLY_CEILING_PENCE = 50000;

// Estimated cost per token in pence (Gemini Flash audio: ~£0.001 per 1K tokens)
// This is a rough estimate — adjust based on actual billing
const COST_PER_1K_TOKENS_PENCE = 0.1;

export const voiceRouter = router({
  /**
   * Get an ephemeral token for client-side Gemini Live API connection.
   * Also creates a session record and checks the monthly cost ceiling.
   * Includes issuedAt timestamp for freshness validation (anti-replay).
   */
  getEphemeralToken: protectedProcedure
    .input(z.object({
      device: z.string().optional(),
      screenContext: z.string().optional(),
      requestTimestamp: z.number().optional(), // Client-side timestamp for freshness check
    }).optional())
    .mutation(async ({ ctx, input }) => {
      // ── Token freshness check (anti-replay) ──
      // If client sends a requestTimestamp, reject if it's older than 60 seconds
      if (input?.requestTimestamp) {
        const age = Date.now() - input.requestTimestamp;
        if (age > 60_000 || age < -10_000) {
          // Token request is stale (>60s old) or from the future (clock skew > 10s)
          console.warn(`[Voice] Stale token request rejected. Age: ${age}ms, User: ${ctx.user.id}`);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Token request expired. Please try again.",
          });
        }
      }
      if (!GEMINI_API_KEY) {
        console.error("[Voice] GEMINI_API_KEY not configured");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Voice service not configured",
        });
      }

      // ── Monthly ceiling check ──
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const userRole = ctx.user.role;

      // Superadmins bypass the ceiling
      if (userRole !== "admin") {
        try {
          const monthlyTotal = await getTotalMonthlyVoiceCost(currentYear, currentMonth);
          if (monthlyTotal >= MONTHLY_CEILING_PENCE) {
            console.warn(`[Voice] Monthly ceiling reached: ${monthlyTotal} pence. User ${ctx.user.id} (${userRole}) blocked.`);
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Monthly voice budget has been reached. Please contact an administrator.",
            });
          }
        } catch (err: any) {
          if (err instanceof TRPCError) throw err;
          // Don't block on cost check failure — log and continue
          console.error("[Voice] Cost ceiling check failed:", err?.message);
        }
      }

      try {
        const ai = new GoogleGenAI({
          apiKey: GEMINI_API_KEY,
          httpOptions: { apiVersion: "v1alpha" },
        });

        const expireTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 min
        const newSessionExpireTime = new Date(now.getTime() + 2 * 60 * 1000); // 2 min

        const token = await ai.authTokens.create({
          config: {
            uses: 1,
            expireTime: expireTime.toISOString(),
            newSessionExpireTime: newSessionExpireTime.toISOString(),
          },
        });

        if (!token?.name) {
          throw new Error("Empty token returned from Gemini API");
        }

        // ── Create session record ──
        const conversationId = `voice-${ctx.user.id}-${Date.now()}`;
        let sessionId: number | null = null;
        try {
          sessionId = await createVoiceSession({
            userId: ctx.user.id,
            conversationId,
            device: input?.device || "unknown",
            screenContext: input?.screenContext || "unknown",
          });
        } catch (err: any) {
          console.error("[Voice] Failed to create session record:", err?.message);
          // Don't block on session creation failure
        }

        console.log(`[Voice] Ephemeral token created for user ${ctx.user.name} (${ctx.user.id}), session ${sessionId}`);

        return {
          token: token.name,
          model: MODEL,
          user: ctx.user.name || ctx.user.openId || "User",
          sessionId,
          conversationId,
          issuedAt: Date.now(), // For client-side freshness validation
          monthlyCostPence: await getTotalMonthlyVoiceCost(currentYear, currentMonth).catch(() => 0),
          ceilingPence: MONTHLY_CEILING_PENCE,
        };
      } catch (err: any) {
        console.error("[Voice] Failed to create ephemeral token:", err?.message || err);
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to initialize voice: ${err?.message || "Unknown error"}`,
        });
      }
    }),

  /**
   * End a voice session — records final token count, cost, and status
   */
  endSession: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      tokenCount: z.number().default(0),
      durationSeconds: z.number().default(0),
      error: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        if (input.error) {
          await errorVoiceSession(input.sessionId);
        } else {
          await endVoiceSession(input.sessionId, input.tokenCount);
        }

        // Estimate cost and record it
        // Rough estimate: ~1 token per second of audio + tool overhead
        const estimatedTokens = input.tokenCount || Math.max(input.durationSeconds * 10, 100);
        const estimatedCostPence = Math.ceil((estimatedTokens / 1000) * COST_PER_1K_TOKENS_PENCE);

        await recordVoiceCost({
          userId: ctx.user.id,
          tokenCount: estimatedTokens,
          estimatedCostPence,
        });

        console.log(`[Voice] Session ${input.sessionId} ended. Tokens: ${estimatedTokens}, Cost: ${estimatedCostPence}p`);
        return { success: true, estimatedCostPence };
      } catch (err: any) {
        console.error("[Voice] Failed to end session:", err?.message);
        return { success: false, estimatedCostPence: 0 };
      }
    }),

  /**
   * Log a tool call from the client
   */
  logToolCall: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      toolName: z.string(),
      params: z.string().optional(),
      resultSummary: z.string().optional(),
      success: z.boolean().default(true),
      errorMessage: z.string().optional(),
      latencyMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        await logVoiceToolCall(input);
        return { success: true };
      } catch (err: any) {
        console.error("[Voice] Failed to log tool call:", err?.message);
        return { success: false };
      }
    }),

  /**
   * Log transcript entries from the client
   */
  logTranscript: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      role: z.enum(["user", "assistant", "system", "tool"]),
      content: z.string(),
    }))
    .mutation(async ({ input }) => {
      try {
        await logVoiceTranscript(input);
        return { success: true };
      } catch (err: any) {
        console.error("[Voice] Failed to log transcript:", err?.message);
        return { success: false };
      }
    }),

  /**
   * Get voice usage stats for the current user
   */
  getUsageStats: protectedProcedure
    .query(async ({ ctx }) => {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const [userCost, totalCost, recentSessions] = await Promise.all([
        getMonthlyVoiceCost(ctx.user.id, currentYear, currentMonth).catch(() => 0),
        getTotalMonthlyVoiceCost(currentYear, currentMonth).catch(() => 0),
        getRecentVoiceSessions(ctx.user.id, 5).catch(() => []),
      ]);

      return {
        userMonthlyCostPence: userCost,
        totalMonthlyCostPence: totalCost,
        ceilingPence: MONTHLY_CEILING_PENCE,
        remainingPence: Math.max(0, MONTHLY_CEILING_PENCE - totalCost),
        recentSessions: recentSessions.map(s => ({
          id: s.id,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          status: s.status,
          tokenCount: s.tokenCount,
        })),
      };
    }),
});
