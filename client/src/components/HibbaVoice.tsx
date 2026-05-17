/**
 * HibbaVoice — Client-Side Voice Assistant
 *
 * Connects DIRECTLY to Gemini Live API from the browser using an
 * ephemeral token obtained via tRPC. No server proxy needed.
 *
 * Features:
 *   - Sentence-level transcript display (buffers words, shows complete sentences)
 *   - Minimizable panel (audio continues while browsing other screens)
 *   - Speaker labels (Hibba / You)
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Mic,
  MicOff,
  X,
  Loader2,
  Phone,
  Minimize2,
  Maximize2,
  Volume2,
} from "lucide-react";
import { startAudioCapture, AudioPlayer, type AudioCaptureHandle } from "@/lib/audio-utils";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// ── Speaker mode detection ──
// Heuristic: if no headphones/earpiece detected, assume speaker mode
async function detectSpeakerMode(): Promise<boolean> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return false;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioOutputs = devices.filter(d => d.kind === "audiooutput");
    // If only 1 output (built-in speaker) or none labelled as headphone/earphone, assume speaker
    const hasHeadphones = audioOutputs.some(d => {
      const label = (d.label || "").toLowerCase();
      return label.includes("headphone") || label.includes("earphone") ||
             label.includes("airpod") || label.includes("bluetooth") ||
             label.includes("headset") || label.includes("earbud");
    });
    return !hasHeadphones;
  } catch {
    return false; // Can't detect, assume private
  }
}

// ── Runtime context builder ──
// Builds dynamic context about the current page, visible forms, and entity
interface RuntimeContext {
  currentPage: string;
  formFields: string[];
  entityType: string | null;
  entityId: string | null;
}

// Known form fields per page path
const PAGE_FORM_FIELDS: Record<string, string[]> = {
  "/loans": ["applicantName", "applicantEmail", "applicantPhone", "applicantAddress", "amount", "purpose", "guarantorName", "notes", "termValue"],
  "/payroll": ["employeeName", "niNumber", "taxCode", "grossPay", "incomeTax", "netPay", "paymentMethod"],
  "/income": ["amount", "incomeDate", "description", "category", "subcategory", "reference"],
  "/capture": ["amount", "date", "description", "vendor", "category", "paymentMethod"],
  "/bills-utilities": ["amount", "billDate", "notes", "periodStart", "periodEnd"],
  "/accommodation": ["tenantName", "email", "phone", "roomNumber", "monthlyRent"],
  "/donors": ["name", "email", "phone", "address", "notes"],
  "/fundraising": ["name", "targetAmount", "description"],
};

function buildRuntimeContext(pathname: string): RuntimeContext {
  // Extract entity type and ID from URL patterns like /loans/123
  const parts = pathname.split("/").filter(Boolean);
  let entityType: string | null = null;
  let entityId: string | null = null;
  if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1])) {
    entityId = parts[parts.length - 1];
    entityType = parts[parts.length - 2];
  }

  // Match form fields for the base path
  const basePath = "/" + (parts[0] || "");
  const formFields = PAGE_FORM_FIELDS[basePath] || [];

  return { currentPage: pathname, formFields, entityType, entityId };
}

type State = "idle" | "connecting" | "connected" | "error";

/** A chat-style message in the transcript */
interface ChatMessage {
  id: string;
  speaker: "hibba" | "user" | "system";
  text: string;
  final: boolean; // true when the sentence/turn is complete
}

// ── Navigation routes Hibba can use ──
const NAV_ROUTES: Record<string, string> = {
  // DAILY
  "home": "/",
  "scan": "/",
  "scan receipt": "/",
  "capture": "/capture",
  "dashboard": "/dashboard",
  // FINANCE
  "my expenses": "/receipts",
  "receipts": "/receipts",
  "expenses": "/monthly-expenses",
  "monthly expenses": "/monthly-expenses",
  "income": "/income",
  "income and rentals": "/income",
  "bills": "/bills-utilities",
  "bills and utilities": "/bills-utilities",
  "utilities": "/bills-utilities",
  "payment hub": "/fintech",
  "fintech": "/fintech",
  "reconciliation": "/reconciliation",
  "loans": "/loans",
  "qarde hasan": "/loans",
  "qarde hasan loans": "/loans",
  "payroll": "/payroll",
  // DONORS & FUNDRAISING
  "donors": "/donor-crm",
  "donor crm": "/donor-crm",
  "campaigns": "/campaigns",
  "gift aid": "/gift-aid",
  "fundraising": "/fundraising",
  // Tabs inside Donors (old routes still work)
  "pledges": "/pledges",
  "donor pipeline": "/donor-pipeline",
  "cultivation pipeline": "/donor-pipeline",
  "major donor": "/major-donor",
  "major donor dd": "/major-donor",
  "saved views": "/saved-views",
  "recognition tiers": "/recognition-tiers",
  "donors wall": "/donors-wall",
  "qr codes": "/qr-codes",
  // COMMUNICATIONS
  "communications": "/communications",
  "comms hub": "/comms-hub",
  "broadcasts": "/comms-hub",
  "inbox": "/comms-inbox",
  "master inbox": "/comms-inbox",
  "meetings": "/meetings",
  "meetings and onboarding": "/meetings",
  // REPORTS
  "reports": "/reports",
  // OPERATIONS
  "bistro": "/bistro87",
  "bistro 87": "/bistro87",
  "accommodation": "/accommodation",
  "student accommodation": "/accommodation",
  "facilities": "/facilities",
  "facilities and bookings": "/facilities",
  "training": "/training-tracker",
  "training tracker": "/training-tracker",
  // GOVERNANCE
  "trustee dashboard": "/trustee-dashboard",
  "compliance": "/compliance",
  "compliance cockpit": "/compliance",
  // Tabs inside Compliance Cockpit (old routes still work)
  "conflicts register": "/conflicts-register",
  "decisions": "/decisions",
  "decisions register": "/decisions",
  "bulk approvals": "/bulk-approvals",
  "lbmw": "/lbmw-correspondence",
  "lbmw correspondence": "/lbmw-correspondence",
  // People (merged)
  "people": "/trustees",
  "trustees": "/trustees",
  "org chart": "/org-chart",
  // SYSTEM
  "admin": "/admin",
  "admin panel": "/admin",
  "settings": "/settings",
  "backups": "/backups",
  "audit trail": "/audit-trail",
  "system health": "/system-health",
  "merge history": "/merge-history",
  "profile": "/profile",
};

