import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { MessageSquare, Mic, Bot, Wrench, Clock, ChevronRight, ArrowLeft, User, BarChart3, Play, Pause, Square, Volume2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import VoiceAnalytics from "@/components/VoiceAnalytics";
import { useVoiceContext } from "@/contexts/VoiceContext";

function formatDate(d: string | Date) {
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function formatDuration(start: string | Date, end?: string | Date | null) {
  if (!end) return "In progress";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function SessionDetail({ sessionId, onBack }: { sessionId: number; onBack: () => void }) {
  const { data, isLoading } = trpc.voiceAgent.getSessionTranscript.useQuery({ sessionId });
  // TTS replay state
  const [isReplaying, setIsReplaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>("");
  // Load available voices (browser may load them async)
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);
        // Default to a UK English or female voice
        const preferred = voices.find(v =>
          v.lang.startsWith("en-GB") ||
          v.name.includes("Samantha") || v.name.includes("Karen") ||
          v.name.toLowerCase().includes("female")
        );
        if (preferred && !selectedVoiceName) setSelectedVoiceName(preferred.name);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);
  const utteranceRef = React.useRef<SpeechSynthesisUtterance | null>(null);
  const replayQueueRef = React.useRef<string[]>([]);
  const replayIdxRef = React.useRef(0);

  const stopReplay = React.useCallback(() => {
    window.speechSynthesis.cancel();
    setIsReplaying(false);
    setIsPaused(false);
    setReplayIndex(null);
    replayQueueRef.current = [];
    replayIdxRef.current = 0;
  }, []);

  const speakNext = React.useCallback((queue: string[], idx: number, speed: number) => {
    if (idx >= queue.length) {
      setIsReplaying(false);
      setIsPaused(false);
      setReplayIndex(null);
      return;
    }
    setReplayIndex(idx);
    const utterance = new SpeechSynthesisUtterance(queue[idx]);
    utterance.rate = speed;
    utterance.pitch = 1.05;
    // Use selected voice or fall back to auto-detect
    const voices = window.speechSynthesis.getVoices();
    const chosenVoice = selectedVoiceName
      ? voices.find(v => v.name === selectedVoiceName)
      : voices.find(v => v.name.toLowerCase().includes("female") || v.name.includes("Samantha") || v.name.includes("Karen") || v.name.includes("Moira") || v.name.includes("Victoria") || v.name.includes("Fiona"));
    if (chosenVoice) utterance.voice = chosenVoice;
    utterance.onend = () => {
      replayIdxRef.current = idx + 1;
      speakNext(queue, idx + 1, speed);
    };
    utterance.onerror = () => {
      replayIdxRef.current = idx + 1;
      speakNext(queue, idx + 1, speed);
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  const startReplay = React.useCallback((assistantMessages: string[]) => {
    window.speechSynthesis.cancel();
    replayQueueRef.current = assistantMessages;
    replayIdxRef.current = 0;
    setIsReplaying(true);
    setIsPaused(false);
    speakNext(assistantMessages, 0, replaySpeed);
  }, [replaySpeed, speakNext, selectedVoiceName]);

  const togglePause = React.useCallback(() => {
    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    } else {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, [isPaused]);

  // Clean up on unmount
  React.useEffect(() => {
    return () => { window.speechSynthesis.cancel(); };
  }, []);
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back to sessions
        </Button>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-zinc-800 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }
  if (!data) return null;
  const { session, transcripts, toolCalls } = data;
  type TimelineItem =
    | { type: "message"; role: string; content: string; time: Date }
    | { type: "tool"; name: string; params: string; result: string; success: boolean; time: Date; latencyMs?: number | null };

  const timeline: TimelineItem[] = [
    ...transcripts.map((t) => ({
      type: "message" as const,
      role: t.role,
      content: t.content,
      time: new Date(t.createdAt),
    })),
    ...toolCalls.map((tc) => ({
      type: "tool" as const,
      name: tc.toolName,
      params: tc.params || "{}",
      result: tc.resultSummary || "",
      success: tc.success,
      time: new Date(tc.createdAt),
      latencyMs: tc.latencyMs,
    })),
  ].sort((a, b) => a.time.getTime() - b.time.getTime());

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">
            Session #{session.id}
          </h2>
          <p className="text-xs text-zinc-500">
            {formatDate(session.startedAt)} · {formatDuration(session.startedAt, session.endedAt)} · {session.screenContext || "No context"}
          </p>
        </div>
        <Badge variant={session.status === "completed" ? "default" : session.status === "active" ? "secondary" : "destructive"} className="ml-auto">
          {session.status}
        </Badge>
      </div>

      {/* TTS Replay controls */}
      {(() => {
        const assistantMessages = timeline
          .filter(item => item.type === "message" && (item as any).role === "assistant")
          .map(item => (item as any).content as string);
        if (assistantMessages.length === 0) return null;
        return (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
            <Volume2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="text-xs text-emerald-300 font-medium flex-1">
              {isReplaying ? (isPaused ? "Paused" : `Speaking message ${(replayIndex ?? 0) + 1} of ${assistantMessages.length}`) : "Replay Hibba's responses"}
            </span>
            <select
              value={replaySpeed}
              onChange={e => setReplaySpeed(Number(e.target.value))}
              disabled={isReplaying}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-300"
            >
              <option value={0.8}>0.8×</option>
              <option value={1}>1×</option>
              <option value={1.25}>1.25×</option>
              <option value={1.5}>1.5×</option>
            </select>
            {availableVoices.length > 0 && (
              <select
                value={selectedVoiceName}
                onChange={e => setSelectedVoiceName(e.target.value)}
                disabled={isReplaying}
                title="Select TTS voice"
                className="text-xs bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-300 max-w-[130px] truncate"
              >
                {availableVoices.filter(v => v.lang.startsWith("en")).map(v => (
                  <option key={v.name} value={v.name}>{v.name.replace(/Microsoft |Google |Apple /g, "")}</option>
                ))}
              </select>
            )}
            {!isReplaying ? (
              <Button size="sm" variant="ghost" onClick={() => startReplay(assistantMessages)} className="h-7 px-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
                <Play className="w-3.5 h-3.5 mr-1" /> Play
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={togglePause} className="h-7 px-2 text-zinc-300 hover:bg-zinc-700">
                  {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={stopReplay} className="h-7 px-2 text-red-400 hover:bg-red-500/10">
                  <Square className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        );
      })()}

      <div className="space-y-2">
        {timeline.length === 0 && (
          <p className="text-sm text-zinc-500 text-center py-8">No transcript recorded for this session.</p>
        )}
        {timeline.map((item, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex-shrink-0 mt-1">
              {item.type === "message" && item.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-blue-400" />
                </div>
              )}
              {item.type === "message" && item.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                </div>
              )}
              {item.type === "message" && item.role === "system" && (
                <div className="w-7 h-7 rounded-full bg-zinc-600/20 flex items-center justify-center">
                  <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                </div>
              )}
              {item.type === "tool" && (
                <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Wrench className="w-3.5 h-3.5 text-amber-400" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {item.type === "message" ? (
                <div className={`rounded-lg px-3 py-2 text-sm transition-all ${
                  item.role === "user" ? "bg-blue-500/10 border border-blue-500/20" :
                  item.role === "assistant" ? (
                    isReplaying && replayIndex !== null && (() => {
                      const assistantMsgs = timeline.filter(t => t.type === "message" && (t as any).role === "assistant");
                      const myIdx = assistantMsgs.indexOf(item as any);
                      return myIdx === replayIndex;
                    })()
                    ? "bg-emerald-500/30 border border-emerald-400/60 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-400/40"
                    : "bg-emerald-500/10 border border-emerald-500/20"
                  ) :
                  "bg-zinc-800 border border-zinc-700"
                }`}>
                  <p className="text-xs font-medium mb-0.5 capitalize text-zinc-400">{item.role}</p>
                  <p className="text-zinc-200 whitespace-pre-wrap">{item.content}</p>
                </div>
              ) : (
                <div className={`rounded-lg px-3 py-2 text-sm border ${item.success ? "bg-amber-500/5 border-amber-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-medium text-amber-300">{item.name}</span>
                    {item.latencyMs && <span className="text-xs text-zinc-500">{item.latencyMs}ms</span>}
                    {!item.success && <Badge variant="destructive" className="text-[10px] px-1 py-0">Failed</Badge>}
                  </div>
                  {item.result && (
                    <p className="text-xs text-zinc-400 truncate max-w-full">{item.result.substring(0, 200)}{item.result.length > 200 ? "..." : ""}</p>
                  )}
                </div>
              )}
              <p className="text-[10px] text-zinc-600 mt-0.5 ml-1">
                {item.time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function VoiceHistoryPage() {
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [tab, setTab] = useState<"sessions" | "analytics">("sessions");
  const { setEntityContext } = useVoiceContext();
  useEffect(() => {
    setEntityContext("Viewing Voice History — Hibba voice session logs, transcripts and analytics");
    return () => setEntityContext(null);
  }, [setEntityContext]);

  const { data: sessions, isLoading } = trpc.voiceAgent.listSessions.useQuery({ limit: 50 });

  if (selectedSession !== null) {
    return (
      <div className="container max-w-3xl py-6">
        <SessionDetail sessionId={selectedSession} onBack={() => setSelectedSession(null)} />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <Mic className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Voice History</h1>
          <p className="text-sm text-zinc-400">Review past conversations with Hibba and audit tool calls</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-1 w-fit">
        <Button
          variant={tab === "sessions" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTab("sessions")}
          className="gap-1.5 text-xs"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Sessions
        </Button>
        <Button
          variant={tab === "analytics" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTab("analytics")}
          className="gap-1.5 text-xs"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Analytics
        </Button>
      </div>

      {tab === "analytics" ? (
        <VoiceAnalytics />
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-zinc-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !sessions || sessions.length === 0 ? (
        <Card className="border-zinc-700 bg-zinc-900/50">
          <CardContent className="py-12 text-center">
            <Mic className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">No voice sessions yet.</p>
            <p className="text-sm text-zinc-500 mt-1">Start a conversation with Hibba to see history here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => setSelectedSession(session.id)}
              className="w-full text-left rounded-lg border border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800/80 transition-colors p-4 flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-200">
                    Session #{session.id}
                  </span>
                  <Badge variant={session.status === "completed" ? "default" : session.status === "active" ? "secondary" : "destructive"} className="text-[10px]">
                    {session.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(session.startedAt)}
                  </span>
                  <span>{formatDuration(session.startedAt, session.endedAt)}</span>
                  {session.screenContext && <span className="truncate max-w-[150px]">{session.screenContext}</span>}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
