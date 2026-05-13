import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
import { useVoiceContext } from "@/contexts/VoiceContext";
  Shield, Search, ChevronLeft, ChevronRight, RefreshCw,
  Clock, User, Database, Activity, AlertCircle,
} from "lucide-react";

const T = {
  navy: "#0A192F", purple: "#635BFF", mint: "#00FFC2",
  white: "#FFFFFF", muted: "rgba(255,255,255,0.5)",
  border: "rgba(255,255,255,0.08)", glass: "rgba(255,255,255,0.04)",
  card: "rgba(13,34,64,0.8)",
};

const ACTION_COLORS: Record<string, string> = {
  create: "#00FFC2", update: "#635BFF", delete: "#f87171",
  approve: "#34d399", reject: "#f59e0b", login: "#818cf8",
  export: "#a78bfa", link: "#60a5fa",
};

function actionBadgeColor(action: string) {
  return ACTION_COLORS[action.toLowerCase()] ?? "#94a3b8";
}

export default function AuditTrailPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const PAGE_SIZE = 50;

  const { setEntityContext } = useVoiceContext();
  useEffect(() => {
    setEntityContext("Viewing Audit Trail — full history of all system actions and changes");
    return () => setEntityContext(null);
  }, [setEntityContext]);

  const { data: statsData } = trpc.auditTrail.stats.useQuery();
  const { data: entityTypes } = trpc.auditTrail.getEntityTypes.useQuery();
  const { data: actionTypes } = trpc.auditTrail.getActionTypes.useQuery();
  const { data, isLoading, refetch } = trpc.auditTrail.list.useQuery({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    entity: entityFilter !== "all" ? entityFilter : undefined,
    action: actionFilter !== "all" ? actionFilter : undefined,
  }, { refetchInterval: 30_000 });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  const stats = useMemo(() => [
    { label: "Total Entries", value: statsData?.total?.toLocaleString() ?? "—", icon: Database, color: T.mint },
    { label: "Unique Users", value: statsData?.uniqueUsers?.toLocaleString() ?? "—", icon: User, color: T.purple },
    { label: "Today", value: statsData?.todayCount?.toLocaleString() ?? "—", icon: Activity, color: "#f59e0b" },
    { label: "Top Entity", value: statsData?.topEntity ?? "—", icon: AlertCircle, color: "#a78bfa" },
  ], [statsData]);

  return (
    <div style={{ minHeight: "100vh", background: T.navy, padding: "24px 28px", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: `${T.purple}22`, border: `1px solid ${T.purple}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={20} style={{ color: T.purple }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: T.white, margin: 0, letterSpacing: "-0.02em" }}>Audit Trail</h1>
            <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>Full history of all system actions</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}
          style={{ borderColor: "rgba(255,255,255,0.15)", color: T.muted, background: "transparent" }}>
          <RefreshCw size={13} className="mr-1" /> Refresh
        </Button>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}18`, border: `1px solid ${s.color}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 800, color: T.white, margin: 0 }}>{s.value}</p>
              <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.muted }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by user name…"
            style={{ width: "100%", paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8, background: T.glass, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <Select value={entityFilter} onValueChange={v => { setEntityFilter(v); setPage(1); }}>
          <SelectTrigger style={{ width: 160, background: T.glass, border: `1px solid ${T.border}`, color: T.white, fontSize: 13 }}>
            <SelectValue placeholder="All entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {(entityTypes ?? []).map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={v => { setActionFilter(v); setPage(1); }}>
          <SelectTrigger style={{ width: 160, background: T.glass, border: `1px solid ${T.border}`, color: T.white, fontSize: 13 }}>
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {(actionTypes ?? []).map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {["Time", "User", "Action", "Entity", "ID", "Details"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 13 }}>Loading…</td></tr>
              ) : !data?.rows.length ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 13 }}>No audit log entries found.</td></tr>
              ) : data.rows.map((row: any) => (
                <tr key={row.id} style={{ borderBottom: `1px solid ${T.border}`, transition: "background 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "10px 16px", fontSize: 12, color: T.muted, whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Clock size={11} />
                      {new Date(row.createdAt).toLocaleString()}
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 13, color: T.white }}>
                    {row.userName ?? <span style={{ color: T.muted, fontStyle: "italic" }}>System</span>}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: `${actionBadgeColor(row.action)}18`, color: actionBadgeColor(row.action), border: `1px solid ${actionBadgeColor(row.action)}33`, textTransform: "capitalize" }}>
                      {row.action}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 12, color: "#a78bfa", fontWeight: 600 }}>{row.entity}</td>
                  <td style={{ padding: "10px 16px", fontSize: 12, color: T.muted }}>{row.entityId ?? "—"}</td>
                  <td style={{ padding: "10px 16px", fontSize: 11, color: T.muted, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.meta ? JSON.stringify(row.meta).slice(0, 80) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > PAGE_SIZE && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, color: T.muted }}>
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total.toLocaleString()}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.glass, color: page <= 1 ? T.muted : T.white, cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 12 }}>
                <ChevronLeft size={13} />
              </button>
              <span style={{ padding: "5px 12px", fontSize: 12, color: T.muted }}>Page {page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.glass, color: page >= totalPages ? T.muted : T.white, cursor: page >= totalPages ? "not-allowed" : "pointer", fontSize: 12 }}>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
