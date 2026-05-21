import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, CheckCircle2, XCircle, Clock, ChevronRight, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import SmartDocumentUpload from "@/components/SmartDocumentUpload";
import { fmtDate } from "@/lib/dateUtils";

const OUTCOME_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  passed: { label: "Passed", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  rejected: { label: "Rejected", color: "bg-red-500/15 text-red-400 border-red-500/30", icon: <XCircle className="w-3.5 h-3.5" /> },
  deferred: { label: "Deferred", color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: <Clock className="w-3.5 h-3.5" /> },
  pending: { label: "Pending", color: "bg-slate-500/15 text-slate-400 border-slate-500/30", icon: <Clock className="w-3.5 h-3.5" /> },
};

type DecisionForm = {
  id?: number;
  title: string;
  motionText: string;
  proposer: string;
  seconder: string;
  votesFor: number;
  votesAgainst: number;
  abstentions: number;
  outcome: "passed" | "rejected" | "deferred" | "pending";
  meetingDate: string;
  minutesUrl: string;
  notes: string;
};

const EMPTY_FORM: DecisionForm = {
  title: "", motionText: "", proposer: "", seconder: "",
  votesFor: 0, votesAgainst: 0, abstentions: 0,
  outcome: "pending", meetingDate: "", minutesUrl: "", notes: "",
};

