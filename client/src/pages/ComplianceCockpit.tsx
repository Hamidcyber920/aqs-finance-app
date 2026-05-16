import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ShieldCheck, AlertTriangle, Clock, CheckCircle2, Plus, Pencil,
  GraduationCap, FileText, ExternalLink, RefreshCw, Upload } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import SmartDocumentUpload from "@/components/SmartDocumentUpload";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    open:          { label: "Open",         className: "compliance-bg-amber text-amber-400" },
    in_progress:   { label: "In Progress",  className: "bg-blue-500/10 text-blue-400 border border-blue-500/25" },
    completed:     { label: "Completed",    className: "compliance-bg-green text-green-400" },
    overdue:       { label: "Overdue",      className: "compliance-bg-red text-red-400" },
    current:       { label: "Current",      className: "compliance-bg-green text-green-400" },
    due_review:    { label: "Due Review",   className: "compliance-bg-amber text-amber-400" },
    draft:         { label: "Draft",        className: "bg-muted text-muted-foreground border border-border" },
    pending:       { label: "Pending",      className: "bg-muted text-muted-foreground border border-border" },
    expired:       { label: "Expired",      className: "compliance-bg-red text-red-400" },
    expiring_soon: { label: "Expiring Soon",className: "compliance-bg-amber text-amber-400" },
  };
  const s = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>;
}

