import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, ChevronLeft, ChevronRight, RotateCcw, User, Calendar } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trpcAny = trpc as any;

const TABLE_LABELS: Record<string, string> = {
  trustees: "Trustees & Staff",
  donors: "Donors",
  staff_profiles: "Staff Profiles",
};

const TABLE_COLORS: Record<string, string> = {
  trustees: "#635BFF",
  donors: "#00FFC2",
  staff_profiles: "#F59E0B",
};

const PAGE_SIZE = 25;

export default function MergeHistoryPage() {
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const { data, isLoading, refetch } = trpcAny.scanMerge.listHistory.useQuery({
    tableName: tableFilter === "all" ? undefined : tableFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }) as {
    data: {
      rows: Array<{
        id: number;
        tableName: string;
        recordId: number;
        mergedByName: string | null;
        mergedAt: Date | string;
        revertedAt: Date | string | null;
      }>;
      total: number;
    } | undefined;
    isLoading: boolean;
    refetch: () => void;
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const T = {
    navy: "#0A192F",
    card: "rgba(13,34,64,0.85)",
    border: "rgba(255,255,255,0.08)",
    white: "#FFFFFF",
    muted: "rgba(255,255,255,0.45)",
  };

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`, padding: "24px 20px", fontFamily: "'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12, animation: "fadeUp 0.4s ease both" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(99,91,255,0.15)", border: "1px solid rgba(99,91,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <History size={18} color="#635BFF" />
              </div>
              <h1 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, color: T.white, margin: 0, letterSpacing: "-0.03em" }}>
                Scan Merge <span style={{ color: "#635BFF" }}>History</span>
              </h1>
            </div>
            <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>Audit log of all AI-assisted scan imports — {total} total entries</p>
          </div>

          {/* Filter */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Select value={tableFilter} onValueChange={(v) => { setTableFilter(v); setPage(0); }}>
              <SelectTrigger style={{ width: 180, background: T.card, border: `1px solid ${T.border}`, color: T.white, borderRadius: 10, fontSize: 13 }}>
                <SelectValue placeholder="All tables" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tables</SelectItem>
                <SelectItem value="trustees">Trustees & Staff</SelectItem>
                <SelectItem value="donors">Donors</SelectItem>
                <SelectItem value="staff_profiles">Staff Profiles</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden", animation: "fadeUp 0.5s ease 60ms both" }}>
          {isLoading ? (
            <div style={{ padding: 48, textAlign: "center", color: T.muted, fontSize: 14 }}>Loading history…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <History size={32} color="rgba(255,255,255,0.2)" style={{ marginBottom: 12 }} />
              <p style={{ color: T.muted, fontSize: 14, margin: 0 }}>No scan merge records found.</p>
              <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, margin: "4px 0 0" }}>Scan imports will appear here after they are performed.</p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {["#", "Table", "Record ID", "Merged By", "Merged At", "Status"].map((h) => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isReverted = !!row.revertedAt;
                  const mergedAt = new Date(row.mergedAt);
                  const ageMs = Date.now() - mergedAt.getTime();
                  const withinWindow = ageMs <= 10 * 60 * 1000 && !isReverted;
                  const color = TABLE_COLORS[row.tableName] ?? "#888";
                  return (
                    <tr key={row.id} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: T.muted, fontFamily: "monospace" }}>{row.id}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                          {TABLE_LABELS[row.tableName] ?? row.tableName}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: T.white, fontFamily: "monospace" }}>#{row.recordId}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.white }}>
                          <User size={12} color={T.muted} />
                          {row.mergedByName ?? "Unknown"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted }}>
                          <Calendar size={12} />
                          {mergedAt.toLocaleString()}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {isReverted ? (
                          <Badge variant="outline" style={{ fontSize: 11, borderColor: "rgba(255,255,255,0.2)", color: T.muted }}>
                            <RotateCcw size={10} style={{ marginRight: 4 }} />
                            Reverted {new Date(row.revertedAt!).toLocaleString()}
                          </Badge>
                        ) : withinWindow ? (
                          <Badge style={{ fontSize: 11, background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)" }}>
                            Undo available
                          </Badge>
                        ) : (
                          <Badge style={{ fontSize: 11, background: "rgba(0,255,194,0.1)", color: "#00FFC2", border: "1px solid rgba(0,255,194,0.2)" }}>
                            Applied
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, animation: "fadeUp 0.5s ease 120ms both" }}>
            <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{ borderColor: T.border, color: T.white, background: "transparent" }}
              >
                <ChevronLeft size={14} />
              </Button>
              <span style={{ fontSize: 12, color: T.muted, padding: "4px 8px" }}>
                Page {page + 1} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{ borderColor: T.border, color: T.white, background: "transparent" }}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
