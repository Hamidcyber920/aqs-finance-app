/**
 * Google Services Helper
 * Unified module for Google Drive, Sheets, and Gmail label operations.
 * Uses the same OAuth credentials (GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN).
 */
import { google, drive_v3, sheets_v4 } from "googleapis";

// ─── Auth Helper ──────────────────────────────────────────────────────────────

/**
 * Unified auth helper. Since Gmail and Drive now use the same OAuth project,
 * we try GMAIL_CLIENT_ID first (always set), then fall back to GOOGLE_DRIVE_CLIENT_ID.
 * For the refresh token, we prefer GOOGLE_DRIVE_REFRESH_TOKEN for Drive/Sheets operations
 * and GMAIL_REFRESH_TOKEN for Gmail operations. Since they are the same token now,
 * either will work.
 */
function getUnifiedAuth() {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth credentials not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN (or GOOGLE_DRIVE_* equivalents).");
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return auth;
}

function getGoogleAuth() {
  return getUnifiedAuth();
}

function getGmailAuth() {
  return getUnifiedAuth();
}

/**
 * Get a raw access token string for use in fetch-based API calls (e.g., voice gateway).
 */
export async function getGoogleAccessToken(): Promise<string> {
  const auth = getUnifiedAuth();
  const { token } = await auth.getAccessToken();
  if (!token) throw new Error("Failed to get Google access token");
  return token;
}

// ─── Google Drive ─────────────────────────────────────────────────────────────

export async function listDriveFiles(folderId?: string, pageSize = 20): Promise<drive_v3.Schema$File[]> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });
  const targetFolder = folderId || process.env.GOOGLE_DRIVE_PAYROLL_FOLDER_ID;

  const query = targetFolder
    ? `'${targetFolder}' in parents and trashed = false`
    : `trashed = false`;

  const res = await drive.files.list({
    q: query,
    fields: "files(id, name, mimeType, modifiedTime, size, webViewLink)",
    pageSize,
    orderBy: "modifiedTime desc",
  });

  return res.data.files ?? [];
}

export async function getDriveFile(fileId: string): Promise<{ name: string; content: string; mimeType: string }> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  // Get metadata
  const meta = await drive.files.get({ fileId, fields: "name, mimeType" });
  const name = meta.data.name ?? "unknown";
  const mimeType = meta.data.mimeType ?? "application/octet-stream";

  // For Google Docs/Sheets, export as text
  if (mimeType === "application/vnd.google-apps.document") {
    const res = await drive.files.export({ fileId, mimeType: "text/plain" }, { responseType: "text" });
    return { name, content: res.data as string, mimeType: "text/plain" };
  }
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    const res = await drive.files.export({ fileId, mimeType: "text/csv" }, { responseType: "text" });
    return { name, content: res.data as string, mimeType: "text/csv" };
  }

  // For regular files, download content
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
  return { name, content: res.data as string, mimeType };
}

export async function uploadToDrive(
  fileName: string,
  content: string | Buffer,
  mimeType: string,
  folderId?: string
): Promise<{ fileId: string; webViewLink: string }> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });
  const targetFolder = folderId || process.env.GOOGLE_DRIVE_PAYROLL_FOLDER_ID;

  const fileMetadata: drive_v3.Schema$File = {
    name: fileName,
    parents: targetFolder ? [targetFolder] : undefined,
  };

  const media = {
    mimeType,
    body: typeof content === "string"
      ? require("stream").Readable.from([content])
      : require("stream").Readable.from([content]),
  };

  const res = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: "id, webViewLink",
  });

  return {
    fileId: res.data.id ?? "",
    webViewLink: res.data.webViewLink ?? "",
  };
}

