import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Building2, TrendingUp, DollarSign } from "lucide-react";

export default function Income() {
  const [newOpen, setNewOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryId, setCategoryId] = useState<number | undefined>();

  const { data: categories = [] } = trpc.income.categories.useQuery();
  const { data: records = [], refetch } = trpc.income.list.useQuery({
    categoryId,
    paymentStatus: statusFilter === "all" ? undefined : statusFilter,
  });

  const createRecord = trpc.income.create.useMutation({
    onSuccess: () => { toast.success("Income record added"); setNewOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const totalIncome = records.reduce((s, r) => s + parseFloat(r.amount?.toString() ?? "0"), 0);
  const paidIncome = records.filter(r => r.paymentStatus === "paid").reduce((s, r) => s + parseFloat(r.amount?.toString() ?? "0"), 0);
  const pendingIncome = records.filter(r => r.paymentStatus === "pending" || r.paymentStatus === "overdue").reduce((s, r) => s + parseFloat(r.amount?.toString() ?? "0"), 0);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Income & Rentals</h1>
          <p className="page-subtitle">Rental income, grants, and other income sources</p>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)}>
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
        <div className="flex gap-2">
          {["all", "paid", "pending", "overdue", "partial"].map(s => (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)} className="capitalize text-xs">
              {s}
            </Button>
          ))}
        </div>
        {categories.length > 0 && (
          <Select value={categoryId?.toString() ?? "all"} onValueChange={(v) => setCategoryId(v === "all" ? undefined : parseInt(v))}>
            <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="All categories" /></SelectTrigger>
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
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-10">No income records found</td></tr>
              ) : records.map(r => (
                <tr key={r.id}>
                  <td className="font-medium">{r.tenantName}</td>
                  <td className="text-muted-foreground text-xs">{r.categoryName ?? "—"}</td>
                  <td className="capitalize text-xs">{r.period}</td>
                  <td className="font-semibold text-primary">£{parseFloat(r.amount.toString()).toFixed(2)}</td>
                  <td>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${r.paymentStatus === "paid" ? "badge-approved" : r.paymentStatus === "overdue" ? "badge-rejected" : "badge-pending"}`}>
                      {r.paymentStatus}
                    </span>
                  </td>
                  <td className="text-muted-foreground text-xs max-w-[150px] truncate">{r.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Add Income Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Income Record</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const catId = parseInt(fd.get("categoryId") as string);
            createRecord.mutate({
              categoryId: catId,
              description: fd.get("description") as string,
              amount: fd.get("amount") as string,
              payerName: fd.get("payerName") as string || undefined,
              payerEmail: fd.get("payerEmail") as string || undefined,
              reference: fd.get("reference") as string || undefined,
              notes: fd.get("notes") as string || undefined,
            });
          }} className="space-y-4">
            <div>
              <Label>Category *</Label>
              <Select name="categoryId" required>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Description *</Label><Input name="description" required placeholder="e.g. Room hire — Community Centre" /></div>
            <div><Label>Tenant / Payer Name</Label><Input name="payerName" /></div>
            <div><Label>Payer Email</Label><Input name="payerEmail" type="email" /></div>
            <div><Label>Amount (£) *</Label><Input name="amount" type="number" step="0.01" required /></div>
            <div><Label>Reference</Label><Input name="reference" placeholder="Invoice / transaction ref" /></div>
            <div><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
            <Button type="submit" className="w-full" disabled={createRecord.isPending}>
              {createRecord.isPending ? "Saving..." : "Add Income Record"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