// ── Tool declarations for Gemini Live API ──
const HIBBA_TOOLS = [{
  functionDeclarations: [
    {
      name: "navigate_to",
      description: "Navigate the user to a specific page in the app. Use when the user asks to go to, show, open, or take them to a page.",
      parameters: {
        type: "OBJECT" as const,
        properties: {
          page: { type: "STRING" as const, description: `The page to navigate to. Valid values: ${Object.keys(NAV_ROUTES).join(", ")}` },
        },
        required: ["page"],
      },
    },
    {
      name: "get_dashboard_summary",
      description: "Get a high-level financial overview: total expenses, income, active loans, fundraising progress, pending approvals. Use when the user asks about overall finances, how things are going, or wants a briefing.",
      parameters: { type: "OBJECT" as const, properties: {}, required: [] as string[] },
    },
    {
      name: "query_receipts",
      description: "Look up receipts and expenses. Use when user asks about spending, receipts, invoices, or expenses.",
      parameters: {
        type: "OBJECT" as const,
        properties: {
          vendor: { type: "STRING" as const, description: "Filter by vendor/supplier name" },
          status: { type: "STRING" as const, description: "Filter by status: pending, approved, or rejected" },
          limit: { type: "NUMBER" as const, description: "Number of results 1-20, default 5" },
        },
        required: [] as string[],
      },
    },
    {
      name: "query_loans",
      description: "Look up Qarde Hasan loans. Use when user asks about loans, borrowers, or Qarde Hasan.",
      parameters: {
        type: "OBJECT" as const,
        properties: {
          status: { type: "STRING" as const, description: "Filter: active, approved, pending, completed" },
          limit: { type: "NUMBER" as const, description: "Number of results 1-10, default 5" },
        },
        required: [] as string[],
      },
    },
    {
      name: "query_donors",
      description: "Look up donors. Use when user asks about donors, contributions, or supporters.",
      parameters: {
        type: "OBJECT" as const,
        properties: {
          search: { type: "STRING" as const, description: "Search by donor name or email" },
          is_regular: { type: "BOOLEAN" as const, description: "Filter regular donors only" },
          limit: { type: "NUMBER" as const, description: "Number of results 1-10, default 5" },
        },
        required: [] as string[],
      },
    },
    {
      name: "query_payroll",
      description: "Look up payroll records. Use when user asks about salaries, staff payments, or wages.",
      parameters: {
        type: "OBJECT" as const,
        properties: {
          month: { type: "NUMBER" as const, description: "Month number 1-12" },
          year: { type: "NUMBER" as const, description: "Year e.g. 2026" },
          limit: { type: "NUMBER" as const, description: "Number of results 1-10, default 5" },
        },
        required: [] as string[],
      },
    },
    {
      name: "query_income",
      description: "Look up income records (rentals, collections, hall hire). Use when user asks about income or revenue.",
      parameters: {
        type: "OBJECT" as const,
        properties: {
          limit: { type: "NUMBER" as const, description: "Number of results 1-10, default 5" },
        },
        required: [] as string[],
      },
    },
    {
      name: "get_monthly_expense_total",
      description: "Get the total expenses for a specific month. Use when user asks how much was spent in a month.",
      parameters: {
        type: "OBJECT" as const,
        properties: {
          month: { type: "NUMBER" as const, description: "Month number 1-12" },
          year: { type: "NUMBER" as const, description: "Year e.g. 2026" },
        },
        required: ["month", "year"],
      },
    },
    {
      name: "get_prayer_times",
      description: "Get today's Islamic prayer times for Liverpool UK. Use when user asks about prayer times, salah, Fajr, Dhuhr, Asr, Maghrib, Isha, or next prayer.",
      parameters: { type: "OBJECT" as const, properties: {}, required: [] as string[] },
    },
    {
      name: "get_fundraising_campaigns",
      description: "Get fundraising campaign statuses. Use when user asks about campaigns, fundraising progress, or targets.",
      parameters: { type: "OBJECT" as const, properties: {}, required: [] as string[] },
    },
    {
      name: "get_trustees",
      description: "Get the list of current trustees. Use when user asks about trustees, board members, or governance.",
      parameters: { type: "OBJECT" as const, properties: {}, required: [] as string[] },
    },
    {
      name: "get_friday_collections",
      description: "Get recent Friday Jumu'ah collection amounts. Use when user asks about Friday collections or Jumu'ah donations.",
      parameters: {
        type: "OBJECT" as const,
        properties: {
          limit: { type: "NUMBER" as const, description: "Number of results 1-20, default 5" },
        },
        required: [] as string[],
      },
    },
    {
      name: "get_staff_directory",
      description: "Get the staff and user directory. Use when user asks about staff, employees, team members, or who works here.",
      parameters: { type: "OBJECT" as const, properties: {}, required: [] as string[] },
    },
    {
      name: "open_scanner",
      description: "Open the receipt/document scanner. Use when user says 'scan a receipt', 'upload a bill', 'take a photo of a receipt', 'I need to scan something', or similar.",
      parameters: {
        type: "OBJECT" as const,
        properties: {
          doc_type: { type: "STRING" as const, description: "Document type: receipt, collection_sheet, business_card, bank_transfer, donor_form. Default: receipt" },
        },
        required: [] as string[],
      },
    },
    {
      name: "fill_form",
      description: "Fill form fields on the current page by voice. Use when user dictates data. IMPORTANT: You MUST navigate to the correct page first using navigate_to before calling fill_form. Supported pages and their field names: /loans (applicantName, applicantEmail, applicantPhone, applicantAddress, amount, purpose, guarantorName, notes, termValue), /payroll (employeeName, niNumber, taxCode, grossPay, incomeTax, netPay, paymentMethod), /income (amount, incomeDate, description, category, subcategory, reference), /capture (amount, date, description, vendor, category, paymentMethod), /bills-utilities (amount, billDate, notes, periodStart, periodEnd), /accommodation (tenantName, email, phone, roomNumber, monthlyRent).",
      parameters: {
        type: "OBJECT" as const,
        properties: {
          fields: { type: "STRING" as const, description: "JSON string of field-value pairs to fill, e.g. '{\"amount\":\"500\",\"vendor\":\"Tesco\"}'. Use the exact camelCase field names listed in the tool description for each page." },
          page: { type: "STRING" as const, description: "The page path. MUST match one of: /loans, /payroll, /income, /capture, /bills-utilities, /accommodation. If not specified, uses current page path." },
          action: { type: "STRING" as const, description: "'fill' to just fill fields, 'fill_and_confirm' to fill and submit. Default: fill" },
        },
        required: ["fields", "page"],
      },
    },
    {
      name: "get_current_user",
      description: "Get the current logged-in user's identity, name, email, and role. Use when user asks 'who am I', 'what's my role', or you need to personalise a greeting.",
      parameters: { type: "OBJECT" as const, properties: {}, required: [] as string[] },
    },
    {
      name: "search_donors",
      description: "Search for a specific donor by name or ID. Use when user asks about a specific person's donations, e.g. 'look up Ahmed Khan' or 'find donor 42'. Returns detailed donor info including gift aid status.",
      parameters: {
        type: "OBJECT" as const,
        properties: {
          name_or_id: { type: "STRING" as const, description: "Donor name or numeric ID to search for" },
          limit: { type: "NUMBER" as const, description: "Max results 1-10, default 5" },
        },
        required: ["name_or_id"],
      },
    },
    {
      name: "get_accommodation_status",
      description: "Get student accommodation status: active tenants, overdue rent, upcoming payments. Use when user asks about accommodation, tenants, rooms, or rent.",
      parameters: { type: "OBJECT" as const, properties: {}, required: [] as string[] },
    },
    {
      name: "get_strategic_briefing",
      description: "Get a comprehensive strategic briefing combining financials, active loans, campaigns, and prayer times. Use when user says 'give me a briefing', 'morning update', 'status report', or at session start for Dr. Hamid.",
      parameters: { type: "OBJECT" as const, properties: {}, required: [] as string[] },
    },
  ],
}];

