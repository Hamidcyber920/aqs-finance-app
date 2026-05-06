import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, BookOpen, CheckCircle, Clock, XCircle, TrendingUp,
  CalendarDays, AlertCircle, Users, LayoutDashboard, List,
} from "lucide-react";
import { useLocation } from "wouter";
import { SmartUpload, type SmartUploadResult } from "@/components/SmartUpload";

// ─── Loan purpose presets ────────────────────────────────────────────────────

const LOAN_PURPOSE_PRESETS = [
  "Rimmers Purchase",
  "Refurbishment",
  "Building Maintenance",
  "Equipment Purchase",
  "Emergency Repairs",
  "Event Costs",
  "Other (specify below)",
];

const STATUS_COLORS: Record<string, string> = {
  pending_review: "badge-pending",
  approved: "badge-approved",
  active: "badge-active",
  completed: "badge-completed",
  rejected: "badge-rejected",
  defaulted: "bg-red-200 text-red-900 border border-red-300",
  draft: "bg-gray-100 text-gray-700 border border-gray-200",
};

// ─── Repayment schedule helper ────────────────────────────────────────────────

function buildRepaymentSchedule(amount: number, termMonths: number, startDate: Date) {
  const monthly = amount / termMonths;
  return Array.from({ length: termMonths }, (_, i) => {
    const due = new Date(startDate);
    due.setMonth(due.getMonth() + i + 1);
    return { month: i + 1, dueDate: due, amount: monthly };
  });
}

/** Format a loan's term for display, preferring termValue+termUnit if available */
function formatTerm(loan: { termMonths?: number | null; termValue?: number | null; termUnit?: string | null }) {
  if (loan.termValue && loan.termUnit) {
    return `${loan.termValue} ${loan.termUnit}`;
  }
  if (loan.termMonths) {
    return `${loan.termMonths} months`;
  }
  return "—";
}

