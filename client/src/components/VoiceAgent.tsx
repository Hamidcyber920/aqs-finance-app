/**
 * VoiceAgent — Native voice assistant using Web Speech API
 *
 * Architecture:
 * - SpeechRecognition (browser) captures speech → text
 * - Text sent via tRPC mutation to server (invokeLLM + tool calling loop)
 * - Server returns text response + side effects (navigate, fill_form, open_url)
 * - SpeechSynthesis (browser) speaks the response aloud
 * - No WebSocket, no Gemini Live API — 100% reliable HTTP/tRPC flow
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Mic, MicOff, X, Send, ChevronDown, ChevronUp, Flag, Keyboard, Phone, PhoneOff, HelpCircle, Sparkles, Zap, Undo2, Mail, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ─── Types ───────────────────────────────────────────────────────────────────
interface TranscriptEntry {
  id: string;
  speaker: "user" | "agent";
  text: string;
  timestamp: Date;
  toolCalls?: { name: string; status: string }[];
  flagged?: boolean;
}

interface VoiceAgentProps {
  screenContext?: string;
  entityContext?: string;
}

// ─── Waveform animation ─────────────────────────────────────────────────────
function WaveformAnimation({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex items-center gap-0.5 h-6">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className={`w-1 rounded-full transition-all duration-150 ${isActive ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`}
          style={{ height: isActive ? `${12 + Math.sin(Date.now() / 200 + i) * 8}px` : "4px", animationDelay: `${i * 100}ms` }}
        />
      ))}
    </div>
  );
}

// ─── Speech Recognition wrapper ─────────────────────────────────────────────
function useSpeechRecognition() {
  const recognitionRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const onResultRef = useRef<((text: string) => void) | null>(null);
  const restartingRef = useRef(false);
  const shouldListenRef = useRef(false);

  const isSupported = useMemo(() => {
    return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  }, []);

  const start = useCallback((onResult: (text: string) => void) => {
    if (!isSupported) {
      toast.error("Speech recognition not supported in this browser. Please use Chrome or Edge.");
      return;
    }
    onResultRef.current = onResult;
    shouldListenRef.current = true;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-GB";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      restartingRef.current = false;
    };

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      setInterimText(interim);
      if (final.trim()) {
        setInterimText("");
        onResultRef.current?.(final.trim());
      }
    };

    recognition.onerror = (event: any) => {
      console.log("[SpeechRecognition] Error:", event.error);
      if (event.error === "not-allowed") {
        toast.error("Microphone access denied. Please allow microphone permission.");
        shouldListenRef.current = false;
        setIsListening(false);
      } else if (event.error === "no-speech" || event.error === "aborted") {
        // These are normal — will auto-restart via onend
      }
    };

    recognition.onend = () => {
      // Auto-restart if we should still be listening
      if (shouldListenRef.current && !restartingRef.current) {
        restartingRef.current = true;
        try {
          recognition.start();
        } catch {
          setIsListening(false);
          shouldListenRef.current = false;
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      toast.error("Could not start speech recognition.");
    }
  }, [isSupported]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    restartingRef.current = false;
    setInterimText("");
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  return { isListening, interimText, start, stop, isSupported };
}

// ─── Speech Synthesis wrapper ───────────────────────────────────────────────
function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((text: string) => {
    if (!text.trim()) return;
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Try to find a good British female voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang === "en-GB" && v.name.toLowerCase().includes("female"))
      || voices.find(v => v.lang === "en-GB" && !v.name.toLowerCase().includes("male"))
      || voices.find(v => v.lang === "en-GB")
      || voices.find(v => v.lang.startsWith("en-"));
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  return { isSpeaking, speak, stop };
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function VoiceAgent({ screenContext = "dashboard", entityContext }: VoiceAgentProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [status, setStatus] = useState<"idle" | "connected" | "connecting" | "error">("idle");
  const [isTextMode, setIsTextMode] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [emailSummaryLoading, setEmailSummaryLoading] = useState(false);
  const [showCommandRef, setShowCommandRef] = useState(false);
  const [lastNavigation, setLastNavigation] = useState<string | null>(null);
  const [prevLocation, setPrevLocation] = useState<string | null>(null);
  const [pendingFormFill, setPendingFormFill] = useState<{ fields: Record<string, any>; page: string; summary: string } | null>(null);
  const [pendingWhatsApp, setPendingWhatsApp] = useState<{ url: string; label: string }[] | null>(null);
  const [showEditActions, setShowEditActions] = useState(false);
  const [editActionsInput, setEditActionsInput] = useState("");
  const [customActions, setCustomActions] = useState<string[] | null>(null);
  const [savingActions, setSavingActions] = useState(false);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Speech hooks
  const { isListening, interimText, start: startListening, stop: stopListening, isSupported: sttSupported } = useSpeechRecognition();
  const { isSpeaking, speak, stop: stopSpeaking } = useSpeechSynthesis();

  // tRPC mutations
  const nativeChatMutation = (trpc as any).voiceAgent.nativeChat.useMutation();
  const nativeGreetingMutation = (trpc as any).voiceAgent.nativeGreeting.useMutation();
  const startSessionMutation = (trpc as any).voiceAgent.startSession.useMutation();

  // Load user's custom quick actions for current page
  const { data: savedActions, refetch: refetchActions } = (trpc as any).voiceAgent.getQuickActions.useQuery(
    { pageKey: screenContext || "/" },
    { enabled: !!screenContext }
  );
  const { data: adminSharedActions } = (trpc as any).voiceAgent.getAdminSharedActions.useQuery(
    { pageKey: screenContext || "/" },
    { enabled: !!screenContext && !savedActions }
  );

  // Context-aware quick action chips per page
  const QUICK_ACTIONS: Record<string, string[]> = {
    "/dashboard": ["Bismillah, summarise today", "Any urgent items?", "What needs my attention?"],
    "/receipts": ["Summarise my expenses", "Any pending approvals?", "Record an expense for me"],
    "/reports": ["Summarise this month's report", "What's the income vs expenses?", "Any anomalies?"],
    "/fundraising": ["Summarise all campaigns", "Which campaign is closest to target?", "Total donations this month?"],
    "/loans": ["Show overdue loans", "Summarise active loans", "Any loans due this month?"],
    "/income": ["Summarise this month's income", "Record a donation", "Compare to last month"],
    "/payroll": ["Summarise this month's payroll", "Any pending approvals?", "Total payroll cost?"],
    "/monthly-expenses": ["Summarise this month's expenses", "What's the available balance?", "Any withheld payments?"],
    "/reconciliation": ["Summarise this month's reconciliation", "Any unmatched transactions?", "What's the closing balance?"],
    "/donors": ["Find top donors this month", "Any lapsed donors?", "Summarise donor stats"],
    "/campaigns": ["Summarise all campaigns", "Which is performing best?", "Total raised this month?"],
    "/trustees": ["Who are the current trustees?", "Any pending actions?", "Show trustee contacts"],
    "/trustee-dashboard": ["Summarise pending approvals", "Any compliance issues?", "What needs sign-off?"],
    "/payroll-v3": ["Summarise payroll run", "Any pending approvals?", "Total net pay this month?"],
    "/training": ["Who has overdue training?", "Summarise training compliance", "Any expiring certificates?"],
    "/student-accommodation": ["Any overdue rent?", "Summarise tenancy status", "Who moves out this month?"],
    "/facilities": ["Any bookings today?", "Summarise this week's bookings", "What rooms are available?"],
    "/compliance": ["Any overdue actions?", "Summarise compliance status", "What policies need review?"],
    "/meetings": ["What meetings are coming up?", "Summarise recent decisions", "Any outstanding actions?"],
    "/pledges": ["Show outstanding pledges", "Summarise pledge totals", "Any overdue pledges?"],
    "/gift-aid": ["Summarise Gift Aid claims", "Any pending declarations?", "Total Gift Aid this year?"],
    "/bistro": ["Today's Bistro summary", "What's selling well?", "Any pending orders?"],
    "/bills-utilities": ["Any bills due soon?", "Add a new bill for me", "Any overdue payments?"],
    "/major-donor": ["Summarise major donor pipeline", "Any prospects to follow up?", "Who's in cultivation?"],
    "/donor-crm": ["Summarise CRM activity", "Any donors to follow up?", "Recent communications?"],
    "/voice-history": ["Summarise recent sessions", "How many sessions this week?", "Any flagged responses?"],
    "/system-health": ["Is everything healthy?", "Any errors or warnings?", "What's the server status?"],
  };
  const currentQuickActions = QUICK_ACTIONS[screenContext] || ["Summarise this page", "What can I help with?", "Show recent activity"];
  const effectiveQuickActions = (customActions ?? (savedActions as string[] | null | undefined) ?? (adminSharedActions as string[] | null | undefined)) ?? currentQuickActions;

  const SECTION_NAMES: Record<string, string> = {
    "/dashboard": "Dashboard", "/receipts": "Receipts", "/reports": "Reports",
    "/fundraising": "Fundraising", "/loans": "Qard Hasan Loans", "/income": "Income",
    "/payroll": "Payroll", "/monthly-expenses": "Monthly Expenses", "/reconciliation": "Reconciliation",
    "/donors": "Donors", "/campaigns": "Campaigns", "/admin": "Admin Panel",
    "/trustees": "Trustees & Staff", "/compliance": "Compliance Cockpit", "/meetings": "Meetings",
    "/comms-hub": "Comms Hub", "/comms-inbox": "Master Inbox", "/donor-crm": "Donor CRM",
    "/gift-aid": "Gift Aid & CRM+", "/pledges": "Pledges", "/payroll-v3": "Payroll V3",
    "/major-donor": "Major Donor DD", "/bulk-approvals": "Bulk Approvals",
    "/conflicts-register": "Conflicts Register", "/recognition-tiers": "Recognition Tiers",
    "/qr-codes": "QR Codes", "/saved-views": "Saved Views",
    "/bills-utilities": "Bills & Utilities", "/training-tracker": "Training Tracker",
    "/lbmw-correspondence": "LBMW Correspondence", "/trustee-dashboard": "Trustee Dashboard",
    "/facilities": "Facilities & Bookings", "/bistro87": "Bistro 87",
    "/donate": "Donation Page", "/voice-history": "Voice History",
    "/profile": "Profile", "/settings": "Settings",
  };

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Keyboard shortcut: Ctrl+Shift+V to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "V") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ─── Process side effects from server response ────────────────────────────
  const processSideEffects = useCallback((sideEffects: any[]) => {
    for (const effect of sideEffects) {
      switch (effect.type) {
        case "navigate":
          if (effect.data?.path) {
            setPrevLocation(window.location.pathname);
            navigate(effect.data.path);
            const sn = SECTION_NAMES[effect.data.path as string] || (effect.data.path as string).replace(/^\//, "").replace(/-/g, " ");
            setLastNavigation(sn);
            toast.success("Navigated to " + sn, { duration: 2500 });
            setTimeout(() => { setLastNavigation(null); setPrevLocation(null); }, 5000);
          }
          break;
        case "fill_form": {
          const { fields, page, action: fillAction } = effect.data;
          if (fields && typeof fields === "object") {
            const isConfirm = fillAction === "fill_and_confirm";
            window.dispatchEvent(new CustomEvent("hibba:fill_form", {
              detail: { fields, page: page || screenContext, action: fillAction || "fill" }
            }));
            const fieldCount = Object.keys(fields).length;
            if (isConfirm) {
              const summary = Object.entries(fields)
                .filter(([, v]) => v)
                .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${v}`)
                .join(" \u2022 ");
              setPendingFormFill({ fields, page: page || screenContext, summary });
              toast("Bismillah \u2014 please review the form and confirm", {
                duration: 6000, icon: "\u270d\ufe0f",
                description: summary.slice(0, 100) + (summary.length > 100 ? "..." : ""),
              });
            } else {
              toast.success(`Bismillah \u2014 Hibba filled ${fieldCount} field${fieldCount > 1 ? "s" : ""}`, { duration: 3000 });
            }
            setTranscript((prev) => [...prev, {
              id: `form-fill-${Date.now()}`, speaker: "agent",
              text: isConfirm
                ? `\u270d\ufe0f Form filled (awaiting confirmation): ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(", ")}`
                : `\u270d\ufe0f Form filled: ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(", ")}`,
              timestamp: new Date()
            }]);
          }
          break;
        }
        case "open_url_batch":
          if (effect.data?.urls && Array.isArray(effect.data.urls)) {
            setPendingWhatsApp(effect.data.urls.map((u: any) => ({ url: u.url, label: u.label || "Open" })));
            toast.success(`${effect.data.urls.length} WhatsApp links ready`, { duration: 10000, icon: "\uD83D\uDCE8", description: "Tap each green button to send" });
          }
          break;
        case "open_url":
          if (effect.data?.url) {
            const label = effect.data.label || "Link opened";
            setPendingWhatsApp([{ url: effect.data.url as string, label: label as string }]);
            try {
              const linkEl = document.createElement("a");
              linkEl.href = effect.data.url as string;
              linkEl.target = "_blank";
              linkEl.rel = "noopener noreferrer";
              document.body.appendChild(linkEl);
              linkEl.click();
              setTimeout(() => document.body.removeChild(linkEl), 100);
            } catch {}
            toast.success(label as string, { duration: 10000, icon: "\uD83D\uDCE8", description: "Tap the green button below to open WhatsApp" });
          }
          break;
      }
    }
  }, [navigate, screenContext]);

  // ─── Send message to server ───────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !currentSessionId || isProcessing) return;

    // Barge-in: stop Hibba speaking if she's mid-sentence
    stopSpeaking();

    setIsProcessing(true);
    setTranscript((prev) => [...prev, { id: `user-${Date.now()}`, speaker: "user", text, timestamp: new Date() }]);

    try {
      const result = await nativeChatMutation.mutateAsync({
        sessionId: currentSessionId,
        message: text,
        screenContext: screenContext || "/",
        entityContext: entityContext || undefined,
      });

      // Process side effects (navigation, form fills, URLs)
      if (result.sideEffects?.length) {
        processSideEffects(result.sideEffects);
      }

      // Add response to transcript
      if (result.response) {
        const toolCallEntries = result.toolsExecuted?.length
          ? result.toolsExecuted.map((name: string) => ({ name, status: "done" }))
          : undefined;
        setTranscript((prev) => [...prev, {
          id: `agent-${Date.now()}`, speaker: "agent", text: result.response,
          timestamp: new Date(), toolCalls: toolCallEntries,
        }]);

        // Speak the response (only in voice mode)
        if (!isTextMode) {
          speak(result.response);
        }
      }
    } catch (err: any) {
      console.error("[VoiceAgent] Chat error:", err);
      const errorMsg = "Sorry, I couldn't process that. Please try again.";
      setTranscript((prev) => [...prev, { id: `error-${Date.now()}`, speaker: "agent", text: errorMsg, timestamp: new Date() }]);
      toast.error("Voice assistant error");
    } finally {
      setIsProcessing(false);
    }
  }, [currentSessionId, isProcessing, screenContext, entityContext, nativeChatMutation, processSideEffects, speak, stopSpeaking, isTextMode]);

  // ─── Connect (create session + greeting) ──────────────────────────────────
  const connect = useCallback(async () => {
    if (!user) { toast.error("Please log in to use the voice assistant"); return; }
    setStatus("connecting");
    try {
      // Create a new session
      const session = await startSessionMutation.mutateAsync({
        screenContext: screenContext || "/",
        language: "en-GB",
      });
      const sessionId = session.sessionId;
      setCurrentSessionId(sessionId);
      setStatus("connected");

      // Get greeting
      try {
        const greetingResult = await nativeGreetingMutation.mutateAsync();
        const greetingText = greetingResult.greeting || "Assalamu Alaikum! How can I help you today?";
        setTranscript((prev) => [...prev, {
          id: `welcome-${Date.now()}`, speaker: "agent", text: greetingText, timestamp: new Date()
        }]);
        // Speak greeting
        speak(greetingText);
      } catch {
        setTranscript((prev) => [...prev, {
          id: `welcome-${Date.now()}`, speaker: "agent",
          text: "Assalamu Alaikum! How can I help you today?", timestamp: new Date()
        }]);
      }
    } catch (err) {
      console.error("[VoiceAgent] Connect error:", err);
      setStatus("error");
      toast.error("Could not start voice session. Please try again.");
    }
  }, [user, screenContext, startSessionMutation, nativeGreetingMutation, speak]);

  // ─── Toggle mic ───────────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening((text) => {
        // When speech is recognized, send it to the server
        sendMessage(text);
      });
    }
  }, [isListening, startListening, stopListening, sendMessage]);

  // ─── Send text message ────────────────────────────────────────────────────
  const sendText = useCallback(() => {
    if (!textInput.trim()) return;
    const text = textInput.trim();
    setTextInput("");
    sendMessage(text);
  }, [textInput, sendMessage]);

  const sendQuickText = useCallback((text: string) => {
    sendMessage(text);
  }, [sendMessage]);

  // ─── Flag response ────────────────────────────────────────────────────────
  const flagResponse = useCallback((entryId: string) => {
    setTranscript((prev) => prev.map((t) => (t.id === entryId ? { ...t, flagged: true } : t)));
    toast.success("Flagged for Dr. Hamid's review");
  }, []);

  // ─── Toggle panel ─────────────────────────────────────────────────────────
  const toggleOpen = useCallback(() => {
    if (!isOpen) {
      setIsOpen(true);
      if (status === "idle" || status === "error") {
        connect();
      }
    } else {
      setIsOpen(false);
      stopListening();
      stopSpeaking();
    }
  }, [isOpen, status, connect, stopListening, stopSpeaking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      stopSpeaking();
    };
  }, [stopListening, stopSpeaking]);

  if (!user) return null;

  return (
    <>
      {/* Floating mic button */}
      <button
        onClick={toggleOpen}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 ${
          isOpen
            ? "bg-red-500 hover:bg-red-600 text-white"
            : status === "connected"
            ? "bg-emerald-500 hover:bg-emerald-600 text-white"
            : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
        }`}
        title={isOpen ? "Close voice assistant" : "Open voice assistant (Ctrl+Shift+V)"}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        {status === "connected" && !isOpen && (
          <span className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-30" />
        )}
      </button>

      {/* WhatsApp pending buttons */}
      {pendingWhatsApp && pendingWhatsApp.length > 0 && (
        <div className="fixed bottom-24 right-6 z-[60] flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          <button
            onClick={() => setPendingWhatsApp(null)}
            className="self-end px-2 py-1 rounded bg-zinc-700 text-white text-xs mb-1"
          >Dismiss all \u2715</button>
          {pendingWhatsApp.map((item, idx) => (
            <a
              key={idx}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setPendingWhatsApp(prev => prev ? prev.filter((_, i) => i !== idx) : null);
              }}
              className="flex items-center gap-2 px-4 py-3 rounded-full bg-green-500 hover:bg-green-600 text-white font-semibold shadow-lg text-sm"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.212l-.252-.149-2.868.852.852-2.868-.149-.252A8 8 0 1112 20z"/></svg>
              {item.label}
            </a>
          ))}
        </div>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className={`fixed bottom-24 right-6 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col transition-all duration-300 ${
          isExpanded ? "w-[420px] h-[600px]" : "w-[360px] h-[480px]"
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${
                status === "connected" ? (isListening ? "bg-emerald-400 animate-pulse" : "bg-emerald-400")
                : status === "connecting" ? "bg-amber-400 animate-pulse"
                : "bg-zinc-500"
              }`} />
              <span className="text-sm font-medium text-zinc-200">Hibba — المساعدة</span>
              {isSpeaking && <WaveformAnimation isActive={true} />}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (status === "connected") {
                    sendQuickText("Please give me a brief spoken summary of what I am currently viewing on this page.");
                  } else {
                    toast.info("Connect to Hibba first to get a page summary");
                  }
                }}
                title="Ask Hibba to summarise this page"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-400 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
              </button>
              <button
                onClick={async () => {
                  if (!currentSessionId) {
                    toast.info("No active session to email — start a session first");
                    return;
                  }
                  setEmailSummaryLoading(true);
                  try {
                    const res = await fetch("/api/trpc/voiceAgent.emailSessionSummary", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ json: { sessionId: currentSessionId } }),
                      credentials: "include",
                    });
                    const data = await res.json();
                    if (data?.result?.data?.json?.sent) {
                      toast.success("Session summary emailed to you!");
                    } else {
                      toast.error("Could not send email — please try again");
                    }
                  } catch {
                    toast.error("Email failed — please check your connection");
                  } finally {
                    setEmailSummaryLoading(false);
                  }
                }}
                title="Email session summary"
                disabled={emailSummaryLoading || !currentSessionId}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-400 transition-colors disabled:opacity-30"
              >
                {emailSummaryLoading ? (
                  <div className="w-4 h-4 border-2 border-zinc-500 border-t-blue-400 rounded-full animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => setShowCommandRef(!showCommandRef)}
                className={`p-1.5 rounded-lg transition-colors ${showCommandRef ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"}`}
                title="Voice command examples"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsTextMode(!isTextMode)}
                className={`p-1.5 rounded-lg transition-colors ${isTextMode ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"}`}
                title={isTextMode ? "Switch to voice mode" : "Switch to text mode"}
              >
                <Keyboard className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Command reference card */}
          {showCommandRef && (
            <div className="px-4 py-3 bg-zinc-800/50 border-b border-zinc-700/50 max-h-[200px] overflow-y-auto">
              <p className="text-xs font-semibold text-zinc-300 mb-2">Example voice commands:</p>
              <div className="space-y-2 text-xs text-zinc-400">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Navigation</p>
                <p className="flex items-start gap-1.5"><span className="text-emerald-400 mt-0.5">{"\u2022"}</span>"Take me to Donors" / "Open Training Tracker" / "Go to Bistro 87"</p>
                <p className="flex items-start gap-1.5"><span className="text-emerald-400 mt-0.5">{"\u2022"}</span>"Show me the Trustee Dashboard" / "Open Compliance Cockpit"</p>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mt-1.5">Actions</p>
                <p className="flex items-start gap-1.5"><span className="text-blue-400 mt-0.5">{"\u2022"}</span>"Send an email to Ahmed about the meeting"</p>
                <p className="flex items-start gap-1.5"><span className="text-blue-400 mt-0.5">{"\u2022"}</span>"Send a WhatsApp to the trustees"</p>
                <p className="flex items-start gap-1.5"><span className="text-blue-400 mt-0.5">{"\u2022"}</span>"Add a note to donor Khalid's profile"</p>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mt-1.5">Form Filling</p>
                <p className="flex items-start gap-1.5"><span className="text-purple-400 mt-0.5">{"\u2022"}</span>"I paid \u00a350 to the electrician yesterday for maintenance"</p>
                <p className="flex items-start gap-1.5"><span className="text-purple-400 mt-0.5">{"\u2022"}</span>"Record a Sadaqah of \u00a3100 from Brother Ahmed"</p>
                <p className="flex items-start gap-1.5"><span className="text-purple-400 mt-0.5">{"\u2022"}</span>"Add a bill: BT broadband, \u00a345, due 20th May"</p>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mt-1.5">Data & Queries</p>
                <p className="flex items-start gap-1.5"><span className="text-amber-400 mt-0.5">{"\u2022"}</span>"Find donor Ahmed" / "Show this month's expenses"</p>
                <p className="flex items-start gap-1.5"><span className="text-amber-400 mt-0.5">{"\u2022"}</span>"What's the prayer time for Maghrib?"</p>
                <p className="flex items-start gap-1.5"><span className="text-amber-400 mt-0.5">{"\u2022"}</span>"How many pledges are outstanding?" / "Show training records"</p>
              </div>
              <p className="text-[10px] text-zinc-500 mt-2 italic">Tip: Say "Bismillah" to start a new task.</p>
            </div>
          )}

          {/* Navigation banner with undo */}
          {lastNavigation && (
            <div className="mx-4 mt-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-between gap-2 text-xs text-emerald-300 animate-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2">
                <span>{"\uD83E\uDDED"}</span>
                <span>Navigated to <strong>{lastNavigation}</strong></span>
              </div>
              {prevLocation && (
                <button
                  onClick={() => {
                    navigate(prevLocation);
                    setLastNavigation(null);
                    setPrevLocation(null);
                    toast.info("Navigation undone");
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500/40 text-emerald-200 transition-colors"
                >
                  <Undo2 className="w-3 h-3" />
                  Undo
                </button>
              )}
            </div>
          )}

          {/* Transcript area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {status === "connecting" && (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-2 text-zinc-400 text-sm">
                  <div className="w-4 h-4 border-2 border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
                  Starting session...
                </div>
              </div>
            )}

            {status === "error" && (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <MicOff className="w-8 h-8 text-red-400" />
                <p className="text-sm text-zinc-400 text-center">
                  Could not connect to voice service.
                  <br />
                  <button onClick={connect} className="text-emerald-400 hover:underline mt-1">Try again</button>
                </p>
              </div>
            )}

            {/* Form Fill Confirmation Banner */}
            {pendingFormFill && (
              <div className="mx-1 mb-2 rounded-xl border border-emerald-500/30 bg-emerald-950/50 p-3 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-emerald-400 text-sm font-semibold">{"\u270d\ufe0f"} Hibba filled the form — please review</span>
                </div>
                <p className="text-xs text-zinc-300 mb-3 leading-relaxed">{pendingFormFill.summary}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent("hibba:confirm_form_fill", { detail: pendingFormFill }));
                      toast.success("Alhamdulillah — form confirmed!");
                      setPendingFormFill(null);
                    }}
                    className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2 px-3 transition-colors"
                  >
                    {"\u2713"} Confirm & Save
                  </button>
                  <button
                    onClick={() => {
                      setPendingFormFill(null);
                      toast("Form fill cancelled — tell Hibba what to change", { icon: "\u21a9\ufe0f" });
                    }}
                    className="flex-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-semibold py-2 px-3 transition-colors"
                  >
                    {"\u2717"} Change
                  </button>
                </div>
              </div>
            )}

            {/* Quick action chips */}
            {transcript.length === 0 && status === "connected" && (
              <div className="flex flex-col gap-2 py-4">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-emerald-500" />
                    Quick actions
                  </p>
                  <button
                    onClick={() => {
                      setEditActionsInput(effectiveQuickActions.join("\n"));
                      setShowEditActions(true);
                    }}
                    title="Customise quick actions for this page"
                    className="p-1 rounded text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {effectiveQuickActions.map((action: string) => (
                    <button
                      key={action}
                      onClick={() => sendQuickText(action)}
                      disabled={isProcessing}
                      className="text-xs px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-emerald-500/50 text-zinc-300 hover:text-emerald-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick actions edit modal */}
            {showEditActions && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-80 p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                      <Pencil className="w-4 h-4 text-emerald-400" />
                      Customise Quick Actions
                    </h3>
                    <button onClick={() => setShowEditActions(false)} className="text-zinc-500 hover:text-zinc-300">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500">One action per line. Up to 6 actions. These will be saved for this page.</p>
                  <textarea
                    value={editActionsInput}
                    onChange={(e) => setEditActionsInput(e.target.value)}
                    rows={6}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 resize-none focus:outline-none focus:border-emerald-500"
                    placeholder={"Summarise this page\nShow recent activity\nWhat needs my attention?"}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditActionsInput(currentQuickActions.join("\n"))}
                      className="flex-1 text-xs px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 transition-colors"
                    >
                      Reset to defaults
                    </button>
                    <button
                      disabled={savingActions}
                      onClick={async () => {
                        const lines = editActionsInput.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 6);
                        setSavingActions(true);
                        try {
                          const res = await fetch("/api/trpc/voiceAgent.saveQuickActions", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ json: { pageKey: screenContext || "/", actions: lines } }),
                            credentials: "include",
                          });
                          const data = await res.json();
                          if (data?.result?.data?.json?.saved) {
                            setCustomActions(lines);
                            setShowEditActions(false);
                            toast.success("Quick actions saved!");
                            refetchActions();
                          } else {
                            toast.error("Could not save — please try again");
                          }
                        } catch {
                          toast.error("Save failed");
                        } finally {
                          setSavingActions(false);
                        }
                      }}
                      className="flex-1 text-xs px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50"
                    >
                      {savingActions ? "Saving\u2026" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Transcript messages */}
            {transcript.map((entry) => (
              <div key={entry.id} className={`flex ${entry.speaker === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  entry.speaker === "user" ? "bg-emerald-600/80 text-white rounded-br-md" : "bg-zinc-800 text-zinc-200 rounded-bl-md"
                }`}>
                  <p className="whitespace-pre-wrap">{entry.text}</p>
                  {entry.toolCalls && entry.toolCalls.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {entry.toolCalls.map((tc, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-zinc-400">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          <span>{tc.name.replace(/_/g, " ")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-zinc-500">{(entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    {entry.speaker === "agent" && !entry.flagged && (
                      <button onClick={() => flagResponse(entry.id)} className="text-zinc-600 hover:text-amber-400 transition-colors p-0.5" title="Flag for review">
                        <Flag className="w-3 h-3" />
                      </button>
                    )}
                    {entry.flagged && (
                      <span className="text-[10px] text-amber-400 flex items-center gap-0.5"><Flag className="w-3 h-3" /> Flagged</span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Processing indicator */}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            {/* Interim speech text */}
            {interimText && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed bg-emerald-600/40 text-emerald-200 rounded-br-md italic">
                  {interimText}...
                </div>
              </div>
            )}

            <div ref={transcriptEndRef} />
          </div>

          {/* Input area */}
          <div className="px-4 py-3 border-t border-zinc-800">
            {status === "connected" ? (
              <div className="flex items-center gap-2">
                {isTextMode ? (
                  <>
                    <input
                      ref={inputRef}
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }}
                      placeholder={isProcessing ? "Thinking..." : "Type a message..."}
                      disabled={isProcessing}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50"
                      style={{ fontSize: "16px" }}
                    />
                    <Button size="sm" onClick={sendText} disabled={!textInput.trim() || isProcessing} className="rounded-xl bg-emerald-600 hover:bg-emerald-500 h-10 w-10 p-0">
                      <Send className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center gap-2">
                    {!sttSupported ? (
                      <div className="text-xs text-zinc-400 py-2 text-center">
                        Voice not supported in this browser.
                        <br />
                        <button onClick={() => setIsTextMode(true)} className="text-emerald-400 hover:underline mt-1">Switch to text mode</button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={toggleMic}
                          disabled={isProcessing}
                          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                            isListening
                              ? "bg-red-500 scale-110 shadow-lg shadow-red-500/30 ring-4 ring-red-400/40"
                              : "bg-emerald-600 hover:bg-emerald-500 hover:scale-105 disabled:opacity-50"
                          }`}
                        >
                          {isListening ? <PhoneOff className="w-6 h-6 text-white" /> : <Phone className="w-6 h-6 text-white" />}
                          {isListening && (
                            <span className="absolute inset-0 rounded-full border-2 border-red-300 animate-ping opacity-40" />
                          )}
                        </button>
                        <p className="text-[11px] text-zinc-500">
                          {isListening
                            ? (isSpeaking ? "Hibba is speaking... \u0628\u0633\u0645 \u0627\u0644\u0644\u0647" : "Listening... tap to stop")
                            : isProcessing
                              ? "Thinking..."
                              : "Tap to start speaking"}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-2">
                <Button size="sm" onClick={connect} className="rounded-xl bg-emerald-600 hover:bg-emerald-500">
                  {status === "connecting" ? "Connecting..." : "Start Session"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
