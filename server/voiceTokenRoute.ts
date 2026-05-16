/**
 * Voice Token Route — GET /api/voice/token
 * Issues short-lived JWT tokens for WebSocket authentication.
 * Requires an authenticated session (cookie-based).
 */
import type { Express, Request, Response } from "express";
import { generateWsToken } from "./wsAuth";

export function registerVoiceTokenRoute(app: Express) {
  app.get("/api/voice/token", async (req: Request, res: Response) => {
    try {
      // The user is authenticated via the session cookie (set by OAuth)
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const token = await generateWsToken(user.id, user.role || "user", user.name || "User");
      return res.json({ token });
    } catch (error: any) {
      console.error("[VoiceToken] Error:", error.message);
      return res.status(500).json({ error: "Failed to generate token" });
    }
  });
}
