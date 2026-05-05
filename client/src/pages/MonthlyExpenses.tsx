import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2, XCircle, Camera, FileText, ChevronDown, ChevronUp,
  Plus, Loader2, AlertTriangle, Clock, Briefcase, Heart, BookOpen,
  ShieldCheck, ShieldX, History, Receipt, Sparkles,
} from "lucide-react";

// ─── Category taxonomy ────────────────────────────────────────────────────────
export const INVOICE_CATEGORIES: Record<string, string[]> = {
  "Restaurant": ["Staff Meals", "Client Hospitality", "Events Catering", "Other"],
  "Cleaning": ["Office Cleaning", "Venue Cleaning", "Deep Clean", "Supplies", "Other"],
  "Events": ["Venue Hire", "Equipment Hire", "Decorations", "Printing", "Photography", "Other"],
  "Wholesale": ["Food & Drink", "Stationery", "Cleaning Supplies", "Other"],
  "Temp Staff": ["Agency Fee", "Direct Payment", "Other"],
  "Travel": ["Fuel", "Train/Bus", "Taxi/Uber", "Parking", "Accommodation", "Other"],
  "Trustees": ["Meeting Expenses", "Training", "Other"],
  "Maintenance — Accommodation": ["Repairs", "Plumbing", "Electrical", "Decorating", "Furniture", "Other"],
  "Maintenance — Red Brick": ["Repairs", "Plumbing", "Electrical", "Decorating", "Furniture", "Other"],
  "Maintenance — Old Mosque": ["Repairs", "Plumbing", "Electrical", "Decorating", "Furniture", "Other"],
  "Uniforms": ["Staff Uniforms", "Volunteer Uniforms", "PPE", "Other"],
  "Accommodation Expenses": ["Utilities", "Council Tax", "Insurance", "Rent", "Other"],
  "Other": ["General", "Miscellaneous"],
};

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

type ItemType = "payroll" | "receipt" | "volunteer" | "loan" | "invoice";

interface BaseItem {
  id: number;
  type: ItemType;
  displayName: string;
  amount: string | number;
  paymentMethod?: string | null;
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
  // Invoice-specific
  category?: string | null;
  subCategory?: string | null;
  description?: string | null;
  invoiceNumber?: string | null;
}

function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? "£0.00" : `£${n.toFixed(2)}`;
}

// ─── Auth Badge ───────────────────────────────────────────────────────────────
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

