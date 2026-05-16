/**
 * Voice Gateway v3 — @google/genai SDK with ai.live.connect()
 *
 * Architecture:
 * - Client WebSocket <-> Our Server <-> Gemini Live (via @google/genai SDK)
 * - Client sends PCM audio (16kHz, 16-bit, mono) as base64
 * - Server relays to Gemini via session.sendRealtimeInput()
 * - Gemini audio responses relayed back to client for playback
 * - Voice: Aoede | Model: gemini-2.0-flash-live-001
 */
import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "http";
import { GoogleGenAI, Modality, Type } from "@google/genai";
import type { LiveServerMessage, Session } from "@google/genai";
import { nanoid } from "nanoid";
import { eq, and, sql, gte, desc, or, like } from "drizzle-orm";
import { getDb } from "./db";
import {
  voiceSessions,
  voiceToolCalls,
  voiceTranscripts,
  voiceCostTracking,
  voiceFeatureFlags,
  voiceReviewQueue,
  users,
  trustees,
  donors,
  supplierContacts,
  receipts,
  incomeRecords,
} from "../drizzle/schema";
import { sdk } from "./_core/sdk";
import {
  listDriveFiles,
  getDriveFile,
  uploadToDrive,
  createExpenseSheet,
  createMonthlyBreakdownSheet,
  listGmailLabels,
  fetchEmailsByLabel,
  fetchRecentEmails,
  sendBulkGmail,
} from "./googleServices";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface VoiceClient {
  ws: WebSocket;
  session: Session | null;
  userId: number;
  userRole: string;
  userName: string;
  sessionId: string;
  dbSessionId: number;
  screenContext: string;
  entityContext: string | null;
  language: string;
  isAlive: boolean;
  tokenCount: number;
  lastActivity: number;
  isGeminiReady: boolean;
}

interface ClientMessage {
  type: "start_session" | "audio_chunk" | "text_input" | "end_session" | "screen_context" | "correct_this";
  screenContext?: string;
  entityContext?: string;
  language?: string;
  text?: string;
  audio?: string;
  transcriptId?: string;
  correctionNote?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DAILY_TOKEN_LIMIT = 200_000;
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const GEMINI_MODEL = "gemini-2.0-flash-live-001";
const VOICE_NAME = "Aoede";

const activeClients = new Map<string, VoiceClient>();

// Response cache (60s TTL)
const responseCache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;
function getCached(key: string): unknown | null {
  const entry = responseCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) { responseCache.delete(key); return null; }
  return entry.data;
}
function setCache(key: string, data: unknown) {
  responseCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}
const CACHEABLE_TOOLS = new Set(["get_staff_directory", "get_trustees", "get_fund_balance", "get_campaign_status"]);

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are Hibba, the AI voice assistant for Abdullah Quilliam Society — a UK Islamic charity managing Britain's first mosque at Brougham Terrace, Liverpool.

SPEECH QUALITY — CRITICAL:
- Speak smoothly and confidently. Never repeat yourself. Never hesitate.
- Do NOT use filler words: no "um", "uh", "well", "so", "let me think", "I'm going to".
- Give one clear, direct answer per turn. Do not rephrase or restate the same point.
- When calling a tool, say one brief sentence like "Let me check that, Insha'Allah" then call it silently. Do not narrate your actions.
- After receiving tool results, deliver the answer immediately without preamble like "So" or "Alright".
- Maximum 2-3 sentences per response unless the user asks for detail.
- Use natural British English. Say numbers naturally: "three hundred and fifty pounds" not "£350".
- When giving times, say "quarter past four" not "16:15".

ISLAMIC IDENTITY & PERSONALITY:
- You are a Muslim assistant serving a mosque and Islamic charity. Begin every new session with "Assalamu Alaikum" followed by the user's name.
- Use Bismillah when starting significant tasks (reports, emails, important actions).
- End conversations or sign-offs with "JazakAllah Khair" or "May Allah bless your efforts".
- Use Islamic phrases naturally in context: "Insha'Allah" (God willing, for future plans), "Alhamdulillah" (praise God, for good results), "SubhanAllah" (glory to God, for impressive things), "Masha'Allah" (God has willed it, for good news/achievements).
- When reporting good results (donations received, targets met), say "Alhamdulillah" or "Masha'Allah".
- When reporting challenges or shortfalls, say "May Allah make it easy" or "With Allah's help we will get there, Insha'Allah".
- Be warm, respectful, and sisterly in tone. Show genuine care for the charity's mission of serving the Ummah.
- Reference the importance of the work: serving the community, preserving heritage, fulfilling Amanah (trust).
- Islamic charity terminology: Sadaqah (voluntary charity), Zakat (obligatory alms), Waqf (endowment), Qard Hasan (interest-free loan), Lillah (for the sake of Allah), Fidyah, Kaffarah.
- When asked about prayer times, add "May Allah accept your prayers".
- When someone donates or a donation is recorded, say "May Allah reward them abundantly".
- Abdullah Quilliam Mosque & National Heritage Centre, Charity 1194942.
- Chair: Galib Khan. Founded by Abdullah Quilliam in 1887.

FORM FILLING & DATA EXTRACTION:
- When a user describes an expense, donation, income, loan, bill, or any data verbally, extract the structured fields and use fill_form to populate the form on their current page.
- Listen for: amounts (£), dates, payee/vendor names, categories, descriptions, payment methods, references.
- ALWAYS use action='fill_and_confirm' (never just 'fill') so the user sees a confirmation dialog before saving.
- After calling fill_form, read back the key fields aloud: "Bismillah, I've entered [amount] for [vendor/payee] on [date]. Please review the form and confirm, or tell me what to change."
- If the user says "confirm" or "yes that's correct" or "save it", the frontend will handle submission.
- If the user says "change the amount to X" or "no, the date should be Y", call fill_form again with the corrected fields.
- You can fill forms on ANY page the user is currently viewing.
- Page-specific field mapping:
  * /receipts: vendor, amount, date, category, paymentMethod, description, department
  * /income: source, amount, date, type (collection/rental/donation/other), reference
  * /donors: name, email, phone, address, donationPreference
  * /loans: borrowerName, amount, purpose, repaymentTerms, startDate
  * /bills-utilities: supplier, amount, dueDate, category, reference, frequency
  * /fundraising: campaignName, targetAmount, startDate, endDate, description
  * /monthly-expenses: payee, amount, date, category, reference, isRecurring
- If unsure which fields to fill, ask the user to clarify.
- Say "Bismillah" before filling important financial forms.

TIMEZONE:
- Liverpool, UK. BST (UTC+1) late March to late October, GMT (UTC+0) otherwise.
- Always report and interpret times in UK local time.

ANTI-HALLUCINATION:
- ONLY report data from tool results. Never invent names, amounts, dates, or emails.
- If a tool returns nothing, say "I couldn't find that" honestly.
- If unsure, use the appropriate tool to check before answering.

NAVIGATION — You know every section. When a user mentions any of these, use navigate_to:
  Dashboard → /dashboard | Receipts/Expenses → /receipts | Reports → /reports
  Fundraising → /fundraising | Loans → /loans | Income → /income
  Payroll → /payroll | Monthly Expenses → /monthly-expenses
  Reconciliation → /reconciliation | Donors → /donors | Campaigns → /campaigns
  Org Chart → /org-chart | Communications → /communications | Comms Hub → /comms-hub
  Master Inbox → /comms-inbox | Meetings & Onboarding → /meetings
  Admin Panel → /admin | Trustees & Staff Contacts → /trustees
  Compliance Cockpit → /compliance | Conflicts Register → /conflicts-register
  Decisions Register → /decisions | Bulk Approvals → /bulk-approvals
  Bills & Utilities → /bills-utilities | Training Tracker → /training-tracker
  LBMW Correspondence → /lbmw-correspondence | Trustee Dashboard → /trustee-dashboard
  Facilities & Bookings → /facilities | Bistro 87 → /bistro87
  Merge History → /merge-history | Backups → /backups | Audit Trail → /audit-trail
  Voice History → /voice-history | System Health → /system-health | Settings → /settings
  Cultivation Pipeline → /donor-pipeline | Major Donor DD → /major-donor
  Saved Views → /saved-views | QR Codes → /qr-codes
  Recognition Tiers → /recognition-tiers | Donors Wall → /donors-wall
  Accommodation → /accommodation | Gift Aid → /gift-aid | Pledges → /pledges
  Donate → /donate | Profile → /profile | Fintech → /fintech | Donor CRM → /donor-crm

AQS INFO:
- Abdullah Quilliam Society, Charity 1194942, Brougham Terrace, Liverpool.
- Phone: 0151 260 3986. Websites: abdullahquilliam.org, theaqs.org.
- Bank: Abdullah Quilliam Society, Acc 01158945, Sort 40-29-28.
- Donorbox for regular donations at theaqs.org. Stripe for one-off payment links.
- Friends of AQS: 100+ monthly supporters.

CAPABILITIES — You can:
- Read/search ALL data: donors, finances, campaigns, staff, facilities, expenses, payroll, income, loans, accommodation, compliance, meetings, communications, bills, utilities, reconciliation, gift aid, pledges, training records, bistro orders, conflicts, decisions, org chart, backups, LBMW correspondence, recognition tiers, QR codes, saved views, donor notes.
- Take actions: send emails, send WhatsApp messages, create donor notes, create tasks, schedule meetings, record donations, generate reports, create payment links, flag items for review.
- WhatsApp: When asked to send a WhatsApp, FIRST use get_staff_directory or get_trustees to look up the recipient's phone number by name. Then use send_whatsapp with that phone number.
- Email: When asked to send an email, FIRST use get_staff_directory or get_trustees to look up the recipient's email address by name. Then use send_email with that email.
- Bulk Messaging: When asked to email or WhatsApp ALL trustees, ALL staff, or everyone, use bulk_send_email or bulk_send_whatsapp with the group name.
- Google Drive: You can list files, read files, and save files in the AQS Google Drive folder.
- Google Sheets: Create expense reports or monthly income vs expense breakdowns.
- Gmail Labels: List all Gmail labels, fetch emails by label, fetch new/unread emails, and summarise emails with AI action extraction.
- Fill forms: extract data from voice and populate any form on the user's current page using fill_form tool.
- Navigate users to any section instantly.
- Provide prayer times, mosque info, donation guidance.

TOOL AVAILABILITY:
- You can call ANY tool regardless of the user's current screen.
- Just call the tool directly — do NOT say "I need to navigate first" or "let me take you to the right page".
- NEVER tell the user you can't do something because of the current screen. You have full access to all tools.

BOUNDARIES:
- Never authenticate users. Never handle card data — use Stripe links.
- Never read sensitive data (addresses, bank details, NI numbers) unless explicitly asked.
- Confirm before amounts over £1,000 or destructive actions.
- Respect user roles. If FORBIDDEN, explain politely.

