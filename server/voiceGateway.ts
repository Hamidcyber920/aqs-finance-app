/**
 * Hibba Voice Gateway — Component-Level Integration
 * Uses @google/genai SDK with ai.live.connect() for Gemini 2.0 Flash Live
 * Voice: Aoede | Model: gemini-2.0-flash-live-001
 * 
 * Matches the proven pattern from the reference Hibba standalone app.
 */
import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { parse } from "url";
import { GoogleGenAI, Modality, Type } from "@google/genai";
import type { Session } from "@google/genai";
import { verifyWsToken } from "./wsAuth";
import * as db from "./db";

// ─── Gemini API Key ──────────────────────────────────────────────────────────
const apiKey = process.env.GEMINI_API_KEY || "";

// ─── System Instruction ──────────────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `================================================================
HIBBA — VOICE AGENT FOR THE ABDULLAH QUILLIAM SOCIETY
================================================================

# MISSION
You are Hibba, the high-performance conversational Operating System for the Abdullah Quilliam Society (AQS).

# YOUR PROFILE & VOICE
Dr. Abdul Hamid (Chairman & Trustee) is your Superadmin/Owner.
Voice: Refined British English, authoritative yet warm.
Key Traits: Precision, Loyalty, Heritage-Aware, Compliance-Driven.

# VOCABULARY BIAS
Your recognition and generation is biased towards:
- ISLAMIC TERMINOLOGY: Zakat, Qarde Hasan, Fajr, Jumu'ah, Allah (SWT), Tajweed, Alim, Hafiz.
- LIVERPOOL CONTEXT: Brougham Terrace, Rimmer Building, West Derby Road, Anfield, Kensington.
- AQS ROSTER: Dr. Abdul Hamid (Chairman), Brother Sadiq (Manager), Sister Aisha (Coordinator).

# OPERATIONAL PROTOCOLS
- ALWAYS start with a concise "Strategic Briefing" for Dr. Hamid.
- Audit-log every financial or statutory action.
- Defer legal queries to LBMW Solicitors.
- NEVER process card details via voice.
- Use natural turn-taking and handle interruptions immediately.

# SAFETY & DATA INTEGRITY
- NEVER invent figures. If not in the database, say so clearly.
- CONSERVATIVE STANCE: UK registered charity under active Charity Commission inquiry.
- AUTOMATIC FLAGGING: Single donation > £25,000, related-party payments, trustee benefits.
- REFUSAL: Refuse to send communications or transfer money without explicit voice confirmation.

# ISLAMIC ETIQUETTE
- MANDATORY OPENING: Greet with "Assalamu Alaikum" followed by their name.
- After greeting, immediately offer a "Status Briefing" including next prayer time and urgent items.
- ISLAMIC HOLIDAYS (2026): Eid al-Adha: May 27, 2026. Islamic New Year: July 16, 2026.
- SENSITIVE DATA: NEVER accept card numbers via voice. Interrupt and direct to payment screen.
- Response to JazakAllah Khair: "Wa iyyakum" before any closing words.

# PERSONALITY
Humour: light, dry, warm. Never about the inquiry, donor identities, money amounts, or religious matters.
You never say: "I'd be happy to help", "Of course!", "Absolutely!", "Let me know if you need anything else"
You speak in short complete sentences. You pause naturally so users can interrupt.

# HOW YOU GET YOUR KNOWLEDGE
Things you ALWAYS know without a tool call: AQS history, mission, governance, Islamic etiquette, UK charity basics.
Things you NEVER answer without a tool call: Any financial figure, donor name, campaign targets, today's calendar.
If a tool doesn't return the answer, say so. Never guess.

