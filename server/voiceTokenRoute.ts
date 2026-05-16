/**
 * Voice Token Route — GET /api/voice/token
 * Issues short-lived JWT tokens for WebSocket authentication.
 * Requires an authenticated session (cookie-based).
 */
import type { Express, Request, Response } from "express";
import { generateWsToken } from "./wsAuth";
import { sdk } from "./_core/sdk";

export function registerVoiceTokenRoute(app: Express) {
  app.get("/api/voice/token", async (req: Request, res: Response) => {
    console.log("[VoiceToken] Token request received");
    console.log("[VoiceToken] Cookie header present:", !!req.headers.cookie);
    console.log("[VoiceToken] Cookie length:", req.headers.cookie?.length || 0);

    try {
      // Authenticate via session cookie (same as tRPC context)
      const user = await sdk.authenticateRequest(req);
      if (!user) {
        console.log("[VoiceToken] authenticateRequest returned null/undefined");
        return res.status(401).json({ error: "Not authenticated" });
      }
      console.log(`[VoiceToken] Authenticated: ${user.name} (id: ${user.id}, role: ${user.role})`);
      const token = await generateWsToken(user.id, user.role || "user", user.name || "User");
      console.log(`[VoiceToken] Token issued for ${user.name} (length: ${token.length})`);
      return res.json({ token });
    } catch (error: any) {
      const errMsg = error?.message || "Unknown auth error";
      const statusCode = error?.statusCode || 401;
      console.error(`[VoiceToken] Auth error (${statusCode}):`, errMsg);
      return res.status(401).json({ error: "Not authenticated. Please log in again.", detail: errMsg });
    }
  });
}