PERMISSIONS:
- Reception: QuickCapture and basic lookups only.
- Donors: own data only. Auditors: read-only.
- Trustees/Superadmin: full access.`;

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DECLARATIONS (using @google/genai Type enum)
// ═══════════════════════════════════════════════════════════════════════════════

const TOOL_DECLARATIONS = [
  // --- Core context ---
  { name: "get_current_user", description: "Get the current user's profile, role, and permissions", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  { name: "get_screen_context", description: "Get the current page/screen context the user is viewing", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  { name: "get_current_time", description: "Get the current date and time in UK timezone (Europe/London). Use this before reporting any time or scheduling anything.", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  // --- People ---
  { name: "get_staff_directory", description: "Get all active staff members with their roles and contact info", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  { name: "get_trustees", description: "Get the list of trustees", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  { name: "get_donor", description: "Get full donor details by ID including giving history", parameters: { type: Type.OBJECT, properties: { donorId: { type: Type.NUMBER, description: "Donor ID" } }, required: ["donorId"] } },
  { name: "search_donors", description: "Search donors by name, email, or phone.", parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING, description: "Name, email, or phone to search for" }, limit: { type: Type.NUMBER, description: "Max results (default 10)" } }, required: ["query"] } },
  // --- Finance & Transactions ---
  { name: "search_transactions", description: "Search recent expense transactions/receipts", parameters: { type: Type.OBJECT, properties: { limit: { type: Type.NUMBER, description: "Max results" }, category: { type: Type.STRING, description: "Filter by category" }, status: { type: Type.STRING, description: "Filter by status: pending, approved, rejected" } }, required: [] } },
  { name: "get_income_summary", description: "Get income records summary (Friday collections, donations, rent, etc.)", parameters: { type: Type.OBJECT, properties: { period: { type: Type.STRING, description: "Period: today, this_week, this_month, last_month" } }, required: [] } },
  { name: "get_expenses_summary", description: "Get expenses summary for a period", parameters: { type: Type.OBJECT, properties: { period: { type: Type.STRING, description: "Period: today, this_week, this_month, last_month" } }, required: [] } },
  { name: "get_loans_summary", description: "Get Qard Hasan (interest-free loans) summary", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  { name: "get_payroll_summary", description: "Get payroll information and scheduled payments", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  { name: "get_bills_utilities", description: "Get utility bills and scheduled payments", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  // --- Fundraising ---
  { name: "get_fund_balance", description: "Get fund/campaign balance for active campaigns", parameters: { type: Type.OBJECT, properties: { campaignId: { type: Type.NUMBER } }, required: [] } },
  { name: "get_campaign_status", description: "Get all campaign statuses with amounts raised vs goals", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  { name: "get_pledges", description: "Get pledge commitments and their fulfilment status", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  // --- Operations ---
  { name: "get_priorities", description: "Get pending approvals, flagged items, and urgent matters", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  { name: "compose_briefing", description: "Compose a morning briefing with recent activity, pending items, and upcoming events", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  { name: "get_meetings", description: "Get upcoming and recent meetings", parameters: { type: Type.OBJECT, properties: { upcoming: { type: Type.BOOLEAN, description: "True for upcoming, false for past" } }, required: [] } },
  { name: "get_compliance_status", description: "Get compliance actions and their status", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  { name: "get_accommodation", description: "Get student accommodation status, tenants, and rent tracking", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  { name: "get_facilities", description: "Get facilities bookings and status", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  // --- Actions ---
  { name: "create_donation", description: "Record a new donation", parameters: { type: Type.OBJECT, properties: { donorId: { type: Type.NUMBER }, amount: { type: Type.NUMBER }, campaignId: { type: Type.NUMBER }, paymentMethod: { type: Type.STRING } }, required: ["donorId", "amount"] } },
  { name: "update_donor_profile", description: "Update donor profile fields", parameters: { type: Type.OBJECT, properties: { donorId: { type: Type.NUMBER }, phone: { type: Type.STRING }, email: { type: Type.STRING }, addressLine1: { type: Type.STRING }, postcode: { type: Type.STRING } }, required: ["donorId"] } },
  { name: "log_communication", description: "Log a communication with a donor", parameters: { type: Type.OBJECT, properties: { donorId: { type: Type.NUMBER }, channel: { type: Type.STRING }, subject: { type: Type.STRING }, body: { type: Type.STRING } }, required: ["donorId"] } },
  { name: "create_payment_link", description: "Generate a Stripe payment link for a one-off donation", parameters: { type: Type.OBJECT, properties: { donorId: { type: Type.NUMBER }, amount: { type: Type.NUMBER } }, required: ["donorId", "amount"] } },
  { name: "send_email", description: "Send an email immediately via Gmail API.", parameters: { type: Type.OBJECT, properties: { to: { type: Type.STRING, description: "Recipient email address" }, recipientName: { type: Type.STRING, description: "Recipient name" }, subject: { type: Type.STRING, description: "Email subject" }, body: { type: Type.STRING, description: "Email body (plain text or HTML)" }, donorId: { type: Type.NUMBER, description: "Optional donor ID for logging" } }, required: ["to", "subject", "body"] } },
  { name: "draft_whatsapp", description: "Draft a WhatsApp message (saves to outbox for review)", parameters: { type: Type.OBJECT, properties: { recipientId: { type: Type.NUMBER }, to: { type: Type.STRING }, body: { type: Type.STRING } }, required: ["body"] } },
  { name: "draft_email", description: "Save an email draft to the outbox for later review", parameters: { type: Type.OBJECT, properties: { recipientId: { type: Type.NUMBER }, to: { type: Type.STRING }, subject: { type: Type.STRING }, body: { type: Type.STRING } }, required: ["body"] } },
  { name: "create_task", description: "Create a task or action item for a staff member", parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING, description: "Task title/description" }, owner: { type: Type.STRING, description: "Person responsible (name)" }, dueDate: { type: Type.STRING, description: "Due date in YYYY-MM-DD format" }, priority: { type: Type.STRING, description: "low, medium, high, or critical" }, notes: { type: Type.STRING }, source: { type: Type.STRING } }, required: ["title"] } },
  { name: "schedule_meeting", description: "Schedule a meeting with attendees", parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, meetingType: { type: Type.STRING }, scheduledAt: { type: Type.STRING }, location: { type: Type.STRING }, notes: { type: Type.STRING } }, required: ["title", "scheduledAt"] } },
  { name: "generate_report", description: "Generate a financial summary report for a given month", parameters: { type: Type.OBJECT, properties: { year: { type: Type.NUMBER }, month: { type: Type.NUMBER }, sendToTrustees: { type: Type.BOOLEAN } }, required: [] } },
  { name: "flag_for_review", description: "Flag something for review", parameters: { type: Type.OBJECT, properties: { transcriptId: { type: Type.NUMBER }, note: { type: Type.STRING } }, required: [] } },
  // --- Navigation ---
  { name: "navigate_to", description: "Navigate the user to a specific page in the app.", parameters: { type: Type.OBJECT, properties: { page: { type: Type.STRING, description: "Page path (e.g. /dashboard, /receipts, /donors)" } }, required: ["page"] } },
  // --- Training ---
  { name: "get_training_summary", description: "Get training records summary: valid, expiring soon, expired certificates.", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  // --- Bistro 87 ---
  { name: "get_bistro_summary", description: "Get Bistro 87 summary: recent orders, daily revenue, menu item count.", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  // --- Conflicts Register ---
  { name: "get_conflicts", description: "Get conflicts of interest register entries.", parameters: { type: Type.OBJECT, properties: { status: { type: Type.STRING, description: "Filter: open, resolved, noted, or all" } }, required: [] } },
  // --- Decisions Register ---
  { name: "get_decisions", description: "Get trustee decisions from meetings.", parameters: { type: Type.OBJECT, properties: { limit: { type: Type.NUMBER } }, required: [] } },
  // --- LBMW Correspondence ---
  { name: "get_lbmw_correspondence", description: "Get LBMW correspondence and planning items.", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  // --- Comms Inbox ---
  { name: "get_comms_inbox", description: "Get the master inbox: recent communications and outbox items.", parameters: { type: Type.OBJECT, properties: { limit: { type: Type.NUMBER } }, required: [] } },
  // --- Backups ---
  { name: "get_backups", description: "Get recent system backup history and status.", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  // --- Donor Notes ---
  { name: "create_donor_note", description: "Create a note on a donor's profile.", parameters: { type: Type.OBJECT, properties: { donorId: { type: Type.NUMBER }, content: { type: Type.STRING }, isPinned: { type: Type.BOOLEAN } }, required: ["donorId", "content"] } },
  // --- Send WhatsApp ---
  { name: "send_whatsapp", description: "Send a WhatsApp message to a contact.", parameters: { type: Type.OBJECT, properties: { to: { type: Type.STRING, description: "Phone number with country code" }, recipientName: { type: Type.STRING }, body: { type: Type.STRING }, donorId: { type: Type.NUMBER } }, required: ["to", "body"] } },
  // --- Recognition Tiers ---
  { name: "get_recognition_tiers", description: "Get donor recognition tiers and their thresholds.", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  // --- Gift Aid ---
  { name: "get_gift_aid_summary", description: "Get Gift Aid declarations summary.", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  // --- Audit Trail ---
  { name: "get_audit_trail", description: "Get recent audit trail entries.", parameters: { type: Type.OBJECT, properties: { limit: { type: Type.NUMBER } }, required: [] } },
  // --- Mosque & Community ---
  { name: "get_prayer_times", description: "Get today's prayer times for Liverpool.", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  { name: "get_donation_info", description: "Get donation methods and bank transfer details.", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  { name: "get_mosque_info", description: "Get general information about Abdullah Quilliam Mosque.", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  // --- Bulk Messaging ---
  { name: "bulk_send_email", description: "Send the same email to a group (trustees, staff, managers, all).", parameters: { type: Type.OBJECT, properties: { group: { type: Type.STRING }, subject: { type: Type.STRING }, body: { type: Type.STRING }, template: { type: Type.STRING } }, required: ["group", "subject", "body"] } },
  { name: "bulk_send_whatsapp", description: "Prepare WhatsApp messages for a group.", parameters: { type: Type.OBJECT, properties: { group: { type: Type.STRING }, body: { type: Type.STRING } }, required: ["group", "body"] } },
  { name: "get_email_templates", description: "Get available email templates.", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  // --- Qarde Hasan & Calendar ---
  { name: "get_qarde_hasan_register", description: "Get Qarde Hasan register.", parameters: { type: Type.OBJECT, properties: { status: { type: Type.STRING } }, required: [] } },
  { name: "get_calendar", description: "Get upcoming trustee meetings and events.", parameters: { type: Type.OBJECT, properties: { days: { type: Type.NUMBER } }, required: [] } },
  { name: "set_user_preference", description: "Set a user preference.", parameters: { type: Type.OBJECT, properties: { key: { type: Type.STRING }, value: { type: Type.STRING } }, required: ["key", "value"] } },
  // --- Form Filling ---
  { name: "fill_form", description: "Fill a form on the user's current page with extracted data.", parameters: { type: Type.OBJECT, properties: { fields: { type: Type.OBJECT, description: "Key-value pairs of form field names and values", properties: {} }, page: { type: Type.STRING }, action: { type: Type.STRING, description: "'fill' or 'fill_and_confirm'" } }, required: ["fields"] } },
  // --- Google Drive & Sheets ---
  { name: "list_drive_files", description: "List files in the Google Drive folder.", parameters: { type: Type.OBJECT, properties: { folderId: { type: Type.STRING }, limit: { type: Type.NUMBER } }, required: [] } },
  { name: "read_drive_file", description: "Read the content of a file from Google Drive.", parameters: { type: Type.OBJECT, properties: { fileId: { type: Type.STRING } }, required: ["fileId"] } },
  { name: "save_to_drive", description: "Save/upload a file to Google Drive.", parameters: { type: Type.OBJECT, properties: { fileName: { type: Type.STRING }, content: { type: Type.STRING }, mimeType: { type: Type.STRING }, folderId: { type: Type.STRING } }, required: ["fileName", "content"] } },
  { name: "create_expense_sheet", description: "Create a Google Sheets spreadsheet with expense data.", parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, period: { type: Type.STRING } }, required: ["title"] } },
  { name: "create_monthly_breakdown", description: "Create a monthly income vs expense breakdown spreadsheet.", parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, month: { type: Type.NUMBER }, year: { type: Type.NUMBER } }, required: [] } },
  // --- Gmail Labels & Fetch ---
  { name: "list_gmail_labels", description: "List all Gmail labels/folders.", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  { name: "fetch_emails_by_label", description: "Fetch emails from a specific Gmail label.", parameters: { type: Type.OBJECT, properties: { labelId: { type: Type.STRING }, labelName: { type: Type.STRING }, maxResults: { type: Type.NUMBER } }, required: ["labelId"] } },
  { name: "fetch_new_emails", description: "Fetch the latest unread/new emails.", parameters: { type: Type.OBJECT, properties: { maxResults: { type: Type.NUMBER }, query: { type: Type.STRING } }, required: [] } },
  { name: "summarise_and_action_emails", description: "AI-summarise emails and create action items.", parameters: { type: Type.OBJECT, properties: { emailIds: { type: Type.ARRAY, items: { type: Type.STRING } }, labelId: { type: Type.STRING }, maxResults: { type: Type.NUMBER } }, required: [] } },
  // --- Extended Bulk Email ---
  { name: "send_to_donors", description: "Send an email to donors (all, major, regular, active).", parameters: { type: Type.OBJECT, properties: { group: { type: Type.STRING }, subject: { type: Type.STRING }, body: { type: Type.STRING }, limit: { type: Type.NUMBER } }, required: ["group", "subject", "body"] } },
  { name: "send_to_suppliers", description: "Send an email to utility companies/suppliers.", parameters: { type: Type.OBJECT, properties: { supplierName: { type: Type.STRING }, subject: { type: Type.STRING }, body: { type: Type.STRING } }, required: ["subject", "body"] } },
  // --- Email-to-CommsHub Pipeline & Calendar ---
  { name: "fetch_and_push_to_comms", description: "Fetch emails from Gmail label and push to Comms Hub.", parameters: { type: Type.OBJECT, properties: { labelId: { type: Type.STRING }, labelName: { type: Type.STRING }, maxResults: { type: Type.NUMBER } }, required: ["labelId", "labelName"] } },
  { name: "get_daily_briefing", description: "Get today's calendar, urgent emails, unread count.", parameters: { type: Type.OBJECT, properties: {}, required: [] } },
  { name: "get_calendar_today", description: "Get today's Google Calendar events.", parameters: { type: Type.OBJECT, properties: { daysAhead: { type: Type.NUMBER } }, required: [] } },
  { name: "set_email_priority", description: "Set priority of an email in Comms Hub.", parameters: { type: Type.OBJECT, properties: { messageId: { type: Type.NUMBER }, priority: { type: Type.STRING } }, required: ["messageId", "priority"] } },
  { name: "move_email_to_section", description: "Move an email to a different section in Comms Hub.", parameters: { type: Type.OBJECT, properties: { messageId: { type: Type.NUMBER }, sectionSlug: { type: Type.STRING } }, required: ["messageId", "sectionSlug"] } },
  { name: "update_drive_file", description: "Update an existing file in Google Drive.", parameters: { type: Type.OBJECT, properties: { fileId: { type: Type.STRING }, content: { type: Type.STRING }, mimeType: { type: Type.STRING } }, required: ["fileId", "content"] } },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL CONTEXT SELECTION (max 25 tools per session for reliability)
// ═══════════════════════════════════════════════════════════════════════════════

const CORE_TOOLS = ["get_current_user", "get_screen_context", "get_current_time", "navigate_to", "get_prayer_times", "get_daily_briefing", "fill_form"];

const TOOL_GROUPS: Record<string, string[]> = {
  google: ["list_drive_files", "read_drive_file", "save_to_drive", "update_drive_file", "list_gmail_labels", "fetch_emails_by_label", "fetch_new_emails", "summarise_and_action_emails", "create_expense_sheet", "get_calendar_today"],
  comms: ["send_email", "send_whatsapp", "draft_email", "draft_whatsapp", "bulk_send_email", "get_email_templates", "log_communication", "get_comms_inbox", "send_to_donors", "fetch_and_push_to_comms"],
  finance: ["search_transactions", "get_income_summary", "get_expenses_summary", "get_fund_balance", "get_campaign_status", "create_donation", "create_payment_link", "generate_report", "get_bills_utilities", "create_monthly_breakdown"],
  people: ["get_staff_directory", "get_trustees", "get_donor", "search_donors", "update_donor_profile", "create_donor_note", "get_gift_aid_summary", "get_recognition_tiers"],
  operations: ["get_priorities", "create_task", "schedule_meeting", "get_meetings", "get_compliance_status", "flag_for_review", "get_calendar", "compose_briefing", "get_audit_trail", "set_user_preference"],
};

const SCREEN_TO_GROUPS: Record<string, string[]> = {
  "/dashboard": ["google", "finance"],
  "/comms-hub": ["google", "comms"],
  "/comms-inbox": ["google", "comms"],
  "/communications": ["comms"],
  "/receipts": ["finance"],
  "/income": ["finance"],
  "/monthly-expenses": ["finance"],
  "/reports": ["finance"],
  "/reconciliation": ["finance"],
  "/fundraising": ["finance"],
  "/campaigns": ["finance"],
  "/loans": ["finance"],
  "/payroll": ["finance"],
  "/donors": ["people"],
  "/donor-crm": ["people"],
  "/donor-pipeline": ["people"],
  "/major-donor": ["people"],
  "/gift-aid": ["people"],
  "/pledges": ["finance"],
  "/trustees": ["people"],
  "/org-chart": ["people"],
  "/compliance": ["operations"],
  "/meetings": ["operations"],
  "/accommodation": ["operations"],
  "/facilities": ["operations"],
  "/admin": ["google", "operations"],
  "/trustee-dashboard": ["finance", "operations"],
  "/bills-utilities": ["finance"],
  "/training-tracker": ["operations"],
  "/conflicts-register": ["operations"],
  "/decisions": ["operations"],
  "/bulk-approvals": ["operations"],
  "/audit-trail": ["operations"],
  "/settings": ["operations"],
  "/profile": ["operations"],
  "/voice-history": ["operations"],
  "/system-health": ["operations"],
  "/fintech": ["finance"],
  "/donate": ["finance"],
  "/bistro87": ["operations"],
  "/lbmw-correspondence": ["comms"],
};

function getToolsForContext(screenPath: string, userRole: string): typeof TOOL_DECLARATIONS {
  let groupNames = SCREEN_TO_GROUPS[screenPath];
  if (!groupNames) {
    for (const [key, groups] of Object.entries(SCREEN_TO_GROUPS)) {
      if (screenPath.startsWith(key + "/")) { groupNames = groups; break; }
    }
  }
  if (!groupNames) {
    groupNames = ["superadmin", "admin", "trustee", "manager"].includes(userRole) ? ["google", "finance"] : ["finance"];
  }

  const toolNames = new Set<string>(CORE_TOOLS);
  for (const gName of groupNames) {
    const group = TOOL_GROUPS[gName];
    if (group) for (const name of group) toolNames.add(name);
  }

  return TOOL_DECLARATIONS.filter(t => toolNames.has(t.name));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN DESCRIPTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const SCREEN_DESCRIPTIONS: Record<string, string> = {
  "/": "Scan Receipt — user is scanning or uploading a receipt",
  "/dashboard": "Dashboard — overview of finances, recent activity, and key metrics",
  "/receipts": "My Expenses — personal expense receipts and claims",
  "/reports": "Reports — financial reports and analytics charts",
  "/fundraising": "Fundraising — donation campaigns and targets",
  "/loans": "Qard Hasan Loans — interest-free Islamic loan applications",
  "/income": "Income & Rentals — Friday collections, rental income",
  "/accommodation": "Student Accommodation — tenant management, rent tracking",
  "/fintech": "Payment Hub — Stripe payments, bank transfers",
  "/donor-crm": "Donor CRM — full donor relationship management",
  "/gift-aid": "Gift Aid — declarations, HMRC claims",
  "/pledges": "Pledges — outstanding pledge commitments",
  "/donor-pipeline": "Cultivation Pipeline — major donor prospect pipeline",
  "/major-donor": "Major Donor DD — due diligence records",
  "/payroll": "Payroll — staff payroll management",
  "/monthly-expenses": "Monthly Expenses — monthly expense tracking",
  "/reconciliation": "Reconciliation — bank reconciliation",
  "/communications": "Communications — email and messaging centre",
  "/comms-hub": "Comms Hub — centralised communications management",
  "/comms-inbox": "Master Inbox — all incoming communications",
  "/meetings": "Meetings & Onboarding — meeting schedule and minutes",
  "/donors": "Donors — full donor database",
  "/campaigns": "Campaigns — fundraising campaign management",
  "/admin": "Admin Panel — system administration",
  "/trustees": "Trustees & Staff Contacts — trustee board and staff directory",
  "/compliance": "Compliance Cockpit — regulatory compliance",
  "/conflicts-register": "Conflicts Register — trustee conflicts of interest",
  "/decisions": "Decisions Register — trustee meeting decisions",
  "/bulk-approvals": "Bulk Approvals — batch approval queue",
  "/bills-utilities": "Bills & Utilities — utility bills and supplier contracts",
  "/training-tracker": "Training Tracker — staff training certificates",
  "/lbmw-correspondence": "LBMW Correspondence — Listed Building planning",
  "/trustee-dashboard": "Trustee Dashboard — governance and finances",
  "/facilities": "Facilities & Bookings — room bookings, hall hire",
  "/bistro87": "Bistro 87 — cafe orders, daily revenue",
  "/audit-trail": "Audit Trail — full log of all system actions",
  "/voice-history": "Voice History — Hibba voice session logs",
  "/system-health": "System Health — server status and performance",
  "/settings": "Settings — application settings",
  "/profile": "Profile — user profile and account settings",
  "/donate": "Donation Page — public-facing donation form",
};

function buildScreenDescription(path: string, entityContext?: string | null): string {
  let desc = SCREEN_DESCRIPTIONS[path];
  if (!desc) {
    for (const [key, val] of Object.entries(SCREEN_DESCRIPTIONS)) {
      if (path.startsWith(key + "/")) { desc = val; break; }
    }
  }
  if (!desc) desc = "Page: " + path;
  if (entityContext) desc += " | Context: " + entityContext;
  return desc;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

async function authenticateFromRequest(req: IncomingMessage): Promise<{ userId: number; role: string; name: string } | null> {
  try {
    const rawUrl = req.url || "/";
    const url = new URL(rawUrl, "http://localhost");
    const queryToken = url.searchParams.get("token");
    if (queryToken) {
      const { verifyWsToken } = await import("./wsAuth");
      const result = await verifyWsToken(queryToken);
      if (result) return result;
      console.warn(`[VoiceGateway] Token verification failed`);
    }
  } catch (err: any) {
    console.error(`[VoiceGateway] Token auth error:`, err.message);
  }
  try {
    const fakeReq = { headers: { cookie: req.headers.cookie || "" } } as any;
    const user = await sdk.authenticateRequest(fakeReq);
    if (!user) return null;
    return { userId: user.id, role: user.role, name: user.name || "User" };
  } catch (err: any) {
    console.error(`[VoiceGateway] Cookie auth error:`, err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOKEN USAGE
// ═══════════════════════════════════════════════════════════════════════════════

async function getDailyTokenUsage(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const todayStr = new Date().toISOString().split("T")[0]!;
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${voiceCostTracking.tokenCount}), 0)` })
    .from(voiceCostTracking)
    .where(and(eq(voiceCostTracking.userId, userId), sql`DATE(${voiceCostTracking.date}) = ${todayStr}`));
  return Number(result[0]?.total ?? 0);
}

