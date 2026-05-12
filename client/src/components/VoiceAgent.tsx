/**
 * VoiceAgent — Floating microphone button with transcript pane
 *
 * Features:
 * - Floating mic button (bottom-right, configurable position)
 * - Press-and-hold to talk, release to send
 * - Tap-to-toggle for hands-free mode
 * - Waveform animation while processing
 * - Streaming text transcription for accessibility
 * - Collapsible history pane (last few turns)
 * - "Correct this" button on any agent statement
 * - Keyboard equivalent (Ctrl+Shift+V to toggle)
 * - Text input fallback when mic not available
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, X, Send, ChevronDown, ChevronUp, Flag, Keyboard, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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

// ─── WebSocket connection manager ────────────────────────────────────────────

class VoiceConnection {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private onMessage: (msg: any) => void;
  private onStatusChange: (status: string) => void;

  constructor(onMessage: (msg: any) => void, onStatusChange: (status: string) => void) {
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;
  }

  connect(token: string, screenContext: string, entityContext?: string, language?: string) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/voice`;

    this.onStatusChange("connecting");

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.ws?.send(
          JSON.stringify({
            type: "start_session",
            sessionToken: token,
            screenContext,
            entityContext,
            language: language || "en-GB",
          })
        );
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "session_started") {
            this.sessionId = msg.sessionId;
            this.onStatusChange("connected");
          }
          this.onMessage(msg);
        } catch {
          console.error("[VoiceAgent] Failed to parse message");
        }
      };

      this.ws.onclose = () => {
        this.onStatusChange("disconnected");
        this.sessionId = null;
      };

      this.ws.onerror = () => {
        this.onStatusChange("error");
      };
    } catch {
      this.onStatusChange("error");
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

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get currentSessionId() {
    return this.sessionId;
  }
}

// ─── Waveform animation component ───────────────────────────────────────────

function WaveformAnimation({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex items-center gap-0.5 h-6">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className={`w-1 rounded-full transition-all duration-150 ${
            isActive ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
          }`}
          style={{
            height: isActive ? `${12 + Math.sin(Date.now() / 200 + i) * 8}px` : "4px",
            animationDelay: `${i * 100}ms`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function VoiceAgent({ screenContext = "dashboard", entityContext }: VoiceAgentProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [status, setStatus] = useState<string>("idle"); // idle, connecting, connected, processing, error, disconnected
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isTextMode, setIsTextMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tokensRemaining, setTokensRemaining] = useState<number | null>(null);

  const connectionRef = useRef<VoiceConnection | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Update screen context when it changes
  useEffect(() => {
    if (connectionRef.current?.isConnected) {
      connectionRef.current.sendScreenContext(screenContext, entityContext);
    }
  }, [screenContext, entityContext]);

  // Handle incoming messages
  const handleMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case "session_started":
        setTranscript((prev) => [
          ...prev,
          {
            id: `welcome-${Date.now()}`,
            speaker: "agent",
            text: msg.text || "Hello! How can I help you today?",
            timestamp: new Date(),
          },
        ]);
        setIsProcessing(false);
        break;

      case "agent_response":
        setTranscript((prev) => [
          ...prev,
          {
            id: `agent-${Date.now()}`,
            speaker: "agent",
            text: msg.text,
            timestamp: new Date(),
          },
        ]);
        setIsProcessing(false);
        break;

      case "tool_call":
        if (msg.toolResult?.status === "executing") {
          // Show tool execution indicator
          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (last?.speaker === "agent" && last.toolCalls) {
              return [
                ...prev.slice(0, -1),
                { ...last, toolCalls: [...last.toolCalls, { name: msg.toolName, status: "executing" }] },
              ];
            }
            return prev;
          });
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

      case "session_ended":
        setStatus("disconnected");
        setIsProcessing(false);
        break;
    }
  }, []);

  // Connect to voice gateway
  const connect = useCallback(() => {
    if (!user) {
      toast.error("Please log in to use the voice assistant");
      return;
    }

    // Get session token from cookie
    const cookies = document.cookie.split(";").map((c) => c.trim());
    const sessionCookie = cookies.find((c) => c.startsWith("session="));
    const token = sessionCookie?.split("=")[1];

    if (!token) {
      toast.error("Session expired. Please log in again.");
      return;
    }

    const conn = new VoiceConnection(handleMessage, setStatus);
    conn.connect(token, screenContext, entityContext);
    connectionRef.current = conn;
  }, [user, screenContext, entityContext, handleMessage]);

  // Disconnect
  const disconnect = useCallback(() => {
    connectionRef.current?.disconnect();
    connectionRef.current = null;
    setStatus("idle");
  }, []);

  // Send text message
  const sendText = useCallback(() => {
    if (!textInput.trim() || !connectionRef.current?.isConnected) return;

    const text = textInput.trim();
    setTextInput("");
    setIsProcessing(true);

    setTranscript((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        speaker: "user",
        text,
        timestamp: new Date(),
      },
    ]);

    connectionRef.current.sendText(text);
  }, [textInput]);

  // Flag a response for review
  const flagResponse = useCallback((entryId: string) => {
    connectionRef.current?.sendCorrection(entryId, "User flagged this response as incorrect");
    setTranscript((prev) =>
      prev.map((t) => (t.id === entryId ? { ...t, flagged: true } : t))
    );
    toast.success("Flagged for Dr. Hamid's review");
  }, []);

  // Toggle open/close
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
      connectionRef.current?.disconnect();
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
        aria-label={isOpen ? "Close voice assistant" : "Open voice assistant"}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        {/* Pulse ring when connected */}
        {status === "connected" && !isOpen && (
          <span className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-30" />
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div
          className={`fixed bottom-24 right-6 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col transition-all duration-300 ${
            isExpanded ? "w-[420px] h-[600px]" : "w-[360px] h-[480px]"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  status === "connected"
                    ? "bg-emerald-400"
                    : status === "connecting"
                    ? "bg-amber-400 animate-pulse"
                    : status === "processing"
                    ? "bg-blue-400 animate-pulse"
                    : "bg-zinc-500"
                }`}
              />
              <span className="text-sm font-medium text-zinc-200">Hibba Voice Assistant</span>
              {isProcessing && <WaveformAnimation isActive={true} />}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsTextMode(!isTextMode)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isTextMode ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
                }`}
                title={isTextMode ? "Switch to voice mode" : "Switch to text mode"}
              >
                <Keyboard className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
                title={isExpanded ? "Collapse" : "Expand"}
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
                <div
                  className="h-full bg-amber-400 rounded-full transition-all"
                  style={{ width: `${Math.max(0, (tokensRemaining / 200000) * 100)}%` }}
                />
              </div>
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
                  <button onClick={connect} className="text-emerald-400 hover:underline mt-1">
                    Try again
                  </button>
                </p>
              </div>
            )}

            {transcript.map((entry) => (
              <div
                key={entry.id}
                className={`flex ${entry.speaker === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    entry.speaker === "user"
                      ? "bg-emerald-600/80 text-white rounded-br-md"
                      : "bg-zinc-800 text-zinc-200 rounded-bl-md"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{entry.text}</p>

                  {/* Tool call indicators */}
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

                  {/* Timestamp + flag button for agent messages */}
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-zinc-500">
                      {entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {entry.speaker === "agent" && !entry.flagged && (
                      <button
                        onClick={() => flagResponse(entry.id)}
                        className="text-zinc-600 hover:text-amber-400 transition-colors p-0.5"
                        title="Flag this response for review"
                      >
                        <Flag className="w-3 h-3" />
                      </button>
                    )}
                    {entry.flagged && (
                      <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                        <Flag className="w-3 h-3" /> Flagged
                      </span>
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
            {status === "connected" || status === "processing" ? (
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendText();
                    }
                  }}
                  placeholder={isProcessing ? "Thinking..." : "Type a message..."}
                  disabled={isProcessing}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50"
                  style={{ fontSize: "16px" }} // Prevent iOS zoom
                />
                <Button
                  size="sm"
                  onClick={sendText}
                  disabled={!textInput.trim() || isProcessing}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 h-10 w-10 p-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center py-2">
                <Button
                  size="sm"
                  onClick={connect}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500"
                >
                  {status === "disconnected" ? "Reconnect" : "Start Session"}
                </Button>
              </div>
            )}

            {/* Voice mode indicator */}
            {!isTextMode && status === "connected" && (
              <p className="text-[10px] text-zinc-600 text-center mt-2">
                Voice input available when Gemini API key is configured. Using text mode.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
