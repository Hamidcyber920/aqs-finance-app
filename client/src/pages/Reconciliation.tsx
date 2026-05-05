import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Camera,
  FileText,
  Printer,
  AlertTriangle,
  Clock,
  Building2,
  ChevronDown,
  ChevronUp,
  Lock,
} from "lucide-react";
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

type PaymentRow = {
  id: number;
  type: "payroll" | "loan" | "expense" | "volunteer";
  payee: string;
  amount: string;
  paymentMethod: string;
  paymentStatus: string;
  chequeImageUrl: string | null;
  invoiceUrl: string | null;
  paidAt: Date | null;
  withheldAt: Date | null;
  withheldReason: string | null;
  notes: string | null;
  priority: number;
};

function fmt(val: string | null | undefined) {
  const n = parseFloat(val ?? "0");
  return isNaN(n) ? "£0.00" : `£${n.toFixed(2)}`;
}

function daysUntil25th() {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), 25);
  if (now.getDate() > 25) {
    target.setMonth(target.getMonth() + 1);
  }
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function PaymentSection({
  title,
  icon,
  rows,
  priority,
  isPayroll,
  onMarkPaid,
  onWithhold,
  uploading,
}: {
  title: string;
  icon: React.ReactNode;
  rows: PaymentRow[];
  priority: number;
  isPayroll?: boolean;
  onMarkPaid: (row: PaymentRow) => void;
  onWithhold: (row: PaymentRow) => void;
  uploading: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  if (rows.length === 0) return null;

  const total = rows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
  const paid = rows.filter(r => r.paymentStatus === "paid").reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
  const withheld = rows.filter(r => r.paymentStatus === "withheld").reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-base">{title}</CardTitle>
            {isPayroll && <Badge variant="outline" className="text-xs border-amber-500 text-amber-600"><Lock className="h-3 w-3 mr-1" />Priority 1</Badge>}
            <Badge variant="secondary" className="text-xs">{rows.length} payments</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>Total: <strong>{fmt(total.toFixed(2))}</strong></span>
            <span className="text-green-600">Paid: {fmt(paid.toFixed(2))}</span>
            {withheld > 0 && <span className="text-amber-600">Withheld: {fmt(withheld.toFixed(2))}</span>}
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-2">
            {rows.map(row => (
              <div
                key={`${row.type}-${row.id}`}
                className={`flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border text-sm ${
                  row.paymentStatus === "paid" ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800" :
                  row.paymentStatus === "withheld" ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" :
                  "bg-card border-border"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{row.payee}</span>
                    <Badge variant="outline" className="text-xs capitalize">{row.type}</Badge>
                    {row.paymentMethod && (
                      <Badge variant="secondary" className="text-xs capitalize">{row.paymentMethod.replace("_", " ")}</Badge>
                    )}
                  </div>
                  {row.paymentStatus === "paid" && row.paidAt && (
                    <p className="text-xs text-green-600 mt-0.5">
                      Paid {new Date(row.paidAt).toLocaleString()}
                    </p>
                  )}
                  {row.paymentStatus === "withheld" && row.withheldReason && (
                    <p className="text-xs text-amber-600 mt-0.5">Withheld: {row.withheldReason}</p>
                  )}
                  {row.chequeImageUrl && (
                    <a href={row.chequeImageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline mt-0.5 block">View cheque photo</a>
                  )}
                  {row.invoiceUrl && (
                    <a href={row.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline mt-0.5 block">View invoice</a>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-semibold text-base">{fmt(row.amount)}</span>
                  {row.paymentStatus === "paid" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : row.paymentStatus === "withheld" ? (
                    <Button size="sm" variant="outline" className="text-green-600 border-green-500 h-7 text-xs" onClick={() => onMarkPaid(row)} disabled={uploading}>
                      <PlayCircle className="h-3 w-3 mr-1" />Pay Now
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => onMarkPaid(row)} disabled={uploading}>
                        <CheckCircle2 className="h-3 w-3 mr-1" />Pay
                      </Button>
                      {!isPayroll && (
                        <Button size="sm" variant="outline" className="h-7 text-xs text-amber-600 border-amber-400" onClick={() => onWithhold(row)} disabled={uploading}>
                          <PauseCircle className="h-3 w-3 mr-1" />Withhold
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function Reconciliation() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [bankBalanceInput, setBankBalanceInput] = useState("");
  const [savingBalance, setSavingBalance] = useState(false);

  // Pay dialog
  const [payDialog, setPayDialog] = useState<{ row: PaymentRow } | null>(null);
  const [chequeFile, setChequeFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const chequeRef = useRef<HTMLInputElement>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);

  // Withhold dialog
  const [withholdDialog, setWithholdDialog] = useState<{ row: PaymentRow } | null>(null);
  const [withholdReason, setWithholdReason] = useState("");

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.reconciliation.allPayments.useQuery(
    { month, year },
    { refetchOnWindowFocus: false }
  );

  const getOrCreate = trpc.reconciliation.getOrCreate.useMutation({
    onSuccess: () => utils.reconciliation.allPayments.invalidate(),
  });

  const updateBankBalance = trpc.reconciliation.updateBankBalance.useMutation({
    onSuccess: () => {
      utils.reconciliation.allPayments.invalidate();
      toast.success("Bank balance saved");
      setSavingBalance(false);
    },
  });

  const markPaid = trpc.reconciliation.markPaid.useMutation({
    onSuccess: () => {
      utils.reconciliation.allPayments.invalidate();
      toast.success("Payment marked as paid");
      setPayDialog(null);
      setChequeFile(null);
      setInvoiceFile(null);
    },
  });

  const withholdPayment = trpc.reconciliation.withholdPayment.useMutation({
    onSuccess: () => {
      utils.reconciliation.allPayments.invalidate();
      toast.success("Payment withheld");
      setWithholdDialog(null);
      setWithholdReason("");
    },
  });

  const finalise = trpc.reconciliation.finalise.useMutation({
    onSuccess: () => {
      utils.reconciliation.allPayments.invalidate();
      toast.success("Reconciliation finalised");
    },
  });

  // Ensure session exists when month/year changes
  const handleMonthChange = (m: number, y: number) => {
    setMonth(m);
    setYear(y);
    getOrCreate.mutate({ month: m, year: y });
  };

  const session = data?.session;
  const bankBalance = parseFloat(session?.bankBalance ?? "0");

  const allRows: PaymentRow[] = useMemo(() => [
    ...(data?.payroll ?? []).map(r => ({ ...r, type: "payroll" as const, priority: 1 })),
    ...(data?.loans ?? []).map(r => ({ ...r, type: "loan" as const, priority: 2 })),
    ...(data?.expenses ?? []).map(r => ({ ...r, type: "expense" as const, priority: 3 })),
    ...(data?.volunteers ?? []).map(r => ({ ...r, type: "volunteer" as const, priority: 4 })),
  ], [data]);

  const totalCommitted = allRows.filter(r => r.paymentStatus === "pending").reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
  const totalPaid = allRows.filter(r => r.paymentStatus === "paid").reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
  const totalWithheld = allRows.filter(r => r.paymentStatus === "withheld").reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
  const remaining = bankBalance - totalPaid - totalCommitted;

  const days25 = daysUntil25th();
  const isOverdue = days25 <= 0;
  const isWarning = days25 <= 5 && days25 > 0;

  const handleSaveBalance = async () => {
    if (!bankBalanceInput) return;
    setSavingBalance(true);
    // Ensure session exists first
    await getOrCreate.mutateAsync({ month, year });
    updateBankBalance.mutate({ month, year, bankBalance: bankBalanceInput });
  };

  const handleMarkPaid = async () => {
    if (!payDialog) return;
    setUploading(true);
    try {
      let chequeUrl: string | undefined;
      let invoiceUrl: string | undefined;

      if (chequeFile) {
        const buf = await chequeFile.arrayBuffer();
        const res = await fetch("/api/storage/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: `reconciliation/cheques/${Date.now()}-${chequeFile.name}`,
            contentType: chequeFile.type,
          }),
        });
        if (res.ok) {
          const { uploadUrl, publicUrl } = await res.json();
          await fetch(uploadUrl, { method: "PUT", body: chequeFile, headers: { "Content-Type": chequeFile.type } });
          chequeUrl = publicUrl;
        }
      }
      if (invoiceFile) {
        const res = await fetch("/api/storage/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: `reconciliation/invoices/${Date.now()}-${invoiceFile.name}`,
            contentType: invoiceFile.type,
          }),
        });
        if (res.ok) {
          const { uploadUrl, publicUrl } = await res.json();
          await fetch(uploadUrl, { method: "PUT", body: invoiceFile, headers: { "Content-Type": invoiceFile.type } });
          invoiceUrl = publicUrl;
        }
      }

      markPaid.mutate({
        type: payDialog.row.type,
        id: payDialog.row.id,
        chequeImageUrl: chequeUrl,
        invoiceUrl,
      });
    } catch (e) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const printSummary = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reconciliation ${MONTHS[month-1]} ${year}</title>
<style>
body{font-family:Arial,sans-serif;padding:24px;color:#111}
h1{color:#1a4731;font-size:22px}
h2{color:#1a4731;font-size:16px;margin-top:20px;border-bottom:2px solid #1a4731;padding-bottom:4px}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
th{background:#1a4731;color:#fff;padding:6px 8px;text-align:left}
td{padding:5px 8px;border-bottom:1px solid #eee}
.paid{color:#16a34a}.withheld{color:#d97706}.pending{color:#6b7280}
.summary-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px}
.balance{font-size:20px;font-weight:bold;color:${remaining < 0 ? '#dc2626' : '#16a34a'}}
</style></head><body>
<h1>Abdullah Quilliam Society</h1>
<p style="color:#888;margin-top:-8px">Month-End Reconciliation &mdash; ${MONTHS[month-1]} ${year}</p>
<div class="summary-box">
  <table style="border:none"><tr>
    <td><strong>Opening Bank Balance</strong></td><td style="text-align:right">${fmt(bankBalance.toFixed(2))}</td>
    <td><strong>Total Paid Out</strong></td><td style="text-align:right" class="paid">${fmt(totalPaid.toFixed(2))}</td>
  </tr><tr>
    <td><strong>Committed (Pending)</strong></td><td style="text-align:right" class="pending">${fmt(totalCommitted.toFixed(2))}</td>
    <td><strong>Withheld</strong></td><td style="text-align:right" class="withheld">${fmt(totalWithheld.toFixed(2))}</td>
  </tr><tr>
    <td colspan="2"></td>
    <td><strong>Remaining Balance</strong></td><td style="text-align:right" class="balance">${fmt(remaining.toFixed(2))}</td>
  </tr></table>
</div>
${[
  { title: "Priority 1 — Staff Payroll", rows: data?.payroll ?? [] },
  { title: "Priority 2 — Qarde Hasan Loan Repayments", rows: data?.loans ?? [] },
  { title: "Priority 3 — Supplier Expenses", rows: data?.expenses ?? [] },
  { title: "Priority 4 — Volunteer Payments", rows: data?.volunteers ?? [] },
].filter(s => s.rows.length > 0).map(s => `
<h2>${s.title}</h2>
<table><tr><th>Payee</th><th>Amount</th><th>Method</th><th>Status</th><th>Paid At</th></tr>
${s.rows.map(r => `<tr>
  <td>${r.payee}</td>
  <td>${fmt(r.amount)}</td>
  <td>${(r.paymentMethod ?? "").replace("_"," ")}</td>
  <td class="${r.paymentStatus}">${r.paymentStatus}</td>
  <td>${r.paidAt ? new Date(r.paidAt).toLocaleDateString() : "—"}</td>
</tr>`).join("")}
</table>`).join("")}
<p style="margin-top:32px;font-size:11px;color:#888">Printed ${new Date().toLocaleString()} &bull; Abdullah Quilliam Society Finance System</p>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Month-End Reconciliation
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage all outgoing payments and balance against your bank account
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={v => handleMonthChange(Number(v), year)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => handleMonthChange(month, Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={printSummary}>
            <Printer className="h-4 w-4 mr-1" />Print
          </Button>
        </div>
      </div>

      {/* 25th deadline indicator */}
      <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 text-sm font-medium ${
        isOverdue ? "bg-red-100 text-red-700 border border-red-300 dark:bg-red-950/30 dark:border-red-700" :
        isWarning ? "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-700" :
        "bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/20 dark:border-green-800"
      }`}>
        {isOverdue ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
        {isOverdue
          ? "Payment deadline (25th) has passed — ensure all payroll cheques have been issued"
          : isWarning
          ? `${days25} day${days25 === 1 ? "" : "s"} until the 25th payment deadline — issue cheques soon`
          : `${days25} days until the 25th — all payroll cheques should be issued by then`}
      </div>

      {/* Bank balance + summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Bank Balance</p>
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold">{fmt(bankBalance.toFixed(2))}</span>
            </div>
            <div className="flex gap-1 mt-2">
              <Input
                placeholder="Enter balance"
                value={bankBalanceInput}
                onChange={e => setBankBalanceInput(e.target.value)}
                className="h-7 text-xs"
              />
              <Button size="sm" className="h-7 text-xs px-2" onClick={handleSaveBalance} disabled={savingBalance || !bankBalanceInput}>
                Set
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Total Paid</p>
            <p className="text-lg font-bold text-green-600">{fmt(totalPaid.toFixed(2))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Committed</p>
            <p className="text-lg font-bold text-muted-foreground">{fmt(totalCommitted.toFixed(2))}</p>
          </CardContent>
        </Card>
        <Card className={remaining < 0 ? "border-red-400" : ""}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Remaining</p>
            <p className={`text-lg font-bold ${remaining < 0 ? "text-red-600" : "text-primary"}`}>
              {fmt(remaining.toFixed(2))}
            </p>
            {remaining < 0 && <p className="text-xs text-red-500 mt-0.5">Overdrawn — withhold non-priority payments</p>}
          </CardContent>
        </Card>
      </div>

      {/* Payment sections */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading payments…</div>
      ) : (
        <>
          <PaymentSection
            title="Staff Payroll"
            icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
            rows={(data?.payroll ?? []).map(r => ({ ...r, type: "payroll" as const, priority: 1 }))}
            priority={1}
            isPayroll
            onMarkPaid={row => setPayDialog({ row })}
            onWithhold={() => {}}
            uploading={uploading}
          />
          <PaymentSection
            title="Qarde Hasan Loan Repayments"
            icon={<FileText className="h-4 w-4 text-blue-600" />}
            rows={(data?.loans ?? []).map(r => ({ ...r, type: "loan" as const, priority: 2 }))}
            priority={2}
            onMarkPaid={row => setPayDialog({ row })}
            onWithhold={row => { setWithholdDialog({ row }); setWithholdReason(""); }}
            uploading={uploading}
          />
          <PaymentSection
            title="Supplier Expenses & Invoices"
            icon={<FileText className="h-4 w-4 text-purple-600" />}
            rows={(data?.expenses ?? []).map(r => ({ ...r, type: "expense" as const, priority: 3 }))}
            priority={3}
            onMarkPaid={row => setPayDialog({ row })}
            onWithhold={row => { setWithholdDialog({ row }); setWithholdReason(""); }}
            uploading={uploading}
          />
          <PaymentSection
            title="Volunteer Payments"
            icon={<CheckCircle2 className="h-4 w-4 text-orange-500" />}
            rows={(data?.volunteers ?? []).map(r => ({ ...r, type: "volunteer" as const, priority: 4 }))}
            priority={4}
            onMarkPaid={row => setPayDialog({ row })}
            onWithhold={row => { setWithholdDialog({ row }); setWithholdReason(""); }}
            uploading={uploading}
          />
          {allRows.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No payments for {MONTHS[month-1]} {year}</p>
              <p className="text-sm mt-1">Add payroll, expenses, or volunteer payments to see them here</p>
            </div>
          )}

          {/* Finalise button */}
          {allRows.length > 0 && session?.status !== "finalised" && (
            <div className="mt-6 flex justify-end">
              <Button
                variant="outline"
                className="border-green-500 text-green-700"
                onClick={() => finalise.mutate({ month, year })}
                disabled={finalise.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Finalise Reconciliation
              </Button>
            </div>
          )}
          {session?.status === "finalised" && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Reconciliation finalised {session.finalisedAt ? `on ${new Date(session.finalisedAt).toLocaleDateString()}` : ""}
            </div>
          )}
        </>
      )}

      {/* Pay dialog */}
      <Dialog open={!!payDialog} onOpenChange={open => { if (!open) { setPayDialog(null); setChequeFile(null); setInvoiceFile(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Paid — {payDialog?.row.payee}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted rounded-lg p-3 flex justify-between text-sm">
              <span>Amount</span>
              <span className="font-bold text-base">{fmt(payDialog?.row.amount)}</span>
            </div>

            {/* Cheque photo */}
            <div>
              <p className="text-sm font-medium mb-1 flex items-center gap-1"><Camera className="h-4 w-4" />Cheque Photo (optional)</p>
              <input ref={chequeRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setChequeFile(e.target.files?.[0] ?? null)} />
              {chequeFile ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="truncate">{chequeFile.name}</span>
                  <button className="text-destructive text-xs" onClick={() => setChequeFile(null)}>Remove</button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full" onClick={() => chequeRef.current?.click()}>
                  <Camera className="h-4 w-4 mr-2" />Take / Upload Cheque Photo
                </Button>
              )}
            </div>

            {/* Invoice photo */}
            <div>
              <p className="text-sm font-medium mb-1 flex items-center gap-1"><FileText className="h-4 w-4" />Invoice / Receipt (optional)</p>
              <input ref={invoiceRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setInvoiceFile(e.target.files?.[0] ?? null)} />
              {invoiceFile ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="truncate">{invoiceFile.name}</span>
                  <button className="text-destructive text-xs" onClick={() => setInvoiceFile(null)}>Remove</button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full" onClick={() => invoiceRef.current?.click()}>
                  <FileText className="h-4 w-4 mr-2" />Upload Invoice / Receipt
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPayDialog(null); setChequeFile(null); setInvoiceFile(null); }}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleMarkPaid} disabled={uploading || markPaid.isPending}>
              {uploading || markPaid.isPending ? "Saving…" : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withhold dialog */}
      <Dialog open={!!withholdDialog} onOpenChange={open => { if (!open) setWithholdDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withhold Payment — {withholdDialog?.row.payee}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-muted rounded-lg p-3 flex justify-between text-sm">
              <span>Amount</span>
              <span className="font-bold">{fmt(withholdDialog?.row.amount)}</span>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Reason for withholding</p>
              <Textarea
                placeholder="e.g. Awaiting better bank balance, invoice query, pending approval…"
                value={withholdReason}
                onChange={e => setWithholdReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithholdDialog(null)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => {
              if (!withholdDialog) return;
              withholdPayment.mutate({ type: withholdDialog.row.type as any, id: withholdDialog.row.id, reason: withholdReason });
            }} disabled={withholdPayment.isPending}>
              <PauseCircle className="h-4 w-4 mr-2" />Withhold Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
