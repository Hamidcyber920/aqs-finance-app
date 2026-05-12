/**
 * AiDocumentScanner
 * Reusable component: drag-and-drop or click to upload a photo/image/PDF,
 * runs AI OCR, shows extracted fields for review, then calls onExtracted with the result.
 *
 * Props:
 *   mode: "lbmw" | "bill"
 *   onExtracted: (fields, fileUrl) => void   — called after user confirms
 *   onClose: () => void
 */
import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Upload, FileText, Image, Loader2, CheckCircle2, AlertCircle,
  X, ScanLine, Eye, RotateCcw, Camera
} from "lucide-react";

interface AiDocumentScannerProps {
  mode: "lbmw" | "bill";
  onExtracted: (fields: Record<string, any>, fileUrl: string) => void;
  onClose: () => void;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";
const MAX_MB = 10;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function FieldRow({ label, value }: { label: string; value: any }) {
  if (value === null || value === undefined || value === "") return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return (
    <div className="flex gap-2 py-1 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground w-36 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm font-medium break-words">{display}</span>
    </div>
  );
}

export function AiDocumentScanner({ mode, onExtracted, onClose }: AiDocumentScannerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ fileUrl: string; extracted: any; error: string | null } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const scanLbmw = trpc.aiScanner.scanLbmwDocument.useMutation();
  const scanBill = trpc.aiScanner.scanBillDocument.useMutation();

  const handleFile = useCallback((f: File) => {
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`File too large — max ${MAX_MB}MB`);
      return;
    }
    setFile(f);
    setResult(null);
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const runScan = async () => {
    if (!file) return;
    setScanning(true);
    try {
      const base64 = await fileToBase64(file);
      const payload = { fileBase64: base64, fileName: file.name, mimeType: file.type };
      let res;
      if (mode === "lbmw") {
        res = await scanLbmw.mutateAsync(payload);
      } else {
        res = await scanBill.mutateAsync(payload);
      }
      setResult(res);
      if (res.error) {
        toast.error(`AI analysis failed: ${res.error}`);
      } else {
        toast.success("Document scanned — review the extracted fields below");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleConfirm = () => {
    if (!result) return;
    onExtracted(result.extracted ?? {}, result.fileUrl);
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const lbmwLabels: Record<string, string> = {
    contactName: "Contact Name",
    contactRole: "Contact Role",
    subject: "Subject",
    summary: "Summary",
    dateReceived: "Date Received",
    responseDeadline: "Response Deadline",
    priority: "Priority",
    direction: "Direction",
    channel: "Channel",
    actionRequired: "Action Required",
    actionTitle: "Action Title",
    isInvoice: "Is Invoice",
    invoiceAmount: "Invoice Amount (£)",
    internalNotes: "Internal Notes",
  };

  const billLabels: Record<string, string> = {
    supplierName: "Supplier Name",
    accountNumber: "Account Number",
    billDate: "Bill Date",
    periodStart: "Period Start",
    periodEnd: "Period End",
    amount: "Amount (£)",
    consumptionUnits: "Consumption",
    unitType: "Unit Type",
    utilityType: "Utility Type",
    notes: "Notes",
  };

  const labels = mode === "lbmw" ? lbmwLabels : billLabels;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary" />
          <span className="font-semibold text-base">
            {mode === "lbmw" ? "Scan LBMW Document" : "Scan Utility Bill"}
          </span>
          <Badge variant="secondary" className="text-xs">AI-Powered</Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      {/* Drop zone */}
      {!file && (
        <div className="flex flex-col gap-3">
          <div
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <div className="p-3 rounded-full bg-primary/10">
              <Upload className="h-7 w-7 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-medium text-sm">Drop a photo, image, or PDF here</p>
              <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, WebP, or PDF — max {MAX_MB}MB</p>
            </div>
            <Button variant="outline" size="sm" className="mt-1" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
              <Image className="h-3.5 w-3.5 mr-1.5" />Browse Files
            </Button>
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleInputChange} />
          </div>
          {/* Camera capture button — uses device camera on mobile */}
          <Button
            variant="outline"
            className="w-full gap-2 border-dashed"
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="h-4 w-4 text-primary" />
            Take Photo with Camera
            <span className="ml-auto text-xs text-muted-foreground">Mobile</span>
          </Button>
          {/* Hidden camera input — capture="environment" opens rear camera on mobile */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>
      )}

      {/* File selected — preview + scan button */}
      {file && !result && (
        <Card className="border-border/60">
          <CardContent className="p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              {file.type.startsWith("image/") ? (
                <Image className="h-8 w-8 text-blue-500 shrink-0" />
              ) : (
                <FileText className="h-8 w-8 text-red-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleReset} disabled={scanning}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {preview && (
              <div className="rounded-lg overflow-hidden border border-border/40 max-h-48">
                <img src={preview} alt="Preview" className="w-full h-full object-contain bg-muted/20" />
              </div>
            )}
            <Button onClick={runScan} disabled={scanning} className="w-full">
              {scanning ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scanning with AI...</>
              ) : (
                <><ScanLine className="h-4 w-4 mr-2" />Scan & Extract Fields</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="flex flex-col gap-3">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${result.error ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-700 dark:text-green-400"}`}>
            {result.error ? (
              <><AlertCircle className="h-4 w-4 shrink-0" /><span>AI analysis failed. You can still use the file URL and fill fields manually.</span></>
            ) : (
              <><CheckCircle2 className="h-4 w-4 shrink-0" /><span>Fields extracted — review and confirm to auto-fill the form.</span></>
            )}
          </div>

          {result.extracted && (
            <Card className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Extracted Fields</span>
                  <a href={result.fileUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                      <Eye className="h-3 w-3" />View File
                    </Button>
                  </a>
                </div>
                <div className="space-y-0.5">
                  {Object.entries(labels).map(([key, label]) => (
                    <FieldRow key={key} label={label} value={result.extracted[key]} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />Scan Another
            </Button>
            <Button onClick={handleConfirm} className="flex-1 gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              {result.error ? "Use File URL Only" : "Auto-Fill Form"}
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        AI extraction is automatic but may not be 100% accurate. Always review before saving.
      </p>
    </div>
  );
}
