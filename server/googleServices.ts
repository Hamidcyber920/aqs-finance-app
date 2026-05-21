/**
 * Google Services Helper
 * Unified module for Google Drive, Sheets, and Gmail label operations.
 * Uses the same OAuth credentials (GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN).
 */
import { google, drive_v3, sheets_v4 } from "googleapis";
import { fmtDate, fmtDateLong } from "./dateUtils";

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
      subject: `Friday Comms — ${fmtDateLong(new Date())}`,
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


// ─── Google Calendar Integration ─────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
}

export async function fetchCalendarEvents(
  daysAhead = 1,
  calendarId = "primary"
): Promise<CalendarEvent[]> {
  const auth = getGmailAuth(); // Same OAuth credentials cover calendar scope
  const calendar = google.calendar({ version: "v3", auth });
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + daysAhead * 86400000).toISOString();
  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });
  return (res.data.items ?? []).map(ev => ({
    id: ev.id ?? "",
    summary: ev.summary ?? "(No title)",
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    start: new Date(ev.start?.dateTime ?? ev.start?.date ?? now.toISOString()),
    end: new Date(ev.end?.dateTime ?? ev.end?.date ?? now.toISOString()),
    allDay: !!ev.start?.date && !ev.start?.dateTime,
  }));
}

export async function fetchUpcomingWithin(hours: number): Promise<CalendarEvent[]> {
  const auth = getGmailAuth();
  const calendar = google.calendar({ version: "v3", auth });
  const now = new Date();
  const timeMax = new Date(now.getTime() + hours * 3600000).toISOString();
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 20,
  });
  return (res.data.items ?? []).map(ev => ({
    id: ev.id ?? "",
    summary: ev.summary ?? "(No title)",
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    start: new Date(ev.start?.dateTime ?? ev.start?.date ?? now.toISOString()),
    end: fmtDate(new Date(ev.end?.dateTime ?? ev.end?.date ?? now.toISOString())),
    allDay: !!ev.start?.date && !ev.start?.dateTime,
  }));
}

// ─── Email-to-CommsHub Pipeline ──────────────────────────────────────────────

export interface EmailSummaryResult {
  messageId: number;
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  urgency: "low" | "normal" | "high" | "urgent";
  sectionSlug: string;
}

/**
 * Fetches emails from a Gmail label, pushes them into the Comms Hub,
 * summarises each with AI, and extracts action items.
 */
