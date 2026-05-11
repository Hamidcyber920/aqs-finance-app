/**
 * SmartDocumentUpload
 * Universal AI OCR upload dialog. Accepts any document (image or PDF),
 * uploads to S3, extracts fields via LLM, shows a review step, then
 * calls onExtracted with the confirmed fields.
 */
import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Upload, FileText, Image, Loader2, CheckCircle2, AlertCircle,
  ChevronRight, RefreshCw, X, Sparkles,
} from "lucide-react";

export type TargetType =
  | "training_certificate"
  | "policy_document"
  | "decision_minutes"
  | "receipt"
  | "invoice"
  | "donor_form"
  | "staff_profile"
  | "loan_application"
  | "payroll"
  | "bank_statement"
  | "general";

const TARGET_LABELS: Record<TargetType, string> = {
  training_certificate: "Training Certificate",
  policy_document: "Policy Document",
  decision_minutes: "Meeting Minutes / Decision",
  receipt: "Receipt",
  invoice: "Invoice",
  donor_form: "Donor Registration Form",
  staff_profile: "Staff Profile / CV",
  loan_application: "Loan Application",
  payroll: "Payroll Document",
  bank_statement: "Bank Statement",
  general: "General Document",
};

// Human-readable field labels
const FIELD_LABELS: Record<string, string> = {
  userName: "Name", module: "Module / Course", provider: "Training Provider",
  completedAt: "Completion Date", expiresAt: "Expiry Date", certificateNumber: "Certificate No.",
  title: "Title", category: "Category", owner: "Owner / Author", version: "Version",
  reviewDate: "Review Date", approvedAt: "Approval Date", approvedBy: "Approved By",
  status: "Status", motionText: "Motion Text", proposer: "Proposer",
  seconder: "Seconder", votesFor: "Votes For", votesAgainst: "Votes Against",
  abstentions: "Abstentions", outcome: "Outcome", meetingDate: "Meeting Date",
  minutesUrl: "Minutes URL", vendor: "Vendor", date: "Date", amount: "Amount (£)",
  tax: "Tax (£)", currency: "Currency", paymentMethod: "Payment Method",
  receiptNumber: "Receipt No.", categoryName: "Category", departmentGuess: "Department",
  vendorName: "Vendor", invoiceNumber: "Invoice No.", vatAmount: "VAT (£)",
  invoiceDate: "Invoice Date", dueDate: "Due Date", description: "Description",
  name: "Full Name", email: "Email", phone: "Phone", addressLine1: "Address",
  city: "City", postcode: "Postcode", giftAid: "Gift Aid",
  donationType: "Donation Type", fullName: "Full Name", contractType: "Contract Type",
  niNumber: "NI Number", taxCode: "Tax Code", startDate: "Start Date",
  role: "Role", department: "Department", applicantName: "Applicant Name",
  amountRequested: "Amount Requested (£)", purpose: "Purpose",
  monthlyIncome: "Monthly Income (£)", employmentStatus: "Employment Status",
  repaymentTerm: "Repayment Term (months)", guarantorName: "Guarantor",
  employeeName: "Employee Name", grossPay: "Gross Pay (£)", netPay: "Net Pay (£)",
  deductions: "Deductions (£)", payPeriod: "Pay Period (month)", payYear: "Pay Year",
  accountName: "Account Name", accountNumber: "Account Number", sortCode: "Sort Code",
  statementDate: "Statement Date", openingBalance: "Opening Balance (£)",
  closingBalance: "Closing Balance (£)", author: "Author", summary: "Summary",
  notes: "Notes",
};

type Step = "upload" | "extracting" | "review" | "done";

interface Props {
  open: boolean;
  onClose: () => void;
  targetType: TargetType;
  onExtracted: (fields: Record<string, any>) => void;
  /** Optional: allow user to change target type */
  allowTypeChange?: boolean;
}

