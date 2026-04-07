import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2, Clock, Upload, Camera, Banknote, CreditCard, AlertCircle,
  Loader2, ChevronDown, ChevronUp, Building2, User, FileText, Landmark
} from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type PayrollItem = {
  id: number; type: "payroll"; displayName: string; netPay: string | null;
  paymentMethod: string | null; paymentStatus: string; chequeNumber: string | null;
  chequeImageUrl: string | null; chequeIssuedAt: Date | null; bankingStatus: string | null;
  bankedAt: Date | null; paidAt: Date | null; month: number; year: number; notes: string | null;
};
type ReceiptItem = {
  id: number; type: "receipt"; vendor: string | null; amount: string | null;
  departmentName: string | null; categoryName: string | null; status: string;
  chequeNumber: string | null; chequeImageUrl: string | null; chequeIssuedAt: Date | null;
  bankingStatus: string | null; bankedAt: Date | null; imageUrl: string | null;
};
type PaymentItem = (PayrollItem | ReceiptItem) & { _expanded?: boolean };

function fmt(v: string | number | null | undefined) {
  return `£${parseFloat(String(v ?? 0)).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MonthlyExpenses() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [filter, setFilter] = useState<"all" | "pending" | "paid" | "unbanked">("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Issue cheque dialog state
  const [issueDialog, setIssueDialog] = useState<{ open: boolean; item: PaymentItem | null }>({ open: false, item: null });
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeAmount, setChequeAmount] = useState("");
  const [chequePhotoUrl, setChequePhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const years = useMemo(() => { const y = now.getFullYear(); return [y, y - 1, y - 2]; }, []);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.expenses.pendingPayments.useQuery({ month, year });

  const markPayrollPaid = trpc.expenses.markPayrollPaid.useMutation({
    onSuccess: () => { utils.expenses.pendingPayments.invalidate(); toast.success("Payment marked as paid ✓"); setIssueDialog({ open: false, item: null }); },
    onError: (e) => toast.error(e.message),
  });
  const markReceiptPaid = trpc.expenses.markReceiptPaid.useMutation({
    onSuccess: () => { utils.expenses.pendingPayments.invalidate(); toast.success("Expense marked as paid ✓"); setIssueDialog({ open: false, item: null }); },
    onError: (e) => toast.error(e.message),
  });
  const markBanked = trpc.expenses.markBanked.useMutation({
    onSuccess: () => { utils.expenses.pendingPayments.invalidate(); toast.success("Marked as banked ✓"); },
    onError: (e) => toast.error(e.message),
  });

  const allItems: PaymentItem[] = [
    ...(data?.payroll ?? []) as PayrollItem[],
    ...(data?.receipts ?? []) as ReceiptItem[],
  ];

  const filteredItems = allItems.filter(item => {
    if (filter === "pending") {
      if (item.type === "payroll") return (item as PayrollItem).paymentStatus === "pending";
      if (item.type === "receipt") return (item as ReceiptItem).status !== "approved";
    }
    if (filter === "paid") {
      if (item.type === "payroll") return (item as PayrollItem).paymentStatus === "paid";
      if (item.type === "receipt") return (item as ReceiptItem).status === "approved";
    }
    if (filter === "unbanked") {
      return item.bankingStatus === "unbanked" && (
        item.type === "payroll" ? (item as PayrollItem).paymentStatus === "paid" : (item as ReceiptItem).status === "approved"
      );
    }
    return true;
  });

  function toggleExpand(key: string) {
    setExpandedIds(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  function openIssueDialog(item: PaymentItem) {
    setIssueDialog({ open: true, item });
    setChequeNumber("");
    setChequeAmount(item.type === "payroll" ? String(item.netPay ?? "") : String((item as ReceiptItem).amount ?? ""));
    setChequePhotoUrl("");
  }

  async function uploadChequePhoto(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload-receipt", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const json = await res.json();
      setChequePhotoUrl(json.url);
      toast.success("Cheque photo uploaded");
    } catch {
      toast.error("Photo upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function confirmIssueCheque() {
    const item = issueDialog.item;
    if (!item) return;
    if (item.type === "payroll") {
      await markPayrollPaid.mutateAsync({ id: item.id, chequeNumber: chequeNumber || undefined, chequeImageUrl: chequePhotoUrl || undefined, chequeAmount: chequeAmount || undefined });
    } else {
      await markReceiptPaid.mutateAsync({ id: item.id, chequeNumber: chequeNumber || undefined, chequeImageUrl: chequePhotoUrl || undefined });
    }
  }

  const summary = data?.summary;
  const isPending = markPayrollPaid.isPending || markReceiptPaid.isPending;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Monthly Expenses</h1>
          <p className="page-subtitle">Issue cheques, track cash payments, and monitor unbanked funds</p>
        </div>
      </div>

      {/* Month / Year selector */}
      <div className="flex gap-3 flex-wrap items-center">
        <Select value={month.toString()} onValueChange={v => setMonth(parseInt(v))}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={year.toString()} onValueChange={v => setYear(parseInt(v))}>
          <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Pending", value: summary.totalPending, icon: Clock, color: "bg-amber-100 text-amber-700", onClick: () => setFilter("pending") },
            { label: "Paid", value: summary.totalPaid, icon: CheckCircle2, color: "bg-green-100 text-green-700", onClick: () => setFilter("paid") },
            { label: "Unbanked Cash", value: summary.unbankedCash, icon: Banknote, color: "bg-blue-100 text-blue-700", onClick: () => setFilter("unbanked") },
            { label: "Unbanked Cheques", value: summary.unbankedCheques, icon: CreditCard, color: "bg-purple-100 text-purple-700", onClick: () => setFilter("unbanked") },
          ].map(({ label, value, icon: Icon, color, onClick }) => (
            <button key={label} onClick={onClick} className={`stat-card text-left hover:ring-2 hover:ring-primary/30 transition-all ${filter !== "all" && label.toLowerCase().includes(filter) ? "ring-2 ring-primary" : ""}`}>
              <div className="flex items-center gap-2">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-bold text-sm">{fmt(value)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "pending", "paid", "unbanked"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== "all" && (
              <span className="ml-1 opacity-70">
                ({f === "pending" ? allItems.filter(i => i.type === "payroll" ? (i as PayrollItem).paymentStatus === "pending" : (i as ReceiptItem).status !== "approved").length
                  : f === "paid" ? allItems.filter(i => i.type === "payroll" ? (i as PayrollItem).paymentStatus === "paid" : (i as ReceiptItem).status === "approved").length
                  : allItems.filter(i => i.bankingStatus === "unbanked" && (i.type === "payroll" ? (i as PayrollItem).paymentStatus === "paid" : (i as ReceiptItem).status === "approved")).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Payment list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading payments...
        </div>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No {filter !== "all" ? filter : ""} payments for {MONTHS[month - 1]} {year}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredItems.map(item => {
            const key = `${item.type}-${item.id}`;
            const expanded = expandedIds.has(key);
            const isPaid = item.type === "payroll" ? (item as PayrollItem).paymentStatus === "paid" : (item as ReceiptItem).status === "approved";
            const isBanked = item.bankingStatus === "banked";
            const amount = item.type === "payroll" ? (item as PayrollItem).netPay : (item as ReceiptItem).amount;
            const label = item.type === "payroll" ? (item as PayrollItem).displayName : ((item as ReceiptItem).vendor ?? "Expense");
            const subLabel = item.type === "payroll" ? `Payroll · ${MONTHS[(item as PayrollItem).month - 1]} ${(item as PayrollItem).year}` : `${(item as ReceiptItem).departmentName ?? ""} · ${(item as ReceiptItem).categoryName ?? "Receipt"}`;
            const method = item.type === "payroll" ? (item as PayrollItem).paymentMethod : "cheque";
            const paidAt = item.type === "payroll" ? (item as PayrollItem).paidAt : (item as ReceiptItem).chequeIssuedAt;

            return (
              <Card key={key} className={`border transition-all ${isPaid ? (isBanked ? "border-green-200 bg-green-50/20" : "border-amber-200 bg-amber-50/20") : "border-border"}`}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    {/* Status icon */}
                    <div className={`flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center ${isPaid ? "bg-green-100" : "bg-amber-100"}`}>
                      {isPaid ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Clock className="h-5 w-5 text-amber-600" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{label}</span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${item.type === "payroll" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                          {item.type === "payroll" ? <User className="h-2.5 w-2.5 mr-0.5" /> : <Building2 className="h-2.5 w-2.5 mr-0.5" />}
                          {item.type === "payroll" ? "Payroll" : "Expense"}
                        </span>
                        {method === "cash" && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700"><Banknote className="h-2.5 w-2.5 mr-0.5" />Cash</span>}
                        {method === "cheque" && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700"><CreditCard className="h-2.5 w-2.5 mr-0.5" />Cheque</span>}
                        {isPaid && !isBanked && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700"><AlertCircle className="h-2.5 w-2.5 mr-0.5" />Unbanked</span>}
                        {isBanked && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700"><Landmark className="h-2.5 w-2.5 mr-0.5" />Banked</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{subLabel}</p>
                      {isPaid && paidAt && <p className="text-xs text-green-700 mt-0.5">Paid {fmtDate(paidAt)}</p>}
                    </div>

                    {/* Amount */}
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-sm">{fmt(amount)}</p>
                    </div>

                    {/* Expand toggle */}
                    <button onClick={() => toggleExpand(key)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Expanded details */}
                  {expanded && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                      {/* Cheque details if paid */}
                      {isPaid && item.chequeNumber && (
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p><span className="font-medium">Cheque #:</span> {item.chequeNumber}</p>
                          {item.chequeIssuedAt && <p><span className="font-medium">Issued:</span> {fmtDate(item.chequeIssuedAt)}</p>}
                          {isBanked && item.bankedAt && <p><span className="font-medium">Banked:</span> {fmtDate(item.bankedAt)}</p>}
                        </div>
                      )}

                      {/* Cheque photo */}
                      {item.chequeImageUrl && (
                        <a href={item.chequeImageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                          <Camera className="h-3 w-3" /> View cheque photo
                        </a>
                      )}

                      {/* Receipt image */}
                      {item.type === "receipt" && (item as ReceiptItem).imageUrl && (
                        <a href={(item as ReceiptItem).imageUrl!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                          <FileText className="h-3 w-3" /> View receipt
                        </a>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap">
                        {!isPaid && (
                          <Button size="sm" className="h-7 text-xs" onClick={() => openIssueDialog(item)}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {method === "cheque" ? "Issue Cheque" : "Mark Cash Paid"}
                          </Button>
                        )}
                        {isPaid && !isBanked && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markBanked.mutate({ type: item.type as "payroll" | "receipt", id: item.id })}>
                            <Landmark className="h-3 w-3 mr-1" /> Mark as Banked
                          </Button>
                        )}
                        {isPaid && !item.chequeImageUrl && method === "cheque" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openIssueDialog(item)}>
                            <Camera className="h-3 w-3 mr-1" /> Add Cheque Photo
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Issue Cheque / Mark Paid Dialog */}
      <Dialog open={issueDialog.open} onOpenChange={open => setIssueDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {issueDialog.item?.type === "payroll" && (issueDialog.item as PayrollItem).paymentMethod === "cash"
                ? "Mark Cash Payment"
                : "Issue Cheque"}
            </DialogTitle>
          </DialogHeader>

          {issueDialog.item && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="font-medium">
                  {issueDialog.item.type === "payroll"
                    ? (issueDialog.item as PayrollItem).displayName
                    : (issueDialog.item as ReceiptItem).vendor ?? "Expense"}
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Amount: <strong>{fmt(issueDialog.item.type === "payroll" ? (issueDialog.item as PayrollItem).netPay : (issueDialog.item as ReceiptItem).amount)}</strong>
                </p>
              </div>

              {/* Only show cheque fields for cheque payments */}
              {(issueDialog.item.type === "receipt" || (issueDialog.item as PayrollItem).paymentMethod === "cheque") && (
                <>
                  <div>
                    <Label className="text-xs">Cheque Number</Label>
                    <Input className="h-8 text-sm mt-1" value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} placeholder="e.g. 000123" />
                  </div>
                  <div>
                    <Label className="text-xs">Cheque Amount (£)</Label>
                    <Input className="h-8 text-sm mt-1" type="number" step="0.01" value={chequeAmount} onChange={e => setChequeAmount(e.target.value)} />
                  </div>

                  {/* Cheque photo upload */}
                  <div>
                    <Label className="text-xs">Photo of Written Cheque</Label>
                    <div
                      className={`mt-1 border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${uploading ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/50"}`}
                      onClick={() => !uploading && photoInputRef.current?.click()}
                    >
                      {uploading ? (
                        <div className="flex items-center justify-center gap-2 text-xs text-primary">
                          <Loader2 className="h-3 w-3 animate-spin" /> Uploading...
                        </div>
                      ) : chequePhotoUrl ? (
                        <div className="flex items-center justify-center gap-2 text-xs">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          <span className="text-green-700">Photo uploaded</span>
                          <a href={chequePhotoUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" onClick={e => e.stopPropagation()}>View</a>
                        </div>
                      ) : (
                        <div className="text-muted-foreground text-xs">
                          <Camera className="h-4 w-4 mx-auto mb-1 opacity-50" />
                          Tap to take/upload cheque photo
                        </div>
                      )}
                    </div>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadChequePhoto(f); e.target.value = ""; }}
                    />
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setIssueDialog({ open: false, item: null })}>Cancel</Button>
                <Button className="flex-1" disabled={isPending || uploading} onClick={confirmIssueCheque}>
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  Confirm Paid
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
