/**
 * VoiceAgent — Real-time bidirectional voice assistant using Gemini Live API
 *
 * Architecture:
 * - AudioWorklet captures 16kHz PCM audio continuously while mic is active
 * - PCM chunks are sent as base64 via WebSocket to server
 * - Server relays to Gemini Live API for real-time speech understanding + response
 * - Gemini's audio response (24kHz PCM) streams back and plays immediately
 * - Result: natural, real-time conversation like a phone call
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, X, Send, ChevronDown, ChevronUp, Flag, Keyboard, Phone, PhoneOff, HelpCircle, Sparkles, Zap, Undo2, Mail, Pencil, Plus, Trash2, GripVertical } from "lucide-react";
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

// ─── Audio Worklet Processor (inline) ────────────────────────────────────────
const AUDIO_WORKLET_CODE = `
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channelData = input[0];
    // Calculate RMS volume for VAD
    let sumSquares = 0;
    for (let i = 0; i < channelData.length; i++) {
      sumSquares += channelData[i] * channelData[i];
      this.buffer[this.bufferIndex++] = channelData[i];
      if (this.bufferIndex >= this.bufferSize) {
        const int16 = new Int16Array(this.bufferSize);
        for (let j = 0; j < this.bufferSize; j++) {
          const s = Math.max(-1, Math.min(1, this.buffer[j]));
          int16[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        this.port.postMessage({ pcm: int16.buffer }, [int16.buffer]);
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
      }
    }
    const rms = Math.sqrt(sumSquares / channelData.length);
    this.port.postMessage({ vad: true, volume: rms });
    return true;
  }
}
registerProcessor('pcm-capture-processor', PCMCaptureProcessor);
`;

// ─── Audio Playback Queue ────────────────────────────────────────────────────
class AudioPlaybackQueue {
  private audioContext: AudioContext | null = null;
  private queue: Float32Array[] = [];
  private isPlaying = false;
  private nextStartTime = 0;
  private sampleRate = 24000;
  // Track active source nodes so we can hard-stop them on barge-in
  private activeSources: AudioBufferSourceNode[] = [];
  init() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
  }
  enqueue(pcmBase64: string) {
    if (!this.audioContext) this.init();
    const binaryStr = atob(pcmBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    this.queue.push(float32);
    if (!this.isPlaying) {
      this.playNext();
    }
  }
  private playNext() {
    if (!this.audioContext || this.queue.length === 0) {
      this.isPlaying = false;
      this.activeSources = [];
      return;
    }
    this.isPlaying = true;
    const samples = this.queue.shift()!;
    const buffer = this.audioContext.createBuffer(1, samples.length, this.sampleRate);
    buffer.getChannelData(0).set(samples);
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    const currentTime = this.audioContext.currentTime;
    const startTime = Math.max(currentTime, this.nextStartTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;
    this.activeSources.push(source);
    source.onended = () => {
      this.activeSources = this.activeSources.filter(s => s !== source);
      this.playNext();
    };
  }
  stop() {
    // Hard-stop all currently-playing source nodes immediately
    for (const src of this.activeSources) {
      try { src.stop(); } catch (_) { /* already stopped */ }
    }
    this.activeSources = [];
    this.queue = [];
    this.isPlaying = false;
    this.nextStartTime = 0;
  }
  get playing() { return this.isPlaying; }
  destroy() {
    this.stop();
    this.audioContext?.close();
    this.audioContext = null;
  }
}

// ─── WebSocket connection manager ────────────────────────────────────────────
class VoiceConnection {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private onMessage: (msg: any) => void;
  private onStatusChange: (status: string) => void;

  constructor(onMessage: (msg: any) => void, onStatusChange: (status: string) => void) {
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;
  }

