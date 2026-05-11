import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Upload, Camera, FileText, AlertTriangle, CheckCircle, Loader2, X, FileSpreadsheet, UserCheck, UserPlus, Users, ArrowRight, Eye } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export type ModuleType =
  | "income_rental"
  | "loan_repayment"
  | "loan_application"
  | "invoice"
  | "payroll"
  | "friday_collection"
  | "fundraising_donation"
  | "receipt"
  | "bank_statement"
  | "handwritten_collection"
  | "business_card"
  | "bank_transfer_screenshot"
  | "crm_donor"
  | "staff_profile";

export interface ExtractedField {
  key: string;
  label: string;
  value: unknown;
  confidence?: number;
}

export interface Discrepancy {
  field: string;
  extracted: unknown;
  existing: unknown;
  severity: "warning" | "error";
}

export interface ProfileMatch {
  id: number;
  name: string;
  subtitle: string;
  email?: string | null;
  phone?: string | null;
  score: number;
  table: string;
  /** Full current field values of the matched record, used for diff preview */
  currentFields?: Record<string, unknown> | null;
}

export interface SmartUploadResult {
  extractedData: Record<string, unknown>;
  discrepancies: Discrepancy[];
  confidence: number;
  moduleType: ModuleType;
  isBulk: boolean;
  fileUrl: string;
  mimeType: string;
  /** Set when user confirmed a match — the existing record to update */
  matchedProfile?: ProfileMatch;
  /** Set to true when user chose to create a new record instead of matching */
  createNew?: boolean;
}

interface SmartUploadProps {
  moduleType: ModuleType;
  onConfirm: (result: SmartUploadResult) => void;
  onCancel?: () => void;
  existingRecordIds?: number[];
  buttonLabel?: string;
  buttonVariant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
  fieldLabels?: Record<string, string>;
  /** Roles allowed to use this button. Defaults to senior roles. */
  allowedRoles?: string[];
}

const DEFAULT_FIELD_LABELS: Record<string, Record<string, string>> = {
  staff_profile: {
    fullName: "Full Name",
    role: "Role / Position",
    email: "Email",
    phone: "Phone",
    dateOfBirth: "Date of Birth",
    addressLine1: "Address Line 1",
    addressLine2: "Address Line 2",
    city: "City",
    postcode: "Postcode",
    nokName: "Next of Kin Name",
    nokPhone: "Next of Kin Phone",
    nokEmail: "Next of Kin Email",
    nokRelationship: "NOK Relationship",
    notes: "Notes",
  },
  income_rental: {
    tenantName: "Tenant Name",
    amount: "Amount (£)",
    paymentDate: "Payment Date",
    periodStart: "Period Start",
    periodEnd: "Period End",
    propertyUnit: "Property / Unit",
    paymentMethod: "Payment Method",
    reference: "Reference",
    category: "Category",
    notes: "Notes",
  },
  loan_repayment: {
    borrowerName: "Borrower Name",
    amount: "Repayment Amount (£)",
    paymentDate: "Payment Date",
    reference: "Reference",
    paymentMethod: "Payment Method",
    notes: "Notes",
  },
  loan_application: {
    applicantName: "Applicant Name",
    amountRequested: "Amount Requested (£)",
    purpose: "Purpose",
    monthlyIncome: "Monthly Income (£)",
    employmentStatus: "Employment Status",
    repaymentTerm: "Repayment Term (months)",
    guarantorName: "Guarantor Name",
    notes: "Notes",
  },
  invoice: {
    vendorName: "Vendor / Supplier",
    invoiceNumber: "Invoice Number",
    amount: "Total Amount (£)",
    vatAmount: "VAT Amount (£)",
    invoiceDate: "Invoice Date",
    dueDate: "Due Date",
    description: "Description",
    category: "Category",
    paymentMethod: "Payment Method",
  },
  payroll: {
    employeeName: "Employee Name",
    grossPay: "Gross Pay (£)",
    deductions: "Deductions (£)",
    netPay: "Net Pay (£)",
    payPeriod: "Pay Period (Month)",
    payYear: "Pay Year",
    niNumber: "NI Number",
    taxCode: "Tax Code",
    department: "Department",
  },
  friday_collection: {
    collectionDate: "Collection Date",
    bucketTotal: "Bucket Total (£)",
    cardTerminalTotal: "Card Terminal Total (£)",
    totalAmount: "Total Amount (£)",
    collectedBy: "Collected By",
    notes: "Notes",
  },
  fundraising_donation: {
    donorName: "Donor Name",
    amount: "Amount (£)",
    donationDate: "Donation Date",
    paymentMethod: "Payment Method",
    reference: "Reference",
    campaignName: "Campaign",
    giftAid: "Gift Aid",
    notes: "Notes",
  },
  receipt: {
    vendorName: "Vendor / Shop",
    totalAmount: "Total Amount (£)",
    purchaseDate: "Purchase Date",
    items: "Items",
    category: "Category",
    vatAmount: "VAT Amount (£)",
    paymentMethod: "Payment Method",
  },
  bank_statement: {
    closingBalance: "Closing Balance (£)",
    statementDate: "Statement Date",
    accountName: "Account Name",
    sortCode: "Sort Code",
    accountNumber: "Account Number",
    bankName: "Bank",
    openingBalance: "Opening Balance (£)",
  },
  crm_donor: {
    name: "Donor Name",
    email: "Email",
    phone: "Phone",
    addressLine1: "Address Line 1",
    city: "City",
    postcode: "Postcode",
    giftAid: "Gift Aid",
    notes: "Notes",
  },
  business_card: {
    name: "Name",
    company: "Company",
    email: "Email",
    phone: "Phone",
    address: "Address",
  },
  handwritten_collection: {
    donorName: "Donor Name",
    amount: "Amount (£)",
    date: "Date",
    notes: "Notes",
  },
  bank_transfer_screenshot: {
    senderName: "Sender Name",
    amount: "Amount (£)",
    date: "Date",
    reference: "Reference",
    bankName: "Bank",
  },
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString("en-GB");
  if (Array.isArray(value)) return `${value.length} items`;
  return String(value);
}