function priorityBadge(priority: string) {
  const map: Record<string, string> = {
    critical: "bg-red-500/15 text-red-400 border border-red-500/30",
    high:     "bg-orange-500/15 text-orange-400 border border-orange-500/30",
    medium:   "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    low:      "bg-muted text-muted-foreground border border-border",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[priority] ?? ""}`}>{priority}</span>;
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function daysUntil(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

// ─── Action Form ──────────────────────────────────────────────────────────────

interface ActionFormProps {
  initial?: Record<string, any>;
  onClose: () => void;
  onSaved: () => void;
}

function ActionForm({ initial, onClose, onSaved }: ActionFormProps) {
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    source: initial?.source ?? "",
    owner: initial?.owner ?? "",
    dueDate: initial?.dueDate ? new Date(initial.dueDate).toISOString().split("T")[0] : "",
    status: initial?.status ?? "open",
    priority: initial?.priority ?? "medium",
    notes: initial?.notes ?? "",
    evidenceUrl: initial?.evidenceUrl ?? "",
  });
  const utils = trpc.useUtils();
  const upsert = (trpc as any).compliance.upsertAction.useMutation({
    onSuccess: () => {
      (utils as any).compliance.listActions.invalidate();
      toast.success(initial ? "Action updated" : "Action created");
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>Title *</Label>
        <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Respond to Charity Commission inquiry" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Source</Label>
          <Input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="e.g. Charity Commission" />
        </div>
        <div>
          <Label>Owner</Label>
          <Input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="e.g. Dr. Hamid" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Due Date</Label>
          <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Evidence URL</Label>
        <Input value={form.evidenceUrl} onChange={e => setForm(f => ({ ...f, evidenceUrl: e.target.value }))} placeholder="https://..." />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => upsert.mutate({ ...form, id: initial?.id })}
          disabled={!form.title || upsert.isPending}
        >
          {upsert.isPending ? "Saving…" : initial ? "Update" : "Create"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Training Form ────────────────────────────────────────────────────────────

interface TrainingFormProps {
  initial?: Record<string, any>;
  onClose: () => void;
  onSaved: () => void;
}

function TrainingForm({ initial, onClose, onSaved }: TrainingFormProps) {
  const [form, setForm] = useState({
    userId: initial?.userId ?? 0,
    userName: initial?.userName ?? "",
    module: initial?.module ?? "",
    provider: initial?.provider ?? "",
    completedAt: initial?.completedAt ? new Date(initial.completedAt).toISOString().split("T")[0] : "",
    expiresAt: initial?.expiresAt ? new Date(initial.expiresAt).toISOString().split("T")[0] : "",
    certificateUrl: initial?.certificateUrl ?? "",
    notes: initial?.notes ?? "",
  });
  const utils = trpc.useUtils();
  const upsert = (trpc as any).compliance.upsertTraining.useMutation({
    onSuccess: () => {
      (utils as any).compliance.listTraining.invalidate();
      toast.success(initial ? "Record updated" : "Record created");
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Person Name *</Label>
          <Input value={form.userName} onChange={e => setForm(f => ({ ...f, userName: e.target.value }))} placeholder="Full name" />
        </div>
        <div>
          <Label>User ID</Label>
          <Input type="number" value={form.userId || ""} onChange={e => setForm(f => ({ ...f, userId: parseInt(e.target.value) || 0 }))} placeholder="System user ID" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Training Module *</Label>
          <Input value={form.module} onChange={e => setForm(f => ({ ...f, module: e.target.value }))} placeholder="e.g. Safeguarding Level 2" />
        </div>
        <div>
          <Label>Provider</Label>
          <Input value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} placeholder="e.g. NSPCC" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Completed Date</Label>
          <Input type="date" value={form.completedAt} onChange={e => setForm(f => ({ ...f, completedAt: e.target.value }))} />
        </div>
        <div>
          <Label>Expiry Date</Label>
          <Input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
        </div>
      </div>
      <div>
        <Label>Certificate URL</Label>
        <Input value={form.certificateUrl} onChange={e => setForm(f => ({ ...f, certificateUrl: e.target.value }))} placeholder="https://..." />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => upsert.mutate({ ...form, id: initial?.id, userId: form.userId || 1 })}
          disabled={!form.module || upsert.isPending}
        >
          {upsert.isPending ? "Saving…" : initial ? "Update" : "Create"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Policy Form ──────────────────────────────────────────────────────────────

interface PolicyFormProps {
  initial?: Record<string, any>;
  onClose: () => void;
  onSaved: () => void;
}

function PolicyForm({ initial, onClose, onSaved }: PolicyFormProps) {
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    category: initial?.category ?? "",
    owner: initial?.owner ?? "",
    version: initial?.version ?? "",
    reviewDate: initial?.reviewDate ? new Date(initial.reviewDate).toISOString().split("T")[0] : "",
    approvedAt: initial?.approvedAt ? new Date(initial.approvedAt).toISOString().split("T")[0] : "",
    approvedBy: initial?.approvedBy ?? "",
    fileUrl: initial?.fileUrl ?? "",
    status: initial?.status ?? "current",
    notes: initial?.notes ?? "",
  });
  const utils = trpc.useUtils();
  const upsert = (trpc as any).compliance.upsertPolicy.useMutation({
    onSuccess: () => {
      (utils as any).compliance.listPolicies.invalidate();
      toast.success(initial ? "Policy updated" : "Policy created");
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>Title *</Label>
        <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Safeguarding Policy" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Category</Label>
          <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Safeguarding" />
        </div>
        <div>
          <Label>Owner</Label>
          <Input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="Responsible person" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Version</Label>
          <Input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="v2.1" />
        </div>
        <div>
          <Label>Next Review</Label>
          <Input type="date" value={form.reviewDate} onChange={e => setForm(f => ({ ...f, reviewDate: e.target.value }))} />
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current</SelectItem>
              <SelectItem value="due_review">Due Review</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Approved Date</Label>
          <Input type="date" value={form.approvedAt} onChange={e => setForm(f => ({ ...f, approvedAt: e.target.value }))} />
        </div>
        <div>
          <Label>Approved By</Label>
          <Input value={form.approvedBy} onChange={e => setForm(f => ({ ...f, approvedBy: e.target.value }))} placeholder="Name" />
        </div>
      </div>
      <div>
        <Label>Document URL</Label>
        <Input value={form.fileUrl} onChange={e => setForm(f => ({ ...f, fileUrl: e.target.value }))} placeholder="https://..." />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => upsert.mutate({ ...form, id: initial?.id })}
          disabled={!form.title || upsert.isPending}
        >
          {upsert.isPending ? "Saving…" : initial ? "Update" : "Create"}
        </Button>
      </DialogFooter>
    </div>
  );
}


// ─── Incident Form ────────────────────────────────────────────────────────────
function IncidentForm({ initial, onClose, onSaved }: { initial?: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    incidentDate: initial?.incidentDate ? new Date(initial.incidentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? "other",
    severity: initial?.severity ?? "medium",
    status: initial?.status ?? "draft",
    charityCommissionRef: initial?.charityCommissionRef ?? "",
    reportedToCC: initial?.reportedToCC ?? false,
    reportedToCCDate: initial?.reportedToCCDate ? new Date(initial.reportedToCCDate).toISOString().split('T')[0] : "",
    actionsTaken: initial?.actionsTaken ?? "",
    outcome: initial?.outcome ?? "",
  });
  const utils = (trpc as any).useUtils();
  const upsert = (trpc as any).compliance.upsertIncident.useMutation({
    onSuccess: () => { utils.compliance.listIncidents.invalidate(); toast.success(initial ? "Incident updated" : "Incident reported"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });
  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Incident Date</Label><Input type="date" value={form.incidentDate} onChange={e => f('incidentDate', e.target.value)} /></div>
        <div><Label>Severity</Label>
          <Select value={form.severity} onValueChange={v => f('severity', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['critical','high','medium','low'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div><Label>Title *</Label><Input value={form.title} onChange={e => f('title', e.target.value)} placeholder="Brief description of incident" /></div>
      <div><Label>Category</Label>
        <Select value={form.category} onValueChange={v => f('category', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {['financial_crime','safeguarding','data_breach','fraud','terrorism','money_laundering','governance','other'].map(c => <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g,' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Description *</Label><Textarea value={form.description} onChange={e => f('description', e.target.value)} rows={3} placeholder="Full description of what happened" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Status</Label>
          <Select value={form.status} onValueChange={v => f('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['draft','reported_to_cc','under_investigation','closed'].map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g,' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>CC Reference</Label><Input value={form.charityCommissionRef} onChange={e => f('charityCommissionRef', e.target.value)} placeholder="CC ref number" /></div>
      </div>
      <div><Label>Actions Taken</Label><Textarea value={form.actionsTaken} onChange={e => f('actionsTaken', e.target.value)} rows={2} /></div>
      <div><Label>Outcome</Label><Textarea value={form.outcome} onChange={e => f('outcome', e.target.value)} rows={2} /></div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => upsert.mutate({ ...form, id: initial?.id })} disabled={!form.title || !form.description || upsert.isPending}>
          {upsert.isPending ? "Saving…" : initial ? "Update" : "Report"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Annual Return Form ───────────────────────────────────────────────────────
function AnnualReturnForm({ initial, onClose, onSaved }: { initial?: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    financialYear: initial?.financialYear ?? "",
    yearEndDate: initial?.yearEndDate ? new Date(initial.yearEndDate).toISOString().split('T')[0] : "",
    submissionDeadline: initial?.submissionDeadline ? new Date(initial.submissionDeadline).toISOString().split('T')[0] : "",
    status: initial?.status ?? "not_started",
    totalIncome: initial?.totalIncome ?? "",
    totalExpenditure: initial?.totalExpenditure ?? "",
    charityCommissionRef: initial?.charityCommissionRef ?? "",
    notes: initial?.notes ?? "",
  });
  const utils = (trpc as any).useUtils();
  const upsert = (trpc as any).compliance.upsertAnnualReturn.useMutation({
    onSuccess: () => { utils.compliance.listAnnualReturns.invalidate(); toast.success(initial ? "Annual return updated" : "Annual return added"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });
  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Financial Year *</Label><Input value={form.financialYear} onChange={e => f('financialYear', e.target.value)} placeholder="e.g. 2024-25" /></div>
        <div><Label>Status</Label>
          <Select value={form.status} onValueChange={v => f('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['not_started','in_progress','submitted','overdue'].map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g,' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Year End Date *</Label><Input type="date" value={form.yearEndDate} onChange={e => f('yearEndDate', e.target.value)} /></div>
        <div><Label>Submission Deadline *</Label><Input type="date" value={form.submissionDeadline} onChange={e => f('submissionDeadline', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Total Income (£)</Label><Input type="number" value={form.totalIncome} onChange={e => f('totalIncome', e.target.value)} placeholder="0.00" /></div>
        <div><Label>Total Expenditure (£)</Label><Input type="number" value={form.totalExpenditure} onChange={e => f('totalExpenditure', e.target.value)} placeholder="0.00" /></div>
      </div>
      <div><Label>CC Reference</Label><Input value={form.charityCommissionRef} onChange={e => f('charityCommissionRef', e.target.value)} placeholder="Charity Commission reference" /></div>
      <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2} /></div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => upsert.mutate({ ...form, id: initial?.id })} disabled={!form.financialYear || !form.yearEndDate || !form.submissionDeadline || upsert.isPending}>
          {upsert.isPending ? "Saving…" : initial ? "Update" : "Add"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ComplianceCockpit() {
  const { user } = useAuth();
  const [tab, setTab] = useState("actions");
  const [actionDialog, setActionDialog] = useState<{ open: boolean; item?: any }>({ open: false });
  const [trainingDialog, setTrainingDialog] = useState<{ open: boolean; item?: any }>({ open: false });
  const [policyDialog, setPolicyDialog] = useState<{ open: boolean; item?: any }>({ open: false });
  const [showTrainingOcr, setShowTrainingOcr] = useState(false);
  const [showPolicyOcr, setShowPolicyOcr] = useState(false);

  useEffect(() => {
  }, []);

  const { data: actions = [], isLoading: actionsLoading, refetch: refetchActions } = (trpc as any).compliance.listActions.useQuery();
  const { data: training = [], isLoading: trainingLoading, refetch: refetchTraining } = (trpc as any).compliance.listTraining.useQuery();
  const { data: policies = [], isLoading: policiesLoading, refetch: refetchPolicies } = (trpc as any).compliance.listPolicies.useQuery();
  const { data: incidents = [], isLoading: incidentsLoading, refetch: refetchIncidents } = (trpc as any).compliance.listIncidents.useQuery();
  const { data: annualReturns = [], isLoading: annualReturnsLoading, refetch: refetchAnnualReturns } = (trpc as any).compliance.listAnnualReturns.useQuery();
  const [incidentDialog, setIncidentDialog] = useState<{ open: boolean; item?: any }>({ open: false });
  const [annualReturnDialog, setAnnualReturnDialog] = useState<{ open: boolean; item?: any }>({ open: false });

  // Summary stats
  const overdueActions = actions.filter((a: any) => a.status === "overdue" || (a.dueDate && new Date(a.dueDate) < new Date() && a.status !== "completed")).length;
  const criticalActions = actions.filter((a: any) => a.priority === "critical" && a.status !== "completed").length;
  const expiredTraining = training.filter((t: any) => t.computedStatus === "expired" || t.computedStatus === "expiring_soon").length;
  const overduePolices = policies.filter((p: any) => p.status === "overdue" || p.status === "due_review").length;

  const isAdmin = ["superadmin", "trustee", "manager", "admin"].includes(user?.role ?? "");

  return (
      <>
      <div className="space-y-5">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-mint" />
              Compliance Cockpit
            </h1>
            <p className="page-subtitle">Statutory obligations, training matrix, and policy register for AQS</p>
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold tabular-nums text-red-400">{overdueActions}</p>
                <p className="text-xs text-muted-foreground">Overdue Actions</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-orange-500/20 bg-orange-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-orange-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold tabular-nums text-orange-400">{criticalActions}</p>
                <p className="text-xs text-muted-foreground">Critical Priority</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <GraduationCap className="h-8 w-8 text-amber-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold tabular-nums text-amber-400">{expiredTraining}</p>
                <p className="text-xs text-muted-foreground">Training Gaps</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <FileText className="h-8 w-8 text-amber-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold tabular-nums text-amber-400">{overduePolices}</p>
                <p className="text-xs text-muted-foreground">Policies Due Review</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-5 max-w-3xl">
            <TabsTrigger value="actions">
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
              Inquiry Actions
              {overdueActions > 0 && <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{overdueActions}</span>}
            </TabsTrigger>
            <TabsTrigger value="training">
              <GraduationCap className="h-3.5 w-3.5 mr-1.5" />
              Training
              {expiredTraining > 0 && <span className="ml-1.5 bg-amber-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{expiredTraining}</span>}
            </TabsTrigger>
            <TabsTrigger value="policies">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Policies
              {overduePolices > 0 && <span className="ml-1.5 bg-amber-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{overduePolices}</span>}
            </TabsTrigger>
            <TabsTrigger value="incidents">
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
              Incidents
              {incidents.filter((i: any) => i.status !== 'closed').length > 0 && <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{incidents.filter((i: any) => i.status !== 'closed').length}</span>}
            </TabsTrigger>
            <TabsTrigger value="annual">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Annual Return
            </TabsTrigger>
          </TabsList>

          {/* ── Inquiry Actions ── */}
          <TabsContent value="actions" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Statutory Inquiry Actions</CardTitle>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => refetchActions()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  {isAdmin && (
                    <Button size="sm" onClick={() => setActionDialog({ open: true })}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Action
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {actionsLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
                ) : actions.length === 0 ? (
                  <div className="p-8 text-center">
                    <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No compliance actions recorded. Add your first action to start tracking.</p>
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table className="data-table w-full">
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Source</th>
                          <th>Owner</th>
                          <th>Due</th>
                          <th>Priority</th>
                          <th>Status</th>
                          {isAdmin && <th></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {actions.map((a: any) => {
                          const days = daysUntil(a.dueDate);
                          return (
                            <tr key={a.id}>
                              <td className="max-w-xs">
                                <p className="font-medium text-sm leading-snug">{a.title}</p>
                                {a.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[240px]">{a.notes}</p>}
                                {a.evidenceUrl && (
                                  <a href={a.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-0.5 mt-0.5 hover:underline">
                                    <ExternalLink className="h-3 w-3" /> Evidence
                                  </a>
                                )}
                              </td>
                              <td className="text-sm text-muted-foreground">{a.source ?? "—"}</td>
                              <td className="text-sm">{a.owner ?? "—"}</td>
                              <td>
                                <span className="text-sm tabular-nums">{fmtDate(a.dueDate)}</span>
                                {days !== null && days <= 7 && days >= 0 && (
                                  <span className="block text-xs text-amber-400">{days === 0 ? "Today" : `${days}d`}</span>
                                )}
                                {days !== null && days < 0 && a.status !== "completed" && (
                                  <span className="block text-xs text-red-400">{Math.abs(days)}d overdue</span>
                                )}
                              </td>
                              <td>{priorityBadge(a.priority)}</td>
                              <td>{statusBadge(a.status)}</td>
                              {isAdmin && (
                                <td>
                                  <Button variant="ghost" size="sm" onClick={() => setActionDialog({ open: true, item: a })}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Training Matrix ── */}
          <TabsContent value="training" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Training Matrix</CardTitle>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => refetchTraining()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  {isAdmin && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setShowTrainingOcr(true)}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> Scan Certificate
                      </Button>
                      <Button size="sm" onClick={() => setTrainingDialog({ open: true })}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Record
                      </Button>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {trainingLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
                ) : training.length === 0 ? (
                  <div className="p-8 text-center">
                    <GraduationCap className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No training records yet. Add the first record to build the matrix.</p>
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table className="data-table w-full">
                      <thead>
                        <tr>
                          <th>Person</th>
                          <th>Module</th>
                          <th>Provider</th>
                          <th>Completed</th>
                          <th>Expires</th>
                          <th>Status</th>
                          {isAdmin && <th></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {training.map((t: any) => {
                          const days = daysUntil(t.expiresAt);
                          return (
                            <tr key={t.id}>
                              <td className="font-medium text-sm">{t.userName ?? `User #${t.userId}`}</td>
                              <td>
                                <p className="text-sm">{t.module}</p>
                                {t.certificateUrl && (
                                  <a href={t.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-0.5 mt-0.5 hover:underline">
                                    <ExternalLink className="h-3 w-3" /> Certificate
                                  </a>
                                )}
                              </td>
                              <td className="text-sm text-muted-foreground">{t.provider ?? "—"}</td>
                              <td className="text-sm tabular-nums">{fmtDate(t.completedAt)}</td>
                              <td>
                                <span className="text-sm tabular-nums">{fmtDate(t.expiresAt)}</span>
                                {days !== null && days <= 30 && days >= 0 && (
                                  <span className="block text-xs text-amber-400">{days}d left</span>
                                )}
                                {days !== null && days < 0 && (
                                  <span className="block text-xs text-red-400">{Math.abs(days)}d ago</span>
                                )}
                              </td>
                              <td>{statusBadge(t.computedStatus)}</td>
                              {isAdmin && (
                                <td>
                                  <Button variant="ghost" size="sm" onClick={() => setTrainingDialog({ open: true, item: t })}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Policy Register ── */}
          <TabsContent value="policies" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Policy Register</CardTitle>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => refetchPolicies()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  {isAdmin && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setShowPolicyOcr(true)}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> Scan Policy Doc
                      </Button>
                      <Button size="sm" onClick={() => setPolicyDialog({ open: true })}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Policy
                      </Button>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {policiesLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
                ) : policies.length === 0 ? (
                  <div className="p-8 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No policies registered yet.</p>
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table className="data-table w-full">
                      <thead>
                        <tr>
                          <th>Policy</th>
                          <th>Category</th>
                          <th>Owner</th>
                          <th>Version</th>
                          <th>Next Review</th>
                          <th>Approved By</th>
                          <th>Status</th>
                          {isAdmin && <th></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {policies.map((p: any) => {
                          const days = daysUntil(p.reviewDate);
                          return (
                            <tr key={p.id}>
                              <td>
                                <p className="font-medium text-sm">{p.title}</p>
                                {p.fileUrl && (
                                  <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-0.5 mt-0.5 hover:underline">
                                    <ExternalLink className="h-3 w-3" /> Document
                                  </a>
                                )}
                              </td>
                              <td className="text-sm text-muted-foreground">{p.category ?? "—"}</td>
                              <td className="text-sm">{p.owner ?? "—"}</td>
                              <td className="text-sm tabular-nums font-mono">{p.version ?? "—"}</td>
                              <td>
                                <span className="text-sm tabular-nums">{fmtDate(p.reviewDate)}</span>
                                {days !== null && days <= 30 && days >= 0 && (
                                  <span className="block text-xs text-amber-400">{days}d</span>
                                )}
                                {days !== null && days < 0 && (
                                  <span className="block text-xs text-red-400">{Math.abs(days)}d overdue</span>
                                )}
                              </td>
                              <td className="text-sm text-muted-foreground">{p.approvedBy ?? "—"}</td>
                              <td>{statusBadge(p.status)}</td>
                              {isAdmin && (
                                <td>
                                  <Button variant="ghost" size="sm" onClick={() => setPolicyDialog({ open: true, item: p })}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Action Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={o => !o && setActionDialog({ open: false })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{actionDialog.item ? "Edit Action" : "New Compliance Action"}</DialogTitle>
          </DialogHeader>
          <ActionForm
            initial={actionDialog.item}
            onClose={() => setActionDialog({ open: false })}
            onSaved={() => setActionDialog({ open: false })}
          />
        </DialogContent>
      </Dialog>

      {/* Training Dialog */}
      <Dialog open={trainingDialog.open} onOpenChange={o => !o && setTrainingDialog({ open: false })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{trainingDialog.item ? "Edit Training Record" : "New Training Record"}</DialogTitle>
          </DialogHeader>
          <TrainingForm
            initial={trainingDialog.item}
            onClose={() => setTrainingDialog({ open: false })}
            onSaved={() => setTrainingDialog({ open: false })}
          />
        </DialogContent>
      </Dialog>

      {/* Policy Dialog */}
      <Dialog open={policyDialog.open} onOpenChange={o => !o && setPolicyDialog({ open: false })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{policyDialog.item ? "Edit Policy" : "New Policy Document"}</DialogTitle>
          </DialogHeader>
          <PolicyForm
            initial={policyDialog.item}
            onClose={() => setPolicyDialog({ open: false })}
            onSaved={() => setPolicyDialog({ open: false })}
          />
        </DialogContent>
      </Dialog>
      {/* ── AI OCR: Training Certificate Upload ── */}
      {showTrainingOcr && (
        <SmartDocumentUpload
          open={true}
          targetType="training_certificate"
          onClose={() => setShowTrainingOcr(false)}
          onExtracted={(fields) => {
            setShowTrainingOcr(false);
            setTrainingDialog({ open: true, item: {
              userName: fields.personName || fields.name || "",
              module: fields.module || fields.courseName || fields.title || "",
              provider: fields.provider || fields.issuer || fields.organisation || "",
              completedAt: fields.completedDate || fields.issueDate || fields.date || "",
              expiresAt: fields.expiryDate || fields.validUntil || "",
              certificateUrl: fields.fileUrl || "",
              notes: fields.notes || "",
            }});
          }}
        />
      )}
      {/* ── AI OCR: Policy Document Upload ── */}
      {showPolicyOcr && (
        <SmartDocumentUpload
          open={true}
          targetType="policy_document"
          onClose={() => setShowPolicyOcr(false)}
          onExtracted={(fields) => {
            setShowPolicyOcr(false);
            setPolicyDialog({ open: true, item: {
              title: fields.title || fields.policyName || "",
              category: fields.category || fields.type || "",
              owner: fields.owner || fields.author || fields.responsiblePerson || "",
              version: fields.version || fields.versionNumber || "",
              reviewDate: fields.reviewDate || fields.nextReviewDate || "",
              approvedAt: fields.approvedDate || fields.approvalDate || "",
              approvedBy: fields.approvedBy || fields.signedBy || "",
              fileUrl: fields.fileUrl || "",
              notes: fields.notes || fields.summary || "",
            }});
          }}
        />
      )}
      {/* Incident Dialog */}
      <Dialog open={incidentDialog.open} onOpenChange={o => !o && setIncidentDialog({ open: false })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{incidentDialog.item ? "Edit Incident" : "Report Serious Incident"}</DialogTitle>
          </DialogHeader>
          <IncidentForm
            initial={incidentDialog.item}
            onClose={() => setIncidentDialog({ open: false })}
            onSaved={() => { setIncidentDialog({ open: false }); refetchIncidents(); }}
          />
        </DialogContent>
      </Dialog>
      {/* Annual Return Dialog */}
      <Dialog open={annualReturnDialog.open} onOpenChange={o => !o && setAnnualReturnDialog({ open: false })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{annualReturnDialog.item ? "Edit Annual Return" : "Add Annual Return"}</DialogTitle>
          </DialogHeader>
          <AnnualReturnForm
            initial={annualReturnDialog.item}
            onClose={() => setAnnualReturnDialog({ open: false })}
            onSaved={() => { setAnnualReturnDialog({ open: false }); refetchAnnualReturns(); }}
          />
        </DialogContent>
      </Dialog>
      </>
  );
}