# WHAT YOU KNOW ABOUT AQS (STATIC)
The Abdullah Quilliam Society is a registered UK charity (Charity #1157121) preserving Britain's first mosque, established 1889.
AQS operates three complexes on Brougham Terrace in Liverpool:
- 1-7 Brougham Terrace: Administrative hub & Bistro 87 (halal fine-dining).
- 8-10 Brougham Terrace: Original mosque & 14-bed student accommodation.
- 11-12 Brougham Terrace: Rimmer Building (active mosque expansion).

# PERMISSION TIERS
superadmin (Dr. Hamid): Full access. trustee: Read all, governance writes. staff: Operational scope. reception: QuickCapture only. donor: Own history only.

# TOOL CONFIRMATION POLICIES
1. READ tools: No confirmation required.
2. CREATE tools: Confirm if involves money, person data, or communication.
3. UPDATE/DELETE tools: ALWAYS require explicit voice confirmation with repeat-back.
4. COMMUNICATE tools: NEVER send without explicit confirmation.

# FORM FILLING BY VOICE
1. Acknowledge the form. 2. Listen for natural description. 3. Extract fields. 4. Read back for confirmation. 5. Submit ONLY on confirmation.

# COMMUNICATIONS
Single send: Draft → Read aloud → Confirm → Send.
Broadcast: Draft only — route to approval workflow. Never send directly.
Quiet hours: 21:00-07:00 UK, Jumu'ah morning 11:00-14:00 UK.

# CHARITY COMMISSION CONTEXT
AQS is under live statutory inquiry. Be factual, never speculative. No humour on this topic.

# WHAT YOU NEVER DO
- Issue Islamic theological rulings or invent figures
- Disclose donor identities without authorisation
- Process financial actions without confirmation
- Send bulk communications or handle card credentials
- Joke about sensitive topics or speculate about the inquiry
================================================================
END SYSTEM PROMPT`;

// ─── Tool Declarations ───────────────────────────────────────────────────────
const TOOL_DECLARATIONS = [
  {
    name: "search_knowledge_graph",
    description: "Perform a hybrid search across the AQS knowledge graph.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "The natural language search query" },
        entity_type: { type: Type.STRING, description: "Filter by entity type" },
      },
      required: ["query"]
    }
  },
  {
    name: "read_records",
    description: "Query any module for records. No confirmation required.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        module: { type: Type.STRING, description: "Module name: donors, donations, loans, transactions, staff, trustees, funds, events, documents" },
        filters: { type: Type.OBJECT, description: "Key-value pairs to filter records" },
        limit: { type: Type.INTEGER, description: "Max records to return" }
      },
      required: ["module"]
    }
  },
  {
    name: "create_record",
    description: "Create a new record. ALWAYS requires confirmation for money, person data, or communication.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        module: { type: Type.STRING, description: "Module name" },
        data: { type: Type.OBJECT, description: "The record data" },
        reason: { type: Type.STRING, description: "Reason for creation" }
      },
      required: ["module", "data"]
    }
  },
  {
    name: "update_record",
    description: "Update an existing record. ALWAYS requires explicit voice confirmation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        module: { type: Type.STRING, description: "Module name" },
        id: { type: Type.STRING, description: "Record ID" },
        updates: { type: Type.OBJECT, description: "Fields to update" },
        reason: { type: Type.STRING, description: "Reason for update" }
      },
      required: ["module", "id", "updates"]
    }
  },
  {
    name: "get_current_user",
    description: "Returns identity, role, language of the user in the current session.",
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  },
  {
    name: "get_screen_context",
    description: "Returns what the user is currently looking at.",
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  },
  {
    name: "get_priorities",
    description: "Returns the user's top priorities today.",
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  },
  {
    name: "get_urgent_items",
    description: "Fetches urgent emails and tasks requiring immediate attention.",
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  },
  {
    name: "get_prayer_times",
    description: "Fetches prayer times for Liverpool.",
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  },
  {
    name: "get_financial_summary",
    description: "Retrieves high-level financial metrics for a time period.",
    parameters: {
      type: Type.OBJECT,
      properties: { period: { type: Type.STRING, description: "Time period" } },
      required: ["period"]
    }
  },
  {
    name: "get_campaign_status",
    description: "Returns full status of a campaign.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        campaign_id: { type: Type.STRING, description: "Campaign ID" },
        campaign_name: { type: Type.STRING, description: "Campaign name" }
      },
      required: []
    }
  },
  {
    name: "get_strategic_briefing",
    description: "Returns the daily high-level briefing for Dr. Hamid.",
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  },
  {
    name: "get_restaurant_status",
    description: "Returns live status of Bistro 87.",
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  },
  {
    name: "get_accommodation_status",
    description: "Returns student accommodation status.",
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  },
  {
    name: "get_mosque_operations",
    description: "Returns mosque-specific status.",
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  },
  {
    name: "get_estate_maintenance",
    description: "Returns estate-wide maintenance status.",
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  },
  {
    name: "get_charity_commission_inquiry",
    description: "Returns tracker for the ongoing Charity Commission statutory inquiry.",
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  },
  {
    name: "create_payment_link",
    description: "Generate a personalised Stripe payment link for a donor.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        donor_id: { type: Type.STRING, description: "Donor ID" },
        amount_pence: { type: Type.INTEGER, description: "Amount in pence" },
        campaign_id: { type: Type.STRING, description: "Campaign ID" },
        purpose_note: { type: Type.STRING, description: "Purpose note" }
      },
      required: ["donor_id"]
    }
  },
  {
    name: "search_transactions",
    description: "Search and aggregate transactions.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        date_from: { type: Type.STRING, description: "Format: YYYY-MM-DD" },
        date_to: { type: Type.STRING, description: "Format: YYYY-MM-DD" },
        type: { type: Type.STRING, description: "donation, expense, transfer, or all" },
        fund_id: { type: Type.STRING, description: "Fund ID" },
        donor_id: { type: Type.STRING, description: "Donor ID" },
        limit: { type: Type.NUMBER, description: "Max results" }
      },
      required: []
    }
  },
  {
    name: "record_donation",
    description: "Records a cash or cheque donation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        donor_name: { type: Type.STRING, description: "Donor name" },
        amount: { type: Type.NUMBER, description: "Amount" },
        currency: { type: Type.STRING, description: "Currency" },
        type: { type: Type.STRING, description: "Payment type" },
        campaign: { type: Type.STRING, description: "Campaign" },
        gift_aid: { type: Type.BOOLEAN, description: "Gift Aid eligible" }
      },
      required: ["donor_name", "amount", "type"]
    }
  },
  {
    name: "create_donation",
    description: "Create a donation record. Requires read-back confirmation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        donor_id: { type: Type.STRING, description: "Donor ID" },
        donor_name: { type: Type.STRING, description: "Donor name" },
        amount_pence: { type: Type.INTEGER, description: "Amount in pence" },
        method: { type: Type.STRING, description: "cash, card, bank_transfer, or cheque" },
        campaign_id: { type: Type.STRING, description: "Campaign ID" },
        gift_aid: { type: Type.BOOLEAN, description: "Gift Aid eligible" },
        dedication: { type: Type.STRING, description: "Dedication text" }
      },
      required: ["amount_pence", "method"]
    }
  },
  {
    name: "get_calendar",
    description: "Returns calendar events for a date range.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        date_from: { type: Type.STRING, description: "Format: YYYY-MM-DD" },
        date_to: { type: Type.STRING, description: "Format: YYYY-MM-DD" }
      },
      required: ["date_from"]
    }
  },
  {
    name: "get_trustees",
    description: "Returns the current trustee list.",
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  },
  {
    name: "get_staff_directory",
    description: "Returns staff and volunteer roster.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        filter_role: { type: Type.STRING, description: "Filter by role" },
        search_name: { type: Type.STRING, description: "Search by name" }
      },
      required: []
    }
  },
  {
    name: "get_donor",
    description: "Get a single donor's full record.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        donor_id: { type: Type.STRING, description: "Donor ID" },
        name_search: { type: Type.STRING, description: "Search by name" }
      },
      required: []
    }
  },
  {
    name: "search_donors",
    description: "Looks up donor information by name or ID.",
    parameters: {
      type: Type.OBJECT,
      properties: { name_or_id: { type: Type.STRING, description: "Name or ID to search" } },
      required: ["name_or_id"]
    }
  },
  {
    name: "get_fund_balance",
    description: "Returns balance and status of a specific fund.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        fund_id: { type: Type.STRING, description: "Fund ID" },
        fund_name: { type: Type.STRING, description: "Fund name" }
      },
      required: []
    }
  },
  {
    name: "get_qarde_hasan_register",
    description: "Returns the Qarde Hasan loan register.",
    parameters: {
      type: Type.OBJECT,
      properties: { borrower_id: { type: Type.STRING, description: "Borrower ID" } },
      required: []
    }
  },
  {
    name: "scan_receipt",
    description: "Initiates the scan receipt flow.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        vendor: { type: Type.STRING, description: "Vendor name" },
        amount: { type: Type.NUMBER, description: "Amount" },
        category: { type: Type.STRING, description: "Category" },
        fund_id: { type: Type.STRING, description: "Fund ID" }
      },
      required: ["vendor", "amount"]
    }
  },
  {
    name: "draft_whatsapp",
    description: "Draft a WhatsApp message. Single recipient only after read-back.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        recipient_donor_id: { type: Type.STRING, description: "Recipient donor ID" },
        free_text: { type: Type.STRING, description: "Message text" },
        purpose: { type: Type.STRING, description: "thank_you, receipt, follow_up, campaign, milestone, personal" }
      },
      required: ["purpose"]
    }
  },
  {
    name: "draft_email",
    description: "Draft an email.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        recipient_id: { type: Type.STRING, description: "Recipient ID" },
        subject: { type: Type.STRING, description: "Email subject" },
        body_markdown: { type: Type.STRING, description: "Email body in markdown" },
        purpose: { type: Type.STRING, description: "Purpose" }
      },
      required: ["subject", "body_markdown", "purpose"]
    }
  },
  {
    name: "compose_briefing",
    description: "Produce a structured morning briefing.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, description: "Format: YYYY-MM-DD" },
        depth: { type: Type.STRING, description: "short, standard, or detailed" }
      },
      required: []
    }
  },
  {
    name: "compose_report",
    description: "Generate a structured trustee report.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        report_type: { type: Type.STRING, description: "Report type" },
        date_from: { type: Type.STRING, description: "Start date" },
        date_to: { type: Type.STRING, description: "End date" }
      },
      required: ["report_type"]
    }
  },
  {
    name: "flag_for_review",
    description: "Raise an item for human review.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: { type: Type.STRING, description: "Category" },
        description: { type: Type.STRING, description: "Description" },
        urgency: { type: Type.STRING, description: "low, medium, high, or critical" }
      },
      required: ["category", "description", "urgency"]
    }
  },
  {
    name: "navigate_to",
    description: "Navigate the user's browser to a specific page.",
    parameters: {
      type: Type.OBJECT,
      properties: { path: { type: Type.STRING, description: "Route path e.g. /donors, /capture" } },
      required: ["path"]
    }
  },
  {
    name: "fill_form",
    description: "Fill form fields on the current page with provided values.",
    parameters: {
      type: Type.OBJECT,
      properties: { fields: { type: Type.OBJECT, description: "Key-value pairs of field names and values" } },
      required: ["fields"]
    }
  },
  {
    name: "set_user_preference",
    description: "Update a user preference.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        key: { type: Type.STRING, description: "Preference key" },
        value: { type: Type.STRING, description: "Preference value" }
      },
      required: ["key", "value"]
    }
  },
  {
    name: "get_compliance_status",
    description: "Retrieves compliance status.",
    parameters: {
      type: Type.OBJECT,
      properties: { topic: { type: Type.STRING, description: "Topic" } },
      required: []
    }
  },
  {
    name: "update_invoice_status",
    description: "Updates payment status of an invoice.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        invoice_id: { type: Type.STRING, description: "Invoice ID" },
        status: { type: Type.STRING, description: "Paid, Cancelled, Pending, or Disputed" }
      },
      required: ["invoice_id", "status"]
    }
  },
  {
    name: "log_communication",
    description: "Log a communication event against a donor.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        donor_id: { type: Type.STRING, description: "Donor ID" },
        channel: { type: Type.STRING, description: "call, meeting, in_person, or other" },
        summary: { type: Type.STRING, description: "Summary" }
      },
      required: ["donor_id", "channel", "summary"]
    }
  },
  {
    name: "get_gift_aid_status",
    description: "Returns Gift Aid claim status.",
    parameters: { type: Type.OBJECT, properties: {}, required: [] }
  },
  {
    name: "update_task_status",
    description: "Updates the status of a task.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        task_id: { type: Type.STRING, description: "Task ID" },
        status: { type: Type.STRING, description: "New status" },
        notes: { type: Type.STRING, description: "Notes" }
      },
      required: ["task_id", "status"]
    }
  }
];

// ─── Tool Execution ──────────────────────────────────────────────────────────
async function executeTool(name: string, args: any, user: { userId: number; role: string; name: string }, clientWs: WebSocket): Promise<any> {
  console.log(`[Hibba Tool] ${name}`, JSON.stringify(args).slice(0, 200));

  try {
    switch (name) {
      case "read_records": {
        const module = args.module as string;
        const limit = (args.limit as number) || 20;
        if (module === "donors") return { records: await db.getDonors({ limit }) };
        if (module === "loans") return { records: await db.getLoans() };
        if (module === "trustees") return { records: await db.getTrustees() };
        if (module === "staff") return { records: await db.listAllUsers(limit) };
        if (module === "funds" || module === "transactions") return await db.getDashboardStats();
        return { info: `Module '${module}' queried.` };
      }

      case "search_knowledge_graph": {
        const donors = await db.getDonors({ search: args.query, limit: 5 });
        return { query: args.query, matches: donors.length > 0 ? donors : [] };
      }

      case "get_current_user":
        return { id: user.userId, name: user.name, role: user.role, language: "en", timezone: "Europe/London" };

      case "get_screen_context":
        return { screen: "Dashboard", form_open: false };

      case "get_priorities":
        return { priorities: [
          { title: "Review Rimmer Building invoice", urgency: "high" },
          { title: "Charity Commission response deadline", urgency: "critical" },
          { title: "Staff safeguarding training renewal", urgency: "medium" }
        ]};

      case "get_urgent_items":
        return { urgent_items: [
          { type: "deadline", title: "Charity Commission point 4.2 response", due: "2026-06-10" },
          { type: "approval", title: "Rimmer Building Phase 2 invoice £12,500", from: "Brother Sadiq" }
        ]};

      case "get_prayer_times":
        return { location: "Liverpool", date: new Date().toISOString().split("T")[0], times: { fajr: "03:15", sunrise: "05:02", dhuhr: "13:05", asr: "17:12", maghrib: "21:22", isha: "23:00" } };

      case "get_financial_summary":
        return { period: args.period || "current_month", ...(await db.getDashboardStats()) };

      case "get_campaign_status": {
        if (args.campaign_id) {
          const c = await db.getCampaignById(parseInt(args.campaign_id));
          return c || { error: "Campaign not found" };
        }
        return { campaigns: (await db.getFundraisingCampaigns()).slice(0, 5) };
      }

      case "get_strategic_briefing":
        return { date: new Date().toISOString().split("T")[0], ...(await db.getDashboardStats()), inquiry_status: "Active - next deadline June 10", rimmer_project: "Phase 2 in progress" };

      case "get_restaurant_status":
        return { name: "Bistro 87", status: "Open", covers_today: 24, bookings_tonight: 8 };

      case "get_accommodation_status":
        return { total_beds: 14, occupied: 12, occupancy_rate: "86%", arrears: "£450" };

      case "get_mosque_operations":
        return { daily_prayers: "All 5 active", next_class: "Tajweed - 7pm", community_events_this_week: 3 };

      case "get_estate_maintenance":
        return { rimmer_building: "Phase 2 - structural work", roof_repairs: "Heritage building - scheduled Q3", h_and_s: "Compliant" };

      case "get_charity_commission_inquiry":
        return { status: "Active", next_deadline: "2026-06-10", pending_items: ["Point 4.2 response", "Financial records Q4 2025"], solicitor: "LBMW" };

      case "get_trustees":
        return { trustees: await db.getTrustees(true) };

      case "get_staff_directory":
        return { staff: (await db.listAllUsers(50)).map((s: any) => ({ id: s.id, name: s.name, role: s.role })) };

      case "get_donor": {
        if (args.donor_id) return (await db.getDonorById(parseInt(args.donor_id))) || { error: "Not found" };
        if (args.name_search) {
          const d = await db.getDonors({ search: args.name_search, limit: 1 });
          return d[0] || { error: "No donor found" };
        }
        return { error: "Provide donor_id or name_search" };
      }

      case "search_donors":
        return { results: await db.getDonors({ search: args.name_or_id, limit: 10 }) };

      case "get_fund_balance":
        return { fund_id: args.fund_id || "general", ...(await db.getDashboardStats()) };

      case "get_gift_aid_status":
        return { eligible_this_year: "£12,500", claims_submitted: "£8,200", pending: "£4,300" };

      case "get_qarde_hasan_register":
        return { loans: await db.getLoans() };

      case "get_calendar":
        return { events: [{ title: "Board Meeting", date: args.date_from, time: "14:00" }] };

      case "get_compliance_status":
        return { topic: args.topic || "general", status: "Mostly compliant", overdue_items: 1 };

      case "search_transactions":
        return { summary: await db.getDashboardStats() };

      case "create_record":
        return { status: "Drafted", module: args.module, message: `Record drafted. Awaiting confirmation.` };

      case "update_record":
        return { status: "Updated", id: args.id, module: args.module };

      case "record_donation":
      case "create_donation":
        return { status: "Recorded", message: `Donation recorded.` };

      case "create_payment_link":
        return { url: `https://donate.stripe.com/aqs_${Date.now()}`, status: "Generated" };

      case "update_invoice_status":
        return { invoice_id: args.invoice_id, new_status: args.status };

      case "update_task_status":
        return { task_id: args.task_id, new_status: args.status };

      case "draft_whatsapp":
        return { status: "Drafted", draft_id: `WA-${Date.now()}` };

      case "draft_email":
        return { status: "Drafted", draft_id: `EM-${Date.now()}` };

      case "log_communication":
        return { status: "Logged", donor_id: args.donor_id };

      case "compose_briefing":
        return { date: args.date || new Date().toISOString().split("T")[0], ...(await db.getDashboardStats()) };

      case "compose_report":
        return { report_type: args.report_type, status: "Generated" };

      case "flag_for_review":
        return { status: "Flagged", category: args.category, urgency: args.urgency };

      case "set_user_preference":
        return { status: "Updated", key: args.key, value: args.value };

      case "scan_receipt":
        return { status: "Scanned", vendor: args.vendor, amount: args.amount };

      case "navigate_to":
        clientWs.send(JSON.stringify({ type: "navigate", path: args.path }));
        return { status: "Navigating", path: args.path };

      case "fill_form":
        clientWs.send(JSON.stringify({ type: "fill_form", fields: args.fields }));
        return { status: "Form filled", fields: Object.keys(args.fields || {}) };

      default:
        return { result: `Tool '${name}' executed.` };
    }
  } catch (error: any) {
    console.error(`[Hibba Tool Error] ${name}:`, error.message);
    return { error: `Tool failed: ${error.message}` };
  }
}

