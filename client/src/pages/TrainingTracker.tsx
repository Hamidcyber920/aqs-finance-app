import { toast } from "sonner";
import { useState } from "react";
import type { ReactElement } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Plus, CheckCircle, AlertTriangle, XCircle, Clock, Search, Trash2, Edit2, Award, Users, BookOpen, Grid3X3, UserPlus } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  valid: "bg-green-100 text-green-800",
  completed: "bg-green-100 text-green-800",
  expiring_soon: "bg-amber-100 text-amber-800",
  expired: "bg-red-100 text-red-800",
  pending: "bg-gray-100 text-gray-800",
  missing: "bg-gray-50 text-gray-400",
};

const STATUS_ICON: Record<string, ReactElement> = {
  valid: <CheckCircle className="w-3 h-3" />,
  completed: <CheckCircle className="w-3 h-3" />,
  expiring_soon: <AlertTriangle className="w-3 h-3" />,
  expired: <XCircle className="w-3 h-3" />,
  pending: <Clock className="w-3 h-3" />,
  missing: <span className="w-3 h-3 inline-block" />,
};

// Predefined staff list for bulk enrol (can be extended)
const STAFF_LIST = [
  "Dr. Abdul Hamid",
  "Galib Khan",
  "Farid Ahmed",
  "Mumin Khan",
  "Ibrahim Ali",
  "Yusuf Hassan",
  "Aisha Begum",
  "Fatima Malik",
  "Omar Sheikh",
  "Zainab Ahmed",
];

