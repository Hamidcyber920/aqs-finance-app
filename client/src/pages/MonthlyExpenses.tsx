import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CheckCircle2, Clock, PauseCircle, Banknote, CreditCard,
  Camera, FileText, Mail, ChevronDown, ChevronUp, Plus, Trash2, TrendingUp,
  Building, Users, RefreshCw
} from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
type PaymentType = "payroll" | "receipt" | "volunteer";

interface PaymentRow {
  id: number; type: PaymentType; displayName: string; amount: number;
  paymentMethod: string; paymentStatus: string; paymentHeld?: boolean;
  paidAt?: Date | null; withheldAt?: Date | null;
  chequeNumber?: string | null; chequeImageUrl?: string | null; invoiceUrl?: string | null;
  emailSentAt?: Date | null; emailSentTo?: string | null;
  description?: string | null; department?: string | null; bankingStatus?: string | null;
}

export default function MonthlyExpenses() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [filter, setFilter] = useState<"all"|"pending"|"paid"|"withheld">("all");
  const [expandedId, setExpandedId] = useState<string|null>(null);

  const [payDialog, setPayDialog] = useState<PaymentRow|null>(null);
  const [withholdDialog, setWithholdDialog] = useState<PaymentRow|null>(null);
  const [emailDialog, setEmailDialog] = useState<PaymentRow|null>(null);
  const [addVolOpen, setAddVolOpen] = useState(false);

  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeImageUrl, setChequeImageUrl] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [uploadingCheque, setUploadingCheque] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [withholdReason, setWithholdReason] = useState("");
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailName, setEmailName] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [customName, setCustomName] = useState("");
  const [useCustomEmail, setUseCustomEmail] = useState(false);
  const [volName, setVolName] = useState("");
  const [volEmail, setVolEmail] = useState("");
  const [volAmount, setVolAmount] = useState("");
  const [volDesc, setVolDesc] = useState("");
  const [volMethod, setVolMethod] = useState<"cash"|"cheque"|"bank_transfer">("cash");

  const chequeRef = useRef<HTMLInputElement>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: incomeBalance } = trpc.expenses.incomeBalance.useQuery({ month, year });
  const { data: pendingData, isLoading } = trpc.expenses.pendingPayments.useQuery({ month, year });
  const { data: volunteerData } = trpc.expenses.volunteerPayments.list.useQuery({ month, year });
  const { data: staffDir } = trpc.expenses.staffDirectory.useQuery();

  const invalidateAll = () => {
    utils.expenses.pendingPayments.invalidate();
    utils.expenses.volunteerPayments.list.invalidate();
    utils.expenses.incomeBalance.invalidate();
  };

  const nowPaid = trpc.expenses.nowPaid.useMutation({
    onSuccess: () => { invalidateAll(); toast.success("Payment recorded — marked as paid with timestamp"); setPayDialog(null); },
    onError: (e) => toast.error(e.message),
  });
  const withholdPayment = trpc.expenses.withholdPayment.useMutation({
    onSuccess: () => { invalidateAll(); toast.success("Payment withheld"); setWithholdDialog(null); setWithholdReason(""); },
    onError: (e) => toast.error(e.message),
  });
  const sendEmail = trpc.expenses.sendPaymentEmail.useMutation({
    onSuccess: () => { invalidateAll(); toast.success("Email sent"); setEmailDialog(null); },
    onError: (e) => toast.error(e.message),
  });
  const markBanked = trpc.expenses.markBanked.useMutation({
    onSuccess: () => { utils.expenses.pendingPayments.invalidate(); toast.success("Marked as banked"); },
  });
  const createVol = trpc.expenses.volunteerPayments.create.useMutation({
    onSuccess: () => { invalidateAll(); toast.success("Volunteer payment added"); setAddVolOpen(false); setVolName(""); setVolEmail(""); setVolAmount(""); setVolDesc(""); },
    onError: (e) => toast.error(e.message),
  });
  const deleteVol = trpc.expenses.volunteerPayments.delete.useMutation({
    onSuccess: () => { invalidateAll(); },
  });
  const bulkMarkAllPaid = trpc.expenses.bulkMarkAllPaid.useMutation({
    onSuccess: (data) => {
      invalidateAll();
      const total = (data.payrollUpdated ?? 0) + (data.volunteerUpdated ?? 0);
      toast.success(`${total} payment${total !== 1 ? 's' : ''} marked as paid`);
    },
    onError: (e) => toast.error(e.message),
  });

  const payrollRows: PaymentRow[] = (pendingData?.payroll ?? []).map((r: any) => ({
    id: r.id, type: "payroll" as PaymentType,
    displayName: r.displayName ?? r.employeeName ?? ("Employee #" + r.userId),
    amount: parseFloat(String(r.netPay ?? 0)),
    paymentMethod: r.paymentMethod ?? "bank_transfer",
    paymentStatus: r.paymentStatus ?? "pending",
    paidAt: r.paidAt, withheldAt: r.withheldAt,
    chequeNumber: r.chequeNumber, chequeImageUrl: r.chequeImageUrl,
    invoiceUrl: r.invoiceUrl, emailSentAt: r.emailSentAt, emailSentTo: r.emailSentTo,
    description: "Payroll — " + MONTHS[(r.month ?? month) - 1] + " " + (r.year ?? year),
    bankingStatus: r.bankingStatus,
  }));

  const receiptRows: PaymentRow[] = (pendingData?.receipts ?? []).map((r: any) => ({
    id: r.id, type: "receipt" as PaymentType,
    displayName: r.vendor ?? "Supplier",
    amount: parseFloat(String(r.amount ?? 0)),
    paymentMethod: r.isChequePayment ? "cheque" : "cash",
    paymentStatus: r.status === "approved" ? "paid" : r.paymentHeld ? "withheld" : "pending",
    paymentHeld: r.paymentHeld,
    paidAt: r.paidAt, withheldAt: r.heldAt,
    chequeNumber: r.chequeNumber, chequeImageUrl: r.chequeImageUrl,
    invoiceUrl: r.invoiceUrl ?? r.imageUrl, emailSentAt: r.emailSentAt, emailSentTo: r.emailSentTo,
    description: r.categoryName ?? r.departmentName ?? "Expense",
    department: r.departmentName, bankingStatus: r.bankingStatus,
  }));

  const volunteerRows: PaymentRow[] = (volunteerData ?? []).map((r: any) => ({
    id: r.id, type: "volunteer" as PaymentType,
    displayName: r.recipientName,
    amount: parseFloat(String(r.amount ?? 0)),
    paymentMethod: r.paymentMethod ?? "cash",
    paymentStatus: r.paymentStatus ?? "pending",
    paidAt: r.paidAt, withheldAt: r.withheldAt,
    chequeNumber: r.chequeNumber, chequeImageUrl: r.chequeImageUrl,
    invoiceUrl: r.invoiceUrl, emailSentAt: r.emailSentAt, emailSentTo: r.emailSentTo,
    description: r.description ?? "Volunteer payment",
  }));

  const allRows = [...payrollRows, ...receiptRows, ...volunteerRows];
  const filteredRows = filter === "all" ? allRows
    : filter === "paid" ? allRows.filter(r => r.paymentStatus === "paid")
    : filter === "withheld" ? allRows.filter(r => r.paymentStatus === "withheld" || r.paymentHeld)
    : allRows.filter(r => r.paymentStatus === "pending" && !r.paymentHeld);

  const totalPending = allRows.filter(r => r.paymentStatus === "pending" && !r.paymentHeld).reduce((s, r) => s + r.amount, 0);
  const totalPaid = allRows.filter(r => r.paymentStatus === "paid").reduce((s, r) => s + r.amount, 0);
  const totalWithheld = allRows.filter(r => r.paymentStatus === "withheld" || r.paymentHeld).reduce((s, r) => s + r.amount, 0);
  const unbankedCash = pendingData?.summary?.unbankedCash ?? 0;
  const unbankedCheques = pendingData?.summary?.unbankedCheques ?? 0;

  async function uploadFile(file: File, type: "cheque"|"invoice"): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("key", "expenses/" + type + "/" + Date.now() + "-" + file.name);
    const res = await fetch("/api/upload-receipt", { method: "POST", body: fd });
    const json = await res.json();
    return json.url;
  }

  function openPayDialog(row: PaymentRow) {
    setPayDialog(row);
    setChequeNumber(row.chequeNumber ?? "");
    setChequeImageUrl(row.chequeImageUrl ?? "");
    setInvoiceUrl(row.invoiceUrl ?? "");
  }

  function openEmailDialog(row: PaymentRow) {
    setEmailDialog(row);
    setEmailRecipient("");
    setEmailName(row.displayName);
    setCustomEmail("");
    setCustomName(row.displayName);
    setUseCustomEmail(false);
  }

  function statusBadge(row: PaymentRow) {
    if (row.paymentStatus === "paid") return <Badge className="bg-green-600 text-white text-xs">Paid</Badge>;
    if (row.paymentStatus === "withheld" || row.paymentHeld) return <Badge className="bg-amber-500 text-white text-xs">Withheld</Badge>;
    return <Badge variant="outline" className="text-xs">Pending</Badge>;
  }

  function methodIcon(method: string) {
    if (method === "cheque") return <CreditCard className="h-3.5 w-3.5 text-blue-500" />;
    if (method === "cash") return <Banknote className="h-3.5 w-3.5 text-green-500" />;
    return <Building className="h-3.5 w-3.5 text-purple-500" />;
  }

  const sectionLabel = (t: PaymentType) =>
    t === "payroll" ? "Staff Payroll" : t === "volunteer" ? "Volunteer Payments" : "Supplier / Expenses";

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Monthly Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Issue cheques, record payments, track unbanked funds</p>
        </div>
        <div className="flex gap-2">
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Income Balance Bar */}
      <Card className="border-l-4 border-l-emerald-600 bg-emerald-50 dark:bg-emerald-950/30">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">Income This Month</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Total Income</p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">£{(incomeBalance?.totalIncome ?? 0).toFixed(2)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Paid Out</p>
              <p className="text-lg font-bold text-red-600">£{(incomeBalance?.totalPaidExpenses ?? 0).toFixed(2)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Available Balance</p>
              <p className={"text-lg font-bold " + ((incomeBalance?.availableBalance ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>
                £{(incomeBalance?.availableBalance ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Unbanked Total</p>
              <p className="text-lg font-bold text-amber-600">£{(unbankedCash + unbankedCheques).toFixed(2)}</p>
            </div>
          </div>
          {(incomeBalance?.breakdown ?? []).filter((b: any) => b.amount > 0).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(incomeBalance?.breakdown ?? []).filter((b: any) => b.amount > 0).map((b: any, i: number) => (
                <span key={i} className="text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                  {b.label}: £{b.amount.toFixed(2)}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { label: "Pending", value: totalPending, count: allRows.filter(r => r.paymentStatus === "pending" && !r.paymentHeld).length, icon: Clock, color: "text-orange-500", f: "pending" },
          { label: "Paid", value: totalPaid, count: allRows.filter(r => r.paymentStatus === "paid").length, icon: CheckCircle2, color: "text-green-500", f: "paid" },
          { label: "Withheld", value: totalWithheld, count: allRows.filter(r => r.paymentStatus === "withheld" || r.paymentHeld).length, icon: PauseCircle, color: "text-amber-500", f: "withheld" },
          { label: "Unbanked", value: unbankedCash + unbankedCheques, count: -1, icon: Banknote, color: "text-slate-500", f: "all" },
        ] as const).map(({ label, value, count, icon: Icon, color, f }) => (
          <Card key={label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter(f as any)}>
            <CardContent className="pt-3 pb-3 text-center">
              <Icon className={"h-5 w-5 " + color + " mx-auto mb-1"} />
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-base font-bold">£{value.toFixed(2)}</p>
              {count >= 0 && <p className="text-xs text-muted-foreground">{count} payments</p>}
              {label === "Unbanked" && <p className="text-xs text-muted-foreground">Cash £{unbankedCash.toFixed(2)} · Chq £{unbankedCheques.toFixed(2)}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter + Add Volunteer */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all","pending","paid","withheld"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={"px-3 py-1 rounded-full text-xs font-medium transition-colors " + (filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {allRows.filter(r => r.paymentStatus === "pending" && !r.paymentHeld && (r.paymentMethod === "cheque" || r.paymentMethod === "cash")).length > 0 && (
            <Button size="sm" variant="default" className="bg-emerald-700 hover:bg-emerald-800 text-white"
              disabled={bulkMarkAllPaid.isPending}
              onClick={() => {
                if (confirm(`Mark all ${allRows.filter(r => r.paymentStatus === 'pending' && !r.paymentHeld && (r.paymentMethod === 'cheque' || r.paymentMethod === 'cash')).length} pending cheque/cash payments as paid for ${MONTHS[month-1]} ${year}?`)) {
                  bulkMarkAllPaid.mutate({ month, year });
                }
              }}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Save All ({allRows.filter(r => r.paymentStatus === "pending" && !r.paymentHeld && (r.paymentMethod === "cheque" || r.paymentMethod === "cash")).length})
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setAddVolOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Volunteer Payment
          </Button>
        </div>
      </div>

      {/* Payment List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading payments…</div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No payments found for this filter.</div>
      ) : (
        <div className="space-y-2">
          {(["payroll","volunteer","receipt"] as PaymentType[]).map(sType => {
            const rows = filteredRows.filter(r => r.type === sType);
            if (!rows.length) return null;
            return (
              <div key={sType}>
                <div className="flex items-center gap-2 mb-2 mt-4">
                  {sType === "payroll" ? <Users className="h-4 w-4 text-primary" /> : sType === "volunteer" ? <Users className="h-4 w-4 text-amber-500" /> : <FileText className="h-4 w-4 text-blue-500" />}
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{sectionLabel(sType)}</h3>
                  <span className="text-xs text-muted-foreground">({rows.length})</span>
                </div>
                {rows.map(row => {
                  const rowKey = row.type + "-" + row.id;
                  const isExpanded = expandedId === rowKey;
                  return (
                    <Card key={rowKey} className={"transition-all " + (row.paymentStatus === "paid" ? "opacity-80" : "")}>
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm truncate">{row.displayName}</span>
                              {statusBadge(row)}
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">{methodIcon(row.paymentMethod)} {row.paymentMethod}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-base font-bold text-primary">£{row.amount.toFixed(2)}</span>
                              {row.description && <span className="text-xs text-muted-foreground truncate">{row.description}</span>}
                              {row.department && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{row.department}</span>}
                            </div>
                            {row.paidAt && <p className="text-xs text-green-600 mt-0.5">Paid {new Date(row.paidAt).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</p>}
                            {(row.paymentStatus === "withheld" || row.paymentHeld) && row.withheldAt && <p className="text-xs text-amber-600 mt-0.5">Withheld {new Date(row.withheldAt).toLocaleDateString("en-GB")}</p>}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                            {row.paymentStatus !== "paid" && (
                              <Button size="sm" variant="outline" className="h-7 px-2 text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-950" onClick={() => openPayDialog(row)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {row.paymentStatus === "withheld" || row.paymentHeld ? "Pay Now" : "Now Paid"}
                              </Button>
                            )}
                            {row.paymentStatus === "pending" && !row.paymentHeld && (
                              <Button size="sm" variant="outline" className="h-7 px-2 text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950" onClick={() => { setWithholdDialog(row); setWithholdReason(""); }}>
                                <PauseCircle className="h-3.5 w-3.5 mr-1" /> Withhold
                              </Button>
                            )}
                            {row.paymentStatus === "paid" && (
                              <Button size="sm" variant="outline" className={"h-7 px-2 " + (row.emailSentAt ? "text-green-600 border-green-300" : "text-blue-600 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950")} onClick={() => openEmailDialog(row)}>
                                <Mail className="h-3.5 w-3.5 mr-1" /> {row.emailSentAt ? "Re-send" : "Email"}
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setExpandedId(isExpanded ? null : rowKey)}>
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t space-y-2">
                            {row.chequeNumber && <p className="text-xs text-muted-foreground">Cheque #: <span className="font-medium">{row.chequeNumber}</span></p>}
                            {row.chequeImageUrl && <a href={row.chequeImageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline"><Camera className="h-3 w-3" /> View cheque photo</a>}
                            {row.invoiceUrl && <a href={row.invoiceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline"><FileText className="h-3 w-3" /> View invoice / receipt</a>}
                            {row.emailSentAt && <p className="text-xs text-green-600">Email sent to {row.emailSentTo} on {new Date(row.emailSentAt).toLocaleDateString("en-GB")}</p>}
                            {row.bankingStatus === "unbanked" && row.paymentStatus === "paid" && (
                              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => markBanked.mutate({ type: row.type === "volunteer" ? "payroll" : row.type, id: row.id })}>
                                <RefreshCw className="h-3 w-3 mr-1" /> Mark as Banked
                              </Button>
                            )}
                            {row.type === "volunteer" && (
                              <Button size="sm" variant="ghost" className="h-6 text-xs text-red-500 hover:text-red-700" onClick={() => deleteVol.mutate({ id: row.id })}>
                                <Trash2 className="h-3 w-3 mr-1" /> Delete
                              </Button>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Now Paid Dialog */}
      <Dialog open={!!payDialog} onOpenChange={open => !open && setPayDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Payment — {payDialog?.displayName}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-primary">£{payDialog?.amount.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{payDialog?.description}</p>
            </div>
            <div>
              <Label className="text-xs">Cheque Number (optional)</Label>
              <Input value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} placeholder="e.g. 000123" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Photo of Written Cheque</Label>
              <div className="mt-1 flex items-center gap-2">
                <input ref={chequeRef} type="file" accept="image/*" className="hidden" onChange={async e => {
                  const file = e.target.files?.[0]; if (!file) return;
                  setUploadingCheque(true);
                  try { const url = await uploadFile(file, "cheque"); setChequeImageUrl(url); toast.success("Cheque photo uploaded"); }
                  catch { toast.error("Upload failed"); }
                  finally { setUploadingCheque(false); }
                }} />
                <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => chequeRef.current?.click()} disabled={uploadingCheque}>
                  <Camera className="h-3.5 w-3.5 mr-1" /> {uploadingCheque ? "Uploading…" : chequeImageUrl ? "Replace Photo" : "Take / Upload Photo"}
                </Button>
                {chequeImageUrl && <a href={chequeImageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View</a>}
              </div>
            </div>
            <div>
              <Label className="text-xs">Invoice / Receipt Evidence (optional)</Label>
              <div className="mt-1 flex items-center gap-2">
                <input ref={invoiceRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={async e => {
                  const file = e.target.files?.[0]; if (!file) return;
                  setUploadingInvoice(true);
                  try { const url = await uploadFile(file, "invoice"); setInvoiceUrl(url); toast.success("Invoice uploaded"); }
                  catch { toast.error("Upload failed"); }
                  finally { setUploadingInvoice(false); }
                }} />
                <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => invoiceRef.current?.click()} disabled={uploadingInvoice}>
                  <FileText className="h-3.5 w-3.5 mr-1" /> {uploadingInvoice ? "Uploading…" : invoiceUrl ? "Replace Invoice" : "Upload Invoice / Receipt"}
                </Button>
                {invoiceUrl && <a href={invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View</a>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={nowPaid.isPending} onClick={() => {
              if (!payDialog) return;
              nowPaid.mutate({ type: payDialog.type, id: payDialog.id, chequeNumber: chequeNumber || undefined, chequeImageUrl: chequeImageUrl || undefined, invoiceUrl: invoiceUrl || undefined });
            }}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> {nowPaid.isPending ? "Saving…" : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withhold Dialog */}
      <Dialog open={!!withholdDialog} onOpenChange={open => !open && setWithholdDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Withhold Payment — {withholdDialog?.displayName}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">£{withholdDialog?.amount.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">This payment will be put on hold until funds allow</p>
            </div>
            <div>
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea value={withholdReason} onChange={e => setWithholdReason(e.target.value)} placeholder="e.g. Awaiting better bank balance" className="mt-1 text-sm" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithholdDialog(null)}>Cancel</Button>
            <Button className="bg-amber-500 hover:bg-amber-600 text-white" disabled={withholdPayment.isPending} onClick={() => {
              if (!withholdDialog) return;
              withholdPayment.mutate({ type: withholdDialog.type, id: withholdDialog.id, reason: withholdReason || undefined });
            }}>
              <PauseCircle className="h-4 w-4 mr-1" /> {withholdPayment.isPending ? "Saving…" : "Withhold Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={!!emailDialog} onOpenChange={open => !open && setEmailDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Send Payment Confirmation</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3">
              <p className="text-sm font-medium">{emailDialog?.displayName}</p>
              <p className="text-lg font-bold text-primary">£{emailDialog?.amount.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{emailDialog?.description}</p>
            </div>
            <div className="flex gap-2">
              <button className={"flex-1 text-xs py-1.5 rounded-md border transition-colors " + (!useCustomEmail ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border")} onClick={() => setUseCustomEmail(false)}>From Staff Directory</button>
              <button className={"flex-1 text-xs py-1.5 rounded-md border transition-colors " + (useCustomEmail ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border")} onClick={() => setUseCustomEmail(true)}>Enter Manually</button>
            </div>
            {!useCustomEmail ? (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Select Recipient</Label>
                  <Select value={emailRecipient} onValueChange={v => { setEmailRecipient(v); const f = (staffDir ?? []).find((s: any) => s.email === v); if (f) setEmailName((f as any).name); }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choose staff member…" /></SelectTrigger>
                    <SelectContent>
                      {(staffDir ?? []).map((s: any) => <SelectItem key={s.id} value={s.email}>{s.name} — {s.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Recipient Name (editable)</Label>
                  <Input value={emailName} onChange={e => setEmailName(e.target.value)} placeholder="Full name as it should appear in email" className="mt-1" />
                  <p className="text-xs text-muted-foreground mt-1">Edit this if the name shown is a username rather than a full name.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Recipient Name</Label>
                  <Input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Full name" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Email Address</Label>
                  <Input type="email" value={customEmail} onChange={e => setCustomEmail(e.target.value)} placeholder="email@example.com" className="mt-1" />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialog(null)}>Cancel</Button>
            <Button disabled={sendEmail.isPending || (!useCustomEmail && !emailRecipient) || (useCustomEmail && (!customEmail || !customName))} onClick={() => {
              if (!emailDialog) return;
              const toEmail = useCustomEmail ? customEmail : emailRecipient;
              const toName = useCustomEmail ? customName : emailName;
              sendEmail.mutate({ type: emailDialog.type, id: emailDialog.id, recipientEmail: toEmail, recipientName: toName, amount: String(emailDialog.amount), description: emailDialog.description ?? emailDialog.displayName, paidAt: emailDialog.paidAt ? new Date(emailDialog.paidAt) : undefined });
            }}>
              <Mail className="h-4 w-4 mr-1" /> {sendEmail.isPending ? "Sending…" : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Volunteer Dialog */}
      <Dialog open={addVolOpen} onOpenChange={setAddVolOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Volunteer Payment</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Recipient Name *</Label>
              <Input value={volName} onChange={e => setVolName(e.target.value)} placeholder="Full name" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Email (optional)</Label>
              <Input type="email" value={volEmail} onChange={e => setVolEmail(e.target.value)} placeholder="email@example.com" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Amount (£) *</Label>
              <Input type="number" step="0.01" value={volAmount} onChange={e => setVolAmount(e.target.value)} placeholder="0.00" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={volDesc} onChange={e => setVolDesc(e.target.value)} placeholder="e.g. Event helper, cleaning…" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Payment Method</Label>
              <Select value={volMethod} onValueChange={v => setVolMethod(v as any)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddVolOpen(false)}>Cancel</Button>
            <Button disabled={!volName || !volAmount || createVol.isPending} onClick={() => createVol.mutate({ recipientName: volName, recipientEmail: volEmail || undefined, month, year, amount: volAmount, description: volDesc || undefined, paymentMethod: volMethod })}>
              {createVol.isPending ? "Saving…" : "Add Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