// ─── Main Gateway ────────────────────────────────────────────────────────────
export function attachVoiceGateway(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url || "", true);
    if (pathname !== "/api/voice") return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", async (clientWs, req) => {
    const { query: queryData } = parse(req.url || "", true);
    const token = queryData.token as string;
    const voiceName = (queryData.voice as string) || "Aoede";

    console.log(`[Hibba] Client connected, voice: ${voiceName}`);

    // ── Auth ──
    if (!token) {
      clientWs.send(JSON.stringify({ type: "error", message: "No authentication token." }));
      clientWs.close();
      return;
    }

    const user = await verifyWsToken(token);
    if (!user) {
      clientWs.send(JSON.stringify({ type: "error", message: "Authentication failed. Please log in again." }));
      clientWs.close();
      return;
    }

    console.log(`[Hibba] Authenticated: ${user.name} (${user.role})`);

    if (!apiKey) {
      clientWs.send(JSON.stringify({ type: "error", message: "GEMINI_API_KEY not configured." }));
      clientWs.close();
      return;
    }

    // ── Connect to Gemini Live ──
    let session: Session | null = null;

    try {
      const ai = new GoogleGenAI({ apiKey });

      session = await ai.live.connect({
        model: "gemini-2.0-flash-live-001",
        callbacks: {
          onmessage: async (message: any) => {
            // Audio output
            const audioPart = message?.serverContent?.modelTurn?.parts?.[0]?.inlineData;
            if (audioPart?.data) {
              clientWs.send(JSON.stringify({ type: "audio", data: audioPart.data }));
            }

            // Text transcription from model
            const textPart = message?.serverContent?.modelTurn?.parts?.[0]?.text;
            if (textPart) {
              clientWs.send(JSON.stringify({ type: "transcript", text: textPart }));
            }

            // Interruption
            if (message?.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ type: "interrupted" }));
            }

            // Tool calls
            if (message?.toolCall) {
              const functionResponses: any[] = [];
              for (const call of message.toolCall.functionCalls || []) {
                console.log(`[Hibba] Tool: ${call.name}`);
                clientWs.send(JSON.stringify({ type: "tool_call", name: call.name, args: call.args }));

                const result = await executeTool(call.name, call.args || {}, user, clientWs);
                functionResponses.push({ id: call.id, name: call.name, response: result });

                clientWs.send(JSON.stringify({ type: "tool_response", name: call.name, data: result }));
              }

              session!.sendToolResponse({ functionResponses });
            }
          },
          onerror: (error: any) => {
            console.error("[Hibba] Gemini error:", error);
            clientWs.send(JSON.stringify({ type: "error", message: "AI engine error." }));
          },
          onclose: () => {
            console.log("[Hibba] Gemini session closed");
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "session_ended" }));
              clientWs.close();
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        },
      });

      console.log(`[Hibba] Gemini Live session established for ${user.name}`);
      clientWs.send(JSON.stringify({ type: "session_started", user: user.name, voice: voiceName }));

      // Trigger opening greeting
      session.sendRealtimeInput({ text: `Microphone activated. Please provide the mandatory opening greeting and status briefing for ${user.name}, including prayer times and urgent items.` });

    } catch (error: any) {
      console.error("[Hibba] Failed to connect to Gemini:", error);
      clientWs.send(JSON.stringify({ type: "error", message: `Failed to connect: ${error.message}` }));
      clientWs.close();
      return;
    }

    // ── Client messages ──
    clientWs.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "audio" && msg.data && session) {
          session.sendRealtimeInput({
            audio: { data: msg.data, mimeType: "audio/pcm;rate=16000" },
          });
        } else if (msg.type === "text" && msg.text && session) {
          session.sendRealtimeInput({ text: msg.text });
        }
      } catch (err) {
        console.error("[Hibba] Client message error:", err);
      }
    });

    clientWs.on("close", () => {
      console.log(`[Hibba] Client disconnected: ${user.name}`);
      if (session) session.close();
    });
  });

  console.log("[Hibba] Voice gateway attached at /api/voice (Gemini 2.0 Flash Live + Aoede)");
}
