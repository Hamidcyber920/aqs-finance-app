/**
 * HibbaVoice — Floating Voice Assistant Component
 * Connects to the Gemini 2.5 Flash Live backend via SSE + HTTP POST.
 * Captures microphone audio, plays back AI responses, handles tool side effects.
 *
 * Transport: SSE (server→client) + HTTP POST (client→server)
 * This works through Cloudflare/Manus deployment proxy (no WebSocket needed).
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Mic, MicOff, X, Loader2, Phone } from "lucide-react";
import { startAudioCapture, AudioPlayer, type AudioCaptureHandle } from "@/lib/audio-utils";
import { toast } from "sonner";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

interface HibbaMessage {
  type: "transcript" | "tool_call" | "tool_response" | "error" | "status";
  text?: string;
  name?: string;
  data?: any;
}

// Connection retry configuration
const MAX_TOKEN_RETRIES = 3;
const TOKEN_RETRY_DELAY_MS = 2000;
const CONNECTION_TIMEOUT_MS = 30000; // 30s total for start + SSE + Gemini

// Audio batching: collect ~200ms of audio before sending to reduce HTTP overhead
const AUDIO_BATCH_INTERVAL_MS = 200;

export function HibbaVoice() {
  const [isOpen, setIsOpen] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [isMicActive, setIsMicActive] = useState(false);
  const [messages, setMessages] = useState<HibbaMessage[]>([]);
  const [, navigate] = useLocation();

  const sessionIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const audioCaptureRef = useRef<AudioCaptureHandle | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioBatchRef = useRef<string[]>([]);
  const audioBatchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  const addMessage = useCallback((msg: HibbaMessage) => {
    setMessages((prev) => [...prev.slice(-50), msg]); // Keep last 50 messages
  }, []);

  /**
   * Fetch the voice token with retry logic for cold starts / transient errors.
   */
  const fetchTokenWithRetry = async (): Promise<string> => {
    let lastError: string = "Unknown error";

    for (let attempt = 1; attempt <= MAX_TOKEN_RETRIES; attempt++) {
      try {
        console.log(`[HibbaVoice] Token fetch attempt ${attempt}/${MAX_TOKEN_RETRIES}`);
        const tokenRes = await fetch("/api/voice/token", { credentials: "include" });

        if (!tokenRes.ok) {
          const errBody = await tokenRes.json().catch(() => ({ error: `HTTP ${tokenRes.status}` }));
          lastError = errBody?.error || errBody?.detail || `HTTP ${tokenRes.status}`;
          console.warn(`[HibbaVoice] Token fetch failed (attempt ${attempt}):`, lastError);

          // Don't retry on 401 (auth failure) - user needs to log in
          if (tokenRes.status === 401) {
            throw new Error("Authentication failed. Please log in again.");
          }

          // Retry on 5xx (server errors, cold starts)
          if (attempt < MAX_TOKEN_RETRIES) {
            await new Promise((r) => setTimeout(r, TOKEN_RETRY_DELAY_MS * attempt));
            continue;
          }
          throw new Error(lastError);
        }

        const tokenData = await tokenRes.json();
        if (!tokenData?.token || typeof tokenData.token !== "string" || tokenData.token.length < 10) {
          throw new Error("Invalid token response from server.");
        }

        console.log(`[HibbaVoice] Token obtained (length: ${tokenData.token.length})`);
        return tokenData.token;
      } catch (err: any) {
        lastError = err?.message || "Network error";
        if (attempt >= MAX_TOKEN_RETRIES || lastError.includes("Authentication") || lastError.includes("log in")) {
          throw new Error(lastError);
        }
        await new Promise((r) => setTimeout(r, TOKEN_RETRY_DELAY_MS * attempt));
      }
    }

    throw new Error(lastError);
  };

  /**
   * Send batched audio chunks to the server via HTTP POST.
   */
  const flushAudioBatch = useCallback(async () => {
    if (audioBatchRef.current.length === 0) return;
    if (!sessionIdRef.current || !tokenRef.current) return;

    // Concatenate all base64 chunks
    const chunks = audioBatchRef.current.splice(0);
    const combined = chunks.join("");

    try {
      const res = await fetch("/api/voice/audio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          data: combined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 404) {
          console.error("[HibbaVoice] Audio send auth/session error:", err);
          // Session expired or auth failed — don't spam retries
        }
      }
    } catch (err: any) {
      // Network error — silently drop audio chunk (voice is lossy)
      console.warn("[HibbaVoice] Audio send network error:", err?.message);
    }
  }, []);

  const connect = useCallback(async () => {
    if (connectionState === "connecting" || connectionState === "connected") return;

    setConnectionState("connecting");
    setMessages([]);
    addMessage({ type: "status", text: "Connecting to Hibba..." });

    try {
      // 1. Get auth token with retry
      const token = await fetchTokenWithRetry();
      tokenRef.current = token;

      // 2. Start a voice session
      addMessage({ type: "status", text: "Starting voice session..." });
      const startRes = await fetch("/api/voice/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ voice: "Aoede" }),
      });

      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({ error: `HTTP ${startRes.status}` }));
        throw new Error(err?.error || `Failed to start session (${startRes.status})`);
      }

      const { sessionId, user } = await startRes.json();
      sessionIdRef.current = sessionId;
      console.log(`[HibbaVoice] Session started: ${sessionId} for ${user}`);

      // 3. Initialize audio player
      audioPlayerRef.current = new AudioPlayer();

      // 4. Set connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        console.warn("[HibbaVoice] Connection timeout — no session_started received");
        setConnectionState("error");
        addMessage({ type: "error", text: "Connection timed out. The AI service may be starting up — please try again." });
        disconnect();
      }, CONNECTION_TIMEOUT_MS);

      // 5. Open SSE stream
      const sseUrl = `/api/voice/stream?sessionId=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(token)}`;
      console.log(`[HibbaVoice] Opening SSE stream...`);
      addMessage({ type: "status", text: "Connecting to AI..." });

      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.addEventListener("connected", () => {
        console.log("[HibbaVoice] SSE connected, waiting for Gemini session...");
      });

      eventSource.addEventListener("session_started", (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log(`[HibbaVoice] Session started for ${data.user}`);

          // Clear timeout
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }

          setConnectionState("connected");
          addMessage({ type: "status", text: `Connected as ${data.user}` });

          // Auto-start mic
          startMicInternal();
        } catch (err) {
          console.error("[HibbaVoice] session_started parse error:", err);
        }
      });

      eventSource.addEventListener("audio", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.data && audioPlayerRef.current) {
            audioPlayerRef.current.play(data.data);
          }
        } catch (err) {
          console.error("[HibbaVoice] audio parse error:", err);
        }
      });

      eventSource.addEventListener("transcript", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.text) {
            addMessage({ type: "transcript", text: data.text });
          }
        } catch (err) {
          console.error("[HibbaVoice] transcript parse error:", err);
        }
      });

      eventSource.addEventListener("interrupted", () => {
        audioPlayerRef.current?.interrupt();
      });

      eventSource.addEventListener("tool_call", (e) => {
        try {
          const data = JSON.parse(e.data);
          addMessage({ type: "tool_call", name: data.name, text: `Calling: ${data.name}` });
        } catch (err) {
          console.error("[HibbaVoice] tool_call parse error:", err);
        }
      });

      eventSource.addEventListener("tool_response", (e) => {
        try {
          const data = JSON.parse(e.data);
          addMessage({ type: "tool_response", name: data.name, data: data.data });
        } catch (err) {
          console.error("[HibbaVoice] tool_response parse error:", err);
        }
      });

      eventSource.addEventListener("navigate", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.path) {
            navigate(data.path);
            toast.info(`Navigating to ${data.path}`);
          }
        } catch (err) {
          console.error("[HibbaVoice] navigate parse error:", err);
        }
      });

      eventSource.addEventListener("fill_form", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.fields) {
            window.dispatchEvent(
              new CustomEvent("hibba:fill_form", {
                detail: { fields: data.fields, action: "fill" },
              })
            );
            toast.success("Form fields populated by Hibba");
          }
        } catch (err) {
          console.error("[HibbaVoice] fill_form parse error:", err);
        }
      });

      eventSource.addEventListener("error", (e) => {
        // SSE "error" can be either a named event from server or a connection error
        if (e instanceof MessageEvent && e.data) {
          try {
            const data = JSON.parse(e.data);
            const errorText = data.message || "An error occurred.";
            addMessage({ type: "error", text: errorText });
            console.error("[HibbaVoice] Server error:", errorText);
          } catch {
            // Not a JSON error event — connection error
            handleSSEConnectionError();
          }
        } else {
          handleSSEConnectionError();
        }
      });

      eventSource.addEventListener("session_ended", () => {
        console.log("[HibbaVoice] Session ended by server");
        setConnectionState("idle");
        addMessage({ type: "status", text: "Session ended." });
        stopMic();
        cleanupEventSource();
      });

      // Handle native EventSource error (connection lost)
      eventSource.onerror = () => {
        // EventSource auto-reconnects by default, but we want to handle it
        if (eventSource.readyState === EventSource.CLOSED) {
          handleSSEConnectionError();
        }
      };

    } catch (error: any) {
      console.error("[HibbaVoice] Connect error:", error);
      setConnectionState("error");
      addMessage({ type: "error", text: error.message || "Failed to connect." });
    }
  }, [connectionState]);

  const handleSSEConnectionError = useCallback(() => {
    console.error("[HibbaVoice] SSE connection error");
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    setConnectionState("error");
    addMessage({ type: "error", text: "Connection lost. Please try again." });
    stopMic();
    cleanupEventSource();
  }, []);

  const cleanupEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  /**
   * Internal mic start — called after session_started.
   * Separated from startMic to avoid stale closure issues.
   */
  const startMicInternal = useCallback(async () => {
    try {
      const handle = await startAudioCapture((base64Pcm) => {
        // Buffer audio chunks for batching
        audioBatchRef.current.push(base64Pcm);
      });
      audioCaptureRef.current = handle;
      setIsMicActive(true);

      // Start audio batch flush timer
      audioBatchTimerRef.current = setInterval(() => {
        flushAudioBatch();
      }, AUDIO_BATCH_INTERVAL_MS);

      console.log("[HibbaVoice] Mic started, audio batching every", AUDIO_BATCH_INTERVAL_MS, "ms");
    } catch (error: any) {
      console.error("[HibbaVoice] Mic error:", error);
      toast.error("Please allow microphone access.");
    }
  }, [flushAudioBatch]);

  const startMic = useCallback(async () => {
    if (isMicActive || !sessionIdRef.current) return;
    startMicInternal();
  }, [isMicActive, startMicInternal]);

  const stopMic = useCallback(() => {
    // Stop audio batch timer
    if (audioBatchTimerRef.current) {
      clearInterval(audioBatchTimerRef.current);
      audioBatchTimerRef.current = null;
    }
    // Flush remaining audio
    flushAudioBatch();
    audioBatchRef.current = [];

    if (audioCaptureRef.current) {
      audioCaptureRef.current.stop();
      audioCaptureRef.current = null;
    }
    setIsMicActive(false);
  }, [flushAudioBatch]);

  const disconnect = useCallback(() => {
    // Clear any pending timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    stopMic();

    // Close SSE
    cleanupEventSource();

    // Tell server to stop session
    if (sessionIdRef.current && tokenRef.current) {
      fetch("/api/voice/stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      }).catch(() => {}); // Fire and forget
    }

    sessionIdRef.current = null;
    tokenRef.current = null;

    if (audioPlayerRef.current) {
      audioPlayerRef.current.destroy();
      audioPlayerRef.current = null;
    }
    setConnectionState("idle");
  }, [stopMic, cleanupEventSource]);

  const toggleSession = useCallback(() => {
    if (connectionState === "connected" || connectionState === "connecting") {
      disconnect();
    } else {
      connect();
    }
  }, [connectionState, connect, disconnect]);

  const sendText = useCallback(async (text: string) => {
    if (!sessionIdRef.current || !tokenRef.current) return;

    try {
      await fetch("/api/voice/text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          text,
        }),
      });
    } catch (err: any) {
      console.error("[HibbaVoice] Text send error:", err?.message);
    }
  }, []);

  // ─── Floating Button (when closed) ──────────────────────────────────────────
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg flex items-center justify-center transition-all hover:scale-105"
        title="Open Hibba Voice Assistant"
      >
        <Mic className="w-6 h-6" />
      </button>
    );
  }

  // ─── Expanded Panel ────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] h-[520px] bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-emerald-600 text-white">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4" />
          <span className="font-semibold text-sm">Hibba</span>
          {connectionState === "connected" && (
            <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
          )}
        </div>
        <button onClick={() => { disconnect(); setIsOpen(false); }} className="hover:bg-emerald-700 rounded p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm">
        {messages.length === 0 && connectionState === "idle" && (
          <div className="text-center text-muted-foreground mt-8">
            <p className="text-lg mb-2">Assalamu Alaikum</p>
            <p>Press the button below to start speaking with Hibba.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`rounded-lg px-3 py-2 ${
            msg.type === "transcript" ? "bg-muted text-foreground" :
            msg.type === "tool_call" ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs" :
            msg.type === "tool_response" ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 text-xs" :
            msg.type === "error" ? "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300" :
            "bg-muted/50 text-muted-foreground text-xs"
          }`}>
            {msg.type === "tool_call" && <span className="font-mono">⚡ {msg.text}</span>}
            {msg.type === "tool_response" && <span className="font-mono">✓ {msg.name}</span>}
            {msg.type === "transcript" && <span>{msg.text}</span>}
            {msg.type === "error" && <span>⚠ {msg.text}</span>}
            {msg.type === "status" && <span className="italic">{msg.text}</span>}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-t border-border flex items-center justify-center gap-4">
        {/* Main mic/connect button */}
        <button
          onClick={toggleSession}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
            connectionState === "connected"
              ? isMicActive
                ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
              : connectionState === "connecting"
              ? "bg-yellow-500 text-white cursor-wait"
              : "bg-emerald-600 hover:bg-emerald-700 text-white"
          }`}
          disabled={connectionState === "connecting"}
        >
          {connectionState === "connecting" ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : connectionState === "connected" ? (
            isMicActive ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />
          ) : (
            <Mic className="w-6 h-6" />
          )}
        </button>

        {/* Mute/unmute when connected */}
        {connectionState === "connected" && (
          <button
            onClick={isMicActive ? stopMic : startMic}
            className={`w-10 h-10 rounded-full flex items-center justify-center border ${
              isMicActive
                ? "border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                : "border-emerald-300 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950"
            }`}
            title={isMicActive ? "Mute" : "Unmute"}
          >
            {isMicActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Status bar */}
      <div className="px-4 py-1 text-xs text-muted-foreground text-center border-t border-border bg-muted/30">
        {connectionState === "idle" && "Ready"}
        {connectionState === "connecting" && "Connecting to Hibba..."}
        {connectionState === "connected" && (isMicActive ? "Listening..." : "Connected — mic muted")}
        {connectionState === "error" && "Connection failed — tap mic to retry"}
      </div>
    </div>
  );
}