// Base system instruction — runtime context and speaker mode appended dynamically
const BASE_SYSTEM_INSTRUCTION = `HIBBA — VOICE AGENT FOR THE ABDULLAH QUILLIAM SOCIETY

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

# PROTOCOLS
- Defer legal queries to LBMW Solicitors.
- NEVER process card details via voice.
- Use natural turn-taking.

# SAFETY
- NEVER invent figures. If not in the database, say so.
- Flag: donations > £25k, related-party payments, trustee benefits.
- Refuse money transfers or comms without explicit voice confirmation.

# ISLAMIC ETIQUETTE
- Open with "Assalamu Alaikum" + their name.
- Holidays 2026: Eid al-Adha May 27, Islamic New Year July 16.
- Response to JazakAllah Khair: "Wa iyyakum".

# PERSONALITY
Light, dry humour. Never joke about the inquiry, donors, money, or religion.
Avoid: "I'd be happy to help", "Of course!", "Absolutely!", "Let me know if you need anything else".

# AQS FACTS
Abdullah Quilliam Society — UK charity #1157121, Britain's first mosque (1889), Brougham Terrace, Liverpool.
1-7: Admin hub & Bistro 87. 8-10: Original mosque & 14-bed accommodation. 11-12: Rimmer Building (expansion).

# TIMEZONE & CURRENT TIME
You are based in Liverpool, UK. The timezone is Europe/London.
{{CURRENT_TIME_PLACEHOLDER}}
Never say "UTC" to the user — always give the local UK time.

# HOW YOU RESPOND
Keep responses concise and conversational — this is a voice interface.
Speak in short complete sentences. Pause naturally so users can interrupt.
Never give long monologues. 2-3 sentences max per turn unless asked for detail.

# TOOLS
ALWAYS use tools for real data — NEVER invent numbers. Summarise results in 2-3 sentences with key £ figures.
User identity is in RUNTIME CONTEXT — no need to call get_current_user for greetings.
For briefings, use get_strategic_briefing(). For prayer, use get_prayer_times() and tell them the NEXT upcoming prayer.
`;