export async function saveToDriveAsSheet(
  title: string,
  folderId?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; fileId: string }> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });
  const targetFolder = folderId || process.env.GOOGLE_DRIVE_PAYROLL_FOLDER_ID;

  // Create a Google Sheet
  const sheets = google.sheets({ version: "v4", auth });
  const sheetRes = await sheets.spreadsheets.create({
    requestBody: { properties: { title } },
  });

  const spreadsheetId = sheetRes.data.spreadsheetId!;
  const spreadsheetUrl = sheetRes.data.spreadsheetUrl!;

  // Move to the target folder
  if (targetFolder) {
    await drive.files.update({
      fileId: spreadsheetId,
      addParents: targetFolder,
      fields: "id, parents",
    });
  }

  return { spreadsheetId, spreadsheetUrl, fileId: spreadsheetId };
}

// ─── Google Sheets ────────────────────────────────────────────────────────────

export async function writeToSheet(
  spreadsheetId: string,
  sheetName: string,
  data: (string | number | null)[][],
  startCell = "A1"
): Promise<void> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${startCell}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: data },
  });
}

export async function readSheet(
  spreadsheetId: string,
  range: string
): Promise<(string | number)[][]> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return (res.data.values ?? []) as (string | number)[][];
}

export async function createExpenseSheet(
  title: string,
  expenses: Array<{
    date: string;
    vendor: string;
    category: string;
    amount: number;
    department?: string;
    notes?: string;
  }>,
  folderId?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const { spreadsheetId, spreadsheetUrl } = await saveToDriveAsSheet(title, folderId);

  // Write header row
  const headers = ["Date", "Vendor", "Category", "Amount (£)", "Department", "Notes"];
  const rows = expenses.map(e => [
    e.date,
    e.vendor,
    e.category,
    e.amount,
    e.department ?? "",
    e.notes ?? "",
  ]);

  // Add total row
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  rows.push(["", "", "TOTAL", total, "", ""]);

  await writeToSheet(spreadsheetId, "Sheet1", [headers, ...rows]);

  return { spreadsheetId, spreadsheetUrl };
}

export async function createMonthlyBreakdownSheet(
  title: string,
  income: Array<{ date: string; source: string; category: string; amount: number; reference?: string }>,
  expenses: Array<{ date: string; vendor: string; category: string; amount: number; department?: string }>,
  folderId?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const auth = getGoogleAuth();
  const { spreadsheetId, spreadsheetUrl } = await saveToDriveAsSheet(title, folderId);
  const sheets = google.sheets({ version: "v4", auth });

  // Rename Sheet1 to "Income" and add "Expenses" and "Summary" sheets
  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet1Id = sheetMeta.data.sheets?.[0]?.properties?.sheetId ?? 0;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { updateSheetProperties: { properties: { sheetId: sheet1Id, title: "Income" }, fields: "title" } },
        { addSheet: { properties: { title: "Expenses" } } },
        { addSheet: { properties: { title: "Summary" } } },
      ],
    },
  });

  // Write Income sheet
  const incomeHeaders = ["Date", "Source", "Category", "Amount (£)", "Reference"];
  const incomeRows = income.map(i => [i.date, i.source, i.category, i.amount, i.reference ?? ""]);
  const incomeTotal = income.reduce((sum, i) => sum + i.amount, 0);
  incomeRows.push(["", "", "TOTAL INCOME", incomeTotal, ""]);
  await writeToSheet(spreadsheetId, "Income", [incomeHeaders, ...incomeRows]);

  // Write Expenses sheet
  const expenseHeaders = ["Date", "Vendor", "Category", "Amount (£)", "Department"];
  const expenseRows = expenses.map(e => [e.date, e.vendor, e.category, e.amount, e.department ?? ""]);
  const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  expenseRows.push(["", "", "TOTAL EXPENSES", expenseTotal, ""]);
  await writeToSheet(spreadsheetId, "Expenses", [expenseHeaders, ...expenseRows]);

  // Write Summary sheet
  const summaryData = [
    ["Monthly Income & Expense Summary"],
    [""],
    ["Total Income", incomeTotal],
    ["Total Expenses", expenseTotal],
    ["Net Position", incomeTotal - expenseTotal],
    [""],
    ["Income by Category"],
    ...Object.entries(
      income.reduce((acc, i) => { acc[i.category] = (acc[i.category] || 0) + i.amount; return acc; }, {} as Record<string, number>)
    ).map(([cat, amt]) => [cat, amt]),
    [""],
    ["Expenses by Category"],
    ...Object.entries(
      expenses.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + e.amount; return acc; }, {} as Record<string, number>)
    ).map(([cat, amt]) => [cat, amt]),
  ];
  await writeToSheet(spreadsheetId, "Summary", summaryData as any);

  return { spreadsheetId, spreadsheetUrl };
}

