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
    try {
      // Authenticate via session cookie (same as tRPC context)
      const user = await sdk.authenticateRequest(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const token = await generateWsToken(user.id, user.role || "user", user.name || "User");
      return res.json({ token });
    } catch (error: any) {
      console.error("[VoiceToken] Error:", error.message);
      return res.status(401).json({ error: "Not authenticated. Please log in again." });
    }
  });
}
