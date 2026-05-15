/**
 * Native Voice Chat — Text-in / Text-out with full tool calling
 *
 * Architecture:
 * - Browser SpeechRecognition → transcribed text → this endpoint
 * - Server runs invokeLLM with tools in a loop (max 8 iterations)
 * - Returns final text response + any side-effects (navigation, form fills, URLs)
 * - Browser SpeechSynthesis speaks the response
 *
 * This replaces the fragile Gemini Live WebSocket with a reliable HTTP/tRPC flow.
 */
import { invokeLLM, type Tool, type Message, type ToolCall } from "./_core/llm";
import { getDb } from "./db";
import {
  voiceSessions, voiceToolCalls, voiceTranscripts, voiceCostTracking,
  voiceFeatureFlags, voiceReviewQueue, users, trustees, donors,
  supplierContacts, receipts, incomeRecords,
} from "../drizzle/schema";
import { eq, and, sql, gte, desc, or, like } from "drizzle-orm";
import {
  listDriveFiles, getDriveFile, uploadToDrive, updateDriveFile as updateDriveFileHelper,
  createExpenseSheet, createMonthlyBreakdownSheet,
  listGmailLabels, fetchEmailsByLabel, fetchRecentEmails, sendBulkGmail,
} from "./googleServices.js";
import type { GmailMessage, CalendarEvent, EmailSummaryResult } from "./googleServices.js";

// ─── Types ──────────────────────────────────────────────────────────────────
export interface NativeChatInput {
  sessionId: number;
  message: string;
  screenContext: string;
  entityContext?: string;
}

export interface SideEffect {
  type: "navigate" | "fill_form" | "open_url" | "open_url_batch" | "progress";
  data: Record<string, unknown>;
}

export interface NativeChatResult {
  response: string;
  sideEffects: SideEffect[];
  tokensUsed: number;
  toolsExecuted: string[];
}

interface ToolContext {
  userId: number;
  userRole: string;
  userName: string;
  screenContext: string;
  entityContext: string | null;
  language: string;
  dbSessionId: number;
  sideEffects: SideEffect[];
}

// ─── System Prompt ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Hibba, the AI assistant for Abdullah Quilliam Society — a UK Islamic charity managing Britain's first mosque at Brougham Terrace, Liverpool.

RESPONSE STYLE — CRITICAL:
- Be concise and direct. Maximum 2-3 sentences per response unless the user asks for detail.
- Do NOT use filler words: no "um", "uh", "well", "so", "let me think".
- Give one clear, direct answer per turn. Do not rephrase or restate the same point.
- When calling a tool, just call it silently. Do not narrate your actions.
- After receiving tool results, deliver the answer immediately without preamble.
- Use natural British English. Say numbers naturally: "three hundred and fifty pounds" not "£350".
- When giving times, say "quarter past four" not "16:15".
- Keep responses short and speakable — they will be read aloud by text-to-speech.

ISLAMIC IDENTITY & PERSONALITY:
- You are a Muslim assistant serving a mosque and Islamic charity.
- Use Islamic phrases naturally: "Insha'Allah" (for future plans), "Alhamdulillah" (for good results), "SubhanAllah" (for impressive things), "Masha'Allah" (for good news).
- When reporting good results, say "Alhamdulillah" or "Masha'Allah".
- When reporting challenges, say "May Allah make it easy" or "Insha'Allah we will get there".
- Be warm, respectful, and sisterly in tone.
- Abdullah Quilliam Mosque & National Heritage Centre, Charity 1194942.
- Chair: Galib Khan. Founded by Abdullah Quilliam in 1887.

FORM FILLING & DATA EXTRACTION:
- When a user describes an expense, donation, income, loan, bill, or any data verbally, extract the structured fields and use fill_form.
- Listen for: amounts (£), dates, payee/vendor names, categories, descriptions, payment methods, references.
- ALWAYS use action='fill_and_confirm' so the user sees a confirmation dialog before saving.
- After calling fill_form, read back the key fields aloud.

TIMEZONE:
- Liverpool, UK. BST (UTC+1) late March to late October, GMT (UTC+0) otherwise.

ANTI-HALLUCINATION:
- ONLY report data from tool results. Never invent names, amounts, dates, or emails.
- If a tool returns nothing, say "I couldn't find that" honestly.

NAVIGATION — You know every section. When a user mentions any of these, use navigate_to:
  Dashboard → /dashboard | Receipts/Expenses → /receipts | Reports → /reports
  Fundraising → /fundraising | Loans → /loans | Income → /income
  Payroll → /payroll | Monthly Expenses → /monthly-expenses
  Reconciliation → /reconciliation | Donors → /donors | Campaigns → /campaigns
  Communications → /communications | Comms Hub → /comms-hub
  Master Inbox → /comms-inbox | Meetings & Onboarding → /meetings
  Admin Panel → /admin | Trustees & Staff Contacts → /trustees
  Compliance Cockpit → /compliance | Conflicts Register → /conflicts-register
  Decisions Register → /decisions | Bulk Approvals → /bulk-approvals
  Bills & Utilities → /bills-utilities | Training Tracker → /training-tracker
  LBMW Correspondence → /lbmw-correspondence | Trustee Dashboard → /trustee-dashboard
  Facilities & Bookings → /facilities | Bistro 87 → /bistro87
  Accommodation → /accommodation | Gift Aid → /gift-aid | Pledges → /pledges
  Donate → /donate | Profile → /profile | Fintech → /fintech | Donor CRM → /donor-crm

AQS INFO:
- Phone: 0151 260 3986. Websites: abdullahquilliam.org, theaqs.org.
- Bank: Abdullah Quilliam Society, Acc 01158945, Sort 40-29-28.
- Friends of AQS: 100+ monthly supporters.

CAPABILITIES:
- Read/search ALL data: donors, finances, campaigns, staff, facilities, expenses, payroll, income, loans, accommodation, compliance, meetings, communications, bills, utilities, gift aid, pledges, training records, bistro orders, conflicts, decisions, backups, LBMW correspondence.
- Take actions: send emails, send WhatsApp messages, create donor notes, create tasks, schedule meetings, record donations, generate reports, create payment links, flag items for review.
- Google Drive: list, read, save, update files. Create expense sheets and monthly breakdowns.
- Gmail: list labels, fetch emails, summarise with AI.
- Fill forms: extract data from speech and populate any form on the user's current page.
- Navigate users to any section instantly.
- Provide prayer times, mosque info, donation guidance.

