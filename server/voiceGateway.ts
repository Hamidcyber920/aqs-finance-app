/**
 * Voice Gateway — Real-time bidirectional audio streaming via Gemini Live API
 *
 * Architecture:
 * - Client WebSocket <-> Server <-> Gemini Live API WebSocket
 * - Client sends raw PCM audio (16kHz, 16-bit, mono) as base64 chunks
 * - Server relays to Gemini Live API which processes speech and responds with audio
 * - Server relays Gemini's audio response back to client for immediate playback
 * - Tool calls are intercepted, executed locally, and results sent back to Gemini
 */
import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "http";
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
} from "../drizzle/schema";
import { sdk } from "./_core/sdk";

// --- Types ---
interface VoiceClient {
  ws: WebSocket;
  geminiWs: WebSocket | null;
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
  resumptionHandle: string | null;
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

// --- Constants ---
const DAILY_TOKEN_LIMIT = 200_000;
const SOFT_WARNING_THRESHOLD = 0.8;
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_CONCURRENT_SESSIONS_PER_USER = 1;
const GEMINI_LIVE_WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const GEMINI_MODEL = "models/gemini-3.1-flash-live-preview";

const activeClients = new Map<string, VoiceClient>();

// --- Response cache (60s TTL) for frequently-accessed read tools ---
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
- Example: if user says "I paid fifty pounds to the electrician yesterday for maintenance" → extract: amount=50, vendor=electrician, date=yesterday's date, category=maintenance, and call fill_form.
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
- WhatsApp: When asked to send a WhatsApp, FIRST use get_staff_directory or get_trustees to look up the recipient's phone number by name. Then use send_whatsapp with that phone number. This will open WhatsApp directly on the user's device with the message pre-filled — they just tap Send.
- Email: When asked to send an email, FIRST use get_staff_directory or get_trustees to look up the recipient's email address by name. Then use send_email with that email. The email is sent directly via Gmail API — no user action needed. Always include a personalised greeting (Dear [Name], Assalamu Alaikum) and sign off (JazakAllah Khair).
- Bulk Messaging: When asked to email or WhatsApp ALL trustees, ALL staff, or everyone, use bulk_send_email or bulk_send_whatsapp with the group name. Available groups: trustees, staff, managers, all. You can also apply templates: friday_comms, urgent, trustee_update, staff_announcement.
- Fill forms: extract data from voice and populate any form on the user's current page using fill_form tool.
- Navigate users to any section instantly.
- Provide prayer times, mosque info, donation guidance.

BOUNDARIES:
- Never authenticate users. Never handle card data — use Stripe links.
- Never read sensitive data (addresses, bank details, NI numbers) unless explicitly asked.
- Confirm before amounts over £1,000 or destructive actions.
- Respect user roles. If FORBIDDEN, explain politely.

PERMISSIONS:
- Reception: QuickCapture and basic lookups only.
- Donors: own data only. Auditors: read-only.
- Trustees/Superadmin: full access.`;

const TOOL_DECLARATIONS = [
  // --- Core context ---
  { name: "get_current_user", description: "Get the current user's profile, role, and permissions", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_screen_context", description: "Get the current page/screen context the user is viewing", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_current_time", description: "Get the current date and time in UK timezone (Europe/London). Use this before reporting any time or scheduling anything.", parameters: { type: "object", properties: {}, required: [] } },
  // --- People ---
  { name: "get_staff_directory", description: "Get all active staff members with their roles and contact info", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_trustees", description: "Get the list of trustees", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_donor", description: "Get full donor details by ID including giving history", parameters: { type: "object", properties: { donorId: { type: "number", description: "Donor ID" } }, required: ["donorId"] } },
  { name: "search_donors", description: "Search donors by name, email, or phone. Use this when the user mentions a donor by name or wants to find someone.", parameters: { type: "object", properties: { query: { type: "string", description: "Name, email, or phone to search for" }, limit: { type: "number", description: "Max results (default 10)" } }, required: ["query"] } },
  // --- Finance & Transactions ---
  { name: "search_transactions", description: "Search recent expense transactions/receipts", parameters: { type: "object", properties: { limit: { type: "number", description: "Max results" }, category: { type: "string", description: "Filter by category" }, status: { type: "string", description: "Filter by status: pending, approved, rejected" } }, required: [] } },
  { name: "get_income_summary", description: "Get income records summary (Friday collections, donations, rent, etc.)", parameters: { type: "object", properties: { period: { type: "string", description: "Period: today, this_week, this_month, last_month" } }, required: [] } },
  { name: "get_expenses_summary", description: "Get expenses summary for a period", parameters: { type: "object", properties: { period: { type: "string", description: "Period: today, this_week, this_month, last_month" } }, required: [] } },
  { name: "get_loans_summary", description: "Get Qard Hasan (interest-free loans) summary", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_payroll_summary", description: "Get payroll information and scheduled payments", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_bills_utilities", description: "Get utility bills and scheduled payments", parameters: { type: "object", properties: {}, required: [] } },
  // --- Fundraising ---
  { name: "get_fund_balance", description: "Get fund/campaign balance for active campaigns", parameters: { type: "object", properties: { campaignId: { type: "number" } }, required: [] } },
  { name: "get_campaign_status", description: "Get all campaign statuses with amounts raised vs goals", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_pledges", description: "Get pledge commitments and their fulfilment status", parameters: { type: "object", properties: {}, required: [] } },
  // --- Operations ---
  { name: "get_priorities", description: "Get pending approvals, flagged items, and urgent matters", parameters: { type: "object", properties: {}, required: [] } },
  { name: "compose_briefing", description: "Compose a morning briefing with recent activity, pending items, and upcoming events", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_meetings", description: "Get upcoming and recent meetings", parameters: { type: "object", properties: { upcoming: { type: "boolean", description: "True for upcoming, false for past" } }, required: [] } },
  { name: "get_compliance_status", description: "Get compliance actions and their status", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_accommodation", description: "Get student accommodation status, tenants, and rent tracking", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_facilities", description: "Get facilities bookings and status", parameters: { type: "object", properties: {}, required: [] } },
  // --- Actions ---
  { name: "create_donation", description: "Record a new donation", parameters: { type: "object", properties: { donorId: { type: "number" }, amount: { type: "number" }, campaignId: { type: "number" }, paymentMethod: { type: "string" } }, required: ["donorId", "amount"] } },
  { name: "update_donor_profile", description: "Update donor profile fields", parameters: { type: "object", properties: { donorId: { type: "number" }, phone: { type: "string" }, email: { type: "string" }, addressLine1: { type: "string" }, postcode: { type: "string" } }, required: ["donorId"] } },
  { name: "log_communication", description: "Log a communication with a donor", parameters: { type: "object", properties: { donorId: { type: "number" }, channel: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["donorId"] } },
  { name: "create_payment_link", description: "Generate a Stripe payment link for a one-off donation", parameters: { type: "object", properties: { donorId: { type: "number" }, amount: { type: "number" } }, required: ["donorId", "amount"] } },
  { name: "send_email", description: "Send an email immediately. Use this when the user explicitly asks to send (not just draft) an email.", parameters: { type: "object", properties: { to: { type: "string", description: "Recipient email address" }, recipientName: { type: "string", description: "Recipient name" }, subject: { type: "string", description: "Email subject" }, body: { type: "string", description: "Email body (plain text or HTML)" }, donorId: { type: "number", description: "Optional donor ID for logging" } }, required: ["to", "subject", "body"] } },
  { name: "draft_whatsapp", description: "Draft a WhatsApp message (saves to outbox for review)", parameters: { type: "object", properties: { recipientId: { type: "number" }, to: { type: "string" }, body: { type: "string" } }, required: ["body"] } },
  { name: "draft_email", description: "Save an email draft to the outbox for later review (does NOT send immediately)", parameters: { type: "object", properties: { recipientId: { type: "number" }, to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["body"] } },
  { name: "create_task", description: "Create a task or action item for a staff member", parameters: { type: "object", properties: { title: { type: "string", description: "Task title/description" }, owner: { type: "string", description: "Person responsible (name)" }, dueDate: { type: "string", description: "Due date in YYYY-MM-DD format" }, priority: { type: "string", description: "low, medium, high, or critical" }, notes: { type: "string", description: "Additional notes" }, source: { type: "string", description: "Where this task came from" } }, required: ["title"] } },
  { name: "schedule_meeting", description: "Schedule a meeting with attendees", parameters: { type: "object", properties: { title: { type: "string", description: "Meeting title" }, meetingType: { type: "string", description: "Type: trustee_board, finance_committee, safeguarding_committee, building_committee, agm, extraordinary, or staff" }, scheduledAt: { type: "string", description: "Date and time in ISO format (YYYY-MM-DDTHH:mm:ss) in UK time" }, location: { type: "string", description: "Meeting location" }, notes: { type: "string", description: "Meeting notes or agenda summary" }, attendees: { type: "array", items: { type: "number" }, description: "Array of user IDs for attendees" } }, required: ["title", "scheduledAt"] } },
  { name: "generate_report", description: "Generate a financial summary report for a given month", parameters: { type: "object", properties: { year: { type: "number", description: "Year (e.g. 2026)" }, month: { type: "number", description: "Month number (1-12)" }, sendToTrustees: { type: "boolean", description: "Whether to email the report to trustees" } }, required: [] } },
  { name: "flag_for_review", description: "Flag something for Dr. Hamid's review", parameters: { type: "object", properties: { transcriptId: { type: "number" }, note: { type: "string" } }, required: [] } },
  // --- Navigation ---
  { name: "navigate_to", description: "Navigate the user to a specific page in the app. ONLY use paths from this list: /dashboard, /receipts, /reports, /fundraising, /loans, /income, /payroll, /monthly-expenses, /reconciliation, /donors, /donors/:id, /campaigns, /communications, /comms-hub, /comms-inbox, /admin, /trustees, /accommodation, /fintech, /donor-crm, /compliance, /decisions, /gift-aid, /payroll-v3, /meetings, /audit-trail, /system-health, /pledges, /donor-pipeline, /major-donor, /bulk-approvals, /conflicts-register, /recognition-tiers, /qr-codes, /saved-views, /bills-utilities, /training-tracker, /lbmw-correspondence, /trustee-dashboard, /facilities, /bistro87, /donate, /voice-history, /profile, /settings", parameters: { type: "object", properties: { page: { type: "string", description: "Page path from the allowed list above" } }, required: ["page"] } },
  // --- Training ---
  { name: "get_training_summary", description: "Get training records summary: valid, expiring soon, expired certificates for staff. Shows compliance status.", parameters: { type: "object", properties: {}, required: [] } },
  // --- Bistro 87 ---
  { name: "get_bistro_summary", description: "Get Bistro 87 summary: recent orders, daily revenue, menu item count, top sellers.", parameters: { type: "object", properties: {}, required: [] } },
  // --- Conflicts Register ---
  { name: "get_conflicts", description: "Get conflicts of interest register entries.", parameters: { type: "object", properties: { status: { type: "string", description: "Filter: open, resolved, noted, or all (default all)" } }, required: [] } },
  // --- Decisions Register ---
  { name: "get_decisions", description: "Get trustee decisions from meetings.", parameters: { type: "object", properties: { limit: { type: "number", description: "Max results (default 20)" } }, required: [] } },
  // --- LBMW Correspondence ---
  { name: "get_lbmw_correspondence", description: "Get LBMW (Listed Building Maintenance Works) correspondence and planning items.", parameters: { type: "object", properties: {}, required: [] } },
  // --- Comms Inbox ---
  { name: "get_comms_inbox", description: "Get the master inbox: recent communications, outbox items, and unread messages.", parameters: { type: "object", properties: { limit: { type: "number", description: "Max results (default 20)" } }, required: [] } },
  // --- Backups ---
  { name: "get_backups", description: "Get recent system backup history and status.", parameters: { type: "object", properties: {}, required: [] } },
  // --- Donor Notes ---
  { name: "create_donor_note", description: "Create a note on a donor's profile. Use when the user says to add a note about a donor.", parameters: { type: "object", properties: { donorId: { type: "number", description: "Donor ID" }, content: { type: "string", description: "Note content" }, isPinned: { type: "boolean", description: "Pin this note (default false)" } }, required: ["donorId", "content"] } },
  // --- Send WhatsApp ---
  { name: "send_whatsapp", description: "Send a WhatsApp message to a contact. Saves to outbox and attempts delivery.", parameters: { type: "object", properties: { to: { type: "string", description: "Phone number with country code (e.g. +447...)" }, recipientName: { type: "string", description: "Recipient name" }, body: { type: "string", description: "Message text" }, donorId: { type: "number", description: "Optional donor ID for logging" } }, required: ["to", "body"] } },
  // --- Recognition Tiers ---
  { name: "get_recognition_tiers", description: "Get donor recognition tiers and their thresholds.", parameters: { type: "object", properties: {}, required: [] } },
  // --- Gift Aid ---
  { name: "get_gift_aid_summary", description: "Get Gift Aid declarations summary: total claimable, pending claims, recent declarations.", parameters: { type: "object", properties: {}, required: [] } },
  // --- Audit Trail ---
  { name: "get_audit_trail", description: "Get recent audit trail entries showing who did what and when.", parameters: { type: "object", properties: { limit: { type: "number", description: "Max results (default 20)" } }, required: [] } },
  // --- Mosque & Community ---
  { name: "get_prayer_times", description: "Get today's prayer times for Liverpool (Abdullah Quilliam Mosque). Returns Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha start times and jamaat times.", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_donation_info", description: "Get donation methods and bank transfer details for the mosque. Use when someone asks how to donate or about bank transfers.", parameters: { type: "object", properties: {}, required: [] } },
  { name: "get_mosque_info", description: "Get general information about Abdullah Quilliam Mosque and Society", parameters: { type: "object", properties: {}, required: [] } },
  // --- Bulk Messaging ---
  { name: "bulk_send_email", description: "Send the same email to a group of people (all trustees, all staff, or specific names). Emails are personalised with each recipient's name. Use when user says 'email all trustees' or 'send to all staff'.", parameters: { type: "object", properties: { group: { type: "string", description: "Target group: 'trustees', 'staff', 'managers', or 'all'" }, subject: { type: "string", description: "Email subject line" }, body: { type: "string", description: "Email body (plain text). Each email will be personalised with Dear [Name]" }, template: { type: "string", description: "Optional template name: 'friday_comms', 'urgent', 'trustee_update', 'staff_announcement'. If provided, body is inserted into the template." } }, required: ["group", "subject", "body"] } },
  { name: "bulk_send_whatsapp", description: "Prepare WhatsApp messages for a group. Opens WhatsApp links one by one for the user to send. Use when user says 'WhatsApp all trustees' or 'message all staff on WhatsApp'.", parameters: { type: "object", properties: { group: { type: "string", description: "Target group: 'trustees', 'staff', 'managers', or 'all'" }, body: { type: "string", description: "Message text (same for all recipients, personalised with name)" } }, required: ["group", "body"] } },
  { name: "get_email_templates", description: "Get available email templates. Use when user asks about templates or wants to send a formatted communication.", parameters: { type: "object", properties: {}, required: [] } },
  // --- Qarde Hasan & Calendar ---
  { name: "get_qarde_hasan_register", description: "Get Qarde Hasan (interest-free loan) register. Shows active loans, pending applications, repayment status.", parameters: { type: "object", properties: { status: { type: "string", description: "Filter: 'active', 'pending', 'completed', or 'all'. Defaults to 'active'." } }, required: [] } },
  { name: "get_calendar", description: "Get upcoming trustee meetings and events.", parameters: { type: "object", properties: { days: { type: "number", description: "Number of days ahead to look. Default 30." } }, required: [] } },
  { name: "set_user_preference", description: "Set a user preference (language, notification settings, theme).", parameters: { type: "object", properties: { key: { type: "string", description: "Preference key: 'language', 'theme', 'notifications'" }, value: { type: "string", description: "Preference value" } }, required: ["key", "value"] } },
  // --- Form Filling ---
  { name: "fill_form", description: "Fill a form on the user's current page with extracted data. Use this when the user verbally describes data that should go into a form (expense, donation, income, bill, loan, etc). Extract all relevant fields from their speech and pass them as key-value pairs. The frontend will populate the form fields accordingly.", parameters: { type: "object", properties: { fields: { type: "object", description: "Key-value pairs of form field names and their values. Use field names matching the current page context: for receipts use vendor/amount/date/category/paymentMethod/description/department; for income use source/amount/date/type/reference; for donors use name/email/phone/address; for loans use borrowerName/amount/purpose; for bills use supplier/amount/dueDate/category/reference; for monthly-expenses use payee/amount/date/category/reference" }, page: { type: "string", description: "The page the form is on (e.g. /receipts, /income, /donors). If not specified, uses current screen context." }, action: { type: "string", description: "What to do: 'fill' (default, just populate fields) or 'fill_and_confirm' (populate and show confirmation dialog)" } }, required: ["fields"] } },
];

// --- Screen context helper ---
function buildScreenDescription(path: string, entityContext?: string | null): string {
  const SCREEN_DESCRIPTIONS: Record<string, string> = {
    "/": "Scan Receipt — user is scanning or uploading a receipt",
    "/dashboard": "Dashboard — overview of finances, recent activity, and key metrics",
    "/receipts": "My Expenses — personal expense receipts and claims",
    "/reports": "Reports — financial reports and analytics charts",
    "/fundraising": "Fundraising — donation campaigns, fundraising events, and targets",
    "/loans": "Qard Hasan Loans — interest-free Islamic loan applications and repayments",
    "/income": "Income & Rentals — Friday collections, rental income, and other income streams",
    "/accommodation": "Student Accommodation — tenant management, rent tracking, and room assignments",
    "/fintech": "Payment Hub — Stripe payments, bank transfers, and financial integrations",
    "/donor-crm": "Donor CRM — full donor relationship management with history and notes",
    "/gift-aid": "Gift Aid & CRM+ — Gift Aid declarations, HMRC claims, and enhanced CRM features",
    "/pledges": "Pledges — outstanding pledge commitments and fulfilment tracking",
    "/donor-pipeline": "Cultivation Pipeline — major donor prospect pipeline and engagement stages",
    "/major-donor": "Major Donor DD — due diligence records for major donors",
    "/saved-views": "Saved Views — custom saved filters and views across the system",
    "/qr-codes": "QR Codes — donation QR codes for campaigns and events",
    "/recognition-tiers": "Recognition Tiers — donor recognition levels and thresholds",
    "/donors-wall": "Donors Wall — public recognition wall for donors",
    "/payroll": "Payroll — staff payroll management and salary records",
    "/monthly-expenses": "Monthly Expenses — monthly expense tracking and budget management",
    "/reconciliation": "Reconciliation — bank reconciliation and transaction matching",
    "/org-chart": "Org Chart — organisational structure and staff hierarchy",
    "/communications": "Communications — email and messaging centre",
    "/comms-hub": "Comms Hub — centralised communications management",
    "/comms-inbox": "Master Inbox — all incoming communications in one place",
    "/meetings": "Meetings & Onboarding — meeting schedule, minutes, and staff onboarding",
    "/donors": "Donors — full donor database with search, profiles, and history",
    "/campaigns": "Campaigns — fundraising campaign management and tracking",
    "/admin": "Admin Panel — system administration and user management",
    "/trustees": "Trustees & Staff Contacts — trustee board and staff contact directory",
    "/compliance": "Compliance Cockpit — regulatory compliance actions and deadlines",
    "/conflicts-register": "Conflicts Register — trustee conflicts of interest declarations",
    "/decisions": "Decisions Register — trustee meeting decisions and action items",
    "/bulk-approvals": "Bulk Approvals — batch approval queue for pending items",
    "/bills-utilities": "Bills & Utilities — utility bills, supplier contracts, and payment schedules",
    "/training-tracker": "Training Tracker — staff training certificates, expiry dates, and compliance",
    "/lbmw-correspondence": "LBMW Correspondence — Listed Building Maintenance Works planning correspondence",
    "/trustee-dashboard": "Trustee Dashboard — trustee-specific view of governance and finances",
    "/facilities": "Facilities & Bookings — room bookings, hall hire, and facility management",
    "/bistro87": "Bistro 87 — cafe/bistro orders, daily revenue, and menu management",
    "/merge-history": "Merge History — record of merged donor and contact records",
    "/backups": "Backups — system backup history and data export",
    "/audit-trail": "Audit Trail — full log of all system actions and changes",
    "/voice-history": "Voice History — Hibba voice session logs and analytics",
    "/system-health": "System Health — server status, API health, and performance metrics",
    "/settings": "Settings — application settings and preferences",
    "/profile": "Profile — user profile and account settings",
    "/donate": "Donation Page — public-facing donation form",
  };
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

// --- Auth helper ---
async function authenticateFromRequest(req: IncomingMessage): Promise<{ userId: number; role: string; name: string } | null> {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const queryToken = url.searchParams.get("token");
    if (queryToken) {
      const { verifyWsToken } = await import("./wsAuth");
      const result = await verifyWsToken(queryToken);
      if (result) return result;
    }
  } catch {}
  try {
    const fakeReq = { headers: { cookie: req.headers.cookie || "" } } as any;
    const user = await sdk.authenticateRequest(fakeReq);
    if (!user) return null;
    return { userId: user.id, role: user.role, name: user.name || "User" };
  } catch (err: any) {
    console.error(`[VoiceGateway] Auth error:`, err?.message || err);
    return null;
  }
}

// --- Daily token usage ---
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

// --- Log token usage ---
async function logTokenUsage(userId: number, tokensUsed: number, estimatedCostPence: number) {
  const db = await getDb();
  if (!db) return;
  const todayStr = new Date().toISOString().split("T")[0]!;
  await db.insert(voiceCostTracking).values({
    userId,
    date: new Date(),
    tokenCount: tokensUsed,
    estimatedCostPence,
    createdAt: new Date(),
  });
}

// --- Feature flag check ---
async function isFeatureEnabled(flagName: string, userRole?: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return true; // Allow if DB unavailable
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

// --- Role-based tool access control (API-level enforcement, independent of prompt) ---
const TOOL_PERMISSIONS: Record<string, string[]> = {
  // Read tools — broadly available
  get_current_user: ["superadmin", "admin", "trustee", "manager", "staff", "reception", "donor", "auditor"],
  get_screen_context: ["superadmin", "admin", "trustee", "manager", "staff", "reception", "donor", "auditor"],
  get_staff_directory: ["superadmin", "admin", "trustee", "manager", "staff"],
  get_trustees: ["superadmin", "admin", "trustee", "manager", "staff"],
  get_donor: ["superadmin", "admin", "trustee", "manager", "staff", "reception"],
  search_transactions: ["superadmin", "admin", "trustee", "manager", "staff", "auditor"],
  get_fund_balance: ["superadmin", "admin", "trustee", "manager", "staff", "auditor"],
  get_campaign_status: ["superadmin", "admin", "trustee", "manager", "staff", "auditor"],
  get_gift_aid_status: ["superadmin", "admin", "trustee", "manager"],
  get_priorities: ["superadmin", "admin", "trustee", "manager", "staff"],
  get_email_templates: ["superadmin", "admin", "trustee", "manager", "staff"],
  navigate_to: ["superadmin", "admin", "trustee", "manager", "staff", "reception", "donor"],
  // Write tools — restricted
  create_donation: ["superadmin", "admin", "trustee", "manager", "staff", "reception"],
  create_expense: ["superadmin", "admin", "manager", "staff"],
  update_donor_profile: ["superadmin", "admin", "trustee", "manager", "staff", "reception"],
  log_communication: ["superadmin", "admin", "trustee", "manager", "staff"],
  create_task: ["superadmin", "admin", "trustee", "manager", "staff"],
  fill_form: ["superadmin", "admin", "trustee", "manager", "staff", "reception"],
  // Communications — manager+ only for bulk
  send_email: ["superadmin", "admin", "trustee", "manager", "staff"],
  send_whatsapp: ["superadmin", "admin", "trustee", "manager", "staff"],
  bulk_send_email: ["superadmin", "admin", "trustee", "manager"],
  bulk_send_whatsapp: ["superadmin", "admin", "trustee", "manager"],
  // Payment & sensitive
  create_payment_link: ["superadmin", "admin", "trustee", "manager"],
  flag_for_review: ["superadmin", "admin", "trustee", "manager", "staff", "reception"],
  // Qarde Hasan, Calendar, Preferences
  get_qarde_hasan_register: ["superadmin", "admin", "trustee", "manager"],
  get_calendar: ["superadmin", "admin", "trustee", "manager", "staff"],
  set_user_preference: ["superadmin", "admin", "trustee", "manager", "staff", "reception"],
  fill_form: ["superadmin", "admin", "trustee", "manager", "staff", "reception"],
};

function hasToolPermission(toolName: string, userRole: string): boolean {
  const allowed = TOOL_PERMISSIONS[toolName];
  if (!allowed) return true; // Tools not in the map are unrestricted (e.g. new tools)
  return allowed.includes(userRole);
}

// --- Execute tool call ---
async function executeToolCall(toolName: string, args: Record<string, unknown>, client: VoiceClient): Promise<{ status: string; data: unknown; error?: string }> {
  // API-level permission enforcement (independent of prompt)
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
        sessionId: client.dbSessionId,
        toolName,
        params: JSON.stringify(args),
        resultSummary: JSON.stringify(result).substring(0, 500),
        latencyMs,
        success: true,
        createdAt: new Date(),
      });
    }
    return { status: "success", data: result };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    if (db) {
      await db.insert(voiceToolCalls).values({
        sessionId: client.dbSessionId,
        toolName,
        params: JSON.stringify(args),
        resultSummary: err.message || "Error",
        latencyMs,
        success: false,
        createdAt: new Date(),
      });
    }
    return { status: "error", data: null, error: err.message || "Tool execution failed" };
  }
}

// --- Tool routing ---
async function routeToolCall(toolName: string, args: Record<string, unknown>, client: VoiceClient): Promise<unknown> {
  // Check cache for cacheable tools
  if (CACHEABLE_TOOLS.has(toolName)) {
    const cacheKey = `${toolName}:${JSON.stringify(args)}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }
  const db = await getDb();
  if (!db) return { error: "Database connection unavailable" };
  const result = await _routeToolCallInner(toolName, args, client, db);
  // Cache the result if cacheable
  if (CACHEABLE_TOOLS.has(toolName)) {
    const cacheKey = `${toolName}:${JSON.stringify(args)}`;
    setCache(cacheKey, result);
  }
  return result;
}

