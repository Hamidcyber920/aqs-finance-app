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
import { useIsMobile } from "@/hooks/useMobile";
import {
  Mic,
  MicOff,
  X,
  Loader2,
  Phone,
  Minimize2,
  Maximize2,
} from "lucide-react";
import { startAudioCapture, AudioPlayer, type AudioCaptureHandle } from "@/lib/audio-utils";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type State = "idle" | "connecting" | "connected" | "error";

/** A chat-style message in the transcript */
interface ChatMessage {
  id: string;
  speaker: "hibba" | "user" | "system";
  text: string;
  final: boolean; // true when the sentence/turn is complete
}

const SYSTEM_INSTRUCTION = `HIBBA — VOICE AGENT FOR THE ABDULLAH QUILLIAM SOCIETY

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

# WHAT YOU KNOW ABOUT AQS (STATIC)
The Abdullah Quilliam Society is a registered UK charity (Charity #1157121) preserving Britain's first mosque, established 1889.
AQS operates three complexes on Brougham Terrace in Liverpool:
- 1-7 Brougham Terrace: Administrative hub & Bistro 87 (halal fine-dining).
- 8-10 Brougham Terrace: Original mosque & 14-bed student accommodation.
- 11-12 Brougham Terrace: Rimmer Building (active mosque expansion).

# TIMEZONE
You are based in Liverpool, UK. The timezone is Europe/London (GMT+1 during BST, GMT+0 during GMT).
When telling the time, ALWAYS convert to UK local time. Right now it is BST (British Summer Time, UTC+1).
Never say "UTC" to the user — always give the local UK time.

# HOW YOU RESPOND
Keep responses concise and conversational — this is a voice interface.
Speak in short complete sentences. Pause naturally so users can interrupt.
Never give long monologues. 2-3 sentences max per turn unless asked for detail.
`;

/** Detect if a string ends with sentence-ending punctuation */
function endsWithSentence(text: string): boolean {
  return /[.!?…।。]\s*$/.test(text.trim());
}

export function HibbaVoice() {
  const isMobile = useIsMobile();
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

  // Transcript buffering refs — accumulate words, flush on sentence boundary
  const hibbaBufferRef = useRef("");
  const userBufferRef = useRef("");
  const hibbaIdRef = useRef(0);
  const userIdRef = useRef(0);

  const getToken = trpc.voice.getEphemeralToken.useMutation();

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
      // 1. Get ephemeral token
      setStatusText("Authenticating...");
      const result = await getToken.mutateAsync();
      const { token, model, user } = result;

      upsertMessage("sys-auth", "system", `Connected as ${user}`, true);

      // 2. Import @google/genai dynamically
      setStatusText("Initializing AI...");
      const { GoogleGenAI, Modality } = await import("@google/genai");

      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: "v1alpha" },
      });

      // 3. Connect to Gemini Live API directly from browser
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
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
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
                for (const part of audioParts) {
                  if (part.inlineData?.data) {
                    if (!playerRef.current) playerRef.current = new AudioPlayer();
                    playerRef.current.play(part.inlineData.data);
                  }
                }
              }

              // Handle Hibba's transcript (output)
              const outputText = msg?.serverContent?.outputTranscription?.text;
              if (outputText) {
                hibbaBufferRef.current += outputText;
                const currentId = `hibba-${hibbaIdRef.current}`;
                // Show the in-progress text
                upsertMessage(currentId, "hibba", hibbaBufferRef.current.trim(), false);
                // If we have a complete sentence, finalize it
                if (endsWithSentence(hibbaBufferRef.current)) {
                  flushBuffer("hibba");
                }
              }

              // Handle user's transcript (input)
              const inputText = msg?.serverContent?.inputTranscription?.text;
              if (inputText) {
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
                // Finalize any in-progress Hibba message
                flushBuffer("hibba");
              }

              // Handle turn complete — finalize any remaining buffer
              if (msg?.serverContent?.turnComplete) {
                flushBuffer("hibba");
                flushBuffer("user");
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

      // Send greeting prompt
      session.sendClientContent({
        turns: [
          { role: "user", parts: [{ text: "Greet me briefly." }] },
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