BOUNDARIES:
- Never authenticate users. Never handle card data — use Stripe links.
- Never read sensitive data unless explicitly asked.
- Confirm before amounts over £1,000 or destructive actions.
- Respect user roles. If FORBIDDEN, explain politely.`;

// ─── Tool Declarations (OpenAI format) ──────────────────────────────────────
const TOOLS: Tool[] = [
  // Core
  { type: "function", function: { name: "get_current_user", description: "Get the current user's profile, role, and permissions", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_current_time", description: "Get the current date and time in UK timezone", parameters: { type: "object", properties: {}, required: [] } } },
  // People
  { type: "function", function: { name: "get_staff_directory", description: "Get all active staff members with their roles and contact info", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_trustees", description: "Get the list of trustees", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_donor", description: "Get full donor details by ID", parameters: { type: "object", properties: { donorId: { type: "number", description: "Donor ID" } }, required: ["donorId"] } } },
  { type: "function", function: { name: "search_donors", description: "Search donors by name, email, or phone", parameters: { type: "object", properties: { query: { type: "string", description: "Search query" }, limit: { type: "number" } }, required: ["query"] } } },
  // Finance
  { type: "function", function: { name: "search_transactions", description: "Search recent expense transactions", parameters: { type: "object", properties: { limit: { type: "number" }, category: { type: "string" }, status: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "get_income_summary", description: "Get income records summary", parameters: { type: "object", properties: { period: { type: "string", description: "today, this_week, this_month, last_month" } }, required: [] } } },
  { type: "function", function: { name: "get_expenses_summary", description: "Get expenses summary", parameters: { type: "object", properties: { period: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "get_loans_summary", description: "Get Qard Hasan loans summary", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_payroll_summary", description: "Get payroll information", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_bills_utilities", description: "Get utility bills and scheduled payments", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_fund_balance", description: "Get fund/campaign balance", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_campaign_status", description: "Get all campaign statuses", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_pledges", description: "Get pledge commitments and fulfilment status", parameters: { type: "object", properties: {}, required: [] } } },
  // Operations
  { type: "function", function: { name: "get_priorities", description: "Get pending approvals and urgent matters", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_meetings", description: "Get upcoming and recent meetings", parameters: { type: "object", properties: { upcoming: { type: "boolean" } }, required: [] } } },
  { type: "function", function: { name: "get_compliance_status", description: "Get compliance actions and status", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_accommodation", description: "Get student accommodation status", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_facilities", description: "Get facilities bookings and status", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_training_summary", description: "Get training records summary", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_bistro_summary", description: "Get Bistro 87 summary", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_conflicts", description: "Get conflicts of interest register", parameters: { type: "object", properties: { status: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "get_decisions", description: "Get trustee decisions", parameters: { type: "object", properties: { limit: { type: "number" } }, required: [] } } },
  { type: "function", function: { name: "get_lbmw_correspondence", description: "Get LBMW correspondence", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_comms_inbox", description: "Get master inbox messages", parameters: { type: "object", properties: { limit: { type: "number" } }, required: [] } } },
  { type: "function", function: { name: "get_backups", description: "Get system backup history", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_audit_trail", description: "Get recent audit trail entries", parameters: { type: "object", properties: { limit: { type: "number" } }, required: [] } } },
  // Actions
  { type: "function", function: { name: "create_donation", description: "Record a new donation", parameters: { type: "object", properties: { donorId: { type: "number" }, amount: { type: "number" }, campaignId: { type: "number" }, paymentMethod: { type: "string" } }, required: ["donorId", "amount"] } } },
  { type: "function", function: { name: "update_donor_profile", description: "Update donor profile fields", parameters: { type: "object", properties: { donorId: { type: "number" }, phone: { type: "string" }, email: { type: "string" } }, required: ["donorId"] } } },
  { type: "function", function: { name: "log_communication", description: "Log a communication with a donor", parameters: { type: "object", properties: { donorId: { type: "number" }, channel: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["donorId"] } } },
  { type: "function", function: { name: "create_payment_link", description: "Generate a Stripe payment link", parameters: { type: "object", properties: { donorId: { type: "number" }, amount: { type: "number" } }, required: ["donorId", "amount"] } } },
  { type: "function", function: { name: "send_email", description: "Send an email via Gmail API", parameters: { type: "object", properties: { to: { type: "string" }, recipientName: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, donorId: { type: "number" } }, required: ["to", "subject", "body"] } } },
  { type: "function", function: { name: "send_whatsapp", description: "Open WhatsApp with pre-filled message", parameters: { type: "object", properties: { to: { type: "string" }, recipientName: { type: "string" }, body: { type: "string" }, donorId: { type: "number" } }, required: ["to", "body"] } } },
  { type: "function", function: { name: "bulk_send_email", description: "Send email to a group (trustees, staff, managers, all)", parameters: { type: "object", properties: { group: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, template: { type: "string" } }, required: ["group", "subject", "body"] } } },
  { type: "function", function: { name: "create_task", description: "Create a task or action item", parameters: { type: "object", properties: { title: { type: "string" }, owner: { type: "string" }, dueDate: { type: "string" }, priority: { type: "string" }, notes: { type: "string" } }, required: ["title"] } } },
  { type: "function", function: { name: "schedule_meeting", description: "Schedule a meeting", parameters: { type: "object", properties: { title: { type: "string" }, meetingType: { type: "string" }, scheduledAt: { type: "string" }, location: { type: "string" }, notes: { type: "string" } }, required: ["title", "scheduledAt"] } } },
  { type: "function", function: { name: "generate_report", description: "Generate a financial summary report", parameters: { type: "object", properties: { year: { type: "number" }, month: { type: "number" } }, required: [] } } },
  { type: "function", function: { name: "flag_for_review", description: "Flag something for review", parameters: { type: "object", properties: { note: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "create_donor_note", description: "Create a note on a donor's profile", parameters: { type: "object", properties: { donorId: { type: "number" }, content: { type: "string" }, isPinned: { type: "boolean" } }, required: ["donorId", "content"] } } },
  // Navigation
  { type: "function", function: { name: "navigate_to", description: "Navigate the user to a specific page", parameters: { type: "object", properties: { page: { type: "string" } }, required: ["page"] } } },
  // Form filling
  { type: "function", function: { name: "fill_form", description: "Fill a form on the user's current page with extracted data", parameters: { type: "object", properties: { fields: { type: "object", description: "Key-value pairs of form fields" }, page: { type: "string" }, action: { type: "string", description: "fill or fill_and_confirm" } }, required: ["fields"] } } },
  // Mosque & Community
  { type: "function", function: { name: "get_prayer_times", description: "Get today's prayer times for Liverpool", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_donation_info", description: "Get donation methods and bank details", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_mosque_info", description: "Get mosque information", parameters: { type: "object", properties: {}, required: [] } } },
  // Google Drive & Sheets
  { type: "function", function: { name: "list_drive_files", description: "List files in Google Drive", parameters: { type: "object", properties: { folderId: { type: "string" }, limit: { type: "number" } }, required: [] } } },
  { type: "function", function: { name: "read_drive_file", description: "Read a file from Google Drive", parameters: { type: "object", properties: { fileId: { type: "string" } }, required: ["fileId"] } } },
  { type: "function", function: { name: "save_to_drive", description: "Save a file to Google Drive", parameters: { type: "object", properties: { fileName: { type: "string" }, content: { type: "string" }, mimeType: { type: "string" } }, required: ["fileName", "content"] } } },
  { type: "function", function: { name: "create_expense_sheet", description: "Create expense spreadsheet in Google Drive", parameters: { type: "object", properties: { title: { type: "string" }, period: { type: "string" } }, required: ["title"] } } },
  { type: "function", function: { name: "create_monthly_breakdown", description: "Create monthly income vs expense breakdown", parameters: { type: "object", properties: { title: { type: "string" }, month: { type: "number" }, year: { type: "number" } }, required: [] } } },
  // Gmail
  { type: "function", function: { name: "list_gmail_labels", description: "List all Gmail labels", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "fetch_emails_by_label", description: "Fetch emails from a Gmail label", parameters: { type: "object", properties: { labelId: { type: "string" }, maxResults: { type: "number" } }, required: ["labelId"] } } },
  { type: "function", function: { name: "fetch_new_emails", description: "Fetch latest unread emails", parameters: { type: "object", properties: { maxResults: { type: "number" }, query: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "summarise_and_action_emails", description: "AI-summarise emails and extract action items", parameters: { type: "object", properties: { emailIds: { type: "array", items: { type: "string" } }, labelId: { type: "string" }, maxResults: { type: "number" } }, required: [] } } },
  // Daily briefing & calendar
  { type: "function", function: { name: "get_daily_briefing", description: "Get today's calendar, urgent emails, and unread count", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_calendar_today", description: "Get today's Google Calendar events", parameters: { type: "object", properties: { daysAhead: { type: "number" } }, required: [] } } },
  // Extended email
  { type: "function", function: { name: "send_to_donors", description: "Send email to donors (all/major/regular/active)", parameters: { type: "object", properties: { group: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, limit: { type: "number" } }, required: ["group", "subject", "body"] } } },
  { type: "function", function: { name: "send_to_suppliers", description: "Send email to suppliers", parameters: { type: "object", properties: { supplierName: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["subject", "body"] } } },
  // Comms Hub pipeline
  { type: "function", function: { name: "fetch_and_push_to_comms", description: "Fetch emails from Gmail and push to Comms Hub", parameters: { type: "object", properties: { labelId: { type: "string" }, labelName: { type: "string" }, maxResults: { type: "number" } }, required: ["labelId", "labelName"] } } },
  // Email management
  { type: "function", function: { name: "get_email_templates", description: "Get available email templates", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "set_email_priority", description: "Set email priority in Comms Hub", parameters: { type: "object", properties: { messageId: { type: "number" }, priority: { type: "string" } }, required: ["messageId", "priority"] } } },
  { type: "function", function: { name: "move_email_to_section", description: "Move email to a section in Comms Hub", parameters: { type: "object", properties: { messageId: { type: "number" }, sectionSlug: { type: "string" } }, required: ["messageId", "sectionSlug"] } } },
  { type: "function", function: { name: "update_drive_file", description: "Update an existing file in Google Drive", parameters: { type: "object", properties: { fileId: { type: "string" }, content: { type: "string" }, mimeType: { type: "string" } }, required: ["fileId", "content"] } } },
  // Qarde Hasan & Calendar & Preferences
  { type: "function", function: { name: "get_qarde_hasan_register", description: "Get Qarde Hasan loan register", parameters: { type: "object", properties: { status: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "get_calendar", description: "Get upcoming meetings and events", parameters: { type: "object", properties: { days: { type: "number" } }, required: [] } } },
  { type: "function", function: { name: "get_gift_aid_summary", description: "Get Gift Aid declarations summary", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_recognition_tiers", description: "Get donor recognition tiers", parameters: { type: "object", properties: {}, required: [] } } },
  // Bulk WhatsApp
  { type: "function", function: { name: "bulk_send_whatsapp", description: "Prepare WhatsApp messages for a group", parameters: { type: "object", properties: { group: { type: "string" }, body: { type: "string" } }, required: ["group", "body"] } } },
];

// ─── Role-based tool permissions ────────────────────────────────────────────
const TOOL_PERMISSIONS: Record<string, string[]> = {
  get_current_user: ["superadmin", "admin", "trustee", "manager", "staff", "reception", "donor", "auditor"],
  get_current_time: ["superadmin", "admin", "trustee", "manager", "staff", "reception", "donor", "auditor"],
  get_staff_directory: ["superadmin", "admin", "trustee", "manager", "staff"],
  get_trustees: ["superadmin", "admin", "trustee", "manager", "staff"],
  get_donor: ["superadmin", "admin", "trustee", "manager", "staff", "reception"],
  search_donors: ["superadmin", "admin", "trustee", "manager", "staff", "reception"],
  search_transactions: ["superadmin", "admin", "trustee", "manager", "staff", "auditor"],
  get_fund_balance: ["superadmin", "admin", "trustee", "manager", "staff", "auditor"],
  get_campaign_status: ["superadmin", "admin", "trustee", "manager", "staff", "auditor"],
  get_gift_aid_summary: ["superadmin", "admin", "trustee", "manager"],
  get_priorities: ["superadmin", "admin", "trustee", "manager", "staff"],
  get_email_templates: ["superadmin", "admin", "trustee", "manager", "staff"],
  navigate_to: ["superadmin", "admin", "trustee", "manager", "staff", "reception", "donor"],
  create_donation: ["superadmin", "admin", "trustee", "manager", "staff", "reception"],
  create_expense: ["superadmin", "admin", "manager", "staff"],
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
  get_qarde_hasan_register: ["superadmin", "admin", "trustee", "manager"],
  get_calendar: ["superadmin", "admin", "trustee", "manager", "staff"],
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

function hasPermission(toolName: string, role: string): boolean {
  const allowed = TOOL_PERMISSIONS[toolName];
  if (!allowed) return true;
  return allowed.includes(role);
}

// ─── Tool Execution ─────────────────────────────────────────────────────────
async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ status: string; data: unknown; error?: string }> {
  if (!hasPermission(toolName, ctx.userRole)) {
    return { status: "error", data: null, error: `Permission denied: your role (${ctx.userRole}) cannot use ${toolName}` };
  }
  const db = await getDb();
  if (!db) return { status: "error", data: null, error: "Database unavailable" };
  const startTime = Date.now();
  try {
    const result = await routeToolCall(toolName, args, ctx, db);
    const latencyMs = Date.now() - startTime;
    await db.insert(voiceToolCalls).values({
      sessionId: ctx.dbSessionId,
      toolName,
      params: JSON.stringify(args).substring(0, 500),
      resultSummary: JSON.stringify(result).substring(0, 500),
      latencyMs,
      success: true,
      createdAt: new Date(),
    });
    return { status: "success", data: result };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    await db.insert(voiceToolCalls).values({
      sessionId: ctx.dbSessionId,
      toolName,
      params: JSON.stringify(args).substring(0, 500),
      resultSummary: err.message || "Error",
      latencyMs,
      success: false,
      createdAt: new Date(),
    }).catch(() => {});
    return { status: "error", data: null, error: err.message || "Tool execution failed" };
  }
}

async function routeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
): Promise<unknown> {
  // Import the full tool routing from voiceGateway to avoid duplicating 1000+ lines
  // We reuse the exact same _routeToolCallInner but adapt the interface
  switch (toolName) {
    case "get_current_user":
      return { userId: ctx.userId, role: ctx.userRole, name: ctx.userName, language: ctx.language };
    case "get_current_time": {
      const now = new Date();
      const ukTime = now.toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return { currentTime: ukTime, timezone: now.toLocaleString("en-GB", { timeZone: "Europe/London", timeZoneName: "short" }).includes("BST") ? "BST (UTC+1)" : "GMT (UTC+0)" };
    }
    case "navigate_to": {
      const page = String(args.page || "/dashboard").trim();
      ctx.sideEffects.push({ type: "navigate", data: { path: page } });
      ctx.screenContext = page;
      return { success: true, message: `Navigating to ${page}` };
    }
    case "fill_form": {
      ctx.sideEffects.push({ type: "fill_form", data: { fields: args.fields || {}, page: args.page || ctx.screenContext, action: args.action || "fill_and_confirm" } });
      const fieldSummary = Object.entries(args.fields as Record<string, unknown> || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
      return { success: true, message: `Form populated with: ${fieldSummary}. Awaiting user confirmation.` };
    }
    case "send_whatsapp": {
      const to = String(args.to || "").trim();
      const body = String(args.body || "").trim();
      if (!to || !body) return { error: "Phone number and message body are required" };
      let waPhone = to.replace(/[^0-9+]/g, "");
      if (waPhone.startsWith("0")) waPhone = "44" + waPhone.slice(1);
      if (waPhone.startsWith("+")) waPhone = waPhone.slice(1);
      const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(body)}`;
      ctx.sideEffects.push({ type: "open_url", data: { url: waUrl, label: `WhatsApp to ${args.recipientName || to}` } });
      // Log to outbox
      const { commsOutbox } = await import("../drizzle/schema");
      await db.insert(commsOutbox).values({ recipientGroup: "individual", recipientIds: [Number(args.donorId) || 0], subject: `WhatsApp to ${args.recipientName || to}`, body, type: "sms", status: "sent", sentByUserId: ctx.userId, createdAt: new Date() });
      if (args.donorId) {
        const { donorCommsLog } = await import("../drizzle/schema");
        await db.insert(donorCommsLog).values({ donorId: Number(args.donorId), type: "whatsapp_sent", channel: "whatsapp", subject: `WhatsApp message`, notes: body, sentByUserId: ctx.userId, createdAt: new Date() });
      }
      return { success: true, message: `WhatsApp opened for ${args.recipientName || to}. Just tap Send!` };
    }
    case "bulk_send_whatsapp": {
      const group = String(args.group || "").toLowerCase();
      const body = String(args.body || "").trim();
      if (!group || !body) return { error: "group and body are required" };
      const allTrustees = await db.select().from(trustees).where(eq(trustees.isActive, true));
      let recipients: Array<{ name: string; phone: string }> = [];
      if (group === "trustees") recipients = allTrustees.filter(t => (t.role || "").toLowerCase().includes("trustee") && t.phone).map(t => ({ name: t.fullName, phone: t.phone! }));
      else if (group === "staff" || group === "managers") recipients = allTrustees.filter(t => !(t.role || "").toLowerCase().includes("trustee") && t.phone).map(t => ({ name: t.fullName, phone: t.phone! }));
      else if (group === "all") recipients = allTrustees.filter(t => t.phone).map(t => ({ name: t.fullName, phone: t.phone! }));
      else return { error: `Unknown group '${group}'` };
      if (recipients.length === 0) return { error: `No recipients found in group '${group}'` };
      const links = recipients.map(r => {
        let waPhone = r.phone.replace(/[^0-9+]/g, "");
        if (waPhone.startsWith("0")) waPhone = "44" + waPhone.slice(1);
        if (waPhone.startsWith("+")) waPhone = waPhone.slice(1);
        return { url: `https://wa.me/${waPhone}?text=${encodeURIComponent(`Assalamu Alaikum ${r.name.split(" ")[0]},\n\n${body}`)}`, label: `WhatsApp ${r.name}` };
      });
      ctx.sideEffects.push({ type: "open_url_batch", data: { urls: links } });
      return { success: true, message: `${recipients.length} WhatsApp links ready.` };
    }
    // All remaining tools delegate to the shared implementation from voiceGateway
    default:
      return executeSharedTool(toolName, args, ctx, db);
  }
}

