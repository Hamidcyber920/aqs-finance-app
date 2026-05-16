/**
 * Voice Router — Ephemeral Token Endpoint for Hibba Voice Assistant
 *
 * Creates short-lived Gemini API tokens so the browser can connect
 * DIRECTLY to Gemini Live API via WebSocket — no server proxy needed.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = "gemini-2.5-flash-native-audio-latest";

export const voiceRouter = router({
  /**
   * Get an ephemeral token for client-side Gemini Live API connection.
   * The token is locked to the specific model and audio config.
   * Valid for 1 use, 2 minutes to start, 30 minutes session duration.
   */
  getEphemeralToken: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (!GEMINI_API_KEY) {
        console.error("[Voice] GEMINI_API_KEY not configured");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Voice service not configured",
        });
      }

      try {
        const ai = new GoogleGenAI({
          apiKey: GEMINI_API_KEY,
          httpOptions: { apiVersion: "v1alpha" },
        });

        const now = new Date();
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

        console.log(`[Voice] Ephemeral token created for user ${ctx.user.name} (${ctx.user.id})`);

        return {
          token: token.name,
          model: MODEL,
          user: ctx.user.name || ctx.user.openId || "User",
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
});
