import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Upload, Camera, FileText, AlertTriangle, CheckCircle, Loader2, X, FileSpreadsheet } from "lucide-react";
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
  | "crm_donor";

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

export interface SmartUploadResult {
  extractedData: Record<string, unknown>;
  discrepancies: Discrepancy[];
  confidence: number;
  moduleType: ModuleType;
  isBulk: boolean;
  fileUrl: string;
  mimeType: string;
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
  /** Roles allowed to use this button. Defaults to ["superadmin", "trustee"]. */
  allowedRoles?: string[];
}

const DEFAULT_FIELD_LABELS: Record<string, Record<string, string>> = {
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
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString("en-GB");
  if (Array.isArray(value)) return `${value.length} items`;
  return String(value);
}

export function SmartUpload({
  moduleType,
  onConfirm,
  onCancel,
  existingRecordIds,
  buttonLabel = "Import from Document",
  buttonVariant = "outline",
  className,
  fieldLabels,
  allowedRoles = ["superadmin", "trustee"],
}: SmartUploadProps) {
  const { user } = useAuth();
  const userRole = user?.role ?? "";
  const hasAccess = allowedRoles.includes(userRole);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<SmartUploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractMutation = trpc.documents.extract.useMutation();

  const labels = { ...(DEFAULT_FIELD_LABELS[moduleType] || {}), ...(fieldLabels || {}) };

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;

    const maxSize = 16 * 1024 * 1024; // 16MB
    if (file.size > maxSize) {
      toast.error("File too large — maximum size is 16MB");
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf", "text/csv", "application/csv"];
    if (!allowed.includes(file.type) && !file.name.endsWith(".csv")) {
      toast.error("Unsupported file type — please upload an image, PDF, or CSV");
      return;
    }

    setUploading(true);
    try {
      // Upload to S3
      const ext = file.name.split(".").pop() || "bin";
      const key = `smart-upload/${moduleType}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      // Use the server-side upload via a form post
      const formData = new FormData();
      formData.append("file", file);
      formData.append("key", key);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      let fileUrl: string;
      if (uploadRes.ok) {
        const data = await uploadRes.json();
        fileUrl = data.url;
      } else {
        // Fallback: create object URL for demo (won't work for server-side LLM)
        throw new Error("Upload failed");
      }

      setUploading(false);
      setExtracting(true);

      const mimeType = file.type || (file.name.endsWith(".csv") ? "text/csv" : "application/octet-stream");

      const extractResult = await extractMutation.mutateAsync({
        fileUrl,
        mimeType,
        moduleType,
        existingRecordIds,
      });

      setResult({
        ...extractResult,
        fileUrl,
        mimeType,
      });
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

  const handleConfirm = () => {
    if (!result) return;
    onConfirm(result);
    setOpen(false);
    setResult(null);
  };

  const handleClose = () => {
    setOpen(false);
    setResult(null);
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

  // If user doesn't have the required role, show a disabled button with tooltip
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
            <p>Only superadmins and trustees can import documents</p>
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
              Upload an image, PDF, or CSV and AI will extract the data automatically.
              Review the extracted fields and confirm before importing.
            </DialogDescription>
          </DialogHeader>

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

          {(uploading || extracting) && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-semibold">{uploading ? "Uploading file…" : "AI is extracting data…"}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {uploading ? "Securely uploading to storage" : "Reading and analysing your document"}
                </p>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {/* Confidence indicator */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Extraction confidence</span>
                <Badge variant={result.confidence >= 0.8 ? "default" : "secondary"} className="gap-1">
                  <CheckCircle className="w-3 h-3" />
                  {Math.round(result.confidence * 100)}%
                </Badge>
              </div>

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
                          <span className="font-medium text-destructive">
                            {labels[d.field] || d.field}:
                          </span>
                          <span className="ml-2 text-foreground">
                            Extracted <span className="font-mono font-bold">{formatValue(d.extracted)}</span>
                            {" "}— On record <span className="font-mono font-bold">{formatValue(d.existing)}</span>
                          </span>
                          <Badge
                            variant={d.severity === "error" ? "destructive" : "secondary"}
                            className="ml-2 text-xs"
                          >
                            {d.severity === "error" ? "Requires correction" : "Please verify"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Bulk import preview */}
              {result.isBulk && bulkRecords.length > 0 ? (
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
                      <p className="text-xs text-muted-foreground text-center">
                        +{bulkRecords.length - 20} more records
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* Single record preview */
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
                <Button variant="ghost" onClick={() => setResult(null)} className="gap-1">
                  <X className="w-4 h-4" />
                  Upload Different File
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleClose}>Cancel</Button>
                  <Button
                    onClick={handleConfirm}
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
                  Please resolve the errors above before importing. Edit the values manually after closing this dialog.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