export default function Decisions() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DecisionForm>(EMPTY_FORM);
  const [showOcr, setShowOcr] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  useEffect(() => {
  }, []);

  const { data: decisions = [], isLoading } = (trpc as any).decisions.list.useQuery({ limit: 200 });

  const upsert = (trpc as any).decisions.upsert.useMutation({
    onSuccess: () => {
      utils.invalidate();
      setOpen(false);
      setForm(EMPTY_FORM);
      toast.success(form.id ? "Decision updated" : "Decision recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = (trpc as any).decisions.delete.useMutation({
    onSuccess: () => { utils.invalidate(); setDeleteId(null); toast.success("Decision deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const canEdit = user && ["superadmin", "trustee", "admin", "manager"].includes(user.role);
  const canDelete = user && ["superadmin", "admin"].includes(user.role);

  function openNew() { setForm(EMPTY_FORM); setOpen(true); }
  function openEdit(d: any) {
    setForm({
      id: d.id, title: d.title ?? "", motionText: d.motionText ?? "",
      proposer: d.proposer ?? "", seconder: d.seconder ?? "",
      votesFor: d.votesFor ?? 0, votesAgainst: d.votesAgainst ?? 0, abstentions: d.abstentions ?? 0,
      outcome: d.outcome ?? "pending",
      meetingDate: d.meetingDate ? new Date(d.meetingDate).toISOString().slice(0, 10) : "",
      minutesUrl: d.minutesUrl ?? "", notes: d.notes ?? "",
    });
    setOpen(true);
  }

  function handleOcrExtracted(fields: Record<string, any>) {
    setForm(prev => ({
      ...prev,
      title: fields.title ?? prev.title,
      motionText: fields.motionText ?? fields.motion ?? prev.motionText,
      proposer: fields.proposer ?? prev.proposer,
      seconder: fields.seconder ?? prev.seconder,
      votesFor: fields.votesFor ?? fields.votes_for ?? prev.votesFor,
      votesAgainst: fields.votesAgainst ?? fields.votes_against ?? prev.votesAgainst,
      abstentions: fields.abstentions ?? prev.abstentions,
      outcome: fields.outcome ?? prev.outcome,
      meetingDate: fields.meetingDate ?? fields.date ?? prev.meetingDate,
      notes: fields.notes ?? prev.notes,
    }));
    setShowOcr(false);
    setOpen(true);
    toast.success("Fields extracted from document — please review before saving");
  }

  const stats = {
    total: decisions.length,
    passed: decisions.filter((d: any) => d.outcome === "passed").length,
    pending: decisions.filter((d: any) => d.outcome === "pending").length,
    deferred: decisions.filter((d: any) => d.outcome === "deferred").length,
  };

  return (
      <>
      <div className="page-enter space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Decisions Register</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Official record of all trustee motions and votes</p>
          </div>
          {canEdit && (
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setShowOcr(true)}>
                <Upload className="w-4 h-4 mr-2" /> Scan Minutes
              </Button>
              <Button size="sm" onClick={openNew}>
                <Plus className="w-4 h-4 mr-2" /> Record Decision
              </Button>
            </div>
          )}
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Decisions", value: stats.total, color: "text-foreground" },
            { label: "Passed", value: stats.passed, color: "text-emerald-400" },
            { label: "Pending", value: stats.pending, color: "text-amber-400" },
            { label: "Deferred", value: stats.deferred, color: "text-slate-400" },
          ].map(s => (
            <Card key={s.label} className="bg-card/60 border-border/50">
              <CardContent className="p-4">
                <div className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table */}
        <Card className="bg-card/60 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">All Decisions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
            ) : decisions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No decisions recorded yet. Click "Record Decision" to add the first entry.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Title / Motion</TableHead>
                    <TableHead>Meeting Date</TableHead>
                    <TableHead>Proposer</TableHead>
                    <TableHead className="text-center">Votes For</TableHead>
                    <TableHead className="text-center">Against</TableHead>
                    <TableHead className="text-center">Abstain</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Minutes</TableHead>
                    {canEdit && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decisions.map((d: any) => {
                    const oc = OUTCOME_CONFIG[d.outcome] ?? OUTCOME_CONFIG.pending;
                    return (
                      <TableRow key={d.id} className="border-border/30 hover:bg-muted/20">
                        <TableCell className="max-w-xs">
                          <div className="font-medium text-sm truncate">{d.title}</div>
                          {d.motionText && (
                            <div className="text-xs text-muted-foreground truncate mt-0.5">{d.motionText}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {d.meetingDate ? fmtDate(new Date(d.meetingDate)) : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{d.proposer ?? "—"}</TableCell>
                        <TableCell className="text-center text-sm tabular-nums text-emerald-400 font-semibold">{d.votesFor}</TableCell>
                        <TableCell className="text-center text-sm tabular-nums text-red-400 font-semibold">{d.votesAgainst}</TableCell>
                        <TableCell className="text-center text-sm tabular-nums text-slate-400">{d.abstentions}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs gap-1 ${oc.color}`}>
                            {oc.icon} {oc.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {d.minutesUrl ? (
                            <a href={d.minutesUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                              <FileText className="w-3.5 h-3.5" /> View
                            </a>
                          ) : "—"}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              {canDelete && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteId(d.id)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Decision" : "Record New Decision"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Approval of Annual Accounts 2024/25" />
            </div>
            <div className="space-y-1.5">
              <Label>Motion Text</Label>
              <Textarea value={form.motionText} onChange={e => setForm(p => ({ ...p, motionText: e.target.value }))}
                placeholder="Full wording of the motion as recorded in minutes…" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Proposer</Label>
                <Input value={form.proposer} onChange={e => setForm(p => ({ ...p, proposer: e.target.value }))}
                  placeholder="Name of trustee who proposed" />
              </div>
              <div className="space-y-1.5">
                <Label>Seconder</Label>
                <Input value={form.seconder} onChange={e => setForm(p => ({ ...p, seconder: e.target.value }))}
                  placeholder="Name of trustee who seconded" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Votes For</Label>
                <Input type="number" min={0} value={form.votesFor}
                  onChange={e => setForm(p => ({ ...p, votesFor: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Votes Against</Label>
                <Input type="number" min={0} value={form.votesAgainst}
                  onChange={e => setForm(p => ({ ...p, votesAgainst: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Abstentions</Label>
                <Input type="number" min={0} value={form.abstentions}
                  onChange={e => setForm(p => ({ ...p, abstentions: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Outcome</Label>
                <Select value={form.outcome} onValueChange={(v: any) => setForm(p => ({ ...p, outcome: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passed">Passed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="deferred">Deferred</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Meeting Date</Label>
                <Input type="date" value={form.meetingDate}
                  onChange={e => setForm(p => ({ ...p, meetingDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Minutes URL</Label>
              <Input value={form.minutesUrl} onChange={e => setForm(p => ({ ...p, minutesUrl: e.target.value }))}
                placeholder="https://… (link to uploaded minutes document)" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Any additional context or action points…" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.title.trim() || upsert.isPending}
              onClick={() => upsert.mutate({
                id: form.id,
                title: form.title,
                motionText: form.motionText || undefined,
                proposer: form.proposer || undefined,
                seconder: form.seconder || undefined,
                votesFor: form.votesFor,
                votesAgainst: form.votesAgainst,
                abstentions: form.abstentions,
                outcome: form.outcome,
                meetingDate: form.meetingDate || undefined,
                minutesUrl: form.minutesUrl || undefined,
                notes: form.notes || undefined,
              })}
            >
              {upsert.isPending ? "Saving…" : form.id ? "Save Changes" : "Record Decision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Decision?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone. The decision will be permanently removed from the register.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={del.isPending}
              onClick={() => deleteId && del.mutate({ id: deleteId })}>
              {del.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI OCR Scan Minutes */}
      {showOcr && (
        <SmartDocumentUpload
          open={showOcr}
          onClose={() => setShowOcr(false)}
          targetType="decision_minutes"
          onExtracted={handleOcrExtracted}
        />
      )}
      </>
  );
}