async function _routeToolCallInner(toolName: string, args: Record<string, unknown>, client: VoiceClient, db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<unknown> {
  switch (toolName) {
    case "get_current_user":
      return { userId: client.userId, role: client.userRole, name: client.userName, language: client.language };
    case "get_screen_context":
      return { screen: client.screenContext, entity: client.entityContext };
    case "get_staff_directory": {
      // Read from the trustees/staff contact directory (source of truth for people)
      const staffRows = await db.select({
        id: trustees.id,
        name: trustees.fullName,
        role: trustees.role,
        email: trustees.email,
        phone: trustees.phone,
      }).from(trustees).where(eq(trustees.isActive, true));
      return staffRows;
    }
    case "get_trustees": {
      // Read from the trustees contact directory — filter for trustee/chair roles
      const trusteeRows = await db.select({
        id: trustees.id,
        name: trustees.fullName,
        role: trustees.role,
        email: trustees.email,
        phone: trustees.phone,
      }).from(trustees).where(
        and(
          eq(trustees.isActive, true),
          or(
            like(trustees.role, "%Trustee%"),
            like(trustees.role, "%Chair%")
          )
        )
      );
      return trusteeRows;
    }
    case "get_donor": {
      const { donors } = await import("../drizzle/schema");
      const donorId = Number(args.donorId);
      if (!donorId) return { error: "donorId required" };
      const result = await db.select().from(donors).where(eq(donors.id, donorId)).limit(1);
      if (!result.length) return { error: "Donor not found" };
      const donor = result[0]!;
      if (client.userRole === "reception") return { id: donor.id, name: donor.name, phone: donor.phone, email: donor.email };
      return donor;
    }
    case "search_donors": {
      const { donors } = await import("../drizzle/schema");
      const query = String(args.query || "").trim();
      if (!query) return { error: "Search query required" };
      const limit = Math.min(Number(args.limit) || 10, 25);
      const searchPattern = `%${query}%`;
      const results = await db.select({
        id: donors.id, name: donors.name, email: donors.email, phone: donors.phone,
        totalGiven: donors.totalGiven, lastGiftDate: donors.lastGiftDate, status: donors.status,
      }).from(donors).where(
        or(like(donors.name, searchPattern), like(donors.email, searchPattern), like(donors.phone, searchPattern))
      ).limit(limit);
      if (!results.length) return { found: 0, message: `No donors found matching "${query}"` };
      return { found: results.length, donors: results };
    }
    case "search_transactions": {
      const { receipts } = await import("../drizzle/schema");
      const limit = Math.min(Number(args.limit) || 20, 50);
      const rows = await db.select().from(receipts).orderBy(desc(receipts.createdAt)).limit(limit);
      return { count: rows.length, transactions: rows };
    }
    case "get_fund_balance": {
      const { fundraisingCampaigns } = await import("../drizzle/schema");
      const campaigns = await db.select().from(fundraisingCampaigns).where(eq(fundraisingCampaigns.isActive, true));
      return { activeFunds: campaigns.length, campaigns: campaigns.map(c => ({ id: c.id, name: c.name, goal: c.targetAmount, raised: c.currentAmount })) };
    }
    case "get_campaign_status": {
      const { fundraisingCampaigns } = await import("../drizzle/schema");
      const campaigns = await db.select().from(fundraisingCampaigns);
      return campaigns.map(c => ({ id: c.id, name: c.name, goal: c.targetAmount, raised: c.currentAmount, isActive: c.isActive }));
    }
    case "get_priorities": {
      const { receipts } = await import("../drizzle/schema");
      const pending = await db.select().from(receipts).where(eq(receipts.status, "pending")).limit(20);
      return { pendingApprovals: pending.length, items: pending };
    }
    case "create_donation": {
      const { fundraisingDonations } = await import("../drizzle/schema");
      const donorId = Number(args.donorId);
      const amount = Number(args.amount);
      if (!donorId || !amount) return { error: "donorId and amount required" };
      if (amount <= 0) return { error: "Amount must be positive" };
      if (amount >= 100000) return { error: "Amount exceeds limit - requires manual confirmation" };
      await db.insert(fundraisingDonations).values({ donorLeadId: donorId, campaignId: args.campaignId ? Number(args.campaignId) : 0, donorName: String(args.donorName || "Voice Agent"), amount: String(amount), paymentMethod: (args.paymentMethod || "cash") as any, donatedAt: new Date(), createdAt: new Date() } as any);
      return { success: true, donorId, amount };
    }
    case "update_donor_profile": {
      const { donors } = await import("../drizzle/schema");
      const donorId = Number(args.donorId);
      if (!donorId) return { error: "donorId required" };
      const allowedFields: Record<string, string[]> = { reception: ["phone", "email"], staff: ["phone", "email", "addressLine1", "addressLine2", "city", "postcode"], manager: ["phone", "email", "addressLine1", "addressLine2", "city", "postcode"], trustee: ["phone", "email", "addressLine1", "addressLine2", "city", "postcode"], superadmin: ["*"] };
      const permitted = allowedFields[client.userRole] || [];
      const updates: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(args)) { if (key === "donorId") continue; if (permitted.includes("*") || permitted.includes(key)) updates[key] = val; }
      if (Object.keys(updates).length === 0) return { error: "No permitted fields to update for your role" };
      await db.update(donors).set(updates as any).where(eq(donors.id, donorId));
      return { success: true, updatedFields: Object.keys(updates) };
    }
    case "log_communication": {
      const { donorCommsLog } = await import("../drizzle/schema");
      await db.insert(donorCommsLog).values({ donorId: Number(args.donorId), type: "manual_note", channel: (args.channel as any) || "system", subject: String(args.subject || "Voice agent interaction"), notes: String(args.body || ""), sentByUserId: client.userId, createdAt: new Date() });
      return { success: true };
    }
    case "create_payment_link":
      return { status: "payment_link_ready", suggestedUrl: `/pay?donorId=${args.donorId}&amount=${args.amount}` };
    case "send_email": {
      const toEmail = String(args.to || "").trim();
      const subject = String(args.subject || "").trim();
      const body = String(args.body || "").trim();
      const recipientName = String(args.recipientName || "Recipient");
      if (!toEmail || !subject || !body) return { error: "to, subject, and body are all required" };
      try {
        // Use Gmail API with OAuth2 (same pattern as commsInbox)
        const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
        const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
        const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
        const GMAIL_FROM_EMAIL = process.env.GMAIL_FROM_EMAIL;
        if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_FROM_EMAIL) {
          return { error: "Gmail credentials not configured. Please set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_FROM_EMAIL in Settings > Secrets." };
        }
        // Get access token via refresh
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GMAIL_CLIENT_ID,
            client_secret: GMAIL_CLIENT_SECRET,
            refresh_token: GMAIL_REFRESH_TOKEN,
            grant_type: "refresh_token",
          }),
        });
        if (!tokenRes.ok) return { error: "Failed to refresh Gmail access token. Please check credentials." };
        const { access_token } = await tokenRes.json() as { access_token: string };
        // Build RFC 2822 email with HTML body
        const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <p>Dear ${recipientName},</p>
          <p>Assalamu Alaikum,</p>
          ${body.includes("<") ? body : `<p>${body.replace(/\n/g, "</p><p>")}</p>`}
          <p>JazakAllah Khair</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="font-size:12px;color:#888">Sent via Hibba Voice Assistant on behalf of ${client.userName} &middot; Abdullah Quilliam Society</p>
        </div>`;
        const rawMessage = [
          `From: "Abdullah Quilliam Society" <${GMAIL_FROM_EMAIL}>`,
          `To: ${recipientName} <${toEmail}>`,
          `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
          `MIME-Version: 1.0`,
          `Content-Type: text/html; charset=UTF-8`,
          ``,
          htmlBody,
        ].join("\r\n");
        const encodedMessage = Buffer.from(rawMessage).toString("base64url");
        // Send via Gmail API
        const sendRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ raw: encodedMessage }),
          }
        );
        if (!sendRes.ok) {
          const errBody = await sendRes.text();
          return { error: `Gmail API error: ${errBody}` };
        }
        // Log to donor comms if donorId provided
        if (args.donorId) {
          const { donorCommsLog } = await import("../drizzle/schema");
          await db.insert(donorCommsLog).values({ donorId: Number(args.donorId), type: "email_sent", channel: "email", subject, notes: `Sent via voice agent to ${toEmail} by ${client.userName}`, sentByUserId: client.userId, createdAt: new Date() });
        }
        // Save to comms outbox for record
        const { commsOutbox } = await import("../drizzle/schema");
        await db.insert(commsOutbox).values({ recipientGroup: "individual", recipientIds: [Number(args.donorId) || 0], subject, body: htmlBody, type: "email", status: "sent", sentByUserId: client.userId, createdAt: new Date() });
        return { success: true, message: `Email sent successfully to ${recipientName} (${toEmail})` };
      } catch (err: any) {
        return { error: `Failed to send email: ${err.message}` };
      }
    }
    case "navigate_to": {
      const page = String(args.page || "/dashboard").trim();
      // Send navigation command to the client
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: "navigate", path: page }));
      }
      // Update client's screen context so future responses are contextually relevant
      client.screenContext = page;
      // Send a proactive context note to Gemini so she can give a brief spoken summary
      // after the tool response is processed
      if (client.geminiWs && client.geminiWs.readyState === WebSocket.OPEN) {
        const screenDesc = buildScreenDescription(page, null);
        const proactiveNote = `[NAVIGATION COMPLETE] You just navigated the user to: ${screenDesc}. In your next spoken response, give a very brief 1-sentence summary of what this section is for and offer to help. Keep it under 20 words. Do not say "I navigated you" — just describe the section naturally.`;
        setTimeout(() => {
          if (client.geminiWs && client.geminiWs.readyState === WebSocket.OPEN) {
            client.geminiWs.send(JSON.stringify({ realtimeInput: { text: proactiveNote } }));
          }
        }, 500); // small delay to let the tool response be processed first
      }
      return { success: true, message: `Navigating to ${page}` };
    }
    case "draft_whatsapp":
    case "draft_email": {
      const { commsOutbox } = await import("../drizzle/schema");
      await db.insert(commsOutbox).values({ recipientGroup: "individual", recipientIds: [Number(args.recipientId) || 0], subject: String(args.subject || ""), body: String(args.body || ""), type: toolName === "draft_whatsapp" ? "sms" : "email", status: "queued", sentByUserId: client.userId, createdAt: new Date() });
      return { success: true, status: "draft_saved" };
    }
    case "compose_briefing": {
      const { receipts, fundraisingCampaigns } = await import("../drizzle/schema");
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const recentReceipts = await db.select().from(receipts).where(gte(receipts.createdAt, yesterday)).limit(10);
      const activeCampaigns = await db.select().from(fundraisingCampaigns).where(eq(fundraisingCampaigns.isActive, true));
      return { date: new Date().toLocaleDateString("en-GB"), recentTransactions: recentReceipts.length, activeCampaigns: activeCampaigns.map(c => ({ name: c.name, raised: c.currentAmount, goal: c.targetAmount })) };
    }
    case "flag_for_review": {
      await db.insert(voiceReviewQueue).values({ sessionId: client.dbSessionId, transcriptId: args.transcriptId ? Number(args.transcriptId) : null, flaggedByUserId: client.userId, agentStatement: String(args.note || "Flagged by user via voice"), status: "pending", createdAt: new Date() });
      return { success: true, note: "Flagged for Dr. Hamid's review" };
    }
    case "create_task": {
      const { complianceActions } = await import("../drizzle/schema");
      const title = String(args.title || "").trim();
      if (!title) return { error: "Task title is required" };
      const owner = String(args.owner || client.userName).trim();
      const priority = ["low", "medium", "high", "critical"].includes(String(args.priority || "")) ? String(args.priority) : "medium";
      const dueDate = args.dueDate ? new Date(String(args.dueDate)) : null;
      const insertResult = await db.insert(complianceActions).values({
        title,
        owner,
        source: String(args.source || "voice agent"),
        priority,
        dueDate: dueDate && !isNaN(dueDate.getTime()) ? dueDate : null,
        notes: args.notes ? String(args.notes) : `Created via voice by ${client.userName}`,
        status: "open",
        createdByUserId: client.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const taskId = Number(insertResult[0].insertId);
      return { success: true, taskId, title, owner, priority, dueDate: dueDate?.toISOString() || null };
    }
    case "schedule_meeting": {
      const { trusteeMeetings } = await import("../drizzle/schema");
      const title = String(args.title || "").trim();
      if (!title) return { error: "Meeting title is required" };
      const scheduledAt = new Date(String(args.scheduledAt || ""));
      if (isNaN(scheduledAt.getTime())) return { error: "Valid date/time is required for scheduledAt" };
      const validTypes = ["trustee_board", "finance_committee", "safeguarding_committee", "building_committee", "agm", "extraordinary", "staff"];
      const meetingType = validTypes.includes(String(args.meetingType || "")) ? String(args.meetingType) as any : "staff";
      const insertResult = await db.insert(trusteeMeetings).values({
        title,
        meetingType,
        scheduledAt,
        location: args.location ? String(args.location) : null,
        notes: args.notes ? String(args.notes) : null,
        attendees: args.attendees || null,
        status: "scheduled",
        createdByUserId: client.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const meetingId = Number(insertResult[0].insertId);
      // Navigate user to meetings page
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: "navigate", path: "/meetings" }));
      }
      return { success: true, meetingId, title, scheduledAt: scheduledAt.toISOString(), meetingType, location: args.location || null };
    }
    case "generate_report": {
      const { receipts, fundraisingCampaigns } = await import("../drizzle/schema");
      // Default to current month if not specified
      const now = new Date();
      const year = Number(args.year) || now.getFullYear();
      const month = Number(args.month) || (now.getMonth() + 1);
      const monthName = new Date(year, month - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
      // Gather summary data
      const from = new Date(year, month - 1, 1);
      const to = new Date(year, month, 0, 23, 59, 59);
      const expenseRows = await db.select().from(receipts).where(and(gte(receipts.createdAt, from))).limit(100);
      const activeCampaigns = await db.select().from(fundraisingCampaigns).where(eq(fundraisingCampaigns.isActive, true));
      const totalExpenses = expenseRows.reduce((sum, r) => sum + Number(r.totalAmount || 0), 0);
      const totalRaised = activeCampaigns.reduce((sum, c) => sum + Number(c.currentAmount || 0), 0);
      // Navigate user to reports page
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: "navigate", path: "/reports" }));
      }
      return {
        success: true,
        period: monthName,
        summary: {
          totalExpenses: `£${totalExpenses.toFixed(2)}`,
          transactionCount: expenseRows.length,
          activeCampaigns: activeCampaigns.length,
          totalRaised: `£${totalRaised.toFixed(2)}`,
          campaigns: activeCampaigns.map(c => ({ name: c.name, raised: `£${Number(c.currentAmount || 0).toFixed(2)}`, goal: `£${Number(c.targetAmount || 0).toFixed(2)}` })),
        },
        note: "For a full PDF report, please use the Reports page.",
      };
    }
    case "get_current_time": {
      const now = new Date();
      const ukTime = now.toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const ukDate = now.toLocaleDateString("en-GB", { timeZone: "Europe/London" });
      const isDST = now.toLocaleString("en-GB", { timeZone: "Europe/London", timeZoneName: "short" }).includes("BST");
      return { currentTime: ukTime, date: ukDate, timezone: isDST ? "BST (UTC+1)" : "GMT (UTC+0)", isoUk: now.toISOString() };
    }
    case "get_income_summary": {
      const { incomeRecords } = await import("../drizzle/schema");
      const period = String(args.period || "this_month");
      const now = new Date();
      let from: Date;
      if (period === "today") { from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
      else if (period === "this_week") { from = new Date(now); from.setDate(from.getDate() - 7); }
      else if (period === "last_month") { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); }
      else { from = new Date(now.getFullYear(), now.getMonth(), 1); }
      const rows = await db.select().from(incomeRecords).where(gte(incomeRecords.createdAt, from)).orderBy(desc(incomeRecords.createdAt)).limit(50);
      const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      return { period, recordCount: rows.length, totalIncome: `£${total.toFixed(2)}`, records: rows.slice(0, 20).map(r => ({ id: r.id, category: (r as any).category || "general", amount: `£${Number(r.amount || 0).toFixed(2)}`, date: r.createdAt })) };
    }
    case "get_expenses_summary": {
      const { receipts } = await import("../drizzle/schema");
      const period = String(args.period || "this_month");
      const now = new Date();
      let from: Date;
      if (period === "today") { from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
      else if (period === "this_week") { from = new Date(now); from.setDate(from.getDate() - 7); }
      else if (period === "last_month") { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); }
      else { from = new Date(now.getFullYear(), now.getMonth(), 1); }
      const rows = await db.select().from(receipts).where(gte(receipts.createdAt, from)).orderBy(desc(receipts.createdAt)).limit(50);
      const total = rows.reduce((sum, r) => sum + Number(r.totalAmount || 0), 0);
      const pending = rows.filter(r => r.status === "pending").length;
      const approved = rows.filter(r => r.status === "approved").length;
      return { period, recordCount: rows.length, totalExpenses: `£${total.toFixed(2)}`, pending, approved, recentExpenses: rows.slice(0, 10).map(r => ({ id: r.id, vendor: r.vendor, amount: `£${Number(r.totalAmount || 0).toFixed(2)}`, status: r.status, date: r.createdAt })) };
    }
    case "get_loans_summary": {
      const { loanApplications } = await import("../drizzle/schema");
      const rows = await db.select().from(loanApplications).orderBy(desc(loanApplications.createdAt)).limit(30);
      const active = rows.filter(r => r.status === "active" || r.status === "approved");
      const totalOutstanding = active.reduce((sum, r) => sum + Number((r as any).remainingBalance || (r as any).amount || 0), 0);
      return { totalLoans: rows.length, activeLoans: active.length, totalOutstanding: `£${totalOutstanding.toFixed(2)}`, loans: active.slice(0, 10).map(l => ({ id: l.id, applicant: (l as any).applicantName || "Unknown", amount: `£${Number((l as any).amount || 0).toFixed(2)}`, status: l.status })) };
    }
    case "get_payroll_summary": {
      const { payrollV2 } = await import("../drizzle/schema");
      const rows = await db.select().from(payrollV2).orderBy(desc(payrollV2.createdAt)).limit(30);
      const totalMonthly = rows.filter(r => r.status === "approved" || r.status === "paid").reduce((sum, r) => sum + Number((r as any).netPay || (r as any).grossPay || 0), 0);
      return { staffCount: rows.length, totalMonthlyPayroll: `£${totalMonthly.toFixed(2)}`, entries: rows.slice(0, 10).map(p => ({ id: p.id, employee: (p as any).employeeName || "Staff", grossPay: `£${Number((p as any).grossPay || 0).toFixed(2)}`, status: p.status })) };
    }
    case "get_bills_utilities": {
      const { utilityBills, scheduledPayments } = await import("../drizzle/schema");
      const bills = await db.select().from(utilityBills).orderBy(desc(utilityBills.createdAt)).limit(20);
      const scheduled = await db.select().from(scheduledPayments).limit(20);
      return { billCount: bills.length, scheduledPaymentCount: scheduled.length, recentBills: bills.slice(0, 10).map(b => ({ id: b.id, provider: (b as any).provider || (b as any).accountName || "Unknown", amount: `£${Number((b as any).amount || 0).toFixed(2)}`, status: (b as any).status || "pending", dueDate: (b as any).dueDate })), scheduledPayments: scheduled.slice(0, 10).map(s => ({ id: s.id, description: (s as any).description || (s as any).payee || "Payment", amount: `£${Number((s as any).amount || 0).toFixed(2)}`, nextDate: (s as any).nextPaymentDate })) };
    }
    case "get_pledges": {
      const { pledges } = await import("../drizzle/schema");
      const rows = await db.select().from(pledges).orderBy(desc(pledges.createdAt)).limit(30);
      const totalPledged = rows.reduce((sum, r) => sum + Number((r as any).amount || 0), 0);
      const totalPaid = rows.reduce((sum, r) => sum + Number((r as any).paidAmount || 0), 0);
      return { totalPledges: rows.length, totalPledged: `£${totalPledged.toFixed(2)}`, totalPaid: `£${totalPaid.toFixed(2)}`, outstanding: `£${(totalPledged - totalPaid).toFixed(2)}`, pledges: rows.slice(0, 10).map(p => ({ id: p.id, donor: (p as any).donorName || "Anonymous", amount: `£${Number((p as any).amount || 0).toFixed(2)}`, paid: `£${Number((p as any).paidAmount || 0).toFixed(2)}`, status: (p as any).status })) };
    }
    case "get_meetings": {
      const { trusteeMeetings } = await import("../drizzle/schema");
      const upcoming = args.upcoming !== false;
      const now = new Date();
      let rows;
      if (upcoming) {
        rows = await db.select().from(trusteeMeetings).where(gte(trusteeMeetings.scheduledAt, now)).orderBy(trusteeMeetings.scheduledAt).limit(10);
      } else {
        rows = await db.select().from(trusteeMeetings).orderBy(desc(trusteeMeetings.scheduledAt)).limit(10);
      }
      return { type: upcoming ? "upcoming" : "recent", count: rows.length, meetings: rows.map(m => ({ id: m.id, title: m.title, type: m.meetingType, date: m.scheduledAt?.toLocaleString("en-GB", { timeZone: "Europe/London" }), location: m.location, status: m.status })) };
    }
    case "get_compliance_status": {
      const { complianceActions } = await import("../drizzle/schema");
      const rows = await db.select().from(complianceActions).orderBy(desc(complianceActions.createdAt)).limit(30);
      const open = rows.filter(r => r.status === "open");
      const overdue = open.filter(r => r.dueDate && new Date(r.dueDate) < new Date());
      return { total: rows.length, open: open.length, overdue: overdue.length, actions: open.slice(0, 10).map(a => ({ id: a.id, title: a.title, owner: a.owner, priority: a.priority, dueDate: a.dueDate, status: a.status })) };
    }
    case "get_accommodation": {
      try {
        const { facilityRooms, facilityBookings } = await import("../drizzle/schema");
        const rooms = await db.select().from(facilityRooms).limit(30);
        const bookings = await db.select().from(facilityBookings).orderBy(desc(facilityBookings.createdAt)).limit(20);
        return { roomCount: rooms.length, bookingCount: bookings.length, rooms: rooms.slice(0, 10).map(r => ({ id: r.id, name: (r as any).name || "Room", status: (r as any).status || "available" })), recentBookings: bookings.slice(0, 5).map(b => ({ id: b.id, room: (b as any).roomName || "Room", tenant: (b as any).tenantName || "Tenant", status: (b as any).status })) };
      } catch { return { error: "Accommodation data not available" }; }
    }
    case "get_facilities": {
      try {
        const { facilityRooms, facilityBookings } = await import("../drizzle/schema");
        const rooms = await db.select().from(facilityRooms).limit(30);
        const bookings = await db.select().from(facilityBookings).where(gte(facilityBookings.createdAt, new Date(Date.now() - 30 * 86400000))).limit(20);
        return { totalRooms: rooms.length, recentBookings: bookings.length, rooms: rooms.map(r => ({ id: r.id, name: (r as any).name || "Room", capacity: (r as any).capacity, hourlyRate: (r as any).hourlyRate })) };
      } catch { return { error: "Facilities data not available" }; }
    }
    case "get_prayer_times": {
      try {
        const today = new Date();
        const dateStr = `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${today.getFullYear()}`;
        const resp = await fetch(`https://api.aladhan.com/v1/timingsByCity/${dateStr}?city=Liverpool&country=United+Kingdom&method=15`);
        const data: any = await resp.json();
        if (data.code === 200 && data.data?.timings) {
          const t = data.data.timings;
          return {
            date: data.data.date?.readable || dateStr,
            startTimes: { fajr: t.Fajr, sunrise: t.Sunrise, dhuhr: t.Dhuhr, asr: t.Asr, maghrib: t.Maghrib, isha: t.Isha },
            jamaatTimes: {
              fajr: "Check mosque notice board (typically 15-20 min after start)",
              dhuhr: "1:30 PM (fixed)",
              asr: "Check mosque notice board (typically 30 min after start)",
              maghrib: "At start time (or 5 min after)",
              isha: "Check mosque notice board (typically 15-30 min after start)",
            },
            note: "Jamaat times are set by the mosque and may vary. Call 0151 260 3986 for confirmation.",
            hijriDate: data.data.date?.hijri ? `${data.data.date.hijri.day} ${data.data.date.hijri.month?.en} ${data.data.date.hijri.year}` : null,
          };
        }
        return { error: "Could not fetch prayer times. Please try again later." };
      } catch (err: any) {
        return { error: `Prayer times unavailable: ${err.message}` };
      }
    }
    case "get_donation_info": {
      return {
        methods: [
          { method: "Online (Donorbox)", description: "Set up regular monthly donations via theaqs.org", url: "https://theaqs.org", note: "Best for recurring donations. Supports card payments." },
          { method: "Bank Transfer (reduces fees)", details: { accountName: "Abdullah Quilliam Society", accountNumber: "01158945", sortCode: "40-29-28" }, note: "After transferring, call 0151 260 3986 to confirm your donation." },
          { method: "Stripe Payment Link", description: "One-off donations via payment link. Ask me to generate one.", note: "Suitable for one-time gifts." },
          { method: "Cash", description: "Donate in person at the mosque", note: "A receipt will be provided." },
        ],
        friendsOfAQS: { description: "Join 100+ monthly supporters helping preserve Britain's first mosque", url: "https://theaqs.org" },
        charityNumber: "1194942",
        phone: "0151 260 3986",
      };
    }
    case "get_mosque_info": {
      return {
        name: "Abdullah Quilliam Mosque & National Heritage Centre",
        fullName: "Abdullah Quilliam Society",
        charityNumber: "1194942",
        address: "Brougham Terrace, Liverpool",
        phone: "0151 260 3986",
        internationalPhone: "+44 151 260 3986",
        websites: { heritage: "abdullahquilliam.org", operations: "theaqs.org" },
        chair: "Galib Khan",
        history: "Founded by Abdullah Quilliam in 1887. Britain's first mosque. Originally established by William Henry Quilliam, a Liverpool solicitor who embraced Islam after visiting Morocco.",
        services: ["Daily prayers (5 times)", "Jummah (Friday prayer)", "Islamic education", "Heritage tours", "Community events", "Student accommodation", "Bistro87 cafe"],
        bankDetails: { accountName: "Abdullah Quilliam Society", accountNumber: "01158945", sortCode: "40-29-28" },
      };
    }
    case "get_training_summary": {
      const { trainingRecords } = await import("../drizzle/schema");
      const rows = await db.select().from(trainingRecords).orderBy(desc(trainingRecords.createdAt)).limit(50);
      const now = new Date();
      const thirtyDays = new Date(now.getTime() + 30 * 86400000);
      const valid = rows.filter(r => r.status === "completed" && (!r.expiresAt || new Date(r.expiresAt) > thirtyDays));
      const expiringSoon = rows.filter(r => r.status === "completed" && r.expiresAt && new Date(r.expiresAt) <= thirtyDays && new Date(r.expiresAt) > now);
      const expired = rows.filter(r => r.status === "expired" || (r.expiresAt && new Date(r.expiresAt) <= now));
      return { total: rows.length, valid: valid.length, expiringSoon: expiringSoon.length, expired: expired.length, urgentExpiring: expiringSoon.slice(0, 5).map(r => ({ id: r.id, staffName: r.userName || "Staff", module: r.module, expiresAt: r.expiresAt })) };
    }
    case "get_bistro_summary": {
      const { bistroOrders, bistroMenuItems } = await import("../drizzle/schema");
      const orders = await db.select().from(bistroOrders).orderBy(desc(bistroOrders.createdAt)).limit(30);
      const menuItems = await db.select().from(bistroMenuItems).limit(50);
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayOrders = orders.filter(o => o.createdAt && new Date(o.createdAt) >= todayStart);
      const todayRevenue = todayOrders.reduce((sum, o) => sum + Number((o as any).total || 0), 0);
      return { totalMenuItems: menuItems.length, todayOrders: todayOrders.length, todayRevenue: `\u00a3${todayRevenue.toFixed(2)}`, recentOrders: orders.slice(0, 5).map(o => ({ id: o.id, ref: (o as any).orderRef, total: `\u00a3${Number((o as any).total || 0).toFixed(2)}`, status: (o as any).status, date: o.createdAt })) };
    }
    case "get_conflicts": {
      const { conflictsOfInterest } = await import("../drizzle/schema");
      const statusFilter = String(args.status || "all");
      let rows;
      if (statusFilter !== "all") {
        rows = await db.select().from(conflictsOfInterest).where(eq(conflictsOfInterest.status, statusFilter as any)).orderBy(desc(conflictsOfInterest.createdAt)).limit(30);
      } else {
        rows = await db.select().from(conflictsOfInterest).orderBy(desc(conflictsOfInterest.createdAt)).limit(30);
      }
      return { total: rows.length, conflicts: rows.map(c => ({ id: c.id, trusteeName: (c as any).trusteeName, description: (c as any).description, status: c.status, createdAt: c.createdAt })) };
    }
    case "get_decisions": {
      const { trusteeDecisions } = await import("../drizzle/schema");
      const limit = Math.min(Number(args.limit) || 20, 50);
      const rows = await db.select().from(trusteeDecisions).orderBy(desc(trusteeDecisions.createdAt)).limit(limit);
      return { total: rows.length, decisions: rows.map(d => ({ id: d.id, title: (d as any).title || (d as any).decision, meetingId: (d as any).meetingId, status: (d as any).status, owner: (d as any).owner, dueDate: (d as any).dueDate, createdAt: d.createdAt })) };
    }
    case "get_lbmw_correspondence": {
      try {
        const { lbmwCorrespondence } = await import("../drizzle/schema");
        const rows = await db.select().from(lbmwCorrespondence).orderBy(desc(lbmwCorrespondence.createdAt)).limit(20);
        return { total: rows.length, items: rows.map(r => ({ id: r.id, subject: (r as any).subject || (r as any).title, type: (r as any).type, status: (r as any).status, date: r.createdAt })) };
      } catch { return { error: "LBMW correspondence data not available" }; }
    }
    case "get_comms_inbox": {
      const { commsOutbox } = await import("../drizzle/schema");
      const limit = Math.min(Number(args.limit) || 20, 50);
      const rows = await db.select().from(commsOutbox).orderBy(desc(commsOutbox.createdAt)).limit(limit);
      return { total: rows.length, messages: rows.map(m => ({ id: m.id, subject: (m as any).subject, type: (m as any).type, status: (m as any).status, recipientGroup: (m as any).recipientGroup, sentAt: (m as any).sentAt, createdAt: m.createdAt })) };
    }
    case "get_backups": {
      try {
        const { systemBackups } = await import("../drizzle/schema");
        const rows = await db.select().from(systemBackups).orderBy(desc(systemBackups.createdAt)).limit(10);
        return { total: rows.length, backups: rows.map(b => ({ id: b.id, triggeredBy: (b as any).triggeredBy, status: (b as any).status, fileSize: (b as any).fileSize, createdAt: b.createdAt })) };
      } catch { return { error: "Backup data not available" }; }
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
      // Normalize phone number for wa.me link
      let waPhone = to.replace(/[^0-9+]/g, "");
      if (waPhone.startsWith("0")) waPhone = "44" + waPhone.slice(1);
      if (waPhone.startsWith("+")) waPhone = waPhone.slice(1);
      const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(body)}`;
      // Send open_url command to frontend so WhatsApp opens directly on user's device
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: "open_url", url: waUrl, label: `WhatsApp to ${args.recipientName || to}` }));
      }
      // Save to outbox as SMS/WhatsApp
      await db.insert(commsOutbox).values({ recipientGroup: "individual", recipientIds: [Number(args.donorId) || 0], subject: `WhatsApp to ${args.recipientName || to}`, body, type: "sms", status: "sent", sentByUserId: client.userId, createdAt: new Date() });
      // Log to donor comms if donorId provided
      if (args.donorId) {
        const { donorCommsLog } = await import("../drizzle/schema");
        await db.insert(donorCommsLog).values({ donorId: Number(args.donorId), type: "whatsapp_sent", channel: "whatsapp", subject: `WhatsApp message`, notes: body, sentByUserId: client.userId, createdAt: new Date() });
      }
      return { success: true, message: `WhatsApp opened for ${args.recipientName || to}. Just tap Send!` };
    }
    case "get_recognition_tiers": {
      try {
        const { recognitionTiers } = await import("../drizzle/schema");
        const rows = await db.select().from(recognitionTiers).orderBy(recognitionTiers.minAmount).limit(20);
        return { total: rows.length, tiers: rows.map(t => ({ id: t.id, name: (t as any).name || (t as any).tierName, minAmount: (t as any).minAmount, maxAmount: (t as any).maxAmount, benefits: (t as any).benefits })) };
      } catch { return { error: "Recognition tiers data not available" }; }
    }
    case "get_gift_aid_summary": {
      const { giftAidDeclarations } = await import("../drizzle/schema");
      const rows = await db.select().from(giftAidDeclarations).orderBy(desc(giftAidDeclarations.createdAt)).limit(50);
      const active = rows.filter(r => (r as any).status === "active" || (r as any).isActive);
      return { totalDeclarations: rows.length, activeDeclarations: active.length, recentDeclarations: rows.slice(0, 10).map(d => ({ id: d.id, donorId: (d as any).donorId || (d as any).donorLeadId, status: (d as any).status, startDate: (d as any).startDate, createdAt: d.createdAt })) };
    }
    case "get_audit_trail": {
      try {
        const { auditLog } = await import("../drizzle/schema");
        const limit = Math.min(Number(args.limit) || 20, 50);
        const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
        return { total: rows.length, entries: rows.map(a => ({ id: a.id, action: (a as any).action, entity: (a as any).entityType || (a as any).entity, entityId: (a as any).entityId, userId: (a as any).userId, userName: (a as any).userName, details: (a as any).details, createdAt: a.createdAt })) };
      } catch { return { error: "Audit trail data not available" }; }
    }
    case "get_qarde_hasan_register": {
      const { loanApplications } = await import("../drizzle/schema");
      const statusFilter = String(args.status || "active").toLowerCase();
      let loans;
      if (statusFilter === "all") {
        loans = await db.select().from(loanApplications).orderBy(desc(loanApplications.createdAt)).limit(50);
      } else {
        loans = await db.select().from(loanApplications).where(eq(loanApplications.status, statusFilter as any)).orderBy(desc(loanApplications.createdAt)).limit(50);
      }
      return { total: loans.length, loans: loans.map(l => ({ id: l.id, borrower: l.borrowerName, amount: l.amountRequested, status: l.status, purpose: l.purpose, monthlyRepayment: l.monthlyRepayment, createdAt: l.createdAt })) };
    }
    case "get_calendar": {
      const { trusteeMeetings } = await import("../drizzle/schema");
      const daysAhead = Number(args.days) || 30;
      const now = new Date();
      const future = new Date(now.getTime() + daysAhead * 86400000);
      const meetings = await db.select().from(trusteeMeetings).where(and(gte(trusteeMeetings.meetingDate, now), sql`${trusteeMeetings.meetingDate} <= ${future}`)).orderBy(trusteeMeetings.meetingDate).limit(20);
      return { upcoming: meetings.length, meetings: meetings.map(m => ({ id: m.id, date: m.meetingDate, type: (m as any).meetingType || "trustee", location: (m as any).location, agenda: (m as any).agenda })) };
    }
    case "set_user_preference": {
      const key = String(args.key || "").trim();
      const value = String(args.value || "").trim();
      if (!key) return { error: "Preference key is required" };
      // Store in user session for now (could persist to DB later)
      if (key === "language") client.language = value;
      return { success: true, key, value, note: "Preference updated for this session" };
    }
     case "fill_form": {
      // Send form fill command to the client WebSocket
      const fields = args.fields || {};
      const page = args.page || client.screenContext;
      const action = args.action || "fill";
      client.ws.send(JSON.stringify({
        type: "fill_form",
        fields,
        page,
        action
      }));
      const fieldSummary = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join(", ");
      return { success: true, message: `Form populated with: ${fieldSummary}. Awaiting user confirmation.` };
    }
    case "get_email_templates": {
      const templates = [
        { name: "friday_comms", label: "Friday Comms", description: "Weekly Friday update to all staff and trustees", subject: "Friday Comms — [DATE]", bodyTemplate: "Bismillah ir-Rahman ir-Rahim\n\nAssalamu Alaikum,\n\n[BODY]\n\nPlease remember us in your Dua.\n\nJazakAllah Khair,\nAbdullah Quilliam Society" },
        { name: "urgent", label: "Urgent", description: "Urgent notice requiring immediate attention", subject: "URGENT: [SUBJECT]", bodyTemplate: "Dear [NAME],\n\nAssalamu Alaikum,\n\nURGENT NOTICE:\n\n[BODY]\n\nPlease respond at your earliest convenience.\n\nJazakAllah Khair" },
        { name: "trustee_update", label: "Trustee Update", description: "Formal update to the board of trustees", subject: "Trustee Update — [SUBJECT]", bodyTemplate: "Dear [NAME],\n\nAssalamu Alaikum wa Rahmatullahi wa Barakatuh,\n\n[BODY]\n\nMay Allah bless your continued service to the Ummah.\n\nJazakAllah Khair,\nAbdullah Quilliam Society" },
        { name: "staff_announcement", label: "Staff Announcement", description: "Internal announcement for all staff members", subject: "Staff Announcement: [SUBJECT]", bodyTemplate: "Dear [NAME],\n\nAssalamu Alaikum,\n\n[BODY]\n\nIf you have any questions, please speak to your line manager.\n\nJazakAllah Khair,\nManagement Team" },
      ];
      return { templates };
    }
    case "bulk_send_email": {
      const group = String(args.group || "").toLowerCase();
      const subject = String(args.subject || "").trim();
      const body = String(args.body || "").trim();
      const templateName = String(args.template || "").trim();
      if (!group || !subject || !body) return { error: "group, subject, and body are required" };
      try {
        // Resolve recipients from trustees table
        const allTrustees = await db.select().from(trustees).where(eq(trustees.isActive, true));
        let recipients: Array<{ name: string; email: string }> = [];
        if (group === "trustees") {
          recipients = allTrustees.filter(t => (t.role || "").toLowerCase().includes("trustee") && t.email).map(t => ({ name: t.name, email: t.email! }));
        } else if (group === "staff" || group === "managers") {
          recipients = allTrustees.filter(t => !(t.role || "").toLowerCase().includes("trustee") && t.email).map(t => ({ name: t.name, email: t.email! }));
        } else if (group === "all") {
          recipients = allTrustees.filter(t => t.email).map(t => ({ name: t.name, email: t.email! }));
        } else {
          return { error: `Unknown group '${group}'. Use: trustees, staff, managers, or all` };
        }
        if (recipients.length === 0) return { error: `No recipients found in group '${group}' with email addresses` };
        // Get Gmail access token
        const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
        const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
        const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
        const GMAIL_FROM_EMAIL = process.env.GMAIL_FROM_EMAIL;
        if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_FROM_EMAIL) {
          return { error: "Gmail credentials not configured." };
        }
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET, refresh_token: GMAIL_REFRESH_TOKEN, grant_type: "refresh_token" }),
        });
        if (!tokenRes.ok) return { error: "Failed to refresh Gmail access token." };
        const { access_token } = await tokenRes.json() as { access_token: string };
        // Apply template if specified
        const TEMPLATES: Record<string, { subject: string; bodyTemplate: string }> = {
          friday_comms: { subject: `Friday Comms \u2014 ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, bodyTemplate: "Bismillah ir-Rahman ir-Rahim\n\nAssalamu Alaikum,\n\n[BODY]\n\nPlease remember us in your Dua.\n\nJazakAllah Khair,\nAbdullah Quilliam Society" },
          urgent: { subject: `URGENT: ${subject}`, bodyTemplate: "URGENT NOTICE:\n\n[BODY]\n\nPlease respond at your earliest convenience.\n\nJazakAllah Khair" },
          trustee_update: { subject: `Trustee Update \u2014 ${subject}`, bodyTemplate: "[BODY]\n\nMay Allah bless your continued service to the Ummah.\n\nJazakAllah Khair,\nAbdullah Quilliam Society" },
          staff_announcement: { subject: `Staff Announcement: ${subject}`, bodyTemplate: "[BODY]\n\nIf you have any questions, please speak to your line manager.\n\nJazakAllah Khair,\nManagement Team" },
        };
        const tpl = templateName && TEMPLATES[templateName] ? TEMPLATES[templateName] : null;
        const finalSubject = tpl ? tpl.subject : subject;
        // Send to each recipient
        let sentCount = 0;
        let failCount = 0;
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
              <p style="font-size:12px;color:#888">Sent via Hibba Voice Assistant on behalf of ${client.userName} &middot; Abdullah Quilliam Society</p>
            </div>`;
            const rawMessage = [
              `From: "Abdullah Quilliam Society" <${GMAIL_FROM_EMAIL}>`,
              `To: ${r.name} <${r.email}>`,
              `Subject: =?UTF-8?B?${Buffer.from(finalSubject).toString("base64")}?=`,
              `MIME-Version: 1.0`,
              `Content-Type: text/html; charset=UTF-8`,
              ``,
              htmlBody,
            ].join("\r\n");
            const encodedMessage = Buffer.from(rawMessage).toString("base64url");
            const sendRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, {
              method: "POST",
              headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ raw: encodedMessage }),
            });
            if (sendRes.ok) sentCount++; else failCount++;
          } catch { failCount++; }
        }
        // Log to outbox
        const { commsOutbox } = await import("../drizzle/schema");
        await db.insert(commsOutbox).values({ recipientGroup: group, recipientIds: [], subject: finalSubject, body, type: "email", status: "sent", sentByUserId: client.userId, createdAt: new Date() });
        return { success: true, message: `Alhamdulillah, emails sent to ${sentCount} ${group}${failCount > 0 ? ` (${failCount} failed)` : ""}` };
      } catch (err: any) {
        return { error: `Bulk email failed: ${err.message}` };
      }
    }
    case "bulk_send_whatsapp": {
      const group = String(args.group || "").toLowerCase();
      const body = String(args.body || "").trim();
      if (!group || !body) return { error: "group and body are required" };
      try {
        // Resolve recipients from trustees table
        const allTrustees = await db.select().from(trustees).where(eq(trustees.isActive, true));
        let recipients: Array<{ name: string; phone: string }> = [];
        if (group === "trustees") {
          recipients = allTrustees.filter(t => (t.role || "").toLowerCase().includes("trustee") && t.phone).map(t => ({ name: t.name, phone: t.phone! }));
        } else if (group === "staff" || group === "managers") {
          recipients = allTrustees.filter(t => !(t.role || "").toLowerCase().includes("trustee") && t.phone).map(t => ({ name: t.name, phone: t.phone! }));
        } else if (group === "all") {
          recipients = allTrustees.filter(t => t.phone).map(t => ({ name: t.name, phone: t.phone! }));
        } else {
          return { error: `Unknown group '${group}'. Use: trustees, staff, managers, or all` };
        }
        if (recipients.length === 0) return { error: `No recipients found in group '${group}' with phone numbers` };
        // Send open_url for each recipient's WhatsApp link
        const links: string[] = [];
        for (const r of recipients) {
          let waPhone = r.phone.replace(/[^0-9+]/g, "");
          if (waPhone.startsWith("0")) waPhone = "44" + waPhone.slice(1);
          if (waPhone.startsWith("+")) waPhone = waPhone.slice(1);
          const personalMsg = `Assalamu Alaikum ${r.name.split(" ")[0]},\n\n${body}`;
          const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(personalMsg)}`;
          links.push(waUrl);
        }
        // Send all links to frontend — it will show them as a list of buttons
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({ type: "open_url_batch", urls: links.map((url, i) => ({ url, label: `WhatsApp ${recipients[i].name}` })) }));
        }
        // Log to outbox
        const { commsOutbox } = await import("../drizzle/schema");
        await db.insert(commsOutbox).values({ recipientGroup: group, recipientIds: [], subject: `Bulk WhatsApp to ${group}`, body, type: "sms", status: "sent", sentByUserId: client.userId, createdAt: new Date() });
        return { success: true, message: `${recipients.length} WhatsApp links ready. Tap each button to send to: ${recipients.map(r => r.name).join(", ")}` };
      } catch (err: any) {
        return { error: `Bulk WhatsApp failed: ${err.message}` };
      }
    }
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
// --- Connect to Gemini Live API ---
function connectToGeminiLive(client: VoiceClient, connectionId: string): WebSocket | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[VoiceGateway] GEMINI_API_KEY not set");
    return null;
  }
  const wsUrl = `${GEMINI_LIVE_WS_URL}?key=${apiKey}`;
  const geminiWs = new WebSocket(wsUrl);

  geminiWs.on("open", () => {
    console.log(`[VoiceGateway] Gemini Live connected for ${connectionId}`);
    const setupPayload: any = {
      model: GEMINI_MODEL,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Kore"
            }
          }
        },
      },
      systemInstruction: {
        parts: [{ text: `${SYSTEM_PROMPT}\n\nCurrent user: ${client.userName} (role: ${client.userRole}). Current screen: ${buildScreenDescription(client.screenContext, client.entityContext)}. Language: ${client.language}. Answer questions about the current section directly without asking where the user is.` }]
      },
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      outputAudioTranscription: {},
      inputAudioTranscription: {},
      realtimeInputConfig: {
        // Configure server-side VAD to be less aggressive about interrupting Hibba
        // This prevents Gemini from cutting off its own audio mid-sentence
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
          endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
          prefixPaddingMs: 300,
          silenceDurationMs: 1500,
        },
        activityHandling: "NO_INTERRUPTION",
      },
      sessionResumption: { handle: client.resumptionHandle || undefined },
    };
    // Remove undefined sessionResumption handle on first connect
    if (!setupPayload.sessionResumption.handle) delete setupPayload.sessionResumption;
    const setupMessage = { setup: setupPayload };
    geminiWs.send(JSON.stringify(setupMessage));
  });

  geminiWs.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.setupComplete) {
        client.isGeminiReady = true;
        console.log(`[VoiceGateway] Gemini setup complete for ${connectionId}`);
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({ type: "gemini_ready" }));
        }
        return;
      }

      if (msg.serverContent) {
        const { modelTurn, turnComplete, outputTranscription, inputTranscription } = msg.serverContent;
        // Process audio chunks from modelTurn
        if (modelTurn?.parts) {
          for (const part of modelTurn.parts) {
            if (part.inlineData && client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify({
                type: "audio_response",
                audio: part.inlineData.data,
                mimeType: part.inlineData.mimeType || "audio/pcm;rate=24000",
              }));
            }
            // In TEXT+AUDIO mode, text parts may appear here too
            if (part.text && client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify({ type: "transcript", text: part.text, speaker: "assistant" }));
              const db = await getDb();
              if (db) await db.insert(voiceTranscripts).values({ sessionId: client.dbSessionId, role: "assistant", content: part.text, createdAt: new Date() });
            }
          }
        }
        // Output transcription: text version of what Gemini is speaking
        if (outputTranscription?.text && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({ type: "transcript", text: outputTranscription.text, speaker: "assistant" }));
          const db = await getDb();
          if (db) await db.insert(voiceTranscripts).values({ sessionId: client.dbSessionId, role: "assistant", content: outputTranscription.text, createdAt: new Date() });
        }
        // Input transcription: text version of what the user said via mic
        if (inputTranscription?.text && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({ type: "transcript", text: inputTranscription.text, speaker: "user" }));
          const db = await getDb();
          if (db) await db.insert(voiceTranscripts).values({ sessionId: client.dbSessionId, role: "user", content: inputTranscription.text, createdAt: new Date() });
        }
        if (turnComplete && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({ type: "turn_complete" }));
        }
        return;
      }

      if (msg.toolCall) {
        const { functionCalls } = msg.toolCall;
        if (functionCalls && functionCalls.length > 0) {
          const toolResponses: any[] = [];
          // Audible progress: notify user when multiple tools or slow queries are running
          const PROGRESS_MESSAGES: Record<string, string> = {
            search_transactions: "Searching transactions...",
            get_fund_balance: "Checking fund balances...",
            get_priorities: "Gathering your priorities...",
            bulk_send_email: "Sending emails to the group...",
            bulk_send_whatsapp: "Preparing WhatsApp messages...",
            get_gift_aid_status: "Checking Gift Aid records...",
          };
          if (functionCalls.length > 1 && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({ type: "agent_response", text: "Let me look that up for you..." }));
          }
          for (const fc of functionCalls) {
            if (client.ws.readyState === WebSocket.OPEN) {
              const progressMsg = PROGRESS_MESSAGES[fc.name];
              if (progressMsg) {
                client.ws.send(JSON.stringify({ type: "progress", text: progressMsg }));
              }
              client.ws.send(JSON.stringify({ type: "tool_call", toolName: fc.name, toolResult: { status: "executing" } }));
            }
            const result = await executeToolCall(fc.name, fc.args || {}, client);
            if (client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify({ type: "tool_call", toolName: fc.name, toolResult: result }));
            }
            toolResponses.push({ id: fc.id, name: fc.name, response: { result: JSON.stringify(result) } });
          }
          if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({ toolResponse: { functionResponses: toolResponses } }));
          }
        }
        return;
      }

      if (msg.toolCallCancellation) {
        console.log(`[VoiceGateway] Tool call cancelled for ${connectionId}`);
        return;
      }

      // Session resumption: store handle for reconnection
      if (msg.sessionResumptionUpdate) {
        const { newHandle, resumable } = msg.sessionResumptionUpdate;
        if (newHandle) {
          client.resumptionHandle = newHandle;
          console.log(`[VoiceGateway] Session resumption handle updated for ${connectionId}`);
        }
        return;
      }
    } catch (err: any) {
      console.error(`[VoiceGateway] Error processing Gemini message:`, err.message);
    }
  });

  geminiWs.on("error", (err) => {
    console.error(`[VoiceGateway] Gemini WS error for ${connectionId}:`, err.message);
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type: "error", error: "Voice service connection error. Please try again." }));
    }
  });

  geminiWs.on("close", (code, reason) => {
    console.log(`[VoiceGateway] Gemini WS closed for ${connectionId}: ${code} ${reason.toString()}`);
    client.isGeminiReady = false;
    client.geminiWs = null;
    // Auto-reconnect if we have a resumption handle and the client is still connected
    if (client.resumptionHandle && client.ws.readyState === WebSocket.OPEN) {
      console.log(`[VoiceGateway] Attempting session resumption for ${connectionId}`);
      sendToClient(client, { type: "status", text: "Reconnecting..." });
      setTimeout(() => {
        if (client.ws.readyState === WebSocket.OPEN) {
          const newGeminiWs = connectToGeminiLive(client, connectionId);
          client.geminiWs = newGeminiWs;
        }
      }, 1000);
    }
  });

  return geminiWs;
}

