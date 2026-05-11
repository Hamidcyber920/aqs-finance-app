import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Undo2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

// Type-safe access to the scanMerge router which is appended to appRouter
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trpcAny = trpc as any;

interface Props {
  /** The table name to watch: "trustees" or "donors" */
  tableName: string;
  /** The record ID that was just merged */
  recordId: number | null;
  /** Called after a successful revert so the parent can refresh its data */
  onReverted?: () => void;
}

/**
 * Displays a countdown banner for 10 minutes after a scan-merge is performed.
 * The user can click "Undo" to restore the record to its pre-merge state.
 * The banner disappears automatically when the window expires.
 */
export function ScanMergeUndoBanner({ tableName, recordId, onReverted }: Props) {
  const [snapshotId, setSnapshotId] = useState<number | null>(null);
  const [expiresInMs, setExpiresInMs] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // Poll the backend for the latest snapshot (only if we have a recordId)
  const { data: latest } = trpcAny.scanMerge.getLatest.useQuery(
    { tableName, recordId: recordId! },
    {
      enabled: recordId !== null,
      refetchInterval: 15_000, // re-check every 15 s
    }
  ) as { data: { snapshotId: number; mergedAt: Date; mergedByName: string | null; expiresInMs: number } | null | undefined };

  const revertMutation = trpcAny.scanMerge.revert.useMutation({
    onSuccess: () => {
      toast.success("Scan import reverted — record restored to previous state.");
      setSnapshotId(null);
      setExpiresInMs(null);
      onReverted?.();
    },
    onError: (err: { message: string }) => {
      toast.error(`Revert failed: ${err.message}`);
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

  const handleUndo = useCallback(() => {
    if (!snapshotId) return;
    revertMutation.mutate({ snapshotId });
  }, [snapshotId, revertMutation]);

  if (!snapshotId || secondsLeft <= 0) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeLabel = `${minutes}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/30 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300 shadow-sm">
      <Clock className="w-4 h-4 flex-shrink-0 text-amber-500" />
      <span className="flex-1">
        <strong>Scan import applied.</strong> You can undo this change for the next{" "}
        <span className="font-mono font-semibold">{timeLabel}</span>.
      </span>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
        onClick={handleUndo}
        disabled={revertMutation.isPending}
      >
        <Undo2 className="w-3.5 h-3.5" />
        {revertMutation.isPending ? "Reverting…" : "Undo"}
      </Button>
    </div>
  );
}