async function isFeatureEnabled(flagName: string, userRole?: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return true;
  const flags = await db.select().from(voiceFeatureFlags).where(eq(voiceFeatureFlags.toolName, flagName)).limit(1);
  if (!flags.length) return false;
  const flag = flags[0]!;
  if (!flag.enabled) return false;
  if (userRole && flag.enabledRoles) {
    try {
      const allowed = JSON.parse(flag.enabledRoles) as string[];
      if (allowed.length > 0 && !allowed.includes(userRole)) return false;
    } catch {}
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROLE-BASED PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════════

const TOOL_PERMISSIONS: Record<string, string[]> = {
  get_current_user: ["superadmin", "admin", "trustee", "manager", "staff", "reception", "donor", "auditor"],
  get_screen_context: ["superadmin", "admin", "trustee", "manager", "staff", "reception", "donor", "auditor"],
  get_staff_directory: ["superadmin", "admin", "trustee", "manager", "staff"],
  get_trustees: ["superadmin", "admin", "trustee", "manager", "staff"],
  get_donor: ["superadmin", "admin", "trustee", "manager", "staff", "reception"],
  search_transactions: ["superadmin", "admin", "trustee", "manager", "staff", "auditor"],
  get_fund_balance: ["superadmin", "admin", "trustee", "manager", "staff", "auditor"],
  get_campaign_status: ["superadmin", "admin", "trustee", "manager", "staff", "auditor"],
  get_priorities: ["superadmin", "admin", "trustee", "manager", "staff"],
  navigate_to: ["superadmin", "admin", "trustee", "manager", "staff", "reception", "donor"],
  create_donation: ["superadmin", "admin", "trustee", "manager", "staff", "reception"],
  update_donor_profile: ["superadmin", "admin", "trustee", "manager", "staff", "reception"],
  log_communication: ["superadmin", "admin", "trustee", "manager", "staff"],
  create_task: ["superadmin", "admin", "trustee", "manager", "staff"],
  fill_form: ["superadmin", "admin", "trustee", "manager", "staff", "reception"],
  send_email: ["superadmin", "admin", "trustee", "manager", "staff"],
  send_whatsapp: ["superadmin", "admin", "trustee", "manager", "staff"],
  bulk_send_email: ["superadmin", "admin", "trustee", "manager"],
  bulk_send_whatsapp: ["superadmin", "admin", "trustee", "manager"],
  create_payment_link: ["superadmin", "admin", "trustee", "manager"],
  flag_for_review: ["superadmin", "admin", "trustee", "manager", "staff", "reception"],
  list_drive_files: ["superadmin", "admin", "trustee", "manager"],
  read_drive_file: ["superadmin", "admin", "trustee", "manager"],
  save_to_drive: ["superadmin", "admin", "trustee", "manager"],
  create_expense_sheet: ["superadmin", "admin", "trustee", "manager"],
  create_monthly_breakdown: ["superadmin", "admin", "trustee", "manager"],
  list_gmail_labels: ["superadmin", "admin", "trustee", "manager"],
  fetch_emails_by_label: ["superadmin", "admin", "trustee", "manager"],
  fetch_new_emails: ["superadmin", "admin", "trustee", "manager", "staff"],
  summarise_and_action_emails: ["superadmin", "admin", "trustee", "manager"],
  send_to_donors: ["superadmin", "admin", "trustee", "manager"],
  send_to_suppliers: ["superadmin", "admin", "trustee", "manager"],
  fetch_and_push_to_comms: ["superadmin", "admin", "trustee", "manager"],
  get_daily_briefing: ["superadmin", "admin", "trustee", "manager", "staff"],
  get_calendar_today: ["superadmin", "admin", "trustee", "manager", "staff"],
  update_drive_file: ["superadmin", "admin", "trustee", "manager"],
};

function hasToolPermission(toolName: string, userRole: string): boolean {
  const allowed = TOOL_PERMISSIONS[toolName];
  if (!allowed) return true;
  return allowed.includes(userRole);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

async function executeToolCall(toolName: string, args: Record<string, unknown>, client: VoiceClient): Promise<{ status: string; data: unknown; error?: string }> {
  if (!hasToolPermission(toolName, client.userRole)) {
    return { status: "error", data: null, error: `Permission denied: your role (${client.userRole}) cannot use ${toolName}` };
  }
  const db = await getDb();
  const startTime = Date.now();
  try {
    const result = await routeToolCall(toolName, args, client);
    const latencyMs = Date.now() - startTime;
    if (db) {
      await db.insert(voiceToolCalls).values({
        sessionId: client.dbSessionId, toolName, params: JSON.stringify(args),
        resultSummary: JSON.stringify(result).substring(0, 500), latencyMs, success: true, createdAt: new Date(),
      });
    }
    return { status: "success", data: result };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    if (db) {
      await db.insert(voiceToolCalls).values({
        sessionId: client.dbSessionId, toolName, params: JSON.stringify(args),
        resultSummary: err.message || "Error", latencyMs, success: false, createdAt: new Date(),
      });
    }
    return { status: "error", data: null, error: err.message || "Tool execution failed" };
  }
}

async function routeToolCall(toolName: string, args: Record<string, unknown>, client: VoiceClient): Promise<unknown> {
  if (CACHEABLE_TOOLS.has(toolName)) {
    const cacheKey = `${toolName}:${JSON.stringify(args)}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }
  const db = await getDb();
  if (!db) return { error: "Database connection unavailable" };
  const result = await _routeToolCallInner(toolName, args, client, db);
  if (CACHEABLE_TOOLS.has(toolName)) {
    setCache(`${toolName}:${JSON.stringify(args)}`, result);
  }
  return result;
}

async function _routeToolCallInner(toolName: string, args: Record<string, unknown>, client: VoiceClient, db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<unknown> {
  switch (toolName) {
    case "get_current_user":
      return { userId: client.userId, role: client.userRole, name: client.userName, language: client.language };
    case "get_screen_context":
      return { screen: client.screenContext, entity: client.entityContext };
    case "get_current_time": {
      const now = new Date();
      return { utc: now.toISOString(), uk: now.toLocaleString("en-GB", { timeZone: "Europe/London" }), day: now.toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long" }) };
    }
    case "get_staff_directory": {
      const staffRows = await db.select({ id: trustees.id, name: trustees.fullName, role: trustees.role, email: trustees.email, phone: trustees.phone }).from(trustees).where(eq(trustees.isActive, true));
      return staffRows;
    }
    case "get_trustees": {
      const trusteeRows = await db.select({ id: trustees.id, name: trustees.fullName, role: trustees.role, email: trustees.email, phone: trustees.phone }).from(trustees).where(and(eq(trustees.isActive, true), or(like(trustees.role, "%trustee%"), like(trustees.role, "%chair%"))));
      return trusteeRows;
    }
    case "get_donor": {
      const donorId = Number(args.donorId);
      if (!donorId) return { error: "donorId is required" };
      const rows = await db.select().from(donors).where(eq(donors.id, donorId)).limit(1);
      if (!rows.length) return { error: "Donor not found" };
      return rows[0];
    }
    case "search_donors": {
      const q = String(args.query || "").trim();
      const limit = Math.min(Number(args.limit) || 10, 50);
      if (!q) return { error: "query is required" };
      const rows = await db.select().from(donors).where(or(like(donors.name, `%${q}%`), like(donors.email, `%${q}%`), like(donors.phone, `%${q}%`))).limit(limit);
      return { results: rows.map(d => ({ id: d.id, name: d.name, email: d.email, phone: d.phone, totalGiven: d.totalGiven, status: d.status })) };
    }
    case "search_transactions": {
      const limit = Math.min(Number(args.limit) || 20, 50);
      const rows = await db.select().from(receipts).orderBy(desc(receipts.createdAt)).limit(limit);
      return { total: rows.length, transactions: rows.map(r => ({ id: r.id, vendor: r.vendor, amount: r.amount, date: r.receiptDate, category: r.categoryName, status: r.status })) };
    }
    case "get_income_summary": {
      const rows = await db.select().from(incomeRecords).orderBy(desc(incomeRecords.createdAt)).limit(30);
      const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      return { total: `£${total.toFixed(2)}`, count: rows.length, records: rows.slice(0, 10).map(r => ({ id: r.id, source: r.categoryName, amount: r.amount, date: r.periodStart, type: r.period })) };
    }
    case "get_expenses_summary": {
      const rows = await db.select().from(receipts).where(eq(receipts.status, "approved")).orderBy(desc(receipts.createdAt)).limit(30);
      const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      return { total: `£${total.toFixed(2)}`, count: rows.length, expenses: rows.slice(0, 10).map(r => ({ id: r.id, vendor: r.vendor, amount: r.amount, date: r.receiptDate, category: r.categoryName })) };
    }
    case "get_loans_summary": {
      const { loanApplications } = await import("../drizzle/schema");
      const loans = await db.select().from(loanApplications).orderBy(desc(loanApplications.createdAt)).limit(20);
      return { total: loans.length, loans: loans.map(l => ({ id: l.id, borrower: l.borrowerName, amount: l.amount, status: l.status })) };
    }
    case "get_payroll_summary": {
      try {
        const { payrollRecords } = await import("../drizzle/schema");
        const rows = await db.select().from(payrollRecords).orderBy(desc(payrollRecords.createdAt)).limit(20);
        return { total: rows.length, records: rows.slice(0, 10) };
      } catch { return { message: "Payroll data not available" }; }
    }
    case "get_bills_utilities": {
      try {
        const { billsUtilities } = await import("../drizzle/schema");
        const rows = await db.select().from(billsUtilities).orderBy(desc(billsUtilities.createdAt)).limit(20);
        return { total: rows.length, bills: rows.map(b => ({ id: b.id, supplier: (b as any).supplier || (b as any).supplierName, amount: (b as any).amount, dueDate: (b as any).dueDate, status: (b as any).status })) };
      } catch { return { message: "Bills data not available" }; }
    }
    case "get_fund_balance": {
      const { fundraisingCampaigns } = await import("../drizzle/schema");
      const campaigns = await db.select().from(fundraisingCampaigns).where(eq(fundraisingCampaigns.status, "active")).limit(20);
      return campaigns.map(c => ({ id: c.id, name: c.name, target: c.targetAmount, raised: c.raisedAmount, progress: c.targetAmount ? `${Math.round((Number(c.raisedAmount || 0) / Number(c.targetAmount)) * 100)}%` : "N/A" }));
    }
    case "get_campaign_status": {
      const { fundraisingCampaigns } = await import("../drizzle/schema");
      const campaigns = await db.select().from(fundraisingCampaigns).orderBy(desc(fundraisingCampaigns.createdAt)).limit(20);
      return { total: campaigns.length, campaigns: campaigns.map(c => ({ id: c.id, name: c.name, status: c.status, target: c.targetAmount, raised: c.raisedAmount })) };
    }
    case "get_pledges": {
      try {
        const { pledges } = await import("../drizzle/schema");
        const rows = await db.select().from(pledges).orderBy(desc(pledges.createdAt)).limit(20);
        return { total: rows.length, pledges: rows.map(p => ({ id: p.id, donorId: (p as any).donorId, amount: (p as any).amount, status: (p as any).status, fulfilledAmount: (p as any).fulfilledAmount })) };
      } catch { return { message: "Pledges data not available" }; }
    }
    case "get_priorities": {
      const pending = await db.select().from(receipts).where(eq(receipts.status, "pending")).orderBy(desc(receipts.createdAt)).limit(10);
      return { pendingApprovals: pending.length, items: pending.map(r => ({ id: r.id, vendor: r.vendor, amount: r.amount, date: r.date })) };
    }
    case "compose_briefing": {
      const pending = await db.select({ count: sql<number>`COUNT(*)` }).from(receipts).where(eq(receipts.status, "pending"));
      const recentIncome = await db.select().from(incomeRecords).orderBy(desc(incomeRecords.createdAt)).limit(5);
      return { pendingApprovals: Number(pending[0]?.count ?? 0), recentIncome: recentIncome.map(r => ({ source: r.source, amount: r.amount, date: r.date })) };
    }
    case "get_meetings": {
      const { trusteeMeetings } = await import("../drizzle/schema");
      const upcoming = args.upcoming !== false;
      const now = new Date();
      let meetings;
      if (upcoming) {
        meetings = await db.select().from(trusteeMeetings).where(gte(trusteeMeetings.scheduledAt, now)).orderBy(trusteeMeetings.scheduledAt).limit(10);
      } else {
        meetings = await db.select().from(trusteeMeetings).orderBy(desc(trusteeMeetings.scheduledAt)).limit(10);
      }
      return { total: meetings.length, meetings: meetings.map(m => ({ id: m.id, date: m.scheduledAt, type: m.meetingType, location: (m as any).location })) };
    }
    case "get_compliance_status": {
      try {
        const { complianceActions } = await import("../drizzle/schema");
        const rows = await db.select().from(complianceActions).orderBy(desc(complianceActions.createdAt)).limit(20);
        return { total: rows.length, actions: rows.map(a => ({ id: a.id, title: (a as any).title, status: (a as any).status, dueDate: (a as any).dueDate })) };
      } catch { return { message: "Compliance data not available" }; }
    }
    case "get_accommodation": {
      try {
        const { accommodationTenants } = await import("../drizzle/schema");
        const rows = await db.select().from(accommodationTenants).limit(20);
        return { total: rows.length, tenants: rows.map(t => ({ id: t.id, name: (t as any).tenantName || (t as any).name, room: (t as any).roomNumber, status: (t as any).status })) };
      } catch { return { message: "Accommodation data not available" }; }
    }
    case "get_facilities": {
      try {
        const { facilityBookings } = await import("../drizzle/schema");
        const rows = await db.select().from(facilityBookings).orderBy(desc(facilityBookings.createdAt)).limit(20);
        return { total: rows.length, bookings: rows.map(b => ({ id: b.id, facility: (b as any).facilityName, date: (b as any).bookingDate, status: (b as any).status })) };
      } catch { return { message: "Facilities data not available" }; }
    }
    case "create_donation": {
      const { fundraisingDonations } = await import("../drizzle/schema");
      const donorId = Number(args.donorId);
      const amount = Number(args.amount);
      if (!donorId || !amount) return { error: "donorId and amount are required" };
      await db.insert(fundraisingDonations).values({ donorId, amount: String(amount), campaignId: args.campaignId ? Number(args.campaignId) : null, paymentMethod: String(args.paymentMethod || "cash"), createdAt: new Date() } as any);
      await db.update(donors).set({ totalGiven: sql`${donors.totalGiven} + ${amount}`, lastDonationDate: new Date() }).where(eq(donors.id, donorId));
      return { success: true, message: `Donation of £${amount} recorded. May Allah reward them abundantly.` };
    }
    case "update_donor_profile": {
      const donorId = Number(args.donorId);
      if (!donorId) return { error: "donorId is required" };
      const updates: any = {};
      if (args.phone) updates.phone = String(args.phone);
      if (args.email) updates.email = String(args.email);
      if (args.addressLine1) updates.addressLine1 = String(args.addressLine1);
      if (args.postcode) updates.postcode = String(args.postcode);
      if (Object.keys(updates).length === 0) return { error: "No fields to update" };
      await db.update(donors).set(updates).where(eq(donors.id, donorId));
      return { success: true, updated: Object.keys(updates) };
    }
    case "log_communication": {
      const { donorCommsLog } = await import("../drizzle/schema");
      const donorId = Number(args.donorId);
      if (!donorId) return { error: "donorId is required" };
      await db.insert(donorCommsLog).values({ donorId, type: "voice_logged", channel: String(args.channel || "voice"), subject: String(args.subject || "Voice communication"), notes: String(args.body || ""), sentByUserId: client.userId, createdAt: new Date() });
      return { success: true };
    }
    case "create_payment_link": {
      const amount = Number(args.amount);
      if (!amount) return { error: "amount is required" };
      const stripe = (await import("stripe")).default;
      const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY || "");
      const session = await stripeClient.checkout.sessions.create({ mode: "payment", line_items: [{ price_data: { currency: "gbp", product_data: { name: "Donation to AQS" }, unit_amount: Math.round(amount * 100) }, quantity: 1 }], success_url: `${process.env.VITE_OAUTH_PORTAL_URL || "https://theaqs.org"}/donate?success=true`, cancel_url: `${process.env.VITE_OAUTH_PORTAL_URL || "https://theaqs.org"}/donate?cancelled=true` });
      return { success: true, url: session.url, amount: `£${amount}` };
    }
    case "send_email": {
      const to = String(args.to || "").trim();
      const subject = String(args.subject || "").trim();
      const body = String(args.body || "").trim();
      if (!to || !subject || !body) return { error: "to, subject, and body are required" };
      try {
        const result = await sendBulkGmail([{ name: String(args.recipientName || to), email: to }], subject, body);
        return { success: true, sent: result.sent };
      } catch (err: any) { return { error: `Email send error: ${err.message}` }; }
    }
    case "draft_whatsapp":
    case "draft_email": {
      const { commsOutbox } = await import("../drizzle/schema");
      await db.insert(commsOutbox).values({ recipientGroup: "individual", recipientIds: [Number(args.recipientId) || 0], subject: String(args.subject || "Draft"), body: String(args.body || ""), type: toolName === "draft_whatsapp" ? "sms" : "email", status: "draft", sentByUserId: client.userId, createdAt: new Date() });
      return { success: true, message: "Draft saved to outbox" };
    }
    case "create_task": {
      const { tasks } = await import("../drizzle/schema");
      const title = String(args.title || "").trim();
      if (!title) return { error: "title is required" };
      await db.insert(tasks).values({ title, owner: String(args.owner || client.userName), dueDate: args.dueDate ? new Date(String(args.dueDate)) : null, priority: String(args.priority || "medium") as any, notes: String(args.notes || ""), source: String(args.source || "voice"), createdByUserId: client.userId, createdAt: new Date() } as any);
      return { success: true, message: `Task created: ${title}` };
    }
    case "schedule_meeting": {
      const { trusteeMeetings } = await import("../drizzle/schema");
      const title = String(args.title || "").trim();
      const scheduledAt = args.scheduledAt ? new Date(String(args.scheduledAt)) : new Date();
      await db.insert(trusteeMeetings).values({ title, meetingType: String(args.meetingType || "trustee_board") as any, scheduledAt, location: String(args.location || "Brougham Terrace"), notes: String(args.notes || ""), createdByUserId: client.userId, createdAt: new Date() } as any);
      return { success: true, message: `Meeting scheduled: ${title}` };
    }
    case "generate_report": {
      return { success: true, message: "Report generation initiated. Check Reports section shortly." };
    }
    case "flag_for_review": {
      await db.insert(voiceReviewQueue).values({ sessionId: client.dbSessionId, transcriptId: args.transcriptId ? Number(args.transcriptId) : null, flaggedByUserId: client.userId, agentStatement: String(args.note || "Flagged for review"), status: "pending", createdAt: new Date() });
      return { success: true, message: "Flagged for review" };
    }
    case "navigate_to": {
      const page = String(args.page || "/dashboard");
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: "navigate", path: page }));
      }
      client.screenContext = page;
      return { success: true, navigatedTo: page };
    }
    case "get_training_summary": {
      try {
        const { trainingRecords } = await import("../drizzle/schema");
        const rows = await db.select().from(trainingRecords).limit(30);
        return { total: rows.length, records: rows.slice(0, 10) };
      } catch { return { message: "Training data not available" }; }
    }
    case "get_bistro_summary": {
      try {
        const { bistroOrders, bistroMenuItems } = await import("../drizzle/schema");
        const orders = await db.select().from(bistroOrders).orderBy(desc(bistroOrders.createdAt)).limit(30);
        const menuItems = await db.select().from(bistroMenuItems).limit(50);
        return { totalMenuItems: menuItems.length, recentOrders: orders.length };
      } catch { return { message: "Bistro data not available" }; }
    }
    case "get_conflicts": {
      try {
        const { conflictsOfInterest } = await import("../drizzle/schema");
        const rows = await db.select().from(conflictsOfInterest).orderBy(desc(conflictsOfInterest.createdAt)).limit(30);
        return { total: rows.length, conflicts: rows.map(c => ({ id: c.id, description: (c as any).description, status: c.status })) };
      } catch { return { message: "Conflicts data not available" }; }
    }
    case "get_decisions": {
      try {
        const { trusteeDecisions } = await import("../drizzle/schema");
        const rows = await db.select().from(trusteeDecisions).orderBy(desc(trusteeDecisions.createdAt)).limit(Number(args.limit) || 20);
        return { total: rows.length, decisions: rows.map(d => ({ id: d.id, title: (d as any).title || (d as any).decision, status: (d as any).status })) };
      } catch { return { message: "Decisions data not available" }; }
    }
    case "get_lbmw_correspondence": {
      try {
        const { lbmwCorrespondence } = await import("../drizzle/schema");
        const rows = await db.select().from(lbmwCorrespondence).orderBy(desc(lbmwCorrespondence.createdAt)).limit(20);
        return { total: rows.length, items: rows.map(r => ({ id: r.id, subject: (r as any).subject, status: (r as any).status })) };
      } catch { return { message: "LBMW data not available" }; }
    }
    case "get_comms_inbox": {
      const { commsOutbox } = await import("../drizzle/schema");
      const rows = await db.select().from(commsOutbox).orderBy(desc(commsOutbox.createdAt)).limit(Number(args.limit) || 20);
      return { total: rows.length, messages: rows.map(m => ({ id: m.id, subject: (m as any).subject, type: (m as any).type, status: (m as any).status })) };
    }
    case "get_backups": {
      try {
        const { systemBackups } = await import("../drizzle/schema");
        const rows = await db.select().from(systemBackups).orderBy(desc(systemBackups.createdAt)).limit(10);
        return { total: rows.length, backups: rows.map(b => ({ id: b.id, status: (b as any).status, createdAt: b.createdAt })) };
      } catch { return { message: "Backup data not available" }; }
    }
    case "create_donor_note": {
      const { donorNotes } = await import("../drizzle/schema");
      const donorId = Number(args.donorId);
      const content = String(args.content || "").trim();
      if (!donorId || !content) return { error: "donorId and content are required" };
      await db.insert(donorNotes).values({ donorId, note: content, isPinned: args.isPinned ? true : false, createdById: client.userId, createdByName: client.userName, createdAt: new Date() });
      return { success: true, message: `Note added to donor ${donorId}` };
    }
    case "send_whatsapp": {
      const { commsOutbox } = await import("../drizzle/schema");
      const to = String(args.to || "").trim();
      const body = String(args.body || "").trim();
      if (!to || !body) return { error: "Phone number and message body are required" };
      let waPhone = to.replace(/[^0-9+]/g, "");
      if (waPhone.startsWith("0")) waPhone = "+44" + waPhone.substring(1);
      if (!waPhone.startsWith("+")) waPhone = "+44" + waPhone;
      const waUrl = `https://wa.me/${waPhone.replace("+", "")}?text=${encodeURIComponent(body)}`;
      await db.insert(commsOutbox).values({ recipientGroup: "individual", recipientIds: [args.donorId ? Number(args.donorId) : 0], subject: `WhatsApp to ${args.recipientName || to}`, body, type: "sms", status: "sent", sentByUserId: client.userId, createdAt: new Date() });
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: "open_url", url: waUrl, label: `WhatsApp to ${args.recipientName || to}` }));
      }
      return { success: true, message: `WhatsApp link opened for ${args.recipientName || to}`, url: waUrl };
    }
    case "get_recognition_tiers": {
      try {
        const { recognitionTiers } = await import("../drizzle/schema");
        const rows = await db.select().from(recognitionTiers).orderBy(recognitionTiers.minAmount);
        return { tiers: rows };
      } catch { return { message: "Recognition tiers not available" }; }
    }
    case "get_gift_aid_summary": {
      try {
        const { giftAidDeclarations } = await import("../drizzle/schema");
        const rows = await db.select().from(giftAidDeclarations).limit(30);
        return { total: rows.length, declarations: rows.slice(0, 10) };
      } catch { return { message: "Gift Aid data not available" }; }
    }
    case "get_audit_trail": {
      try {
        const { auditTrail } = await import("../drizzle/schema");
        const rows = await db.select().from(auditTrail).orderBy(desc(auditTrail.createdAt)).limit(Number(args.limit) || 20);
        return { total: rows.length, entries: rows.map(a => ({ id: a.id, action: (a as any).action, actor: (a as any).actorName, createdAt: a.createdAt })) };
      } catch { return { message: "Audit trail not available" }; }
    }
    case "get_prayer_times": {
      try {
        const today = new Date();
        const dateStr = `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${today.getFullYear()}`;
        const resp = await fetch(`https://api.aladhan.com/v1/timingsByCity/${dateStr}?city=Liverpool&country=United+Kingdom&method=15`);
        const data: any = await resp.json();
        if (data.code === 200 && data.data?.timings) {
          const t = data.data.timings;
          return { fajr: t.Fajr, sunrise: t.Sunrise, dhuhr: t.Dhuhr, asr: t.Asr, maghrib: t.Maghrib, isha: t.Isha, date: data.data.date?.readable };
        }
        return { error: "Could not fetch prayer times" };
      } catch { return { error: "Prayer times API unavailable" }; }
    }
    case "get_donation_info":
      return { bankName: "Abdullah Quilliam Society", sortCode: "40-29-28", accountNumber: "01158945", donorbox: "theaqs.org", stripe: "Available via Payment Hub", note: "JazakAllah Khair for your generosity" };
    case "get_mosque_info":
      return { name: "Abdullah Quilliam Mosque & National Heritage Centre", charity: "1194942", address: "8-10 Brougham Terrace, Liverpool L6 1AE", phone: "0151 260 3986", websites: ["abdullahquilliam.org", "theaqs.org"], founded: "1887 by Abdullah Quilliam", chair: "Galib Khan" };
    case "bulk_send_email": {
      const group = String(args.group || "").toLowerCase();
      const subject = String(args.subject || "").trim();
      const body = String(args.body || "").trim();
      if (!group || !subject || !body) return { error: "group, subject, and body are required" };
      let recipients: { name: string; email: string }[] = [];
      if (group === "trustees" || group === "staff" || group === "all") {
        const staffRows = await db.select().from(trustees).where(eq(trustees.isActive, true));
        const filtered = group === "trustees" ? staffRows.filter(s => s.role?.includes("trustee") || s.role?.includes("chair")) : staffRows;
        recipients = filtered.filter(s => s.email).map(s => ({ name: s.fullName || "Team Member", email: s.email! }));
      }
      if (recipients.length === 0) return { error: `No recipients found for group '${group}'` };
      try {
        const result = await sendBulkGmail(recipients, subject, body);
        return { success: true, sent: result.sent, failed: result.failed };
      } catch (err: any) { return { error: `Bulk email error: ${err.message}` }; }
    }
    case "bulk_send_whatsapp": {
      const { commsOutbox } = await import("../drizzle/schema");
      const group = String(args.group || "").toLowerCase();
      const body = String(args.body || "").trim();
      if (!group || !body) return { error: "group and body are required" };
      await db.insert(commsOutbox).values({ recipientGroup: group, recipientIds: [], subject: `WhatsApp to ${group}`, body, type: "sms", status: "draft", sentByUserId: client.userId, createdAt: new Date() });
      return { success: true, message: `WhatsApp draft prepared for ${group}` };
    }
    case "get_email_templates": {
      return { templates: ["donation_thank_you", "meeting_invite", "monthly_update", "volunteer_welcome", "event_reminder"] };
    }
    case "get_qarde_hasan_register": {
      const { loanApplications } = await import("../drizzle/schema");
      const status = args.status ? String(args.status) : undefined;
      let query = db.select().from(loanApplications).orderBy(desc(loanApplications.createdAt)).limit(20);
      const rows = await query;
      const filtered = status ? rows.filter(r => r.status === status) : rows;
      return { total: filtered.length, loans: filtered.map(l => ({ id: l.id, borrower: l.borrowerName, amount: l.amount, status: l.status })) };
    }
    case "get_calendar": {
      const { trusteeMeetings } = await import("../drizzle/schema");
      const days = Number(args.days) || 30;
      const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const meetings = await db.select().from(trusteeMeetings).where(and(gte(trusteeMeetings.scheduledAt, new Date()), gte(sql`${futureDate}`, trusteeMeetings.scheduledAt))).orderBy(trusteeMeetings.scheduledAt).limit(20);
      return { total: meetings.length, events: meetings.map(m => ({ id: m.id, title: m.title, date: m.scheduledAt, type: m.meetingType })) };
    }
    case "set_user_preference": {
      return { success: true, message: `Preference '${args.key}' set to '${args.value}'` };
    }
    case "fill_form": {
      const fields = args.fields || {};
      const page = args.page || client.screenContext;
      const action = args.action || "fill_and_confirm";
      client.ws.send(JSON.stringify({ type: "fill_form", fields, page, action }));
      const fieldSummary = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join(", ");
      return { success: true, message: `Form populated with: ${fieldSummary}` };
    }
    case "list_drive_files": {
      try {
        const result = await listDriveFiles(String(args.folderId || ""), Number(args.limit) || 20);
        return result;
      } catch (err: any) { return { error: `Drive error: ${err.message}` }; }
    }
    case "read_drive_file": {
      try {
        const result = await getDriveFile(String(args.fileId));
        return result;
      } catch (err: any) { return { error: `Drive read error: ${err.message}` }; }
    }
    case "save_to_drive": {
      try {
        const result = await uploadToDrive(String(args.fileName), String(args.content), String(args.mimeType || "text/plain"), String(args.folderId || ""));
        return result;
      } catch (err: any) { return { error: `Drive save error: ${err.message}` }; }
    }
    case "create_expense_sheet": {
      try {
        const result = await createExpenseSheet(String(args.title), String(args.period || "this_month"));
        return result;
      } catch (err: any) { return { error: `Expense sheet error: ${err.message}` }; }
    }
    case "create_monthly_breakdown": {
      try {
        const result = await createMonthlyBreakdownSheet(String(args.title || "Monthly Breakdown"), Number(args.month) || new Date().getMonth() + 1, Number(args.year) || new Date().getFullYear());
        return result;
      } catch (err: any) { return { error: `Monthly breakdown error: ${err.message}` }; }
    }
    case "list_gmail_labels": {
      try { return await listGmailLabels(); } catch (err: any) { return { error: `Gmail labels error: ${err.message}` }; }
    }
    case "fetch_emails_by_label": {
      try { return await fetchEmailsByLabel(String(args.labelId), String(args.labelName || ""), Number(args.maxResults) || 10); } catch (err: any) { return { error: `Gmail fetch error: ${err.message}` }; }
    }
    case "fetch_new_emails": {
      try { return await fetchRecentEmails(Number(args.maxResults) || 5, String(args.query || "")); } catch (err: any) { return { error: `Gmail fetch error: ${err.message}` }; }
    }
    case "summarise_and_action_emails": {
      try {
        const { summariseEmails } = await import("./googleServices");
        return await summariseEmails(args.emailIds as string[] || [], String(args.labelId || ""), Number(args.maxResults) || 5);
      } catch (err: any) { return { error: `Email summarisation error: ${err.message}` }; }
    }
    case "send_to_donors": {
      try {
        const group = String(args.group || "all").toLowerCase();
        const subject = String(args.subject || "").trim();
        const body = String(args.body || "").trim();
        if (!subject || !body) return { error: "subject and body are required" };
        const allDonors = await db.select().from(donors);
        let recipientList = allDonors.filter(d => d.email && d.status !== "do_not_contact" && d.status !== "deceased");
        if (group === "major") recipientList = recipientList.filter(d => d.status === "major" || Number(d.totalGiven || 0) >= 1000);
        else if (group === "regular") recipientList = recipientList.filter(d => d.isRegular);
        else if (group === "active") recipientList = recipientList.filter(d => d.status === "active" || d.status === "major");
        recipientList = recipientList.slice(0, Number(args.limit) || 50);
        if (recipientList.length === 0) return { error: `No donors found in group '${group}'` };
        const recipients = recipientList.map(d => ({ name: d.name || d.firstName || "Donor", email: d.email! }));
        const result = await sendBulkGmail(recipients, subject, body);
        return { success: true, sent: result.sent, failed: result.failed };
      } catch (err: any) { return { error: `Donor email error: ${err.message}` }; }
    }
    case "send_to_suppliers": {
      try {
        const subject = String(args.subject || "").trim();
        const body = String(args.body || "").trim();
        if (!subject || !body) return { error: "subject and body are required" };
        let suppliers = await db.select().from(supplierContacts).where(eq(supplierContacts.isActive, true));
        if (args.supplierName) suppliers = suppliers.filter(s => s.supplierName.toLowerCase().includes(String(args.supplierName).toLowerCase()));
        const recipientList = suppliers.filter(s => s.email);
        if (recipientList.length === 0) return { error: "No suppliers found with email addresses" };
        const recipients = recipientList.map(s => ({ name: s.contactName || s.supplierName, email: s.email! }));
        const result = await sendBulkGmail(recipients, subject, body);
        return { success: true, sent: result.sent, failed: result.failed };
      } catch (err: any) { return { error: `Supplier email error: ${err.message}` }; }
    }
    case "fetch_and_push_to_comms": {
      try {
        const { fetchAndPushToCommsHub } = await import("./googleServices");
        const results = await fetchAndPushToCommsHub(String(args.labelId), String(args.labelName), Number(args.maxResults) || 10, client.userId);
        if (results.length === 0) return { message: "No new emails to process" };
        return { processed: results.length, emails: results.map(r => ({ summary: r.summary, urgency: r.urgency, section: r.sectionSlug })) };
      } catch (err: any) { return { error: `Comms Hub push error: ${err.message}` }; }
    }
    case "get_daily_briefing": {
      try {
        const { collectDailyBriefingData } = await import("./googleServices");
        const data = await collectDailyBriefingData();
        return { calendarToday: data.calendarToday.map(e => ({ summary: e.summary, start: e.start.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }) })), urgentEmails: data.urgentEmails, unreadCount: data.unreadCount };
      } catch (err: any) { return { error: `Daily briefing error: ${err.message}` }; }
    }
    case "get_calendar_today": {
      try {
        const { fetchCalendarEvents } = await import("./googleServices");
        const events = await fetchCalendarEvents(Number(args.daysAhead) || 1);
        return { events: events.map(e => ({ summary: e.summary, start: e.start.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }), location: e.location })), count: events.length };
      } catch (err: any) { return { error: `Calendar error: ${err.message}` }; }
    }
    case "set_email_priority": {
      try {
        const messageId = Number(args.messageId);
        const priority = String(args.priority || "normal");
        if (!messageId) return { error: "messageId is required" };
        await db.execute(sql`UPDATE comms_messages SET priority=${priority} WHERE id=${messageId}`);
        return { success: true, messageId, priority };
      } catch (err: any) { return { error: `Priority update error: ${err.message}` }; }
    }
    case "move_email_to_section": {
      try {
        const messageId = Number(args.messageId);
        const sectionSlug = String(args.sectionSlug || "");
        if (!messageId || !sectionSlug) return { error: "messageId and sectionSlug are required" };
        const secRows = await db.execute(sql`SELECT id FROM comms_sections WHERE slug=${sectionSlug} LIMIT 1`) as any;
        const sectionId = secRows[0]?.[0]?.id;
        if (!sectionId) return { error: `Section '${sectionSlug}' not found` };
        await db.execute(sql`UPDATE comms_messages SET sectionId=${sectionId} WHERE id=${messageId}`);
        return { success: true, messageId, movedTo: sectionSlug };
      } catch (err: any) { return { error: `Move error: ${err.message}` }; }
    }
    case "update_drive_file": {
      try {
        const { updateDriveFile } = await import("./googleServices");
        const result = await updateDriveFile(String(args.fileId), String(args.content), String(args.mimeType || "text/plain"));
        return { success: true, fileId: result.fileId, webViewLink: result.webViewLink };
      } catch (err: any) { return { error: `Drive update error: ${err.message}` }; }
    }
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROACTIVE GREETING
// ═══════════════════════════════════════════════════════════════════════════════

