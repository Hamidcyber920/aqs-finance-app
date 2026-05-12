import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Plus, RefreshCw, Mail, Phone, Building, FileText, AlertTriangle,
  CheckCircle2, Clock, XCircle, Link2, Unlink, Zap,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  responded: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  awaiting_reply: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  closed: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const ACTION_STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
};

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="h-3.5 w-3.5" />,
  phone: <Phone className="h-3.5 w-3.5" />,
  letter: <FileText className="h-3.5 w-3.5" />,
  meeting: <Building className="h-3.5 w-3.5" />,
  portal: <Building className="h-3.5 w-3.5" />,
};

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function daysUntil(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

const emptyForm = {
  contactName: "",
  contactRole: "",
  direction: "inbound" as "inbound" | "outbound",
  channel: "email" as "email" | "letter" | "phone" | "meeting" | "portal",
  subject: "",
  summary: "",
  dateReceived: new Date().toISOString().split("T")[0],
  responseDeadline: "",
  status: "pending" as "pending" | "responded" | "awaiting_reply" | "closed",
  priority: "medium" as "critical" | "high" | "medium" | "low",
  internalNotes: "",
};

export default function LbmwCorrespondence() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dialog, setDialog] = useState<{ open: boolean; item?: any }>({ open: false });
  const [form, setForm] = useState(emptyForm);
  const [updateDialog, setUpdateDialog] = useState<{ open: boolean; item?: any }>({ open: false });
  const [updateForm, setUpdateForm] = useState({ status: "pending" as any, priority: "medium" as any, internalNotes: "", responseDeadline: "", summary: "" });

  // Link-to-action dialog state
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; item?: any }>({ open: false });
  const [linkMode, setLinkMode] = useState<"existing" | "create">("existing");
  const [selectedActionId, setSelectedActionId] = useState<string>("");
  const [createActionForm, setCreateActionForm] = useState({
    title: "",
    owner: "",
    dueDate: "",
    priority: "medium" as "low" | "medium" | "high" | "critical",
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: items = [], isLoading, refetch } = trpc.lbmw.list.useQuery({ status: statusFilter || undefined });
  const { data: summary } = trpc.lbmw.summary.useQuery();
  const { data: complianceActions = [] } = trpc.lbmw.listComplianceActions.useQuery();

  const createMut = trpc.lbmw.create.useMutation({
    onSuccess: () => { toast.success("Correspondence record created"); setDialog({ open: false }); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.lbmw.update.useMutation({
    onSuccess: () => { toast.success("Record updated"); setUpdateDialog({ open: false }); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.lbmw.delete.useMutation({
    onSuccess: () => { toast.success("Record deleted"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const linkToActionMut = trpc.lbmw.linkToAction.useMutation({
    onSuccess: () => { toast.success("Correspondence linked to compliance action"); setLinkDialog({ open: false }); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const autoCreateActionMut = trpc.lbmw.autoCreateAction.useMutation({
    onSuccess: (data) => {
      toast.success(`Compliance action created (ID: ${data.complianceActionId}) and linked`);
      setLinkDialog({ open: false });
      refetch();
      utils.lbmw.listComplianceActions.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function openCreate() {
    setForm(emptyForm);
    setDialog({ open: true });
  }

  function openUpdate(item: any) {
    setUpdateForm({
      status: item.status,
      priority: item.priority,
      internalNotes: item.internalNotes ?? "",
      responseDeadline: item.responseDeadline ? new Date(item.responseDeadline).toISOString().split("T")[0] : "",
      summary: item.summary ?? "",
    });
    setUpdateDialog({ open: true, item });
  }

  function openLinkDialog(item: any) {
    setLinkDialog({ open: true, item });
    setLinkMode("existing");
    setSelectedActionId(item.linkedComplianceActionId?.toString() ?? "");
    setCreateActionForm({
      title: `Action: ${item.subject}`,
      owner: "",
      dueDate: item.responseDeadline ? new Date(item.responseDeadline).toISOString().split("T")[0] : "",
      priority: item.priority ?? "medium",
      notes: `Auto-created from LBMW correspondence: ${item.subject}`,
    });
  }

  function handleLinkSubmit() {
    if (!linkDialog.item) return;
    if (linkMode === "existing") {
      linkToActionMut.mutate({
        correspondenceId: linkDialog.item.id,
        complianceActionId: selectedActionId ? parseInt(selectedActionId) : null,
      });
    } else {
      autoCreateActionMut.mutate({
        correspondenceId: linkDialog.item.id,
        ...createActionForm,
        dueDate: createActionForm.dueDate || undefined,
      });
    }
  }

  // Build a map of complianceActionId → action for display
  const actionMap = Object.fromEntries(complianceActions.map(a => [a.id, a]));

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">LBMW Correspondence Tracker</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Statutory inquiry correspondence with Charity Commission and regulatory contacts</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Log Correspondence
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-800"><FileText className="h-5 w-5 text-slate-300" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Records</p>
                  <p className="text-2xl font-bold">{summary?.total ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10"><Clock className="h-5 w-5 text-amber-400" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Pending / Awaiting</p>
                  <p className="text-2xl font-bold text-amber-400">{summary?.pending ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10"><AlertTriangle className="h-5 w-5 text-red-400" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Overdue Responses</p>
                  <p className="text-2xl font-bold text-red-400">{summary?.overdue ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {["", "pending", "awaiting_reply", "responded", "closed"].map(s => (
            <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)}>
              {s === "" ? "All" : s.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
            </Button>
          ))}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
            ) : items.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No correspondence records found.</p>
                <Button size="sm" className="mt-3" onClick={openCreate}>Log First Record</Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 font-medium text-muted-foreground">Contact</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Subject</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Channel</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Deadline</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Priority</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: any) => {
                      const days = daysUntil(item.responseDeadline);
                      const isOverdue = days !== null && days < 0 && item.status !== "responded" && item.status !== "closed";
                      const linkedAction = item.linkedComplianceActionId ? actionMap[item.linkedComplianceActionId] : null;
                      return (
                        <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="p-3">
                            <p className="font-medium">{item.contactName}</p>
                            {item.contactRole && <p className="text-xs text-muted-foreground">{item.contactRole}</p>}
                            <span className="text-xs text-muted-foreground capitalize">{item.direction}</span>
                          </td>
                          <td className="p-3 max-w-xs">
                            <p className="font-medium truncate">{item.subject}</p>
                            {item.summary && <p className="text-xs text-muted-foreground line-clamp-1">{item.summary}</p>}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5 text-muted-foreground capitalize">
                              {CHANNEL_ICONS[item.channel]}
                              {item.channel}
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground">{fmtDate(item.dateReceived)}</td>
                          <td className="p-3">
                            {item.responseDeadline ? (
                              <div>
                                <span className={isOverdue ? "text-red-400 font-medium" : "text-muted-foreground"}>
                                  {fmtDate(item.responseDeadline)}
                                </span>
                                {days !== null && item.status !== "responded" && item.status !== "closed" && (
                                  <span className={`block text-xs ${isOverdue ? "text-red-400" : days <= 3 ? "text-amber-400" : "text-muted-foreground"}`}>
                                    {isOverdue ? `${Math.abs(days)}d overdue` : `${days}d left`}
                                  </span>
                                )}
                              </div>
                            ) : "—"}
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[item.priority]}`}>
                              {item.priority}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className={`text-xs capitalize ${STATUS_COLORS[item.status]}`}>
                              {item.status.replace("_", " ")}
                            </Badge>
                          </td>
                          {/* Linked compliance action column */}
                          <td className="p-3 min-w-[140px]">
                            {linkedAction ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <Link2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                                  <span className="text-xs font-medium text-green-600 truncate max-w-[110px]" title={linkedAction.title}>
                                    {linkedAction.title}
                                  </span>
                                </div>
                                <Badge className={`text-[10px] px-1 py-0 ${ACTION_STATUS_COLORS[linkedAction.status] ?? "bg-gray-100 text-gray-700"}`}>
                                  {linkedAction.status}
                                </Badge>
                                <button
                                  className="text-[10px] text-muted-foreground hover:text-red-500 flex items-center gap-0.5"
                                  onClick={() => linkToActionMut.mutate({ correspondenceId: item.id, complianceActionId: null })}
                                >
                                  <Unlink className="h-2.5 w-2.5" /> Unlink
                                </button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1 text-muted-foreground hover:text-primary"
                                onClick={() => openLinkDialog(item)}
                              >
                                <Zap className="h-3 w-3" /> Link Action
                              </Button>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openUpdate(item)}>Edit</Button>
                              <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => {
                                if (confirm("Delete this record?")) deleteMut.mutate({ id: item.id });
                              }}>Del</Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Dialog */}
      <Dialog open={dialog.open} onOpenChange={o => setDialog({ open: o })}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Log Correspondence</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Contact Name *</Label>
                <Input value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} placeholder="e.g. Sarah Jones" />
              </div>
              <div>
                <Label className="text-xs">Contact Role</Label>
                <Input value={form.contactRole} onChange={e => setForm(f => ({ ...f, contactRole: e.target.value }))} placeholder="e.g. Case Officer" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Subject *</Label>
              <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Brief description of the correspondence" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Direction</Label>
                <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbound">Inbound</SelectItem>
                    <SelectItem value="outbound">Outbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Channel</Label>
                <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="letter">Letter</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="portal">Portal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as any }))}>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Date Received *</Label>
                <Input type="date" value={form.dateReceived} onChange={e => setForm(f => ({ ...f, dateReceived: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Response Deadline</Label>
                <Input type="date" value={form.responseDeadline} onChange={e => setForm(f => ({ ...f, responseDeadline: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Summary</Label>
              <Textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} placeholder="Brief summary of the correspondence content" rows={2} />
            </div>
            <div>
              <Label className="text-xs">Internal Notes</Label>
              <Textarea value={form.internalNotes} onChange={e => setForm(f => ({ ...f, internalNotes: e.target.value }))} placeholder="Internal notes for the team" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>Cancel</Button>
            <Button disabled={createMut.isPending || !form.contactName || !form.subject || !form.dateReceived}
              onClick={() => createMut.mutate({ ...form, responseDeadline: form.responseDeadline || undefined })}>
              {createMut.isPending ? "Saving…" : "Save Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Dialog */}
      <Dialog open={updateDialog.open} onOpenChange={o => setUpdateDialog({ open: o })}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Update Record</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={updateForm.status} onValueChange={v => setUpdateForm(f => ({ ...f, status: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="awaiting_reply">Awaiting Reply</SelectItem>
                    <SelectItem value="responded">Responded</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Priority</Label>
                <Select value={updateForm.priority} onValueChange={v => setUpdateForm(f => ({ ...f, priority: v as any }))}>
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
              <Label className="text-xs">Response Deadline</Label>
              <Input type="date" value={updateForm.responseDeadline} onChange={e => setUpdateForm(f => ({ ...f, responseDeadline: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Summary</Label>
              <Textarea value={updateForm.summary} onChange={e => setUpdateForm(f => ({ ...f, summary: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label className="text-xs">Internal Notes</Label>
              <Textarea value={updateForm.internalNotes} onChange={e => setUpdateForm(f => ({ ...f, internalNotes: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateDialog({ open: false })}>Cancel</Button>
            <Button disabled={updateMut.isPending}
              onClick={() => updateMut.mutate({ id: updateDialog.item.id, ...updateForm, responseDeadline: updateForm.responseDeadline || undefined })}>
              {updateMut.isPending ? "Saving…" : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link to Compliance Action Dialog */}
      <Dialog open={linkDialog.open} onOpenChange={o => setLinkDialog({ open: o })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" /> Link to Compliance Action
            </DialogTitle>
            {linkDialog.item && (
              <p className="text-xs text-muted-foreground mt-1">
                Correspondence: <span className="font-medium">{linkDialog.item.subject}</span>
              </p>
            )}
          </DialogHeader>

          {/* Mode toggle */}
          <div className="flex gap-2 mt-1">
            <Button
              variant={linkMode === "existing" ? "default" : "outline"}
              size="sm"
              onClick={() => setLinkMode("existing")}
            >
              Link Existing Action
            </Button>
            <Button
              variant={linkMode === "create" ? "default" : "outline"}
              size="sm"
              onClick={() => setLinkMode("create")}
            >
              <Zap className="h-3.5 w-3.5 mr-1" /> Auto-Create Action
            </Button>
          </div>

          {linkMode === "existing" ? (
            <div className="space-y-3 py-2">
              <div>
                <Label className="text-xs">Select Compliance Action</Label>
                <Select value={selectedActionId} onValueChange={setSelectedActionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an existing compliance action…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— No link (unlink) —</SelectItem>
                    {complianceActions.map(a => (
                      <SelectItem key={a.id} value={a.id.toString()}>
                        <span className="font-medium">{a.title}</span>
                        <span className="ml-2 text-muted-foreground text-xs">({a.status})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedActionId && actionMap[parseInt(selectedActionId)] && (
                <div className="p-3 bg-muted/30 rounded text-sm space-y-1">
                  <p className="font-medium">{actionMap[parseInt(selectedActionId)].title}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>Status: <Badge className={`text-[10px] px-1 ${ACTION_STATUS_COLORS[actionMap[parseInt(selectedActionId)].status] ?? ""}`}>{actionMap[parseInt(selectedActionId)].status}</Badge></span>
                    {actionMap[parseInt(selectedActionId)].owner && <span>Owner: {actionMap[parseInt(selectedActionId)].owner}</span>}
                    {actionMap[parseInt(selectedActionId)].dueDate && <span>Due: {fmtDate(actionMap[parseInt(selectedActionId)].dueDate)}</span>}
                  </div>
                </div>
              )}
              {complianceActions.length === 0 && (
                <p className="text-xs text-muted-foreground">No compliance actions found. Use "Auto-Create Action" to create one from this correspondence.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <p className="text-xs text-muted-foreground">A new compliance action will be created and automatically linked to this correspondence.</p>
              <div>
                <Label className="text-xs">Action Title *</Label>
                <Input value={createActionForm.title} onChange={e => setCreateActionForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Responsible Owner</Label>
                  <Input value={createActionForm.owner} onChange={e => setCreateActionForm(f => ({ ...f, owner: e.target.value }))} placeholder="e.g. Dr. Abdul Hamid" />
                </div>
                <div>
                  <Label className="text-xs">Due Date</Label>
                  <Input type="date" value={createActionForm.dueDate} onChange={e => setCreateActionForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Priority</Label>
                <Select value={createActionForm.priority} onValueChange={v => setCreateActionForm(f => ({ ...f, priority: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea value={createActionForm.notes} onChange={e => setCreateActionForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog({ open: false })}>Cancel</Button>
            <Button
              disabled={linkToActionMut.isPending || autoCreateActionMut.isPending || (linkMode === "create" && !createActionForm.title)}
              onClick={handleLinkSubmit}
              className="gap-2"
            >
              <Link2 className="h-4 w-4" />
              {linkMode === "existing" ? "Save Link" : "Create & Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