export default function TrainingTracker() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkEnrol, setShowBulkEnrol] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);

  const [form, setForm] = useState({
    userName: "",
    module: "",
    provider: "",
    completedAt: new Date().toISOString().split("T")[0],
    expiresAt: "",
    certificateUrl: "",
    notes: "",
  });

  // Bulk enrol form state
  const [bulkForm, setBulkForm] = useState({
    module: "",
    provider: "",
    completedAt: new Date().toISOString().split("T")[0],
    expiresAt: "",
    notes: "",
    customStaff: "", // comma-separated custom names
  });
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);

  const utils = trpc.useUtils();
  const { data: summary } = trpc.training.summary.useQuery();
  const { data: records = [], isLoading } = trpc.training.list.useQuery({
    staffName: search || undefined,
    status: statusFilter as any,
    limit: 200,
  });

  const addRecord = trpc.training.add.useMutation({
    onSuccess: () => {
      utils.training.list.invalidate();
      utils.training.summary.invalidate();
      setShowAdd(false);
      setForm({ userName: "", module: "", provider: "", completedAt: new Date().toISOString().split("T")[0], expiresAt: "", certificateUrl: "", notes: "" });
      toast.success("Training recorded — record added successfully.");
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkEnrol = trpc.training.bulkEnrol.useMutation({
    onSuccess: (data) => {
      utils.training.list.invalidate();
      utils.training.summary.invalidate();
      setShowBulkEnrol(false);
      setBulkForm({ module: "", provider: "", completedAt: new Date().toISOString().split("T")[0], expiresAt: "", notes: "", customStaff: "" });
      setSelectedStaff([]);
      toast.success(`Bulk enrolment complete — ${data.inserted} staff enrolled on "${bulkForm.module}".`);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateRecord = trpc.training.update.useMutation({
    onSuccess: () => {
      utils.training.list.invalidate();
      utils.training.summary.invalidate();
      setEditRecord(null);
      toast.success("Record updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteRecord = trpc.training.delete.useMutation({
    onSuccess: () => {
      utils.training.list.invalidate();
      utils.training.summary.invalidate();
      toast.success("Record deleted");
    },
  });

  const toggleStaff = (name: string) => {
    setSelectedStaff(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const handleBulkEnrol = () => {
    // Combine selected from list + custom comma-separated names
    const customNames = bulkForm.customStaff
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    const allStaff = Array.from(new Set([...selectedStaff, ...customNames]));
    if (allStaff.length === 0) {
      toast.error("Please select at least one staff member.");
      return;
    }
    if (!bulkForm.module) {
      toast.error("Please enter a training module name.");
      return;
    }
    bulkEnrol.mutate({
      module: bulkForm.module,
      provider: bulkForm.provider || undefined,
      completedAt: bulkForm.completedAt,
      expiresAt: bulkForm.expiresAt || null,
      notes: bulkForm.notes || undefined,
      staff: allStaff.map(name => ({ userName: name })),
    });
  };

  return (
      <>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Training Tracker</h1>
            <p className="text-muted-foreground text-sm mt-1">Track mandatory and optional training completions for all staff, volunteers, and trustees</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowBulkEnrol(true)} className="gap-2">
              <UserPlus className="w-4 h-4" /> Bulk Enrol
            </Button>
            <Button onClick={() => setShowAdd(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Log Training
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1"><Users className="w-4 h-4" /><p className="text-xs">Staff Tracked</p></div>
                <p className="text-2xl font-bold">{summary.staffCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1"><BookOpen className="w-4 h-4" /><p className="text-xs">Modules</p></div>
                <p className="text-2xl font-bold">{summary.moduleCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-green-600 mb-1"><CheckCircle className="w-4 h-4" /><p className="text-xs">Valid</p></div>
                <p className="text-2xl font-bold text-green-600">{summary.valid}</p>
              </CardContent>
            </Card>
            <Card className={summary.expiringSoon > 0 ? "border-amber-400" : ""}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-amber-600 mb-1"><AlertTriangle className="w-4 h-4" /><p className="text-xs">Expiring Soon</p></div>
                <p className={`text-2xl font-bold ${summary.expiringSoon > 0 ? "text-amber-600" : ""}`}>{summary.expiringSoon}</p>
              </CardContent>
            </Card>
            <Card className={summary.expired > 0 ? "border-red-400" : ""}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-red-600 mb-1"><XCircle className="w-4 h-4" /><p className="text-xs">Expired</p></div>
                <p className={`text-2xl font-bold ${summary.expired > 0 ? "text-red-600" : ""}`}>{summary.expired}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Urgent actions */}
        {summary && summary.urgentActions.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-amber-800 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Urgent Actions Required</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {summary.urgentActions.slice(0, 5).map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span><span className="font-medium">{a.staff}</span> — {a.module}</span>
                    <Badge className={STATUS_COLORS[a.type]}>{a.type === "expired" ? "Expired" : "Expiring Soon"} {a.date ? new Date(a.date).toLocaleDateString() : ""}</Badge>
                  </div>
                ))}
                {summary.urgentActions.length > 5 && <p className="text-xs text-amber-700">+{summary.urgentActions.length - 5} more</p>}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="records">
          <TabsList>
            <TabsTrigger value="records">Records</TabsTrigger>
            <TabsTrigger value="matrix">
              <Grid3X3 className="w-4 h-4 mr-1" /> Matrix View
            </TabsTrigger>
          </TabsList>

          {/* Records tab */}
          <TabsContent value="records" className="space-y-4">
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search by staff name..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="completed">Valid / Completed</SelectItem>
                  <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading && <p className="text-muted-foreground text-sm">Loading records...</p>}
            {records.length === 0 && !isLoading && (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground text-sm">
                  <Award className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No training records yet. Click "Log Training" to add the first record.</p>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              {records.map(r => (
                <Card key={r.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-medium text-sm">{r.userName ?? `User #${r.userId}`}</p>
                          <p className="text-xs text-muted-foreground">{r.module}{r.provider ? ` · ${r.provider}` : ""}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-xs text-muted-foreground">
                          <p>Completed: {r.completedAt ? new Date(r.completedAt).toLocaleDateString() : "—"}</p>
                          {r.expiresAt && <p>Expires: {new Date(r.expiresAt).toLocaleDateString()}</p>}
                        </div>
                        <Badge className={`${STATUS_COLORS[r.liveStatus ?? r.status]} flex items-center gap-1`}>
                          {STATUS_ICON[r.liveStatus ?? r.status]}
                          {r.liveStatus ?? r.status}
                        </Badge>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditRecord(r)}>
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { if (confirm("Delete this record?")) deleteRecord.mutate({ id: r.id }); }}>
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    {r.notes && <p className="text-xs text-muted-foreground mt-1 ml-0">{r.notes}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Matrix tab */}
          <TabsContent value="matrix">
            {summary && summary.matrix.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left p-2 font-medium bg-muted/50 sticky left-0 z-10 min-w-32">Staff Member</th>
                      {summary.modules.map(m => (
                        <th key={m} className="p-2 font-medium bg-muted/50 text-center min-w-24 whitespace-nowrap">{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.matrix.map(row => (
                      <tr key={row.staff} className="border-t border-border/50">
                        <td className="p-2 font-medium sticky left-0 bg-background z-10">{row.staff}</td>
                        {row.modules.map(cell => (
                          <td key={cell.module} className="p-2 text-center">
                            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs ${STATUS_COLORS[cell.status]}`}>
                              {STATUS_ICON[cell.status]}
                              <span className="ml-1 capitalize">{cell.status === "missing" ? "—" : cell.status.replace("_", " ")}</span>
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground text-sm">
                  No training data to display in matrix view yet.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Record Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Log Training Record</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Staff Name *</Label>
              <Input value={form.userName} onChange={e => setForm(f => ({ ...f, userName: e.target.value }))} placeholder="Full name" />
            </div>
            <div>
              <Label>Training Module *</Label>
              <Input value={form.module} onChange={e => setForm(f => ({ ...f, module: e.target.value }))} placeholder="e.g. Safeguarding Level 2" />
            </div>
            <div>
              <Label>Provider / Organisation</Label>
              <Input value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} placeholder="e.g. NSPCC, First Aid Training Ltd" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Completed Date *</Label>
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
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addRecord.mutate(form)} disabled={!form.userName || !form.module || !form.completedAt || addRecord.isPending}>
              {addRecord.isPending ? "Saving..." : "Log Training"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Enrol Dialog */}
      <Dialog open={showBulkEnrol} onOpenChange={setShowBulkEnrol}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Bulk Enrol Staff
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Course details */}
            <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
              <h3 className="text-sm font-semibold text-foreground">Course Details</h3>
              <div>
                <Label>Training Module *</Label>
                <Input
                  value={bulkForm.module}
                  onChange={e => setBulkForm(f => ({ ...f, module: e.target.value }))}
                  placeholder="e.g. Safeguarding Level 2"
                />
              </div>
              <div>
                <Label>Provider / Organisation</Label>
                <Input
                  value={bulkForm.provider}
                  onChange={e => setBulkForm(f => ({ ...f, provider: e.target.value }))}
                  placeholder="e.g. NSPCC"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Completed Date *</Label>
                  <Input type="date" value={bulkForm.completedAt} onChange={e => setBulkForm(f => ({ ...f, completedAt: e.target.value }))} />
                </div>
                <div>
                  <Label>Expiry Date</Label>
                  <Input type="date" value={bulkForm.expiresAt} onChange={e => setBulkForm(f => ({ ...f, expiresAt: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={bulkForm.notes} onChange={e => setBulkForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>

            {/* Staff selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Select Staff Members</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedStaff([...STAFF_LIST])}>Select All</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedStaff([])}>Clear</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                {STAFF_LIST.map(name => (
                  <div key={name} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer" onClick={() => toggleStaff(name)}>
                    <Checkbox
                      checked={selectedStaff.includes(name)}
                      onCheckedChange={() => toggleStaff(name)}
                    />
                    <span className="text-sm">{name}</span>
                  </div>
                ))}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Additional staff (comma-separated names)</Label>
                <Input
                  value={bulkForm.customStaff}
                  onChange={e => setBulkForm(f => ({ ...f, customStaff: e.target.value }))}
                  placeholder="e.g. Ahmed Khan, Sara Patel"
                  className="text-sm"
                />
              </div>
              {/* Selection summary */}
              {(selectedStaff.length > 0 || bulkForm.customStaff.trim()) && (
                <p className="text-xs text-muted-foreground">
                  {selectedStaff.length + bulkForm.customStaff.split(",").filter(s => s.trim()).length} staff member(s) selected
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowBulkEnrol(false); setSelectedStaff([]); }}>Cancel</Button>
            <Button
              onClick={handleBulkEnrol}
              disabled={!bulkForm.module || bulkEnrol.isPending}
              className="gap-2"
            >
              {bulkEnrol.isPending ? "Enrolling..." : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Enrol {selectedStaff.length + bulkForm.customStaff.split(",").filter(s => s.trim()).length || ""} Staff
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Record Dialog */}
      {editRecord && (
        <Dialog open={!!editRecord} onOpenChange={() => setEditRecord(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit Training Record</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Staff Name</Label>
                <Input value={editRecord.userName ?? ""} onChange={e => setEditRecord((r: any) => ({ ...r, userName: e.target.value }))} />
              </div>
              <div>
                <Label>Training Module</Label>
                <Input value={editRecord.module} onChange={e => setEditRecord((r: any) => ({ ...r, module: e.target.value }))} />
              </div>
              <div>
                <Label>Provider</Label>
                <Input value={editRecord.provider ?? ""} onChange={e => setEditRecord((r: any) => ({ ...r, provider: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Completed Date</Label>
                  <Input type="date" value={editRecord.completedAt ? new Date(editRecord.completedAt).toISOString().split("T")[0] : ""} onChange={e => setEditRecord((r: any) => ({ ...r, completedAt: e.target.value }))} />
                </div>
                <div>
                  <Label>Expiry Date</Label>
                  <Input type="date" value={editRecord.expiresAt ? new Date(editRecord.expiresAt).toISOString().split("T")[0] : ""} onChange={e => setEditRecord((r: any) => ({ ...r, expiresAt: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Certificate URL</Label>
                <Input value={editRecord.certificateUrl ?? ""} onChange={e => setEditRecord((r: any) => ({ ...r, certificateUrl: e.target.value }))} />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={editRecord.notes ?? ""} onChange={e => setEditRecord((r: any) => ({ ...r, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditRecord(null)}>Cancel</Button>
              <Button onClick={() => updateRecord.mutate({ id: editRecord.id, ...editRecord, completedAt: editRecord.completedAt ? new Date(editRecord.completedAt).toISOString().split("T")[0] : undefined, expiresAt: editRecord.expiresAt ? new Date(editRecord.expiresAt).toISOString().split("T")[0] : null })} disabled={updateRecord.isPending}>
                {updateRecord.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      </>
  );
}