  async connect(screenContext: string, entityContext?: string, language?: string) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.onStatusChange("connecting");
    try {
      const tokenRes = await fetch("/api/voice/token", { credentials: "include" });
      if (!tokenRes.ok) {
        this.onStatusChange("error");
        toast.error("Authentication failed. Please log in again.");
        return;
      }
      const { token } = await tokenRes.json();
      const wsUrl = `${protocol}//${window.location.host}/api/voice?token=${encodeURIComponent(token)}`;
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        this.ws?.send(JSON.stringify({ type: "start_session", screenContext, entityContext, language: language || "en-GB" }));
      };
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "session_started") {
            this.sessionId = msg.sessionId;
            this.onStatusChange("connected");
          }
          this.onMessage(msg);
        } catch {}
      };
      this.ws.onclose = () => { this.onStatusChange("disconnected"); this.sessionId = null; };
      this.ws.onerror = () => { this.onStatusChange("error"); };
    } catch {
      this.onStatusChange("error");
    }
  }

  sendAudioChunk(pcmBase64: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "audio_chunk", audio: pcmBase64 }));
    }
  }

  sendText(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "text_input", text }));
    }
  }

  sendScreenContext(screenContext: string, entityContext?: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "screen_context", screenContext, entityContext }));
    }
  }

  sendCorrection(transcriptId: string, note: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "correct_this", transcriptId, correctionNote: note }));
    }
  }

  disconnect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "end_session" }));
    }
    this.ws?.close();
    this.ws = null;
    this.sessionId = null;
  }

  get isConnected() { return this.ws?.readyState === WebSocket.OPEN; }
  get currentSessionId() { return this.sessionId; }
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

