import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { MessageSquare, Mic, Bot, Wrench, Clock, ChevronRight, ArrowLeft, User, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import VoiceAnalytics from "@/components/VoiceAnalytics";

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
                <div className={`rounded-lg px-3 py-2 text-sm ${
                  item.role === "user" ? "bg-blue-500/10 border border-blue-500/20" :
                  item.role === "assistant" ? "bg-emerald-500/10 border border-emerald-500/20" :
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