export async function fetchAndPushToCommsHub(
  labelId: string,
  labelName: string,
  maxResults = 10,
  userId = 1
): Promise<EmailSummaryResult[]> {
  const { getDb } = await import("./db");
  const { invokeLLM } = await import("./_core/llm");
  const { sql } = await import("drizzle-orm");
  const db = await getDb();

  // Fetch emails from Gmail
  const emails = await fetchEmailsByLabel(labelId, maxResults);
  if (!emails.length) return [];

  const results: EmailSummaryResult[] = [];

  for (const email of emails) {
    // Check if already in comms_messages (by gmailMessageId)
    const existing = await db!.execute(
      sql`SELECT id FROM comms_messages WHERE gmailMessageId = ${email.id} LIMIT 1`
    ) as any;
    if (existing[0]?.[0]?.id) continue; // Already pushed

    // Determine section based on content/sender
    let sectionSlug = "general";
    const fromLower = (email.from ?? "").toLowerCase();
    const fromNameLower = (email.fromName ?? "").toLowerCase();
    const subjectLower = (email.subject ?? "").toLowerCase();
    if (fromNameLower.includes("galib") || fromLower.includes("galib")) sectionSlug = "galib-khan";
    else if (fromLower.includes("hmrc") || subjectLower.includes("hmrc") || subjectLower.includes("gift aid")) sectionSlug = "accountants";
    else if (subjectLower.includes("urgent") || subjectLower.includes("asap")) sectionSlug = "urgent";
    else if (subjectLower.includes("booking") || subjectLower.includes("facilities")) sectionSlug = "facilities";
    else if (subjectLower.includes("accommodation") || subjectLower.includes("student") || subjectLower.includes("tenancy")) sectionSlug = "student-accommodation";

    // Get section ID
    const secRows = await db!.execute(
      sql`SELECT id FROM comms_sections WHERE slug=${sectionSlug} LIMIT 1`
    ) as any;
    let sectionId = secRows[0]?.[0]?.id;
    if (!sectionId) {
      const genRows = await db!.execute(
        sql`SELECT id FROM comms_sections WHERE slug='general' LIMIT 1`
      ) as any;
      sectionId = genRows[0]?.[0]?.id ?? 1;
      sectionSlug = "general";
    }

    // Insert into comms_messages
    const insertResult = await db!.execute(
      sql`INSERT INTO comms_messages
          (sectionId, source, subject, fromName, fromEmail, toNames, body,
           gmailMessageId, gmailThreadId, gmailLabels, status, priority, receivedAt, createdById)
          VALUES
          (${sectionId}, 'gmail_push', ${email.subject}, ${email.fromName ?? null},
           ${email.from ?? null}, ${email.to ?? null}, ${email.body ?? null},
           ${email.id}, ${email.threadId ?? null}, ${labelName},
           'unread', 'normal', ${email.date}, ${userId})`
    ) as any;
    const messageId = insertResult[0]?.insertId;
    if (!messageId) continue;

    // AI Summarise and extract actions
    try {
      const content = [
        `Subject: ${email.subject}`,
        `From: ${email.fromName ?? ""} <${email.from ?? ""}>`,
        `Received: ${email.date}`,
        `Body:\n${(email.body ?? "").slice(0, 3000)}`,
      ].join("\n");

      const aiResp = await invokeLLM({
        messages: [
          { role: "system", content: "You are an executive assistant for a mosque charity (Abdullah Quilliam Society). Summarise emails concisely for the chair and trustees. Return JSON with keys: summary (2-3 sentences), keyPoints (array of strings, max 5), actionItems (array of strings, max 5), urgency (low|normal|high|urgent)." },
          { role: "user", content: `Please summarise this email:\n\n${content}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "email_summary",
            strict: true,
            schema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                keyPoints: { type: "array", items: { type: "string" } },
                actionItems: { type: "array", items: { type: "string" } },
                urgency: { type: "string", enum: ["low", "normal", "high", "urgent"] },
              },
              required: ["summary", "keyPoints", "actionItems", "urgency"],
              additionalProperties: false,
            },
          },
        },
      });

      const parsed = JSON.parse(aiResp.choices[0].message.content as string);

      // Update the message with AI summary and set priority
      const priorityMap: Record<string, string> = { low: "low", normal: "normal", high: "high", urgent: "urgent" };
      await db!.execute(
        sql`UPDATE comms_messages
            SET aiSummary=${parsed.summary},
                aiKeyPoints=${JSON.stringify(parsed.keyPoints)},
                aiActionItems=${JSON.stringify(parsed.actionItems)},
                aiSummarisedAt=NOW(),
                aiSummarisedById=${userId},
                priority=${priorityMap[parsed.urgency] || "normal"}
            WHERE id=${messageId}`
      );

      results.push({
        messageId,
        summary: parsed.summary,
        keyPoints: parsed.keyPoints,
        actionItems: parsed.actionItems,
        urgency: parsed.urgency,
        sectionSlug,
      });
    } catch (err) {
      results.push({
        messageId,
        summary: "(Summarisation pending)",
        keyPoints: [],
        actionItems: [],
        urgency: "normal",
        sectionSlug,
      });
    }
  }

  return results;
}

// ─── Daily Briefing Data Collector ───────────────────────────────────────────

export interface DailyBriefingData {
  calendarToday: CalendarEvent[];
  upcomingWithin2Hours: CalendarEvent[];
  urgentEmails: Array<{ id: number; subject: string; from: string; summary: string; receivedAt: string }>;
  unreadCount: number;
}

export async function collectDailyBriefingData(): Promise<DailyBriefingData> {
  const { sql } = await import("drizzle-orm");
  const { getDb } = await import("./db");
  const db = await getDb();

  // Fetch calendar events for today
  let calendarToday: CalendarEvent[] = [];
  let upcomingWithin2Hours: CalendarEvent[] = [];
  try {
    calendarToday = await fetchCalendarEvents(1);
    upcomingWithin2Hours = await fetchUpcomingWithin(2);
  } catch (err) {
    console.error("[DailyBriefing] Calendar fetch failed:", err);
  }

  // Fetch urgent unread emails from comms_messages
  let urgentEmails: Array<{ id: number; subject: string; from: string; summary: string; receivedAt: string }> = [];
  try {
    const rows = await db!.execute(
      sql`SELECT id, subject, fromName, fromEmail, aiSummary, receivedAt
          FROM comms_messages
          WHERE status IN ('unread', 'flagged')
            AND priority IN ('urgent', 'high')
          ORDER BY receivedAt DESC
          LIMIT 10`
    ) as any;
    urgentEmails = (rows[0] ?? []).map((r: any) => ({
      id: r.id,
      subject: r.subject,
      from: r.fromName || r.fromEmail || "Unknown",
      summary: r.aiSummary || "(No summary yet)",
      receivedAt: r.receivedAt ? fmtDate(new Date(r.receivedAt)) : "Unknown",
    }));
  } catch (err) {
    console.error("[DailyBriefing] Urgent emails fetch failed:", err);
  }

  // Count total unread
  let unreadCount = 0;
  try {
    const countRows = await db!.execute(
      sql`SELECT COUNT(*) as cnt FROM comms_messages WHERE status = 'unread'`
    ) as any;
    unreadCount = Number(countRows[0]?.[0]?.cnt ?? 0);
  } catch { /* skip */ }

  return { calendarToday, upcomingWithin2Hours, urgentEmails, unreadCount };
}

// ─── Google Drive Document Round-Trip ────────────────────────────────────────

/**
 * Update an existing file in Google Drive (re-upload with new content).
 * Used for editing documents and saving them back.
 */
export async function updateDriveFile(
  fileId: string,
  content: string | Buffer,
  mimeType?: string
): Promise<{ fileId: string; webViewLink: string }> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  const media = {
    mimeType: mimeType || "text/plain",
    body: typeof content === "string"
      ? require("stream").Readable.from([content])
      : require("stream").Readable.from([content]),
  };

  const res = await drive.files.update({
    fileId,
    media,
    fields: "id, webViewLink",
  });

  return {
    fileId: res.data.id ?? fileId,
    webViewLink: res.data.webViewLink ?? "",
  };
}
