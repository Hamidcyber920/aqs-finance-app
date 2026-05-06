import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Human-readable label for what is being deleted, e.g. "this income record" */
  itemLabel?: string;
  /** Called when the user has confirmed deletion */
  onConfirm: () => void;
  /** Whether the delete action is in progress */
  loading?: boolean;
}

/**
 * Multi-step deletion confirmation dialog.
 *
 * - superadmin / trustee: two-step — must tick a checkbox TWICE (with a warning
 *   between steps) before the Delete button becomes active.
 * - All other roles: single-step — shown a warning and must click Confirm once.
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  itemLabel = "this entry",
  onConfirm,
  loading = false,
}: DeleteConfirmDialogProps) {
  const { user } = useAuth();
  const isSuperPrivileged =
    user?.role === "superadmin" || user?.role === "trustee";

  // step 0 = initial warning shown
  // step 1 = first tick confirmed (superadmin/trustee only)
  // step 2 = second tick confirmed (superadmin/trustee only) — delete enabled
  const [step, setStep] = useState(0);
  const [tick1, setTick1] = useState(false);
  const [tick2, setTick2] = useState(false);

  const handleClose = (v: boolean) => {
    if (!v) {
      // reset state on close
      setStep(0);
      setTick1(false);
      setTick2(false);
    }
    onOpenChange(v);
  };

  const handleTick1 = (checked: boolean) => {
    setTick1(!!checked);
    if (checked) setStep(1);
    else { setStep(0); setTick2(false); }
  };

  const handleTick2 = (checked: boolean) => {
    setTick2(!!checked);
    if (checked) setStep(2);
    else setStep(1);
  };

  const handleConfirm = () => {
    onConfirm();
    // parent is responsible for closing the dialog after success
  };

  // ── Single-step (general user) ──────────────────────────────────────────────
  if (!isSuperPrivileged) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              You are about to permanently delete {itemLabel}. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 text-sm text-amber-800 dark:text-amber-300">
            <strong>Warning:</strong> Deleted entries cannot be recovered.
            Only proceed if you are certain this entry is incorrect.
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={loading}
            >
              {loading ? "Deleting…" : "Yes, Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Two-step (superadmin / trustee) ────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Permanent Deletion — Elevated Privilege
          </DialogTitle>
          <DialogDescription>
            You are about to permanently delete {itemLabel}. As a{" "}
            <strong>{user?.role}</strong>, you have elevated delete rights.
            This action is irreversible and will be logged.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700 p-3 text-sm text-red-800 dark:text-red-300 space-y-1">
          <p className="font-semibold flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" /> High-privilege deletion
          </p>
          <p>
            This entry will be permanently removed from the system. There is no
            undo. Please confirm you have verified this entry is incorrect
            before proceeding.
          </p>
        </div>

        {/* Step 1 tick */}
        <div className="space-y-3 pt-1">
          <label className="flex items-start gap-3 cursor-pointer group">
            <Checkbox
              id="tick1"
              checked={tick1}
              onCheckedChange={handleTick1}
              className="mt-0.5"
            />
            <span className="text-sm leading-snug">
              I confirm I want to delete {itemLabel} and understand this cannot
              be undone.
            </span>
          </label>

          {/* Step 2 tick — only shown after first tick */}
          {step >= 1 && (
            <div className="rounded-md border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-700 p-3 text-sm text-orange-800 dark:text-orange-300">
              <p className="font-semibold mb-1">Second confirmation required</p>
              <p>
                You are using elevated privileges. Please tick again to confirm
                you have authorisation to delete this record.
              </p>
            </div>
          )}

          {step >= 1 && (
            <label className="flex items-start gap-3 cursor-pointer group">
              <Checkbox
                id="tick2"
                checked={tick2}
                onCheckedChange={handleTick2}
                className="mt-0.5"
              />
              <span className="text-sm leading-snug">
                I have the authority to delete this record and take full
                responsibility for this action.
              </span>
            </label>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={step < 2 || loading}
          >
            {loading ? "Deleting…" : "Delete Permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