// ─── Universal Evidence Upload Dialog ─────────────────────────────────────────
function EvidenceDialog({
  open, onClose, item, month, year, onInvoiceMarkPaid,
}: {
  open: boolean; onClose: () => void; item: BaseItem | null; month: number; year: number;
  onInvoiceMarkPaid?: (id: number, data: { chequeNumber?: string; chequeImageUrl?: string; evidenceUrl?: string; paymentMethod?: "cheque" | "bank_transfer" | "cash" }) => void;
}) {
  const [chequeFile, setChequeFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [chequeNumber, setChequeNumber] = useState(item?.chequeNumber ?? "");
  const [chequeDate, setChequeDate] = useState("");
  const [chequeAmount, setChequeAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cheque" | "bank_transfer" | "cash">("cheque");
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedFields, setExtractedFields] = useState<Record<string, string | null>>({});
  const chequeRef = useRef<HTMLInputElement>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const extractEvidence = trpc.expenses.extractEvidence.useMutation();
  const nowPaid = trpc.expenses.nowPaid.useMutation({
    onSuccess: () => {
      utils.expenses.allItems.invalidate();
      toast.success("Payment recorded with evidence");
      onClose();
    },
  });
  const invoiceMarkPaid = trpc.invoices.markPaid.useMutation({
    onSuccess: () => {
      utils.invoices.list.invalidate();
      toast.success("Invoice payment recorded");
      onClose();
    },
  });

  const uploadFile = async (file: File, folder: string): Promise<string | undefined> => {
    const form = new FormData();
    form.append("file", file);
    form.append("key", `monthly-expenses/${folder}/${Date.now()}-${file.name}`);
    form.append("mimeType", file.type);
    const res = await fetch("/api/upload-receipt", { method: "POST", body: form, credentials: "include" });
    if (!res.ok) return undefined;
    const { url } = await res.json();
    return url as string;
  };

  const handleEvidenceUpload = async (file: File, type: "cheque" | "invoice") => {
    if (type === "cheque") setChequeFile(file);
    else setInvoiceFile(file);
    setExtracting(true);
    try {
      const tempUrl = await uploadFile(file, "evidence-temp");
      if (tempUrl) {
        const docType = type === "cheque" ? "cheque" : "invoice";
        const result = await extractEvidence.mutateAsync({ imageUrl: tempUrl, documentType: docType });
        if (result.success && result.data) {
          const d = result.data;
          const fields: Record<string, string | null> = {};
          if (d.chequeNumber) { setChequeNumber(d.chequeNumber); fields.chequeNumber = d.chequeNumber; }
          if (d.date) { setChequeDate(d.date); fields.date = d.date; }
          if (d.amount) { setChequeAmount(d.amount); fields.amount = d.amount; }
          if (d.vendor) { setExtractedVendor(d.vendor); fields.vendor = d.vendor; }
          if (d.invoiceNumber) { setExtractedInvoiceNumber(d.invoiceNumber); fields.invoiceNumber = d.invoiceNumber; }
          if (d.description) { setExtractedDescription(d.description); fields.description = d.description; }
          setExtractedFields(fields);
          toast.success("AI extracted document data automatically");
        }
      }
    } catch {
      // Extraction failed silently
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!item) return;
    setUploading(true);
    try {
      let chequeUrl: string | undefined;
      let evidenceUrl: string | undefined;
      if (chequeFile) chequeUrl = await uploadFile(chequeFile, "cheques");
      if (invoiceFile) evidenceUrl = await uploadFile(invoiceFile, "invoices");

      if (item.type === "invoice") {
        if (onInvoiceMarkPaid) {
          onInvoiceMarkPaid(item.id, { chequeNumber: chequeNumber || undefined, chequeImageUrl: chequeUrl, evidenceUrl, paymentMethod });
        } else {
          invoiceMarkPaid.mutate({ id: item.id, chequeNumber: chequeNumber || undefined, chequeImageUrl: chequeUrl, evidenceUrl, paymentMethod });
        }
      } else {
        nowPaid.mutate({
          type: item.type as any,
          id: item.id,
          chequeNumber: chequeNumber || undefined,
          chequeImageUrl: chequeUrl,
          invoiceUrl: evidenceUrl,
        });
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />Evidence & Payment — {item.displayName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-muted rounded-lg p-3 flex justify-between text-sm">
            <span>Amount</span><span className="font-bold text-base">{fmt(item.amount)}</span>
          </div>

          {/* AI extraction notice */}
          <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
            <Sparkles className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            Upload any document — AI will automatically extract vendor, amount, date, cheque/invoice number, and description.
          </div>

          {/* Cheque photo */}
          <div>
            <Label className="text-sm font-medium flex items-center gap-1 mb-1.5">
              <Camera className="h-4 w-4" />Cheque Photo
              {extracting && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Extracting…</span>}
            </Label>
            <input ref={chequeRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleEvidenceUpload(f, "cheque"); }} />
            {chequeFile ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 border rounded">
                <FileText className="h-4 w-4" /><span className="truncate flex-1">{chequeFile.name}</span>
                <button className="text-destructive text-xs" onClick={() => setChequeFile(null)}>Remove</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => chequeRef.current?.click()}>
                  <Camera className="h-4 w-4 mr-2" />Take Photo
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { if (chequeRef.current) { chequeRef.current.removeAttribute("capture"); chequeRef.current.click(); } }}>
                  <FileText className="h-4 w-4 mr-2" />Upload File
                </Button>
              </div>
            )}
          </div>

          {/* AI-extracted fields */}
          {Object.keys(extractedFields).length > 0 && (
            <div className="p-2 bg-green-50 border border-green-200 rounded text-xs space-y-0.5">
              <p className="font-medium text-green-700 flex items-center gap-1"><Sparkles className="h-3 w-3" />AI Extracted:</p>
              {extractedFields.vendor && <p>Vendor: <strong>{extractedFields.vendor}</strong></p>}
              {extractedFields.amount && <p>Amount: <strong>£{extractedFields.amount}</strong></p>}
              {extractedFields.date && <p>Date: <strong>{extractedFields.date}</strong></p>}
              {extractedFields.invoiceNumber && <p>Invoice #: <strong>{extractedFields.invoiceNumber}</strong></p>}
              {extractedFields.description && <p>Description: <strong>{extractedFields.description}</strong></p>}
            </div>
          )}

          {/* Extracted metadata fields — editable */}
          {(extractedVendor || extractedInvoiceNumber || extractedDescription) && (
            <div className="space-y-2">
              {extractedVendor && (
                <div>
                  <Label className="text-xs mb-1 block">Vendor (AI extracted)</Label>
                  <Input value={extractedVendor} onChange={e => setExtractedVendor(e.target.value)} className="text-sm h-8" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {extractedInvoiceNumber && (
                  <div>
                    <Label className="text-xs mb-1 block">Invoice No. (AI extracted)</Label>
                    <Input value={extractedInvoiceNumber} onChange={e => setExtractedInvoiceNumber(e.target.value)} className="text-sm h-8" />
                  </div>
                )}
              </div>
              {extractedDescription && (
                <div>
                  <Label className="text-xs mb-1 block">Description (AI extracted)</Label>
                  <Input value={extractedDescription} onChange={e => setExtractedDescription(e.target.value)} className="text-sm h-8" />
                </div>
              )}
            </div>
          )}

          {/* Cheque details */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs mb-1 block">Cheque No.</Label>
              <Input value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} placeholder="000000" className="text-sm h-8" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Date</Label>
              <Input type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)} className="text-sm h-8" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Amount</Label>
              <Input value={chequeAmount} onChange={e => setChequeAmount(e.target.value)} placeholder="0.00" className="text-sm h-8" />
            </div>
          </div>

          {/* Invoice / evidence upload */}
          <div>
            <Label className="text-sm font-medium flex items-center gap-1 mb-1.5">
              <FileText className="h-4 w-4" />Invoice / Evidence
              {extracting && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Extracting…</span>}
            </Label>
            <input ref={invoiceRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleEvidenceUpload(f, "invoice"); }} />
            {invoiceFile ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 border rounded">
                <FileText className="h-4 w-4" /><span className="truncate flex-1">{invoiceFile.name}</span>
                <button className="text-destructive text-xs" onClick={() => setInvoiceFile(null)}>Remove</button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full" onClick={() => invoiceRef.current?.click()}>
                <FileText className="h-4 w-4 mr-2" />Upload Invoice / Evidence
              </Button>
            )}
          </div>

          {/* Payment method */}
          <div>
            <Label className="text-sm font-medium mb-1 block">Payment Method</Label>
            <Select value={paymentMethod} onValueChange={v => setPaymentMethod(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={uploading || nowPaid.isPending || invoiceMarkPaid.isPending}>
            {(uploading || nowPaid.isPending || invoiceMarkPaid.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Save Evidence & Mark Paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Expense Row ──────────────────────────────────────────────────────────────
function ExpenseRow({ item, isAdmin, onEvidence, onAuthorise, onReject }: {
  item: BaseItem; isAdmin: boolean;
  onEvidence: (i: BaseItem) => void;
  onAuthorise: (i: BaseItem) => void;
  onReject: (i: BaseItem) => void;
}) {
  const isAuthorised = !!item.authorisedAt;
  return (
    <div className={`p-3 border rounded-lg space-y-2 ${item.rejectedAt && !item.authorisedAt ? "border-red-300 bg-red-50/50" : isAuthorised ? "border-green-300 bg-green-50/30" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{item.displayName}</span>
            {item.category && <Badge variant="secondary" className="text-xs">{item.category}{item.subCategory ? ` — ${item.subCategory}` : ""}</Badge>}
            {item.paymentMethod && (
              <Badge variant="outline" className="text-xs capitalize">{item.paymentMethod?.replace("_"," ")}</Badge>
            )}
            {item.paidAt && (
              <Badge className="bg-green-600 text-white text-xs">Paid {new Date(item.paidAt).toLocaleDateString()}</Badge>
            )}
            {item.deferredToMonth && !item.authorisedAt && (
              <Badge className="bg-orange-500 text-white text-xs">Prev Month</Badge>
            )}
          </div>
          {item.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>}
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
            {item.invoiceNumber && <span className="text-xs text-muted-foreground">Inv #{item.invoiceNumber}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-semibold text-base">{fmt(item.amount)}</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onEvidence(item)}>
            <Camera className="h-3 w-3 mr-1" />Evidence
          </Button>
          {isAdmin && (
            <>
              <Button
                size="sm"
                className={`h-7 text-xs ${isAuthorised ? "bg-green-700 hover:bg-green-800" : "bg-green-600 hover:bg-green-700"}`}
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

// ─── Section Component ────────────────────────────────────────────────────────
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

// ─── Add Invoice Dialog ───────────────────────────────────────────────────────
function AddInvoiceDialog({ open, onClose, month, year }: { open: boolean; onClose: () => void; month: number; year: number }) {
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cheque" | "bank_transfer" | "cash">("cheque");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [chequeFile, setChequeFile] = useState<File | null>(n  const [chequeNumber, setChequeNumber] = useState(item?.chequeNumber ?? "");
  const [chequeDate, setChequeDate] = useState("");
  const [chequeAmount, setChequeAmount] = useState("");
  const [extractedVendor, setExtractedVendor] = useState("");
  const [extractedInvoiceNumber, setExtractedInvoiceNumber] = useState("");
  const [extractedDescription, setExtractedDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedFields, setExtractedFields] = useState<Record<string, string | null>>({});eRef = useRef<HTMLInputElement>(null);
  const chequeRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const extractEvidence = trpc.expenses.extractEvidence.useMutation();
  const create = trpc.invoices.create.useMutation({
    onSuccess: () => {
      utils.invoices.list.invalidate();
      toast.success("Invoice added");
      onClose();
      // Reset
      setCategory(""); setSubCategory(""); setVendor(""); setDescription("");
      setInvoiceNumber(""); setInvoiceDate(""); setAmount(""); setEvidenceFile(null); setChequeFile(null);
      setChequeNumber(""); setChequeDate(""); setChequeAmount(""); setExtractedFields({});
    },
    onError: e => toast.error(e.message),
  });

  const uploadFile = async (file: File, folder: string): Promise<string | undefined> => {
    const form = new FormData();
    form.append("file", file);
    form.append("key", `invoices/${folder}/${Date.now()}-${file.name}`);
    form.append("mimeType", file.type);
    const res = await fetch("/api/upload-receipt", { method: "POST", body: form, credentials: "include" });
    if (!res.ok) return undefined;
    const { url } = await res.json();
    return url as string;
  };

  const handleEvidenceUpload = async (file: File, type: "cheque" | "invoice") => {
    if (type === "cheque") setChequeFile(file);
    else setEvidenceFile(file);
    setExtracting(true);
    try {
      const tempUrl = await uploadFile(file, "temp");
      if (tempUrl) {
        const result = await extractEvidence.mutateAsync({ imageUrl: tempUrl, documentType: type });
        if (result.success && result.data) {
          const d = result.data;
          const fields: Record<string, string | null> = {};
          if (d.vendor) { setVendor(d.vendor); fields.vendor = d.vendor; }
          if (d.amount) { setAmount(d.amount); fields.amount = d.amount; }
          if (d.date) { setInvoiceDate(d.date); fields.date = d.date; }
          if (d.chequeNumber) { setChequeNumber(d.chequeNumber); fields.chequeNumber = d.chequeNumber; }
          if (d.invoiceNumber) { setInvoiceNumber(d.invoiceNumber); fields.invoiceNumber = d.invoiceNumber; }
          if (d.description) { setDescription(d.description); fields.description = d.description; }
          if (d.category && !category) {
            // Try to match to our taxonomy
            const match = Object.keys(INVOICE_CATEGORIES).find(k => k.toLowerCase().includes(d.category?.toLowerCase() ?? ""));
            if (match) setCategory(match);
            fields.category = d.category;
          }
          setExtractedFields(fields);
          toast.success("AI extracted document data");
        }
      }
    } catch { /* silent */ }
    finally { setExtracting(false); }
  };

  const handleSubmit = async () => {
    if (!category || !amount) { toast.error("Category and amount are required"); return; }
    setUploading(true);
    try {
      let evidenceUrl: string | undefined;
      let chequeImageUrl: string | undefined;
      if (evidenceFile) evidenceUrl = await uploadFile(evidenceFile, "evidence");
      if (chequeFile) chequeImageUrl = await uploadFile(chequeFile, "cheques");
      create.mutate({
        month, year, category, subCategory: subCategory || undefined,
        vendor: vendor || undefined, description: description || undefined,
        invoiceNumber: invoiceNumber || undefined, invoiceDate: invoiceDate || undefined,
        amount, paymentMethod,
        evidenceUrl, chequeImageUrl,
        chequeNumber: chequeNumber || undefined,
        chequeDate: chequeDate || undefined,
        chequeAmount: chequeAmount || undefined,
      });
    } catch { toast.error("Upload failed"); }
    finally { setUploading(false); }
  };

  const subCategories = category ? (INVOICE_CATEGORIES[category] ?? []) : [];

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-purple-600" />Add Invoice
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* AI notice */}
          <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
            <Sparkles className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            Upload evidence first — AI will auto-fill the fields below.
          </div>

          {/* Evidence upload */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs mb-1 block flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />Invoice / Receipt
                {extracting && <Loader2 className="h-3 w-3 animate-spin" />}
              </Label>
              <input ref={evidenceRef} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleEvidenceUpload(f, "invoice"); }} />
              {evidenceFile ? (
                <div className="flex items-center gap-1 text-xs text-muted-foreground p-2 border rounded">
                  <FileText className="h-3 w-3" /><span className="truncate">{evidenceFile.name}</span>
                  <button className="text-destructive ml-auto" onClick={() => setEvidenceFile(null)}>✕</button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => evidenceRef.current?.click()}>
                  <Camera className="h-3.5 w-3.5 mr-1" />Upload
                </Button>
              )}
            </div>
            <div>
              <Label className="text-xs mb-1 block flex items-center gap-1">
                <Camera className="h-3.5 w-3.5" />Cheque Photo
                {extracting && <Loader2 className="h-3 w-3 animate-spin" />}
              </Label>
              <input ref={chequeRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleEvidenceUpload(f, "cheque"); }} />
              {chequeFile ? (
                <div className="flex items-center gap-1 text-xs text-muted-foreground p-2 border rounded">
                  <Camera className="h-3 w-3" /><span className="truncate">{chequeFile.name}</span>
                  <button className="text-destructive ml-auto" onClick={() => setChequeFile(null)}>✕</button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => chequeRef.current?.click()}>
                  <Camera className="h-3.5 w-3.5 mr-1" />Take Photo
                </Button>
              )}
            </div>
          </div>

          {/* AI extracted fields */}
          {Object.keys(extractedFields).length > 0 && (
            <div className="p-2 bg-green-50 border border-green-200 rounded text-xs space-y-0.5">
              <p className="font-medium text-green-700 flex items-center gap-1"><Sparkles className="h-3 w-3" />AI Extracted (auto-filled below):</p>
              {Object.entries(extractedFields).map(([k, v]) => v && <p key={k}>{k}: <strong>{v}</strong></p>)}
            </div>
          )}

          {/* Category */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs mb-1 block">Category *</Label>
              <Select value={category} onValueChange={v => { setCategory(v); setSubCategory(""); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {Object.keys(INVOICE_CATEGORIES).map(cat => (
                    <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Sub-Category</Label>
              <Select value={subCategory} onValueChange={setSubCategory} disabled={!category}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select sub-category" /></SelectTrigger>
                <SelectContent>
                  {subCategories.map(sub => (
                    <SelectItem key={sub} value={sub} className="text-xs">{sub}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Vendor & Amount */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs mb-1 block">Vendor / Supplier</Label>
              <Input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Company name" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Amount (£) *</Label>
              <Input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" placeholder="0.00" className="h-8 text-sm" />
            </div>
          </div>

          {/* Invoice number & date */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs mb-1 block">Invoice Number</Label>
              <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="INV-001" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Invoice Date</Label>
              <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs mb-1 block">Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Brief description of goods/services" className="text-sm" />
          </div>

          {/* Cheque details */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs mb-1 block">Cheque No.</Label>
              <Input value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} placeholder="000000" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Cheque Date</Label>
              <Input type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Cheque Amt</Label>
              <Input value={chequeAmount} onChange={e => setChequeAmount(e.target.value)} placeholder="0.00" className="h-8 text-sm" />
            </div>
          </div>

          {/* Payment method */}
          <div>
            <Label className="text-xs mb-1 block">Payment Method</Label>
            <Select value={paymentMethod} onValueChange={v => setPaymentMethod(v as any)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={uploading || create.isPending || !category || !amount}>
            {(uploading || create.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Add Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Volunteer Dialog ─────────────────────────────────────────────────────
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
          <Button onClick={() => { if (!name || !amount) { toast.error("Name and amount required"); return; } create.mutate({ recipientName: name, recipientEmail: email || undefined, amount, description: desc, paymentMethod: method, month, year }); }} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Add Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MonthlyExpenses() {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [evidenceItem, setEvidenceItem] = useState<BaseItem | null>(null);
  const [rejectItem, setRejectItem] = useState<BaseItem | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [addVolOpen, setAddVolOpen] = useState(false);
  const [addInvoiceOpen, setAddInvoiceOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("payroll");

  const isAdmin = ["superadmin", "admin", "trustee", "manager"].includes(user?.role ?? "");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.expenses.allItems.useQuery(
    { month, year },
    { refetchOnWindowFocus: false }
  );

  const { data: invoiceData, isLoading: invoicesLoading } = trpc.invoices.list.useQuery(
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

  const authoriseInvoice = trpc.invoices.authorise.useMutation({
    onSuccess: (res) => {
      utils.invoices.list.invalidate();
      toast.success(`Invoice authorised by ${res.authorisedByName}`);
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

  const rejectInvoice = trpc.invoices.reject.useMutation({
    onSuccess: (res) => {
      utils.invoices.list.invalidate();
      toast.success(`Invoice rejected — deferred to ${MONTHS[(res.deferredToMonth ?? 1) - 1]} ${res.deferredToYear}`);
      setRejectItem(null);
      setRejectComment("");
    },
    onError: e => toast.error(e.message),
  });

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

  const invoiceItems: BaseItem[] = useMemo(() => (invoiceData ?? []).map(r => ({
    id: r.id, type: "invoice" as const,
    displayName: r.vendor ?? r.category ?? `Invoice #${r.id}`,
    amount: r.amount ?? "0",
    paymentMethod: r.paymentMethod,
    chequeNumber: r.chequeNumber, chequeImageUrl: r.chequeImageUrl,
    evidenceUrl: r.evidenceUrl, paidAt: r.paidAt,
    authorisedById: r.authorisedById, authorisedByName: r.authorisedByName, authorisedAt: r.authorisedAt,
    rejectedById: r.rejectedById, rejectedByName: r.rejectedByName, rejectedAt: r.rejectedAt,
    rejectionComment: r.rejectionComment, deferredToMonth: r.deferredToMonth, deferredToYear: r.deferredToYear,
    category: r.category, subCategory: r.subCategory,
    description: r.description, invoiceNumber: r.invoiceNumber,
  })), [invoiceData]);

  const allItems = [...payrollItems, ...receiptItems, ...volunteerItems, ...loanItems, ...invoiceItems];
  const totalAll = allItems.reduce((s, r) => s + parseFloat(String(r.amount ?? "0")), 0);
  const totalAuthorised = allItems.filter(r => r.authorisedAt).reduce((s, r) => s + parseFloat(String(r.amount ?? "0")), 0);
  const totalPending = allItems.filter(r => !r.authorisedAt && !r.rejectedAt).reduce((s, r) => s + parseFloat(String(r.amount ?? "0")), 0);
  const totalRejected = allItems.filter(r => r.rejectedAt && !r.authorisedAt).reduce((s, r) => s + parseFloat(String(r.amount ?? "0")), 0);

  const handleAuthorise = (item: BaseItem) => {
    if (item.type === "invoice") {
      authoriseInvoice.mutate({ id: item.id });
    } else {
      authorise.mutate({ type: item.type as any, id: item.id });
    }
  };

  const handleReject = (item: BaseItem) => {
    setRejectItem(item);
    setRejectComment("");
  };

  const handleConfirmReject = () => {
    if (!rejectItem) return;
    if (rejectItem.type === "invoice") {
      rejectInvoice.mutate({ id: rejectItem.id, comment: rejectComment, month, year });
    } else {
      reject.mutate({ type: rejectItem.type as any, id: rejectItem.id, comment: rejectComment, month, year });
    }
  };

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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="payroll" className="text-xs">
            <Briefcase className="h-3.5 w-3.5 mr-1" />Payroll
            {payrollItems.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{payrollItems.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs">
            <Receipt className="h-3.5 w-3.5 mr-1" />Invoices
            {invoiceItems.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{invoiceItems.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="receipts" className="text-xs">
            <FileText className="h-3.5 w-3.5 mr-1" />Staff Receipts
            {receiptItems.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{receiptItems.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="volunteers" className="text-xs">
            <Heart className="h-3.5 w-3.5 mr-1" />Volunteers
            {volunteerItems.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{volunteerItems.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="loans" className="text-xs">
            <BookOpen className="h-3.5 w-3.5 mr-1" />Qarde Hasan
            {loanItems.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{loanItems.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payroll">
          {isLoading ? <div className="text-center py-8 text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Loading…</div> : (
            <Section title="Staff Payroll" icon={<Briefcase className="h-4 w-4 text-amber-500" />}
              items={payrollItems} isAdmin={isAdmin}
              onEvidence={setEvidenceItem} onAuthorise={handleAuthorise} onReject={handleReject} />
          )}
        </TabsContent>

        <TabsContent value="invoices">
          {invoicesLoading ? <div className="text-center py-8 text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Loading…</div> : (
            <>
              {/* Category breakdown */}
              {invoiceItems.length > 0 && (
                <div className="mb-3 p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-2">By Category</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(
                      invoiceItems.reduce((acc, item) => {
                        const cat = item.category ?? "Other";
                        acc[cat] = (acc[cat] ?? 0) + parseFloat(String(item.amount ?? "0"));
                        return acc;
                      }, {} as Record<string, number>)
                    ).map(([cat, total]) => (
                      <Badge key={cat} variant="outline" className="text-xs">
                        {cat}: {fmt(total)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <Section title="Invoices" icon={<Receipt className="h-4 w-4 text-purple-600" />}
                items={invoiceItems} isAdmin={isAdmin}
                onEvidence={setEvidenceItem} onAuthorise={handleAuthorise} onReject={handleReject}
                onAdd={() => setAddInvoiceOpen(true)} />
            </>
          )}
        </TabsContent>

        <TabsContent value="receipts">
          {isLoading ? <div className="text-center py-8 text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Loading…</div> : (
            <Section title="Staff Receipts" icon={<FileText className="h-4 w-4 text-purple-600" />}
              items={receiptItems} isAdmin={isAdmin}
              onEvidence={setEvidenceItem} onAuthorise={handleAuthorise} onReject={handleReject} />
          )}
        </TabsContent>

        <TabsContent value="volunteers">
          {isLoading ? <div className="text-center py-8 text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Loading…</div> : (
            <Section title="Volunteer Payments" icon={<Heart className="h-4 w-4 text-orange-500" />}
              items={volunteerItems} isAdmin={isAdmin}
              onEvidence={setEvidenceItem} onAuthorise={handleAuthorise} onReject={handleReject}
              onAdd={() => setAddVolOpen(true)} />
          )}
        </TabsContent>

        <TabsContent value="loans">
          {isLoading ? <div className="text-center py-8 text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Loading…</div> : (
            <Section title="Qarde Hasan Repayments" icon={<BookOpen className="h-4 w-4 text-blue-600" />}
              items={loanItems} isAdmin={isAdmin}
              onEvidence={setEvidenceItem} onAuthorise={handleAuthorise} onReject={handleReject} />
          )}
        </TabsContent>
      </Tabs>

      {/* Evidence Dialog */}
      <EvidenceDialog open={!!evidenceItem} onClose={() => setEvidenceItem(null)} item={evidenceItem} month={month} year={year} />

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
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleConfirmReject}
              disabled={reject.isPending || rejectInvoice.isPending}>
              {(reject.isPending || rejectInvoice.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Reject & Defer to Next Month
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Invoice Dialog */}
      <AddInvoiceDialog open={addInvoiceOpen} onClose={() => setAddInvoiceOpen(false)} month={month} year={year} />

      {/* Add Volunteer Dialog */}
      <AddVolunteerDialog open={addVolOpen} onClose={() => setAddVolOpen(false)} month={month} year={year} />
    </div>
  );
}
