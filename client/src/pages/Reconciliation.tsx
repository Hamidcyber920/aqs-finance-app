import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Scale, TrendingUp, TrendingDown, AlertCircle, Camera, Upload, Printer, Calendar, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

function BalanceIndicator({ balance }: { balance: number }) {
  const isPositive = balance >= 0;
  return (
    <div style={{ background:isPositive?"rgba(0,255,194,0.08)":"rgba(255,80,80,0.08)", border:`1px solid ${isPositive?"rgba(0,255,194,0.2)":"rgba(255,80,80,0.2)"}`, borderRadius:16, padding:"20px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <div>
        <p style={{ fontSize:13, color:T.muted, margin:"0 0 4px" }}>Reconciliation Balance</p>
        <p style={{ fontSize:32, fontWeight:800, color:isPositive?T.mint:"#ff5050", margin:0, letterSpacing:"-0.03em" }}>
          {isPositive?"":"−"}£{Math.abs(balance).toLocaleString("en-GB",{minimumFractionDigits:2})}
        </p>
        <p style={{ fontSize:12, color:isPositive?T.mint:"#ff5050", margin:"4px 0 0", fontWeight:600 }}>
          {isPositive?"✓ Funds available":"⚠ Overdrawn — review payments"}
        </p>
      </div>
      <div style={{ width:56, height:56, borderRadius:"50%", background:isPositive?"rgba(0,255,194,0.15)":"rgba(255,80,80,0.15)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        {isPositive ? <TrendingUp size={24} style={{color:T.mint}}/> : <AlertCircle size={24} style={{color:"#ff5050"}}/>}
      </div>
    </div>
  );
}

export default function ReconciliationPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [bankBalance, setBankBalance] = useState("");
  const [scanningStatement, setScanningStatement] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const statementRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
  }, [month, year]);

  const { data, refetch } = trpc.reconciliation.fullStatement.useQuery({ month, year });

  const saveBankMutation = trpc.reconciliation.updateBankBalance.useMutation({
    onSuccess: () => { toast.success("Bank balance saved"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const markPaidMutation = (trpc.reconciliation as any).markPaid?.useMutation?.({
    onSuccess: () => { toast.success("Payment marked"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const withholdMutation = trpc.reconciliation.withholdPayment.useMutation({
    onSuccess: () => { toast.success("Payment withheld"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const extractStatementMutation = trpc.bankStatement?.extract?.useMutation?.({
    onSuccess: (d: any) => {
      if (d?.closingBalance) { setBankBalance(String(d.closingBalance)); toast.success(`Balance extracted: £${d.closingBalance}`); }
      setScanningStatement(false);
    },
    onError: (e: any) => { toast.error(e.message); setScanningStatement(false); },
  });

  const income = data?.totals?.totalIncome ?? data?.income?.total ?? 0;
  const expenditure = data?.totals?.totalExpenditure ?? data?.expenditure?.total ?? 0;
  const bankBal = Number(data?.session?.bankBalance ?? bankBalance ?? 0);
  const pendingOut = data?.totals?.totalPending ?? expenditure;
  const balance = bankBal - pendingOut;

  const daysUntil25 = (() => {
    const deadline = new Date(year, month - 1, 25);
    const today = new Date();
    const diff = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  })();

  const handleStatementUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanningStatement(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method:"POST", body:fd });
    const { url } = await res.json();
    extractStatementMutation?.mutate?.({ fileUrl: url });
  };

  const rows = data?.expenditure ? [
    ...(data.expenditure.payroll ?? []),
    ...(data.expenditure.receipts ?? []),
    ...(data.expenditure.volunteers ?? []),
    ...(data.expenditure.loans ?? []),
    ...(data.expenditure.invoices ?? []),
    ...(data.expenditure.carried ?? []),
  ] : [];
  const incomeBreakdown = data?.income?.breakdown ?? [];
  const expBreakdown = data?.expenditure ? [
    ...(data.expenditure.payroll ?? []).map((r: any) => ({ type: 'payroll', category: 'Payroll', amount: r.amount })),
    ...(data.expenditure.receipts ?? []).map((r: any) => ({ type: 'receipt', category: r.categoryName ?? 'Receipt', amount: r.amount })),
    ...(data.expenditure.volunteers ?? []).map((r: any) => ({ type: 'volunteer', category: 'Volunteer', amount: r.amount })),
    ...(data.expenditure.loans ?? []).map((r: any) => ({ type: 'loan', category: 'Loan', amount: r.amount })),
    ...(data.expenditure.invoices ?? []).map((r: any) => ({ type: 'invoice', category: 'Invoice', amount: r.amount })),
  ] : [];

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:"clamp(12px,4vw,24px)",fontFamily:"'DM Sans',sans-serif",overflowX:"hidden" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12,animation:"fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
              Month-End <span style={{ color:T.mint }}>Reconciliation</span>
            </h1>
            <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>
              Balance all income and expenditure for {new Date(year,month-1).toLocaleString("en-GB",{month:"long",year:"numeric"})}
            </p>
          </div>
          <div style={{ display:"flex",gap:10,flexWrap:"wrap",alignItems:"center" }}>
            {/* Deadline indicator */}
            <div style={{ padding:"7px 14px",borderRadius:10,background:daysUntil25<0?"rgba(255,80,80,0.1)":daysUntil25<=5?"rgba(251,191,36,0.1)":"rgba(0,255,194,0.08)",border:`1px solid ${daysUntil25<0?"rgba(255,80,80,0.2)":daysUntil25<=5?"rgba(251,191,36,0.2)":"rgba(0,255,194,0.15)"}`,display:"flex",alignItems:"center",gap:6 }}>
              <Calendar size={13} style={{ color:daysUntil25<0?"#ff5050":daysUntil25<=5?"#fbbf24":T.mint }}/>
              <span style={{ fontSize:12,fontWeight:700,color:daysUntil25<0?"#ff5050":daysUntil25<=5?"#fbbf24":T.mint }}>
                {daysUntil25<0?`${Math.abs(daysUntil25)}d overdue`:daysUntil25===0?"Due today":`${daysUntil25}d until 25th`}
              </span>
            </div>
            {/* Month selector */}
            <div style={{ display:"flex",gap:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:12,padding:"6px 12px",alignItems:"center" }}>
              <select value={month} onChange={e=>setMonth(Number(e.target.value))}
                style={{ background:"transparent",border:"none",color:T.white,fontSize:13,outline:"none",cursor:"pointer" }}>
                {Array.from({length:12},(_,i)=>i+1).map(m=>(
                  <option key={m} value={m} style={{background:"#0D2240"}}>{new Date(2000,m-1).toLocaleString("en-GB",{month:"short"})}</option>
                ))}
              </select>
              <input type="number" value={year} onChange={e=>setYear(Number(e.target.value))}
                style={{ background:"transparent",border:"none",color:T.white,fontSize:13,outline:"none",width:52 }}/>
            </div>
            <Button onClick={() => window.print()}
              style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,borderRadius:12,padding:"9px 16px",fontWeight:600,display:"flex",alignItems:"center",gap:7,fontSize:13 }}>
              <Printer size={14}/> Print
            </Button>
          </div>
        </div>

        {/* Bank balance input */}
        <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:24,marginBottom:20,animation:"fadeUp 0.5s ease 100ms both" }}>
          <h2 style={{ fontSize:15,fontWeight:700,color:T.white,margin:"0 0 16px" }}>Bank Balance</h2>
          <div style={{ display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end" }}>
            <div style={{ flex:1,minWidth:200 }}>
              <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Closing Balance (£)</Label>
              <Input value={bankBalance} onChange={e=>setBankBalance(e.target.value)} type="number" step="0.01" placeholder="0.00"
                style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:46,fontSize:18,fontWeight:700 }}/>
            </div>
            <Button onClick={() => saveBankMutation?.mutate?.({ month, year, bankBalance:String(bankBalance) })} disabled={!bankBalance||saveBankMutation?.isPending}
              style={{ background:`linear-gradient(135deg,${T.purple},#4f46e5)`,color:T.white,border:"none",borderRadius:12,height:46,padding:"0 20px",fontWeight:700,fontSize:14 }}>
              {saveBankMutation?.isPending?"Saving…":"Save Balance"}
            </Button>
            <input ref={statementRef} type="file" accept="image/*,.pdf" onChange={handleStatementUpload} style={{display:"none"}}/>
            <Button onClick={()=>statementRef.current?.click()} disabled={scanningStatement}
              style={{ background:"rgba(0,255,194,0.1)",border:"1px solid rgba(0,255,194,0.2)",color:T.mint,borderRadius:12,height:46,padding:"0 16px",fontWeight:600,fontSize:13,display:"flex",alignItems:"center",gap:7 }}>
              <Camera size={14}/>{scanningStatement?"Scanning…":"Scan Statement"}
            </Button>
          </div>
        </div>

        {/* Balance indicator */}
        <div style={{ marginBottom:20, animation:"fadeUp 0.5s ease 180ms both" }}>
          <BalanceIndicator balance={balance} />
        </div>

        {/* Income & Expenditure summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          {/* Income */}
          <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid rgba(0,255,194,0.15)`,borderRadius:16,padding:20,animation:"fadeUp 0.5s ease 260ms both" }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:16 }}>
              <TrendingUp size={16} style={{color:T.mint}}/>
              <h2 style={{ fontSize:15,fontWeight:700,color:T.white,margin:0 }}>Total Income</h2>
              <span style={{ marginLeft:"auto",fontSize:18,fontWeight:800,color:T.mint }}>£{income.toLocaleString("en-GB",{minimumFractionDigits:2})}</span>
            </div>
            {(() => {
              const grouped: Record<string, number> = {};
              incomeBreakdown.forEach((item: any) => {
                const key = item.category ?? item.source ?? "Other";
                grouped[key] = (grouped[key] ?? 0) + Number(item.amount ?? 0);
              });
              const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
              if (entries.length === 0) return <p style={{ fontSize:12,color:T.muted,margin:0 }}>No income records for this period.</p>;
              return entries.map(([cat, amt], i) => (
                <div key={i} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderTop:`1px solid ${T.border}` }}>
                  <span style={{ fontSize:12,color:T.muted,flex:1 }}>{cat}</span>
                  <span style={{ fontSize:13,fontWeight:700,color:T.white }}>£{amt.toLocaleString("en-GB",{minimumFractionDigits:2})}</span>
                </div>
              ));
            })()}
          </div>
          {/* Expenditure */}
          <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid rgba(99,91,255,0.15)`,borderRadius:16,padding:20,animation:"fadeUp 0.5s ease 340ms both" }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:16 }}>
              <TrendingDown size={16} style={{color:T.purple}}/>
              <h2 style={{ fontSize:15,fontWeight:700,color:T.white,margin:0 }}>Total Expenditure</h2>
              <span style={{ marginLeft:"auto",fontSize:18,fontWeight:800,color:T.purple }}>£{expenditure.toLocaleString("en-GB",{minimumFractionDigits:2})}</span>
            </div>
            {expBreakdown.map((item: any, i: number) => (
              <div key={i} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderTop:`1px solid ${T.border}` }}>
                <span style={{ fontSize:12,color:T.muted }}>{item.type ?? item.category}</span>
                <span style={{ fontSize:12,fontWeight:600,color:T.white }}>£{Number(item.amount).toLocaleString("en-GB",{minimumFractionDigits:2})}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment rows */}
        {rows.length > 0 && (
          <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:24,animation:"fadeUp 0.5s ease 420ms both" }}>
            <h2 style={{ fontSize:15,fontWeight:700,color:T.white,margin:"0 0 20px" }}>Payment Rows</h2>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%",borderCollapse:"collapse",minWidth:580 }}>
                <thead>
                  <tr>
                    {["Payee","Type","Amount","Method","Status","Actions"].map(h=>(
                      <th key={h} style={{ textAlign:"left",fontSize:10,fontWeight:600,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",padding:"0 12px 12px 0",borderBottom:`1px solid ${T.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: any, i: number) => (
                    <tr key={row.id??i}>
                      <td style={{ padding:"11px 12px 11px 0",fontSize:13,fontWeight:600,color:T.white,borderBottom:`1px solid ${T.border}` }}>
                        {row.payee ?? row.employeeName ?? row.borrowerName ?? "—"}
                        {row.carriedFrom && <span style={{ marginLeft:6,fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:999,background:"rgba(148,163,184,0.15)",color:"#94a3b8" }}>PREV</span>}
                      </td>
                      <td style={{ padding:"11px 12px 11px 0",fontSize:12,color:T.muted,borderBottom:`1px solid ${T.border}`,textTransform:"capitalize" }}>{row.type??"—"}</td>
                      <td style={{ padding:"11px 12px 11px 0",fontSize:14,fontWeight:700,color:T.mint,borderBottom:`1px solid ${T.border}` }}>£{Number(row.amount??0).toLocaleString("en-GB",{minimumFractionDigits:2})}</td>
                      <td style={{ padding:"11px 12px 11px 0",fontSize:12,color:T.muted,borderBottom:`1px solid ${T.border}`,textTransform:"capitalize" }}>{row.paymentMethod??"—"}</td>
                      <td style={{ padding:"11px 12px 11px 0",borderBottom:`1px solid ${T.border}` }}>
                        <span style={{ padding:"3px 10px",borderRadius:999,fontSize:11,fontWeight:600,textTransform:"capitalize",
                          background:row.status==="paid"?"rgba(0,255,194,0.1)":row.status==="withheld"?"rgba(255,80,80,0.1)":"rgba(251,191,36,0.1)",
                          color:row.status==="paid"?T.mint:row.status==="withheld"?"#ff5050":"#fbbf24" }}>
                          {row.status??"pending"}
                        </span>
                      </td>
                      <td style={{ padding:"11px 0",borderBottom:`1px solid ${T.border}` }}>
                        <div style={{ display:"flex",gap:6 }}>
                          {row.status !== "paid" && (
                            <button onClick={()=>markPaidMutation?.mutate?.({id:row.id,type:row.type})}
                              style={{ padding:"4px 10px",borderRadius:8,background:"rgba(0,255,194,0.1)",border:"1px solid rgba(0,255,194,0.2)",color:T.mint,fontSize:11,fontWeight:600,cursor:"pointer" }}>
                              Pay
                            </button>
                          )}
                          {row.status !== "withheld" && row.type !== "payroll" && (
                            <button onClick={()=>withholdMutation?.mutate?.({id:row.id,type:row.type})}
                              style={{ padding:"4px 10px",borderRadius:8,background:"rgba(255,80,80,0.08)",border:"1px solid rgba(255,80,80,0.15)",color:"#ff5050",fontSize:11,fontWeight:600,cursor:"pointer" }}>
                              Withhold
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