/** Build full system instruction with runtime context, UK time, user identity, and speaker mode */
function buildSystemInstruction(
  ctx: RuntimeContext,
  isSpeakerMode: boolean,
  userName?: string,
  userRole?: string
): string {
  // Inject actual UK time
  const ukTime = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const ukHour = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false });
  const isDST = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", timeZoneName: "short" }).includes("BST");
  const timeStr = `Right now it is: ${ukTime} (${isDST ? "BST, UTC+1" : "GMT, UTC+0"}).`;

  let instruction = BASE_SYSTEM_INSTRUCTION.replace("{{CURRENT_TIME_PLACEHOLDER}}", timeStr);

  // Append runtime context with user identity (avoids needing get_current_user tool call)
  instruction += `\n\n# RUNTIME CONTEXT\n`;
  if (userName) {
    instruction += `Current user: ${userName}${userRole ? ` (${userRole})` : ""}\n`;
  }
  instruction += `Current page: ${ctx.currentPage}\n`;
  if (ctx.formFields.length > 0) {
    instruction += `Form fields on this page: ${ctx.formFields.join(", ")}\n`;
    instruction += `You can use fill_form() with these field names.\n`;
  }
  if (ctx.entityType && ctx.entityId) {
    instruction += `Viewing ${ctx.entityType} ID: ${ctx.entityId}\n`;
  }

  // Speaker mode warning (concise)
  if (isSpeakerMode) {
    instruction += `\n# ⚠️ SPEAKER MODE\nSpeakers detected (no headphones). Do NOT read aloud: exact amounts, account numbers, NI numbers, addresses, salaries, or donor+amount pairs. Say "I can see that on screen" and offer to show it instead.\n`;
  }

  return instruction;
}

/** Detect if a string ends with sentence-ending punctuation */
function endsWithSentence(text: string): boolean {
  return /[.!?…।。]\s*$/.test(text.trim());
}

