import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { Plus, TrendingUp, DollarSign, Calendar, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

const INCOME_CATEGORIES = [
  "Student Accommodation","Stalls","Office Rental","Coffee Shop",
  "Hall Hire","Friday Collection","Accountants Office Hire",
  "Community Hire","Restaurant/Bistro","Donations","Other"
];

const PERIODS = ["Daily","Weekly","Monthly","One-off"];

function Badge({ status }: { status: string }) {
  const map: Record<string,{bg:string;color:string}> = {
    paid:{bg:"rgba(0,255,194,0.1)",color:T.mint},
    pending:{bg:"rgba(251,191,36,0.1)",color:"#fbbf24"},
    overdue:{bg:"rgba(255,80,80,0.1)",color:"#ff5050"},
  };
  const s = map[status?.toLowerCase()] ?? {bg:T.glass,color:T.muted};
  return <span style={{padding:"3px 10px",borderRadius:999,fontSize:11,fontWeight:600,background:s.bg,color:s.color,textTransform:"capitalize"}}>{status}</span>;
}

export default function IncomePage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [catFilter, setCatFilter] = useState("All");
  const [period, setPeriod] = useState("Monthly");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data, refetch } = trpc.income.list.useQuery({ month, year });
  const { data: cats } = trpc.income.categories?.useQuery?.() ?? { data: null };
  const createMutation = trpc.income.create.useMutation({
    onSuccess: () => { toast.success("Income record added"); setOpen(false); refetch(); reset(); },
    onError: (e) => toast.error(e.message),
  });

  const { register, handleSubmit, reset, watch } = useForm<any>();
  const watchCat = watch("category");

  const records = data?.records ?? [];
  const totalIncome = records.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const paidCount = records.filter((r: any) => r.paymentStatus === "paid").length;

  const filtered = catFilter === "All" ? records : records.filter((r: any) => r.category === catFilter || r.categoryName === catFilter);

  const allCats = ["All", ...INCOME_CATEGORIES];

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight:"100vh", background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`, padding:24, fontFamily:"'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12,animation:"fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
              Income <span style={{ color:T.mint }}>&amp; Rentals</span>
            </h1>
            <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>All income streams — rental, collections, donations</p>
          </div>
          <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap" }}>
            {/* Month/year selector */}
            <div style={{ display:"flex",gap:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:12,padding:"6px 12px",alignItems:"center" }}>
              <Calendar size={14} style={{ color:T.muted }} />
              <select value={month} onChange={e=>setMonth(Number(e.target.value))}
                style={{ background:"transparent",border:"none",color:T.white,fontSize:13,outline:"none",cursor:"pointer" }}>
                {Array.from({length:12},(_,i)=>i+1).map(m=>(
                  <option key={m} value={m} style={{background:"#0D2240"}}>{new Date(2000,m-1).toLocaleString("en-GB",{month:"long"})}</option>
                ))}
              </select>
              <input type="number" value={year} onChange={e=>setYear(Number(e.target.value))}
                style={{ background:"transparent",border:"none",color:T.white,fontSize:13,outline:"none",width:52 }} />
            </div>
            <Button onClick={()=>setOpen(true)}
              style={{ background:`linear-gradient(135deg,${T.purple},#4f46e5)`,color:T.white,border:"none",borderRadius:12,padding:"10px 20px",fontWeight:700,display:"flex",alignItems:"center",gap:8 }}>
              <Plus size={16}/> Add Income
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16,marginBottom:28 }}>
          {[
            {label:"Total Income",value:`£${totalIncome.toLocaleString()}`,color:T.mint,icon:TrendingUp},
            {label:"Records",value:records.length,color:T.purple,icon:DollarSign},
            {label:"Paid",value:paidCount,color:"#6ee7b7",icon:DollarSign},
            {label:"Pending",value:records.length-paidCount,color:"#fbbf24",icon:DollarSign},
          ].map((s,i)=>(
            <div key={s.label} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:"18px 20px",animation:`fadeUp 0.5s ease ${i*80}ms both` }}>
              <div style={{ width:36,height:36,borderRadius:10,background:`${s.color}22`,border:`1px solid ${s.color}44`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:12 }}>
                <s.icon size={16} style={{color:s.color}}/>
              </div>
              <p style={{ fontSize:24,fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>{s.value}</p>
              <p style={{ fontSize:12,color:T.muted,margin:"2px 0 0" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Category filter tabs */}
        <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom:20 }}>
          {allCats.slice(0,8).map(c=>(
            <button key={c} onClick={()=>setCatFilter(c)}
              style={{ padding:"6px 14px",borderRadius:999,fontSize:12,fontWeight:600,border:`1px solid ${catFilter===c ? T.purple : T.border}`,background:catFilter===c ? `rgba(99,91,255,0.2)` : T.glass,color:catFilter===c ? T.white : T.muted,cursor:"pointer",transition:"all 0.2s" }}>
              {c}
            </button>
          ))}
        </div>

        {/* Records table */}
        <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:24,animation:"fadeUp 0.5s ease 300ms both" }}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse",minWidth:560 }}>
              <thead>
                <tr>
                  {["Category","Payer / Ref","Period","Amount","Status","Date"].map(h=>(
                    <th key={h} style={{ textAlign:"left",fontSize:10,fontWeight:600,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",padding:"0 12px 12px 0",borderBottom:`1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length===0 ? (
                  <tr><td colSpan={6} style={{ textAlign:"center",padding:40,color:T.muted,fontSize:14 }}>No income records for this period</td></tr>
                ) : filtered.map((r:any,i:number)=>(
                  <tr key={r.id??i}>
                    <td style={{ padding:"12px 12px 12px 0",borderBottom:`1px solid ${T.border}` }}>
                      <span style={{ fontSize:13,fontWeight:600,color:T.white }}>{r.categoryName??r.category??"—"}</span>
                    </td>
                    <td style={{ padding:"12px 12px 12px 0",fontSize:13,color:T.muted,borderBottom:`1px solid ${T.border}` }}>{r.tenantName??r.reference??"—"}</td>
                    <td style={{ padding:"12px 12px 12px 0",fontSize:12,color:T.muted,borderBottom:`1px solid ${T.border}` }}>{r.period??"—"}</td>
                    <td style={{ padding:"12px 12px 12px 0",fontSize:14,fontWeight:700,color:T.mint,borderBottom:`1px solid ${T.border}` }}>£{Number(r.amount??0).toLocaleString("en-GB",{minimumFractionDigits:2})}</td>
                    <td style={{ padding:"12px 12px 12px 0",borderBottom:`1px solid ${T.border}` }}><Badge status={r.paymentStatus??"paid"}/></td>
                    <td style={{ padding:"12px 0",fontSize:12,color:T.muted,borderBottom:`1px solid ${T.border}` }}>{r.createdAt?new Date(r.createdAt).toLocaleDateString("en-GB"):"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add income dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:480 }}>
            <DialogHeader>
              <DialogTitle style={{ color:T.white,fontSize:18,fontWeight:800 }}>Add Income Record</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(d=>createMutation.mutate({...d,month,year}))} style={{ display:"flex",flexDirection:"column",gap:14,marginTop:8 }}>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Category</Label>
                <select {...register("category",{required:true})}
                  style={{ marginTop:6,width:"100%",background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44,padding:"0 12px",fontSize:14 }}>
                  {INCOME_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {watchCat==="Community Hire" && (
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Specify</Label>
                  <Input {...register("communityHireDetail")} placeholder="Specify community hire..."
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
              )}
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Amount (£)</Label>
                  <Input {...register("amount",{required:true})} type="number" step="0.01" placeholder="0.00"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Period</Label>
                  <select {...register("period")}
                    style={{ marginTop:6,width:"100%",background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44,padding:"0 12px",fontSize:14 }}>
                    {PERIODS.map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Payer / Tenant Name</Label>
                <Input {...register("tenantName")} placeholder="Name or reference"
                  style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
              </div>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Notes</Label>
                <Input {...register("notes")} placeholder="Optional notes"
                  style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
              </div>
              <Button type="submit" disabled={createMutation.isPending}
                style={{ background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",fontWeight:700,height:48,borderRadius:12,border:"none",fontSize:15 }}>
                {createMutation.isPending?"Saving…":"Add Record"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
