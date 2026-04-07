import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, BookOpen, CheckCircle, Clock, XCircle } from "lucide-react";
import { useLocation } from "wouter";

const STATUS_COLORS: Record<string, string> = {
  pending_review: "badge-pending",
  approved: "badge-approved",
  active: "badge-active",
  completed: "badge-completed",
  rejected: "badge-rejected",
  defaulted: "bg-red-200 text-red-900 border border-red-300",
};

export default function Loans() {
  const [newLoanOpen, setNewLoanOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [, setLocation] = useLocation();

  const { data: loans = [], refetch } = trpc.loans.list.useQuery({ status: statusFilter === "all" ? undefined : statusFilter });

  const createLoan = trpc.loans.create.useMutation({
    onSuccess: () => { toast.success("Loan application created"); setNewLoanOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const pending = loans.filter(l => l.status === "pending_review").length;
  const active = loans.filter(l => l.status === "active" || l.status === "approved").length;
  const totalLent = loans.filter(l => l.status === "active" || l.status === "approved" || l.status === "completed").reduce((s, l) => s + parseFloat(l.amount?.toString() ?? "0"), 0);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Qarde Hasan Loans</h1>
          <p className="page-subtitle">Interest-free loan applications and repayments</p>
        </div>
        <Button size="sm" onClick={() => setNewLoanOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Application
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending Review</p>
              <p className="text-xl font-bold">{pending}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Loans</p>
              <p className="text-xl font-bold">{active}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Lent</p>
              <p className="text-xl font-bold">£{totalLent.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", "pending_review", "approved", "active", "completed", "rejected"].map(s => (
          <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)} className="capitalize text-xs">
            {s.replace("_", " ")}
          </Button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Purpose</th>
                <th>Amount</th>
                <th>Term</th>
                <th>Repaid</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loans.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground py-10">No loan applications found</td></tr>
              ) : loans.map(l => (
                <tr key={l.id} className="cursor-pointer" onClick={() => setLocation(`/loans/${l.id}`)}>
                  <td className="font-medium">{l.borrowerName}</td>
                  <td className="text-muted-foreground max-w-[200px] truncate">{l.purpose}</td>
                  <td>£{parseFloat(l.amount?.toString() ?? "0").toFixed(2)}</td>
                  <td>{l.termMonths} months</td>
                  <td>£{parseFloat(l.totalRepaid?.toString() ?? "0").toFixed(2)}</td>
                  <td>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[l.status ?? "pending_review"] ?? "badge-pending"}`}>
                      {(l.status ?? "pending").replace("_", " ")}
                    </span>
                  </td>
                  <td>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setLocation(`/loans/${l.id}`); }}>View</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* New Loan Dialog */}
      <Dialog open={newLoanOpen} onOpenChange={setNewLoanOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Qarde Hasan Application</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            createLoan.mutate({
              applicantName: fd.get("applicantName") as string,
              applicantEmail: fd.get("applicantEmail") as string || undefined,
              applicantPhone: fd.get("applicantPhone") as string || undefined,
              applicantAddress: fd.get("applicantAddress") as string || undefined,
              purpose: fd.get("purpose") as string,
              amount: fd.get("amount") as string,
              repaymentPeriodMonths: parseInt(fd.get("repaymentPeriodMonths") as string),
              monthlyRepayment: fd.get("monthlyRepayment") as string || undefined,
              notes: fd.get("notes") as string || undefined,
            });
          }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Full Name *</Label><Input name="applicantName" required /></div>
              <div><Label>Email</Label><Input name="applicantEmail" type="email" /></div>
              <div><Label>Phone</Label><Input name="applicantPhone" /></div>
              <div className="col-span-2"><Label>Address</Label><Input name="applicantAddress" /></div>
              <div className="col-span-2"><Label>Purpose of Loan *</Label><Textarea name="purpose" rows={2} required /></div>
              <div><Label>Amount (£) *</Label><Input name="amount" type="number" step="0.01" required /></div>
              <div><Label>Term (months) *</Label><Input name="repaymentPeriodMonths" type="number" min="1" required /></div>
              <div><Label>Monthly Repayment (£)</Label><Input name="monthlyRepayment" type="number" step="0.01" /></div>
              <div className="col-span-2"><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
            </div>
            <Button type="submit" className="w-full" disabled={createLoan.isPending}>
              {createLoan.isPending ? "Submitting..." : "Submit Application"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
