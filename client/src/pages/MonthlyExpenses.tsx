import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import {
  ClipboardList, ChevronDown, ChevronUp, Check, X,
  Upload, Camera, Clock, AlertCircle, Send, Plus, Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

const SECTION_COLORS: Record<string,string> = {
  payroll: T.purple, invoices: "#f59e0b", volunteers: T.mint, loans: "#a78bfa",
};

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string,{bg:string;color:string}> = {
    paid:{bg:"rgba(0,255,194,0.1)",color:T.mint},
    pending:{bg:"rgba(251,191,36,0.1)",color:"#fbbf24"},
    withheld:{bg:"rgba(255,80,80,0.1)",color:"#ff5050"},
    authorised:{bg:"rgba(99,91,255,0.15)",color:"#a78bfa"},
    deferred:{bg:"rgba(148,163,184,0.1)",color:"#94a3b8"},
  };
  const s = map[status?.toLowerCase()] ?? {bg:T.glass,color:T.muted};
  return <span style={{ padding:"3px 10px",borderRadius:999,fontSize:11,fontWeight:600,background:s.bg,color:s.color,textTransform:"capitalize" }}>{status}</span>;
}

function SectionCard({ title, items, color, onAuthorise, onReject, onPay, onWithhold, canEdit }: any) {
  const [expanded, setExpanded] = useState(true);
  const total = items.reduce((s: number, i: any) => s + Number(i.amount ?? i.grossPay ?? i.netPay ?? 0), 0);

  return (
    <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,overflow:"hidden",marginBottom:16 }}>
      {/* Section header */}
      <button onClick={() => setExpanded(!expanded)} style={{ width:"100%",padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"transparent",border:"none",cursor:"pointer",borderBottom:expanded?`1px solid ${T.border}`:"none" }}>
        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
          <div style={{ width:10,height:10,borderRadius:"50%",background:color,boxShadow:`0 0 8px ${color}` }}/>
          <span style={{ fontSize:15,fontWeight:700,color:T.white }}>{title}</span>
          <span style={{ fontSize:12,color:T.muted,background:"rgba(255,255,255,0.06)",padding:"2px 10px",borderRadius:999 }}>{items.length} items</span>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:16 }}>
          <span style={{ fontSize:15,fontWeight:800,color }}>£{total.toLocaleString("en-GB",{minimumFractionDigits:2})}</span>
          {expanded ? <ChevronUp size={16} style={{color:T.muted}}/> : <ChevronDown size={16} style={{color:T.muted}}/>}
        </div>
      </button>

      {expanded && (
        <div>
          {items.length === 0 ? (
            <div style={{ padding:"32px",textAlign:"center",color:T.muted,fontSize:13 }}>No items this month</div>
          ) : items.map((item: any, i: number) => (
            <div key={item.id??i} style={{ padding:"14px 20px",borderBottom:i<items.length-1?`1px solid ${T.border}`:"none",
              background:item.status==="withheld"?"rgba(255,80,80,0.04)":item.authorisedById?"rgba(0,255,194,0.02)":"transparent" }}>
              <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap" }}>
                <div style={{ flex:1,minWidth:200 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
                    <span style={{ fontSize:13,fontWeight:600,color:T.white }}>
                      {item.employeeName ?? item.description ?? item.borrowerName ?? "—"}
                    </span>
                    <PaymentBadge status={item.status ?? (item.authorisedById?"authorised":"pending")}/>
                    {item.carriedFrom && <span style={{ fontSize:10,fontWeight:600,padding:"1px 7px",borderRadius:999,background:"rgba(148,163,184,0.15)",color:"#94a3b8" }}>PREV MONTH</span>}
                  </div>
                  <div style={{ display:"flex",gap:16,flexWrap:"wrap" }}>
                    <span style={{ fontSize:12,color:T.muted }}>{item.category ?? item.paymentMethod ?? item.purpose ?? "—"}</span>
                    {item.createdAt && <span style={{ fontSize:11,color:"rgba(255,255,255,0.3)" }}>{new Date(item.createdAt).toLocaleDateString("en-GB")}</span>}
                  </div>
                  {item.authorisedByName && (
                    <p style={{ fontSize:11,color:T.mint,margin:"4px 0 0" }}>✓ Authorised by {item.authorisedByName} {item.authorisedAt ? `at ${new Date(item.authorisedAt).toLocaleString("en-GB")}` : ""}</p>
                  )}
                  {item.rejectionComment && (
                    <p style={{ fontSize:11,color:"#ff5050",margin:"4px 0 0" }}>✗ Deferred: {item.rejectionComment}</p>
                  )}
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
                  <span style={{ fontSize:16,fontWeight:800,color }}> £{Number(item.amount??item.grossPay??item.netPay??0).toLocaleString("en-GB",{minimumFractionDigits:2})}</span>
                  <div style={{ display:"flex",gap:6 }}>
                    {canEdit && !item.authorisedById && (
                      <>
                        <button onClick={()=>onAuthorise(item)} title="Authorise"
                          style={{ width:32,height:32,borderRadius:8,background:"rgba(0,255,194,0.1)",border:"1px solid rgba(0,255,194,0.25)",color:T.mint,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
                          <Check size={14}/>
                        </button>
                        <button onClick={()=>onReject(item)} title="Reject / Defer"
                          style={{ width:32,height:32,borderRadius:8,background:"rgba(255,80,80,0.1)",border:"1px solid rgba(255,80,80,0.2)",color:"#ff5050",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
                          <X size={14}/>
                        </button>
                      </>
                    )}
                    {canEdit && item.authorisedById && item.status !== "paid" && (
                      <button onClick={()=>onPay(item)}
                        style={{ padding:"4px 12px",borderRadius:8,background:"rgba(0,255,194,0.1)",border:"1px solid rgba(0,255,194,0.2)",color:T.mint,fontSize:11,fontWeight:700,cursor:"pointer" }}>
                        Mark Paid
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MonthlyExpensesPage() {
  const { user } = useAuth();
  const { canEdit } = usePermissions();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectItem, setRejectItem] = useState<any>(null);
  const [rejectComment, setRejectComment] = useState("");

  const { data, refetch } = trpc.expenses.allItems.useQuery({ month, year });

  const authoriseMutation = trpc.expenses.authorise.useMutation({
    onSuccess: () => { toast.success("Payment authorised"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const rejectMutation = trpc.expenses.reject.useMutation({
    onSuccess: () => { toast.success("Payment deferred"); setRejectOpen(false); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const markPaidMutation = trpc.expenses.nowPaid.useMutation({
    onSuccess: () => { toast.success("Marked as paid"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const payroll = data?.payroll ?? [];
  const invoices = data?.receipts ?? [];
  const volunteers = data?.volunteers ?? [];
  const loans = data?.loans ?? [];

  const totalAll = [...payroll, ...invoices, ...volunteers, ...loans]
    .reduce((s, i: any) => s + Number(i.amount ?? i.grossPay ?? 0), 0);
  const authorisedTotal = [...payroll, ...invoices, ...volunteers, ...loans]
    .filter((i: any) => i.authorisedById)
    .reduce((s, i: any) => s + Number(i.amount ?? i.grossPay ?? 0), 0);

  const handleAuthorise = (item: any) => {
    authoriseMutation?.mutate?.({ id: item.id, type: item._type ?? "invoice" });
  };
  const handleReject = (item: any) => {
    setRejectItem(item);
    setRejectOpen(true);
  };
  const handlePay = (item: any) => {
    markPaidMutation?.mutate?.({ id: item.id, type: item._type ?? "invoice" });
  };

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:24,fontFamily:"'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12,animation:"fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
              Monthly <span style={{ color:T.mint }}>Expenses</span>
            </h1>
            <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>Authorise, defer and track all outgoing payments</p>
          </div>
          <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap" }}>
            <div style={{ display:"flex",gap:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:12,padding:"6px 12px",alignItems:"center" }}>
              <Calendar size={14} style={{ color:T.muted }}/>
              <select value={month} onChange={e=>setMonth(Number(e.target.value))}
                style={{ background:"transparent",border:"none",color:T.white,fontSize:13,outline:"none",cursor:"pointer" }}>
                {Array.from({length:12},(_,i)=>i+1).map(m=>(
                  <option key={m} value={m} style={{background:"#0D2240"}}>{new Date(2000,m-1).toLocaleString("en-GB",{month:"long"})}</option>
                ))}
              </select>
              <input type="number" value={year} onChange={e=>setYear(Number(e.target.value))}
                style={{ background:"transparent",border:"none",color:T.white,fontSize:13,outline:"none",width:52 }}/>
            </div>
          </div>
        </div>

        {/* Summary bar */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16,marginBottom:28 }}>
          {[
            { label:"Total Outgoings", value:`£${totalAll.toLocaleString("en-GB",{minimumFractionDigits:2})}`, color:T.purple },
            { label:"Authorised", value:`£${authorisedTotal.toLocaleString("en-GB",{minimumFractionDigits:2})}`, color:T.mint },
            { label:"Pending Auth", value:`£${(totalAll-authorisedTotal).toLocaleString("en-GB",{minimumFractionDigits:2})}`, color:"#fbbf24" },
            { label:"Items", value:payroll.length+invoices.length+volunteers.length+loans.length, color:"#a78bfa" },
          ].map((s,i) => (
            <div key={s.label} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:14,padding:"16px 18px",animation:`fadeUp 0.5s ease ${i*80}ms both` }}>
              <p style={{ fontSize:22,fontWeight:800,color:s.color,margin:0,letterSpacing:"-0.03em" }}>{s.value}</p>
              <p style={{ fontSize:12,color:T.muted,margin:"3px 0 0" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Sections */}
        <SectionCard title="Payroll" items={payroll.map((i:any)=>({...i,_type:"payroll"}))} color={SECTION_COLORS.payroll} onAuthorise={handleAuthorise} onReject={handleReject} onPay={handlePay} onWithhold={()=>{}} canEdit={canEdit}/>
        <SectionCard title="Invoices & Receipts" items={invoices.map((i:any)=>({...i,_type:"invoice"}))} color={SECTION_COLORS.invoices} onAuthorise={handleAuthorise} onReject={handleReject} onPay={handlePay} onWithhold={()=>{}} canEdit={canEdit}/>
        <SectionCard title="Volunteer Payments" items={volunteers.map((i:any)=>({...i,_type:"volunteer"}))} color={SECTION_COLORS.volunteers} onAuthorise={handleAuthorise} onReject={handleReject} onPay={handlePay} onWithhold={()=>{}} canEdit={canEdit}/>
        <SectionCard title="Qarde Hasan Repayments" items={loans.map((i:any)=>({...i,_type:"loan"}))} color={SECTION_COLORS.loans} onAuthorise={handleAuthorise} onReject={handleReject} onPay={handlePay} onWithhold={()=>{}} canEdit={canEdit}/>

        {/* Reject/defer dialog */}
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:420 }}>
            <DialogHeader>
              <DialogTitle style={{ color:T.white,fontSize:18,fontWeight:800 }}>Defer Payment</DialogTitle>
            </DialogHeader>
            <div style={{ display:"flex",flexDirection:"column",gap:14,marginTop:8 }}>
              <p style={{ fontSize:13,color:T.muted }}>This payment will be deferred to next month. Please provide a reason.</p>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Reason</Label>
                <textarea value={rejectComment} onChange={e=>setRejectComment(e.target.value)} rows={3} placeholder="e.g. Insufficient funds this month"
                  style={{ marginTop:6,width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,padding:"10px 14px",fontSize:14,resize:"vertical",boxSizing:"border-box" }}/>
              </div>
              <Button onClick={() => rejectMutation?.mutate?.({ id:rejectItem?.id, type:rejectItem?._type??"invoice", comment:rejectComment, month, year })}
                disabled={!rejectComment||rejectMutation?.isPending}
                style={{ background:"rgba(255,80,80,0.15)",border:"1px solid rgba(255,80,80,0.3)",color:"#ff5050",fontWeight:700,height:46,borderRadius:12,fontSize:15 }}>
                {rejectMutation?.isPending?"Deferring…":"Defer to Next Month"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