// Shared tool execution — mirrors voiceGateway._routeToolCallInner for all non-side-effect tools
async function executeSharedTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
): Promise<unknown> {
  const { fundraisingCampaigns, fundraisingDonations, loanApplications, payrollV2,
    utilityBills, scheduledPayments, complianceActions, facilityRooms, facilityBookings,
    trainingRecords, bistroOrders, bistroMenuItems, conflictsOfInterest, trusteeDecisions,
    trusteeMeetings, donorNotes, donorCommsLog, commsOutbox, giftAidDeclarations,
    auditLog, systemBackups, recognitionTiers, lbmwCorrespondence, pledges: pledgesTable,
  } = await import("../drizzle/schema");

  switch (toolName) {
    case "get_staff_directory": {
      const rows = await db.select({ id: trustees.id, name: trustees.fullName, role: trustees.role, email: trustees.email, phone: trustees.phone }).from(trustees).where(eq(trustees.isActive, true));
      return rows;
    }
    case "get_trustees": {
      const rows = await db.select({ id: trustees.id, name: trustees.fullName, role: trustees.role, email: trustees.email, phone: trustees.phone }).from(trustees).where(and(eq(trustees.isActive, true), or(like(trustees.role, "%Trustee%"), like(trustees.role, "%Chair%"))));
      return rows;
    }
    case "get_donor": {
      const donorId = Number(args.donorId);
      if (!donorId) return { error: "donorId required" };
      const result = await db.select().from(donors).where(eq(donors.id, donorId)).limit(1);
      if (!result.length) return { error: "Donor not found" };
      return result[0];
    }
    case "search_donors": {
      const query = String(args.query || "").trim();
      if (!query) return { error: "Search query required" };
      const limit = Math.min(Number(args.limit) || 10, 25);
      const pattern = `%${query}%`;
      const results = await db.select({ id: donors.id, name: donors.name, email: donors.email, phone: donors.phone, totalGiven: donors.totalGiven, status: donors.status }).from(donors).where(or(like(donors.name, pattern), like(donors.email, pattern), like(donors.phone, pattern))).limit(limit);
      if (!results.length) return { found: 0, message: `No donors found matching "${query}"` };
      return { found: results.length, donors: results };
    }
    case "search_transactions": {
      const limit = Math.min(Number(args.limit) || 20, 50);
      const rows = await db.select().from(receipts).orderBy(desc(receipts.createdAt)).limit(limit);
      return { count: rows.length, transactions: rows };
    }
    case "get_income_summary": {
      const period = String(args.period || "this_month");
      const now = new Date();
      let from: Date;
      if (period === "today") from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      else if (period === "this_week") { from = new Date(now); from.setDate(from.getDate() - 7); }
      else if (period === "last_month") from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      else from = new Date(now.getFullYear(), now.getMonth(), 1);
      const rows = await db.select().from(incomeRecords).where(gte(incomeRecords.createdAt, from)).orderBy(desc(incomeRecords.createdAt)).limit(50);
      const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      return { period, recordCount: rows.length, totalIncome: `£${total.toFixed(2)}` };
    }
    case "get_expenses_summary": {
      const period = String(args.period || "this_month");
      const now = new Date();
      let from: Date;
      if (period === "today") from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      else if (period === "this_week") { from = new Date(now); from.setDate(from.getDate() - 7); }
      else if (period === "last_month") from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      else from = new Date(now.getFullYear(), now.getMonth(), 1);
      const rows = await db.select().from(receipts).where(gte(receipts.createdAt, from)).orderBy(desc(receipts.createdAt)).limit(50);
      const total = rows.reduce((sum, r) => sum + Number(r.totalAmount || 0), 0);
      return { period, recordCount: rows.length, totalExpenses: `£${total.toFixed(2)}`, pending: rows.filter(r => r.status === "pending").length, approved: rows.filter(r => r.status === "approved").length };
    }
    case "get_loans_summary": {
      const rows = await db.select().from(loanApplications).orderBy(desc(loanApplications.createdAt)).limit(30);
      const active = rows.filter(r => r.status === "active" || r.status === "approved");
      const totalOutstanding = active.reduce((sum, r) => sum + Number((r as any).remainingBalance || (r as any).amount || 0), 0);
      return { totalLoans: rows.length, activeLoans: active.length, totalOutstanding: `£${totalOutstanding.toFixed(2)}` };
    }
    case "get_payroll_summary": {
      const rows = await db.select().from(payrollV2).orderBy(desc(payrollV2.createdAt)).limit(30);
      const totalMonthly = rows.filter(r => r.status === "approved" || r.status === "paid").reduce((sum, r) => sum + Number((r as any).netPay || (r as any).grossPay || 0), 0);
      return { staffCount: rows.length, totalMonthlyPayroll: `£${totalMonthly.toFixed(2)}` };
    }
    case "get_bills_utilities": {
      const bills = await db.select().from(utilityBills).orderBy(desc(utilityBills.createdAt)).limit(20);
      const scheduled = await db.select().from(scheduledPayments).limit(20);
      return { billCount: bills.length, scheduledPaymentCount: scheduled.length };
    }
    case "get_fund_balance": {
      const campaigns = await db.select().from(fundraisingCampaigns).where(eq(fundraisingCampaigns.isActive, true));
      return { activeFunds: campaigns.length, campaigns: campaigns.map(c => ({ id: c.id, name: c.name, goal: c.targetAmount, raised: c.currentAmount })) };
    }
    case "get_campaign_status": {
      const campaigns = await db.select().from(fundraisingCampaigns);
      return campaigns.map(c => ({ id: c.id, name: c.name, goal: c.targetAmount, raised: c.currentAmount, isActive: c.isActive }));
    }
    case "get_pledges": {
      const rows = await db.select().from(pledgesTable).orderBy(desc(pledgesTable.createdAt)).limit(30);
      const totalPledged = rows.reduce((sum, r) => sum + Number((r as any).amount || 0), 0);
      const totalPaid = rows.reduce((sum, r) => sum + Number((r as any).paidAmount || 0), 0);
      return { totalPledges: rows.length, totalPledged: `£${totalPledged.toFixed(2)}`, totalPaid: `£${totalPaid.toFixed(2)}`, outstanding: `£${(totalPledged - totalPaid).toFixed(2)}` };
    }
    case "get_priorities": {
      const pending = await db.select().from(receipts).where(eq(receipts.status, "pending")).limit(20);
      return { pendingApprovals: pending.length, items: pending };
    }
    case "get_meetings": {
      const upcoming = args.upcoming !== false;
      const now = new Date();
      const rows = upcoming
        ? await db.select().from(trusteeMeetings).where(gte(trusteeMeetings.scheduledAt, now)).orderBy(trusteeMeetings.scheduledAt).limit(10)
        : await db.select().from(trusteeMeetings).orderBy(desc(trusteeMeetings.scheduledAt)).limit(10);
      return { type: upcoming ? "upcoming" : "recent", count: rows.length, meetings: rows.map(m => ({ id: m.id, title: m.title, type: m.meetingType, date: m.scheduledAt, status: (m as any).status })) };
    }
    case "get_compliance_status": {
      const rows = await db.select().from(complianceActions).orderBy(desc(complianceActions.createdAt)).limit(30);
      const open = rows.filter(r => r.status === "open");
      const overdue = open.filter(r => r.dueDate && new Date(r.dueDate) < new Date());
      return { total: rows.length, open: open.length, overdue: overdue.length, actions: open.slice(0, 10).map(a => ({ id: a.id, title: a.title, owner: a.owner, priority: a.priority, dueDate: a.dueDate })) };
    }
    case "get_accommodation": {
      try {
        const rooms = await db.select().from(facilityRooms).limit(30);
        const bookings = await db.select().from(facilityBookings).orderBy(desc(facilityBookings.createdAt)).limit(20);
        return { roomCount: rooms.length, bookingCount: bookings.length };
      } catch { return { error: "Accommodation data not available" }; }
    }
    case "get_facilities": {
      try {
        const rooms = await db.select().from(facilityRooms).limit(30);
        return { totalRooms: rooms.length, rooms: rooms.map(r => ({ id: r.id, name: (r as any).name || "Room", capacity: (r as any).capacity })) };
      } catch { return { error: "Facilities data not available" }; }
    }
    case "get_training_summary": {
      const rows = await db.select().from(trainingRecords).orderBy(desc(trainingRecords.createdAt)).limit(50);
      const now = new Date();
      const thirtyDays = new Date(now.getTime() + 30 * 86400000);
      const valid = rows.filter(r => r.status === "completed" && (!r.expiresAt || new Date(r.expiresAt) > thirtyDays));
      const expiringSoon = rows.filter(r => r.status === "completed" && r.expiresAt && new Date(r.expiresAt) <= thirtyDays && new Date(r.expiresAt) > now);
      return { total: rows.length, valid: valid.length, expiringSoon: expiringSoon.length };
    }
    case "get_bistro_summary": {
      const orders = await db.select().from(bistroOrders).orderBy(desc(bistroOrders.createdAt)).limit(30);
      const menuItems = await db.select().from(bistroMenuItems).limit(50);
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayOrders = orders.filter(o => o.createdAt && new Date(o.createdAt) >= todayStart);
      const todayRevenue = todayOrders.reduce((sum, o) => sum + Number((o as any).total || 0), 0);
      return { totalMenuItems: menuItems.length, todayOrders: todayOrders.length, todayRevenue: `£${todayRevenue.toFixed(2)}` };
    }
    case "get_conflicts": {
      const statusFilter = String(args.status || "all");
      const rows = statusFilter !== "all"
        ? await db.select().from(conflictsOfInterest).where(eq(conflictsOfInterest.status, statusFilter as any)).orderBy(desc(conflictsOfInterest.createdAt)).limit(30)
        : await db.select().from(conflictsOfInterest).orderBy(desc(conflictsOfInterest.createdAt)).limit(30);
      return { total: rows.length, conflicts: rows.map(c => ({ id: c.id, trusteeName: (c as any).trusteeName, status: c.status })) };
    }
    case "get_decisions": {
      const limit = Math.min(Number(args.limit) || 20, 50);
      const rows = await db.select().from(trusteeDecisions).orderBy(desc(trusteeDecisions.createdAt)).limit(limit);
      return { total: rows.length, decisions: rows.map(d => ({ id: d.id, title: (d as any).title || (d as any).decision, status: (d as any).status })) };
    }
    case "get_lbmw_correspondence": {
      try {
        const rows = await db.select().from(lbmwCorrespondence).orderBy(desc(lbmwCorrespondence.createdAt)).limit(20);
        return { total: rows.length, items: rows.map(r => ({ id: r.id, subject: (r as any).subject || (r as any).title, type: (r as any).type })) };
      } catch { return { error: "LBMW correspondence data not available" }; }
    }
    case "get_comms_inbox": {
      const limit = Math.min(Number(args.limit) || 20, 50);
      const rows = await db.select().from(commsOutbox).orderBy(desc(commsOutbox.createdAt)).limit(limit);
      return { total: rows.length, messages: rows.map(m => ({ id: m.id, subject: (m as any).subject, type: (m as any).type, status: (m as any).status })) };
    }
    case "get_backups": {
      try {
        const rows = await db.select().from(systemBackups).orderBy(desc(systemBackups.createdAt)).limit(10);
        return { total: rows.length, backups: rows.map(b => ({ id: b.id, status: (b as any).status, createdAt: b.createdAt })) };
      } catch { return { error: "Backup data not available" }; }
    }
    case "get_audit_trail": {
      try {
        const limit = Math.min(Number(args.limit) || 20, 50);
        const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
        return { total: rows.length, entries: rows.map(a => ({ id: a.id, action: (a as any).action, entity: (a as any).entityType, userId: (a as any).userId })) };
      } catch { return { error: "Audit trail data not available" }; }
    }
    case "create_donation": {
      const donorId = Number(args.donorId);
      const amount = Number(args.amount);
      if (!donorId || !amount) return { error: "donorId and amount required" };
      if (amount <= 0) return { error: "Amount must be positive" };
      if (amount >= 100000) return { error: "Amount exceeds limit" };
      await db.insert(fundraisingDonations).values({ donorLeadId: donorId, campaignId: args.campaignId ? Number(args.campaignId) : 0, donorName: String(args.donorName || "Voice Agent"), amount: String(amount), paymentMethod: (args.paymentMethod || "cash") as any, donatedAt: new Date(), createdAt: new Date() } as any);
      return { success: true, donorId, amount };
    }
    case "update_donor_profile": {
      const donorId = Number(args.donorId);
      if (!donorId) return { error: "donorId required" };
      const updates: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(args)) { if (key !== "donorId") updates[key] = val; }
      if (Object.keys(updates).length === 0) return { error: "No fields to update" };
      await db.update(donors).set(updates as any).where(eq(donors.id, donorId));
      return { success: true, updatedFields: Object.keys(updates) };
    }
    case "log_communication": {
      await db.insert(donorCommsLog).values({ donorId: Number(args.donorId), type: "manual_note", channel: (args.channel as any) || "system", subject: String(args.subject || "Voice agent interaction"), notes: String(args.body || ""), sentByUserId: ctx.userId, createdAt: new Date() });
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
        if (!tokenRes.ok) return { error: "Failed to refresh Gmail access token" };
        const { access_token } = await tokenRes.json() as { access_token: string };
        const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><p>Dear ${recipientName},</p><p>Assalamu Alaikum,</p>${body.includes("<") ? body : `<p>${body.replace(/\n/g, "</p><p>")}</p>`}<p>JazakAllah Khair</p><hr style="border:none;border-top:1px solid #eee;margin:24px 0"><p style="font-size:12px;color:#888">Sent via Hibba on behalf of ${ctx.userName} · Abdullah Quilliam Society</p></div>`;
        const rawMessage = [`From: "Abdullah Quilliam Society" <${GMAIL_FROM_EMAIL}>`, `To: ${recipientName} <${toEmail}>`, `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`, `MIME-Version: 1.0`, `Content-Type: text/html; charset=UTF-8`, ``, htmlBody].join("\r\n");
        const encodedMessage = Buffer.from(rawMessage).toString("base64url");
        const sendRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw: encodedMessage }),
        });
        if (!sendRes.ok) return { error: `Gmail API error: ${await sendRes.text()}` };
        return { success: true, message: `Email sent to ${recipientName} (${toEmail})` };
      } catch (err: any) {
        return { error: `Failed to send email: ${err.message}` };
      }
    }
    case "bulk_send_email": {
      const group = String(args.group || "").toLowerCase();
      const subject = String(args.subject || "").trim();
      const body = String(args.body || "").trim();
      if (!group || !subject || !body) return { error: "group, subject, and body are required" };
      try {
        const allTrustees = await db.select().from(trustees).where(eq(trustees.isActive, true));
        let recipients: Array<{ name: string; email: string }> = [];
        if (group === "trustees") recipients = allTrustees.filter(t => (t.role || "").toLowerCase().includes("trustee") && t.email).map(t => ({ name: t.fullName, email: t.email! }));
        else if (group === "staff" || group === "managers") recipients = allTrustees.filter(t => !(t.role || "").toLowerCase().includes("trustee") && t.email).map(t => ({ name: t.fullName, email: t.email! }));
        else if (group === "all") recipients = allTrustees.filter(t => t.email).map(t => ({ name: t.fullName, email: t.email! }));
        else return { error: `Unknown group '${group}'` };
        if (recipients.length === 0) return { error: `No recipients found in group '${group}'` };
        const result = await sendBulkGmail(recipients, subject, body);
        return { success: true, message: `Emails sent to ${result.sent} ${group}${result.failed > 0 ? ` (${result.failed} failed)` : ""}` };
      } catch (err: any) {
        return { error: `Bulk email failed: ${err.message}` };
      }
    }
    case "create_task": {
      const title = String(args.title || "").trim();
      if (!title) return { error: "Task title is required" };
      const owner = String(args.owner || ctx.userName).trim();
      const priority = ["low", "medium", "high", "critical"].includes(String(args.priority || "")) ? String(args.priority) : "medium";
      const dueDate = args.dueDate ? new Date(String(args.dueDate)) : null;
      const insertResult = await db.insert(complianceActions).values({ title, owner, source: "voice agent", priority, dueDate: dueDate && !isNaN(dueDate.getTime()) ? dueDate : null, notes: args.notes ? String(args.notes) : `Created via voice by ${ctx.userName}`, status: "open", createdByUserId: ctx.userId, createdAt: new Date(), updatedAt: new Date() });
      return { success: true, taskId: Number(insertResult[0].insertId), title, owner, priority };
    }
    case "schedule_meeting": {
      const title = String(args.title || "").trim();
      if (!title) return { error: "Meeting title is required" };
      const scheduledAt = new Date(String(args.scheduledAt || ""));
      if (isNaN(scheduledAt.getTime())) return { error: "Valid date/time is required" };
      const validTypes = ["trustee_board", "finance_committee", "safeguarding_committee", "building_committee", "agm", "extraordinary", "staff"];
      const meetingType = validTypes.includes(String(args.meetingType || "")) ? String(args.meetingType) as any : "staff";
      const insertResult = await db.insert(trusteeMeetings).values({ title, meetingType, scheduledAt, location: args.location ? String(args.location) : null, notes: args.notes ? String(args.notes) : null, status: "scheduled", createdByUserId: ctx.userId, createdAt: new Date(), updatedAt: new Date() });
      ctx.sideEffects.push({ type: "navigate", data: { path: "/meetings" } });
      return { success: true, meetingId: Number(insertResult[0].insertId), title, scheduledAt: scheduledAt.toISOString() };
    }
    case "generate_report": {
      const now = new Date();
      const year = Number(args.year) || now.getFullYear();
      const month = Number(args.month) || (now.getMonth() + 1);
      const monthName = new Date(year, month - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
      const from = new Date(year, month - 1, 1);
      const expenseRows = await db.select().from(receipts).where(gte(receipts.createdAt, from)).limit(100);
      const activeCampaigns = await db.select().from(fundraisingCampaigns).where(eq(fundraisingCampaigns.isActive, true));
      const totalExpenses = expenseRows.reduce((sum, r) => sum + Number(r.totalAmount || 0), 0);
      const totalRaised = activeCampaigns.reduce((sum, c) => sum + Number(c.currentAmount || 0), 0);
      ctx.sideEffects.push({ type: "navigate", data: { path: "/reports" } });
      return { success: true, period: monthName, summary: { totalExpenses: `£${totalExpenses.toFixed(2)}`, transactionCount: expenseRows.length, totalRaised: `£${totalRaised.toFixed(2)}` } };
    }
    case "flag_for_review": {
      await db.insert(voiceReviewQueue).values({ sessionId: ctx.dbSessionId, flaggedByUserId: ctx.userId, agentStatement: String(args.note || "Flagged by user via voice"), status: "pending", createdAt: new Date() });
      return { success: true, note: "Flagged for review" };
    }
    case "create_donor_note": {
      const donorId = Number(args.donorId);
      const content = String(args.content || "").trim();
      if (!donorId || !content) return { error: "donorId and content are required" };
      await db.insert(donorNotes).values({ donorId, note: content, isPinned: args.isPinned ? true : false, createdById: ctx.userId, createdByName: ctx.userName, createdAt: new Date() });
      return { success: true, message: `Note added to donor ${donorId}` };
    }
    case "get_prayer_times": {
      try {
        const today = new Date();
        const dateStr = `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${today.getFullYear()}`;
        const resp = await fetch(`https://api.aladhan.com/v1/timingsByCity/${dateStr}?city=Liverpool&country=United+Kingdom&method=15`);
        const data: any = await resp.json();
        if (data.code === 200 && data.data?.timings) {
          const t = data.data.timings;
          return { date: data.data.date?.readable || dateStr, startTimes: { fajr: t.Fajr, sunrise: t.Sunrise, dhuhr: t.Dhuhr, asr: t.Asr, maghrib: t.Maghrib, isha: t.Isha } };
        }
        return { error: "Could not fetch prayer times." };
      } catch (err: any) {
        return { error: `Prayer times unavailable: ${err.message}` };
      }
    }
    case "get_donation_info":
      return { methods: [{ method: "Online (Donorbox)", url: "https://theaqs.org" }, { method: "Bank Transfer", details: { accountName: "Abdullah Quilliam Society", accountNumber: "01158945", sortCode: "40-29-28" } }, { method: "Stripe Payment Link" }, { method: "Cash" }], charityNumber: "1194942", phone: "0151 260 3986" };
    case "get_mosque_info":
      return { name: "Abdullah Quilliam Mosque & National Heritage Centre", charityNumber: "1194942", address: "Brougham Terrace, Liverpool", phone: "0151 260 3986", websites: { heritage: "abdullahquilliam.org", operations: "theaqs.org" }, chair: "Galib Khan" };
    case "get_gift_aid_summary": {
      const rows = await db.select().from(giftAidDeclarations).orderBy(desc(giftAidDeclarations.createdAt)).limit(50);
      const active = rows.filter(r => (r as any).status === "active" || (r as any).isActive);
      return { totalDeclarations: rows.length, activeDeclarations: active.length };
    }
    case "get_recognition_tiers": {
      try {
        const rows = await db.select().from(recognitionTiers).orderBy(recognitionTiers.minAmount).limit(20);
        return { total: rows.length, tiers: rows.map(t => ({ id: t.id, name: t.name, minAmount: t.minAmount })) };
      } catch { return { error: "Recognition tiers data not available" }; }
    }
    case "get_qarde_hasan_register": {
      const statusFilter = String(args.status || "active").toLowerCase();
      const loans = statusFilter === "all"
        ? await db.select().from(loanApplications).orderBy(desc(loanApplications.createdAt)).limit(50)
        : await db.select().from(loanApplications).where(eq(loanApplications.status, statusFilter as any)).orderBy(desc(loanApplications.createdAt)).limit(50);
      return { total: loans.length, loans: loans.map(l => ({ id: l.id, borrower: l.borrowerName, amount: l.amount, status: l.status, purpose: l.purpose })) };
    }
    case "get_calendar": {
      const daysAhead = Number(args.days) || 30;
      const now = new Date();
      const future = new Date(now.getTime() + daysAhead * 86400000);
      const meetings = await db.select().from(trusteeMeetings).where(and(gte(trusteeMeetings.scheduledAt, now), sql`${trusteeMeetings.scheduledAt} <= ${future}`)).orderBy(trusteeMeetings.scheduledAt).limit(20);
      return { upcoming: meetings.length, meetings: meetings.map(m => ({ id: m.id, title: m.title, date: m.scheduledAt, type: m.meetingType })) };
    }
    case "get_email_templates":
      return { templates: [{ name: "friday_comms", label: "Friday Comms" }, { name: "urgent", label: "Urgent" }, { name: "trustee_update", label: "Trustee Update" }, { name: "staff_announcement", label: "Staff Announcement" }] };
    // Google Drive & Sheets
    case "list_drive_files": {
      try {
        const files = await listDriveFiles(args.folderId as string | undefined, Number(args.limit) || 20);
        return { files: files.map(f => ({ id: f.id, name: f.name, type: f.mimeType, link: f.webViewLink })), count: files.length };
      } catch (err: any) { return { error: `Drive error: ${err.message}` }; }
    }
    case "read_drive_file": {
      try {
        const file = await getDriveFile(String(args.fileId));
        return { name: file.name, mimeType: file.mimeType, content: file.content.slice(0, 3000), truncated: file.content.length > 3000 };
      } catch (err: any) { return { error: `Drive read error: ${err.message}` }; }
    }
    case "save_to_drive": {
      try {
        const result = await uploadToDrive(String(args.fileName), String(args.content), String(args.mimeType || "text/plain"), args.folderId as string | undefined);
        return { success: true, fileId: result.fileId, link: result.webViewLink };
      } catch (err: any) { return { error: `Drive save error: ${err.message}` }; }
    }
    case "update_drive_file": {
      try {
        const result = await updateDriveFileHelper(String(args.fileId), String(args.content), String(args.mimeType || "text/plain"));
        return { success: true, fileId: result.fileId, webViewLink: result.webViewLink };
      } catch (err: any) { return { error: `Drive update error: ${err.message}` }; }
    }
    case "create_expense_sheet": {
      try {
        const period = String(args.period || "this_month");
        const now = new Date();
        let startDate: Date, endDate: Date;
        if (period === "this_month") { startDate = new Date(now.getFullYear(), now.getMonth(), 1); endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
        else if (period === "last_month") { startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1); endDate = new Date(now.getFullYear(), now.getMonth(), 0); }
        else { startDate = new Date(now.getFullYear(), 0, 1); endDate = now; }
        const expenseRows = await db.select().from(receipts).where(and(gte(receipts.receiptDate, startDate), sql`${receipts.receiptDate} <= ${endDate}`));
        const expenses = expenseRows.map(r => ({ date: r.receiptDate ? new Date(r.receiptDate).toLocaleDateString("en-GB") : "", vendor: r.vendor || "", category: r.categoryName || "", amount: Number(r.amount || 0), department: r.departmentName || "", notes: r.notes || "" }));
        const title = String(args.title || `AQS Expenses — ${period}`);
        const result = await createExpenseSheet(title, expenses);
        return { success: true, spreadsheetUrl: result.spreadsheetUrl, expenseCount: expenses.length };
      } catch (err: any) { return { error: `Expense sheet error: ${err.message}` }; }
    }
    case "create_monthly_breakdown": {
      try {
        const now = new Date();
        const month = Number(args.month) || (now.getMonth() + 1);
        const year = Number(args.year) || now.getFullYear();
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        const expenseRows = await db.select().from(receipts).where(and(gte(receipts.receiptDate, startDate), sql`${receipts.receiptDate} <= ${endDate}`));
        const incomeRows = await db.select().from(incomeRecords).where(and(gte(incomeRecords.createdAt, startDate), sql`${incomeRecords.createdAt} <= ${endDate}`));
        const expenses = expenseRows.map(r => ({ date: r.receiptDate ? new Date(r.receiptDate).toLocaleDateString("en-GB") : "", vendor: r.vendor || "", category: r.categoryName || "", amount: Number(r.amount || 0), department: r.departmentName || "" }));
        const income = incomeRows.map(r => ({ date: r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-GB") : "", source: r.tenantName || r.categoryName || "", category: r.categoryName || r.subcategory || "", amount: Number(r.amount || 0), reference: r.notes || "" }));
        const title = String(args.title || `AQS Monthly Breakdown — ${String(month).padStart(2, "0")}/${year}`);
        const result = await createMonthlyBreakdownSheet(title, income, expenses);
        return { success: true, spreadsheetUrl: result.spreadsheetUrl };
      } catch (err: any) { return { error: `Monthly breakdown error: ${err.message}` }; }
    }
    // Gmail
    case "list_gmail_labels": {
      try {
        const labels = await listGmailLabels();
        return { labels: labels.filter(l => l.messagesTotal && l.messagesTotal > 0).map(l => ({ id: l.id, name: l.name, total: l.messagesTotal, unread: l.messagesUnread })) };
      } catch (err: any) { return { error: `Gmail labels error: ${err.message}` }; }
    }
    case "fetch_emails_by_label": {
      try {
        const emails = await fetchEmailsByLabel(String(args.labelId), Number(args.maxResults) || 10);
        return { emails: emails.map(e => ({ id: e.id, from: e.fromName || e.from, subject: e.subject, date: e.date.toLocaleDateString("en-GB"), snippet: e.snippet.slice(0, 150) })), count: emails.length };
      } catch (err: any) { return { error: `Gmail fetch error: ${err.message}` }; }
    }
    case "fetch_new_emails": {
      try {
        const query = args.query || "is:unread in:inbox";
        const emails = await fetchRecentEmails(Number(args.maxResults) || 5, String(query));
        return { emails: emails.map(e => ({ id: e.id, from: e.fromName || e.from, subject: e.subject, date: e.date.toLocaleDateString("en-GB"), snippet: e.snippet.slice(0, 150) })), count: emails.length };
      } catch (err: any) { return { error: `Gmail fetch error: ${err.message}` }; }
    }
    case "summarise_and_action_emails": {
      try {
        let emails;
        if (args.labelId) {
          const fetched = await fetchEmailsByLabel(String(args.labelId), Number(args.maxResults) || 5);
          emails = fetched.map(e => ({ from: e.fromName || e.from, subject: e.subject, body: e.body.slice(0, 1500) }));
        } else {
          const fetched = await fetchRecentEmails(Number(args.maxResults) || 5, "is:unread in:inbox");
          emails = fetched.map(e => ({ from: e.fromName || e.from, subject: e.subject, body: e.body.slice(0, 1500) }));
        }
        if (!emails || emails.length === 0) return { summary: "No emails found to summarise.", actions: [] };
        const prompt = `Summarise these ${emails.length} emails concisely:\n\n${emails.map((e, i) => `Email ${i + 1}:\nFrom: ${e.from}\nSubject: ${e.subject}\nBody: ${e.body}\n---`).join("\n")}`;
        const llmRes = await invokeLLM({ messages: [{ role: "system", content: "You are a concise email summariser for a UK Islamic charity. Extract key points and action items." }, { role: "user", content: prompt }] });
        return { summary: llmRes.choices?.[0]?.message?.content || "Could not generate summary.", emailCount: emails.length };
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
        if (recipientList.length === 0) return { error: "No suppliers found with email" };
        const recipients = recipientList.map(s => ({ name: s.supplierName, email: s.email! }));
        const result = await sendBulkGmail(recipients, subject, body);
        return { success: true, sent: result.sent, failed: result.failed };
      } catch (err: any) { return { error: `Supplier email error: ${err.message}` }; }
    }
    case "fetch_and_push_to_comms": {
      try {
        const { fetchAndPushToCommsHub } = await import("./googleServices") as any;
        const results = await fetchAndPushToCommsHub(String(args.labelId), String(args.labelName || "inbox"), Number(args.maxResults) || 10, ctx.userId);
        if (results.length === 0) return { message: "No new emails to process." };
        return { processed: results.length, emails: results.map((r: any) => ({ summary: r.summary, urgency: r.urgency, section: r.sectionSlug })) };
      } catch (err: any) { return { error: `Comms Hub push error: ${err.message}` }; }
    }
    case "get_daily_briefing": {
      try {
        const { collectDailyBriefingData } = await import("./googleServices") as any;
        const data = await collectDailyBriefingData();
        return { calendarToday: data.calendarToday.map((e: any) => ({ summary: e.summary, start: e.start.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }) })), urgentEmails: data.urgentEmails, unreadCount: data.unreadCount };
      } catch (err: any) { return { error: `Daily briefing error: ${err.message}` }; }
    }
    case "get_calendar_today": {
      try {
        const { fetchCalendarEvents } = await import("./googleServices") as any;
        const events = await fetchCalendarEvents(Number(args.daysAhead) || 1);
        return { events: events.map((e: any) => ({ summary: e.summary, start: e.start.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }), location: e.location || null })), count: events.length };
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
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ─── Proactive Greeting ─────────────────────────────────────────────────────
export async function buildGreeting(userName: string, userRole: string): Promise<string> {
  const now = new Date();
  const ukHour = parseInt(now.toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }));
  let timeGreeting: string;
  if (ukHour >= 5 && ukHour < 12) timeGreeting = "Good morning";
  else if (ukHour >= 12 && ukHour < 17) timeGreeting = "Good afternoon";
  else if (ukHour >= 17 && ukHour < 21) timeGreeting = "Good evening";
  else timeGreeting = "Assalamu Alaikum";

  const db = await getDb();
  let pendingCount = 0;
  if (db) {
    try {
      const pendingResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM receipts WHERE status = 'pending'`);
      pendingCount = Number((pendingResult as any)[0]?.[0]?.cnt ?? 0);
    } catch {}
  }

  // Get next prayer time
  let nextPrayer = "";
  try {
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${today.getFullYear()}`;
    const resp = await fetch(`https://api.aladhan.com/v1/timingsByCity/${dateStr}?city=Liverpool&country=United+Kingdom&method=15`);
    const data: any = await resp.json();
    if (data.code === 200 && data.data?.timings) {
      const t = data.data.timings;
      const prayers = [{ name: "Fajr", time: t.Fajr }, { name: "Dhuhr", time: t.Dhuhr }, { name: "Asr", time: t.Asr }, { name: "Maghrib", time: t.Maghrib }, { name: "Isha", time: t.Isha }];
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

  let greeting = `Assalamu Alaikum ${userName}, ${timeGreeting.toLowerCase()}.`;
  if (pendingCount > 0) greeting += ` You have ${pendingCount} pending item${pendingCount > 1 ? "s" : ""} for review.`;
  else greeting += ` All clear today, Alhamdulillah.`;
  if (nextPrayer) greeting += ` Next prayer is ${nextPrayer}.`;
  greeting += " How can I assist you?";
  return greeting;
}

// ─── Main Chat Function (tool-calling loop) ─────────────────────────────────
const MAX_TOOL_ITERATIONS = 8;

export async function nativeChat(
  input: NativeChatInput,
  user: { id: number; role: string; name: string; email?: string | null },
): Promise<NativeChatResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const ctx: ToolContext = {
    userId: user.id,
    userRole: user.role,
    userName: user.name || "User",
    screenContext: input.screenContext,
    entityContext: input.entityContext || null,
    language: "en-GB",
    dbSessionId: input.sessionId,
    sideEffects: [],
  };

  // Save user message
  await db.insert(voiceTranscripts).values({ sessionId: input.sessionId, role: "user", content: input.message, createdAt: new Date() });

  // Build conversation history
  const recentTranscripts = await db.select().from(voiceTranscripts)
    .where(eq(voiceTranscripts.sessionId, input.sessionId))
    .orderBy(desc(voiceTranscripts.createdAt)).limit(20);

  const screenDesc = buildScreenDescription(input.screenContext, input.entityContext);
  const systemMsg = `${SYSTEM_PROMPT}\n\nCurrent user: ${user.name} (role: ${user.role}). Current screen: ${screenDesc}. Answer questions about the current section directly.`;

  const messages: Message[] = [
    { role: "system", content: systemMsg },
    ...recentTranscripts.reverse().map((t: any) => ({
      role: t.role as "user" | "assistant",
      content: t.content,
    })),
  ];

  // Filter tools by role
  const availableTools = TOOLS.filter(t => hasPermission(t.function.name, user.role));

  let totalTokens = 0;
  const toolsExecuted: string[] = [];

  // Tool-calling loop
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await invokeLLM({
      messages,
      tools: availableTools,
      toolChoice: "auto",
    });

    // Handle API error responses
    if ((response as any).error) {
      console.error(`[NativeChat] LLM error:`, JSON.stringify((response as any).error));
      break;
    }
    totalTokens += response.usage?.total_tokens ?? 0;
    const choice = response.choices?.[0];
    if (!choice) break;

    const msg = choice.message;

    // If no tool calls, we have the final response
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const responseText = typeof msg.content === "string" ? msg.content : (msg.content as any)?.[0]?.text || "I couldn't process that.";

      // Save assistant response
      await db.insert(voiceTranscripts).values({ sessionId: input.sessionId, role: "assistant", content: responseText, createdAt: new Date() });

      // Track token usage
      await db.insert(voiceCostTracking).values({ userId: user.id, date: new Date(), tokenCount: totalTokens, estimatedCostPence: Math.ceil(totalTokens * 0.003) });

      return { response: responseText, sideEffects: ctx.sideEffects, tokensUsed: totalTokens, toolsExecuted };
    }

    // Process tool calls
    // Ensure each tool_call has an id (Gemini returns index but not always id)
    const toolCalls = msg.tool_calls.map((tc: any, idx: number) => ({
      ...tc,
      id: tc.id || `call_${Date.now()}_${idx}`,
    }));

    // Add assistant message with tool_calls to conversation
    const assistantMsg: any = { role: "assistant", content: msg.content || "", tool_calls: toolCalls };
    messages.push(assistantMsg);

    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      let toolArgs: Record<string, unknown> = {};
      try {
        toolArgs = JSON.parse(tc.function.arguments || "{}");
      } catch {}

      toolsExecuted.push(toolName);
      console.log(`[NativeChat] Executing tool: ${toolName}`, JSON.stringify(toolArgs).substring(0, 200));

      const result = await executeToolCall(toolName, toolArgs, ctx);

      // Add tool result to conversation — Gemini requires `name` on function_response
      messages.push({
        role: "tool",
        content: JSON.stringify(result).substring(0, 4000),
        tool_call_id: tc.id,
        name: toolName,
      });
    }
  }

  // If we exhausted iterations, return whatever we have
  const fallback = "I've gathered the information. Is there anything specific you'd like to know?";
  await db.insert(voiceTranscripts).values({ sessionId: input.sessionId, role: "assistant", content: fallback, createdAt: new Date() });
  await db.insert(voiceCostTracking).values({ userId: user.id, date: new Date(), tokenCount: totalTokens, estimatedCostPence: Math.ceil(totalTokens * 0.003) });
  return { response: fallback, sideEffects: ctx.sideEffects, tokensUsed: totalTokens, toolsExecuted };
}

