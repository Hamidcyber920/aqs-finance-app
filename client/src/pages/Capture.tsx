/**
 * AI Vision Scanner — Capture Page
 *
 * Upload pattern (same as Payroll scanner — proven to work):
 *   1. User picks a file (camera or gallery)
 *   2. compressImage() reduces size for faster upload
 *   3. POST /api/upload with FormData (multer + storagePut on server) → get S3 URL
 *   4. POST /api/extract with { fileUrl, mimeType, moduleType } → AI extracts fields
 *   5. User reviews extracted data, edits if needed, then saves via tRPC
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { compressImage } from "@/lib/compressImage";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import {
  Camera, Upload, Loader2, CheckCircle2, Sparkles, Receipt,
  FileText, CreditCard, Banknote, UserCheck, X,
  Phone, Mail, MapPin, DollarSign, Calendar, Tag,
  RefreshCw, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ─── Colour palette ──────────────────────────────────────────────────────────
const T = {
  navy: "#0A192F",
  purple: "#635BFF",
  mint: "#00FFC2",
  white: "#FFFFFF",
  muted: "rgba(255,255,255,0.5)",
  border: "rgba(255,255,255,0.08)",
  glass: "rgba(255,255,255,0.04)",
  card: "rgba(13,34,64,0.8)",
};

// ─── Document types ──────────────────────────────────────────────────────────
type DocType = "receipt" | "handwritten_collection" | "business_card" | "bank_transfer_screenshot" | "crm_donor";

const DOC_TYPES: { id: DocType; label: string; icon: React.ElementType; desc: string; color: string }[] = [
  { id: "receipt",                  label: "Receipt",          icon: Receipt,    desc: "Shop receipts, invoices, bills",      color: "#635BFF" },
  { id: "handwritten_collection",   label: "Collection Sheet", icon: FileText,   desc: "Handwritten donation lists",          color: "#10B981" },
  { id: "business_card",            label: "Business Card",    icon: CreditCard, desc: "Contact cards for CRM",               color: "#F59E0B" },
  { id: "bank_transfer_screenshot", label: "Bank Transfer",    icon: Banknote,   desc: "Transfer confirmation screenshots",   color: "#3B82F6" },
  { id: "crm_donor",                label: "Donor Form",       icon: UserCheck,  desc: "Pledge cards, donor forms",           color: "#EC4899" },
];

// ─── Component ───────────────────────────────────────────────────────────────
export default function CapturePage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const [docType, setDocType]           = useState<DocType>("receipt");
  const [preview, setPreview]           = useState<string | null>(null);
  const [pendingFile, setPendingFile]   = useState<File | null>(null);
  const [uploading, setUploading]       = useState(false);
  const [analyzing, setAnalyzing]       = useState(false);
  const [scanError, setScanError]       = useState<string | null>(null);
  const [extracted, setExtracted]       = useState<any>(null);
  const [multiRecords, setMultiRecords] = useState<any[]>([]);
  const [submitted, setSubmitted]       = useState(false);
  const [savingToCrm, setSavingToCrm]   = useState(false);
  const [savedToCrm, setSavedToCrm]     = useState(false);
  // Store the S3 URL after upload so it can be attached to the saved receipt
  const uploadedUrlRef = useRef<string>("");

  // ── tRPC mutations ─────────────────────────────────────────────────────────
  const createReceiptMutation = trpc.receipts.create.useMutation({
    onSuccess: () => {
      toast.success("Receipt submitted successfully");
      setSubmitted(true);
      setTimeout(() => setLocation("/receipts"), 1800);
    },
    onError: (e) => toast.error(e.message),
  });

  const saveCrmMutation = trpc.crm.saveScanToCRM.useMutation();

  const { data: depts, refetch: refetchDepts } = trpc.departments.list.useQuery();
  const { data: categories } = trpc.categories.list.useQuery();
  const createDeptMutation = trpc.departments.create.useMutation({
    onSuccess: () => { refetchDepts(); setNewDeptName(""); setNewDeptOpen(false); toast.success("Department created"); },
    onError: (e) => toast.error(e.message),
  });
  const [newDeptOpen, setNewDeptOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");

  // ── Form (for receipt save) ────────────────────────────────────────────────
  const { register, handleSubmit, setValue, reset } = useForm<any>({
    defaultValues: { department: "", categoryName: "" },
  });

  // ── Reset all state ────────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    setPreview(null);
    setPendingFile(null);
    setScanError(null);
    setExtracted(null);
    setMultiRecords([]);
    setSavedToCrm(false);
    uploadedUrlRef.current = "";
    reset({ department: "", categoryName: "" });
  }, [reset]);

  // ── Step 1: File selected ──────────────────────────────────────────────────
  const handleFileSelect = useCallback((file: File) => {
    resetAll();
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setPendingFile(file);
  }, [resetAll]);

  // ── Step 2: Upload → /api/upload (same as Payroll) ─────────────────────────
  const uploadFile = useCallback(async (file: File): Promise<{ url: string; mimeType: string }> => {
    const compressed = await compressImage(file);
    console.log(`[Capture] Compressed: ${(compressed.size / 1024).toFixed(0)}KB (original: ${(file.size / 1024).toFixed(0)}KB)`);

    const fd = new FormData();
    fd.append("file", compressed);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: fd,
      credentials: "include",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Upload failed (${res.status}): ${text.slice(0, 120)}`);
    }

    const json = await res.json();
    if (!json.url) throw new Error("Server returned no URL after upload");

    console.log("[Capture] Upload success:", json.url);
    return { url: json.url, mimeType: json.mimeType || compressed.type || "image/jpeg" };
  }, []);

  // ── Step 3: AI extraction → /api/extract (server-side, same endpoint as other scanners) ──
  const extractData = useCallback(async (fileUrl: string, mimeType: string, moduleType: string): Promise<any> => {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ fileUrl, mimeType, moduleType }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI extraction failed (${res.status}): ${text.slice(0, 120)}`);
    }

    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json;
  }, []);

  // ── Main scan flow ─────────────────────────────────────────────────────────
  const runScan = useCallback(async (file: File) => {
    if (uploading || analyzing) return;
    setScanError(null);
    setExtracted(null);
    setMultiRecords([]);

    try {
      // Step 1: Upload
      setUploading(true);
      const { url: fileUrl, mimeType } = await uploadFile(file);
      uploadedUrlRef.current = fileUrl; // persist for form submit
      setUploading(false);

      // Step 2: AI extraction
      setAnalyzing(true);
      toast.info("AI is analysing the document…");
      const result = await extractData(fileUrl, mimeType, docType);
      setAnalyzing(false);

      console.log("[Capture] Extraction result:", JSON.stringify(result).slice(0, 400));

      const data = result.extractedData || result;
      const isBulk = result.isBulk || "records" in data;

      if (isBulk && Array.isArray(data.records)) {
        setMultiRecords(data.records);
        toast.success(`Found ${data.records.length} entries`);
      } else {
        setExtracted(data);
        // Auto-fill receipt form fields
        if (docType === "receipt") {
          if (data.vendorName)   setValue("vendor",      data.vendorName);
          if (data.totalAmount)  setValue("amount",      String(data.totalAmount));
          if (data.purchaseDate) setValue("date",        data.purchaseDate);
          if (data.items)        setValue("description", data.items);
          if (data.category)     setValue("categoryName", data.category);
        }
        toast.success("Document scanned successfully");
      }
    } catch (err: any) {
      setUploading(false);
      setAnalyzing(false);
      const msg = err?.message || "Scan failed — please try again";
      setScanError(msg);
      toast.error(msg);
      console.error("[Capture] Scan error:", err);
    }
  }, [uploading, analyzing, docType, uploadFile, extractData, setValue]);

  // Auto-trigger scan when a file is selected
  useEffect(() => {
    if (pendingFile && !uploading && !analyzing && !extracted && multiRecords.length === 0) {
      runScan(pendingFile);
    }
  }, [pendingFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Allow the bottom nav Scan button to open the file picker even when the
  // user is already on this page (navigation is a no-op in that case).
  useEffect(() => {
    const handler = () => { fileInputRef.current?.click(); };
    window.addEventListener("hibba:open-scanner", handler);
    return () => window.removeEventListener("hibba:open-scanner", handler);
  }, []);

  // ── Save all CRM records (bulk) ────────────────────────────────────────────
  const saveAllToCrm = useCallback(async () => {
    if (savingToCrm || multiRecords.length === 0) return;
    setSavingToCrm(true);
    let saved = 0;
    for (const record of multiRecords) {
      try {
        await saveCrmMutation.mutateAsync({
          donorName:    record.donorName || "Unknown",
          donorPhone:   record.donorPhone  || undefined,
          donorEmail:   record.donorEmail  || undefined,
          amount:       record.amount ? parseFloat(String(record.amount)) : undefined,
          donationDate: record.donationDate || undefined,
          campaignName: record.campaignName || undefined,
          giftAid:      record.giftAid === true,
          notes:        record.notes || undefined,
          sourceType:   "handwritten_collection",
        });
        saved++;
      } catch (e) {
        console.warn("[Capture] CRM save error:", e);
      }
    }
    setSavedToCrm(true);
    setSavingToCrm(false);
    toast.success(`Saved ${saved}/${multiRecords.length} donors to CRM`);
  }, [savingToCrm, multiRecords, saveCrmMutation]);

  // ── Save single CRM record ─────────────────────────────────────────────────
  const saveSingleToCrm = useCallback(async () => {
    if (!extracted || savingToCrm) return;
    setSavingToCrm(true);
    try {
      await saveCrmMutation.mutateAsync({
        donorName:    extracted.donorName || "Unknown",
        donorPhone:   extracted.donorPhone  || undefined,
        donorEmail:   extracted.donorEmail  || undefined,
        donorAddress: extracted.donorAddress || undefined,
        amount:       extracted.amount ? parseFloat(String(extracted.amount)) : undefined,
        donationDate: extracted.donationDate || undefined,
        campaignName: extracted.campaignName || undefined,
        giftAid:      extracted.giftAid === true,
        notes:        extracted.notes || undefined,
        sourceType:   docType === "crm_donor" ? "crm_donor"
                    : docType === "business_card" ? "business_card"
                    : docType === "bank_transfer_screenshot" ? "bank_transfer_screenshot"
                    : "crm_donor",
      });
      setSavedToCrm(true);
      toast.success("Saved to CRM");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save to CRM");
    } finally {
      setSavingToCrm(false);
    }
  }, [extracted, savingToCrm, docType, saveCrmMutation]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const currentDocType = DOC_TYPES.find(d => d.id === docType)!;
  const isProcessing   = uploading || analyzing;

  // ── Submitted screen ───────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(0,255,194,0.15)", border: "2px solid rgba(0,255,194,0.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <CheckCircle2 size={40} style={{ color: T.mint }} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: T.white, margin: "0 0 8px" }}>Receipt Submitted!</h2>
          <p style={{ fontSize: 14, color: T.muted }}>Redirecting to expenses…</p>
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={{ background: `linear-gradient(135deg,${T.navy} 0%,#0D2240 100%)`, minHeight: "100vh" }} className="text-white pb-24">

      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div style={{ background: T.purple, borderRadius: 12, padding: 8 }}>
            <Sparkles size={20} color={T.white} />
          </div>
          <div>
            <h1 className="text-xl font-bold">AI Vision Scanner</h1>
            <p style={{ color: T.muted, fontSize: 13 }}>Receipts, collection sheets, business cards &amp; more</p>
          </div>
        </div>
      </div>

      {/* Doc type selector */}
      <div className="px-4 mb-4">
        <p style={{ color: T.muted, fontSize: 12, marginBottom: 8 }}>DOCUMENT TYPE</p>
        <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {DOC_TYPES.map(dt => (
            <button
              key={dt.id}
              onClick={() => { setDocType(dt.id); resetAll(); }}
              style={{
                background: docType === dt.id ? dt.color : T.glass,
                border: `1px solid ${docType === dt.id ? dt.color : T.border}`,
                borderRadius: 12, padding: "8px 14px", whiteSpace: "nowrap",
                display: "flex", alignItems: "center", gap: 6, flexShrink: 0, color: T.white,
              }}
            >
              <dt.icon size={14} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{dt.label}</span>
            </button>
          ))}
        </div>
        <p style={{ color: T.muted, fontSize: 12, marginTop: 6 }}>{currentDocType.desc}</p>
      </div>

      {/* Upload zone */}
      <div className="px-4 mb-4">
        {/* No capture attr — iOS shows full action sheet: Take Photo | Photo Library | Browse Files */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }}
        />

        <div
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${preview ? currentDocType.color : T.border}`,
            borderRadius: 16, padding: preview ? 0 : 24, textAlign: "center",
            background: preview ? "rgba(0,0,0,0.3)" : T.glass,
            cursor: isProcessing ? "default" : "pointer",
            position: "relative", overflow: "hidden", transition: "all 0.3s",
          }}
        >
          {preview ? (
            <>
              <img src={preview} alt="preview" style={{ maxHeight: 220, width: "100%", borderRadius: 14, objectFit: "contain" }} />

              {/* Clear button */}
              {!isProcessing && (
                <button
                  onClick={e => { e.stopPropagation(); resetAll(); }}
                  style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: T.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <X size={14} />
                </button>
              )}

              {/* Processing overlay */}
              {isProcessing && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <Loader2 size={36} className="animate-spin" style={{ color: currentDocType.color }} />
                  <p style={{ color: T.white, fontSize: 14, fontWeight: 600 }}>
                    {uploading ? "Uploading…" : "AI analysing…"}
                  </p>
                  <p style={{ color: T.muted, fontSize: 12 }}>
                    {uploading ? "Sending to server" : "Extracting data from document"}
                  </p>
                </div>
              )}

              {/* Retry scan button — shown when file loaded but not yet scanned */}
              {!isProcessing && !extracted && multiRecords.length === 0 && !scanError && (
                <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={e => { e.stopPropagation(); if (pendingFile) runScan(pendingFile); }}
                    style={{ background: currentDocType.color, border: "none", borderRadius: 12, padding: "10px 22px", color: T.white, fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <Sparkles size={15} /> Scan Document
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${currentDocType.color}22`, border: `2px solid ${currentDocType.color}44`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <Camera size={24} style={{ color: currentDocType.color }} />
              </div>
              <p style={{ color: T.white, fontSize: 15, fontWeight: 600, margin: "0 0 4px" }}>Tap to take photo or upload</p>
              <p style={{ color: T.muted, fontSize: 13 }}>Images and PDFs supported</p>
            </>
          )}
        </div>

        {/* Gallery / file upload button */}
        {!preview && (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ marginTop: 10, width: "100%", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 16px", color: T.muted, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <Upload size={14} /> Choose from gallery or files
          </button>
        )}
      </div>

      {/* Error display */}
      {scanError && (
        <div className="px-4 mb-4">
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertTriangle size={18} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <p style={{ color: "#EF4444", fontSize: 13, fontWeight: 600, margin: "0 0 4px" }}>Scan Failed</p>
              <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, margin: 0 }}>{scanError}</p>
            </div>
            {pendingFile && (
              <button
                onClick={() => { setScanError(null); runScan(pendingFile); }}
                style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, padding: "6px 12px", color: "#EF4444", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
              >
                <RefreshCw size={12} /> Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── RESULTS: Bulk (collection sheet) ── */}
      {multiRecords.length > 0 && (
        <div className="px-4 mb-4">
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ color: T.white, fontSize: 15, fontWeight: 700, margin: 0 }}>
                  {multiRecords.length} Entries Found
                </p>
                <p style={{ color: T.muted, fontSize: 12, margin: "2px 0 0" }}>Review before saving to CRM</p>
              </div>
              {!savedToCrm ? (
                <button
                  onClick={saveAllToCrm}
                  disabled={savingToCrm}
                  style={{ background: "#10B981", border: "none", borderRadius: 10, padding: "8px 16px", color: T.white, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  {savingToCrm ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  {savingToCrm ? "Saving…" : "Save All to CRM"}
                </button>
              ) : (
                <span style={{ color: "#10B981", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 size={14} /> Saved
                </span>
              )}
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {multiRecords.map((rec, i) => (
                <div key={i} style={{ padding: "12px 16px", borderBottom: i < multiRecords.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div className="flex items-center justify-between gap-2">
                    <p style={{ color: T.white, fontSize: 14, fontWeight: 600, margin: 0 }}>{rec.donorName || "Unknown donor"}</p>
                    {rec.amount && <span style={{ color: "#10B981", fontSize: 14, fontWeight: 700 }}>£{Number(rec.amount).toFixed(2)}</span>}
                  </div>
                  <div className="flex gap-3 mt-1 flex-wrap">
                    {rec.donorPhone && <span style={{ color: T.muted, fontSize: 12 }}>📞 {rec.donorPhone}</span>}
                    {rec.campaignName && <span style={{ color: T.muted, fontSize: 12 }}>🎯 {rec.campaignName}</span>}
                    {rec.giftAid && <span style={{ color: "#F59E0B", fontSize: 12 }}>✓ Gift Aid</span>}
                    {rec.paymentMethod && <span style={{ color: T.muted, fontSize: 12 }}>💳 {rec.paymentMethod}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={resetAll}
            style={{ marginTop: 10, width: "100%", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 16px", color: T.muted, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <Camera size={14} /> Scan Another
          </button>
        </div>
      )}

      {/* ── RESULTS: Single extracted record ── */}
      {extracted && multiRecords.length === 0 && (
        <div className="px-4 mb-4">
          <div style={{ background: T.card, border: `1px solid ${currentDocType.color}44`, borderRadius: 16, overflow: "hidden" }}>

            {/* Result header */}
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, background: `${currentDocType.color}11` }}>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} style={{ color: currentDocType.color }} />
                <p style={{ color: T.white, fontSize: 14, fontWeight: 700, margin: 0 }}>Scan Complete</p>
              </div>
              <p style={{ color: T.muted, fontSize: 12, margin: "4px 0 0" }}>Review the extracted data below</p>
            </div>

            {/* Extracted fields display */}
            <div style={{ padding: "12px 16px" }}>
              <ExtractedFields data={extracted} docType={docType} color={currentDocType.color} />
            </div>

            {/* ── Receipt save form ── */}
            {docType === "receipt" && (
              <div style={{ padding: "0 16px 16px" }}>
                <p style={{ color: T.muted, fontSize: 11, textTransform: "uppercase", marginBottom: 10, letterSpacing: "0.05em" }}>Confirm &amp; Submit Receipt</p>
                <form
                  onSubmit={handleSubmit(d => {
                    createReceiptMutation.mutate({
                      amount:       d.amount,
                      description:  d.description,
                      vendor:       d.vendor,
                      date:         d.date,
                      categoryName: d.categoryName,
                      department:   d.department,
                      imageUrl:     uploadedUrlRef.current || undefined,
                    });
                  })}
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <Label style={{ fontSize: 11, color: T.muted, textTransform: "uppercase" }}>Amount (£) *</Label>
                      <Input {...register("amount", { required: true })} type="number" step="0.01" placeholder="0.00"
                        style={{ marginTop: 4, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 40 }} />
                    </div>
                    <div>
                      <Label style={{ fontSize: 11, color: T.muted, textTransform: "uppercase" }}>Date</Label>
                      <Input {...register("date")} type="date"
                        style={{ marginTop: 4, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 40, colorScheme: "dark" }} />
                    </div>
                  </div>
                  <div>
                    <Label style={{ fontSize: 11, color: T.muted, textTransform: "uppercase" }}>Description *</Label>
                    <Input {...register("description", { required: true })} placeholder="What was purchased?"
                      style={{ marginTop: 4, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 40 }} />
                  </div>
                  <div>
                    <Label style={{ fontSize: 11, color: T.muted, textTransform: "uppercase" }}>Vendor</Label>
                    <Input {...register("vendor")} placeholder="Shop or supplier name"
                      style={{ marginTop: 4, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 40 }} />
                  </div>
                  <div>
                    <Label style={{ fontSize: 11, color: T.muted, textTransform: "uppercase" }}>Category</Label>
                    <select {...register("categoryName")}
                      style={{ marginTop: 4, width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 40, padding: "0 12px" }}>
                      <option value="">— Select category —</option>
                      {categories && Array.from(new Map(categories.map((c: any) => [c.name, c])).values()).map((c: any) => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <Label style={{ fontSize: 11, color: T.muted, textTransform: "uppercase" }}>Department</Label>
                      <button type="button" onClick={() => setNewDeptOpen(true)}
                        style={{ fontSize: 10, color: T.mint, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>+ New</button>
                    </div>
                    <select {...register("department")}
                      style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 40, padding: "0 12px" }}>
                      <option value="">— Select department —</option>
                      {depts && depts.map((d: any) => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <Button
                    type="submit"
                    disabled={createReceiptMutation.isPending}
                    style={{ background: `linear-gradient(135deg,${T.mint},#00DDB0)`, color: "#081526", fontWeight: 700, height: 48, borderRadius: 12, border: "none" }}
                  >
                    {createReceiptMutation.isPending
                      ? <><Loader2 size={16} className="animate-spin mr-2" />Submitting…</>
                      : <><Receipt size={16} className="mr-2" />Submit Receipt</>}
                  </Button>
                </form>
              </div>
            )}

            {/* ── CRM save (business card / donor form / bank transfer) ── */}
            {(docType === "business_card" || docType === "crm_donor" || docType === "bank_transfer_screenshot") && (
              <div style={{ padding: "0 16px 16px" }}>
                {!savedToCrm ? (
                  <button
                    onClick={saveSingleToCrm}
                    disabled={savingToCrm}
                    style={{ width: "100%", background: currentDocType.color, border: "none", borderRadius: 12, padding: "12px 16px", color: T.white, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    {savingToCrm ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    {savingToCrm ? "Saving to CRM…" : "Save to CRM"}
                  </button>
                ) : (
                  <div style={{ textAlign: "center", padding: "8px 0", color: "#10B981", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <CheckCircle2 size={16} /> Saved to CRM
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={resetAll}
            style={{ marginTop: 10, width: "100%", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 16px", color: T.muted, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <Camera size={14} /> Scan Another
          </button>
        </div>
      )}

      {/* ── New Department dialog ── */}
      <Dialog open={newDeptOpen} onOpenChange={setNewDeptOpen}>
        <DialogContent style={{ background: "#0D2137", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#fff" }}>Create New Department</DialogTitle>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
            <div>
              <Label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Department Name *</Label>
              <Input
                value={newDeptName}
                onChange={e => setNewDeptName(e.target.value)}
                placeholder="e.g. School, Community Centre…"
                style={{ marginTop: 4, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, color: "#fff", height: 40 }}
              />
            </div>
            <Button
              onClick={() => { if (newDeptName.trim()) createDeptMutation.mutate({ name: newDeptName.trim() }); }}
              disabled={!newDeptName.trim() || createDeptMutation.isPending}
              style={{ background: "linear-gradient(135deg,#00C896,#00DDB0)", color: "#081526", fontWeight: 700, height: 44, borderRadius: 10, border: "none" }}
            >
              {createDeptMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              Create Department
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Empty state ── */}
      {!extracted && multiRecords.length === 0 && !isProcessing && !scanError && (
        <div className="px-4">
          <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
            <p style={{ color: T.muted, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>What can I scan?</p>
            <div className="grid grid-cols-1 gap-3">
              {DOC_TYPES.map(dt => (
                <div key={dt.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ background: `${dt.color}22`, borderRadius: 8, padding: 6 }}>
                    <dt.icon size={14} style={{ color: dt.color }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: T.white }}>{dt.label}</p>
                    <p style={{ fontSize: 11, color: T.muted }}>{dt.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Extracted fields display component ─────────────────────────────────────
function ExtractedFields({ data, docType, color }: { data: any; docType: DocType; color: string }) {
  if (!data) return null;

  const fields: { icon: React.ElementType; label: string; value: string | null }[] = [];

  if (docType === "receipt") {
    if (data.vendorName)   fields.push({ icon: Tag,       label: "Vendor",   value: data.vendorName });
    if (data.totalAmount)  fields.push({ icon: DollarSign, label: "Amount",  value: `£${Number(data.totalAmount).toFixed(2)}` });
    if (data.purchaseDate) fields.push({ icon: Calendar,  label: "Date",     value: data.purchaseDate });
    if (data.items)        fields.push({ icon: Receipt,   label: "Items",    value: data.items });
    if (data.category)     fields.push({ icon: Tag,       label: "Category", value: data.category });
    if (data.vatAmount)    fields.push({ icon: DollarSign, label: "VAT",     value: `£${Number(data.vatAmount).toFixed(2)}` });
  } else if (docType === "business_card") {
    if (data.donorName)    fields.push({ icon: UserCheck, label: "Name",         value: data.donorName });
    if (data.organisation) fields.push({ icon: Tag,       label: "Organisation", value: data.organisation });
    if (data.jobTitle)     fields.push({ icon: Tag,       label: "Role",         value: data.jobTitle });
    if (data.donorPhone)   fields.push({ icon: Phone,     label: "Phone",        value: data.donorPhone });
    if (data.donorEmail)   fields.push({ icon: Mail,      label: "Email",        value: data.donorEmail });
    if (data.website)      fields.push({ icon: Tag,       label: "Website",      value: data.website });
  } else if (docType === "bank_transfer_screenshot") {
    if (data.donorName)     fields.push({ icon: UserCheck,  label: "Sender",    value: data.donorName });
    if (data.amount)        fields.push({ icon: DollarSign, label: "Amount",    value: `£${Number(data.amount).toFixed(2)}` });
    if (data.donationDate)  fields.push({ icon: Calendar,   label: "Date",      value: data.donationDate });
    if (data.reference)     fields.push({ icon: Tag,        label: "Reference", value: data.reference });
    if (data.recipientName) fields.push({ icon: UserCheck,  label: "Recipient", value: data.recipientName });
  } else if (docType === "crm_donor") {
    if (data.donorName)    fields.push({ icon: UserCheck,  label: "Name",     value: data.donorName });
    if (data.donorPhone)   fields.push({ icon: Phone,      label: "Phone",    value: data.donorPhone });
    if (data.donorEmail)   fields.push({ icon: Mail,       label: "Email",    value: data.donorEmail });
    if (data.donorAddress) fields.push({ icon: MapPin,     label: "Address",  value: data.donorAddress });
    if (data.amount)       fields.push({ icon: DollarSign, label: "Amount",   value: `£${Number(data.amount).toFixed(2)}` });
    if (data.campaignName) fields.push({ icon: Tag,        label: "Campaign", value: data.campaignName });
    if (data.giftAid)      fields.push({ icon: CheckCircle2, label: "Gift Aid", value: "Yes — Gift Aid declared" });
  }

  if (fields.length === 0) {
    // Fallback: show all non-null fields as key-value pairs
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {Object.entries(data).map(([k, v]) => v != null && (
          <div key={k} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ color: T.muted, fontSize: 12, minWidth: 100, flexShrink: 0 }}>{k}</span>
            <span style={{ color: T.white, fontSize: 13 }}>{String(v)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {fields.map(({ icon: Icon, label, value }) => value && (
        <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <Icon size={15} style={{ color, flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: T.muted, fontSize: 11, margin: "0 0 1px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
            <p style={{ color: T.white, fontSize: 14, fontWeight: 500, margin: 0, wordBreak: "break-word" }}>{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