export function HibbaVoice() {
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [micOn, setMicOn] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [statusText, setStatusText] = useState("Tap mic to start");

  const sessionRef = useRef<any>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const captureRef = useRef<AudioCaptureHandle | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const connectingRef = useRef(false);

  // Session tracking refs
  const voiceSessionIdRef = useRef<number | null>(null);
  const sessionStartTimeRef = useRef<number>(0);

  // Transcript buffering refs — accumulate words, flush on sentence boundary
  const hibbaBufferRef = useRef("");
  const userBufferRef = useRef("");
  const hibbaIdRef = useRef(0);
  const userIdRef = useRef(0);
  // Track when Hibba is speaking to suppress echo in input transcription
  const hibbaSpeakingRef = useRef(false);
  const speakingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getToken = trpc.voice.getEphemeralToken.useMutation();
  const endSessionMut = trpc.voice.endSession.useMutation();
  const logToolCallMut = trpc.voice.logToolCall.useMutation();
  const utils = trpc.useUtils();

  // Auto-scroll to bottom when messages change (only when panel is expanded)
  useEffect(() => {
    if (!minimized) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, minimized]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  /** Add or update a chat message */
  const upsertMessage = useCallback(
    (id: string, speaker: ChatMessage["speaker"], text: string, final: boolean) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], text, final };
          return updated;
        }
        // Keep last 50 messages
        const trimmed = prev.length > 50 ? prev.slice(-50) : prev;
        return [...trimmed, { id, speaker, text, final }];
      });
    },
    []
  );

  /** Flush buffer into a finalized message */
  const flushBuffer = useCallback(
    (speaker: "hibba" | "user") => {
      const bufRef = speaker === "hibba" ? hibbaBufferRef : userBufferRef;
      const idRef = speaker === "hibba" ? hibbaIdRef : userIdRef;
      const text = bufRef.current.trim();
      if (!text) return;
      const msgId = `${speaker}-${idRef.current}`;
      upsertMessage(msgId, speaker, text, true);
      // Start a new message ID for the next sentence
      idRef.current += 1;
      bufRef.current = "";
    },
    [upsertMessage]
  );

  // ── Connect directly to Gemini Live API ──
  async function connect() {
    if (connectingRef.current || state === "connected") return;
    connectingRef.current = true;
    setState("connecting");
    setMessages([]);
    setStatusText("Connecting...");
    hibbaBufferRef.current = "";
    userBufferRef.current = "";
    hibbaIdRef.current = 0;
    userIdRef.current = 0;

    try {
      // 1. Get ephemeral token (with freshness timestamp for anti-replay)
      setStatusText("Authenticating...");
      const isMobileDevice = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      const result = await getToken.mutateAsync({
        device: isMobileDevice ? "mobile" : "desktop",
        screenContext: window.location.pathname,
        requestTimestamp: Date.now(),
      });
      const { token, model, user, sessionId: sId } = result;
      voiceSessionIdRef.current = sId ?? null;
      sessionStartTimeRef.current = Date.now();

      // 2. Detect speaker mode and build system instruction with UK time + user identity
      const isSpeakerMode = await detectSpeakerMode();
      const runtimeCtx = buildRuntimeContext(window.location.pathname);
      const fullSystemInstruction = buildSystemInstruction(runtimeCtx, isSpeakerMode, user, undefined);

      upsertMessage("sys-auth", "system", `Connected as ${user}${isSpeakerMode ? " 🔊" : ""}`, true);

      // 3. Import @google/genai dynamically
      setStatusText("Initializing AI...");
      const { GoogleGenAI, Modality } = await import("@google/genai");

      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: "v1alpha" },
      });

      // 4. Connect to Gemini Live API directly from browser
      setStatusText("Connecting to Gemini...");

      const session = await ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Aoede" },
            },
          },
          systemInstruction: {
            parts: [{ text: fullSystemInstruction }],
          },
          tools: HIBBA_TOOLS as any,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log("[Hibba] Gemini Live session opened");
            setState("connected");
            setStatusText("Listening");
            connectingRef.current = false;
            startMic();
          },
          onmessage: (msg: any) => {
            try {
              // Handle audio data
              const audioParts = msg?.serverContent?.modelTurn?.parts?.filter(
                (p: any) => p.inlineData?.mimeType?.startsWith("audio/")
              );
              if (audioParts?.length) {
                // Mark Hibba as speaking to suppress echo in input transcription
                hibbaSpeakingRef.current = true;
                if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
                for (const part of audioParts) {
                  if (part.inlineData?.data) {
                    if (!playerRef.current) playerRef.current = new AudioPlayer();
                    playerRef.current.play(part.inlineData.data);
                  }
                }
                // Keep suppressing for 1.5s after last audio chunk to handle trailing echo
                speakingTimeoutRef.current = setTimeout(() => {
                  hibbaSpeakingRef.current = false;
                }, 1500);
              }

              // Handle Hibba's transcript (output)
              const rawOutputText = msg?.serverContent?.outputTranscription?.text;
              // Filter out control codes like <ctrl46> that Gemini sometimes emits
              const outputText = rawOutputText?.replace(/<ctrl\d+>/g, "").trim();
              if (outputText) {
                // Add a space before appending if buffer doesn't end with space
                if (hibbaBufferRef.current && !hibbaBufferRef.current.endsWith(" ")) {
                  hibbaBufferRef.current += " ";
                }
                hibbaBufferRef.current += outputText;
                const currentId = `hibba-${hibbaIdRef.current}`;
                // Show the in-progress text
                upsertMessage(currentId, "hibba", hibbaBufferRef.current.trim(), false);
                // If we have a complete sentence, finalize it
                if (endsWithSentence(hibbaBufferRef.current)) {
                  flushBuffer("hibba");
                }
              }

              // Handle user's transcript (input) — suppress while Hibba is speaking (echo)
              const rawInputText = msg?.serverContent?.inputTranscription?.text;
              const inputText = rawInputText?.replace(/<ctrl\d+>/g, "").trim();
              if (inputText && !hibbaSpeakingRef.current) {
                // Add a space before appending if buffer doesn't end with space
                if (userBufferRef.current && !userBufferRef.current.endsWith(" ")) {
                  userBufferRef.current += " ";
                }
                userBufferRef.current += inputText;
                const currentId = `user-${userIdRef.current}`;
                upsertMessage(currentId, "user", userBufferRef.current.trim(), false);
                if (endsWithSentence(userBufferRef.current)) {
                  flushBuffer("user");
                }
              }

              // Handle interruption (barge-in)
              if (msg?.serverContent?.interrupted) {
                playerRef.current?.interrupt();
                // Stop echo suppression since Hibba was interrupted
                hibbaSpeakingRef.current = false;
                if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
                // Finalize any in-progress Hibba message
                flushBuffer("hibba");
              }

              // Handle turn complete — finalize any remaining buffer
              if (msg?.serverContent?.turnComplete) {
                // Stop echo suppression on turn complete
                hibbaSpeakingRef.current = false;
                if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
                flushBuffer("hibba");
                flushBuffer("user");
              }

              // ── Handle tool calls ──
              const toolCall = msg?.toolCall;
              if (toolCall?.functionCalls?.length) {
                handleToolCalls(toolCall.functionCalls, session);
              }
            } catch (e) {
              console.error("[Hibba] Error processing message:", e);
            }
          },
          onerror: (err: any) => {
            console.error("[Hibba] Gemini Live error:", err);
            upsertMessage("sys-err", "system", "Connection lost. Tap mic to retry.", true);
            setState("error");
            setStatusText("Connection failed — tap mic to retry");
            connectingRef.current = false;
            stopMic();
          },
          onclose: () => {
            console.log("[Hibba] Gemini Live session closed");
            flushBuffer("hibba");
            flushBuffer("user");
            upsertMessage("sys-end", "system", "Session ended.", true);
            setState("idle");
            setStatusText("Tap mic to start");
            connectingRef.current = false;
            stopMic();
          },
        },
      });

      sessionRef.current = session;

      // Send greeting prompt — keep it simple to avoid triggering tool calls on startup
      // The user's name and time are already in the system instruction
      session.sendClientContent({
        turns: [
          { role: "user", parts: [{ text: "Say Assalamu Alaikum and a one-sentence greeting. Do NOT call any tools." }] },
        ],
        turnComplete: true,
      });
    } catch (e: any) {
      console.error("[Hibba] Connection error:", e);
      const errMsg = e?.message?.includes("UNAUTHORIZED")
        ? "Authentication failed. Please log in again."
        : `Failed to initialize voice: ${e?.message || "Unknown error"}`;
      upsertMessage("sys-err", "system", errMsg, true);
      setState("error");
      setStatusText("Connection failed — tap mic to retry");
      connectingRef.current = false;
    }
  }

  // ── Handle tool calls from Gemini ──
  async function handleToolCalls(functionCalls: any[], session: any) {
    const responses: any[] = [];
    for (const fc of functionCalls) {
      console.log(`[Hibba] Tool call: ${fc.name}`, fc.args);
      const toolStartTime = Date.now();
      try {
        let result: any;
        switch (fc.name) {
          case "navigate_to": {
            const page = (fc.args?.page || "").toLowerCase().trim();
            const path = NAV_ROUTES[page];
            if (path) {
              setLocation(path);
              upsertMessage(`tool-${fc.id}`, "system", `Navigated to ${page}`, true);
              result = { success: true, navigated_to: path };
            } else {
              result = { error: `Unknown page: ${page}. Available: ${Object.keys(NAV_ROUTES).slice(0, 10).join(", ")}...` };
            }
            break;
          }
          case "get_dashboard_summary": {
            const data = await utils.client.hibbaTools.dashboardSummary.query();
            result = data;
            break;
          }
          case "query_receipts": {
            const data = await utils.client.hibbaTools.queryReceipts.query({
              vendor: fc.args?.vendor,
              status: fc.args?.status,
              limit: fc.args?.limit ? Number(fc.args.limit) : 5,
            });
            result = data;
            break;
          }
          case "query_loans": {
            const data = await utils.client.hibbaTools.queryLoans.query({
              status: fc.args?.status,
              limit: fc.args?.limit ? Number(fc.args.limit) : 5,
            });
            result = data;
            break;
          }
          case "query_donors": {
            const data = await utils.client.hibbaTools.queryDonors.query({
              search: fc.args?.search,
              isRegular: fc.args?.is_regular,
              limit: fc.args?.limit ? Number(fc.args.limit) : 5,
            });
            result = data;
            break;
          }
          case "query_payroll": {
            const data = await utils.client.hibbaTools.queryPayroll.query({
              month: fc.args?.month ? Number(fc.args.month) : undefined,
              year: fc.args?.year ? Number(fc.args.year) : undefined,
              limit: fc.args?.limit ? Number(fc.args.limit) : 5,
            });
            result = data;
            break;
          }
          case "query_income": {
            const data = await utils.client.hibbaTools.queryIncome.query({
              limit: fc.args?.limit ? Number(fc.args.limit) : 5,
            });
            result = data;
            break;
          }
          case "get_monthly_expense_total": {
            const data = await utils.client.hibbaTools.monthlyExpenseTotal.query({
              month: Number(fc.args?.month),
              year: Number(fc.args?.year),
            });
            result = data;
            break;
          }
          case "get_prayer_times": {
            const data = await utils.client.hibbaTools.prayerTimes.query();
            result = data;
            break;
          }
          case "get_fundraising_campaigns": {
            const data = await utils.client.hibbaTools.fundraisingCampaigns.query();
            result = data;
            break;
          }
          case "get_trustees": {
            const data = await utils.client.hibbaTools.trustees.query();
            result = data;
            break;
          }
          case "get_friday_collections": {
            const data = await utils.client.hibbaTools.fridayCollections.query({
              limit: fc.args?.limit ? Number(fc.args.limit) : 5,
            });
            result = data;
            break;
          }
          case "get_staff_directory": {
            const data = await utils.client.hibbaTools.staffDirectory.query();
            result = data;
            break;
          }
          case "open_scanner": {
            const docType = fc.args?.doc_type || "receipt";
            // Navigate to the capture page
            setLocation("/capture");
            // Dispatch event so the Capture page can auto-select the doc type
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("hibba:open_scanner", { detail: { docType } }));
            }, 300);
            result = { success: true, message: `Scanner opened for ${docType}. User can now take a photo or upload a file.` };
            break;
          }
          case "fill_form": {
            try {
              const fieldsStr = fc.args?.fields || "{}";
              const fields = typeof fieldsStr === "string" ? JSON.parse(fieldsStr) : fieldsStr;
              const page = fc.args?.page || window.location.pathname;
              const action = fc.args?.action || "fill";
              // Navigate to the target page first if not already there
              const currentPath = window.location.pathname;
              if (page && page !== currentPath) {
                setLocation(page);
              }
              // Dispatch the form fill event after a delay to let the page mount
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("hibba:fill_form", {
                  detail: { fields, page, action }
                }));
              }, page !== currentPath ? 600 : 100);
              const fieldNames = Object.keys(fields).join(", ");
              result = { success: true, message: `Navigated to ${page} and filled fields: ${fieldNames}` };
            } catch (parseErr) {
              result = { error: "Could not parse form fields. Please try again." };
            }
            break;
          }
          case "get_current_user": {
            const user = await utils.hibbaTools.getCurrentUser.fetch();
            result = user;
            break;
          }
          case "search_donors": {
            const nameOrId = fc.args?.name_or_id || fc.args?.nameOrId || "";
            const limit = Number(fc.args?.limit) || 5;
            const donors = await utils.hibbaTools.searchDonors.fetch({ nameOrId, limit });
            result = donors;
            break;
          }
          case "get_accommodation_status": {
            const accomm = await utils.hibbaTools.accommodationStatus.fetch();
            result = accomm;
            break;
          }
          case "get_strategic_briefing": {
            const briefing = await utils.hibbaTools.strategicBriefing.fetch();
            result = briefing;
            break;
          }
          default:
            result = { error: `Unknown tool: ${fc.name}` };
        }
        responses.push({ id: fc.id, name: fc.name, response: result });
        // Log successful tool call
        if (voiceSessionIdRef.current) {
          logToolCallMut.mutateAsync({
            sessionId: voiceSessionIdRef.current,
            toolName: fc.name,
            params: JSON.stringify(fc.args || {}),
            resultSummary: JSON.stringify(result).substring(0, 200),
            success: true,
            latencyMs: Date.now() - toolStartTime,
          }).catch(() => {});
        }
      } catch (err: any) {
        console.error(`[Hibba] Tool ${fc.name} error:`, err);
        responses.push({ id: fc.id, name: fc.name, response: { error: err?.message || "Tool execution failed" } });
        // Log failed tool call
        if (voiceSessionIdRef.current) {
          logToolCallMut.mutateAsync({
            sessionId: voiceSessionIdRef.current,
            toolName: fc.name,
            params: JSON.stringify(fc.args || {}),
            success: false,
            errorMessage: err?.message || "Unknown error",
            latencyMs: Date.now() - toolStartTime,
          }).catch(() => {});
        }
      }
    }
    // Send all tool responses back to Gemini
    try {
      session.sendToolResponse({ functionResponses: responses });
    } catch (e) {
      console.error("[Hibba] Error sending tool response:", e);
    }
  }

  // ── Disconnect ──
  function disconnect() {
    stopMic();
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {
        console.error("[Hibba] Error closing session:", e);
      }
      sessionRef.current = null;
    }
    playerRef.current?.destroy();
    playerRef.current = null;
    // End session tracking
    if (voiceSessionIdRef.current) {
      const durationSeconds = Math.round((Date.now() - sessionStartTimeRef.current) / 1000);
      endSessionMut.mutateAsync({
        sessionId: voiceSessionIdRef.current,
        tokenCount: 0,
        durationSeconds,
        error: state === "error",
      }).catch(() => {});
      voiceSessionIdRef.current = null;
    }
    setState("idle");
    setStatusText("Tap mic to start");
    connectingRef.current = false;
  }

  // ── Mic control ──
  async function startMic() {
    if (captureRef.current) return;
    try {
      captureRef.current = await startAudioCapture((base64Pcm) => {
        if (sessionRef.current) {
          try {
            sessionRef.current.sendRealtimeInput({
              audio: { data: base64Pcm, mimeType: "audio/pcm;rate=16000" },
            });
          } catch (e) {
            console.error("[Hibba] Error sending audio:", e);
          }
        }
      });
      setMicOn(true);
      if (state === "connected") setStatusText("Listening");
    } catch (e: any) {
      toast.error("Microphone access denied");
      console.error("[Hibba] Mic error:", e);
    }
  }

  function stopMic() {
    captureRef.current?.stop();
    captureRef.current = null;
    setMicOn(false);
    if (state === "connected") setStatusText("Ready");
  }

  function toggleMic() {
    if (state === "idle" || state === "error") {
      connect();
    } else if (state === "connected") {
      if (micOn) stopMic();
      else startMic();
    }
  }

  // ── Close panel (but keep voice running) ──
  function handleMinimize() {
    setMinimized(true);
  }

  function handleExpand() {
    setMinimized(false);
  }

  function handleClose() {
    disconnect();
    setIsOpen(false);
    setMinimized(false);
    setMessages([]);
  }

  // ── Render ──
  const isActive = state === "connected" || state === "connecting";

  return (
    <>
      {/* ── Expanded panel ── */}
      {isOpen && !minimized && (
        <div
          className={`fixed left-3 right-3 z-[60] mx-auto max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden ${isMobile ? "bottom-[136px]" : "bottom-24"}`}
          style={{ maxHeight: "55vh" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-600 text-white">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              <span className="font-semibold text-sm">Hibba</span>
              {state === "connected" && (
                <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleMinimize}
                className="p-1.5 hover:bg-emerald-700 rounded-lg transition-colors"
                title="Minimize — audio continues"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleClose}
                className="p-1.5 hover:bg-emerald-700 rounded-lg transition-colors"
                title="Close & disconnect"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Transcript area */}
          <div className="px-4 py-3 overflow-y-auto space-y-3" style={{ maxHeight: "42vh" }}>
            {messages.length === 0 && state !== "connecting" && (
              <p className="text-center text-gray-400 text-sm py-8">
                Tap the mic button to start a conversation
              </p>
            )}

            {messages.map((m) => {
              if (m.speaker === "system") {
                return (
                  <div key={m.id} className="text-center">
                    <span
                      className={`inline-block text-xs px-3 py-1 rounded-full ${
                        m.text.includes("failed") || m.text.includes("error") || m.text.includes("lost")
                          ? "bg-red-50 text-red-500"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {m.text}
                    </span>
                  </div>
                );
              }

              const isHibba = m.speaker === "hibba";
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isHibba ? "items-start" : "items-end"}`}
                >
                  {/* Speaker label */}
                  <span className="text-[10px] text-gray-400 mb-0.5 px-1 font-medium uppercase tracking-wide">
                    {isHibba ? "Hibba" : "You"}
                  </span>
                  {/* Message bubble */}
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                      isHibba
                        ? "bg-emerald-50 text-gray-800 rounded-tl-md"
                        : "bg-blue-50 text-gray-800 rounded-tr-md"
                    } ${!m.final ? "opacity-60" : ""}`}
                  >
                    {m.text}
                    {!m.final && (
                      <span className="inline-block ml-1 w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        </div>
      )}

      {/* ── Minimized indicator ── */}
      {isOpen && minimized && isActive && (
        <button
          onClick={handleExpand}
          className={`fixed right-4 z-[60] flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-full shadow-lg hover:bg-emerald-700 transition-all ${isMobile ? "bottom-[136px]" : "bottom-24"}`}
        >
          <Phone className="w-4 h-4" />
          <span className="text-xs font-medium">Hibba</span>
          <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}

      {/* ── Mic button ── */}
      <div className={`fixed right-8 z-[60] flex flex-col items-center gap-0.5 ${isMobile ? "bottom-[76px]" : "bottom-4"}`}>
        <button
          onClick={() => {
            if (!isOpen) {
              setIsOpen(true);
              setMinimized(false);
            }
            toggleMic();
          }}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${
            state === "connecting"
              ? "bg-yellow-500 animate-pulse"
              : state === "connected" && micOn
                ? "bg-emerald-600 animate-pulse"
                : state === "connected"
                  ? "bg-emerald-600"
                  : state === "error"
                    ? "bg-red-500"
                    : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {state === "connecting" ? (
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          ) : micOn ? (
            <Mic className="w-6 h-6 text-white" />
          ) : (
            <MicOff className="w-6 h-6 text-white" />
          )}
        </button>
        <span className="text-[10px] text-gray-400">{statusText}</span>
      </div>
    </>
  );
}
