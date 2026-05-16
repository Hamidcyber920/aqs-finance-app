/**
 * HibbaVoice — Floating Voice Assistant Component
 * Connects to the Gemini 2.0 Flash Live backend via WebSocket.
 * Captures microphone audio, plays back AI responses, handles tool side effects.
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

export function HibbaVoice() {
  const [isOpen, setIsOpen] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [isMicActive, setIsMicActive] = useState(false);
  const [messages, setMessages] = useState<HibbaMessage[]>([]);
  const [, navigate] = useLocation();


  const wsRef = useRef<WebSocket | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const audioCaptureRef = useRef<AudioCaptureHandle | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const connect = useCallback(async () => {
    if (connectionState === "connecting" || connectionState === "connected") return;

    setConnectionState("connecting");
    setMessages([]);

    try {
      // 1. Get auth token
      const tokenRes = await fetch("/api/voice/token", { credentials: "include" });
      if (!tokenRes.ok) {
        const errBody = await tokenRes.json().catch(() => null);
        throw new Error(errBody?.error || "Authentication failed. Please log in again.");
      }
      const tokenData = await tokenRes.json();
      if (!tokenData?.token) {
        throw new Error("Invalid token response from server.");
      }
      const token = tokenData.token;

      // 2. Connect WebSocket
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/voice?token=${encodeURIComponent(token)}&voice=Aoede`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // 3. Initialize audio player
      audioPlayerRef.current = new AudioPlayer();

      ws.onopen = () => {
        console.log("[HibbaVoice] WebSocket connected");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleServerMessage(msg);
        } catch (err) {
          console.error("[HibbaVoice] Parse error:", err);
        }
      };

      ws.onerror = (err) => {
        console.error("[HibbaVoice] WebSocket error:", err);
        setConnectionState("error");
        addMessage({ type: "error", text: "Connection error. Please try again." });
      };

      ws.onclose = () => {
        console.log("[HibbaVoice] WebSocket closed");
        setConnectionState("idle");
        stopMic();
      };
    } catch (error: any) {
      console.error("[HibbaVoice] Connect error:", error);
      setConnectionState("error");
      addMessage({ type: "error", text: error.message || "Failed to connect." });
    }
  }, [connectionState]);

  const handleServerMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case "session_started":
        setConnectionState("connected");
        addMessage({ type: "status", text: `Connected as ${msg.user}` });
        // Auto-start mic after connection
        startMic();
        break;

      case "audio":
        // Play audio response
        if (msg.data && audioPlayerRef.current) {
          audioPlayerRef.current.play(msg.data);
        }
        break;

      case "transcript":
        if (msg.text) {
          addMessage({ type: "transcript", text: msg.text });
        }
        break;

      case "interrupted":
        // Barge-in: stop playback
        audioPlayerRef.current?.interrupt();
        break;

      case "tool_call":
        addMessage({ type: "tool_call", name: msg.name, text: `Calling: ${msg.name}` });
        break;

      case "tool_response":
        addMessage({ type: "tool_response", name: msg.name, data: msg.data });
        break;

      case "navigate":
        if (msg.path) {
          navigate(msg.path);
          toast.info(`Navigating to ${msg.path}`);
        }
        break;

      case "fill_form":
        if (msg.fields) {
          // Dispatch the hibba:fill_form event for useHibbaFormFill hooks
          window.dispatchEvent(
            new CustomEvent("hibba:fill_form", {
              detail: { fields: msg.fields, action: "fill" },
            })
          );
          toast.success("Form fields populated by Hibba");
        }
        break;

      case "session_ended":
        setConnectionState("idle");
        addMessage({ type: "status", text: "Session ended." });
        stopMic();
        break;

      case "error":
        addMessage({ type: "error", text: msg.message || "An error occurred." });
        break;
    }
  }, [navigate, toast, addMessage]);

  const startMic = useCallback(async () => {
    if (isMicActive || !wsRef.current) return;

    try {
      const handle = await startAudioCapture((base64Pcm) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "audio", data: base64Pcm }));
        }
      });
      audioCaptureRef.current = handle;
      setIsMicActive(true);
    } catch (error: any) {
      console.error("[HibbaVoice] Mic error:", error);
      toast.error("Please allow microphone access.");
    }
  }, [isMicActive]);

  const stopMic = useCallback(() => {
    if (audioCaptureRef.current) {
      audioCaptureRef.current.stop();
      audioCaptureRef.current = null;
    }
    setIsMicActive(false);
  }, []);

  const disconnect = useCallback(() => {
    stopMic();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.destroy();
      audioPlayerRef.current = null;
    }
    setConnectionState("idle");
  }, [stopMic]);

  const toggleSession = useCallback(() => {
    if (connectionState === "connected" || connectionState === "connecting") {
      disconnect();
    } else {
      connect();
    }
  }, [connectionState, connect, disconnect]);

  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "text", text }));
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
        {connectionState === "connected" && (isMicActive ? "🎙️ Listening..." : "Connected — mic muted")}
        {connectionState === "error" && "Connection failed"}
      </div>
    </div>
  );
}
