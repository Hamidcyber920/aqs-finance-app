/**
 * Gmail Push Notification Webhook
 *
 * Google Cloud Pub/Sub sends a POST to /api/gmail/push when a new email arrives
 * in the configured Gmail inbox. This handler decodes the Pub/Sub message,
 * fetches the new message(s) from Gmail, and upserts them into inbound_emails.
 *
 * Setup requirements:
 * 1. Create a Google Cloud Pub/Sub topic (e.g. projects/hibba-finance/topics/gmail-inbox)
 * 2. Grant the Gmail service account (gmail-api-push@system.gserviceaccount.com) Pub/Sub Publisher role
 * 3. Create a push subscription pointing to https://<your-domain>/api/gmail/push
 * 4. Call commsInbox.registerGmailPush from the UI to activate the Gmail watch
 */

import type { Express } from "express";
import { getDb } from "./db";
import { inboundEmails, emailActivityLog } from "../drizzle/schema";
import { eq } from "drizzle-orm";

async function getGmailAccessToken(): Promise<string | null> {
  const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
  const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
  const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const { access_token } = await res.json() as { access_token: string };
  return access_token;
}

async function fetchAndStoreMessage(messageId: string, access_token: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Deduplicate
  const [existing] = await db.select({ id: inboundEmails.id }).from(inboundEmails)
    .where(eq(inboundEmails.gmailMessageId, messageId));
  if (existing) return false;

  const detailRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  if (!detailRes.ok) return false;
  const detail = await detailRes.json() as any;

  const headers = detail.payload?.headers ?? [];
  const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const fromRaw = getHeader("From");
  const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/) ?? [null, null, fromRaw];
  const fromName = fromMatch[1]?.trim() || undefined;
  const fromEmail = fromMatch[2]?.trim() || fromRaw;
  const subject = getHeader("Subject") || "(No subject)";
  const dateStr = getHeader("Date");
  const receivedAt = dateStr ? new Date(dateStr) : new Date();

  // Extract plain text body
  let bodyText = "";
  const extractBody = (part: any): string => {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
    if (part.parts) {
      for (const p of part.parts) {
        const t = extractBody(p);
        if (t) return t;
      }
    }
    return "";
  };
  bodyText = extractBody(detail.payload);
  const snippet = detail.snippet ?? bodyText.slice(0, 200);

  // Determine priority based on labels
  const labels: string[] = detail.labelIds ?? [];
  const priority = labels.includes("IMPORTANT") ? "high" : "normal";

  const [result] = await db.insert(inboundEmails).values({
    gmailMessageId: messageId,
    gmailThreadId: detail.threadId,
    fromEmail,
    fromName,
    subject,
    bodyText,
    snippet,
    receivedAt,
    status: "unread",
    priority,
  });

  const emailId = (result as any).insertId;
  if (emailId) {
    await db.insert(emailActivityLog).values({
      emailId,
      userId: 0, // system action
      action: "received",
      notes: "Received via Gmail push webhook",
    });
  }
  return true;
}

export function registerGmailWebhook(app: Express) {
  // POST /api/gmail/push — receives Pub/Sub push notifications from Google
  app.post("/api/gmail/push", async (req, res) => {
    try {
      // Pub/Sub sends a JSON body with a base64-encoded message
      const body = req.body as any;
      if (!body?.message?.data) {
        // Acknowledge even if no data to prevent retry loops
        return res.status(200).json({ received: true });
      }

      // Decode the Pub/Sub message
      const decoded = Buffer.from(body.message.data, "base64").toString("utf-8");
      let notification: any;
      try {
        notification = JSON.parse(decoded);
      } catch {
        return res.status(200).json({ received: true, error: "Invalid JSON in Pub/Sub message" });
      }

      // Gmail push notification contains: emailAddress, historyId
      const { emailAddress, historyId } = notification;
      if (!emailAddress || !historyId) {
        return res.status(200).json({ received: true, error: "Missing emailAddress or historyId" });
      }

      console.log(`[Gmail Push] Notification for ${emailAddress}, historyId: ${historyId}`);

      // Get access token
      const access_token = await getGmailAccessToken();
      if (!access_token) {
        console.error("[Gmail Push] Failed to get access token");
        return res.status(200).json({ received: true, error: "Could not get access token" });
      }

      // Fetch the history to find new messages
      const historyRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${historyId}&historyTypes=messageAdded&labelId=INBOX`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );

      if (!historyRes.ok) {
        console.error(`[Gmail Push] History fetch failed: ${historyRes.status}`);
        return res.status(200).json({ received: true });
      }

      const historyData = await historyRes.json() as any;
      const historyRecords: any[] = historyData.history ?? [];
      let imported = 0;

      for (const record of historyRecords) {
        const addedMessages: any[] = record.messagesAdded ?? [];
        for (const { message } of addedMessages) {
          if (message?.id) {
            const stored = await fetchAndStoreMessage(message.id, access_token);
            if (stored) imported++;
          }
        }
      }

      console.log(`[Gmail Push] Imported ${imported} new message(s)`);
      return res.status(200).json({ received: true, imported });
    } catch (err) {
      console.error("[Gmail Push] Webhook error:", err);
      // Always return 200 to prevent Pub/Sub retry storms
      return res.status(200).json({ received: true, error: "Internal error" });
    }
  });
}
