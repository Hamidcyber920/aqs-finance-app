import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { Camera, Upload, Loader2, CheckCircle2, Sparkles, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

const DEPARTMENTS = ["Mosque","Restaurant/Bistro","Ramadan","Staff/Payroll","Events","Other"];

export default function CapturePage() {
  const [, setLocation] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [extracted, setExtracted] = useState<any>(null);
  const [submitted, setSubmitted] = useState(false);

  const { data: depts } = trpc.departments.list.useQuery();
  const createMutation = trpc.receipts.create.useMutation({
    onSuccess: () => { toast.success("Receipt submitted"); setSubmitted(true); setTimeout(() => setLocation("/receipts"), 1800); },
    onError: (e) => toast.error(e.message),
  });

  const { register, handleSubmit, setValue, watch } = useForm<any>({
    defaultValues: { department: "Mosque" }
  });

  const handleFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method:"POST", body:fd });
      const { url } = await res.json();
      setValue("imageUrl", url);
      setUploading(false);
      setAnalyzing(true);
      // AI extraction
      const aiRes = await fetch("/api/extract-receipt", { method:"POST", body: JSON.stringify({ url }), headers:{"Content-Type":"application/json"} });
      const aiData = await aiRes.json();
      if (aiData) {
        setExtracted(aiData);
        if (aiData.amount) setValue("amount", aiData.amount);
        if (aiData.description) setValue("description", aiData.description);
        if (aiData.vendor) setValue("vendor", aiData.vendor);
        if (aiData.date) setValue("date", aiData.date);
        toast.success("AI extracted receipt data");
      }
    } catch {
      toast.error("Could not process receipt");
    } finally {
      setUploading(false);
      setAnalyzing(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (submitted) {
    return (
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ textAlign:"center",animation:"scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both" }}>
          <style>{`@keyframes scaleIn{from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}`}</style>
          <div style={{ width:80,height:80,borderRadius:"50%",background:"rgba(0,255,194,0.15)",border:"2px solid rgba(0,255,194,0.4)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px" }}>
            <CheckCircle2 size={40} style={{ color:T.mint }}/>
          </div>
          <h2 style={{ fontSize:24,fontWeight:800,color:T.white,margin:"0 0 8px" }}>Receipt Submitted!</h2>
          <p style={{ fontSize:14,color:T.muted }}>Redirecting to your expenses…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:24,fontFamily:"'DM Sans',sans-serif",maxWidth:640,margin:"0 auto" }}>

        <div style={{ marginBottom:28,animation:"fadeUp 0.4s ease both" }}>
          <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
            Scan <span style={{ color:T.mint }}>Receipt</span>
          </h1>
          <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>Upload or photograph a receipt — AI will extract the data</p>
        </div>

        {/* Drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={e=>e.preventDefault()}
          onClick={() => !preview && fileRef.current?.click()}
          style={{
            background: preview ? "transparent" : T.card,
            backdropFilter: "blur(20px)",
            border: `2px dashed ${preview ? "transparent" : uploading||analyzing ? T.mint : T.border}`,
            borderRadius:20,
            padding: preview ? 0 : "48px 24px",
            textAlign:"center",
            cursor: preview ? "default" : "pointer",
            marginBottom:24,
            transition:"all 0.3s",
            animation:"fadeUp 0.5s ease 100ms both",
            overflow:"hidden",
            position:"relative",
          }}
        >
          {preview ? (
            <div style={{ position:"relative" }}>
              <img src={preview} alt="Receipt" style={{ width:"100%",borderRadius:18,display:"block",maxHeight:320,objectFit:"cover" }}/>
              <button onClick={e=>{e.stopPropagation();setPreview(null);setExtracted(null);}}
                style={{ position:"absolute",top:10,right:10,width:32,height:32,borderRadius:"50%",background:"rgba(0,0,0,0.6)",border:"none",color:T.white,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
                <X size={16}/>
              </button>
              {(uploading||analyzing) && (
                <div style={{ position:"absolute",inset:0,background:"rgba(10,25,47,0.8)",borderRadius:18,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12 }}>
                  <Sparkles size={32} style={{ color:T.mint,animation:"pulse 1.5s infinite" }}/>
                  <p style={{ color:T.white,fontWeight:600,fontSize:14 }}>{uploading?"Uploading…":"AI analysing receipt…"}</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ width:64,height:64,borderRadius:20,background:"rgba(99,91,255,0.15)",border:"1px solid rgba(99,91,255,0.25)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px" }}>
                {uploading||analyzing ? <Loader2 size={28} style={{ color:T.purple,animation:"spin 1s linear infinite" }}/> : <Camera size={28} style={{ color:T.purple }}/>}
              </div>
              <p style={{ fontSize:16,fontWeight:700,color:T.white,margin:"0 0 6px" }}>Drop receipt here</p>
              <p style={{ fontSize:13,color:T.muted,margin:"0 0 20px" }}>or tap to browse · JPG, PNG, PDF</p>
              <div style={{ display:"flex",gap:10,justifyContent:"center" }}>
                <button onClick={e=>{e.stopPropagation();fileRef.current?.click();}}
                  style={{ padding:"9px 20px",borderRadius:10,background:`rgba(99,91,255,0.15)`,border:`1px solid rgba(99,91,255,0.3)`,color:T.purple,fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:7 }}>
                  <Upload size={14}/> Browse Files
                </button>
                <button onClick={e=>{e.stopPropagation();fileRef.current?.click();}}
                  style={{ padding:"9px 20px",borderRadius:10,background:`rgba(0,255,194,0.1)`,border:`1px solid rgba(0,255,194,0.2)`,color:T.mint,fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:7 }}>
                  <Camera size={14}/> Take Photo
                </button>
              </div>
            </>
          )}
        </div>

        <input ref={fileRef} type="file" accept="image/*,.pdf" capture="environment" onChange={e=>{ const f=e.target.files?.[0]; if(f) handleFile(f); }} style={{ display:"none" }}/>

        {/* AI extracted banner */}
        {extracted && (
          <div style={{ background:"rgba(0,255,194,0.08)",border:"1px solid rgba(0,255,194,0.2)",borderRadius:14,padding:"12px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:10,animation:"fadeUp 0.4s ease both" }}>
            <Sparkles size={16} style={{ color:T.mint,flexShrink:0 }}/>
            <p style={{ fontSize:13,color:T.mint,margin:0,fontWeight:600 }}>AI extracted data — please review and confirm below</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(d => createMutation.mutate(d))}
          style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:20,padding:24,display:"flex",flexDirection:"column",gap:16,animation:"fadeUp 0.5s ease 200ms both" }}>

          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            <div>
              <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Amount (£) *</Label>
              <Input {...register("amount",{required:true})} type="number" step="0.01" placeholder="0.00"
                style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${extracted?.amount?T.mint:T.border}`,borderRadius:10,color:T.white,height:44 }}/>
            </div>
            <div>
              <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Date</Label>
              <Input {...register("date")} type="date"
                style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${extracted?.date?T.mint:T.border}`,borderRadius:10,color:T.white,height:44,colorScheme:"dark" }}/>
            </div>
          </div>

          <div>
            <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Description *</Label>
            <Input {...register("description",{required:true})} placeholder="What was purchased?"
              style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${extracted?.description?T.mint:T.border}`,borderRadius:10,color:T.white,height:44 }}/>
          </div>

          <div>
            <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Vendor / Supplier</Label>
            <Input {...register("vendor")} placeholder="Shop or supplier name"
              style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${extracted?.vendor?T.mint:T.border}`,borderRadius:10,color:T.white,height:44 }}/>
          </div>

          <div>
            <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Department</Label>
            <select {...register("department")}
              style={{ marginTop:6,width:"100%",background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44,padding:"0 12px",fontSize:14 }}>
              {(depts ?? DEPARTMENTS).map((d: any) => (
                <option key={typeof d==="string"?d:d.id} value={typeof d==="string"?d:d.id} style={{ background:"#0D2240" }}>
                  {typeof d==="string"?d:d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Notes (optional)</Label>
            <textarea {...register("notes")} rows={2} placeholder="Any additional context…"
              style={{ marginTop:6,width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,padding:"10px 14px",fontSize:14,resize:"vertical",boxSizing:"border-box" }}/>
          </div>

          <Button type="submit" disabled={createMutation.isPending}
            style={{ background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",fontWeight:700,height:52,borderRadius:14,border:"none",fontSize:16,marginTop:4,display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
            {createMutation.isPending ? <><Loader2 size={18} className="animate-spin"/>Submitting…</> : <><Receipt size={18}/>Submit Receipt</>}
          </Button>
        </form>
      </div>
    </>
  );
}