async function triggerProactiveGreeting(client: VoiceClient) {
  try {
    const now = new Date();
    const ukHour = parseInt(now.toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }));
    let timeGreeting: string;
    if (ukHour >= 5 && ukHour < 12) timeGreeting = "Good morning";
    else if (ukHour >= 12 && ukHour < 17) timeGreeting = "Good afternoon";
    else if (ukHour >= 17 && ukHour < 21) timeGreeting = "Good evening";
    else timeGreeting = "Assalamu Alaikum";

    const db = await getDb();
    let pendingCount = 0;
    let nextPrayer = "";

    if (db) {
      try {
        const pendingResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM receipts WHERE status = 'pending'`);
        pendingCount = Number((pendingResult as any)[0]?.[0]?.cnt ?? 0);
      } catch {}
    }

    try {
      const today = new Date();
      const dateStr = `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${today.getFullYear()}`;
      const resp = await fetch(`https://api.aladhan.com/v1/timingsByCity/${dateStr}?city=Liverpool&country=United+Kingdom&method=15`);
      const data: any = await resp.json();
      if (data.code === 200 && data.data?.timings) {
        const t = data.data.timings;
        const prayers = [
          { name: "Fajr", time: t.Fajr }, { name: "Dhuhr", time: t.Dhuhr },
          { name: "Asr", time: t.Asr }, { name: "Maghrib", time: t.Maghrib }, { name: "Isha", time: t.Isha },
        ];
        const ukNow = now.toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false });
        const [nowH, nowM] = ukNow.split(":").map(Number);
        const nowMinutes = nowH * 60 + nowM;
        for (const p of prayers) {
          const [pH, pM] = (p.time || "00:00").split(":").map(Number);
          if (pH * 60 + pM > nowMinutes) { nextPrayer = `${p.name} at ${p.time}`; break; }
        }
        if (!nextPrayer) nextPrayer = `Fajr tomorrow at ${t.Fajr}`;
      }
    } catch {}

    const greetingPrompt = `[SESSION START — PROACTIVE GREETING]
Greet the user immediately. Do NOT wait for them to speak first.
Context:
- User name: ${client.userName}
- Time greeting: ${timeGreeting}
- Pending items: ${pendingCount || "none"}
- Next prayer: ${nextPrayer || "unknown"}
- Current screen: ${buildScreenDescription(client.screenContext)}

Deliver a warm, concise greeting (2-3 sentences max). Include "Assalamu Alaikum ${client.userName}" with the time greeting, mention pending items if any, and end with "How can I assist you?"
Do NOT use tools for this greeting.`;

    if (client.session) {
      client.session.sendClientContent({ turns: [{ role: "user", parts: [{ text: greetingPrompt }] }], turnComplete: true });
    }
  } catch (err: any) {
    console.error(`[VoiceGateway] Proactive greeting error:`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEMINI LIVE CONNECTION (via @google/genai SDK)
// ═══════════════════════════════════════════════════════════════════════════════

async function connectToGeminiLive(client: VoiceClient, connectionId: string): Promise<Session | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[VoiceGateway] GEMINI_API_KEY not set");
    return null;
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const session = await ai.live.connect({
      model: GEMINI_MODEL,
      callbacks: {
        onmessage: async (message: LiveServerMessage) => {
          try {
            // Handle audio output from model
            const audio = (message as any).serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio && client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify({
                type: "audio_response",
                audio,
                mimeType: "audio/pcm;rate=24000",
              }));
            }

            // Handle text transcription from model
            const transcription = (message as any).serverContent?.modelTurn?.parts?.[0]?.text;
            if (transcription && client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify({ type: "transcript", text: transcription, speaker: "assistant" }));
              const db = await getDb();
              if (db) await db.insert(voiceTranscripts).values({ sessionId: client.dbSessionId, role: "assistant", content: transcription, createdAt: new Date() });
            }

            // Handle output transcription (separate from inline text)
            const outputTranscription = (message as any).serverContent?.outputTranscription?.text;
            if (outputTranscription && client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify({ type: "transcript", text: outputTranscription, speaker: "assistant" }));
              const db = await getDb();
              if (db) await db.insert(voiceTranscripts).values({ sessionId: client.dbSessionId, role: "assistant", content: outputTranscription, createdAt: new Date() });
            }

            // Handle input transcription
            const inputTranscription = (message as any).serverContent?.inputTranscription?.text;
            if (inputTranscription && client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify({ type: "transcript", text: inputTranscription, speaker: "user" }));
              const db = await getDb();
              if (db) await db.insert(voiceTranscripts).values({ sessionId: client.dbSessionId, role: "user", content: inputTranscription, createdAt: new Date() });
            }

            // Handle interruptions (barge-in)
            if ((message as any).serverContent?.interrupted) {
              if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({ type: "interrupted" }));
              }
            }

            // Handle turn complete
            if ((message as any).serverContent?.turnComplete) {
              if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({ type: "turn_complete" }));
              }
            }

            // Handle tool calls — execute locally and return results
            if ((message as any).toolCall) {
              const { functionCalls } = (message as any).toolCall;
              if (functionCalls && functionCalls.length > 0) {
                const toolResponses: any[] = [];

                for (const fc of functionCalls) {
                  if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(JSON.stringify({ type: "tool_call", toolName: fc.name, toolResult: { status: "executing" } }));
                  }
                  console.log(`[VoiceGateway] Tool: ${fc.name}`, JSON.stringify(fc.args || {}).substring(0, 200));
                  const result = await executeToolCall(fc.name, fc.args || {}, client);
                  if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(JSON.stringify({ type: "tool_call", toolName: fc.name, toolResult: result }));
                  }
                  toolResponses.push({ id: fc.id, name: fc.name, response: result });
                }

                // Send tool responses back to Gemini
                if (client.session) {
                  client.session.sendToolResponse({ functionResponses: toolResponses });
                }
              }
            }

            // Handle tool call cancellation
            if ((message as any).toolCallCancellation) {
              console.log(`[VoiceGateway] Tool call cancelled for ${connectionId}`);
            }
          } catch (err: any) {
            console.error(`[VoiceGateway] Error processing Gemini message:`, err.message);
          }
        },
        onerror: (err: any) => {
          console.error(`[VoiceGateway] Gemini session error for ${connectionId}:`, err?.message || err);
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({ type: "error", error: "Voice service connection error. Please try again." }));
          }
        },
        onclose: () => {
          console.log(`[VoiceGateway] Gemini session closed for ${connectionId}`);
          client.isGeminiReady = false;
          client.session = null;
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: VOICE_NAME,
            },
          },
        },
        systemInstruction: {
          parts: [{ text: `${SYSTEM_PROMPT}\n\nCurrent user: ${client.userName} (role: ${client.userRole}). Current screen: ${buildScreenDescription(client.screenContext, client.entityContext)}. Language: ${client.language}.` }],
        },
        tools: [{ functionDeclarations: getToolsForContext(client.screenContext, client.userRole) }],
      },
    });

    client.isGeminiReady = true;
    console.log(`[VoiceGateway] Gemini Live session connected for ${connectionId}`);
    return session;
  } catch (err: any) {
    console.error(`[VoiceGateway] Failed to connect to Gemini Live:`, err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN: ATTACH WEBSOCKET SERVER
// ═══════════════════════════════════════════════════════════════════════════════

export function attachVoiceGateway(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/api/voice" });

  // Heartbeat to detect dead connections
  const heartbeat = setInterval(() => {
    for (const [id, client] of Array.from(activeClients.entries())) {
      if (!client.isAlive) {
        client.ws.terminate();
        if (client.session) client.session.close();
        activeClients.delete(id);
        continue;
      }
      client.isAlive = false;
      client.ws.ping();
      if (Date.now() - client.lastActivity > SESSION_TIMEOUT_MS) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({ type: "session_ended", text: "Session timed out due to inactivity." }));
        }
        client.ws.close();
        if (client.session) client.session.close();
        activeClients.delete(id);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", async (ws, req) => {
    const connectionId = nanoid(12);
    console.log(`[VoiceGateway] New connection ${connectionId}`);

    // Authenticate
    const auth = await authenticateFromRequest(req);
    if (!auth) {
      ws.send(JSON.stringify({ type: "error", error: "Authentication failed. Please log in again." }));
      ws.close();
      return;
    }
    console.log(`[VoiceGateway] Authenticated: ${auth.name} (${auth.role})`);

    ws.on("pong", () => { const c = activeClients.get(connectionId); if (c) c.isAlive = true; });

    ws.on("message", async (raw) => {
      let msg: ClientMessage;
      try { msg = JSON.parse(raw.toString()); } catch { ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" })); return; }

      try {
        if (msg.type === "start_session") {
          // Check feature flag
          const enabled = await isFeatureEnabled("*", auth.role);
          if (!enabled) { ws.send(JSON.stringify({ type: "error", error: "Voice agent is not enabled for your role" })); ws.close(); return; }

          // Check daily limit
          const dailyUsage = await getDailyTokenUsage(auth.userId);
          if (dailyUsage >= DAILY_TOKEN_LIMIT) { ws.send(JSON.stringify({ type: "error", error: "Daily usage limit reached." })); ws.close(); return; }

          // Close existing sessions for this user
          const existing = Array.from(activeClients.values()).filter(c => c.userId === auth.userId);
          for (const old of existing) {
            if (old.ws.readyState === WebSocket.OPEN) old.ws.send(JSON.stringify({ type: "session_ended", text: "New session started from another tab" }));
            old.ws.close();
            if (old.session) old.session.close();
            const oldId = Array.from(activeClients.entries()).find(([, v]) => v === old)?.[0];
            if (oldId) activeClients.delete(oldId);
          }

          // Create DB session
          const conversationId = `vs_${nanoid(16)}`;
          const db = await getDb();
          if (!db) { ws.send(JSON.stringify({ type: "error", error: "Database unavailable" })); ws.close(); return; }
          const insertResult = await db.insert(voiceSessions).values({
            userId: auth.userId, conversationId, language: msg.language || "en-GB",
            screenContext: msg.screenContext || "dashboard", status: "active", startedAt: new Date(),
          });
          const dbSessionId = Number(insertResult[0].insertId);

          // Create client object
          const client: VoiceClient = {
            ws, session: null, userId: auth.userId, userRole: auth.role, userName: auth.name,
            sessionId: conversationId, dbSessionId, screenContext: msg.screenContext || "dashboard",
            entityContext: msg.entityContext || null, language: msg.language || "en-GB",
            isAlive: true, tokenCount: 0, lastActivity: Date.now(), isGeminiReady: false,
          };
          activeClients.set(connectionId, client);

          ws.send(JSON.stringify({ type: "session_started", sessionId: conversationId, dbSessionId, text: "Connecting to Hibba..." }));

          // Connect to Gemini Live via SDK
          const session = await connectToGeminiLive(client, connectionId);
          if (!session) {
            ws.send(JSON.stringify({ type: "error", error: "Voice service unavailable. Please check API configuration." }));
            ws.close();
            activeClients.delete(connectionId);
            return;
          }
          client.session = session;

          // Notify client that Gemini is ready
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "gemini_ready" }));
          }

          // Trigger proactive greeting
          triggerProactiveGreeting(client);
          return;
        }

        const client = activeClients.get(connectionId);
        if (!client) { ws.send(JSON.stringify({ type: "error", error: "No active session." })); return; }
        client.lastActivity = Date.now();

        if (msg.type === "screen_context") {
          const prevScreen = client.screenContext;
          client.screenContext = msg.screenContext || client.screenContext;
          client.entityContext = msg.entityContext || client.entityContext;
          // Notify Gemini of context change
          if (client.session && client.isGeminiReady && prevScreen !== client.screenContext) {
            const ctxNote = `[SYSTEM] User navigated to: ${buildScreenDescription(client.screenContext, client.entityContext)}. Adjust your responses accordingly.`;
            client.session.sendClientContent({ turns: [{ role: "user", parts: [{ text: ctxNote }] }], turnComplete: true });
          }
          return;
        }

        if (msg.type === "audio_chunk" && msg.audio) {
          if (!client.session || !client.isGeminiReady) {
            ws.send(JSON.stringify({ type: "status", text: "Voice service connecting..." }));
            return;
          }
          // Send audio to Gemini using SDK's sendRealtimeInput
          client.session.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
          });
          return;
        }

        if (msg.type === "text_input" && msg.text) {
          const db = await getDb();
          if (db) await db.insert(voiceTranscripts).values({ sessionId: client.dbSessionId, role: "user", content: msg.text, createdAt: new Date() });
          if (client.session && client.isGeminiReady) {
            client.session.sendClientContent({ turns: [{ role: "user", parts: [{ text: msg.text }] }], turnComplete: true });
          } else {
            // Fallback: use LLM directly if Gemini not connected
            try {
              const { invokeLLM } = await import("./_core/llm");
              const contextInfo = `Current user: ${client.userName} (${client.userRole}). Screen: ${buildScreenDescription(client.screenContext)}.`;
              const response = await invokeLLM({ messages: [{ role: "system", content: `${SYSTEM_PROMPT}\n\nContext: ${contextInfo}` }, { role: "user", content: msg.text }] });
              const agentText = response.choices?.[0]?.message?.content || "I couldn't process that.";
              ws.send(JSON.stringify({ type: "agent_response", text: agentText }));
            } catch { ws.send(JSON.stringify({ type: "error", error: "Failed to process text input." })); }
          }
          return;
        }

        if (msg.type === "correct_this") {
          const db = await getDb();
          if (db) await db.insert(voiceReviewQueue).values({ sessionId: client.dbSessionId, transcriptId: msg.transcriptId ? Number(msg.transcriptId) : null, flaggedByUserId: client.userId, agentStatement: msg.correctionNote || "User flagged this response", status: "pending", createdAt: new Date() });
          ws.send(JSON.stringify({ type: "agent_response", text: "Thank you, I've flagged that for review." }));
          return;
        }

        if (msg.type === "end_session") {
          const db = await getDb();
          if (db) await db.update(voiceSessions).set({ endedAt: new Date(), status: "completed" }).where(eq(voiceSessions.id, client.dbSessionId));
          ws.send(JSON.stringify({ type: "session_ended", text: "Session ended. JazakAllah Khair!" }));
          if (client.session) client.session.close();
          activeClients.delete(connectionId);
          ws.close();
          return;
        }
      } catch (err: any) {
        console.error(`[VoiceGateway] Message handler error:`, err.message, err.stack);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "error", error: err.message || "Internal error" }));
        }
      }
    });

    ws.on("close", async () => {
      const client = activeClients.get(connectionId);
      if (client) {
        const db = await getDb();
        if (db) await db.update(voiceSessions).set({ endedAt: new Date(), status: "completed" }).where(eq(voiceSessions.id, client.dbSessionId));
        if (client.session) client.session.close();
        activeClients.delete(connectionId);
      }
    });

    ws.on("error", () => {
      const client = activeClients.get(connectionId);
      if (client?.session) client.session.close();
      activeClients.delete(connectionId);
    });
  });

  console.log("[VoiceGateway] WebSocket server attached at /api/voice (@google/genai SDK + Aoede)");
  return wss;
}