// ─── Main Component ──────────────────────────────────────────────────────────
export default function VoiceAgent({ screenContext = "dashboard", entityContext }: VoiceAgentProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [status, setStatus] = useState<string>("idle");
  const [isLive, setIsLive] = useState(false);
  const [isGeminiReady, setIsGeminiReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTextMode, setIsTextMode] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tokensRemaining, setTokensRemaining] = useState<number | null>(null);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const VAD_THRESHOLD = 0.04; // RMS threshold for speech detection (raised to avoid false barge-in from mic noise)
  const BARGE_IN_FRAMES = 5; // consecutive frames above threshold before triggering barge-in
  const SILENCE_TIMEOUT_MS = 1200; // ms of silence before marking as not speaking

  const connectionRef = useRef<VoiceConnection | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playbackRef = useRef<AudioPlaybackQueue>(new AudioPlaybackQueue());
  const isSpeakingRef = useRef(false);
  const bargeInFramesRef = useRef(0); // consecutive frames above VAD threshold
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showCommandRef, setShowCommandRef] = useState(false);
  const [lastNavigation, setLastNavigation] = useState<string | null>(null);
  const [prevLocation, setPrevLocation] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [emailSummaryLoading, setEmailSummaryLoading] = useState(false);
  const [showEditActions, setShowEditActions] = useState(false);
  const [editActionsInput, setEditActionsInput] = useState("");
  const [customActions, setCustomActions] = useState<string[] | null>(null);
  const [savingActions, setSavingActions] = useState(false);

  // Load user's custom quick actions for current page
  const { data: savedActions, refetch: refetchActions } = (trpc as any).voiceAgent.getQuickActions.useQuery(
    { pageKey: screenContext || "/" },
    { enabled: !!screenContext }
  );
  // Load admin-shared actions as fallback (only when user has no saved actions)
  const { data: adminSharedActions } = (trpc as any).voiceAgent.getAdminSharedActions.useQuery(
    { pageKey: screenContext || "/" },
    { enabled: !!screenContext && !savedActions }
  );
  // Merge priority: user custom > user saved > admin shared > built-in defaults
  const effectiveQuickActions = (customActions ?? (savedActions as string[] | null | undefined) ?? (adminSharedActions as string[] | null | undefined)) ?? currentQuickActions;
  const SECTION_NAMES: Record<string, string> = {
    "/dashboard":"Dashboard","/receipts":"Receipts","/reports":"Reports",
    "/fundraising":"Fundraising","/loans":"Loans","/income":"Income",
    "/payroll":"Payroll","/monthly-expenses":"Monthly Expenses",
    "/reconciliation":"Reconciliation","/donors":"Donors","/campaigns":"Campaigns",
    "/communications":"Communications","/comms-hub":"Comms Hub",
    "/comms-inbox":"Master Inbox","/admin":"Admin Panel",
    "/trustees":"Trustees & Staff Contacts","/accommodation":"Accommodation",
    "/compliance":"Compliance Cockpit","/decisions":"Decisions Register",
    "/gift-aid":"Gift Aid","/meetings":"Meetings & Onboarding",
    "/audit-trail":"Audit Trail","/system-health":"System Health",
    "/pledges":"Pledges","/donor-pipeline":"Cultivation Pipeline",
    "/major-donor":"Major Donor DD","/bulk-approvals":"Bulk Approvals",
    "/conflicts-register":"Conflicts Register","/recognition-tiers":"Recognition Tiers",
    "/qr-codes":"QR Codes","/saved-views":"Saved Views",
    "/bills-utilities":"Bills & Utilities","/training-tracker":"Training Tracker",
    "/lbmw-correspondence":"LBMW Correspondence","/trustee-dashboard":"Trustee Dashboard",
    "/facilities":"Facilities & Bookings","/bistro87":"Bistro 87",
    "/donate":"Donation Page","/voice-history":"Voice History",
    "/profile":"Profile","/settings":"Settings",
  };
  // Context-aware quick action chips per page
  const QUICK_ACTIONS: Record<string, string[]> = {
    "/dashboard": ["Summarise today's dashboard", "Any urgent items?", "What needs my attention?"],
    "/receipts": ["Summarise my expenses", "Any pending approvals?", "Show this month's receipts"],
    "/reports": ["Summarise this month's report", "What's the income vs expenses?", "Any anomalies?"],
    "/fundraising": ["Summarise all campaigns", "Which campaign is closest to target?", "Total donations this month?"],
    "/loans": ["Show overdue loans", "Summarise active loans", "Any loans due this month?"],
    "/income": ["Summarise this month's income", "Any outstanding payments?", "Compare to last month"],
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
    "/bills-utilities": ["Any bills due soon?", "Summarise utility costs", "Any overdue payments?"],
    "/major-donor": ["Summarise major donor pipeline", "Any prospects to follow up?", "Who's in cultivation?"],
    "/donor-crm": ["Summarise CRM activity", "Any donors to follow up?", "Recent communications?"],
    "/voice-history": ["Summarise recent sessions", "How many sessions this week?", "Any flagged responses?"],
    "/system-health": ["Is everything healthy?", "Any errors or warnings?", "What's the server status?"],
  };
  const currentQuickActions = QUICK_ACTIONS[screenContext] || ["Summarise this page", "What can I help with?", "Show recent activity"];


  // Keep isSpeakingRef in sync with isSpeaking state
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
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

  // Update screen context
  useEffect(() => {
    if (connectionRef.current?.isConnected) {
      connectionRef.current.sendScreenContext(screenContext, entityContext);
    }
  }, [screenContext, entityContext]);

  // Handle incoming messages from server
  const handleMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case "session_started":
        setTranscript((prev) => [...prev, { id: `welcome-${Date.now()}`, speaker: "agent", text: msg.text || "Hello! How can I help you today?", timestamp: new Date() }]);
        setIsProcessing(false);
        break;
      case "gemini_ready":
        setIsGeminiReady(true);
        break;
      case "audio_response":
        setIsSpeaking(true);
        playbackRef.current.enqueue(msg.audio);
        break;
      case "interrupted":
        // Barge-in acknowledged by server
        setIsSpeaking(false);
        playbackRef.current.stop();
        break;
      case "turn_complete":
        setIsSpeaking(false);
        setIsProcessing(false);
        break;
      case "transcript": {
        const speaker = msg.speaker === "assistant" ? "agent" : msg.speaker;
        setTranscript((prev) => {
          // Merge with the last entry if it's from the same speaker and within 3 seconds
          const last = prev[prev.length - 1];
          if (last && last.speaker === speaker && (Date.now() - last.timestamp.getTime()) < 3000) {
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, text: last.text + " " + msg.text };
            return updated;
          }
          return [...prev, { id: `${speaker}-${Date.now()}`, speaker, text: msg.text, timestamp: new Date() }];
        });
        break;
      }
      case "agent_response":
        setTranscript((prev) => [...prev, { id: `agent-${Date.now()}`, speaker: "agent", text: msg.text, timestamp: new Date() }]);
        setIsProcessing(false);
        break;
      case "tool_call":
        if (msg.toolResult?.status === "executing") {
          setIsProcessing(true);
        }
        break;
      case "cost_warning":
        setTokensRemaining(msg.tokensRemaining);
        toast.warning(msg.costWarning);
        break;
      case "error":
        toast.error(msg.error || "Voice agent error");
        setIsProcessing(false);
        break;
      case "navigate":
        if (msg.path) {
          // Save current location so user can undo
          setPrevLocation(window.location.pathname);
          navigate(msg.path);
          const sn = SECTION_NAMES[msg.path as string] || (msg.path as string).replace(/^\//, "").replace(/-/g, " ");
          setLastNavigation(sn);
          toast.success("Navigated to " + sn, { duration: 2500 });
          setTimeout(() => { setLastNavigation(null); setPrevLocation(null); }, 5000);
        }
        break;
      case "session_started":
        if ((msg as any).dbSessionId) setCurrentSessionId((msg as any).dbSessionId);
        break;
      case "session_ended":
        setStatus("disconnected");
        setIsProcessing(false);
        setIsLive(false);
        setIsGeminiReady(false);
        break;
    }
  }, [navigate]);

  // Connect to voice gateway
  const connect = useCallback(() => {
    if (!user) { toast.error("Please log in to use the voice assistant"); return; }
    const conn = new VoiceConnection(handleMessage, setStatus);
    conn.connect(screenContext, entityContext);
    connectionRef.current = conn;
    playbackRef.current.init();
  }, [user, screenContext, entityContext, handleMessage]);

  // Disconnect
  const disconnect = useCallback(() => {
    stopMic();
    connectionRef.current?.disconnect();
    connectionRef.current = null;
    playbackRef.current.stop();
    setStatus("idle");
    setIsGeminiReady(false);
    setIsLive(false);
  }, []);

  // Start streaming mic audio via AudioWorklet
  const startMic = useCallback(async () => {
    if (!connectionRef.current?.isConnected || !isGeminiReady) {
      toast.error("Voice service not ready yet. Please wait a moment.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // Create AudioWorklet for low-latency PCM capture
      const workletBlob = new Blob([AUDIO_WORKLET_CODE], { type: "application/javascript" });
      const workletUrl = URL.createObjectURL(workletBlob);
      await audioContext.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, "pcm-capture-processor");
      workletNodeRef.current = workletNode;

      // Send PCM chunks to server as base64 + VAD
      workletNode.port.onmessage = (event) => {
        if (event.data.vad) {
          // Voice Activity Detection: update volume and speaking state
          const vol = event.data.volume as number;
          setVolumeLevel(vol);
          if (vol > VAD_THRESHOLD) {
            bargeInFramesRef.current += 1;
            setUserSpeaking(true);
            // Barge-in: require sustained speech (BARGE_IN_FRAMES consecutive frames) to avoid false triggers
            if (bargeInFramesRef.current >= BARGE_IN_FRAMES && playbackRef.current && isSpeakingRef.current) {
              playbackRef.current.stop();
              setIsSpeaking(false);
              bargeInFramesRef.current = 0;
            }
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          } else {
            bargeInFramesRef.current = 0; // reset on silence
            if (!silenceTimerRef.current) {
              silenceTimerRef.current = setTimeout(() => {
                setUserSpeaking(false);
                silenceTimerRef.current = null;
              }, SILENCE_TIMEOUT_MS);
            }
          }
          return;
        }
        if (event.data.pcm) {
          const pcmBuffer = new Uint8Array(event.data.pcm);
          let binary = "";
          for (let i = 0; i < pcmBuffer.length; i++) {
            binary += String.fromCharCode(pcmBuffer[i]);
          }
          const base64 = btoa(binary);
          connectionRef.current?.sendAudioChunk(base64);
        }
      };

      source.connect(workletNode);
      workletNode.connect(audioContext.destination);
      setIsLive(true);
    } catch (err) {
      toast.error("Microphone access denied. Please allow microphone permission.");
    }
  }, [isGeminiReady]);
  // Cleanup silence timer on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // Stop streaming mic
  const stopMic = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setIsLive(false);
  }, []);

  // Toggle mic on/off
  const toggleMic = useCallback(() => {
    if (isLive) {
      stopMic();
    } else {
      startMic();
    }
  }, [isLive, startMic, stopMic]);

  // Send text message
  const sendText = useCallback(() => {
    if (!textInput.trim() || !connectionRef.current?.isConnected) return;
    const text = textInput.trim();
    setTextInput("");
    setIsProcessing(true);
    setTranscript((prev) => [...prev, { id: `user-${Date.now()}`, speaker: "user", text, timestamp: new Date() }]);
    connectionRef.current.sendText(text);
  }, [textInput]);
  // Send a quick action text without needing the input field
  const sendQuickText = useCallback((text: string) => {
    if (!connectionRef.current?.isConnected) return;
    setIsProcessing(true);
    setTranscript((prev) => [...prev, { id: `user-${Date.now()}`, speaker: "user", text, timestamp: new Date() }]);
    connectionRef.current.sendText(text);
  }, []);

  // Flag response
  const flagResponse = useCallback((entryId: string) => {
    connectionRef.current?.sendCorrection(entryId, "User flagged this response as incorrect");
    setTranscript((prev) => prev.map((t) => (t.id === entryId ? { ...t, flagged: true } : t)));
    toast.success("Flagged for Dr. Hamid's review");
  }, []);

  // Toggle panel
  const toggleOpen = useCallback(() => {
    if (!isOpen) {
      setIsOpen(true);
      if (status === "idle" || status === "disconnected" || status === "error") {
        connect();
      }
    } else {
      setIsOpen(false);
    }
  }, [isOpen, status, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMic();
      connectionRef.current?.disconnect();
      playbackRef.current.destroy();
    };
  }, []);

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

      {/* Chat panel */}
      {isOpen && (
        <div className={`fixed bottom-24 right-6 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col transition-all duration-300 ${
          isExpanded ? "w-[420px] h-[600px]" : "w-[360px] h-[480px]"
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${
                status === "connected" ? (isLive ? "bg-emerald-400 animate-pulse" : "bg-emerald-400")
                : status === "connecting" ? "bg-amber-400 animate-pulse"
                : "bg-zinc-500"
              }`} />
              <span className="text-sm font-medium text-zinc-200">Hibba Voice Assistant</span>
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
                    // Use fetch directly since we need to call trpc mutation imperatively
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

          {/* Token usage bar */}
          {tokensRemaining !== null && tokensRemaining < 40000 && (
            <div className="px-4 py-1.5 bg-amber-900/30 border-b border-amber-800/30">
              <div className="flex items-center justify-between text-xs text-amber-300">
                <span>Daily tokens remaining</span>
                <span>{tokensRemaining.toLocaleString()}</span>
              </div>
              <div className="mt-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${Math.max(0, (tokensRemaining / 200000) * 100)}%` }} />
              </div>
            </div>
          )}

          {/* Command reference card */}
          {showCommandRef && (
            <div className="px-4 py-3 bg-zinc-800/50 border-b border-zinc-700/50 max-h-[200px] overflow-y-auto">
              <p className="text-xs font-semibold text-zinc-300 mb-2">Example voice commands:</p>
              <div className="space-y-2 text-xs text-zinc-400">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Navigation</p>
                <p className="flex items-start gap-1.5"><span className="text-emerald-400 mt-0.5">•</span>"Take me to Donors" / "Open Training Tracker" / "Go to Bistro 87"</p>
                <p className="flex items-start gap-1.5"><span className="text-emerald-400 mt-0.5">•</span>"Show me the Trustee Dashboard" / "Open Compliance Cockpit"</p>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mt-1.5">Actions</p>
                <p className="flex items-start gap-1.5"><span className="text-blue-400 mt-0.5">•</span>"Send an email to Ahmed about the meeting"</p>
                <p className="flex items-start gap-1.5"><span className="text-blue-400 mt-0.5">•</span>"Send a WhatsApp to the trustees"</p>
                <p className="flex items-start gap-1.5"><span className="text-blue-400 mt-0.5">•</span>"Add a note to donor Khalid's profile"</p>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mt-1.5">Data & Queries</p>
                <p className="flex items-start gap-1.5"><span className="text-amber-400 mt-0.5">•</span>"Find donor Ahmed" / "Show this month's expenses"</p>
                <p className="flex items-start gap-1.5"><span className="text-amber-400 mt-0.5">•</span>"What's the prayer time for Maghrib?"</p>
                <p className="flex items-start gap-1.5"><span className="text-amber-400 mt-0.5">•</span>"How many pledges are outstanding?" / "Show training records"</p>
                <p className="flex items-start gap-1.5"><span className="text-amber-400 mt-0.5">•</span>"What decisions are pending?" / "Show LBMW correspondence"</p>
                <p className="flex items-start gap-1.5"><span className="text-amber-400 mt-0.5">•</span>"What's today's Bistro summary?" / "Show conflicts register"</p>
              </div>
              <p className="text-[10px] text-zinc-500 mt-2 italic">Tip: Interrupt Hibba by speaking while she's talking. She responds without hesitation.</p>
            </div>
          )}
          {/* Navigation banner with undo */}
          {lastNavigation && (
            <div className="mx-4 mt-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-between gap-2 text-xs text-emerald-300 animate-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2">
                <span>🧭</span>
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
                  Connecting...
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

            {/* Quick action chips — shown when transcript is empty and connected */}
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
                  {effectiveQuickActions.map((action) => (
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
                      onClick={() => {
                        const defaults = currentQuickActions;
                        setEditActionsInput(defaults.join("\n"));
                      }}
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
                      {savingActions ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            )}
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
                    <span className="text-[10px] text-zinc-500">{entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
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
                    {!isGeminiReady ? (
                      <div className="flex items-center gap-2 text-zinc-400 text-sm py-4">
                        <div className="w-4 h-4 border-2 border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
                        Connecting to voice service...
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={toggleMic}
                          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                            isLive
                              ? (userSpeaking ? "bg-red-500 scale-110 shadow-lg shadow-red-500/30 ring-4 ring-red-400/40" : "bg-red-500 scale-105 shadow-lg shadow-red-500/20")
                              : "bg-emerald-600 hover:bg-emerald-500 hover:scale-105"
                          }`}
                        >
                          {isLive ? <PhoneOff className="w-6 h-6 text-white" /> : <Phone className="w-6 h-6 text-white" />}
                          {isLive && userSpeaking && (
                            <span className="absolute inset-0 rounded-full border-2 border-red-300 animate-ping opacity-40" />
                          )}
                        </button>
                        <p className="text-[11px] text-zinc-500">
                          {isLive
                            ? (isSpeaking
                              ? "Hibba is speaking..."
                              : userSpeaking
                                ? "Hearing you..."
                                : "Listening... tap to mute")
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
                  {status === "connecting" ? "Connecting..." : status === "disconnected" ? "Reconnect" : "Start Session"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
