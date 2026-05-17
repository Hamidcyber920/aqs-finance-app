import React, { useState, useRef, useCallback, useEffect } from "react";
import { useHibbaFormFill } from "@/hooks/useHibbaFormFill";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import {
  Camera, Upload, Loader2, CheckCircle2, Sparkles, Receipt,
  FileText, CreditCard, Banknote, UserCheck, X,
  Phone, Mail, MapPin, DollarSign, Calendar, Tag, Heart,
  MessageCircle, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const T = {
  navy: "#0A192F", purple: "#635BFF", mint: "#00FFC2",
  white: "#FFFFFF", muted: "rgba(255,255,255,0.5)",
  border: "rgba(255,255,255,0.08)", glass: "rgba(255,255,255,0.04)",
  card: "rgba(13,34,64,0.8)"
};

type DocType = "receipt" | "handwritten_collection" | "business_card" | "bank_transfer_screenshot" | "crm_donor";

const DOC_TYPES: { id: DocType; label: string; icon: React.ElementType; desc: string; color: string }[] = [
  { id: "receipt", label: "Receipt", icon: Receipt, desc: "Shop receipts, invoices, bills", color: "#635BFF" },
  { id: "handwritten_collection", label: "Collection Sheet", icon: FileText, desc: "Handwritten donation lists", color: "#10B981" },
  { id: "business_card", label: "Business Card", icon: CreditCard, desc: "Contact cards for CRM", color: "#F59E0B" },
  { id: "bank_transfer_screenshot", label: "Bank Transfer", icon: Banknote, desc: "Transfer confirmation screenshots", color: "#3B82F6" },
  { id: "crm_donor", label: "Donor Form", icon: UserCheck, desc: "Pledge cards, donor forms", color: "#EC4899" },
];

export default function CapturePage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<DocType>("receipt");
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<any>(null);
  const [crmMatch, setCrmMatch] = useState<any>(null);
  const [checkingCrm, setCheckingCrm] = useState(false);
  const [savingToCrm, setSavingToCrm] = useState(false);
  const [savedToCrm, setSavedToCrm] = useState(false);
  const [multiRecords, setMultiRecords] = useState<any[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<number>(0);
  const [submitted, setSubmitted] = useState(false);
  const [waSentRows, setWaSentRows] = useState<Set<number>>(new Set());
  const [sendingWaAll, setSendingWaAll] = useState(false);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [rowEdits, setRowEdits] = useState<Record<number, { name?: string; amount?: string; campaign?: string }>>({})
  const [imageHash, setImageHash] = useState<string | null>(null)
  const [fundAllocation, setFundAllocation] = useState<Array<{ fund: string; amount: number }>>([])
  const [showFundAlloc, setShowFundAlloc] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState<any[] | null>(null);

  const extractMutation = trpc.documents.extract.useMutation();
  const saveCrmMutation = trpc.crm.saveScanToCRM.useMutation();
  const pledgeWaMutation = trpc.fintech.sendPledgeWhatsApp.useMutation();
  const { data: depts } = trpc.departments.list.useQuery();
  const createMutation = trpc.receipts.create.useMutation({
    onSuccess: () => { toast.success("Receipt submitted"); setSubmitted(true); setTimeout(() => setLocation("/receipts"), 1800); },
    onError: (e) => toast.error(e.message),
  });
  const checkDuplicateQuery = (trpc as any).receipts.checkDuplicate.useQuery(
    { imageHash: imageHash ?? undefined, vendor: extracted?.vendor, amount: extracted?.amount ? String(extracted.amount) : undefined, date: extracted?.date },
    { enabled: !!(imageHash || (extracted?.vendor && extracted?.amount)), staleTime: 30000 }
  )
  const { register, handleSubmit, setValue, watch } = useForm<any>({
    defaultValues: { department: "Mosque" }
  })
  const watchedAmount = watch("amount");

  // Listen for Hibba voice form-fill commands
  useHibbaFormFill("/capture", useCallback((fields: Record<string, any>) => {
    if (fields.amount) setValue("amount", String(fields.amount));
    if (fields.date) setValue("date", fields.date);
    if (fields.description) setValue("description", fields.description);
    if (fields.vendor) setValue("vendor", fields.vendor);
    if (fields.category) setValue("category", fields.category);
    if (fields.paymentMethod) setValue("paymentMethod", fields.paymentMethod);
    toast.success("Hibba filled the form — please review and submit, Insha'Allah");
  }, [setValue]));

  const checkCrmByPhone = useCallback(async (phone: string) => {
    if (!phone || phone.length < 7) return;
    setCheckingCrm(true);
    try {
      const res = await fetch(`/api/trpc/crm.matchByPhone?input=${encodeURIComponent(JSON.stringify({ phone }))}`, { credentials: "include" });
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* ignore parse errors */ }
      setCrmMatch(json?.result?.data || null);
    } catch { setCrmMatch(null); }
    finally { setCheckingCrm(false); }
  }, []);

  // Step 1: File selection — only sets preview, stores file for processing
  const handleFileSelect = useCallback((file: File) => {
    try {
      console.log("[Capture] File selected:", file.name, file.type, file.size);
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      setPendingFile(file);
      setScanError(null);
      setExtracted(null);
      setCrmMatch(null);
      setMultiRecords([]);
      setSavedToCrm(false);
      setImageHash("");
      setDuplicateWarning(null);
    } catch (err: any) {
      console.error("[Capture] File select error:", err);
      toast.error("Could not load file: " + (err?.message || "unknown error"));
    }
  }, []);

  // Step 2: Upload + AI extraction — triggered automatically or by button tap
  const processFile = useCallback(async (file: File) => {
    if (uploading || analyzing) return; // prevent double-tap
    setUploading(true);
    setAnalyzing(false);
    setScanError(null);

    try {
      // Upload file to S3
      console.log("[Capture] Starting upload, file:", file.name, file.type, file.size);
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
      // Safari throws "The string did not match the expected pattern" on res.json()
      // when response isn't valid JSON. Use text() + JSON.parse() defensively.
      const resText = await res.text();
      console.log("[Capture] Upload response status:", res.status, "body:", resText.substring(0, 200));
      let data: any;
      try {
        data = JSON.parse(resText);
      } catch (parseErr) {
        console.error("[Capture] Failed to parse upload response:", resText.substring(0, 500));
        throw new Error(`Upload error (${res.status}): ${resText.substring(0, 100) || "empty response"}`);
      }
      if (!res.ok) {
        throw new Error(data.error || `Upload failed (HTTP ${res.status})`);
      }
      const uploadUrl = data.url;
      if (!uploadUrl) {
        console.error("[Capture] Upload response missing url:", data);
        throw new Error("Upload succeeded but no file URL returned");
      }
      console.log("[Capture] Upload success:", uploadUrl);

      // AI extraction
      setUploading(false);
      setAnalyzing(true);
      console.log("[Capture] Starting AI extraction, moduleType:", docType);
      const aiData = await extractMutation.mutateAsync({
        fileUrl: uploadUrl,
        mimeType: file.type || "image/jpeg",
        moduleType: docType,
      });
      console.log("[Capture] AI extraction result:", aiData);
      if (aiData) {
        if (docType === "handwritten_collection" && (aiData as any).records) {
          const records = (aiData as any).records as any[];
          setMultiRecords(records);
          if (records.length > 0) { setExtracted(records[0]); setSelectedRecord(0); }
          toast.success(`AI found ${records.length} donor entries`);
        } else {
          setExtracted(aiData);
          if (docType === "receipt") {
            if ((aiData as any).amount) setValue("amount", (aiData as any).amount);
            if ((aiData as any).description) setValue("description", (aiData as any).description);
            if ((aiData as any).vendor) setValue("vendor", (aiData as any).vendor);
            if ((aiData as any).date) setValue("date", (aiData as any).date);
          }
          const phone = (aiData as any).donorPhone || (aiData as any).phone;
          if (phone) await checkCrmByPhone(phone);
          toast.success("AI extracted data — review and save below");
        }
      }
      setPendingFile(null); // clear pending after success
    } catch (err: any) {
      console.error("[Capture] Process error:", err);
      const msg = err?.message || "Could not process document";
      setScanError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
      setAnalyzing(false);
    }
  }, [uploading, analyzing, docType, extractMutation, setValue, checkCrmByPhone]);

  // Auto-trigger processing when a file is selected
  const hasTriggeredRef = useRef(false);
  useEffect(() => {
    if (pendingFile && !uploading && !analyzing && !extracted && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      // Small delay to ensure React has rendered the preview + spinner first
      const timer = setTimeout(() => {
        processFile(pendingFile).finally(() => { hasTriggeredRef.current = false; });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [pendingFile]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveToCrm = async (record: any) => {
    setSavingToCrm(true);
    try {
      const result = await saveCrmMutation.mutateAsync({
        donorName: record.donorName || record.name || "Unknown",
        donorPhone: record.donorPhone || record.phone,
        donorEmail: record.donorEmail || record.email,
        donorAddress: record.donorAddress || record.address,
        amount: record.amount ? parseFloat(String(record.amount)) : undefined,
        donationDate: record.donationDate || record.date,
        campaignName: record.campaignName,
        giftAid: record.giftAid === true,
        beneficiaryName: record.beneficiaryName,
        notes: record.notes || record.reference,
        sourceType: docType === "receipt" ? "fundraising_donation" : docType as any,
        existingLeadId: crmMatch?.lead?.id,
      });
      setSavedToCrm(true);
      toast.success(result.action === "updated" ? `Updated CRM: ${record.donorName}` : `Saved ${record.donorName} to CRM`);
    } catch (err: any) { toast.error("Failed: " + (err?.message || "unknown")); }
    finally { setSavingToCrm(false); }
  };

  const handleSaveAllToCrm = async () => {
    setSavingToCrm(true);
    let saved = 0;
    for (const record of multiRecords) {
      try {
        await saveCrmMutation.mutateAsync({
          donorName: record.donorName || record.name || "Unknown",
          donorPhone: record.donorPhone || record.phone,
          amount: record.amount ? parseFloat(String(record.amount)) : undefined,
          donationDate: record.donationDate,
          campaignName: record.campaignName,
          giftAid: record.giftAid === true,
          notes: record.notes,
          sourceType: "handwritten_collection",
        });
        saved++;
      } catch { /* skip */ }
    }
    setSavedToCrm(true); setSavingToCrm(false);
    toast.success(`Saved ${saved}/${multiRecords.length} donors to CRM`);
  };

  const currentRecord = multiRecords.length > 0 ? multiRecords[selectedRecord] : extracted;
  const currentDocType = DOC_TYPES.find(d => d.id === docType)!;

  if (submitted) {
    return (
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,display:"flex",alignItems:"center",justifyContent:"center" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ width:80,height:80,borderRadius:"50%",background:"rgba(0,255,194,0.15)",border:"2px solid rgba(0,255,194,0.4)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px" }}>
            <CheckCircle2 size={40} style={{ color:T.mint }}/>
          </div>
          <h2 style={{ fontSize:24,fontWeight:800,color:T.white,margin:"0 0 8px" }}>Receipt Submitted!</h2>
          <p style={{ fontSize:14,color:T.muted }}>Redirecting to expenses…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background:`linear-gradient(135deg,${T.navy} 0%,#0D2240 100%)`,minHeight:"100vh" }} className="text-white pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div style={{ background:T.purple,borderRadius:12,padding:8 }}><Sparkles size={20} color={T.white}/></div>
          <div>
            <h1 className="text-xl font-bold">AI Vision Scanner</h1>
            <p style={{ color:T.muted,fontSize:13 }}>Receipts, collection sheets, business cards & more</p>
          </div>
        </div>
      </div>

      {/* Doc Type Selector */}
      <div className="px-4 mb-4">
        <p style={{ color:T.muted,fontSize:12,marginBottom:8 }}>DOCUMENT TYPE</p>
        <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth:"none" }}>
          {DOC_TYPES.map(dt => (
            <button key={dt.id} onClick={() => { setDocType(dt.id); setExtracted(null); setCrmMatch(null); setMultiRecords([]); setPreview(null); setPendingFile(null); setScanError(null); setSavedToCrm(false); }}
              style={{ background:docType===dt.id?dt.color:T.glass,border:`1px solid ${docType===dt.id?dt.color:T.border}`,borderRadius:12,padding:"8px 14px",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6,flexShrink:0,color:T.white }}>
              <dt.icon size={14}/><span style={{ fontSize:13,fontWeight:500 }}>{dt.label}</span>
            </button>
          ))}
        </div>
        <p style={{ color:T.muted,fontSize:12,marginTop:6 }}>{currentDocType.desc}</p>
      </div>

      {/* Upload Zone */}
      <div className="px-4 mb-4">
        <div onDrop={(e)=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFileSelect(f);}} onDragOver={(e)=>e.preventDefault()} onClick={()=>fileRef.current?.click()}
          style={{ border:`2px dashed ${preview?currentDocType.color:T.border}`,borderRadius:16,padding:preview?0:24,textAlign:"center",background:preview?"rgba(0,0,0,0.3)":T.glass,cursor:"pointer",position:"relative",overflow:"hidden",transition:"all 0.3s" }}>
          {preview ? (
            <>
              <img src={preview} alt="preview" style={{ maxHeight:200,width:"100%",borderRadius:14,objectFit:"contain" }}/>
              <button onClick={(e)=>{e.stopPropagation();setPreview(null);setPendingFile(null);setScanError(null);setExtracted(null);setCrmMatch(null);setMultiRecords([]);setSavedToCrm(false);}}
                style={{ position:"absolute",top:8,right:8,width:28,height:28,borderRadius:"50%",background:"rgba(0,0,0,0.6)",border:"none",color:T.white,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
                <X size={14}/>
              </button>
              {(uploading||analyzing)&&(
                <div style={{ position:"absolute",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12 }}>
                  <Loader2 size={32} className="animate-spin" style={{ color:currentDocType.color }}/>
                  <p style={{ color:T.white,fontSize:14 }}>{uploading?"Uploading...":"AI analysing..."}</p>
                </div>
              )}
              {/* Scan button — shown when file is pending but not processing */}
              {!uploading && !analyzing && !extracted && pendingFile && (
                <div style={{ position:"absolute",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10 }}>
                  <button onClick={(e)=>{e.stopPropagation();processFile(pendingFile);}} style={{ background:currentDocType.color,border:"none",borderRadius:12,padding:"12px 24px",color:T.white,fontWeight:600,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",gap:8 }}>
                    <Sparkles size={18}/> Scan with AI
                  </button>
                  {scanError && <p style={{ color:"#ff6b6b",fontSize:12,textAlign:"center",maxWidth:"80%" }}>{scanError}</p>}
                </div>
              )}
            </>
          ) : (
            <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:12,padding:"12px 0" }}>
              <div style={{ background:`${currentDocType.color}22`,borderRadius:"50%",padding:16 }}><Camera size={28} style={{ color:currentDocType.color }}/></div>
              <div><p style={{ fontWeight:600,marginBottom:4,color:T.white }}>Tap to scan or upload</p><p style={{ color:T.muted,fontSize:13 }}>Photo, PDF, or image file</p></div>
              <div style={{ display:"flex",gap:8 }}>
                <span onClick={(e)=>{e.stopPropagation();fileRef.current?.click();}} style={{ background:T.glass,border:`1px solid ${T.border}`,borderRadius:8,padding:"4px 10px",fontSize:12,color:T.white,cursor:"pointer" }}><Camera size={12} style={{ display:"inline",marginRight:4 }}/>Camera</span>
                <span onClick={(e)=>{e.stopPropagation();galleryRef.current?.click();}} style={{ background:T.glass,border:`1px solid ${T.border}`,borderRadius:8,padding:"4px 10px",fontSize:12,color:T.white,cursor:"pointer" }}><Upload size={12} style={{ display:"inline",marginRight:4 }}/>Gallery</span>
              </div>
            </div>
          )}
        </div>
        {/* Camera input — forces camera on mobile */}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={(e)=>{const f=e.target.files?.[0];if(f)handleFileSelect(f);e.target.value="";}} />
        {/* Gallery input — opens file picker (no capture attribute) */}
        <input ref={galleryRef} type="file" accept="image/*,application/pdf" style={{ display:"none" }} onChange={(e)=>{const f=e.target.files?.[0];if(f)handleFileSelect(f);e.target.value="";}} />
      </div>

      {/* Multi-record selector — Collection Sheet Verification Table */}
      {multiRecords.length > 0 && (
        <div className="px-4 mb-4">
          <div style={{ background:T.card,borderRadius:12,padding:12,border:`1px solid #10B98144` }}>
            {/* Header */}
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8 }}>
              <div>
                <p style={{ color:T.mint,fontSize:14,fontWeight:700,margin:0 }}>✅ Ready for verification</p>
                <p style={{ color:T.muted,fontSize:12,margin:"2px 0 0" }}>Analyzing Amanah entries — {multiRecords.length} donors found</p>
              </div>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                <Button onClick={handleSaveAllToCrm} disabled={savingToCrm||savedToCrm}
                  style={{ background:"#10B981",color:T.white,borderRadius:10,fontSize:12,padding:"6px 12px",height:"auto" }}>
                  {savingToCrm?<Loader2 size={14} className="animate-spin mr-1"/>:<CheckCircle2 size={14} className="mr-1"/>}
                  Save All to CRM
                </Button>
                <Button
                  disabled={sendingWaAll}
                  onClick={async () => {
                    setSendingWaAll(true);
                    let sent = 0;
                    for (let i = 0; i < multiRecords.length; i++) {
                      const r = multiRecords[i];
                      const phone = r.donorPhone || r.phone;
                      if (!phone) continue;
                      try {
                        const res = await pledgeWaMutation.mutateAsync({
                          donorName: r.donorName || r.name || "Donor",
                          donorPhone: phone,
                          campaignName: r.campaignName,
                          amount: r.amount ? parseFloat(String(r.amount)) : undefined,
                          origin: window.location.origin,
                          giftAidDeclared: r.giftAid === true,
                        });
                        window.open(res.whatsAppUrl, "_blank");
                        setWaSentRows(prev => new Set(Array.from(prev).concat(i)));
                        sent++;
                        await new Promise(resolve => setTimeout(resolve, 700));
                      } catch { /* skip */ }
                    }
                    setSendingWaAll(false);
                    toast.success(`JazakAllah — WhatsApp pledge links opened for ${sent} donors`);
                  }}
                  style={{ background:"#25D366",color:T.white,borderRadius:10,fontSize:12,padding:"6px 12px",height:"auto" }}>
                  {sendingWaAll?<Loader2 size={14} className="animate-spin mr-1"/>:<Send size={14} className="mr-1"/>}
                  Send All WhatsApp
                </Button>
              </div>
            </div>
            {/* Verification table */}
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${T.border}` }}>
                    {["#","Name","Phone","Amount","Campaign","Gift Aid","WA","Edit"].map(h=>(
                      <th key={h} style={{ padding:"6px 8px",textAlign:"left",color:T.muted,fontWeight:600,whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {multiRecords.map((r,i)=>{
                    const conf = typeof r.confidence === "number" ? r.confidence : undefined;
                    const confColor = conf === undefined ? T.muted : conf >= 0.85 ? "#10B981" : conf >= 0.6 ? "#F59E0B" : "#EF4444";
                    const confLabel = conf === undefined ? "" : conf >= 0.85 ? "High" : conf >= 0.6 ? "Med" : "Low";
                    const edit = rowEdits[i] || {};
                    const isEditing = editingRow === i;
                    return (
                    <tr key={i}
                      onClick={()=>{ if(!isEditing){setSelectedRecord(i);setExtracted({...r,...(rowEdits[i]||{})});} }}
                      style={{ borderBottom:`1px solid ${T.border}`,cursor:"pointer",background:selectedRecord===i?"rgba(16,185,129,0.08)":"transparent" }}>
                      <td style={{ padding:"8px",color:T.muted }}>
                        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:2 }}>
                          <span>{i+1}</span>
                          {confLabel && <span style={{ fontSize:9,fontWeight:700,color:confColor,background:`${confColor}22`,borderRadius:4,padding:"1px 4px" }}>{confLabel}</span>}
                        </div>
                      </td>
                      <td style={{ padding:"8px",color:T.white,fontWeight:500 }}>
                        {isEditing ? (
                          <input value={edit.name ?? (r.donorName||r.name||"")} onChange={e=>setRowEdits(prev=>({...prev,[i]:{...prev[i],name:e.target.value}}))} onClick={e=>e.stopPropagation()} style={{ background:"#1a1a2e",border:`1px solid ${T.border}`,borderRadius:6,padding:"2px 6px",color:T.white,fontSize:12,width:"100%" }}/>
                        ) : (edit.name ?? r.donorName ?? r.name ?? "—")}
                      </td>
                      <td style={{ padding:"8px",color:T.muted,whiteSpace:"nowrap" }}>{r.donorPhone||r.phone||"—"}</td>
                      <td style={{ padding:"8px",color:"#10B981",fontWeight:600,whiteSpace:"nowrap" }}>
                        {isEditing ? (
                          <input value={edit.amount ?? (r.amount ? String(r.amount) : "")} onChange={e=>setRowEdits(prev=>({...prev,[i]:{...prev[i],amount:e.target.value}}))} onClick={e=>e.stopPropagation()} style={{ background:"#1a1a2e",border:`1px solid #10B98166`,borderRadius:6,padding:"2px 6px",color:"#10B981",fontSize:12,width:70 }}/>
                        ) : (edit.amount ? `£${edit.amount}` : r.amount ? `£${r.amount}` : "—")}
                      </td>
                      <td style={{ padding:"8px",color:T.muted,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                        {isEditing ? (
                          <input value={edit.campaign ?? (r.campaignName||"")} onChange={e=>setRowEdits(prev=>({...prev,[i]:{...prev[i],campaign:e.target.value}}))} onClick={e=>e.stopPropagation()} style={{ background:"#1a1a2e",border:`1px solid ${T.border}`,borderRadius:6,padding:"2px 6px",color:T.white,fontSize:12,width:"100%" }}/>
                        ) : (edit.campaign ?? r.campaignName ?? "—")}
                      </td>
                      <td style={{ padding:"8px",textAlign:"center" }}>{r.giftAid===true?<span style={{ color:"#10B981" }}>✓</span>:<span style={{ color:T.muted }}>—</span>}</td>
                      <td style={{ padding:"8px" }}>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const phone = r.donorPhone || r.phone;
                            if (!phone) { toast.error("No phone for this donor"); return; }
                            try {
                              const res = await pledgeWaMutation.mutateAsync({
                                donorName: r.donorName || r.name || "Donor",
                                donorPhone: phone,
                                campaignName: r.campaignName,
                                amount: r.amount ? parseFloat(String(r.amount)) : undefined,
                                origin: window.location.origin,
                                giftAidDeclared: r.giftAid === true,
                              });
                              window.open(res.whatsAppUrl, "_blank");
                              setWaSentRows(prev => new Set(Array.from(prev).concat(i)));
                              toast.success(`WhatsApp opened for ${r.donorName||"donor"}`);
                            } catch (err: any) { toast.error(err?.message || "Failed"); }
                          }}
                          style={{ background:waSentRows.has(i)?"#16a34a":"#25D366",color:"#fff",border:"none",borderRadius:8,padding:"4px 8px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontSize:11,whiteSpace:"nowrap" }}>
                          <MessageCircle size={12}/>{waSentRows.has(i)?"Sent":"WhatsApp"}
                        </button>
                      </td>
                      <td style={{ padding:"8px" }}>
                        <button
                          onClick={e=>{ e.stopPropagation(); setEditingRow(isEditing ? null : i); }}
                          style={{ background:isEditing?"#635BFF":"rgba(255,255,255,0.08)",color:"#fff",border:"none",borderRadius:8,padding:"4px 8px",cursor:"pointer",fontSize:11,whiteSpace:"nowrap" }}>
                          {isEditing ? "Done" : "Edit"}
                        </button>
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Extracted Data */}
      {currentRecord && !analyzing && (
        <div className="px-4 mb-4">
          <div style={{ background:T.card,borderRadius:16,border:`1px solid ${currentDocType.color}44`,overflow:"hidden" }}>
            <div style={{ background:`${currentDocType.color}22`,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <Sparkles size={16} style={{ color:currentDocType.color }}/><span style={{ fontWeight:600,fontSize:14,color:T.white }}>AI Extracted Data</span>
              </div>
              <Badge style={{ background:`${currentDocType.color}33`,color:currentDocType.color,border:"none",fontSize:11 }}>{currentDocType.label}</Badge>
            </div>
            {crmMatch?.matched&&(
              <div style={{ background:"#10B98122",borderBottom:"1px solid #10B98144",padding:"8px 16px",display:"flex",alignItems:"center",gap:8 }}>
                <CheckCircle2 size={16} style={{ color:"#10B981" }}/><span style={{ fontSize:13,color:"#10B981",fontWeight:500 }}>CRM Match: {crmMatch.lead?.name||crmMatch.donor?.name}</span>
              </div>
            )}
            {checkingCrm&&(
              <div style={{ background:"#635BFF22",borderBottom:"1px solid #635BFF44",padding:"8px 16px",display:"flex",alignItems:"center",gap:8 }}>
                <Loader2 size={14} className="animate-spin" style={{ color:T.purple }}/><span style={{ fontSize:13,color:T.muted }}>Checking CRM...</span>
              </div>
            )}
            <div style={{ padding:16 }}>
              <div className="grid grid-cols-1 gap-3">
                {(currentRecord.donorName||currentRecord.name)&&<FieldRow icon={UserCheck} label="Name" value={currentRecord.donorName||currentRecord.name} color={currentDocType.color}/>}
                {(currentRecord.donorPhone||currentRecord.phone)&&<FieldRow icon={Phone} label="Phone / WhatsApp" value={currentRecord.donorPhone||currentRecord.phone} color={currentDocType.color} action={<button onClick={()=>checkCrmByPhone(currentRecord.donorPhone||currentRecord.phone)} style={{ fontSize:11,color:T.purple,textDecoration:"underline" }}>Check CRM</button>}/>}
                {(currentRecord.donorEmail||currentRecord.email)&&<FieldRow icon={Mail} label="Email" value={currentRecord.donorEmail||currentRecord.email} color={currentDocType.color}/>}
                {(currentRecord.donorAddress||currentRecord.address)&&<FieldRow icon={MapPin} label="Address" value={currentRecord.donorAddress||currentRecord.address} color={currentDocType.color}/>}
                {currentRecord.amount&&<FieldRow icon={DollarSign} label="Amount" value={`\u00a3${currentRecord.amount}`} color="#10B981" highlight/>}
                {(currentRecord.donationDate||currentRecord.date)&&<FieldRow icon={Calendar} label="Date" value={currentRecord.donationDate||currentRecord.date} color={currentDocType.color}/>}
                {currentRecord.campaignName&&<FieldRow icon={Tag} label="Campaign" value={currentRecord.campaignName} color={currentDocType.color}/>}
                {currentRecord.giftAid!==undefined&&<FieldRow icon={CheckCircle2} label="Gift Aid" value={currentRecord.giftAid?"Yes \u2713":"No"} color={currentRecord.giftAid?"#10B981":T.muted}/>}
                {currentRecord.beneficiaryName&&<FieldRow icon={Heart} label="Sadaqah Jariyah For" value={currentRecord.beneficiaryName} color="#EC4899"/>}
                {currentRecord.reference&&<FieldRow icon={FileText} label="Reference" value={currentRecord.reference} color={currentDocType.color}/>}
                {currentRecord.transactionId&&<FieldRow icon={FileText} label="Transaction ID" value={currentRecord.transactionId} color={currentDocType.color}/>}
                {currentRecord.organisation&&<FieldRow icon={Tag} label="Organisation" value={currentRecord.organisation} color={currentDocType.color}/>}
                {currentRecord.jobTitle&&<FieldRow icon={UserCheck} label="Job Title" value={currentRecord.jobTitle} color={currentDocType.color}/>}
              </div>
              <div style={{ marginTop:16,display:"flex",flexDirection:"column",gap:8 }}>
                {docType!=="receipt"&&!savedToCrm&&(
                  <Button onClick={()=>handleSaveToCrm(currentRecord)} disabled={savingToCrm} style={{ background:currentDocType.color,color:T.white,borderRadius:12,width:"100%" }}>
                    {savingToCrm?<Loader2 size={16} className="animate-spin mr-2"/>:<UserCheck size={16} className="mr-2"/>}
                    {crmMatch?.matched?"Update CRM Record":"Save to Donor CRM"}
                  </Button>
                )}
                {savedToCrm&&(
                  <div style={{ background:"#10B98122",border:"1px solid #10B98144",borderRadius:12,padding:"10px 16px",display:"flex",alignItems:"center",gap:8 }}>
                    <CheckCircle2 size={16} style={{ color:"#10B981" }}/><span style={{ fontSize:14,color:"#10B981",fontWeight:500 }}>Saved to Donor CRM</span>
                    <button onClick={()=>setLocation("/donor-crm")} style={{ marginLeft:"auto",fontSize:12,color:T.purple,textDecoration:"underline" }}>View in CRM →</button>
                  </div>
                )}
                {docType==="receipt"&&checkDuplicateQuery.data?.isDuplicate&&(
                  <div style={{ background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.4)",borderRadius:12,padding:"12px 16px",display:"flex",gap:10,alignItems:"flex-start" }}>
                    <span style={{ fontSize:18 }}>⚠️</span>
                    <div>
                      <p style={{ fontWeight:700,color:"#f59e0b",fontSize:13,margin:"0 0 4px" }}>Possible Duplicate Receipt</p>
                      <p style={{ color:"rgba(255,255,255,0.6)",fontSize:12,margin:0 }}>
                        {checkDuplicateQuery.data.matches.length} similar receipt{checkDuplicateQuery.data.matches.length!==1?"s":""} found
                        {checkDuplicateQuery.data.matches[0]?.matchType==="exact_hash" ? " (identical image)" : " (same vendor & amount within 7 days)"}.
                        Please verify before submitting.
                      </p>
                    </div>
                  </div>
                )}
                {docType==="receipt"&&(
                  <form onSubmit={handleSubmit(d => {
                    const amountNum = parseFloat(d.amount || "0");
                    if (amountNum >= 500 && fundAllocation.length === 0 && !showFundAlloc) {
                      setShowFundAlloc(true);
                      return;
                    }
                    createMutation.mutate({ ...d, imageHash: imageHash ?? undefined, fundAllocation: fundAllocation.length > 0 ? fundAllocation : undefined });
                  })} style={{ display:"flex",flexDirection:"column",gap:10 }}>
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                      <div><Label style={{ fontSize:11,color:T.muted,textTransform:"uppercase" }}>Amount (£) *</Label><Input {...register("amount",{required:true})} type="number" step="0.01" placeholder="0.00" style={{ marginTop:4,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:40 }}/></div>
                      <div><Label style={{ fontSize:11,color:T.muted,textTransform:"uppercase" }}>Date</Label><Input {...register("date")} type="date" style={{ marginTop:4,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:40,colorScheme:"dark" }}/></div>
                    </div>
                    <div><Label style={{ fontSize:11,color:T.muted,textTransform:"uppercase" }}>Description *</Label><Input {...register("description",{required:true})} placeholder="What was purchased?" style={{ marginTop:4,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:40 }}/></div>
                    <div><Label style={{ fontSize:11,color:T.muted,textTransform:"uppercase" }}>Vendor</Label><Input {...register("vendor")} placeholder="Shop or supplier name" style={{ marginTop:4,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:40 }}/></div>
                    <Button type="submit" disabled={createMutation.isPending} style={{ background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",fontWeight:700,height:48,borderRadius:12,border:"none" }}>
                      {createMutation.isPending?<><Loader2 size={16} className="animate-spin mr-2"/>Submitting\u2026</>:<><Receipt size={16} className="mr-2"/>Submit Receipt</>}
                    </Button>
                  </form>
                )}
                <Button variant="outline" onClick={()=>{setPreview(null);setPendingFile(null);setScanError(null);setExtracted(null);setCrmMatch(null);setMultiRecords([]);setSavedToCrm(false);}} style={{ borderColor:T.border,color:T.muted,borderRadius:12,width:"100%",background:"transparent" }}>
                  <Camera size={16} className="mr-2"/> Scan Another
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!currentRecord&&!analyzing&&!uploading&&(
        <div className="px-4">
          <div style={{ background:T.glass,border:`1px solid ${T.border}`,borderRadius:12,padding:16 }}>
            <p style={{ color:T.muted,fontSize:13,fontWeight:600,marginBottom:8 }}>What can I scan?</p>
            <div className="grid grid-cols-1 gap-3">
              {DOC_TYPES.map(dt=>(
                <div key={dt.id} style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <div style={{ background:`${dt.color}22`,borderRadius:8,padding:6 }}><dt.icon size={14} style={{ color:dt.color }}/></div>
                  <div><p style={{ fontSize:13,fontWeight:500,color:T.white }}>{dt.label}</p><p style={{ fontSize:11,color:T.muted }}>{dt.desc}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldRow({ icon: Icon, label, value, color, highlight, action }: {
  icon: React.ElementType; label: string; value: string;
  color: string; highlight?: boolean; action?: React.ReactNode;
}) {
  return (
    <div style={{ display:"flex",alignItems:"flex-start",gap:10,background:highlight?`${color}11`:"transparent",borderRadius:8,padding:highlight?"8px 10px":"4px 0" }}>
      <Icon size={15} style={{ color,flexShrink:0,marginTop:2 }}/>
      <div style={{ flex:1,minWidth:0 }}>
        <p style={{ fontSize:11,color:"rgba(255,255,255,0.4)",marginBottom:1 }}>{label}</p>
        <p style={{ fontSize:14,fontWeight:highlight?700:400,color:highlight?color:"rgba(255,255,255,0.9)",wordBreak:"break-word" }}>{value}</p>
      </div>
      {action&&<div style={{ flexShrink:0 }}>{action}</div>}
    </div>
  );
}