export default function Loans() {
  const [view, setView] = useState<"dashboard" | "list">("dashboard");
  const [newLoanOpen, setNewLoanOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [purposePreset, setPurposePreset] = useState<string>("");
  const [customPurpose, setCustomPurpose] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [termValue, setTermValue] = useState<string>("6");
  const [termUnit, setTermUnit] = useState<"months" | "years">("months");
  const [termNotes, setTermNotes] = useState("");
  const [, setLocation] = useLocation();

  function handleSmartLoanConfirm(result: SmartUploadResult) {
    const d = result.extractedData;
    if (d.amountRequested != null) setLoanAmount(String(d.amountRequested));
    if (d.purpose) {
      setPurposePreset("Other (specify below)");
      setCustomPurpose(d.purpose as string);
    }
    if (d.repaymentTerm != null) setTermValue(String(d.repaymentTerm));
    setNewLoanOpen(true);
  }

  const { data: loans = [], refetch } = trpc.loans.list.useQuery(
    { status: statusFilter === "all" ? undefined : statusFilter }
  );

  const createLoan = trpc.loans.create.useMutation({
    onSuccess: () => {
      toast.success("Loan application created");
      setNewLoanOpen(false);
      setPurposePreset("");
      setCustomPurpose("");
      setLoanAmount("");
      setTermValue("6");
      setTermUnit("months");
      setTermNotes("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Stats ────────────────────────────────────────────────────────────────

  const pending = loans.filter(l => l.status === "pending_review").length;
  const active = loans.filter(l => l.status === "active" || l.status === "approved").length;
  const totalReceived = loans
    .filter(l => ["active", "approved", "completed"].includes(l.status ?? ""))
    .reduce((s, l) => s + parseFloat(l.amount?.toString() ?? "0"), 0);
  const totalRepaid = loans
    .reduce((s, l) => s + parseFloat(l.totalRepaid?.toString() ?? "0"), 0);
  const totalOutstanding = Math.max(0, totalReceived - totalRepaid);

  // Loans due for repayment this month
  const now = new Date();
  const dueThisMonth = loans.filter(l => {
    if (!["active", "approved"].includes(l.status ?? "")) return false;
    const start = l.startDate ? new Date(l.startDate) : new Date(l.createdAt);
    const term = l.termMonths ?? 6;
    const end = new Date(start);
    end.setMonth(end.getMonth() + term);
    return end.getFullYear() === now.getFullYear() && end.getMonth() === now.getMonth();
  });

  // ─── Active loans sorted by next repayment due ────────────────────────────

  const activeLoans = useMemo(() =>
    loans
      .filter(l => ["active", "approved", "pending_review"].includes(l.status ?? ""))
      .map(l => {
        const start = l.startDate ? new Date(l.startDate) : new Date(l.createdAt);
        const term = l.termMonths ?? 6;
        const end = new Date(start);
        end.setMonth(end.getMonth() + term);
        const amount = parseFloat(l.amount?.toString() ?? "0");
        const repaid = parseFloat(l.totalRepaid?.toString() ?? "0");
        const remaining = Math.max(0, amount - repaid);
        const progressPct = amount > 0 ? Math.min(100, (repaid / amount) * 100) : 0;
        return { ...l, endDate: end, remaining, progressPct };
      })
      .sort((a, b) => a.endDate.getTime() - b.endDate.getTime()),
    [loans]
  );

  // ─── Computed monthly repayment (based on termValue + termUnit) ───────────

  const computedTermMonths = useMemo(() => {
    const tv = parseInt(termValue, 10);
    if (!tv || isNaN(tv) || tv <= 0) return 0;
    return termUnit === "years" ? tv * 12 : tv;
  }, [termValue, termUnit]);

  const computedMonthly = useMemo(() => {
    const amt = parseFloat(loanAmount);
    if (!amt || isNaN(amt) || computedTermMonths <= 0) return "";
    return (amt / computedTermMonths).toFixed(2);
  }, [loanAmount, computedTermMonths]);

  // ─── Purpose value ────────────────────────────────────────────────────────

  const finalPurpose = purposePreset === "Other (specify below)" ? customPurpose : purposePreset;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Qarde Hasan Loans</h1>
          <p className="page-subtitle">Worshippers lending to the mosque — interest-free</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={view === "dashboard" ? "default" : "outline"}
            onClick={() => setView("dashboard")}
          >
            <LayoutDashboard className="h-4 w-4 mr-1" /> Dashboard
          </Button>
          <Button
            size="sm"
            variant={view === "list" ? "default" : "outline"}
            onClick={() => setView("list")}
          >
            <List className="h-4 w-4 mr-1" /> All Loans
          </Button>
          <SmartUpload
            moduleType="loan_application"
            onConfirm={handleSmartLoanConfirm}
            buttonLabel="Import Application"
            buttonVariant="outline"
          />
          <Button size="sm" onClick={() => setNewLoanOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Application
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-amber-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-xl font-bold">{pending}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4 text-green-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-xl font-bold">{active}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Received</p>
              <p className="text-xl font-bold">£{totalReceived.toLocaleString("en-GB", { minimumFractionDigits: 0 })}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
              <TrendingUp className="h-4 w-4 text-red-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="text-xl font-bold">£{totalOutstanding.toLocaleString("en-GB", { minimumFractionDigits: 0 })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── DASHBOARD VIEW ── */}
      {view === "dashboard" && (
        <div className="space-y-6">
          {/* Due this month alert */}
          {dueThisMonth.length > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800 text-sm">
                  {dueThisMonth.length} loan{dueThisMonth.length > 1 ? "s" : ""} due for final repayment this month
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {dueThisMonth.map(l => l.borrowerName).join(", ")}
                </p>
              </div>
            </div>
          )}

          {/* Active loan cards */}
          {activeLoans.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No active loans</p>
                <p className="text-sm mt-1">Click "New Application" to record a worshipper loan</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeLoans.map(l => {
                const amount = parseFloat(l.amount?.toString() ?? "0");
                const monthly = l.monthlyRepayment ? parseFloat(l.monthlyRepayment.toString()) : amount / (l.termMonths ?? 6);
                const schedule = buildRepaymentSchedule(amount, l.termMonths ?? 6, l.startDate ? new Date(l.startDate) : new Date(l.createdAt));
                const nextDue = schedule.find(s => s.dueDate > now);
                const isOverdue = l.endDate < now && l.remaining > 0;

                return (
                  <Card
                    key={l.id}
                    className={`cursor-pointer hover:shadow-md transition-shadow ${isOverdue ? "border-red-300" : ""}`}
                    onClick={() => setLocation(`/loans/${l.id}`)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-sm font-semibold">{l.borrowerName}</CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{l.purpose}</p>
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${STATUS_COLORS[l.status ?? "draft"]}`}>
                          {(l.status ?? "draft").replace(/_/g, " ")}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Amount + repayment */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-muted/50 rounded p-2">
                          <p className="text-xs text-muted-foreground">Lent</p>
                          <p className="font-bold text-sm">£{amount.toFixed(0)}</p>
                        </div>
                        <div className="bg-muted/50 rounded p-2">
                          <p className="text-xs text-muted-foreground">Repaid</p>
                          <p className="font-bold text-sm text-green-700">£{parseFloat(l.totalRepaid?.toString() ?? "0").toFixed(0)}</p>
                        </div>
                        <div className="bg-muted/50 rounded p-2">
                          <p className="text-xs text-muted-foreground">Owed</p>
                          <p className={`font-bold text-sm ${isOverdue ? "text-red-600" : ""}`}>£{l.remaining.toFixed(0)}</p>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Repayment progress</span>
                          <span>{l.progressPct.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${isOverdue ? "bg-red-500" : "bg-primary"}`}
                            style={{ width: `${l.progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Next payment due */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <CalendarDays className="h-3 w-3" />
                          {nextDue ? (
                            <span>
                              Next: <strong>{nextDue.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</strong>
                              {" "}(£{nextDue.amount.toFixed(2)}/mo)
                            </span>
                          ) : isOverdue ? (
                            <span className="text-red-600 font-medium">Overdue — please follow up</span>
                          ) : (
                            <span>All repayments complete</span>
                          )}
                        </div>
                        <span className="text-muted-foreground">{formatTerm(l)}</span>
                      </div>

                      {/* Term notes if present */}
                      {(l as any).termNotes && (
                        <p className="text-xs text-muted-foreground italic border-t pt-2">
                          Note: {(l as any).termNotes}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Completed loans summary */}
          {loans.filter(l => l.status === "completed").length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" /> Completed Loans
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full data-table">
                  <thead>
                    <tr>
                      <th>Lender</th>
                      <th>Purpose</th>
                      <th>Amount</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.filter(l => l.status === "completed").map(l => (
                      <tr key={l.id} className="cursor-pointer" onClick={() => setLocation(`/loans/${l.id}`)}>
                        <td className="font-medium">{l.borrowerName}</td>
                        <td className="text-muted-foreground text-xs max-w-[160px] truncate">{l.purpose}</td>
                        <td>£{parseFloat(l.amount?.toString() ?? "0").toFixed(2)}</td>
                        <td className="text-xs text-muted-foreground">
                          {l.lastRepaymentDate ? new Date(l.lastRepaymentDate).toLocaleDateString("en-GB") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === "list" && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            {["all", "pending_review", "approved", "active", "completed", "rejected"].map(s => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                onClick={() => setStatusFilter(s)}
                className="capitalize text-xs"
              >
                {s.replace(/_/g, " ")}
              </Button>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full data-table">
                <thead>
                  <tr>
                    <th>Lender</th>
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
                    <tr>
                      <td colSpan={7} className="text-center text-muted-foreground py-10">
                        No loan applications found
                      </td>
                    </tr>
                  ) : loans.map(l => (
                    <tr key={l.id} className="cursor-pointer" onClick={() => setLocation(`/loans/${l.id}`)}>
                      <td className="font-medium">{l.borrowerName}</td>
                      <td className="text-muted-foreground max-w-[200px] truncate">{l.purpose}</td>
                      <td>£{parseFloat(l.amount?.toString() ?? "0").toFixed(2)}</td>
                      <td>{formatTerm(l)}</td>
                      <td>£{parseFloat(l.totalRepaid?.toString() ?? "0").toFixed(2)}</td>
                      <td>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[l.status ?? "pending_review"] ?? "badge-pending"}`}>
                          {(l.status ?? "pending").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); setLocation(`/loans/${l.id}`); }}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── NEW LOAN DIALOG ── */}
      <Dialog open={newLoanOpen} onOpenChange={setNewLoanOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Qarde Hasan Application</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Record a worshipper who is lending money to the mosque (interest-free).
            </p>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const purpose = purposePreset === "Other (specify below)"
                ? customPurpose
                : purposePreset;
              const amount = fd.get("amount") as string;
              const tv = parseInt(termValue, 10) || 6;
              const termMonthsCalc = termUnit === "years" ? tv * 12 : tv;
              const monthly = (parseFloat(amount) / termMonthsCalc).toFixed(2);
              createLoan.mutate({
                applicantName: fd.get("applicantName") as string,
                applicantEmail: fd.get("applicantEmail") as string || undefined,
                applicantPhone: fd.get("applicantPhone") as string || undefined,
                applicantAddress: fd.get("applicantAddress") as string || undefined,
                purpose,
                amount,
                termValue: tv,
                termUnit,
                termNotes: termNotes || undefined,
                monthlyRepayment: monthly,
                notes: fd.get("notes") as string || undefined,
              });
            }}
            className="space-y-4 mt-2"
          >
            {/* Lender details */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lender (Worshipper) Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Full Name *</Label>
                  <Input name="applicantName" required placeholder="e.g. Ahmed Hassan" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input name="applicantEmail" type="email" placeholder="email@example.com" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input name="applicantPhone" placeholder="07..." />
                </div>
                <div className="col-span-2">
                  <Label>Address</Label>
                  <Input name="applicantAddress" placeholder="Street, City, Postcode" />
                </div>
              </div>
            </div>

            {/* Loan details */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Loan Details</p>

              {/* Purpose dropdown */}
              <div>
                <Label>Purpose *</Label>
                <Select value={purposePreset} onValueChange={setPurposePreset} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select purpose..." />
                  </SelectTrigger>
                  <SelectContent>
                    {LOAN_PURPOSE_PRESETS.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Free text if "Other" */}
              {purposePreset === "Other (specify below)" && (
                <div>
                  <Label>Describe Purpose *</Label>
                  <Textarea
                    value={customPurpose}
                    onChange={(e) => setCustomPurpose(e.target.value)}
                    rows={2}
                    placeholder="Describe the specific purpose..."
                    required
                  />
                </div>
              )}

              {/* Amount */}
              <div>
                <Label>Amount Lent (£) *</Label>
                <Input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              {/* Repayment term: number + months/years toggle */}
              <div>
                <Label>Repayment Term *</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="number"
                    min="1"
                    max="120"
                    value={termValue}
                    onChange={(e) => setTermValue(e.target.value)}
                    className="w-24"
                    placeholder="6"
                    required
                  />
                  {/* Months / Years toggle */}
                  <div className="flex rounded-md border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setTermUnit("months")}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                        termUnit === "months"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      Months
                    </button>
                    <button
                      type="button"
                      onClick={() => setTermUnit("years")}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors border-l ${
                        termUnit === "years"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      Years
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {computedTermMonths > 0 ? `= ${computedTermMonths} months total` : ""}
                </p>
              </div>

              {/* Term notes */}
              <div>
                <Label>Repayment Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea
                  value={termNotes}
                  onChange={(e) => setTermNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Repayment to start after Ramadan, or flexible schedule agreed..."
                />
              </div>

              {/* Monthly repayment preview */}
              {computedMonthly && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Monthly repayment (auto-calculated)</p>
                  <p className="text-lg font-bold text-primary">£{computedMonthly} / month</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {computedTermMonths} equal payments of £{computedMonthly} over {termValue} {termUnit}
                  </p>
                </div>
              )}

              <div>
                <Label>Notes</Label>
                <Textarea name="notes" rows={2} placeholder="Any additional notes..." />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={createLoan.isPending || !purposePreset || (purposePreset === "Other (specify below)" && !customPurpose)}
            >
              {createLoan.isPending ? "Submitting..." : "Submit Application"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
