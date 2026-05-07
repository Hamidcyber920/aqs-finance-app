import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { Plus, Upload, Wallet, Users, CheckCircle2, Clock, FileText, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

function Badge({ status }: { status: string }) {
  const map: Record<string,{bg:string;color:string}> = {
    paid:{bg:"rgba(0,255,194,0.1)",color:T.mint},
    pending:{bg:"rgba(251,191,36,0.1)",color:"#fbbf24"},
    draft:{bg:"rgba(99,91,255,0.1)",color:"#a78bfa"},
  };
  const s = map[status?.toLowerCase()] ?? {bg:T.glass,color:T.muted};
  return <span style={{padding:"3px 10px",borderRadius:999,fontSize:11,fontWeight:600,background:s.bg,color:s.color,textTransform:"capitalize"}}>{status}</span>;
}

export default function PayrollPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data, refetch } = trpc.payroll.list.useQuery({ month, year });
  const analyzeMutation = trpc.payroll.analyzePayslip?.useMutation?.({
    onSuccess: (d: any) => { toast.success(`Analysed: ${d?.employeeName ?? "payslip"}`); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const createMutation = trpc.payroll.create.useMutation({
    onSuccess: () => { toast.success("Payroll record saved"); setOpen(false); refetch(); reset(); },
    onError: (e) => toast.error(e.message),
  });

  const { register, handleSubmit, reset } = useForm<any>();

  const records = data?.records ?? [];
  const totalGross = records.reduce((s: number, r: any) => s + Number(r.grossPay ?? 0), 0);
  const totalNet = records.reduce((s: number, r: any) => s + Number(r.netPay ?? 0), 0);
  const totalDeductions = totalGross - totalNet;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const { url } = await res.json();
      analyzeMutation?.mutate?.({ fileUrl: url, month, year });
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:24,fontFamily:"'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12,animation:"fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
              Payroll <span style={{ color:T.mint }}>Management</span>
            </h1>
            <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>Monthly payslips, cheque scans, AI analysis</p>
          </div>
          <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
            {/* Month selector */}
            <div style={{ display:"flex",gap:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:12,padding:"6px 12px",alignItems:"center" }}>
              <select value={month} onChange={e=>setMonth(Number(e.target.value))}
                style={{ background:"transparent",border:"none",color:T.white,fontSize:13,outline:"none",cursor:"pointer" }}>
                {Array.from({length:12},(_,i)=>i+1).map(m=>(
                  <option key={m} value={m} style={{background:"#0D2240"}}>{new Date(2000,m-1).toLocaleString("en-GB",{month:"short"})} {year}</option>
                ))}
              </select>
            </div>
            {/* Upload payslip */}
            <input ref={fileRef} type="file" accept=".pdf,image/*" onChange={handleFileUpload} style={{ display:"none" }}/>
            <Button onClick={()=>fileRef.current?.click()} disabled={uploading}
              style={{ background:"rgba(99,91,255,0.15)",border:`1px solid rgba(99,91,255,0.3)`,color:T.purple,borderRadius:12,padding:"10px 18px",fontWeight:700,display:"flex",alignItems:"center",gap:8 }}>
              <Upload size={15}/>{uploading ? "Analysing…" : "Upload Payslip"}
            </Button>
            <Button onClick={()=>setOpen(true)}
              style={{ background:`linear-gradient(135deg,${T.purple},#4f46e5)`,color:T.white,border:"none",borderRadius:12,padding:"10px 18px",fontWeight:700,display:"flex",alignItems:"center",gap:8 }}>
              <Plus size={15}/> Manual Entry
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16,marginBottom:28 }}>
          {[
            {label:"Gross Pay",value:`£${totalGross.toLocaleString()}`,color:T.mint,icon:Wallet},
            {label:"Net Pay",value:`£${totalNet.toLocaleString()}`,color:T.purple,icon:CheckCircle2},
            {label:"Deductions",value:`£${totalDeductions.toLocaleString()}`,color:"#f87171",icon:Clock},
            {label:"Staff",value:records.length,color:"#a78bfa",icon:Users},
          ].map((s,i)=>(
            <div key={s.label} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:"18px 20px",display:"flex",alignItems:"center",gap:14,animation:`fadeUp 0.5s ease ${i*80}ms both` }}>
              <div style={{ width:40,height:40,borderRadius:12,background:`${s.color}22`,border:`1px solid ${s.color}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <s.icon size={18} style={{color:s.color}}/>
              </div>
              <div>
                <p style={{ fontSize:20,fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>{s.value}</p>
                <p style={{ fontSize:11,color:T.muted,margin:0 }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Payroll table */}
        <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:24,animation:"fadeUp 0.5s ease 300ms both" }}>
          <h2 style={{ fontSize:15,fontWeight:700,color:T.white,margin:"0 0 20px",letterSpacing:"-0.01em" }}>
            {new Date(year, month-1).toLocaleString("en-GB",{month:"long",year:"numeric"})} Payroll
          </h2>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse",minWidth:620 }}>
              <thead>
                <tr>
                  {["Employee","Tax Code","NI Number","Gross Pay","Deductions","Net Pay","Method","Status"].map(h=>(
                    <th key={h} style={{ textAlign:"left",fontSize:10,fontWeight:600,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",padding:"0 12px 12px 0",borderBottom:`1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.length===0 ? (
                  <tr><td colSpan={8} style={{ textAlign:"center",padding:48,color:T.muted,fontSize:14 }}>
                    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:12 }}>
                      <FileText size={32} style={{color:T.muted,opacity:0.4}}/>
                      <span>No payroll records — upload a payslip PDF or add manually</span>
                    </div>
                  </td></tr>
                ) : records.map((r:any,i:number)=>(
                  <tr key={r.id??i}>
                    <td style={{ padding:"12px 12px 12px 0",borderBottom:`1px solid ${T.border}` }}>
                      <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                        <div style={{ width:32,height:32,borderRadius:"50%",background:T.purple,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:T.white,flexShrink:0 }}>
                          {(r.employeeName??r.userName??"?")[0]}
                        </div>
                        <div>
                          <p style={{ fontSize:13,fontWeight:600,color:T.white,margin:0 }}>{r.employeeName??r.userName??"—"}</p>
                          <p style={{ fontSize:10,color:T.muted,margin:0 }}>{r.userId?"Staff":"Volunteer"}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:"12px 12px 12px 0",fontSize:12,color:T.muted,borderBottom:`1px solid ${T.border}` }}>{r.taxCode??"—"}</td>
                    <td style={{ padding:"12px 12px 12px 0",fontSize:12,color:T.muted,borderBottom:`1px solid ${T.border}` }}>{r.niNumber??"—"}</td>
                    <td style={{ padding:"12px 12px 12px 0",fontSize:13,fontWeight:700,color:T.mint,borderBottom:`1px solid ${T.border}` }}>£{Number(r.grossPay??0).toLocaleString("en-GB",{minimumFractionDigits:2})}</td>
                    <td style={{ padding:"12px 12px 12px 0",fontSize:13,color:"#f87171",borderBottom:`1px solid ${T.border}` }}>£{Number(r.totalDeductions??0).toLocaleString("en-GB",{minimumFractionDigits:2})}</td>
                    <td style={{ padding:"12px 12px 12px 0",fontSize:14,fontWeight:800,color:T.white,borderBottom:`1px solid ${T.border}` }}>£{Number(r.netPay??0).toLocaleString("en-GB",{minimumFractionDigits:2})}</td>
                    <td style={{ padding:"12px 12px 12px 0",fontSize:12,color:T.muted,borderBottom:`1px solid ${T.border}`,textTransform:"capitalize" }}>{r.paymentMethod??"bank"}</td>
                    <td style={{ padding:"12px 0",borderBottom:`1px solid ${T.border}` }}><Badge status={r.status??"pending"}/></td>
                  </tr>
                ))}
              </tbody>
              {records.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop:`2px solid rgba(99,91,255,0.3)` }}>
                    <td colSpan={3} style={{ padding:"16px 12px 0 0",fontSize:12,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Totals</td>
                    <td style={{ padding:"16px 12px 0 0",fontSize:15,fontWeight:800,color:T.mint }}>£{totalGross.toLocaleString("en-GB",{minimumFractionDigits:2})}</td>
                    <td style={{ padding:"16px 12px 0 0",fontSize:15,fontWeight:800,color:"#f87171" }}>£{totalDeductions.toLocaleString("en-GB",{minimumFractionDigits:2})}</td>
                    <td style={{ padding:"16px 0 0",fontSize:16,fontWeight:800,color:T.white }}>£{totalNet.toLocaleString("en-GB",{minimumFractionDigits:2})}</td>
                    <td colSpan={2}/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Manual entry dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:480 }}>
            <DialogHeader>
              <DialogTitle style={{ color:T.white,fontSize:18,fontWeight:800 }}>Manual Payroll Entry</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(d=>createMutation.mutate({...d,month,year}))} style={{ display:"flex",flexDirection:"column",gap:14,marginTop:8 }}>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Employee Name</Label>
                <Input {...register("employeeName",{required:true})} placeholder="Full name"
                  style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Gross Pay (£)</Label>
                  <Input {...register("grossPay",{required:true})} type="number" step="0.01"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Deductions (£)</Label>
                  <Input {...register("totalDeductions")} type="number" step="0.01" defaultValue="0"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Tax Code</Label>
                  <Input {...register("taxCode")} placeholder="e.g. 1257L"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Payment Method</Label>
                  <select {...register("paymentMethod")}
                    style={{ marginTop:6,width:"100%",background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44,padding:"0 12px",fontSize:14 }}>
                    <option value="bank">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
              </div>
              <Button type="submit" disabled={createMutation.isPending}
                style={{ background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",fontWeight:700,height:48,borderRadius:12,border:"none",fontSize:15 }}>
                {createMutation.isPending?"Saving…":"Save Record"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