// ─── Gmail Labels ─────────────────────────────────────────────────────────────

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
  messagesTotal?: number;
  messagesUnread?: number;
}

export async function listGmailLabels(includeDetails = false): Promise<GmailLabel[]> {
  const auth = getGmailAuth();
  const gmail = google.gmail({ version: "v1", auth });

  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels ?? [];

  // Filter out internal system labels
  const filtered = labels.filter(l => {
    if (l.type === "system" && !["INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "STARRED", "IMPORTANT"].includes(l.id!)) {
      return false;
    }
    return true;
  });

  if (!includeDetails) {
    // Fast path: return basic label info without individual API calls
    return filtered.map(l => ({
      id: l.id!,
      name: l.name!,
      type: l.type ?? "user",
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  // Slow path: fetch details for each label (message counts)
  const detailed: GmailLabel[] = [];
  for (const label of filtered) {
    try {
      const detail = await gmail.users.labels.get({ userId: "me", id: label.id! });
      detailed.push({
        id: detail.data.id!,
        name: detail.data.name!,
        type: detail.data.type ?? "user",
        messagesTotal: detail.data.messagesTotal ?? 0,
        messagesUnread: detail.data.messagesUnread ?? 0,
      });
    } catch {
      detailed.push({
        id: label.id!,
        name: label.name!,
        type: label.type ?? "user",
      });
    }
  }

  return detailed.sort((a, b) => a.name.localeCompare(b.name));
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  fromName?: string;
  to?: string;
  subject: string;
  date: Date;
  body: string;
  snippet: string;
  labelIds: string[];
  labelNames?: string[];
}

export async function fetchEmailsByLabel(
  labelId: string,
  maxResults = 20
): Promise<GmailMessage[]> {
  const auth = getGmailAuth();
  const gmail = google.gmail({ version: "v1", auth });

  const listRes = await gmail.users.messages.list({
    userId: "me",
    labelIds: [labelId],
    maxResults,
  });

  const messages: GmailMessage[] = [];
  for (const msg of listRes.data.messages ?? []) {
    try {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "full",
      });

      const headers = detail.data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

      const fromRaw = getHeader("From");
      const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/);
      const fromName = fromMatch?.[1]?.trim().replace(/"/g, "") || undefined;
      const fromEmail = fromMatch?.[2]?.trim() || fromRaw;

      const subject = getHeader("Subject") || "(No subject)";
      const dateStr = getHeader("Date");
      const date = dateStr ? new Date(dateStr) : new Date();

      // Extract body
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
      bodyText = extractBody(detail.data.payload);

      messages.push({
        id: msg.id!,
        threadId: msg.threadId!,
        from: fromEmail,
        fromName,
        to: getHeader("To"),
        subject,
        date,
        body: bodyText,
        snippet: detail.data.snippet ?? bodyText.slice(0, 200),
        labelIds: detail.data.labelIds ?? [],
      });
    } catch {
      // Skip messages that fail to fetch
    }
  }

  return messages;
}

export async function fetchRecentEmails(maxResults = 10, query?: string): Promise<GmailMessage[]> {
  const auth = getGmailAuth();
  const gmail = google.gmail({ version: "v1", auth });

  const listRes = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    q: query || "in:inbox",
  });

  const messages: GmailMessage[] = [];
  for (const msg of listRes.data.messages ?? []) {
    try {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "full",
      });

      const headers = detail.data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

      const fromRaw = getHeader("From");
      const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/);
      const fromName = fromMatch?.[1]?.trim().replace(/"/g, "") || undefined;
      const fromEmail = fromMatch?.[2]?.trim() || fromRaw;

      const subject = getHeader("Subject") || "(No subject)";
      const dateStr = getHeader("Date");
      const date = dateStr ? new Date(dateStr) : new Date();

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
      bodyText = extractBody(detail.data.payload);

      messages.push({
        id: msg.id!,
        threadId: msg.threadId!,
        from: fromEmail,
        fromName,
        to: getHeader("To"),
        subject,
        date,
        body: bodyText,
        snippet: detail.data.snippet ?? bodyText.slice(0, 200),
        labelIds: detail.data.labelIds ?? [],
      });
    } catch {
      // Skip messages that fail to fetch
    }
  }

  return messages;
}