/** Modules where we attempt fuzzy profile matching */
const MATCHABLE_MODULES: ModuleType[] = [
  "staff_profile", "crm_donor", "income_rental", "fundraising_donation",
  "loan_application", "loan_repayment", "payroll", "business_card",
  "handwritten_collection", "bank_transfer_screenshot",
];

function extractNameFromData(data: Record<string, unknown>): string {
  const candidates = [
    data.fullName, data.name, data.donorName, data.tenantName,
    data.borrowerName, data.employeeName, data.applicantName,
    data.senderName, data.contactName,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

function extractEmailFromData(data: Record<string, unknown>): string | undefined {
  const v = data.email;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function extractPhoneFromData(data: Record<string, unknown>): string | undefined {
  const v = data.phone;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Build a list of proposed field changes for the diff review step */
interface FieldDiff {
  key: string;
  label: string;
  currentValue: unknown;
  proposedValue: unknown;
  isNew: boolean; // true if field is empty/null in current record
}

function buildDiff(
  extractedData: Record<string, unknown>,
  currentFields: Record<string, unknown> | null | undefined,
  labels: Record<string, string>
): FieldDiff[] {
  if (!currentFields) return [];
  const diffs: FieldDiff[] = [];
  for (const [key, proposed] of Object.entries(extractedData)) {
    if (key === "records" || key === "transactions") continue;
    if (proposed === null || proposed === undefined || proposed === "") continue;
    const current = currentFields[key];
    const currentEmpty = current === null || current === undefined || current === "";
    const proposedStr = String(proposed);
    const currentStr = current !== null && current !== undefined ? String(current) : "";
    // Only include if the proposed value differs from current
    if (proposedStr !== currentStr) {
      diffs.push({
        key,
        label: labels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
        currentValue: currentEmpty ? null : current,
        proposedValue: proposed,
        isNew: currentEmpty,
      });
    }
  }
  return diffs;
}

type MatchStep = "idle" | "matching" | "confirm" | "review" | "done";

export function SmartUpload({
  moduleType,
  onConfirm,
  onCancel,
  existingRecordIds,
  buttonLabel = "Scan / Upload",
  buttonVariant = "outline",
  className,
  fieldLabels,
  allowedRoles = ["superadmin", "trustee", "manager", "deputy", "admin"],
}: SmartUploadProps) {
  const { user } = useAuth();
  const userRole = user?.role ?? "";
  const hasAccess = allowedRoles.includes(userRole);

  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<SmartUploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Match flow state
  const [matchStep, setMatchStep] = useState<MatchStep>("idle");
  const [matches, setMatches] = useState<ProfileMatch[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<ProfileMatch | null>(null);
  const [matchQueryInput, setMatchQueryInput] = useState<{
    name: string; email?: string; phone?: string; moduleType: ModuleType;
  } | null>(null);
  const [fieldDiffs, setFieldDiffs] = useState<FieldDiff[]>([]);
  // Per-row checkbox: key = field key, value = whether to include this change
  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractMutation = trpc.documents.extract.useMutation();

  const matchQuery = trpc.documents.matchProfile.useQuery(
    matchQueryInput ?? { name: "", moduleType },
    {
      enabled: !!matchQueryInput && matchQueryInput.name.length > 1,
      retry: false,
    }
  );

  // When matchQuery resolves, transition to confirm or done
  useEffect(() => {
    if (matchStep === "matching" && !matchQuery.isFetching && matchQueryInput) {
      const found = (matchQuery.data?.matches ?? []) as ProfileMatch[];
      setMatches(found);
      if (found.length > 0) {
        setSelectedMatch(found[0]);
        setMatchStep("confirm");
      } else {
        setMatchStep("done");
        setResult(prev => prev ? { ...prev, createNew: true } : prev);
      }
    }
  }, [matchQuery.isFetching, matchStep, matchQueryInput, matchQuery.data]);

  const labels = { ...(DEFAULT_FIELD_LABELS[moduleType] || {}), ...(fieldLabels || {}) };

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    const maxSize = 16 * 1024 * 1024;
    if (file.size > maxSize) { toast.error("File too large — maximum size is 16MB"); return; }
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf", "text/csv", "application/csv"];
    if (!allowed.includes(file.type) && !file.name.endsWith(".csv")) {
      toast.error("Unsupported file type — please upload an image, PDF, or CSV"); return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const key = `smart-upload/${moduleType}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("key", key);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      let fileUrl: string;
      if (uploadRes.ok) {
        const data = await uploadRes.json();
        fileUrl = data.url;
      } else {
        throw new Error("Upload failed");
      }
      setUploading(false);
      setExtracting(true);
      const mimeType = file.type || (file.name.endsWith(".csv") ? "text/csv" : "application/octet-stream");
      const extractResult = await extractMutation.mutateAsync({
        fileUrl, mimeType, moduleType, existingRecordIds,
      });
      const newResult: SmartUploadResult = { ...extractResult, fileUrl, mimeType };
      setResult(newResult);

      // Attempt profile matching for relevant module types
      if (MATCHABLE_MODULES.includes(moduleType) && !extractResult.isBulk) {
        const name = extractNameFromData(extractResult.extractedData as Record<string, unknown>);
        if (name.length > 1) {
          const email = extractEmailFromData(extractResult.extractedData as Record<string, unknown>);
          const phone = extractPhoneFromData(extractResult.extractedData as Record<string, unknown>);
          setMatchStep("matching");
          setMatchQueryInput({ name, email, phone, moduleType });
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Extraction failed";
      toast.error(`AI extraction failed: ${message}`);
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  }, [moduleType, existingRecordIds, extractMutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const resetAndClose = () => {
    setOpen(false);
    setResult(null);
    setMatchStep("idle");
    setMatches([]);
    setSelectedMatch(null);
    setMatchQueryInput(null);
    setFieldDiffs([]);
    setCheckedFields({});
  };

  /** After user selects a match, build the diff and move to review step */
  const handleAcceptMatch = () => {
    if (!result || !selectedMatch) return;
    // Build field-level diff between current record and extracted data
    const diffs = buildDiff(
      result.extractedData as Record<string, unknown>,
      selectedMatch.currentFields,
      labels
    );
    setFieldDiffs(diffs);
    // Default all rows to checked
    const initial: Record<string, boolean> = {};
    for (const d of diffs) initial[d.key] = true;
    setCheckedFields(initial);
    setMatchStep("review");
  };

  /** User confirmed the diff — now actually call onConfirm to save, passing only checked fields */
  const handleConfirmSave = () => {
    if (!result || !selectedMatch) return;
    // Build a filtered extractedData containing only the checked fields
    const filteredData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result.extractedData as Record<string, unknown>)) {
      // Always pass through non-diff fields (bulk records, etc.)
      if (key === "records" || key === "transactions") {
        filteredData[key] = value;
        continue;
      }
      // Only include fields that are in the diff AND are checked
      const inDiff = fieldDiffs.some(d => d.key === key);
      if (!inDiff || checkedFields[key]) {
        filteredData[key] = value;
      }
    }
    onConfirm({ ...result, extractedData: filteredData, matchedProfile: selectedMatch, createNew: false });
    resetAndClose();
  };

  const handleCreateNew = () => {
    if (!result) return;
    onConfirm({ ...result, createNew: true });
    resetAndClose();
  };

  const handleConfirmNoMatch = () => {
    if (!result) return;
    onConfirm({ ...result, createNew: true });
    resetAndClose();
  };

  const handleClose = () => {
    resetAndClose();
    onCancel?.();
  };

  const extractedFields = result
    ? Object.entries(result.extractedData)
        .filter(([key]) => key !== "records" && key !== "transactions")
        .map(([key, value]) => ({
          key,
          label: labels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
          value,
        }))
    : [];

  const bulkRecords = result?.isBulk
    ? ((result.extractedData as { records?: unknown[] }).records || [])
    : [];

  const isMatching = matchStep === "matching" || matchQuery.isFetching;

  if (!hasAccess) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={className}>
              <Button variant={buttonVariant} disabled className="opacity-50 cursor-not-allowed pointer-events-none">
                <Upload className="w-4 h-4 mr-2" />
                {buttonLabel}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Only managers, trustees and superadmins can import documents</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <>
      <Button variant={buttonVariant} onClick={() => setOpen(true)} className={className}>
        <Upload className="w-4 h-4 mr-2" />
        {buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              AI Document Import
            </DialogTitle>
            <DialogDescription>
              Upload an image, PDF, or CSV — AI extracts the data, matches it to existing records, and asks you to confirm before saving.
            </DialogDescription>
          </DialogHeader>

          {/* ── UPLOAD ZONE ── */}
          {!result && !uploading && !extracting && (
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 rounded-full bg-primary/10">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Drop your file here or click to browse</p>
                  <p className="text-sm text-muted-foreground mt-1">Supports: JPG, PNG, PDF, CSV (max 16MB)</p>
                </div>
                <div className="flex gap-2 mt-2">
                  <Badge variant="secondary" className="gap-1"><Camera className="w-3 h-3" /> Photo</Badge>
                  <Badge variant="secondary" className="gap-1"><FileText className="w-3 h-3" /> PDF</Badge>
                  <Badge variant="secondary" className="gap-1"><FileSpreadsheet className="w-3 h-3" /> CSV</Badge>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf,.csv"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {/* ── LOADING / MATCHING STATE ── */}
          {(uploading || extracting || isMatching) && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-semibold">
                  {uploading ? "Uploading file…"
                    : extracting ? "AI is extracting data…"
                    : "Searching for matching records…"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {uploading ? "Securely uploading to storage"
                    : extracting ? "Reading and analysing your document"
                    : "Comparing against existing profiles in the system"}
                </p>
              </div>
            </div>
          )}

          {/* ── MATCH CONFIRMATION STEP ── */}
          {result && matchStep === "confirm" && !isMatching && (
            <div className="space-y-5">
              {/* Extracted summary */}
              <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Extracted from document</p>
                <div className="grid grid-cols-2 gap-2">
                  {extractedFields.slice(0, 6).map(({ key, label, value }) => (
                    <div key={key} className="text-sm">
                      <span className="text-muted-foreground">{label}: </span>
                      <span className="font-medium">{formatValue(value)}</span>
                    </div>
                  ))}
                </div>
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle className="w-3 h-3" />
                  {Math.round(result.confidence * 100)}% extraction confidence
                </Badge>
              </div>

              <Separator />

              {/* Match candidates */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-primary" />
                  <p className="font-semibold text-sm">
                    {matches.length === 1 ? "1 matching record found" : `${matches.length} matching records found`}
                  </p>
                  <p className="text-xs text-muted-foreground">— Select the correct one or create a new record</p>
                </div>
                <div className="space-y-2">
                  {matches.map((m) => (
                    <button
                      key={`${m.table}-${m.id}`}
                      type="button"
                      onClick={() => setSelectedMatch(m)}
                      className={`w-full text-left rounded-xl border p-4 transition-all ${
                        selectedMatch?.id === m.id && selectedMatch?.table === m.table
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                            {m.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{m.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {m.subtitle}{m.email ? ` · ${m.email}` : ""}{m.phone ? ` · ${m.phone}` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground/60 capitalize">{m.table.replace(/_/g, " ")}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge
                            variant={m.score >= 80 ? "default" : m.score >= 60 ? "secondary" : "outline"}
                            className="text-xs"
                          >
                            {m.score}% match
                          </Badge>
                          {selectedMatch?.id === m.id && selectedMatch?.table === m.table && (
                            <CheckCircle className="w-4 h-4 text-primary" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <Button variant="ghost" size="sm" onClick={() => { setResult(null); setMatchStep("idle"); }} className="gap-1 text-muted-foreground">
                  <X className="w-4 h-4" /> Upload Different File
                </Button>
                <div className="flex gap-2 flex-wrap justify-end">
                  <Button variant="outline" onClick={handleCreateNew} className="gap-1">
                    <UserPlus className="w-4 h-4" />
                    Create New Record
                  </Button>
                  <Button
                    onClick={handleAcceptMatch}
                    disabled={!selectedMatch}
                    className="gap-1"
                  >
                    <Eye className="w-4 h-4" />
                    Review Changes
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── PRE-SAVE REVIEW STEP (field diff table) ── */}
          {result && matchStep === "review" && selectedMatch && !isMatching && (
            <div className="space-y-5">
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <UserCheck className="w-4 h-4 text-primary" />
                  <p className="font-semibold text-sm">Updating: {selectedMatch.name}</p>
                  <Badge variant="secondary" className="text-xs">{selectedMatch.subtitle}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Review the proposed changes below. Only fields with new or different values are shown.
                  Click <strong>Confirm &amp; Save</strong> to apply them, or <strong>Go Back</strong> to choose a different record.
                </p>
              </div>

              {/* Select/deselect all */}
              {fieldDiffs.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    id="select-all"
                    checked={Object.values(checkedFields).every(Boolean)}
                    onCheckedChange={(checked) => {
                      const next: Record<string, boolean> = {};
                      for (const d of fieldDiffs) next[d.key] = !!checked;
                      setCheckedFields(next);
                    }}
                  />
                  <label htmlFor="select-all" className="cursor-pointer select-none">
                    {Object.values(checkedFields).filter(Boolean).length} of {fieldDiffs.length} change{fieldDiffs.length !== 1 ? "s" : ""} selected
                  </label>
                </div>
              )}

              {fieldDiffs.length === 0 ? (
                <Card className="border-amber-400/40 bg-amber-50/30 dark:bg-amber-950/20">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>No new information was found in the document that differs from the existing record.</span>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-1/4">Field</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[37%]">Current Value</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[37%]">Proposed New Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fieldDiffs.map((diff, i) => (
                        <tr
                          key={diff.key}
                          className={`border-b last:border-0 transition-opacity ${i % 2 === 0 ? "bg-background" : "bg-muted/20"} ${!checkedFields[diff.key] ? "opacity-40" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={!!checkedFields[diff.key]}
                                onCheckedChange={(checked) =>
                                  setCheckedFields(prev => ({ ...prev, [diff.key]: !!checked }))
                                }
                              />
                              <span className={`font-medium ${checkedFields[diff.key] ? "text-foreground" : "text-muted-foreground"}`}>{diff.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {diff.isNew ? (
                              <span className="italic text-xs text-muted-foreground/60">empty</span>
                            ) : (
                              <span className="font-mono text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
                                {formatValue(diff.currentValue)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {!diff.isNew && <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                              <span className="font-mono text-xs bg-green-500/10 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded font-semibold">
                                {formatValue(diff.proposedValue)}
                              </span>
                              {diff.isNew && (
                                <Badge variant="secondary" className="text-xs py-0 h-4">New</Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <Separator />
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMatchStep("confirm")}
                  className="gap-1 text-muted-foreground"
                >
                  <X className="w-4 h-4" /> Go Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleClose}>Cancel</Button>
                  <Button
                    onClick={handleConfirmSave}
                    disabled={fieldDiffs.length > 0 && Object.values(checkedFields).every(v => !v)}
                    className="gap-1"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {fieldDiffs.length === 0
                      ? "No Changes to Save"
                      : `Confirm & Save ${Object.values(checkedFields).filter(Boolean).length} Change${Object.values(checkedFields).filter(Boolean).length !== 1 ? "s" : ""}`
                    }
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── EXTRACTED DATA REVIEW (no match found or non-matchable module) ── */}
          {result && (matchStep === "idle" || matchStep === "done") && !isMatching && (
            <div className="space-y-4">
              {/* Confidence indicator */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Extraction confidence</span>
                <Badge variant={result.confidence >= 0.8 ? "default" : "secondary"} className="gap-1">
                  <CheckCircle className="w-3 h-3" />
                  {Math.round(result.confidence * 100)}%
                </Badge>
              </div>

              {/* No match notice */}
              {matchStep === "done" && (
                <Card className="border-amber-400/40 bg-amber-50/30 dark:bg-amber-950/20">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>No existing record matched this name. A new record will be created on confirm.</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Discrepancies */}
              {result.discrepancies.length > 0 && (
                <Card className="border-destructive/50 bg-destructive/5">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                      <span className="font-semibold text-destructive text-sm">
                        {result.discrepancies.length} discrepanc{result.discrepancies.length === 1 ? "y" : "ies"} detected
                      </span>
                    </div>
                    <div className="space-y-2">
                      {result.discrepancies.map((d, i) => (
                        <div key={i} className="text-sm bg-destructive/10 rounded-lg p-3 border border-destructive/20">
                          <span className="font-medium text-destructive">{labels[d.field] || d.field}:</span>
                          <span className="ml-2 text-foreground">
                            Extracted <span className="font-mono font-bold">{formatValue(d.extracted)}</span>
                            {" "}— On record <span className="font-mono font-bold">{formatValue(d.existing)}</span>
                          </span>
                          <Badge variant={d.severity === "error" ? "destructive" : "secondary"} className="ml-2 text-xs">
                            {d.severity === "error" ? "Requires correction" : "Please verify"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Bulk or single preview */}
              {bulkRecords.length > 0 ? (
                <div>
                  <p className="text-sm font-semibold mb-2">
                    {bulkRecords.length} record{bulkRecords.length !== 1 ? "s" : ""} found in file
                  </p>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {bulkRecords.slice(0, 20).map((record, i) => (
                      <Card key={i} className="bg-muted/30">
                        <CardContent className="pt-3 pb-3">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {Object.entries(record as Record<string, unknown>)
                              .filter(([, v]) => v !== null && v !== undefined)
                              .slice(0, 6)
                              .map(([key, value]) => (
                                <div key={key} className="text-xs">
                                  <span className="text-muted-foreground">{labels[key] || key}: </span>
                                  <span className="font-medium">{formatValue(value)}</span>
                                </div>
                              ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {bulkRecords.length > 20 && (
                      <p className="text-xs text-muted-foreground text-center">+{bulkRecords.length - 20} more records</p>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold mb-3">Extracted Data</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {extractedFields.map(({ key, label, value }) => {
                      const discrepancy = result.discrepancies.find((d) => d.field === key);
                      return (
                        <div
                          key={key}
                          className={`rounded-lg p-3 border text-sm ${
                            discrepancy
                              ? discrepancy.severity === "error"
                                ? "bg-destructive/10 border-destructive/40"
                                : "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
                              : "bg-muted/30 border-border"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-muted-foreground text-xs">{label}</span>
                            {discrepancy && (
                              <AlertTriangle className={`w-3 h-3 flex-shrink-0 ${discrepancy.severity === "error" ? "text-destructive" : "text-amber-500"}`} />
                            )}
                          </div>
                          <div className={`font-medium mt-0.5 ${value === null || value === undefined ? "text-muted-foreground italic" : ""}`}>
                            {formatValue(value)}
                          </div>
                          {discrepancy && (
                            <div className={`text-xs mt-1 ${discrepancy.severity === "error" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
                              On record: {formatValue(discrepancy.existing)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <Separator />
              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => { setResult(null); setMatchStep("idle"); }} className="gap-1">
                  <X className="w-4 h-4" />
                  Upload Different File
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleClose}>Cancel</Button>
                  <Button
                    onClick={handleConfirmNoMatch}
                    disabled={result.discrepancies.some((d) => d.severity === "error")}
                    className="gap-1"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {result.isBulk ? `Import ${bulkRecords.length} Records` : "Confirm & Import"}
                  </Button>
                </div>
              </div>
              {result.discrepancies.some((d) => d.severity === "error") && (
                <p className="text-xs text-destructive text-center">
                  Please resolve the errors above before importing.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
