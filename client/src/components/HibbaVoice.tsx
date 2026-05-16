/**
 * HibbaVoice — Client-Side Voice Assistant
 *
 * Connects DIRECTLY to Gemini Live API from the browser using an
 * ephemeral token obtained via tRPC. No server proxy needed.
 *
 * Flow:
 *   1. Call trpc.voice.getEphemeralToken to get a short-lived Gemini token
 *   2. Create GoogleGenAI client with the ephemeral token
 *   3. Call ai.live.connect() — browser WebSocket goes directly to Google
 *   4. Stream mic audio → Gemini, receive audio → speaker
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, X, Loader2, Phone } from "lucide-react";
import { startAudioCapture, AudioPlayer, type AudioCaptureHandle } from "@/lib/audio-utils";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type State = "idle" | "connecting" | "connected" | "error";

interface Msg {
  type: "status" | "transcript" | "error";
  text: string;
}

const SYSTEM_INSTRUCTION = `You are Hibba, a warm and knowledgeable AI voice assistant for AQS (Al-Qalam Society), an Islamic charity and community organisation. You speak with a calm, professional, and friendly tone. You greet users with "Assalamu Alaikum" and can help with general questions about the organisation. Keep responses concise and conversational since this is a voice interface.`;

export function HibbaVoice() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [micOn, setMicOn] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);

  const sessionRef = useRef<any>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const captureRef = useRef<AudioCaptureHandle | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const connectingRef = useRef(false);

  const getToken = trpc.voice.getEphemeralToken.useMutation();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  useEffect(() => {
    return () => { disconnect(); };
  }, []);

  const add = useCallback((msg: Msg) => {
    setMsgs((prev) => [...prev.slice(-30), msg]);
  }, []);

  // ── Connect directly to Gemini Live API ──
  async function connect() {
    if (connectingRef.current || state === "connected") return;
    connectingRef.current = true;
    setState("connecting");
    setMsgs([]);
    add({ type: "status", text: "Connecting to Hibba..." });

    try {
      // 1. Get ephemeral token from our server
      add({ type: "status", text: "Getting voice token..." });
      const result = await getToken.mutateAsync();
      const { token, model, user } = result;
      add({ type: "status", text: `Authenticated as ${user}.` });

      // 2. Import @google/genai dynamically (it's a large package)
      add({ type: "status", text: "Initializing AI..." });
      const { GoogleGenAI, Modality } = await import("@google/genai");

      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: "v1alpha" },
      });

      // 3. Connect to Gemini Live API directly from browser
      add({ type: "status", text: "Connecting to Gemini..." });

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
            add({ type: "status", text: "Connected to Gemini." });
            setState("connected");
            connectingRef.current = false;
            // Auto-start mic
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

              // Handle output audio transcription
              const outputTranscript = msg?.serverContent?.outputTranscription?.text;
              if (outputTranscript) {
                add({ type: "transcript", text: outputTranscript });
              }

              // Handle input audio transcription
              const inputTranscript = msg?.serverContent?.inputTranscription?.text;
              if (inputTranscript) {
                add({ type: "transcript", text: `You: ${inputTranscript}` });
              }

              // Handle interruption (barge-in)
              if (msg?.serverContent?.interrupted) {
                playerRef.current?.interrupt();
              }

              // Handle turn complete
              if (msg?.serverContent?.turnComplete) {
                // Turn is done, ready for next input
              }
            } catch (e) {
              console.error("[Hibba] Error processing message:", e);
            }
          },
          onerror: (err: any) => {
            console.error("[Hibba] Gemini Live error:", err);
            add({ type: "error", text: `Voice error: ${err?.message || "Connection lost"}` });
            setState("error");
            connectingRef.current = false;
            stopMic();
          },
          onclose: (ev: any) => {
            console.log("[Hibba] Gemini Live session closed:", ev);
            add({ type: "status", text: "Session ended." });
            setState("idle");
            connectingRef.current = false;
            stopMic();
          },
        },
      });

      sessionRef.current = session;

      // Send a greeting prompt to trigger Hibba's first message
      session.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [{ text: "Greet me briefly." }],
          },
        ],
        turnComplete: true,
      });

    } catch (e: any) {
      console.error("[Hibba] Connection error:", e);
      const msg = e?.message?.includes("UNAUTHORIZED")
        ? "Authentication failed. Please log in again."
        : e?.message || "Connection failed. Please try again.";
      add({ type: "error", text: msg });
      setState("error");
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
    connectingRef.current = false;
  }

  // ── Mic control ──
  async function startMic() {
    if (captureRef.current) return;
    try {
      captureRef.current = await startAudioCapture((base64Pcm) => {
        // Send audio directly to Gemini via the live session
        if (sessionRef.current) {
          try {
            sessionRef.current.sendRealtimeInput({
              audio: {
                data: base64Pcm,
                mimeType: "audio/pcm;rate=16000",
              },
            });
          } catch (e) {
            console.error("[Hibba] Error sending audio:", e);
          }
        }
      });
      setMicOn(true);
    } catch (e: any) {
      toast.error("Microphone access denied");
      console.error("[Hibba] Mic error:", e);
    }
  }

  function stopMic() {
    captureRef.current?.stop();
    captureRef.current = null;
    setMicOn(false);
  }

  // ── Toggle ──
  function toggleMic() {
    if (state === "idle" || state === "error") {
      connect();
    } else if (state === "connected") {
      if (micOn) stopMic();
      else startMic();
    }
  }

  // ── Render ──
  const statusText =
    state === "connecting"
      ? "Connecting..."
      : state === "connected"
        ? micOn
          ? "Listening"
          : "Ready"
        : state === "error"
          ? "Connection failed — tap mic to retry"
          : "Tap mic to start";

  return (
    <>
      {/* Floating panel */}
      {isOpen && (
        <div
          className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-md rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden"
          style={{ maxHeight: "60vh" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-emerald-600 text-white">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              <span className="font-semibold text-sm">Hibba</span>
            </div>
            <button
              onClick={() => {
                disconnect();
                setIsOpen(false);
              }}
              className="p-1 hover:bg-emerald-700 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="p-3 overflow-y-auto" style={{ maxHeight: "40vh" }}>
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`text-xs mb-1.5 px-2 py-1 rounded ${
                  m.type === "error"
                    ? "bg-red-50 text-red-600"
                    : m.type === "transcript"
                      ? "bg-gray-50 text-gray-700"
                      : "bg-gray-100 text-gray-500"
                }`}
              >
                {m.type === "error" && "⚠ "}
                {m.text}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>
      )}

      {/* Mic button */}
      <div className="fixed bottom-4 left-0 right-0 z-50 flex flex-col items-center gap-1">
        <button
          onClick={() => {
            if (!isOpen) setIsOpen(true);
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
        <span className="text-xs text-gray-400">{statusText}</span>
      </div>
    </>
  );
}