// ─── Gmail Send ───────────────────────────────────────────────────────────────

export async function sendGmailMessage(
  to: string,
  subject: string,
  body: string,
  fromName = "Abdullah Quilliam Society"
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const auth = getGmailAuth();
  const gmail = google.gmail({ version: "v1", auth });
  const fromEmail = process.env.GMAIL_FROM_EMAIL || "ahamid4@googlemail.com";

  const htmlBody = body.includes("<") ? body : `<p>${body.replace(/\n/g, "</p><p>")}</p>`;

  const rawMessage = [
    `From: "${fromName}" <${fromEmail}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    htmlBody,
  ].join("\r\n");

  const encodedMessage = Buffer.from(rawMessage).toString("base64url");

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage },
    });
    return { success: true, messageId: res.data.id ?? undefined };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendBulkGmail(
  recipients: Array<{ name: string; email: string }>,
  subject: string,
  body: string,
  template?: string
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const auth = getGmailAuth();
  const gmail = google.gmail({ version: "v1", auth });
  const fromEmail = process.env.GMAIL_FROM_EMAIL || "ahamid4@googlemail.com";

  const TEMPLATES: Record<string, { subject: string; bodyTemplate: string }> = {
    friday_comms: {
      subject: `Friday Comms — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
      bodyTemplate: "Bismillah ir-Rahman ir-Rahim\n\nAssalamu Alaikum,\n\n[BODY]\n\nPlease remember us in your Dua.\n\nJazakAllah Khair,\nAbdullah Quilliam Society",
    },
    urgent: {
      subject: `URGENT: ${subject}`,
      bodyTemplate: "URGENT NOTICE:\n\n[BODY]\n\nPlease respond at your earliest convenience.\n\nJazakAllah Khair",
    },
    trustee_update: {
      subject: `Trustee Update — ${subject}`,
      bodyTemplate: "[BODY]\n\nMay Allah bless your continued service to the Ummah.\n\nJazakAllah Khair,\nAbdullah Quilliam Society",
    },
    staff_announcement: {
      subject: `Staff Announcement: ${subject}`,
      bodyTemplate: "[BODY]\n\nIf you have any questions, please speak to your line manager.\n\nJazakAllah Khair,\nManagement Team",
    },
  };

  const tpl = template && TEMPLATES[template] ? TEMPLATES[template] : null;
  const finalSubject = tpl ? tpl.subject : subject;

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const r of recipients) {
    try {
      const personalBody = tpl
        ? tpl.bodyTemplate.replace("[BODY]", body).replace(/\[NAME\]/g, r.name)
        : body;

      const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <p>Dear ${r.name},</p>
        <p>Assalamu Alaikum,</p>
        ${personalBody.includes("<") ? personalBody : `<p>${personalBody.replace(/\n/g, "</p><p>")}</p>`}
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="font-size:12px;color:#888">Sent via Abdullah Quilliam Society</p>
      </div>`;

      const rawMessage = [
        `From: "Abdullah Quilliam Society" <${fromEmail}>`,
        `To: ${r.name} <${r.email}>`,
        `Subject: =?UTF-8?B?${Buffer.from(finalSubject).toString("base64")}?=`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=UTF-8`,
        ``,
        htmlBody,
      ].join("\r\n");

      const encodedMessage = Buffer.from(rawMessage).toString("base64url");
      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodedMessage },
      });
      sent++;
    } catch (err: any) {
      failed++;
      errors.push(`${r.name}: ${err.message}`);
    }
  }

  return { sent, failed, errors };
}
