import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  BarChart3, Activity, Zap, Coins, Clock, TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <Card className="border-zinc-700 bg-zinc-900/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-zinc-400">{label}</p>
            <p className="text-xl font-bold text-zinc-100">{value}</p>
            {sub && <p className="text-[10px] text-zinc-500">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BarChartSimple({ data, labelKey, valueKey, color, maxBars = 30 }: {
  data: any[]; labelKey: string; valueKey: string; color: string; maxBars?: number;
}) {
  const sliced = data.slice(-maxBars);
  const max = Math.max(...sliced.map((d) => Number(d[valueKey]) || 0), 1);
  if (sliced.length === 0) {
    return <p className="text-sm text-zinc-500 text-center py-8">No data for this period.</p>;
  }
  return (
    <div className="flex items-end gap-[2px] h-32 mt-2">
      {sliced.map((d, i) => {
        const val = Number(d[valueKey]) || 0;
        const pct = (val / max) * 100;
        const label = String(d[labelKey] || "").slice(5); // MM-DD
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className={`w-full rounded-t ${color} transition-all hover:opacity-80`}
              style={{ height: `${Math.max(pct, 2)}%`, minHeight: "2px" }}
            />
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 hidden group-hover:block bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[10px] text-zinc-200 whitespace-nowrap z-10">
              {label}: {val}
            </div>
            {i % Math.ceil(sliced.length / 8) === 0 && (
              <span className="text-[9px] text-zinc-600 -rotate-45 origin-top-left mt-1">{label}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HorizontalBarChart({ data, nameKey, valueKey, color }: {
  data: any[]; nameKey: string; valueKey: string; color: string;
}) {
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  if (data.length === 0) {
    return <p className="text-sm text-zinc-500 text-center py-8">No tool calls recorded.</p>;
  }
  return (
    <div className="space-y-2 mt-2">
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0;
        const pct = (val / max) * 100;
        const name = String(d[nameKey] || "").replace(/_/g, " ");
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 w-32 truncate text-right font-mono">{name}</span>
            <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
              <div
                className={`h-full ${color} rounded transition-all`}
                style={{ width: `${Math.max(pct, 1)}%` }}
              />
            </div>
            <span className="text-xs text-zinc-300 w-10 text-right">{val}</span>
            {d.successRate !== undefined && (
              <Badge variant={Number(d.successRate) >= 90 ? "default" : "destructive"} className="text-[10px] px-1">
                {d.successRate}%
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function VoiceAnalytics() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = trpc.voiceAgent.getAnalytics.useQuery({ days });

  const formatDuration = (secs: number) => {
    if (!secs || secs <= 0) return "N/A";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const formatCost = (pence: number) => {
    if (!pence) return "£0.00";
    return `£${(pence / 100).toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-zinc-800 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-48 bg-zinc-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  const { summary, dailySessions, topTools, dailyCost } = data;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        {[7, 14, 30, 60, 90].map((d) => (
          <Button
            key={d}
            variant={days === d ? "default" : "outline"}
            size="sm"
            onClick={() => setDays(d)}
            className="text-xs"
          >
            {d}d
          </Button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={Activity} label="Sessions" value={summary.totalSessions} color="bg-emerald-500/20 text-emerald-400" />
        <StatCard icon={Clock} label="Avg Duration" value={formatDuration(summary.avgDurationSecs)} color="bg-blue-500/20 text-blue-400" />
        <StatCard icon={Zap} label="Tool Calls" value={summary.totalToolCalls} color="bg-amber-500/20 text-amber-400" />
        <StatCard icon={TrendingUp} label="Tokens Used" value={summary.totalTokens.toLocaleString()} color="bg-purple-500/20 text-purple-400" />
        <StatCard icon={Coins} label="Est. Cost" value={formatCost(summary.totalCostPence)} color="bg-rose-500/20 text-rose-400" />
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Daily sessions chart */}
        <Card className="border-zinc-700 bg-zinc-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              Daily Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartSimple data={dailySessions} labelKey="date" valueKey="count" color="bg-emerald-500" />
          </CardContent>
        </Card>

        {/* Daily cost chart */}
        <Card className="border-zinc-700 bg-zinc-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
              <Coins className="w-4 h-4 text-rose-400" />
              Daily Token Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartSimple data={dailyCost} labelKey="date" valueKey="tokens" color="bg-rose-500" />
          </CardContent>
        </Card>
      </div>

      {/* Top tools */}
      <Card className="border-zinc-700 bg-zinc-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Most Used Tools (Top 15)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <HorizontalBarChart data={topTools} nameKey="toolName" valueKey="count" color="bg-amber-500" />
        </CardContent>
      </Card>
    </div>
  );
}
