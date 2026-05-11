import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Undo2, Clock, ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

// Type-safe access to the scanMerge router which is appended to appRouter
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trpcAny = trpc as any;

interface Props {
  /** The table name to watch: "trustees", "donors", or "staff_profiles" */
  tableName: string;
  /** The record ID that was just merged */
  recordId: number | null;
  /** The snapshot of the record BEFORE the merge (current values before changes were applied) */
  premergeSnapshot?: Record<string, unknown> | null;
  /** The fields that were changed by the merge (proposed values that were applied) */
  appliedFields?: Record<string, unknown> | null;
  /** Called after a successful revert so the parent can refresh its data */
  onReverted?: () => void;
}

type SnapshotInfo = {
  snapshotId: number;
  mergedAt: Date | string;
  mergedByName: string | null;
  expiresInMs: number;
};

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
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

/**
 * Displays a countdown banner for 10 minutes after a scan-merge is performed.
 * Offers two undo options:
 *   1. Full Undo — restores the entire record to its pre-merge state.
 *   2. Partial Undo — opens a dialog with per-field checkboxes to selectively revert fields.
 */
export function ScanMergeUndoBanner({ tableName, recordId, premergeSnapshot, appliedFields, onReverted }: Props) {
  const [snapshotId, setSnapshotId] = useState<number | null>(null);
  const [expiresInMs, setExpiresInMs] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [showPartialDialog, setShowPartialDialog] = useState(false);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());

  // Poll the backend for the latest snapshot (only if we have a recordId)
  const { data: latest } = trpcAny.scanMerge.getLatest.useQuery(
    { tableName, recordId: recordId! },
    {
      enabled: recordId !== null,
      refetchInterval: 15_000, // re-check every 15 s
    }
  ) as { data: SnapshotInfo | null | undefined };

  const revertMutation = trpcAny.scanMerge.revert.useMutation({
    onSuccess: () => {
      toast.success("Scan import fully reverted — record restored to previous state.");
      setSnapshotId(null);
      setExpiresInMs(null);
      onReverted?.();
    },
    onError: (err: { message: string }) => {
      toast.error(`Revert failed: ${err.message}`);
    },
  });

  const revertFieldsMutation = trpcAny.scanMerge.revertFields.useMutation({
    onSuccess: (res: { revertedFields: string[] }) => {
      const labels = res.revertedFields.map((f) => FIELD_LABELS[f] ?? f).join(", ");
      toast.success(`Partial revert applied — restored: ${labels}`);
      setShowPartialDialog(false);
      onReverted?.();
    },
    onError: (err: { message: string }) => {
      toast.error(`Partial revert failed: ${err.message}`);
    },
  });

  // Sync state when backend responds
  useEffect(() => {
    if (latest) {
      setSnapshotId(latest.snapshotId);
      setExpiresInMs(latest.expiresInMs);
    } else {
      setSnapshotId(null);
      setExpiresInMs(null);
    }
  }, [latest]);

  // Countdown ticker
  useEffect(() => {
    if (expiresInMs === null || expiresInMs <= 0) return;
    setSecondsLeft(Math.ceil(expiresInMs / 1000));
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setSnapshotId(null);
          setExpiresInMs(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresInMs]);

  // Build the diff rows from the snapshot and applied fields
  const diffRows = appliedFields && premergeSnapshot
    ? Object.entries(appliedFields).filter(([k]) => {
        const NON_UPDATABLE = new Set(["id", "createdAt", "updatedAt", "userId"]);
        return !NON_UPDATABLE.has(k);
      }).map(([field, newVal]) => ({
        field,
        label: FIELD_LABELS[field] ?? field,
        before: premergeSnapshot[field],
        after: newVal,
      }))
    : [];

  const handleFullUndo = useCallback(() => {
    if (!snapshotId) return;
    revertMutation.mutate({ snapshotId });
  }, [snapshotId, revertMutation]);

  const handleOpenPartial = useCallback(() => {
    // Pre-select all diff fields
    setSelectedFields(new Set(diffRows.map((r) => r.field)));
    setShowPartialDialog(true);
  }, [diffRows]);

  const handlePartialUndo = useCallback(() => {
    if (!snapshotId || selectedFields.size === 0) return;
    revertFieldsMutation.mutate({ snapshotId, fields: Array.from(selectedFields) });
  }, [snapshotId, selectedFields, revertFieldsMutation]);

  const toggleField = (field: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  if (!snapshotId || secondsLeft <= 0) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeLabel = `${minutes}:${String(seconds).padStart(2, "0")}`;
  const hasDiff = diffRows.length > 0;

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/30 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300 shadow-sm">
        <Clock className="w-4 h-4 flex-shrink-0 text-amber-500" />
        <span className="flex-1">
          <strong>Scan import applied.</strong> You can undo this change for the next{" "}
          <span className="font-mono font-semibold">{timeLabel}</span>.
        </span>
        <div className="flex items-center gap-2">
          {hasDiff && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
              onClick={handleOpenPartial}
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Partial Undo
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
            onClick={handleFullUndo}
            disabled={revertMutation.isPending}
          >
            <Undo2 className="w-3.5 h-3.5" />
            {revertMutation.isPending ? "Reverting…" : "Full Undo"}
          </Button>
        </div>
      </div>

      {/* Partial Undo Dialog */}
      <Dialog open={showPartialDialog} onOpenChange={setShowPartialDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-500" />
              Partial Undo — Select Fields to Revert
            </DialogTitle>
            <DialogDescription>
              Choose which fields to restore to their pre-scan values. Unchecked fields will keep the new values.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="w-8 p-2" />
                  <th className="p-2 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Field</th>
                  <th className="p-2 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Before scan</th>
                  <th className="p-2 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">After scan</th>
                </tr>
              </thead>
              <tbody>
                {diffRows.map((row, i) => (
                  <tr key={row.field} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                    <td className="p-2 text-center">
                      <Checkbox
                        checked={selectedFields.has(row.field)}
                        onCheckedChange={() => toggleField(row.field)}
                      />
                    </td>
                    <td className="p-2 font-medium">{row.label}</td>
                    <td className="p-2 text-green-700 dark:text-green-400 font-mono text-xs">
                      {formatValue(row.before)}
                    </td>
                    <td className="p-2 text-red-600 dark:text-red-400 font-mono text-xs line-through opacity-60">
                      {formatValue(row.after)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            {selectedFields.size} of {diffRows.length} field{diffRows.length !== 1 ? "s" : ""} selected for revert.
            Green = value that will be restored; red strikethrough = current (scan) value that will be discarded.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPartialDialog(false)}>Cancel</Button>
            <Button
              onClick={handlePartialUndo}
              disabled={selectedFields.size === 0 || revertFieldsMutation.isPending}
              className="gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {revertFieldsMutation.isPending ? "Reverting…" : `Revert ${selectedFields.size} Field${selectedFields.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