export default function SmartDocumentUpload({
  open, onClose, targetType: initialTargetType, onExtracted, allowTypeChange = false,
}: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [targetType, setTargetType] = useState<TargetType>(initialTargetType);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [extractedFields, setExtractedFields] = useState<Record<string, any>>({});
  const [editedFields, setEditedFields] = useState<Record<string, any>>({});
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractFields = (trpc as any).documents.extractFields.useMutation({
    onSuccess: (data: any) => {
      const fields = data.fields ?? {};
      // Filter out null/undefined values for display
      const nonNull = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== ""));
      setExtractedFields(nonNull);
      setEditedFields({ ...nonNull });
      setSelectedFields(new Set(Object.keys(nonNull)));
      setStep("review");
    },
    onError: (e: any) => {
      setError(e.message ?? "AI extraction failed");
      setStep("upload");
    },
  });

  const ALLOWED_TYPES = [
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
    "image/tiff", "image/bmp",
  ];

  async function handleFile(f: File) {
    if (!ALLOWED_TYPES.includes(f.type)) {
      toast.error("Unsupported file type. Please upload an image (JPG, PNG, WebP) or PDF.");
      return;
    }
    if (f.size > 16 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 16MB.");
      return;
    }
    setFile(f);
    setError("");
    setStep("extracting");
    setUploadProgress(10);

    // Upload to S3 via /api/upload
    try {
      const formData = new FormData();
      formData.append("file", f);
      formData.append("key", `smart-doc-upload/${Date.now()}-${f.name}`);

      setUploadProgress(30);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const { url, mimeType } = await res.json();
      setFileUrl(url);
      setUploadProgress(70);

      // Extract fields via AI
      extractFields.mutate({ fileUrl: url, mimeType: mimeType ?? f.type, targetType });
      setUploadProgress(100);
    } catch (err: any) {
      setError(err.message ?? "Upload failed");
      setStep("upload");
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [targetType]);

  function handleConfirm() {
    // Only pass selected fields with edited values
    const confirmed: Record<string, any> = {};
    for (const key of Array.from(selectedFields)) {
      confirmed[key] = editedFields[key];
    }
    onExtracted(confirmed);
    setStep("done");
    setTimeout(() => {
      resetState();
      onClose();
    }, 800);
  }

  function resetState() {
    setStep("upload");
    setFile(null);
    setFileUrl("");
    setUploadProgress(0);
    setExtractedFields({});
    setEditedFields({});
    setSelectedFields(new Set());
    setError("");
  }

  const fieldKeys = Object.keys(extractedFields);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { resetState(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            AI Document Scanner
            {step !== "upload" && (
              <Badge variant="outline" className="ml-2 text-xs font-normal">
                {TARGET_LABELS[targetType]}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="space-y-4 py-2">
            {allowTypeChange && (
              <div className="space-y-1.5">
                <Label>Document Type</Label>
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={targetType}
                  onChange={e => setTargetType(e.target.value as TargetType)}
                >
                  {(Object.keys(TARGET_LABELS) as TargetType[]).map(t => (
                    <option key={t} value={t}>{TARGET_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            )}

            <div
              className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer
                ${dragOver ? "border-accent bg-accent/10" : "border-border/60 hover:border-accent/50 hover:bg-muted/20"}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
                <Upload className="h-6 w-6 text-accent" />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm">Drop your document here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports JPG, PNG, WebP, PDF · Max 16MB
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".jpg,.jpeg,.png,.webp,.pdf,.gif,.tiff,.bmp"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground/70">What the AI will extract for {TARGET_LABELS[targetType]}:</p>
              <p>
                {targetType === "training_certificate" && "Name, module/course, provider, completion date, expiry date, certificate number"}
                {targetType === "policy_document" && "Title, category, owner, version, review date, approval date, status"}
                {targetType === "decision_minutes" && "Motion title, full motion text, proposer, seconder, vote counts, outcome, meeting date"}
                {targetType === "receipt" && "Vendor, date, amount, tax, payment method, receipt number, category"}
                {targetType === "invoice" && "Vendor, invoice number, amount, VAT, invoice date, due date, description"}
                {targetType === "donor_form" && "Name, email, phone, address, postcode, Gift Aid status, donation type"}
                {targetType === "staff_profile" && "Full name, email, phone, contract type, NI number, tax code, start date"}
                {targetType === "loan_application" && "Applicant name, amount, purpose, income, employment status, repayment term"}
                {targetType === "payroll" && "Employee name, gross pay, net pay, deductions, pay period, NI number, tax code"}
                {targetType === "bank_statement" && "Account name, account number, sort code, statement date, opening/closing balance"}
                {targetType === "general" && "Title, date, author, summary, and all key information found"}
              </p>
            </div>
          </div>
        )}

        {/* Step: Extracting */}
        {step === "extracting" && (
          <div className="flex flex-col items-center gap-6 py-10">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-accent/20" />
              <Loader2 className="h-10 w-10 animate-spin text-accent" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-medium">Analysing document…</p>
              <p className="text-sm text-muted-foreground">
                {uploadProgress < 70 ? "Uploading file…" : "AI is reading and extracting fields…"}
              </p>
            </div>
            <div className="w-full max-w-xs">
              <Progress value={uploadProgress} className="h-1.5" />
            </div>
            {file && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {file.type.startsWith("image/") ? <Image className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                {file.name}
              </div>
            )}
          </div>
        )}

        {/* Step: Review */}
        {step === "review" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>AI extracted {fieldKeys.length} field{fieldKeys.length !== 1 ? "s" : ""}. Review and edit before confirming.</span>
            </div>

            {fieldKeys.length === 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-4 text-sm text-amber-400 text-center">
                No fields could be extracted from this document. Try a clearer image or different document type.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {/* Select all */}
                <div className="flex items-center gap-2 pb-1 border-b border-border/40">
                  <Checkbox
                    id="select-all"
                    checked={selectedFields.size === fieldKeys.length}
                    onCheckedChange={(checked) => {
                      if (checked) setSelectedFields(new Set(fieldKeys));
                      else setSelectedFields(new Set());
                    }}
                  />
                  <label htmlFor="select-all" className="text-xs text-muted-foreground cursor-pointer">
                    Select all ({fieldKeys.length} fields)
                  </label>
                </div>

                {fieldKeys.map(key => {
                  const label = FIELD_LABELS[key] ?? key;
                  const isSelected = selectedFields.has(key);
                  const value = editedFields[key];
                  const displayValue = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value ?? "");

                  return (
                    <div key={key} className={`flex items-start gap-3 rounded-lg border p-3 transition-colors
                      ${isSelected ? "border-accent/30 bg-accent/5" : "border-border/30 bg-muted/10 opacity-60"}`}>
                      <Checkbox
                        id={`field-${key}`}
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          setSelectedFields(prev => {
                            const next = new Set(prev);
                            if (checked) next.add(key); else next.delete(key);
                            return next;
                          });
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <Label htmlFor={`edit-${key}`} className="text-xs text-muted-foreground mb-1 block">
                          {label}
                        </Label>
                        {typeof value === "boolean" ? (
                          <div className="text-sm font-medium">{displayValue}</div>
                        ) : (
                          <Input
                            id={`edit-${key}`}
                            value={displayValue}
                            onChange={e => setEditedFields(prev => ({ ...prev, [key]: e.target.value }))}
                            disabled={!isSelected}
                            className="h-8 text-sm"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {fileUrl && (
              <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {file?.type.startsWith("image/") ? <Image className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  <span className="truncate max-w-48">{file?.name}</span>
                </div>
                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-accent hover:underline">View uploaded file</a>
              </div>
            )}
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <CheckCircle2 className="h-16 w-16 text-emerald-400" />
            <p className="font-medium">Fields applied successfully</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "upload" && (
            <Button variant="outline" onClick={() => { resetState(); onClose(); }}>Cancel</Button>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" onClick={resetState}>
                <RefreshCw className="h-4 w-4 mr-2" /> Scan Again
              </Button>
              <Button
                disabled={selectedFields.size === 0 || fieldKeys.length === 0}
                onClick={handleConfirm}
              >
                <ChevronRight className="h-4 w-4 mr-2" />
                Apply {selectedFields.size} Field{selectedFields.size !== 1 ? "s" : ""}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