// --- Send to client helper ---
function sendToClient(client: VoiceClient, message: Record<string, unknown>) {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

// --- Main: Attach WebSocket server ---
export function attachVoiceGateway(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/api/voice" });

  const heartbeat = setInterval(() => {
    for (const [id, client] of Array.from(activeClients.entries())) {
      if (!client.isAlive) {
        client.ws.terminate();
        if (client.geminiWs) client.geminiWs.close();
        activeClients.delete(id);
        continue;
      }
      client.isAlive = false;
      client.ws.ping();
      if (Date.now() - client.lastActivity > SESSION_TIMEOUT_MS) {
        sendToClient(client, { type: "session_ended", text: "Session timed out due to inactivity." });
        client.ws.close();
        if (client.geminiWs) client.geminiWs.close();
        activeClients.delete(id);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", async (ws, req) => {
    const connectionId = nanoid(12);
    console.log(`[VoiceGateway] New connection ${connectionId}`);

    const auth = await authenticateFromRequest(req);
    if (!auth) {
      console.log(`[VoiceGateway] Auth FAILED for ${connectionId}`);
      ws.send(JSON.stringify({ type: "error", error: "Authentication failed. Please log in again." }));
      ws.close();
      return;
    }

    ws.on("pong", () => { const c = activeClients.get(connectionId); if (c) c.isAlive = true; });

     ws.on("message", async (raw) => {
      let msg: ClientMessage;
      try { msg = JSON.parse(raw.toString()); } catch { ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" })); return; }
      console.log(`[VoiceGateway] Message from ${connectionId}: ${msg.type}`);
      try {
      if (msg.type === "start_session") {
        const enabled = await isFeatureEnabled("*", auth.role);
        if (!enabled) { ws.send(JSON.stringify({ type: "error", error: "Voice agent is not enabled for your role" })); ws.close(); return; }

        const dailyUsage = await getDailyTokenUsage(auth.userId);
        if (dailyUsage >= DAILY_TOKEN_LIMIT) { ws.send(JSON.stringify({ type: "error", error: "Daily usage limit reached." })); ws.close(); return; }

        // Close existing sessions
        const existing = Array.from(activeClients.values()).filter(c => c.userId === auth.userId);
        for (const old of existing) {
          sendToClient(old, { type: "session_ended", text: "New session started from another tab" });
          old.ws.close();
          if (old.geminiWs) old.geminiWs.close();
          const oldId = Array.from(activeClients.entries()).find(([, v]) => v === old)?.[0];
          if (oldId) activeClients.delete(oldId);
        }

        const conversationId = `vs_${nanoid(16)}`;
        const db = await getDb();
        if (!db) { ws.send(JSON.stringify({ type: "error", error: "Database unavailable" })); ws.close(); return; }
        const insertResult = await db.insert(voiceSessions).values({
          userId: auth.userId, conversationId, language: msg.language || "en-GB",
          screenContext: msg.screenContext || "dashboard", status: "active", startedAt: new Date(),
        });
        const dbSessionId = Number(insertResult[0].insertId);

        const client: VoiceClient = {
          ws, geminiWs: null, userId: auth.userId, userRole: auth.role, userName: auth.name,
          sessionId: conversationId, dbSessionId, screenContext: msg.screenContext || "dashboard",
          entityContext: msg.entityContext || null, language: msg.language || "en-GB",
          isAlive: true, tokenCount: 0, lastActivity: Date.now(), isGeminiReady: false,
          resumptionHandle: null,
        };
        activeClients.set(connectionId, client);

        // Connect to Gemini Live
        const geminiWs = connectToGeminiLive(client, connectionId);
        client.geminiWs = geminiWs;

        ws.send(JSON.stringify({ type: "session_started", sessionId: conversationId, dbSessionId, text: `Assalamu Alaikum ${auth.name}, how can I help you today?` }));
        return;
      }

      const client = activeClients.get(connectionId);
      if (!client) { ws.send(JSON.stringify({ type: "error", error: "No active session." })); return; }
      client.lastActivity = Date.now();

      if (msg.type === "screen_context") {
        const prevScreen = client.screenContext;
        client.screenContext = msg.screenContext || client.screenContext;
        client.entityContext = msg.entityContext || client.entityContext;
        if (client.geminiWs && client.geminiWs.readyState === 1 && client.isGeminiReady && prevScreen !== client.screenContext) {
          const ctxNote = `[SYSTEM CONTEXT UPDATE] User navigated to: ${buildScreenDescription(client.screenContext, client.entityContext)}. Adjust your responses to be relevant to this section.`;
          client.geminiWs.send(JSON.stringify({ realtimeInput: { text: ctxNote } }));
        }
        return;
      }

      if (msg.type === "audio_chunk" && msg.audio) {
        if (!client.geminiWs || client.geminiWs.readyState !== WebSocket.OPEN || !client.isGeminiReady) {
          ws.send(JSON.stringify({ type: "status", text: "Voice service connecting..." }));
          return;
        }
        client.geminiWs.send(JSON.stringify({
          realtimeInput: { audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" } }
        }));
        return;
      }

      if (msg.type === "text_input" && msg.text) {
        const db = await getDb();
        if (db) await db.insert(voiceTranscripts).values({ sessionId: client.dbSessionId, role: "user", content: msg.text, createdAt: new Date() });
        if (client.geminiWs && client.geminiWs.readyState === WebSocket.OPEN && client.isGeminiReady) {
          // Gemini 3.1 Flash Live: use realtimeInput.text for text during conversation (clientContent only for initial history)
          client.geminiWs.send(JSON.stringify({ realtimeInput: { text: msg.text } }));
        } else {
          try {
            const { invokeLLM } = await import("./_core/llm");
            const contextInfo = `Current user: ${client.userName} (${client.userRole}). Current screen: ${buildScreenDescription(client.screenContext, client.entityContext)}.`;
            const response = await invokeLLM({ messages: [{ role: "system", content: `${SYSTEM_PROMPT}\n\nContext: ${contextInfo}` }, { role: "user", content: msg.text }] });
            const agentText = response.choices?.[0]?.message?.content || "I couldn't process that.";
            ws.send(JSON.stringify({ type: "agent_response", text: agentText }));
            if (db) await db.insert(voiceTranscripts).values({ sessionId: client.dbSessionId, role: "assistant", content: typeof agentText === "string" ? agentText : JSON.stringify(agentText), createdAt: new Date() });
          } catch { ws.send(JSON.stringify({ type: "error", error: "Failed to process text input." })); }
        }
        return;
      }

      if (msg.type === "correct_this") {
        const db = await getDb();
        if (db) await db.insert(voiceReviewQueue).values({ sessionId: client.dbSessionId, transcriptId: msg.transcriptId ? Number(msg.transcriptId) : null, flaggedByUserId: client.userId, agentStatement: msg.correctionNote || "User flagged this response", status: "pending", createdAt: new Date() });
        ws.send(JSON.stringify({ type: "agent_response", text: "Thank you, I've flagged that for Dr. Hamid to review." }));
        return;
      }

      if (msg.type === "end_session") {
        const db = await getDb();
        if (db) await db.update(voiceSessions).set({ endedAt: new Date(), status: "completed" }).where(eq(voiceSessions.id, client.dbSessionId));
        ws.send(JSON.stringify({ type: "session_ended", text: "Session ended. Goodbye!" }));
        if (client.geminiWs) client.geminiWs.close();
        activeClients.delete(connectionId);
        ws.close();
        return;
      }
      } catch (err: any) {
        console.error(`[VoiceGateway] Message handler error for ${connectionId}:`, err.message, err.stack);
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
        if (client.geminiWs) client.geminiWs.close();
        activeClients.delete(connectionId);
      }
    });

    ws.on("error", () => {
      const client = activeClients.get(connectionId);
      if (client?.geminiWs) client.geminiWs.close();
      activeClients.delete(connectionId);
    });
  });

  console.log("[VoiceGateway] WebSocket server attached at /api/voice (Gemini Live mode)");
  return wss;
}
// Doc2 implementation complete
