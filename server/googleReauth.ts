/**
 * Google OAuth Re-authorization Flow
 * 
 * Allows admins to re-connect Google Drive and Gmail when refresh tokens expire.
 * Creates an OAuth consent URL, handles the callback, and stores the new refresh token.
 */
import { Router, Request, Response } from "express";
import { google } from "googleapis";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
];

function getOAuth2Client(origin: string) {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }
  const redirectUri = `${origin}/api/google/callback`;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function registerGoogleReauthRoutes(app: ReturnType<typeof Router> | any) {
  // GET /api/google/auth-url - Generate the OAuth consent URL
  app.get("/api/google/auth-url", (req: Request, res: Response) => {
    try {
      const origin = req.headers.origin || `${req.protocol}://${req.get("host")}`;
      const oauth2Client = getOAuth2Client(origin);
      
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent", // Force consent to get a new refresh token
        scope: GOOGLE_SCOPES,
        state: Buffer.from(JSON.stringify({ origin })).toString("base64"),
      });
      
      res.json({ url: authUrl });
    } catch (err: any) {
      console.error("[GoogleReauth] Error generating auth URL:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/google/callback - Handle the OAuth callback
  app.get("/api/google/callback", async (req: Request, res: Response) => {
    try {
      const { code, state, error } = req.query;
      
      if (error) {
        console.error("[GoogleReauth] OAuth error:", error);
        return res.redirect("/?google_auth=error&reason=" + encodeURIComponent(String(error)));
      }
      
      if (!code || !state) {
        return res.redirect("/?google_auth=error&reason=missing_code");
      }

      // Decode state to get origin
      let origin: string;
      try {
        const stateData = JSON.parse(Buffer.from(String(state), "base64").toString());
        origin = stateData.origin;
      } catch {
        origin = `${req.protocol}://${req.get("host")}`;
      }

      const oauth2Client = getOAuth2Client(origin);
      const { tokens } = await oauth2Client.getToken(String(code));
      
      if (!tokens.refresh_token) {
        console.error("[GoogleReauth] No refresh token returned. User may need to revoke access and try again.");
        return res.redirect("/?google_auth=error&reason=no_refresh_token");
      }

      console.log("[GoogleReauth] New tokens obtained successfully");
      console.log("[GoogleReauth] Refresh token:", tokens.refresh_token.substring(0, 20) + "...");
      console.log("[GoogleReauth] Access token:", tokens.access_token?.substring(0, 20) + "...");

      // Update the environment variables at runtime
      process.env.GMAIL_REFRESH_TOKEN = tokens.refresh_token;
      process.env.GOOGLE_DRIVE_REFRESH_TOKEN = tokens.refresh_token;
      
      // Also write to .env file for persistence across restarts (dev mode)
      try {
        const envPath = path.join(process.cwd(), ".env");
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, "utf-8");
          // Update GMAIL_REFRESH_TOKEN
          if (envContent.includes("GMAIL_REFRESH_TOKEN=")) {
            envContent = envContent.replace(/GMAIL_REFRESH_TOKEN=.*/, `GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
          } else {
            envContent += `\nGMAIL_REFRESH_TOKEN=${tokens.refresh_token}`;
          }
          // Update GOOGLE_DRIVE_REFRESH_TOKEN
          if (envContent.includes("GOOGLE_DRIVE_REFRESH_TOKEN=")) {
            envContent = envContent.replace(/GOOGLE_DRIVE_REFRESH_TOKEN=.*/, `GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);
          } else {
            envContent += `\nGOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`;
          }
          fs.writeFileSync(envPath, envContent);
          console.log("[GoogleReauth] .env file updated with new refresh tokens");
        }
      } catch (envErr: any) {
        console.warn("[GoogleReauth] Could not update .env file:", envErr.message);
      }

      // Verify the new token works
      oauth2Client.setCredentials(tokens);
      try {
        const drive = google.drive({ version: "v3", auth: oauth2Client });
        await drive.files.list({ pageSize: 1 });
        console.log("[GoogleReauth] ✅ Drive access verified");
      } catch (verifyErr: any) {
        console.warn("[GoogleReauth] Drive verification failed:", verifyErr.message);
      }

      // Redirect back to the admin page with success
      res.redirect("/admin?google_auth=success");
    } catch (err: any) {
      console.error("[GoogleReauth] Callback error:", err.message);
      res.redirect("/?google_auth=error&reason=" + encodeURIComponent(err.message));
    }
  });

  // GET /api/google/status - Check if Google connection is working
  app.get("/api/google/status", async (req: Request, res: Response) => {
    try {
      const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID;
      const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_DRIVE_CLIENT_SECRET;
      const refreshToken = process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

      if (!clientId || !clientSecret || !refreshToken) {
        return res.json({ connected: false, error: "Credentials not configured" });
      }

      const auth = new google.auth.OAuth2(clientId, clientSecret);
      auth.setCredentials({ refresh_token: refreshToken });

      // Try to get an access token
      const { token } = await auth.getAccessToken();
      if (!token) {
        return res.json({ connected: false, error: "Could not obtain access token" });
      }

      // Test Drive access
      let driveOk = false;
      let driveFiles = 0;
      try {
        const drive = google.drive({ version: "v3", auth });
        const driveRes = await drive.files.list({ pageSize: 1 });
        driveOk = true;
        driveFiles = driveRes.data.files?.length || 0;
      } catch (e: any) {
        driveOk = false;
      }

      // Test Gmail access
      let gmailOk = false;
      try {
        const gmail = google.gmail({ version: "v1", auth });
        await gmail.users.getProfile({ userId: "me" });
        gmailOk = true;
      } catch (e: any) {
        gmailOk = false;
      }

      res.json({
        connected: driveOk || gmailOk,
        drive: driveOk,
        gmail: gmailOk,
        email: gmailOk ? process.env.GMAIL_FROM_EMAIL || "Connected" : null,
      });
    } catch (err: any) {
      res.json({ connected: false, error: err.message });
    }
  });
}
