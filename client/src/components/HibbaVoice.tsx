/**
 * HibbaVoice — Minimal Voice Assistant Component
 * SSE (server→client) + HTTP POST (client→server)
 * No tools — pure audio conversation only.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, X, Loader2, Phone } from "lucide-react";
import { startAudioCapture, AudioPlayer, type AudioCaptureHandle } from "@/lib/audio-utils";
import { toast } from "sonner";

type State = "idle" | "connecting" | "connected" | "error";

interface Msg {
  type: "status" | "transcript" | "error";
  text: string;
}

const TOKEN_RETRIES = 3;
const TOKEN_DELAY = 2000;
const AUDIO_BATCH_MS = 200;

export function HibbaVoice() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [micOn, setMicOn] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);

  const sessionIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const captureRef = useRef<AudioCaptureHandle | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const batchRef = useRef<string[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => () => { disconnect(); }, []);

  const add = useCallback((msg: Msg) => {
    setMsgs(prev => [...prev.slice(-30), msg]);
  }, []);

  // ── Token fetch with retry ──
  async function fetchToken(): Promise<string> {
    let lastErr = "";
    for (let i = 1; i <= TOKEN_RETRIES; i++) {
      try {
        console.log(`[Hibba] Token attempt ${i}/${TOKEN_RETRIES}`);
        const r = await fetch("/api/voice/token", { credentials: "include" });
        if (!r.ok) {
          const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
          lastErr = body?.error || `HTTP ${r.status}`;
          if (r.status === 401) throw new Error("AUTH:" + lastErr);
          if (i < TOKEN_RETRIES) await new Promise(r => setTimeout(r, TOKEN_DELAY));
          continue;
        }
        const { token } = await r.json();
        if (!token) throw new Error("Empty token");
        return token;
      } catch (e: any) {
        if (e.message?.startsWith("AUTH:")) throw e;
        lastErr = e.message || "Network error";
        if (i < TOKEN_RETRIES) await new Promise(r => setTimeout(r, TOKEN_DELAY));
      }
    }
    throw new Error(lastErr);
  }

  // ── Connect ──
  async function connect() {
    if (state === "connecting" || state === "connected") return;
    setState("connecting");
    setMsgs([]);
    add({ type: "status", text: "Connecting to Hibba..." });

    try {
      // 1. Get token
      const token = await fetchToken();
      tokenRef.current = token;
      add({ type: "status", text: "Authenticated." });

      // 2. Start session
      const startRes = await fetch("/api/voice/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ voice: "Aoede" }),
      });

      if (!startRes.ok) {
        const body = await startRes.json().catch(() => ({}));
        throw new Error(body?.error || `Start failed: ${startRes.status}`);
      }

      const { sessionId, user } = await startRes.json();
      sessionIdRef.current = sessionId;
      add({ type: "status", text: `Session started for ${user}.` });

      // 3. Open SSE stream
      const streamUrl = `/api/voice/stream?sessionId=${sessionId}&token=${encodeURIComponent(token)}`;
      const es = new EventSource(streamUrl);
      esRef.current = es;

      add({ type: "status", text: "Connecting to AI..." });

      es.addEventListener("connected", () => {
        console.log("[Hibba] SSE connected");
      });

      es.addEventListener("session_started", (e) => {
        const d = JSON.parse(e.data);
        add({ type: "status", text: `Connected as ${d.user}` });
        setState("connected");
        // Start mic automatically
        startMic();
      });

      es.addEventListener("audio", (e) => {
        const d = JSON.parse(e.data);
        if (d.data) {
          if (!playerRef.current) playerRef.current = new AudioPlayer();
          playerRef.current.play(d.data);
        }
      });

      es.addEventListener("transcript", (e) => {
        const d = JSON.parse(e.data);
        if (d.text) {
          const prefix = d.source === "input" ? "You: " : "";
          add({ type: "transcript", text: prefix + d.text });
        }
      });

      es.addEventListener("interrupted", () => {
        playerRef.current?.interrupt();
      });

      es.addEventListener("error", (e) => {
        // SSE error event — could be from server or connection loss
        if (e instanceof MessageEvent) {
          try {
            const d = JSON.parse(e.data);
            add({ type: "error", text: d.message || "Connection error" });
          } catch {
            add({ type: "error", text: "Connection lost. Please try again." });
          }
        } else {
          // EventSource connection error
          console.error("[Hibba] EventSource error:", e);
          add({ type: "error", text: "Connection lost. Please try again." });
        }
        setState("error");
        stopMic();
      });

      es.addEventListener("session_ended", () => {
        add({ type: "status", text: "Session ended." });
        setState("idle");
        stopMic();
      });

    } catch (e: any) {
      const msg = e.message?.startsWith("AUTH:")
        ? "Authentication failed. Please log in again."
        : e.message || "Connection failed";
      add({ type: "error", text: msg });
      setState("error");
    }
  }

  // ── Disconnect ──
  function disconnect() {
    stopMic();
    stopBatch();

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    if (sessionIdRef.current && tokenRef.current) {
      fetch("/api/voice/stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      }).catch(() => {});
    }

    playerRef.current?.destroy();
    playerRef.current = null;
    sessionIdRef.current = null;
    tokenRef.current = null;
    setState("idle");
  }

  // ── Mic control ──
  async function startMic() {
    if (captureRef.current) return;
    try {
      captureRef.current = await startAudioCapture((base64) => {
        batchRef.current.push(base64);
      });
      setMicOn(true);
      startBatch();
    } catch (e: any) {
      toast.error("Microphone access denied");
      console.error("[Hibba] Mic error:", e);
    }
  }

  function stopMic() {
    captureRef.current?.stop();
    captureRef.current = null;
    setMicOn(false);
    stopBatch();
  }

  // ── Audio batching ──
  function startBatch() {
    if (batchTimerRef.current) return;
    batchTimerRef.current = setInterval(() => {
      if (batchRef.current.length === 0) return;
      const chunks = batchRef.current.splice(0);
      const combined = chunks.join("");
      if (!sessionIdRef.current || !tokenRef.current) return;

      fetch("/api/voice/audio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({ sessionId: sessionIdRef.current, data: combined }),
      }).catch((err) => {
        console.error("[Hibba] Audio POST error:", err);
      });
    }, AUDIO_BATCH_MS);
  }

  function stopBatch() {
    if (batchTimerRef.current) {
      clearInterval(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    batchRef.current = [];
  }

  // ── Toggle ──
  function toggleMic() {
    if (state === "idle" || state === "error") {
      connect();
    } else if (state === "connected") {
      if (micOn) stopMic(); else startMic();
    }
  }

  // ── Render ──
  const statusText =
    state === "connecting" ? "Connecting..." :
    state === "connected" ? (micOn ? "Listening" : "Ready") :
    state === "error" ? "Connection failed — tap mic to retry" :
    "Tap mic to start";

  return (
    <>
      {/* Floating panel */}
      {isOpen && (
        <div className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-md rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden"
          style={{ maxHeight: "60vh" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-emerald-600 text-white">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              <span className="font-semibold text-sm">Hibba</span>
            </div>
            <button onClick={() => { disconnect(); setIsOpen(false); }}
              className="p-1 hover:bg-emerald-700 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="p-3 overflow-y-auto" style={{ maxHeight: "40vh" }}>
            {msgs.map((m, i) => (
              <div key={i} className={`text-xs mb-1.5 px-2 py-1 rounded ${
                m.type === "error" ? "bg-red-50 text-red-600" :
                m.type === "transcript" ? "bg-gray-50 text-gray-700" :
                "bg-gray-100 text-gray-500"
              }`}>
                {m.type === "error" && "⚠ "}{m.text}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>
      )}

      {/* Mic button */}
      <div className="fixed bottom-4 left-0 right-0 z-50 flex flex-col items-center gap-1">
        <button
          onClick={() => { if (!isOpen) setIsOpen(true); toggleMic(); }}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${
            state === "connecting" ? "bg-yellow-500 animate-pulse" :
            state === "connected" && micOn ? "bg-emerald-600 animate-pulse" :
            state === "connected" ? "bg-emerald-600" :
            state === "error" ? "bg-red-500" :
            "bg-emerald-600 hover:bg-emerald-700"
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
