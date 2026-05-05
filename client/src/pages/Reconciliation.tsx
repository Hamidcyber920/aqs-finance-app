import { useState, useRef, useMemo } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  TrendingUp,
  TrendingDown,
  Scale,
  Banknote,
  CreditCard,
  ArrowRightLeft,
  History,
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
  paymentMethod: string | null;
  paymentStatus: string | null;
  chequeImageUrl: string | null;
  invoiceUrl: string | null;
  paidAt: Date | null;
  withheldAt: Date | null;
  withheldReason: string | null;
  notes: string | null;
  carriedFrom: { month: number; year: number } | null;
};

function fmt(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return isNaN(n) ? "£0.00" : `£${n.toFixed(2)}`;
}

function daysUntil25th() {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), 25);
  if (now.getDate() > 25) target.setMonth(target.getMonth() + 1);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function methodLabel(m: string | null) {
  if (!m) return "Unspecified";
  return { cash: "Cash", cheque: "Cheque", bank_transfer: "Bank Transfer", card: "Card", online: "Online" }[m] ?? m;
}

function methodIcon(m: string | null) {
  if (m === "cash") return <Banknote className="h-3 w-3" />;
  if (m === "cheque") return <FileText className="h-3 w-3" />;
  if (m === "bank_transfer") return <ArrowRightLeft className="h-3 w-3" />;
  return <CreditCard className="h-3 w-3" />;
}

