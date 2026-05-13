import { useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Activity, Database, Server, Clock, CheckCircle2, XCircle,
  RefreshCw, Zap, Table2, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceContext } from "@/contexts/VoiceContext";

const T = {
  navy: "#0A192F", purple: "#635BFF", mint: "#00FFC2",
  white: "#FFFFFF", muted: "rgba(255,255,255,0.5)",
  border: "rgba(255,255,255,0.08)", glass: "rgba(255,255,255,0.04)",
  card: "rgba(13,34,64,0.8)",
};

export default function SystemHealthPage() {
  const { setEntityContext } = useVoiceContext();
  useEffect(() => {
    setEntityContext("Viewing System Health — server status, API health, database and performance metrics");
    return () => setEntityContext(null);
  }, [setEntityContext]);

  const { data, isLoading, refetch, dataUpdatedAt } = trpc.systemHealth.snapshot.useQuery(
    undefined, { refetchInterval: 30_000 }
  );
  const { data: pingData, refetch: rePing } = trpc.systemHealth.ping.useQuery(
    undefined, { refetchInterval: 15_000 }
  );

  const tableRows = useMemo(() => {
    if (!data?.tables) return [];
    return Object.entries(data.tables).map(([name, count]) => ({ name, count: count as number }));
  }, [data]);

  const lastChecked = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—";

  return (
    <div style={{ minHeight: "100vh", background: T.navy, padding: "24px 28px", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: `${T.mint}22`, border: `1px solid ${T.mint}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Activity size={20} style={{ color: T.mint }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: T.white, margin: 0, letterSpacing: "-0.02em" }}>System Health</h1>
            <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>Live status · refreshes every 30s · last checked {lastChecked}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => { refetch(); rePing(); }}
          style={{ borderColor: "rgba(255,255,255,0.15)", color: T.muted, background: "transparent" }}>
          <RefreshCw size={13} className="mr-1" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 60, color: T.muted }}>Loading health data…</div>
      ) : (
        <>
          {/* Top status cards — 5 cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 24 }}>
            {/* DB status */}
            <div style={{ background: T.card, border: `1px solid ${data?.dbOk ? T.border : '#f87171'}`, borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <Database size={16} style={{ color: data?.dbOk ? T.mint : "#f87171" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.white }}>Database</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {data?.dbOk ? <CheckCircle2 size={14} style={{ color: T.mint }} /> : <XCircle size={14} style={{ color: "#f87171" }} />}
                <span style={{ fontSize: 12, color: data?.dbOk ? T.mint : "#f87171", fontWeight: 600 }}>{data?.dbOk ? "Connected" : "Disconnected"}</span>
              </div>
              {pingData && <p style={{ fontSize: 11, color: T.muted, margin: "6px 0 0" }}>Latency: {pingData.latencyMs}ms</p>}
            </div>

            {/* Server uptime */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <Server size={16} style={{ color: T.purple }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.white }}>Uptime</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={14} style={{ color: T.mint }} />
                <span style={{ fontSize: 16, fontWeight: 800, color: T.mint }}>{data?.uptimeStr ?? "—"}</span>
              </div>
              <p style={{ fontSize: 11, color: T.muted, margin: "6px 0 0" }}>Node {data?.nodeVersion ?? "—"}</p>
            </div>

            {/* API Response Time */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <Activity size={16} style={{ color: data?.apiResponseMs != null && data.apiResponseMs < 100 ? T.mint : data?.apiResponseMs != null && data.apiResponseMs < 300 ? '#f59e0b' : '#f87171' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.white }}>API Response</span>
              </div>
              <span style={{ fontSize: 22, fontWeight: 800, color: data?.apiResponseMs != null && data.apiResponseMs < 100 ? T.mint : data?.apiResponseMs != null && data.apiResponseMs < 300 ? '#f59e0b' : '#f87171' }}>
                {data?.apiResponseMs != null ? `${data.apiResponseMs}ms` : "—"}
              </span>
              <p style={{ fontSize: 11, color: T.muted, margin: "6px 0 0" }}>{data?.apiResponseMs != null ? (data.apiResponseMs < 100 ? "Excellent" : data.apiResponseMs < 300 ? "Good" : "Slow") : "Measuring…"}</p>
            </div>

            {/* Memory */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <Zap size={16} style={{ color: "#f59e0b" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.white }}>Memory</span>
              </div>
              <span style={{ fontSize: 22, fontWeight: 800, color: "#f59e0b" }}>{data?.memoryMB ?? "—"} MB</span>
              <p style={{ fontSize: 11, color: T.muted, margin: "6px 0 0" }}>Heap used</p>
            </div>

            {/* Gmail sync */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <RefreshCw size={16} style={{ color: "#60a5fa" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.white }}>Gmail Sync</span>
              </div>
              {data?.gmailLastSyncedAt ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <CheckCircle2 size={14} style={{ color: T.mint }} />
                    <span style={{ fontSize: 12, color: T.mint, fontWeight: 600 }}>Synced</span>
                  </div>
                  <p style={{ fontSize: 11, color: T.muted, margin: "6px 0 0" }}>{new Date(data.gmailLastSyncedAt).toLocaleString()}</p>
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Clock size={14} style={{ color: T.muted }} />
                  <span style={{ fontSize: 12, color: T.muted }}>Not yet synced</span>
                </div>
              )}
            </div>
          </div>

          {/* Scheduled jobs */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "18px 20px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Calendar size={15} style={{ color: T.purple }} />
              <h2 style={{ fontSize: 14, fontWeight: 700, color: T.white, margin: 0 }}>Scheduled Jobs</h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
              {(data?.scheduledJobs ?? []).map((job: any) => (
                <div key={job.name} style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.mint, flexShrink: 0, boxShadow: `0 0 6px ${T.mint}` }} />
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: T.white, margin: 0 }}>{job.name}</p>
                    <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>{job.schedule}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Table row counts */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
              <Table2 size={15} style={{ color: T.mint }} />
              <h2 style={{ fontSize: 14, fontWeight: 700, color: T.white, margin: 0 }}>Database Tables</h2>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    <th style={{ padding: "10px 20px", textAlign: "left", fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Table</th>
                    <th style={{ padding: "10px 20px", textAlign: "right", fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map(row => (
                    <tr key={row.name} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: "10px 20px", fontSize: 13, color: T.white, fontFamily: "monospace" }}>{row.name}</td>
                      <td style={{ padding: "10px 20px", fontSize: 13, color: T.mint, fontWeight: 700, textAlign: "right" }}>
                        {row.count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
