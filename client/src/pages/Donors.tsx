import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { Plus, Search, Users, Heart, Star, Mail, ScanLine, ExternalLink, BarChart2, Download, FileText } from "lucide-react";
import { Link } from "wouter";
import { SmartUpload } from "@/components/SmartUpload";
import { ScanMergeUndoBanner } from "@/components/ScanMergeUndoBanner";
import SmartDocumentUpload from "@/components/SmartDocumentUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

export default function DonorsPage() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [lastMergedDonorId, setLastMergedDonorId] = useState<number | null>(null);
  const [premergeSnapshot, setPremergeSnapshot] = useState<Record<string, unknown> | null>(null);
  const [appliedFields, setAppliedFields] = useState<Record<string, unknown> | null>(null);
  const [showDocScan, setShowDocScan] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split("T")[0]; });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
  }, []); 

  const { data, refetch } = trpc.donors.list.useQuery({ limit:100 });
  const computeRfmMut = (trpc as any).donorsV3.computeRfmScores.useMutation({
    onSuccess: (r: any) => { toast.success(`RFM scores updated for ${r.updated} donors`); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const RFM_COLORS: Record<string, string> = {
    Champions: "#a855f7",
    "Loyal Customers": "#3b82f6",
    "Potential Loyalists": "#06b6d4",
    "At Risk": "#f59e0b",
    "Cannot Lose Them": "#ef4444",
    Hibernating: "#6b7280",
    "New Customers": "#22c55e",
  };
  const mergeDonorMutation = trpc.donors.mergeFromScan.useMutation({
    onSuccess: (res: any) => {
      refetch();
      if (res.snapshotId && res.snapshotId > 0) setLastMergedDonorId(res.snapshotId);
      if (res.premergeSnapshot) setPremergeSnapshot(res.premergeSnapshot);
      if (res.appliedFields) setAppliedFields(res.appliedFields);
      toast.success(`Donor profile updated — ${res.updatedFields.length} field${res.updatedFields.length !== 1 ? 's' : ''} merged: ${res.updatedFields.join(', ')}`);
    },
    onError: (e: any) => toast.error(`Merge failed: ${e.message}`),
  });
  const createMutation = trpc.donors.create.useMutation({
    onSuccess: () => { toast.success("Donor added"); setOpen(false); refetch(); reset(); },
    onError: (e) => toast.error(e.message),
  });

  const { register, handleSubmit, reset, setValue } = useForm<any>();

  const donors: any[] = Array.isArray(data) ? data : [];
  const filtered = donors.filter((d: any) =>
    !search || (d.name??"").toLowerCase().includes(search.toLowerCase()) || (d.email??"").toLowerCase().includes(search.toLowerCase())
  );
  const regularDonors = donors.filter((d: any) => d.isRegular).length;
  const totalGiven = donors.reduce((s: number, d: any) => s + Number(d.totalGiven ?? 0), 0);

  /** Called when SmartDocumentUpload finishes extracting fields from a donor letter */
  function handleDocScanExtracted(fields: Record<string, any>) {
    setShowDocScan(false);
    // Open the Add Donor form pre-filled with extracted fields
    setOpen(true);
    // Small delay to allow dialog to mount before setting values
    setTimeout(() => {
      if (fields.name || fields.fullName) setValue('name', fields.name || fields.fullName);
      if (fields.email) setValue('email', fields.email);
      if (fields.phone) setValue('phone', fields.phone);
      if (fields.notes) setValue('notes', fields.notes);
      if (fields.giftAid !== undefined) setValue('giftAid', fields.giftAid);
      if (fields.isRegular !== undefined) setValue('isRegular', fields.isRegular);
    }, 250);
    toast.success("Donor details extracted — please review and save");
  }

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:24,fontFamily:"'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12,animation:"fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
              Donor <span style={{ color:T.mint }}>Management</span>
            </h1>
            <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>Community donors — Sadaqah, Zakat, regular giving</p>
          </div>
          <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap" }}>
            {/* Date range + CSV/PDF export */}
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.glass,color:T.white,padding:"0 8px",fontSize:11}} />
            <span style={{color:T.muted,fontSize:11}}>to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.glass,color:T.white,padding:"0 8px",fontSize:11}} />
            <button onClick={() => {
              const rows = donors.map((d: any) => `${d.name},${d.email || ""},${d.phone || ""},\u00a3${Number(d.totalGiven ?? 0).toFixed(2)},${d.isRegular ? "Regular" : "One-off"},${d.lastGiftDate ? new Date(d.lastGiftDate).toLocaleDateString() : ""}`);
              if (!rows.length) { toast.info("No donors to export"); return; }
              const csv = "Name,Email,Phone,Total Given,Type,Last Gift\n" + rows.join("\n");
              const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = `donors_${dateFrom}_to_${dateTo}.csv`; a.click(); URL.revokeObjectURL(url);
            }} style={{height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.glass,color:T.white,padding:"0 10px",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              <Download size={12} /> CSV
            </button>
            <button onClick={() => {
              if (!donors.length) { toast.info("No donors to export"); return; }
              let html = `<html><head><title>Donors Report ${dateFrom} to ${dateTo}</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:15px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#f5f5f5;font-weight:600}.total{font-weight:bold;font-size:14px;margin-top:10px}</style></head><body>`;
              html += `<h2>Donor Report</h2><p>${dateFrom} to ${dateTo}</p><p class="total">Total Donors: ${donors.length} | Total Given: \u00a3${totalGiven.toFixed(2)}</p>`;
              html += `<table><tr><th>Name</th><th>Email</th><th>Phone</th><th>Total Given</th><th>Type</th><th>Last Gift</th></tr>`;
              donors.forEach((d: any) => { html += `<tr><td>${d.name}</td><td>${d.email || ""}</td><td>${d.phone || ""}</td><td>\u00a3${Number(d.totalGiven ?? 0).toFixed(2)}</td><td>${d.isRegular ? "Regular" : "One-off"}</td><td>${d.lastGiftDate ? new Date(d.lastGiftDate).toLocaleDateString() : ""}</td></tr>`; });
              html += `</table></body></html>`;
              const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); w.print(); }
            }} style={{height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.glass,color:T.white,padding:"0 10px",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              <FileText size={12} /> PDF
            </button>
            {/* SmartDocumentUpload — scan a donor letter / Gift Aid form */}
            <Button
              variant="outline"
              onClick={() => setShowDocScan(true)}
              style={{ borderColor:"rgba(0,255,194,0.3)",color:T.mint,background:"rgba(0,255,194,0.06)",borderRadius:12,padding:"10px 18px",fontWeight:600,display:"flex",alignItems:"center",gap:8 }}>
              <ScanLine size={15}/> Scan Donor Letter
            </Button>
            <SmartUpload
              moduleType="crm_donor"
              buttonLabel="Scan / Upload"
              buttonVariant="outline"
              onConfirm={(result) => {
                const d = result.extractedData as any;
                if (result.matchedProfile?.id) {
                  mergeDonorMutation.mutate({
                    id: result.matchedProfile.id,
                    name: d.name || d.fullName,
                    email: d.email,
                    phone: d.phone,
                    addressLine1: d.addressLine1,
                    city: d.city,
                    postcode: d.postcode,
                    giftAid: d.giftAid,
                    notes: d.notes,
                  });
                  setLastMergedDonorId(result.matchedProfile.id);
                } else {
                  setOpen(true);
                  setTimeout(() => {
                    if (d.name || d.fullName) setValue('name', d.name || d.fullName);
                    if (d.email) setValue('email', d.email);
                    if (d.phone) setValue('phone', d.phone);
                    if (d.notes) setValue('notes', d.notes);
                  }, 200);
                }
              }}
            />
            <Button onClick={() => computeRfmMut.mutate({})} disabled={computeRfmMut.isPending}
              style={{ background:"rgba(99,91,255,0.15)",color:T.purple,border:`1px solid rgba(99,91,255,0.3)`,borderRadius:12,padding:"10px 20px",fontWeight:700,display:"flex",alignItems:"center",gap:8 }}>
              <BarChart2 size={16}/> {computeRfmMut.isPending ? "Scoring…" : "Run RFM Scoring"}
            </Button>
            <Button onClick={() => setOpen(true)}
              style={{ background:`linear-gradient(135deg,${T.purple},#4f46e5)`,color:T.white,border:"none",borderRadius:12,padding:"10px 20px",fontWeight:700,display:"flex",alignItems:"center",gap:8 }}>
              <Plus size={16}/> Add Donor
            </Button>
          </div>
        </div>

        {/* Undo banner */}
        {lastMergedDonorId !== null && (
          <div className="mb-4">
            <ScanMergeUndoBanner
              tableName="donors"
              recordId={lastMergedDonorId}
              premergeSnapshot={premergeSnapshot}
              appliedFields={appliedFields}
              onReverted={() => { refetch(); setLastMergedDonorId(null); setPremergeSnapshot(null); setAppliedFields(null); }}
            />
          </div>
        )}

        {/* Stats */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16,marginBottom:24 }}>
          {[
            { label:"Total Donors", value:donors.length, color:T.purple, icon:Users },
            { label:"Regular Donors", value:regularDonors, color:T.mint, icon:Star },
            { label:"Total Given", value:`£${totalGiven.toLocaleString()}`, color:"#f59e0b", icon:Heart },
          ].map((s,i) => (
            <div key={s.label} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:"18px 20px",display:"flex",alignItems:"center",gap:14,animation:`fadeUp 0.5s ease ${i*80}ms both` }}>
              <div style={{ width:40,height:40,borderRadius:12,background:`${s.color}22`,border:`1px solid ${s.color}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <s.icon size={18} style={{ color:s.color }}/>
              </div>
              <div>
                <p style={{ fontSize:22,fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>{s.value}</p>
                <p style={{ fontSize:11,color:T.muted,margin:0 }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ position:"relative",marginBottom:20,maxWidth:400 }}>
          <Search size={14} style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:T.muted,pointerEvents:"none" }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search donors…"
            style={{ width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:12,color:T.white,height:42,paddingLeft:36,paddingRight:14,fontSize:13,outline:"none",boxSizing:"border-box" }}/>
        </div>

        {/* Donors grid */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16 }}>
          {filtered.length === 0 ? (
            <div style={{ gridColumn:"1/-1",textAlign:"center",padding:60,color:T.muted }}>
              <Users size={36} style={{ opacity:0.3,marginBottom:12 }}/>
              <p>{search ? "No donors match your search" : "No donors yet — add one above"}</p>
            </div>
          ) : filtered.map((d: any, i: number) => (
            <div key={d.id} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:20,animation:`fadeUp 0.5s ease ${200+i*60}ms both` }}>
              <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14 }}>
                <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                  <div style={{ width:44,height:44,borderRadius:"50%",background:`linear-gradient(135deg,${T.purple},#4f46e5)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:T.white,flexShrink:0 }}>
                    {(d.name??"?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontSize:14,fontWeight:700,color:T.white,margin:0 }}>{d.name}</p>
                    <p style={{ fontSize:11,color:T.muted,margin:0 }}>{d.email??"No email"}</p>
                  </div>
                </div>
                <div style={{ display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end" }}>
                  {d.isRegular && (
                    <span style={{ fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:999,background:"rgba(0,255,194,0.1)",color:T.mint,border:"1px solid rgba(0,255,194,0.2)",flexShrink:0 }}>
                      REGULAR
                    </span>
                  )}
                  {d.rfmSegment && (
                    <span style={{ fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:999,background:`${RFM_COLORS[d.rfmSegment] ?? "#6b7280"}22`,color:RFM_COLORS[d.rfmSegment] ?? "#9ca3af",border:`1px solid ${RFM_COLORS[d.rfmSegment] ?? "#6b7280"}44`,flexShrink:0 }}>
                      {d.rfmSegment}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14 }}>
                <div style={{ background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 12px" }}>
                  <p style={{ fontSize:16,fontWeight:800,color:T.mint,margin:0 }}>£{Number(d.totalGiven??0).toLocaleString()}</p>
                  <p style={{ fontSize:10,color:T.muted,margin:0 }}>Total Given</p>
                </div>
                <div style={{ background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 12px" }}>
                  <p style={{ fontSize:12,fontWeight:600,color:T.white,margin:0 }}>{d.lastGiftDate ? new Date(d.lastGiftDate).toLocaleDateString("en-GB") : "—"}</p>
                  <p style={{ fontSize:10,color:T.muted,margin:0 }}>Last Gift</p>
                </div>
              </div>
              {d.phone && (
                <p style={{ fontSize:12,color:T.muted,margin:"0 0 12px" }}>📞 {d.phone}</p>
              )}
              <div style={{ display:"flex",gap:8 }}>
                <button style={{ flex:1,padding:"8px",borderRadius:10,background:"rgba(99,91,255,0.1)",border:"1px solid rgba(99,91,255,0.2)",color:T.purple,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
                  <Mail size={12}/> Send Thank You
                </button>
                <Link href={`/donors/${d.id}`}>
                  <button style={{ padding:"8px 12px",borderRadius:10,background:"rgba(0,255,194,0.08)",border:"1px solid rgba(0,255,194,0.2)",color:T.mint,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4 }}>
                    <ExternalLink size={12}/> Profile
                  </button>
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Add donor dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:440 }}>
            <DialogHeader>
              <DialogTitle style={{ color:T.white,fontSize:18,fontWeight:800 }}>Add Donor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(d => createMutation.mutate(d))} style={{ display:"flex",flexDirection:"column",gap:14,marginTop:8 }}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Full Name</Label>
                  <Input {...register("name",{required:true})} placeholder="Full name"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Email</Label>
                  <Input {...register("email")} type="email" placeholder="email@example.com"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Phone</Label>
                  <Input {...register("phone")} placeholder="+44..."
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
                <div style={{ display:"flex",flexDirection:"column",justifyContent:"flex-end" }}>
                  <label style={{ display:"flex",alignItems:"center",gap:10,cursor:"pointer",paddingBottom:10 }}>
                    <input type="checkbox" {...register("isRegular")} style={{ width:16,height:16,accentColor:T.mint }}/>
                    <span style={{ fontSize:13,color:T.muted }}>Regular donor</span>
                  </label>
                </div>
              </div>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Notes</Label>
                <textarea {...register("notes")} rows={2} placeholder="Any notes..."
                  style={{ marginTop:6,width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,padding:"10px 14px",fontSize:14,resize:"vertical",boxSizing:"border-box" }}/>
              </div>
              <Button type="submit" disabled={createMutation.isPending}
                style={{ background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",fontWeight:700,height:48,borderRadius:12,border:"none",fontSize:15 }}>
                {createMutation.isPending?"Saving…":"Add Donor"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* SmartDocumentUpload dialog — scan donor letter / Gift Aid form */}
        <SmartDocumentUpload
          open={showDocScan}
          onClose={() => setShowDocScan(false)}
          targetType="donor_form"
          onExtracted={handleDocScanExtracted}
        />
      </div>
    </>
  );
}