// ─── Payment Row Component ──────────────────────────────────────────────────
function PayRow({
  row,
  onPay,
  onWithhold,
  uploading,
  isPayroll,
}: {
  row: PaymentRow;
  onPay: (r: PaymentRow) => void;
  onWithhold: (r: PaymentRow) => void;
  uploading: boolean;
  isPayroll?: boolean;
}) {
  const isPaid = row.paymentStatus === "paid";
  const isWithheld = row.paymentStatus === "withheld";

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border text-sm ${
      isPaid ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800" :
      isWithheld ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" :
      "bg-card border-border"
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{row.payee}</span>
          <Badge variant="outline" className="text-xs capitalize">{row.type}</Badge>
          {row.paymentMethod && (
            <Badge variant="secondary" className="text-xs flex items-center gap-1">
              {methodIcon(row.paymentMethod)}{methodLabel(row.paymentMethod)}
            </Badge>
          )}
          {row.carriedFrom && (
            <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 flex items-center gap-1">
              <History className="h-3 w-3" />Prev Month ({MONTHS[row.carriedFrom.month - 1]})
            </Badge>
          )}
          {isPayroll && <Badge variant="outline" className="text-xs border-amber-500 text-amber-600"><Lock className="h-3 w-3 mr-1" />Priority</Badge>}
        </div>
        {isPaid && row.paidAt && (
          <p className="text-xs text-green-600 mt-0.5">Paid {new Date(row.paidAt).toLocaleDateString()}</p>
        )}
        {isWithheld && row.withheldReason && (
          <p className="text-xs text-amber-600 mt-0.5">Withheld: {row.withheldReason}</p>
        )}
        {row.chequeImageUrl && (
          <a href={row.chequeImageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline mt-0.5 block">View cheque/evidence photo</a>
        )}
        {row.invoiceUrl && (
          <a href={row.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline mt-0.5 block">View invoice</a>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="font-semibold text-base">{fmt(row.amount)}</span>
        {isPaid ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : isWithheld ? (
          <Button size="sm" variant="outline" className="text-green-600 border-green-500 h-7 text-xs" onClick={() => onPay(row)} disabled={uploading}>
            <PlayCircle className="h-3 w-3 mr-1" />Pay Now
          </Button>
        ) : (
          <>
            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => onPay(row)} disabled={uploading}>
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
  );
}

// ─── Section Component ──────────────────────────────────────────────────────
function PaySection({
  title, icon, rows, isPayroll, onPay, onWithhold, uploading,
}: {
  title: string; icon: React.ReactNode; rows: PaymentRow[];
  isPayroll?: boolean; onPay: (r: PaymentRow) => void;
  onWithhold: (r: PaymentRow) => void; uploading: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
  const paid = rows.filter(r => r.paymentStatus === "paid").reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
  const withheld = rows.filter(r => r.paymentStatus === "withheld").reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);

  return (
    <Card className="mb-3">
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-sm">{title}</CardTitle>
            <Badge variant="secondary" className="text-xs">{rows.length}</Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Total: <strong>{fmt(total)}</strong></span>
            <span className="text-green-600">Paid: {fmt(paid)}</span>
            {withheld > 0 && <span className="text-amber-600">Withheld: {fmt(withheld)}</span>}
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 space-y-2">
          {rows.map(row => (
            <PayRow key={`${row.type}-${row.id}`} row={row} onPay={onPay} onWithhold={onWithhold} uploading={uploading} isPayroll={isPayroll} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function Reconciliation() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [bankBalanceInput, setBankBalanceInput] = useState("");
  const [savingBalance, setSavingBalance] = useState(false);
  const [payDialog, setPayDialog] = useState<{ row: PaymentRow } | null>(null);
  const [chequeFile, setChequeFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [withholdDialog, setWithholdDialog] = useState<{ row: PaymentRow } | null>(null);
  const [withholdReason, setWithholdReason] = useState("");
  const [payMethod, setPayMethod] = useState("cheque");
  const chequeRef = useRef<HTMLInputElement>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.reconciliation.fullStatement.useQuery(
    { month, year },
    { refetchOnWindowFocus: false }
  );

  const getOrCreate = trpc.reconciliation.getOrCreate.useMutation({
    onSuccess: () => utils.reconciliation.fullStatement.invalidate(),
  });

  const updateBankBalance = trpc.reconciliation.updateBankBalance.useMutation({
    onSuccess: () => {
      utils.reconciliation.fullStatement.invalidate();
      toast.success("Bank balance saved");
      setSavingBalance(false);
    },
  });

  const markPaid = trpc.reconciliation.markPaid.useMutation({
    onSuccess: () => {
      utils.reconciliation.fullStatement.invalidate();
      toast.success("Payment recorded");
      setPayDialog(null);
      setChequeFile(null);
      setInvoiceFile(null);
    },
  });

  const withholdPayment = trpc.reconciliation.withholdPayment.useMutation({
    onSuccess: () => {
      utils.reconciliation.fullStatement.invalidate();
      toast.success("Payment withheld — will carry forward to next month");
      setWithholdDialog(null);
      setWithholdReason("");
    },
  });

  const finalise = trpc.reconciliation.finalise.useMutation({
    onSuccess: () => {
      utils.reconciliation.fullStatement.invalidate();
      toast.success("Reconciliation finalised");
    },
  });

  const handleMonthChange = (m: number, y: number) => {
    setMonth(m);
    setYear(y);
    getOrCreate.mutate({ month: m, year: y });
  };

  const handleSaveBalance = async () => {
    if (!bankBalanceInput) return;
    setSavingBalance(true);
    await getOrCreate.mutateAsync({ month, year });
    updateBankBalance.mutate({ month, year, bankBalance: bankBalanceInput });
  };

  const handleMarkPaid = async () => {
    if (!payDialog) return;
    setUploading(true);
    try {
      let chequeUrl: string | undefined;
      let invoiceUrl: string | undefined;
      const uploadFile = async (file: File, folder: string) => {
        const res = await fetch("/api/storage/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: `reconciliation/${folder}/${Date.now()}-${file.name}`, contentType: file.type }),
        });
        if (!res.ok) return undefined;
        const { uploadUrl, publicUrl } = await res.json();
        await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        return publicUrl as string;
      };
      if (chequeFile) chequeUrl = await uploadFile(chequeFile, "cheques");
      if (invoiceFile) invoiceUrl = await uploadFile(invoiceFile, "invoices");
      markPaid.mutate({
        type: payDialog.row.type,
        id: payDialog.row.id,
        chequeImageUrl: chequeUrl,
        invoiceUrl,
        paymentMethod: payMethod,
      });
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // Derived data
  const session = data?.session;
  const bankBalance = parseFloat(String(session?.bankBalance ?? "0"));
  const totals = data?.totals ?? { totalIncome: 0, totalExpenditure: 0, totalPaid: 0, totalPending: 0, reconciliationBalance: 0 };
  const income = data?.income ?? { total: 0, breakdown: [] };

  const allExpRows: PaymentRow[] = useMemo(() => {
    if (!data) return [];
    return [
      ...(data.expenditure.payroll ?? []),
      ...(data.expenditure.receipts ?? []),
      ...(data.expenditure.loans ?? []),
      ...(data.expenditure.volunteers ?? []),
      ...(data.expenditure.carried ?? []),
    ];
  }, [data]);

  // Group by payment method for the method tabs
  const byMethod = useMemo(() => {
    const cash: PaymentRow[] = [];
    const cheque: PaymentRow[] = [];
    const bank: PaymentRow[] = [];
    const other: PaymentRow[] = [];
    for (const r of allExpRows) {
      const m = r.paymentMethod ?? "";
      if (m === "cash") cash.push(r);
      else if (m === "cheque") cheque.push(r);
      else if (m === "bank_transfer") bank.push(r);
      else other.push(r);
    }
    return { cash, cheque, bank, other };
  }, [allExpRows]);

  const days25 = daysUntil25th();
  const isOverdue = days25 <= 0;
  const isWarning = days25 <= 5 && days25 > 0;
  const balanceNegative = totals.reconciliationBalance < 0;

  const printSummary = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reconciliation ${MONTHS[month-1]} ${year}</title>
<style>
body{font-family:Arial,sans-serif;padding:24px;color:#111}
h1{color:#1a4731;font-size:22px}h2{color:#1a4731;font-size:15px;margin-top:20px;border-bottom:2px solid #1a4731;padding-bottom:4px}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}
th{background:#1a4731;color:#fff;padding:5px 8px;text-align:left}td{padding:4px 8px;border-bottom:1px solid #eee}
.paid{color:#16a34a}.withheld{color:#d97706}.pending{color:#6b7280}
.summary{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px}
.balance{font-size:20px;font-weight:bold;color:${balanceNegative ? '#dc2626' : '#16a34a'}}
</style></head><body>
<h1>Abdullah Quilliam Society</h1>
<p style="color:#888;margin-top:-8px">Month-End Reconciliation &mdash; ${MONTHS[month-1]} ${year}</p>
<div class="summary">
  <table style="border:none">
    <tr><td><strong>Total Income</strong></td><td style="text-align:right;color:#16a34a">${fmt(totals.totalIncome)}</td>
        <td><strong>Total Expenditure</strong></td><td style="text-align:right;color:#dc2626">${fmt(totals.totalExpenditure)}</td></tr>
    <tr><td><strong>Bank Balance</strong></td><td style="text-align:right">${fmt(bankBalance)}</td>
        <td><strong>Total Paid Out</strong></td><td style="text-align:right;color:#16a34a">${fmt(totals.totalPaid)}</td></tr>
    <tr><td><strong>Pending Payments</strong></td><td style="text-align:right;color:#6b7280">${fmt(totals.totalPending)}</td>
        <td><strong>Reconciliation Balance</strong></td><td style="text-align:right" class="balance">${fmt(totals.reconciliationBalance)}</td></tr>
  </table>
</div>
<h2>Income</h2>
<table><tr><th>Source</th><th>Category</th><th>Method</th><th>Amount</th></tr>
${income.breakdown.map(r => `<tr><td>${r.label}</td><td>${r.category}</td><td>${methodLabel(r.paymentMethod)}</td><td>${fmt(r.amount)}</td></tr>`).join("")}
<tr style="font-weight:bold"><td colspan="3">Total Income</td><td>${fmt(totals.totalIncome)}</td></tr>
</table>
${[
  { title: "Staff Payroll (Priority 1)", rows: data?.expenditure.payroll ?? [] },
  { title: "Staff Expenses / Receipts", rows: data?.expenditure.receipts ?? [] },
  { title: "Qarde Hasan Repayments", rows: data?.expenditure.loans ?? [] },
  { title: "Volunteer Payments", rows: data?.expenditure.volunteers ?? [] },
  { title: "Carried Forward from Previous Month", rows: data?.expenditure.carried ?? [] },
].filter(s => s.rows.length > 0).map(s => `
<h2>${s.title}</h2>
<table><tr><th>Payee</th><th>Amount</th><th>Method</th><th>Status</th><th>Paid At</th></tr>
${s.rows.map(r => `<tr><td>${r.payee}</td><td>${fmt(r.amount)}</td><td>${methodLabel(r.paymentMethod)}</td><td class="${r.paymentStatus ?? 'pending'}">${r.paymentStatus ?? 'pending'}</td><td>${r.paidAt ? new Date(r.paidAt).toLocaleDateString() : '—'}</td></tr>`).join("")}
</table>`).join("")}
<p style="margin-top:32px;font-size:11px;color:#888">Printed ${new Date().toLocaleString()} &bull; Abdullah Quilliam Society Finance System</p>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            Month-End Reconciliation
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Full financial statement — income vs expenditure, payment tracking, and bank balance
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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

      {/* 25th deadline */}
      <div className={`flex items-center gap-2 p-3 rounded-lg mb-5 text-sm font-medium ${
        isOverdue ? "bg-red-100 text-red-700 border border-red-300 dark:bg-red-950/30 dark:border-red-700" :
        isWarning ? "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-700" :
        "bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/20 dark:border-green-800"
      }`}>
        {isOverdue ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
        {isOverdue ? "Payment deadline (25th) has passed — ensure all payroll cheques have been issued" :
         isWarning ? `${days25} day${days25 === 1 ? "" : "s"} until the 25th — issue cheques soon` :
         `${days25} days until the 25th payment deadline`}
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {/* Bank balance */}
        <Card className="col-span-2 sm:col-span-1 lg:col-span-2">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Building2 className="h-3 w-3" />Bank Balance</p>
            <p className="text-xl font-bold">{fmt(bankBalance)}</p>
            <div className="flex gap-1 mt-2">
              <Input placeholder="Update balance" value={bankBalanceInput} onChange={e => setBankBalanceInput(e.target.value)} className="h-7 text-xs" />
              <Button size="sm" className="h-7 text-xs px-2" onClick={handleSaveBalance} disabled={savingBalance || !bankBalanceInput}>Set</Button>
            </div>
          </CardContent>
        </Card>
        {/* Total income */}
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3 text-green-600" />Total Income</p>
            <p className="text-lg font-bold text-green-600">{fmt(totals.totalIncome)}</p>
          </CardContent>
        </Card>
        {/* Total expenditure */}
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingDown className="h-3 w-3 text-red-500" />Total Expenditure</p>
            <p className="text-lg font-bold text-red-500">{fmt(totals.totalExpenditure)}</p>
          </CardContent>
        </Card>
        {/* Total paid */}
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Paid Out</p>
            <p className="text-lg font-bold text-green-600">{fmt(totals.totalPaid)}</p>
            <p className="text-xs text-muted-foreground">Pending: {fmt(totals.totalPending)}</p>
          </CardContent>
        </Card>
        {/* Reconciliation balance */}
        <Card className={balanceNegative ? "border-red-400" : "border-green-400"}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Scale className="h-3 w-3" />Recon. Balance</p>
            <p className={`text-lg font-bold ${balanceNegative ? "text-red-600" : "text-green-600"}`}>{fmt(totals.reconciliationBalance)}</p>
            {balanceNegative && <p className="text-xs text-red-500 mt-0.5">Overdrawn — withhold non-priority items</p>}
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading financial statement…</div>
      ) : (
        <Tabs defaultValue="statement">
          <TabsList className="mb-4 flex-wrap h-auto">
            <TabsTrigger value="statement">Full Statement</TabsTrigger>
            <TabsTrigger value="cash">
              <Banknote className="h-3.5 w-3.5 mr-1" />Cash ({byMethod.cash.length})
            </TabsTrigger>
            <TabsTrigger value="cheque">
              <FileText className="h-3.5 w-3.5 mr-1" />Cheque ({byMethod.cheque.length})
            </TabsTrigger>
            <TabsTrigger value="bank">
              <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />Bank Transfer ({byMethod.bank.length})
            </TabsTrigger>
            {(data?.expenditure.carried?.length ?? 0) > 0 && (
              <TabsTrigger value="carried">
                <History className="h-3.5 w-3.5 mr-1" />Carried Forward ({data?.expenditure.carried?.length})
              </TabsTrigger>
            )}
          </TabsList>

          {/* ── FULL STATEMENT TAB ── */}
          <TabsContent value="statement">
            {/* Income section */}
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Income — {MONTHS[month-1]} {year}
                  <Badge className="bg-green-600 text-white text-xs">{fmt(income.total)}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {income.breakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No income recorded for this month.</p>
                ) : (
                  <div className="space-y-1.5">
                    {income.breakdown.map((r, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900 text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{r.label}</span>
                          <Badge variant="outline" className="text-xs">{r.category}</Badge>
                          <Badge variant="secondary" className="text-xs flex items-center gap-1">
                            {methodIcon(r.paymentMethod)}{methodLabel(r.paymentMethod)}
                          </Badge>
                        </div>
                        <span className="font-semibold text-green-700">{fmt(r.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between p-2 font-semibold text-sm border-t mt-2">
                      <span>Total Income</span>
                      <span className="text-green-600">{fmt(income.total)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Separator className="my-4" />

            {/* Expenditure sections */}
            <div className="mb-2 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="font-semibold text-sm">Expenditure — {MONTHS[month-1]} {year}</span>
              <Badge className="bg-red-500 text-white text-xs">{fmt(totals.totalExpenditure)}</Badge>
            </div>

            <PaySection
              title="Staff Payroll (Priority 1 — always paid first)"
              icon={<Lock className="h-4 w-4 text-amber-500" />}
              rows={data?.expenditure.payroll ?? []}
              isPayroll
              onPay={row => setPayDialog({ row })}
              onWithhold={() => {}}
              uploading={uploading}
            />
            <PaySection
              title="Staff Expenses & Receipts (All Users)"
              icon={<FileText className="h-4 w-4 text-purple-600" />}
              rows={data?.expenditure.receipts ?? []}
              onPay={row => setPayDialog({ row })}
              onWithhold={row => { setWithholdDialog({ row }); setWithholdReason(""); }}
              uploading={uploading}
            />
            <PaySection
              title="Qarde Hasan Loan Repayments"
              icon={<FileText className="h-4 w-4 text-blue-600" />}
              rows={data?.expenditure.loans ?? []}
              onPay={row => setPayDialog({ row })}
              onWithhold={row => { setWithholdDialog({ row }); setWithholdReason(""); }}
              uploading={uploading}
            />
            <PaySection
              title="Volunteer Payments"
              icon={<CheckCircle2 className="h-4 w-4 text-orange-500" />}
              rows={data?.expenditure.volunteers ?? []}
              onPay={row => setPayDialog({ row })}
              onWithhold={row => { setWithholdDialog({ row }); setWithholdReason(""); }}
              uploading={uploading}
            />

            {/* Carried forward */}
            {(data?.expenditure.carried?.length ?? 0) > 0 && (
              <>
                <Separator className="my-4" />
                <div className="mb-2 flex items-center gap-2">
                  <History className="h-4 w-4 text-orange-500" />
                  <span className="font-semibold text-sm">Carried Forward from {MONTHS[(data?.prevMonth?.month ?? 1) - 1]} {data?.prevMonth?.year}</span>
                  <Badge variant="outline" className="text-xs border-orange-400 text-orange-600">Withheld last month</Badge>
                </div>
                <PaySection
                  title="Carried Forward Items"
                  icon={<History className="h-4 w-4 text-orange-500" />}
                  rows={data?.expenditure.carried ?? []}
                  onPay={row => setPayDialog({ row })}
                  onWithhold={row => { setWithholdDialog({ row }); setWithholdReason(""); }}
                  uploading={uploading}
                />
              </>
            )}

            {allExpRows.length === 0 && income.breakdown.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Scale className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No financial data for {MONTHS[month-1]} {year}</p>
                <p className="text-sm mt-1">Add payroll, expenses, income records, or Qarde Hasan repayments to see them here</p>
              </div>
            )}

            {/* Reconciliation balance summary */}
            {(allExpRows.length > 0 || income.breakdown.length > 0) && (
              <Card className={`mt-6 ${balanceNegative ? "border-red-400 bg-red-50 dark:bg-red-950/20" : "border-green-400 bg-green-50 dark:bg-green-950/20"}`}>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Bank Balance</p>
                      <p className="font-bold text-lg">{fmt(bankBalance)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Total Income</p>
                      <p className="font-bold text-lg text-green-600">{fmt(totals.totalIncome)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Total Expenditure</p>
                      <p className="font-bold text-lg text-red-500">{fmt(totals.totalExpenditure)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Reconciliation Balance</p>
                      <p className={`font-bold text-xl ${balanceNegative ? "text-red-600" : "text-green-600"}`}>{fmt(totals.reconciliationBalance)}</p>
                      <p className="text-xs text-muted-foreground">(Bank − Pending)</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Finalise */}
            {allExpRows.length > 0 && session?.status !== "finalised" && (
              <div className="mt-4 flex justify-end">
                <Button variant="outline" className="border-green-500 text-green-700" onClick={() => finalise.mutate({ month, year })} disabled={finalise.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />Finalise Reconciliation
                </Button>
              </div>
            )}
            {session?.status === "finalised" && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Reconciliation finalised {session.finalisedAt ? `on ${new Date(session.finalisedAt).toLocaleDateString()}` : ""}
              </div>
            )}
          </TabsContent>

          {/* ── CASH TAB ── */}
          <TabsContent value="cash">
            <div className="mb-3 p-3 bg-muted rounded-lg text-sm flex items-center justify-between">
              <span className="flex items-center gap-2"><Banknote className="h-4 w-4" /><strong>Cash Payments</strong> — {byMethod.cash.length} items</span>
              <span className="font-bold">{fmt(byMethod.cash.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0))}</span>
            </div>
            {byMethod.cash.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No cash payments this month.</p>
            ) : byMethod.cash.map(row => (
              <div key={`cash-${row.type}-${row.id}`} className="mb-2">
                <PayRow row={row} onPay={r => setPayDialog({ row: r })} onWithhold={r => { setWithholdDialog({ row: r }); setWithholdReason(""); }} uploading={uploading} isPayroll={row.type === "payroll"} />
              </div>
            ))}
          </TabsContent>

          {/* ── CHEQUE TAB ── */}
          <TabsContent value="cheque">
            <div className="mb-3 p-3 bg-muted rounded-lg text-sm flex items-center justify-between">
              <span className="flex items-center gap-2"><FileText className="h-4 w-4" /><strong>Cheque Payments</strong> — {byMethod.cheque.length} items</span>
              <span className="font-bold">{fmt(byMethod.cheque.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0))}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Each cheque payment should have a photo of the issued cheque attached as evidence.</p>
            {byMethod.cheque.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No cheque payments this month.</p>
            ) : byMethod.cheque.map(row => (
              <div key={`chq-${row.type}-${row.id}`} className="mb-2">
                <PayRow row={row} onPay={r => setPayDialog({ row: r })} onWithhold={r => { setWithholdDialog({ row: r }); setWithholdReason(""); }} uploading={uploading} isPayroll={row.type === "payroll"} />
              </div>
            ))}
          </TabsContent>

          {/* ── BANK TRANSFER TAB ── */}
          <TabsContent value="bank">
            <div className="mb-3 p-3 bg-muted rounded-lg text-sm flex items-center justify-between">
              <span className="flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" /><strong>Bank Transfer Payments</strong> — {byMethod.bank.length} items</span>
              <span className="font-bold">{fmt(byMethod.bank.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0))}</span>
            </div>
            {byMethod.bank.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No bank transfer payments this month.</p>
            ) : byMethod.bank.map(row => (
              <div key={`bt-${row.type}-${row.id}`} className="mb-2">
                <PayRow row={row} onPay={r => setPayDialog({ row: r })} onWithhold={r => { setWithholdDialog({ row: r }); setWithholdReason(""); }} uploading={uploading} isPayroll={row.type === "payroll"} />
              </div>
            ))}
          </TabsContent>

          {/* ── CARRIED FORWARD TAB ── */}
          <TabsContent value="carried">
            <div className="mb-3 p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 rounded-lg text-sm">
              <p className="font-medium flex items-center gap-2"><History className="h-4 w-4 text-orange-500" />Items withheld from {MONTHS[(data?.prevMonth?.month ?? 1) - 1]} {data?.prevMonth?.year} — carried forward for payment this month</p>
              <p className="text-xs text-muted-foreground mt-1">These items were withheld last month. Pay them now or withhold again to carry forward once more.</p>
            </div>
            {(data?.expenditure.carried?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No items carried forward from last month.</p>
            ) : (data?.expenditure.carried ?? []).map(row => (
              <div key={`cf-${row.type}-${row.id}`} className="mb-2">
                <PayRow row={row} onPay={r => setPayDialog({ row: r })} onWithhold={r => { setWithholdDialog({ row: r }); setWithholdReason(""); }} uploading={uploading} isPayroll={row.type === "payroll"} />
              </div>
            ))}
          </TabsContent>
        </Tabs>
      )}

      {/* ── PAY DIALOG ── */}
      <Dialog open={!!payDialog} onOpenChange={open => { if (!open) { setPayDialog(null); setChequeFile(null); setInvoiceFile(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment — {payDialog?.row.payee}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted rounded-lg p-3 flex justify-between text-sm">
              <span>Amount</span>
              <span className="font-bold text-base">{fmt(payDialog?.row.amount)}</span>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Payment Method</p>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Cheque / evidence photo */}
            <div>
              <p className="text-sm font-medium mb-1 flex items-center gap-1"><Camera className="h-4 w-4" />
                {payMethod === "cheque" ? "Cheque Photo" : "Payment Evidence"} (optional)
              </p>
              <input ref={chequeRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={e => setChequeFile(e.target.files?.[0] ?? null)} />
              {chequeFile ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="truncate">{chequeFile.name}</span>
                  <button className="text-destructive text-xs" onClick={() => setChequeFile(null)}>Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { if (chequeRef.current) { chequeRef.current.setAttribute("capture", "environment"); chequeRef.current.click(); } }}>
                    <Camera className="h-4 w-4 mr-2" />Take Photo
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { if (chequeRef.current) { chequeRef.current.removeAttribute("capture"); chequeRef.current.click(); } }}>
                    Upload File
                  </Button>
                </div>
              )}
            </div>
            {/* Invoice */}
            <div>
              <p className="text-sm font-medium mb-1 flex items-center gap-1"><FileText className="h-4 w-4" />Invoice / Receipt (optional)</p>
              <input ref={invoiceRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={e => setInvoiceFile(e.target.files?.[0] ?? null)} />
              {invoiceFile ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="truncate">{invoiceFile.name}</span>
                  <button className="text-destructive text-xs" onClick={() => setInvoiceFile(null)}>Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { if (invoiceRef.current) { invoiceRef.current.setAttribute("capture", "environment"); invoiceRef.current.click(); } }}>
                    <Camera className="h-4 w-4 mr-2" />Take Photo
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { if (invoiceRef.current) { invoiceRef.current.removeAttribute("capture"); invoiceRef.current.click(); } }}>
                    Upload File
                  </Button>
                </div>
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

      {/* ── WITHHOLD DIALOG ── */}
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
            <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 rounded-lg text-xs text-orange-700">
              <History className="h-3.5 w-3.5 inline mr-1" />
              This payment will be <strong>automatically carried forward</strong> to next month and shown with a "Prev Month" badge.
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Reason for withholding</p>
              <Textarea
                placeholder="e.g. Insufficient bank balance, invoice query, awaiting approval…"
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
              <PauseCircle className="h-4 w-4 mr-2" />Withhold & Carry Forward
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
