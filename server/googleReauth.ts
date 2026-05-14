/**
 * Google OAuth Re-authorization Flow
 * 
 * Allows admins to re-connect Google Drive and Gmail when refresh tokens expire.
 * Creates an OAuth consent URL, handles the callback, and stores the new refresh token.
 */
import { Router, Request, Response } from "express";
import { google } from "googleapis";
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
  "https://mail.google.com/",
];

/**
 * Determine the correct base URL for the redirect URI.
 * In production (behind a proxy), we need to use https and the correct host.
 */
function getBaseUrl(req: Request): string {
  // Check x-forwarded headers (set by reverse proxy in production)
  const forwardedProto = req.headers["x-forwarded-proto"] as string | undefined;
  const forwardedHost = req.headers["x-forwarded-host"] as string | undefined;
  
  // Use forwarded values if available (production behind proxy)
  const protocol = forwardedProto || req.protocol || "https";
  const host = forwardedHost || req.get("host") || "receiptapp-excmtodu.manus.space";
  
  // Always use https for production domains
  const finalProtocol = host.includes("manus.space") || host.includes("manus.computer") ? "https" : protocol;
  
  return `${finalProtocol}://${host}`;
}

function getOAuth2Client(baseUrl: string) {
  // IMPORTANT: Use GMAIL_CLIENT_ID ("Aqs finance app" - 781074422659) which has the
  // redirect URI registered in Google Cloud Console. Do NOT use GOOGLE_REAUTH_CLIENT_ID
  // ("Hibba io" - 608725271076) as it doesn't have the redirect URI registered.
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }
  const redirectUri = `${baseUrl}/api/google/callback`;
  console.log("[GoogleReauth] Using client ID:", clientId.substring(0, 20) + "...");
  console.log("[GoogleReauth] Using redirect URI:", redirectUri);
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function registerGoogleReauthRoutes(app: ReturnType<typeof Router> | any) {
  // GET /api/google/auth-url - Generate the OAuth consent URL
  app.get("/api/google/auth-url", (req: Request, res: Response) => {
    try {
      // Accept origin from query param, header, or derive from request
      const origin = (req.query.origin as string) || req.headers.origin || getBaseUrl(req);
      const baseUrl = origin.replace(/\/$/, ""); // Remove trailing slash
      
      console.log("[GoogleReauth] auth-url requested, origin:", origin, "baseUrl:", baseUrl);
      
      const oauth2Client = getOAuth2Client(baseUrl);
      
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent", // Force consent to get a new refresh token
        scope: GOOGLE_SCOPES,
        state: Buffer.from(JSON.stringify({ origin: baseUrl })).toString("base64"),
      });
      
      console.log("[GoogleReauth] Generated auth URL (first 100 chars):", authUrl.substring(0, 100));
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
      let baseUrl: string;
      try {
        const stateData = JSON.parse(Buffer.from(String(state), "base64").toString());
        baseUrl = stateData.origin;
      } catch {
        baseUrl = getBaseUrl(req);
      }

      console.log("[GoogleReauth] Callback received, baseUrl from state:", baseUrl);
      
      const oauth2Client = getOAuth2Client(baseUrl);
      const { tokens } = await oauth2Client.getToken(String(code));
      
      if (!tokens.refresh_token) {
        console.error("[GoogleReauth] No refresh token returned. User may need to revoke access and try again.");
        return res.redirect("/admin?google_auth=error&reason=no_refresh_token");
      }

      console.log("[GoogleReauth] ✅ New tokens obtained successfully");
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
      res.redirect("/admin?google_auth=error&reason=" + encodeURIComponent(err.message));
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
      try {
        const drive = google.drive({ version: "v3", auth });
        await drive.files.list({ pageSize: 1 });
        driveOk = true;
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
        tokenPrefix: refreshToken.substring(0, 15) + "...",
      });
    } catch (err: any) {
      res.json({ connected: false, error: err.message });
    }
  });

  // GET /api/google/debug - Show what redirect URI would be used (for debugging)
  app.get("/api/google/debug", (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    const origin = req.headers.origin;
    const forwardedProto = req.headers["x-forwarded-proto"];
    const forwardedHost = req.headers["x-forwarded-host"];
    const host = req.get("host");
    const protocol = req.protocol;
    
    res.json({
      computed_base_url: baseUrl,
      redirect_uri: `${baseUrl}/api/google/callback`,
      headers: {
        origin,
        "x-forwarded-proto": forwardedProto,
        "x-forwarded-host": forwardedHost,
        host,
        protocol,
      },
      env: {
        has_client_id: !!(process.env.GOOGLE_REAUTH_CLIENT_ID || process.env.GMAIL_CLIENT_ID),
        has_client_secret: !!(process.env.GOOGLE_REAUTH_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET),
        has_refresh_token: !!(process.env.GMAIL_REFRESH_TOKEN),
        refresh_token_prefix: process.env.GMAIL_REFRESH_TOKEN?.substring(0, 15) || "not set",
      },
    });
  });
}
