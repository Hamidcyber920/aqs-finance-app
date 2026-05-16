import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { History, Download, ChevronLeft, ChevronRight, Eye, RotateCcw } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trpcAny = trpc as any;

const FIELD_LABELS: Record<string, string> = {
  fullName: "Full Name",
  name: "Name",
  email: "Email",
  phone: "Phone",
  role: "Role",
  dateOfBirth: "Date of Birth",
  addressLine1: "Address Line 1",
  addressLine2: "Address Line 2",
  city: "City",
  postcode: "Postcode",
  nokName: "NOK Name",
  nokPhone: "NOK Phone",
  nokEmail: "NOK Email",
  nokRelationship: "NOK Relationship",
  notes: "Notes",
  contractType: "Contract Type",
  niNumber: "NI Number",
  taxCode: "Tax Code",
  giftAid: "Gift Aid",
  addressLine3: "Address Line 3",
  county: "County",
  country: "Country",
  donorboxId: "Donorbox ID",
  isActive: "Active",
};

const TABLE_LABELS: Record<string, string> = {
  trustees: "Trustees & Staff",
  donors: "Donors",
  staff_profiles: "Staff Profiles",
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

type HistoryRow = {
  id: number;
  tableName: string;
  recordId: number;
  mergedByName: string | null;
  mergedAt: Date | string;
  revertedAt: Date | string | null;
  snapshotJson: string;
};

function DiffPanel({ row, onClose }: { row: HistoryRow; onClose: () => void }) {
  const snapshot = useMemo(() => {
    try { return JSON.parse(row.snapshotJson) as Record<string, unknown>; }
    catch { return null; }
  }, [row.snapshotJson]);

  const NON_DISPLAY = new Set(["id", "createdAt", "updatedAt", "userId"]);
  const fields = snapshot
    ? Object.entries(snapshot).filter(([k]) => !NON_DISPLAY.has(k) && snapshot[k] !== null && snapshot[k] !== undefined && snapshot[k] !== "")
    : [];

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-muted-foreground" />
            Snapshot — {TABLE_LABELS[row.tableName] ?? row.tableName} #{row.recordId}
          </SheetTitle>
          <SheetDescription>
            Pre-merge record state captured at{" "}
            {new Date(row.mergedAt).toLocaleString()}{" "}
            by {row.mergedByName ?? "unknown"}.
            {row.revertedAt && (
              <span className="ml-1 text-green-600 dark:text-green-400 font-medium">
                Reverted at {new Date(row.revertedAt).toLocaleString()}.
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {snapshot ? (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="p-2.5 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground w-1/3">Field</th>
                  <th className="p-2.5 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Value before scan</th>
                </tr>
              </thead>
              <tbody>
                {fields.map(([field, value], i) => (
                  <tr key={field} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                    <td className="p-2.5 font-medium text-muted-foreground">{FIELD_LABELS[field] ?? field}</td>
                    <td className="p-2.5 font-mono text-xs">{formatValue(value)}</td>
                  </tr>
                ))}
                {fields.length === 0 && (
                  <tr>
                    <td colSpan={2} className="p-4 text-center text-muted-foreground text-sm">No field data in snapshot.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Could not parse snapshot data.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function MergeHistoryPage() {
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selectedRow, setSelectedRow] = useState<HistoryRow | null>(null);
  const LIMIT = 25;

  useEffect(() => {
  }, [tableFilter]);

  const { data, isLoading } = trpcAny.scanMerge.listHistory.useQuery({
    tableName: tableFilter === "all" ? undefined : tableFilter,
    limit: LIMIT,
    offset: page * LIMIT,
  }) as { data: { rows: HistoryRow[]; total: number } | undefined; isLoading: boolean };

  const rows: HistoryRow[] = data?.rows ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  // ─── CSV Export ────────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    if (rows.length === 0) return;
    const headers = ["ID", "Table", "Record ID", "Merged By", "Merged At", "Reverted At", "Status"];
    const csvRows = rows.map((r) => [
      r.id,
      TABLE_LABELS[r.tableName] ?? r.tableName,
      r.recordId,
      r.mergedByName ?? "",
      new Date(r.mergedAt).toLocaleString(),
      r.revertedAt ? new Date(r.revertedAt).toLocaleString() : "",
      r.revertedAt ? "Reverted" : "Applied",
    ]);
    const csvContent = [headers, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `merge-history-${tableFilter}-${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="w-6 h-6 text-primary" />
            Merge History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Audit log of all AI scan imports — {total} record{total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={tableFilter} onValueChange={(v) => { setTableFilter(v); setPage(0); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All tables" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tables</SelectItem>
              <SelectItem value="trustees">Trustees & Staff</SelectItem>
              <SelectItem value="donors">Donors</SelectItem>
              <SelectItem value="staff_profiles">Staff Profiles</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExportCsv}
            disabled={rows.length === 0}
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="p-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">#</th>
              <th className="p-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Table</th>
              <th className="p-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Record</th>
              <th className="p-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Merged By</th>
              <th className="p-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Merged At</th>
              <th className="p-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Status</th>
              <th className="p-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">Loading…</td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No scan merge records found{tableFilter !== "all" ? ` for ${TABLE_LABELS[tableFilter] ?? tableFilter}` : ""}.
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr
                key={row.id}
                className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
              >
                <td className="p-3 text-muted-foreground font-mono text-xs">{row.id}</td>
                <td className="p-3">
                  <Badge variant="outline" className="text-xs font-normal">
                    {TABLE_LABELS[row.tableName] ?? row.tableName}
                  </Badge>
                </td>
                <td className="p-3 font-mono text-xs text-muted-foreground">#{row.recordId}</td>
                <td className="p-3">{row.mergedByName ?? <span className="text-muted-foreground italic">unknown</span>}</td>
                <td className="p-3 text-muted-foreground text-xs">{new Date(row.mergedAt).toLocaleString()}</td>
                <td className="p-3">
                  {row.revertedAt ? (
                    <Badge variant="secondary" className="gap-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-300 dark:border-green-700">
                      <RotateCcw className="w-3 h-3" />
                      Reverted
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300 dark:border-blue-700">
                      Applied
                    </Badge>
                  )}
                </td>
                <td className="p-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => setSelectedRow(row)}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View Diff
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-2">Page {page + 1} of {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Diff Side Panel */}
      {selectedRow && (
        <DiffPanel row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  );
}