// ─── Screen description helper ──────────────────────────────────────────────
function buildScreenDescription(path: string, entityContext?: string | null): string {
  const SCREEN_DESCRIPTIONS: Record<string, string> = {
    "/": "Scan Receipt — user is scanning or uploading a receipt",
    "/dashboard": "Dashboard — overview of finances, recent activity, and key metrics",
    "/receipts": "My Expenses — personal expense receipts and claims",
    "/reports": "Reports — financial reports and analytics charts",
    "/fundraising": "Fundraising — donation campaigns and targets",
    "/loans": "Qard Hasan Loans — interest-free Islamic loan applications",
    "/income": "Income & Rentals — Friday collections, rental income",
    "/accommodation": "Student Accommodation — tenant management",
    "/fintech": "Payment Hub — Stripe payments, bank transfers",
    "/donor-crm": "Donor CRM — donor relationship management",
    "/gift-aid": "Gift Aid & CRM+ — Gift Aid declarations, HMRC claims",
    "/pledges": "Pledges — outstanding pledge commitments",
    "/payroll": "Payroll — staff payroll management",
    "/monthly-expenses": "Monthly Expenses — monthly expense tracking",
    "/reconciliation": "Reconciliation — bank reconciliation",
    "/donors": "Donors — full donor database",
    "/campaigns": "Campaigns — fundraising campaign management",
    "/admin": "Admin Panel — system administration",
    "/trustees": "Trustees & Staff Contacts — trustee board and staff directory",
    "/compliance": "Compliance Cockpit — regulatory compliance",
    "/meetings": "Meetings & Onboarding — meeting schedule",
    "/comms-hub": "Comms Hub — centralised communications",
    "/comms-inbox": "Master Inbox — all incoming communications",
    "/bills-utilities": "Bills & Utilities — utility bills",
    "/training-tracker": "Training Tracker — staff training",
    "/facilities": "Facilities & Bookings — room bookings",
    "/bistro87": "Bistro 87 — cafe orders and revenue",
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
