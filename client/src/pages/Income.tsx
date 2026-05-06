import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, TrendingUp, Building2, DollarSign, Trash2, Loader2, FolderPlus } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

const PERIOD_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  one_off: "One-off",
  annual: "Annual",
};

const STATUS_COLOURS: Record<string, string> = {
  paid: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  overdue: "bg-red-100 text-red-800",
  partial: "bg-blue-100 text-blue-800",
};

// ─── Add Income Record Dialog ────────────────────────────────────────────────
function AddIncomeDialog({
  open, onClose, categories, preselectedCategoryId, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  categories: Array<{ id: number; name: string; allowedPeriods?: string | null; requiresSpecification?: boolean | number }>;
  preselectedCategoryId?: number;
  onSuccess: () => void;
}) {
  const [selectedCatId, setSelectedCatId] = useState<number | undefined>(preselectedCategoryId);
  const [selectedPeriod, setSelectedPeriod] = useState("monthly");
  const [communitySpec, setCommunitySpec] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("paid");

  const selectedCat = useMemo(() => categories.find(c => c.id === selectedCatId), [categories, selectedCatId]);
  const allowedPeriods: string[] = useMemo(() => {
    const ap = selectedCat?.allowedPeriods as string | null | undefined;
    if (!ap) return ["daily", "weekly", "monthly", "one_off"];
    return ap.split(",").map((s: string) => s.trim()).filter(Boolean);
  }, [selectedCat]);
  const requiresSpec = selectedCat?.requiresSpecification === true || selectedCat?.requiresSpecification === 1;

  const create = trpc.income.create.useMutation({
    onSuccess: () => {
      toast.success("Income record added");
      onClose();
      resetForm();
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setSelectedCatId(preselectedCategoryId);
    setSelectedPeriod("monthly");
    setCommunitySpec("");
    setPayerName("");
    setPayerEmail("");
    setAmount("");
    setReference("");
    setNotes("");
    setPaymentStatus("paid");
  }

  function handleCatChange(id: number) {
    setSelectedCatId(id);
    const cat = categories.find(c => c.id === id);
    const ap = cat?.allowedPeriods as string | null | undefined;
    const first = ap ? ap.split(",")[0].trim() : "monthly";
    setSelectedPeriod(first);
    setCommunitySpec("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const catId = selectedCatId ?? preselectedCategoryId;
    if (!catId) { toast.error("Please select a category"); return; }
    if (!amount) { toast.error("Please enter an amount"); return; }
    if (requiresSpec && !communitySpec.trim()) { toast.error("Please specify the purpose"); return; }
    const description = requiresSpec ? `${selectedCat?.name} — ${communitySpec.trim()}` : (selectedCat?.name ?? "");
    create.mutate({
      categoryId: catId,
      description,
      amount,
      period: selectedPeriod as any,
      paymentStatus,
      payerName: payerName || undefined,
      payerEmail: payerEmail || undefined,
      reference: reference || undefined,
      notes: notes || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { onClose(); resetForm(); } }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Income Record</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Category — only shown if no preselected */}
          {!preselectedCategoryId && (
            <div>
              <Label>Category *</Label>
              <Select value={selectedCatId?.toString() ?? ""} onValueChange={v => handleCatChange(parseInt(v))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {preselectedCategoryId && (
            <div className="p-2 bg-muted rounded text-sm">
              Category: <strong>{categories.find(c => c.id === preselectedCategoryId)?.name}</strong>
            </div>
          )}

          {requiresSpec && (
            <div>
              <Label>Specify Purpose *</Label>
              <Input value={communitySpec} onChange={e => setCommunitySpec(e.target.value)} placeholder="e.g. Youth group meeting…" className="mt-1" required />
            </div>
          )}

          {(selectedCatId || preselectedCategoryId) && allowedPeriods.length > 1 && (
            <div>
              <Label>Period</Label>
              <div className="flex gap-1 mt-1 flex-wrap">
                {allowedPeriods.map(p => (
                  <button key={p} type="button" onClick={() => setSelectedPeriod(p)}
                    className={"px-3 py-1.5 rounded-md text-xs font-medium border transition-colors " + (selectedPeriod === p ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:bg-muted/80")}>
                    {PERIOD_LABELS[p] ?? p}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label>Tenant / Payer Name</Label>
            <Input value={payerName} onChange={e => setPayerName(e.target.value)} className="mt-1" placeholder="Full name" />
          </div>
          <div>
            <Label>Payer Email</Label>
            <Input type="email" value={payerEmail} onChange={e => setPayerEmail(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Amount (£) *</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} required className="mt-1" placeholder="0.00" />
          </div>
          <div>
            <Label>Payment Status</Label>
            <Select value={paymentStatus} onValueChange={setPaymentStatus}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reference</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Invoice / transaction ref" className="mt-1" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="mt-1" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); resetForm(); }}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Add Income Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Category Dialog ─────────────────────────────────────────────────────
function NewCategoryDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#C9A84C");
  const [allowedPeriods, setAllowedPeriods] = useState<string[]>(["daily", "weekly", "monthly", "one_off"]);
  const [requiresSpec, setRequiresSpec] = useState(false);

  const PERIOD_OPTIONS = ["daily", "weekly", "monthly", "one_off", "annual"];

  const create = trpc.income.createCategory.useMutation({
    onSuccess: () => {
      toast.success(`Category "${name}" created`);
      onClose();
      setName(""); setDescription(""); setColor("#C9A84C");
      setAllowedPeriods(["daily", "weekly", "monthly", "one_off"]);
      setRequiresSpec(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  function togglePeriod(p: string) {
    setAllowedPeriods(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FolderPlus className="h-5 w-5 text-primary" />New Income Category</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Category Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Parking Rental" className="mt-1" />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description" className="mt-1" />
          </div>
          <div>
            <Label>Colour</Label>
            <div className="flex items-center gap-2 mt-1">
              <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-8 w-12 rounded cursor-pointer border" />
              <span className="text-xs text-muted-foreground">{color}</span>
            </div>
          </div>
          <div>
            <Label className="block mb-1">Allowed Periods</Label>
            <div className="flex flex-wrap gap-2">
              {PERIOD_OPTIONS.map(p => (
                <button key={p} type="button" onClick={() => togglePeriod(p)}
                  className={"px-3 py-1 rounded-md text-xs font-medium border transition-colors " + (allowedPeriods.includes(p) ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border")}>
                  {PERIOD_LABELS[p] ?? p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="requiresSpec" checked={requiresSpec} onChange={e => setRequiresSpec(e.target.checked)} className="h-4 w-4" />
            <Label htmlFor="requiresSpec" className="cursor-pointer">Requires purpose specification (free-text)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => {
            if (!name.trim()) { toast.error("Category name required"); return; }
            if (allowedPeriods.length === 0) { toast.error("Select at least one period"); return; }
            create.mutate({ name: name.trim(), description: description || undefined, color, allowedPeriods: allowedPeriods.join(","), requiresSpecification: requiresSpec });
          }} disabled={create.isPending}>
            {create.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : <><FolderPlus className="h-4 w-4 mr-2" />Create Category</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Per-Category Tab Content ─────────────────────────────────────────────────
function CategoryTab({
  category, allRecords, categories, onDeleted,
}: {
  category: { id: number; name: string; color: string; allowedPeriods?: string | null; requiresSpecification?: boolean | number };
  allRecords: Array<any>;
  categories: Array<any>;
  onDeleted: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const records = useMemo(() => allRecords.filter(r => r.categoryId === category.id), [allRecords, category.id]);
  const total = records.reduce((s: number, r: any) => s + parseFloat(r.amount?.toString() ?? "0"), 0);
  const paid = records.filter((r: any) => r.paymentStatus === "paid").reduce((s: number, r: any) => s + parseFloat(r.amount?.toString() ?? "0"), 0);

  const deleteRecord = trpc.income.delete.useMutation({
    onSuccess: () => { toast.success("Record deleted"); setDeleteId(null); onDeleted(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Category stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-lg font-bold">£{total.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{records.length} records</p>
        </CardContent></Card>
        <Card className="border-green-300"><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="text-lg font-bold text-green-600">£{paid.toFixed(2)}</p>
        </CardContent></Card>
        <Card className="border-amber-300"><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className="text-lg font-bold text-amber-600">£{(total - paid).toFixed(2)}</p>
        </CardContent></Card>
      </div>

      {/* Add button */}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Add {category.name} Record
        </Button>
      </div>

      {/* Records table */}
      <Card>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No records for this category yet.</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />Add First Record
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">Tenant / Payer</th>
                  <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">Period</th>
                  <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">Amount</th>
                  <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">Notes</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {records.map((r: any) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{r.tenantName}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground capitalize">{PERIOD_LABELS[r.period] ?? r.period}</td>
                    <td className="px-4 py-2 font-semibold text-primary">£{parseFloat(r.amount.toString()).toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOURS[r.paymentStatus] ?? "bg-gray-100 text-gray-800"}`}>
                        {r.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      <span className="block text-[10px]">{new Date(r.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground max-w-[120px] truncate">{r.notes ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <AddIncomeDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        categories={categories}
        preselectedCategoryId={category.id}
        onSuccess={() => utils.income.list.invalidate()}
      />

      <DeleteConfirmDialog
        open={deleteId !== null}
        onOpenChange={(v) => { if (!v) setDeleteId(null); }}
        itemLabel="this income record"
        onConfirm={() => deleteId !== null && deleteRecord.mutate({ id: deleteId })}
        loading={deleteRecord.isPending}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Income() {
  const [activeTab, setActiveTab] = useState<string>("");
  const [newCatOpen, setNewCatOpen] = useState(false);

  const { data: categories = [], refetch: refetchCats } = trpc.income.categories.useQuery();
  const { data: records = [], refetch: refetchRecords } = trpc.income.list.useQuery({ limit: 500 });

  // Set default tab to first category once loaded
  const resolvedTab = activeTab || (categories[0]?.id?.toString() ?? "");

  const totalIncome = records.reduce((s, r) => s + parseFloat(r.amount?.toString() ?? "0"), 0);
  const paidIncome = records.filter(r => r.paymentStatus === "paid").reduce((s, r) => s + parseFloat(r.amount?.toString() ?? "0"), 0);
  const pendingIncome = records.filter(r => r.paymentStatus === "pending" || r.paymentStatus === "overdue").reduce((s, r) => s + parseFloat(r.amount?.toString() ?? "0"), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Income & Rentals</h1>
          <p className="page-subtitle">Rental income, grants, and other income sources — organised by category</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setNewCatOpen(true)}>
          <FolderPlus className="h-4 w-4 mr-2" />New Category
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Income</p>
              <p className="text-xl font-bold">£{totalIncome.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted-foreground">{records.length} records across {categories.length} categories</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Paid</p>
              <p className="text-xl font-bold text-green-600">£{paidIncome.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending / Overdue</p>
              <p className="text-xl font-bold text-amber-600">£{pendingIncome.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Category tabs */}
      {categories.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <FolderPlus className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No income categories yet.</p>
          <Button size="sm" className="mt-3" onClick={() => setNewCatOpen(true)}>Create First Category</Button>
        </CardContent></Card>
      ) : (
        <Tabs value={resolvedTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto">
            <TabsList className="h-auto flex-wrap gap-1 min-w-max">
              {categories.map(cat => {
                const count = records.filter(r => r.categoryId === cat.id).length;
                return (
                  <TabsTrigger key={cat.id} value={cat.id.toString()} className="text-xs gap-1">
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color ?? "#C9A84C" }} />
                    {cat.name}
                    {count > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">{count}</Badge>}
                  </TabsTrigger>
                );
              })}
              <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={() => setNewCatOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />New
              </Button>
            </TabsList>
          </div>

          {categories.map(cat => (
            <TabsContent key={cat.id} value={cat.id.toString()} className="mt-4">
              <CategoryTab
                category={cat as any}
                allRecords={records as any[]}
                categories={categories as any[]}
                onDeleted={refetchRecords}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* New Category Dialog */}
      <NewCategoryDialog
        open={newCatOpen}
        onClose={() => setNewCatOpen(false)}
        onSuccess={() => { refetchCats(); }}
      />
    </div>
  );
}
