import { useState, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2, XCircle, Camera, FileText, ChevronDown, ChevronUp,
  Plus, Loader2, AlertTriangle, Clock, Users, Briefcase, Heart, BookOpen,
  ShieldCheck, ShieldX, History,
} from "lucide-react";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

type ItemType = "payroll" | "receipt" | "volunteer" | "loan";

interface BaseItem {
  id: number;
  type: ItemType;
  displayName: string;
  amount: string | number;
  paymentMethod: string | null;
  chequeNumber?: string | null;
  chequeImageUrl?: string | null;
  invoiceUrl?: string | null;
  evidenceUrl?: string | null;
  paidAt?: Date | null;
  authorisedById?: number | null;
  authorisedByName?: string | null;
  authorisedAt?: Date | null;
  rejectedById?: number | null;
  rejectedByName?: string | null;
  rejectedAt?: Date | null;
  rejectionComment?: string | null;
  deferredToMonth?: number | null;
  deferredToYear?: number | null;
  notes?: string | null;
}

function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? "£0.00" : `£${n.toFixed(2)}`;
}

function AuthBadge({ item }: { item: BaseItem }) {
  if (item.authorisedAt && item.authorisedByName) {
    return (
      <div className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5">
        <ShieldCheck className="h-3 w-3" />
        Authorised by <strong>{item.authorisedByName}</strong> at {new Date(item.authorisedAt).toLocaleString()}
      </div>
    );
  }
  if (item.rejectedAt && item.rejectedByName) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">
          <ShieldX className="h-3 w-3" />
          Rejected by <strong>{item.rejectedByName}</strong> at {new Date(item.rejectedAt).toLocaleString()}
          {item.deferredToMonth && (
            <span className="ml-1 text-orange-600 flex items-center gap-0.5">
              <History className="h-3 w-3" />→ {MONTHS[(item.deferredToMonth ?? 1) - 1]} {item.deferredToYear}
            </span>
          )}
        </div>
        {item.rejectionComment && (
          <p className="text-xs text-red-600 px-2">Comment: {item.rejectionComment}</p>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
      <Clock className="h-3 w-3" />Awaiting authorisation
    </div>
  );
}

// ─── Evidence Upload Dialog ──────────────────────────────────────────────────
function EvidenceDialog({
  open, onClose, item, month, year,
}: {
  open: boolean; onClose: () => void; item: BaseItem | null; month: number; year: number;
}) {
  const [chequeFile, setChequeFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [chequeNumber, setChequeNumber] = useState(item?.chequeNumber ?? "");
  const [chequeDate, setChequeDate] = useState("");
  const [chequeAmount, setChequeAmount] = useState("");
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const chequeRef = useRef<HTMLInputElement>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const extractCheque = trpc.expenses.extractChequeData.useMutation();
  const nowPaid = trpc.expenses.nowPaid.useMutation({
    onSuccess: () => {
      utils.expenses.allItems.invalidate();
      toast.success("Payment recorded with evidence");
      onClose();
    },
  });

  const uploadFile = async (file: File, folder: string): Promise<string | undefined> => {
    const form = new FormData();
    form.append("file", file);
    form.append("key", `monthly-expenses/${folder}/${Date.now()}-${file.name}`);
    form.append("mimeType", file.type);
    const res = await fetch("/api/upload-receipt", { method: "POST", body: form });
    if (!res.ok) return undefined;
    const { url } = await res.json();
    return url as string;
  };

  const handleChequeUpload = async (file: File) => {
    setChequeFile(file);
    // Auto-extract cheque data
    setExtracting(true);
    try {
      const uploadRes = await uploadFile(file, "cheques-temp");
      if (uploadRes) {
        const result = await extractCheque.mutateAsync({ imageUrl: uploadRes });
        if (result.success && result.data) {
          if (result.data.chequeNumber) setChequeNumber(result.data.chequeNumber);
          if (result.data.date) setChequeDate(result.data.date);
          if (result.data.amount) setChequeAmount(result.data.amount);
          toast.success("Cheque data extracted automatically");
        }
      }
    } catch {
      // Extraction failed silently — user can fill manually
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!item) return;
    setUploading(true);
    try {
      let chequeUrl: string | undefined;
      let invoiceUrl: string | undefined;
      if (chequeFile) chequeUrl = await uploadFile(chequeFile, "cheques");
      if (invoiceFile) invoiceUrl = await uploadFile(invoiceFile, "invoices");
      nowPaid.mutate({
        type: item.type as any,
        id: item.id,
        chequeNumber: chequeNumber || undefined,
        chequeImageUrl: chequeUrl,
        invoiceUrl,
      });
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Evidence & Payment — {item.displayName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-muted rounded-lg p-3 flex justify-between text-sm">
            <span>Amount</span><span className="font-bold text-base">{fmt(item.amount)}</span>
          </div>

          {/* Cheque photo */}
          <div>
            <Label className="text-sm font-medium flex items-center gap-1 mb-1.5">
              <Camera className="h-4 w-4" />Cheque Photo
              {extracting && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Extracting data…</span>}
            </Label>
            <input ref={chequeRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleChequeUpload(f); }} />
            {chequeFile ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 border rounded">
                <FileText className="h-4 w-4" /><span className="truncate flex-1">{chequeFile.name}</span>
                <button className="text-destructive text-xs" onClick={() => setChequeFile(null)}>Remove</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { chequeRef.current?.setAttribute("capture","environment"); chequeRef.current?.click(); }}>
                  <Camera className="h-4 w-4 mr-1" />Take Photo
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { chequeRef.current?.removeAttribute("capture"); chequeRef.current?.click(); }}>
                  Upload
                </Button>
              </div>
            )}
          </div>

          {/* Auto-populated cheque fields */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Cheque No.</Label>
              <Input value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} placeholder="000000" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Date on Cheque</Label>
              <Input type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Amount on Cheque</Label>
              <Input value={chequeAmount} onChange={e => setChequeAmount(e.target.value)} placeholder="0.00" className="h-8 text-sm" />
            </div>
          </div>

          {/* Invoice / receipt */}
          <div>
            <Label className="text-sm font-medium flex items-center gap-1 mb-1.5">
              <FileText className="h-4 w-4" />Invoice / Receipt
            </Label>
            <input ref={invoiceRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
              onChange={e => setInvoiceFile(e.target.files?.[0] ?? null)} />
            {invoiceFile ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 border rounded">
                <FileText className="h-4 w-4" /><span className="truncate flex-1">{invoiceFile.name}</span>
                <button className="text-destructive text-xs" onClick={() => setInvoiceFile(null)}>Remove</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { invoiceRef.current?.setAttribute("capture","environment"); invoiceRef.current?.click(); }}>
                  <Camera className="h-4 w-4 mr-1" />Take Photo
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { invoiceRef.current?.removeAttribute("capture"); invoiceRef.current?.click(); }}>
                  Upload
                </Button>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={handleSave} disabled={uploading || nowPaid.isPending}>
            {uploading || nowPaid.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save & Mark Paid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Expense Item Row ────────────────────────────────────────────────────────
function ExpenseRow({
  item, isAdmin, onEvidence, onAuthorise, onReject,
}: {
  item: BaseItem; isAdmin: boolean;
  onEvidence: (item: BaseItem) => void;
  onAuthorise: (item: BaseItem) => void;
  onReject: (item: BaseItem) => void;
}) {
  const isAuthorised = !!item.authorisedAt;
  const isRejected = !!item.rejectedAt && !item.authorisedAt;

  return (
    <div className={`rounded-lg border p-3 space-y-2 text-sm ${
      isRejected ? "bg-red-50 border-red-300 dark:bg-red-950/20 dark:border-red-700" :
      isAuthorised ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800" :
      "bg-card border-border"
    }`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{item.displayName}</span>
            {item.paymentMethod && (
              <Badge variant="secondary" className="text-xs capitalize">{item.paymentMethod?.replace("_"," ")}</Badge>
            )}
            {item.paidAt && (
              <Badge className="bg-green-600 text-white text-xs">Paid {new Date(item.paidAt).toLocaleDateString()}</Badge>
            )}
          </div>
          {item.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.notes}</p>}
          <div className="flex gap-3 mt-1 flex-wrap">
            {item.chequeImageUrl && (
              <a href={item.chequeImageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline flex items-center gap-1">
                <FileText className="h-3 w-3" />Cheque photo
              </a>
            )}
            {(item.invoiceUrl || item.evidenceUrl) && (
              <a href={(item.invoiceUrl ?? item.evidenceUrl)!} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline flex items-center gap-1">
                <FileText className="h-3 w-3" />Invoice/evidence
              </a>
            )}
            {item.chequeNumber && <span className="text-xs text-muted-foreground">Cheque #{item.chequeNumber}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-semibold text-base">{fmt(item.amount)}</span>
          {/* Evidence upload */}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onEvidence(item)}>
            <Camera className="h-3 w-3 mr-1" />Evidence
          </Button>
          {/* Authorise / Reject — admin only */}
          {isAdmin && (
            <>
              <Button
                size="sm"
                className={`h-7 text-xs ${isAuthorised ? "bg-green-600 hover:bg-green-700" : "bg-green-600 hover:bg-green-700"}`}
                onClick={() => onAuthorise(item)}
                title="Authorise (green tick)"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-red-600 border-red-400 hover:bg-red-50"
                onClick={() => onReject(item)}
                title="Reject (red X) — moves to next month"
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
      <AuthBadge item={item} />
    </div>
  );
}

// ─── Section Component ───────────────────────────────────────────────────────
function Section({
  title, icon, items, isAdmin, onEvidence, onAuthorise, onReject, onAdd,
}: {
  title: string; icon: React.ReactNode; items: BaseItem[]; isAdmin: boolean;
  onEvidence: (i: BaseItem) => void; onAuthorise: (i: BaseItem) => void; onReject: (i: BaseItem) => void;
  onAdd?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const total = items.reduce((s, r) => s + parseFloat(String(r.amount ?? "0")), 0);
  const authorised = items.filter(r => r.authorisedAt).length;
  const rejected = items.filter(r => r.rejectedAt && !r.authorisedAt).length;
  const pending = items.length - authorised - rejected;

  return (
    <Card className="mb-3">
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-sm">{title}</CardTitle>
            <Badge variant="secondary" className="text-xs">{items.length}</Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Total: <strong>{fmt(total)}</strong></span>
            {authorised > 0 && <span className="text-green-600">{authorised} authorised</span>}
            {rejected > 0 && <span className="text-red-600">{rejected} rejected</span>}
            {pending > 0 && <span className="text-amber-600">{pending} pending</span>}
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center">No items for this month.</p>
          ) : (
            items.map(item => (
              <ExpenseRow key={`${item.type}-${item.id}`} item={item} isAdmin={isAdmin} onEvidence={onEvidence} onAuthorise={onAuthorise} onReject={onReject} />
            ))
          )}
          {onAdd && isAdmin && (
            <Button variant="outline" size="sm" className="w-full mt-2 border-dashed" onClick={onAdd}>
              <Plus className="h-4 w-4 mr-2" />Add Item
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Add Volunteer Dialog ────────────────────────────────────────────────────
function AddVolunteerDialog({ open, onClose, month, year }: { open: boolean; onClose: () => void; month: number; year: number }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [method, setMethod] = useState<"cash"|"cheque"|"bank_transfer">("cash");
  const utils = trpc.useUtils();
  const create = trpc.expenses.volunteerPayments.create.useMutation({
    onSuccess: () => { utils.expenses.allItems.invalidate(); toast.success("Volunteer payment added"); onClose(); setName(""); setAmount(""); setDesc(""); },
  });
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Volunteer Payment</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>Recipient Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" /></div>
          <div><Label>Email (optional)</Label><Input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email@example.com" /></div>
          <div><Label>Amount (£) *</Label><Input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" placeholder="0.00" /></div>
          <div><Label>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Purpose of payment" /></div>
          <div><Label>Payment Method</Label>
            <Select value={method} onValueChange={v => setMethod(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate({ recipientName: name, recipientEmail: email || undefined, month, year, amount, description: desc, paymentMethod: method })} disabled={!name || !amount || create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Add Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function MonthlyExpenses() {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [evidenceItem, setEvidenceItem] = useState<BaseItem | null>(null);
  const [rejectItem, setRejectItem] = useState<BaseItem | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [addVolOpen, setAddVolOpen] = useState(false);

  const isAdmin = ["superadmin", "admin", "trustee", "manager"].includes(user?.role ?? "");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.expenses.allItems.useQuery(
    { month, year },
    { refetchOnWindowFocus: false }
  );

  const authorise = trpc.expenses.authorise.useMutation({
    onSuccess: (res) => {
      utils.expenses.allItems.invalidate();
      toast.success(`Authorised by ${res.authorisedByName} at ${new Date(res.authorisedAt!).toLocaleString()}`);
    },
    onError: e => toast.error(e.message),
  });

  const reject = trpc.expenses.reject.useMutation({
    onSuccess: (res) => {
      utils.expenses.allItems.invalidate();
      toast.success(`Rejected — deferred to ${MONTHS[(res.deferredToMonth ?? 1) - 1]} ${res.deferredToYear}`);
      setRejectItem(null);
      setRejectComment("");
    },
    onError: e => toast.error(e.message),
  });

  // Map raw data to BaseItem[]
  const payrollItems: BaseItem[] = useMemo(() => (data?.payroll ?? []).map(r => ({
    id: r.id, type: "payroll" as const,
    displayName: r.employeeName ?? r.fullName ?? `Employee #${r.id}`,
    amount: r.netPay ?? "0",
    paymentMethod: r.paymentMethod,
    chequeNumber: r.chequeNumber, chequeImageUrl: r.chequeImageUrl,
    invoiceUrl: r.invoiceUrl, paidAt: r.paidAt,
    authorisedById: r.authorisedById, authorisedByName: r.authorisedByName, authorisedAt: r.authorisedAt,
    rejectedById: r.rejectedById, rejectedByName: r.rejectedByName, rejectedAt: r.rejectedAt,
    rejectionComment: r.rejectionComment, deferredToMonth: r.deferredToMonth, deferredToYear: r.deferredToYear,
    notes: r.notes,
  })), [data]);

  const receiptItems: BaseItem[] = useMemo(() => (data?.receipts ?? []).map(r => ({
    id: r.id, type: "receipt" as const,
    displayName: r.vendor ?? r.submitterName ?? `Receipt #${r.id}`,
    amount: r.totalAmount ?? r.amount ?? "0",
    paymentMethod: r.paymentMethod ? "cheque" : "other",
    chequeNumber: r.chequeNumber, chequeImageUrl: r.chequeImageUrl,
    invoiceUrl: r.invoiceUrl ?? r.imageUrl, paidAt: r.paidAt,
    authorisedById: r.authorisedById, authorisedByName: r.authorisedByName, authorisedAt: r.authorisedAt,
    rejectedById: r.rejectedById, rejectedByName: r.rejectedByName, rejectedAt: r.rejectedAt,
    rejectionComment: r.rejectionComment, deferredToMonth: r.deferredToMonth, deferredToYear: r.deferredToYear,
    notes: r.notes,
  })), [data]);

  const volunteerItems: BaseItem[] = useMemo(() => (data?.volunteers ?? []).map(r => ({
    id: r.id, type: "volunteer" as const,
    displayName: r.recipientName,
    amount: r.amount ?? "0",
    paymentMethod: r.paymentMethod,
    chequeNumber: r.chequeNumber, chequeImageUrl: r.chequeImageUrl,
    invoiceUrl: r.invoiceUrl, paidAt: r.paidAt,
    authorisedById: r.authorisedById, authorisedByName: r.authorisedByName, authorisedAt: r.authorisedAt,
    rejectedById: r.rejectedById, rejectedByName: r.rejectedByName, rejectedAt: r.rejectedAt,
    rejectionComment: r.rejectionComment, deferredToMonth: r.deferredToMonth, deferredToYear: r.deferredToYear,
    notes: r.notes,
  })), [data]);

  const loanItems: BaseItem[] = useMemo(() => (data?.loans ?? []).map(r => ({
    id: r.id, type: "loan" as const,
    displayName: r.borrowerName ?? `Loan Repayment #${r.id}`,
    amount: r.amount ?? "0",
    paymentMethod: r.paymentMethod,
    chequeNumber: r.chequeNumber, chequeImageUrl: r.chequeImageUrl,
    invoiceUrl: r.invoiceUrl, evidenceUrl: r.evidenceUrl, paidAt: r.paidAt,
    authorisedById: r.authorisedById, authorisedByName: r.authorisedByName, authorisedAt: r.authorisedAt,
    rejectedById: r.rejectedById, rejectedByName: r.rejectedByName, rejectedAt: r.rejectedAt,
    rejectionComment: r.rejectionComment, deferredToMonth: r.deferredToMonth, deferredToYear: r.deferredToYear,
    notes: r.notes,
  })), [data]);

  const allItems = [...payrollItems, ...receiptItems, ...volunteerItems, ...loanItems];
  const totalAll = allItems.reduce((s, r) => s + parseFloat(String(r.amount ?? "0")), 0);
  const totalAuthorised = allItems.filter(r => r.authorisedAt).reduce((s, r) => s + parseFloat(String(r.amount ?? "0")), 0);
  const totalPending = allItems.filter(r => !r.authorisedAt && !r.rejectedAt).reduce((s, r) => s + parseFloat(String(r.amount ?? "0")), 0);
  const totalRejected = allItems.filter(r => r.rejectedAt && !r.authorisedAt).reduce((s, r) => s + parseFloat(String(r.amount ?? "0")), 0);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />Monthly Expenses
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Data entry, evidence capture, and superadmin authorisation for all payment types
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Admin notice */}
      {isAdmin && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-5 text-sm">
          <ShieldCheck className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Authorisation Mode Active</strong> — You are signed in as <strong>{user?.name}</strong>.
            Use <CheckCircle2 className="h-3.5 w-3.5 inline text-green-600" /> to authorise (stamps your name + datetime) or <XCircle className="h-3.5 w-3.5 inline text-red-600" /> to reject and defer to next month.
          </div>
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground mb-1">Total Items</p>
          <p className="text-xl font-bold">{fmt(totalAll)}</p>
          <p className="text-xs text-muted-foreground">{allItems.length} items</p>
        </CardContent></Card>
        <Card className="border-green-300"><CardContent className="p-3">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-green-600" />Authorised</p>
          <p className="text-xl font-bold text-green-600">{fmt(totalAuthorised)}</p>
        </CardContent></Card>
        <Card className="border-amber-300"><CardContent className="p-3">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Clock className="h-3 w-3 text-amber-600" />Pending</p>
          <p className="text-xl font-bold text-amber-600">{fmt(totalPending)}</p>
        </CardContent></Card>
        <Card className="border-red-300"><CardContent className="p-3">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><ShieldX className="h-3 w-3 text-red-600" />Rejected</p>
          <p className="text-xl font-bold text-red-600">{fmt(totalRejected)}</p>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />Loading expenses…
        </div>
      ) : (
        <>
          <Section
            title="Staff Payroll"
            icon={<Briefcase className="h-4 w-4 text-amber-500" />}
            items={payrollItems}
            isAdmin={isAdmin}
            onEvidence={setEvidenceItem}
            onAuthorise={item => authorise.mutate({ type: item.type, id: item.id })}
            onReject={item => { setRejectItem(item); setRejectComment(""); }}
          />
          <Section
            title="Invoices & Staff Receipts"
            icon={<FileText className="h-4 w-4 text-purple-600" />}
            items={receiptItems}
            isAdmin={isAdmin}
            onEvidence={setEvidenceItem}
            onAuthorise={item => authorise.mutate({ type: item.type, id: item.id })}
            onReject={item => { setRejectItem(item); setRejectComment(""); }}
          />
          <Section
            title="Volunteer Payments"
            icon={<Heart className="h-4 w-4 text-orange-500" />}
            items={volunteerItems}
            isAdmin={isAdmin}
            onEvidence={setEvidenceItem}
            onAuthorise={item => authorise.mutate({ type: item.type, id: item.id })}
            onReject={item => { setRejectItem(item); setRejectComment(""); }}
            onAdd={() => setAddVolOpen(true)}
          />
          <Section
            title="Qarde Hasan Repayments"
            icon={<BookOpen className="h-4 w-4 text-blue-600" />}
            items={loanItems}
            isAdmin={isAdmin}
            onEvidence={setEvidenceItem}
            onAuthorise={item => authorise.mutate({ type: item.type, id: item.id })}
            onReject={item => { setRejectItem(item); setRejectComment(""); }}
          />

          {allItems.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Briefcase className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No expenses for {MONTHS[month-1]} {year}</p>
              <p className="text-sm mt-1">Add payroll records, receipts, volunteer payments, or Qarde Hasan repayments to see them here.</p>
            </div>
          )}
        </>
      )}

      {/* Evidence Dialog */}
      <EvidenceDialog
        open={!!evidenceItem}
        onClose={() => setEvidenceItem(null)}
        item={evidenceItem}
        month={month}
        year={year}
      />

      {/* Reject Dialog */}
      <Dialog open={!!rejectItem} onOpenChange={o => { if (!o) setRejectItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" />Reject Payment — {rejectItem?.displayName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-muted rounded-lg p-3 flex justify-between text-sm">
              <span>Amount</span><span className="font-bold">{fmt(rejectItem?.amount)}</span>
            </div>
            <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 rounded-lg text-xs text-orange-700">
              <History className="h-3.5 w-3.5 inline mr-1" />
              This item will be marked <strong>red</strong> and automatically <strong>deferred to {
                rejectItem ? MONTHS[(month === 12 ? 0 : month)] : "next month"
              } {month === 12 ? year + 1 : year}</strong> for payment.
            </div>
            <div>
              <Label className="text-sm font-medium mb-1 block">Reason / Comment</Label>
              <Textarea
                placeholder="e.g. Invoice missing, amount query, insufficient funds…"
                value={rejectComment}
                onChange={e => setRejectComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectItem(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={() => {
              if (!rejectItem) return;
              reject.mutate({ type: rejectItem.type, id: rejectItem.id, comment: rejectComment, month, year });
            }} disabled={reject.isPending}>
              {reject.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Reject & Defer to Next Month
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Volunteer Dialog */}
      <AddVolunteerDialog open={addVolOpen} onClose={() => setAddVolOpen(false)} month={month} year={year} />
    </div>
  );
}
