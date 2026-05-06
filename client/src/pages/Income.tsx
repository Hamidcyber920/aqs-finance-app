import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Building2, TrendingUp, DollarSign, Trash2 } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

const PERIOD_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  one_off: "One-off",
};

export default function Income() {
  const [newOpen, setNewOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryIdFilter, setCategoryIdFilter] = useState<number | undefined>();

  // Form state
  const [selectedCatId, setSelectedCatId] = useState<number | undefined>();
  const [selectedPeriod, setSelectedPeriod] = useState<string>("monthly");
  const [communitySpec, setCommunitySpec] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const { data: categories = [] } = trpc.income.categories.useQuery();
  const { data: records = [], refetch } = trpc.income.list.useQuery({
    categoryId: categoryIdFilter,
    paymentStatus: statusFilter === "all" ? undefined : statusFilter,
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);

  const deleteRecord = trpc.income.delete.useMutation({
    onSuccess: () => { toast.success("Income record deleted"); setDeleteId(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const createRecord = trpc.income.create.useMutation({
    onSuccess: () => {
      toast.success("Income record added");
      setNewOpen(false);
      resetForm();
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setSelectedCatId(undefined);
    setSelectedPeriod("monthly");
    setCommunitySpec("");
    setPayerName("");
    setPayerEmail("");
    setAmount("");
    setReference("");
    setNotes("");
  }

  // Get the selected category object
  const selectedCat = useMemo(
    () => categories.find(c => c.id === selectedCatId),
    [categories, selectedCatId]
  );

  // Derive allowed period tabs from the selected category
  const allowedPeriods: string[] = useMemo(() => {
    if (!selectedCat) return ["daily", "weekly", "monthly", "one_off"];
    const ap = (selectedCat as any).allowedPeriods as string | null;
    if (!ap) return ["daily", "weekly", "monthly", "one_off"];
    return ap.split(",").map((s: string) => s.trim()).filter(Boolean);
  }, [selectedCat]);

  // When category changes, reset period to first allowed
  function handleCatChange(id: number) {
    setSelectedCatId(id);
    const cat = categories.find(c => c.id === id);
    const ap = (cat as any)?.allowedPeriods as string | null;
    const first = ap ? ap.split(",")[0].trim() : "monthly";
    setSelectedPeriod(first);
    setCommunitySpec("");
  }

  const requiresSpec = (selectedCat as any)?.requiresSpecification === true || (selectedCat as any)?.requiresSpecification === 1;

  const totalIncome = records.reduce((s, r) => s + parseFloat(r.amount?.toString() ?? "0"), 0);
  const paidIncome = records.filter(r => r.paymentStatus === "paid").reduce((s, r) => s + parseFloat(r.amount?.toString() ?? "0"), 0);
  const pendingIncome = records.filter(r => r.paymentStatus === "pending" || r.paymentStatus === "overdue").reduce((s, r) => s + parseFloat(r.amount?.toString() ?? "0"), 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCatId) { toast.error("Please select a category"); return; }
    if (!amount) { toast.error("Please enter an amount"); return; }
    if (requiresSpec && !communitySpec.trim()) { toast.error("Please specify the purpose for Community Hire"); return; }
    const description = requiresSpec ? `Community Hire — ${communitySpec.trim()}` : (selectedCat?.name ?? "");
    createRecord.mutate({
      categoryId: selectedCatId,
      description,
      amount,
      period: selectedPeriod as any,
      payerName: payerName || undefined,
      payerEmail: payerEmail || undefined,
      reference: reference || undefined,
      notes: notes || undefined,
    });
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Income & Rentals</h1>
          <p className="page-subtitle">Rental income, grants, and other income sources</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setNewOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Income
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Income</p>
              <p className="text-xl font-bold">£{totalIncome.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
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
              <p className="text-xl font-bold">£{paidIncome.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
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
              <p className="text-xl font-bold">£{pendingIncome.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex gap-2 flex-wrap">
          {["all", "paid", "pending", "overdue", "partial"].map(s => (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)} className="capitalize text-xs">
              {s}
            </Button>
          ))}
        </div>
        {categories.length > 0 && (
          <Select value={categoryIdFilter?.toString() ?? "all"} onValueChange={(v) => setCategoryIdFilter(v === "all" ? undefined : parseInt(v))}>
            <SelectTrigger className="h-8 text-xs w-48"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Tenant / Payer</th>
                <th>Category</th>
                <th>Period</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-10">No income records found</td></tr>
              ) : records.map(r => (
                <tr key={r.id}>
                  <td className="font-medium">{r.tenantName}</td>
                  <td className="text-muted-foreground text-xs">{r.categoryName ?? "—"}</td>
                  <td className="capitalize text-xs">{PERIOD_LABELS[r.period] ?? r.period}</td>
                  <td className="font-semibold text-primary">£{parseFloat(r.amount.toString()).toFixed(2)}</td>
                  <td>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${r.paymentStatus === "paid" ? "badge-approved" : r.paymentStatus === "overdue" ? "badge-rejected" : "badge-pending"}`}>
                      {r.paymentStatus}
                    </span>
                  </td>
                  <td className="text-muted-foreground text-xs max-w-[150px] truncate">{r.notes ?? "—"}</td>
                  <td>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={deleteId !== null}
        onOpenChange={(v) => { if (!v) setDeleteId(null); }}
        itemLabel="this income record"
        onConfirm={() => deleteId !== null && deleteRecord.mutate({ id: deleteId })}
        loading={deleteRecord.isPending}
      />

      {/* Add Income Dialog */}
      <Dialog open={newOpen} onOpenChange={open => { if (!open) { setNewOpen(false); resetForm(); } else setNewOpen(true); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Income Record</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-1">

            {/* Category */}
            <div>
              <Label>Category *</Label>
              <Select value={selectedCatId?.toString() ?? ""} onValueChange={v => handleCatChange(parseInt(v))} required>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Community Hire free-text */}
            {requiresSpec && (
              <div>
                <Label>Specify Purpose *</Label>
                <Input
                  value={communitySpec}
                  onChange={e => setCommunitySpec(e.target.value)}
                  placeholder="e.g. Youth group meeting, sports session…"
                  className="mt-1"
                  required
                />
              </div>
            )}

            {/* Rental Period Tabs — shown only when category is selected */}
            {selectedCatId && allowedPeriods.length > 1 && (
              <div>
                <Label>Rental Period</Label>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {allowedPeriods.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSelectedPeriod(p)}
                      className={
                        "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors " +
                        (selectedPeriod === p
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-muted-foreground border-border hover:bg-muted/80")
                      }
                    >
                      {PERIOD_LABELS[p] ?? p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Payer */}
            <div>
              <Label>Tenant / Payer Name</Label>
              <Input value={payerName} onChange={e => setPayerName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Payer Email</Label>
              <Input type="email" value={payerEmail} onChange={e => setPayerEmail(e.target.value)} className="mt-1" />
            </div>

            {/* Amount */}
            <div>
              <Label>Amount (£) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                className="mt-1"
                placeholder="0.00"
              />
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
              <Button type="button" variant="outline" onClick={() => { setNewOpen(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" disabled={createRecord.isPending}>
                {createRecord.isPending ? "Saving…" : "Add Income Record"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
