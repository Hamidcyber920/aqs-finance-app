/**
 * Express route: GET /api/voice/token
 * 
 * Generates a short-lived JWT for WebSocket authentication.
 * The frontend calls this before opening a WebSocket connection,
 * then passes the token as a query parameter.
 */
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { generateWsToken } from "./wsAuth";

export function registerVoiceTokenRoute(app: Express) {
  app.get("/api/voice/token", async (req: Request, res: Response) => {
    try {
      // Authenticate using the httpOnly session cookie
      const user = await sdk.authenticateRequest(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      // Generate a short-lived token for WebSocket connection
      const token = await generateWsToken(user.id, user.role, user.name || "User");
      return res.json({ token });
    } catch (err: any) {
      console.error("[VoiceToken] Error:", err?.message);
      return res.status(401).json({ error: "Authentication failed" });
    }
  });
}
