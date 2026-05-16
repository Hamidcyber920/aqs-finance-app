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
      const hasCookie = !!req.headers.cookie;
      console.log(`[VoiceToken] Request: cookie present = ${hasCookie}`);
      // Authenticate using the httpOnly session cookie
      const user = await sdk.authenticateRequest(req);
      if (!user) {
        console.warn(`[VoiceToken] Auth returned null user (cookie present: ${hasCookie})`);
        return res.status(401).json({ error: "Not authenticated" });
      }
      console.log(`[VoiceToken] Auth success: userId=${user.id}, role=${user.role}`);
      // Generate a short-lived token for WebSocket connection
      const token = await generateWsToken(user.id, user.role, user.name || "User");
      return res.json({ token });
    } catch (err: any) {
      console.error("[VoiceToken] Error:", err?.message);
      return res.status(401).json({ error: "Authentication failed" });
    }
  });
}
