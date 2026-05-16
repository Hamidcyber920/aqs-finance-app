import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { FileText, Download, TrendingUp, DollarSign, Receipt, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartUpload } from "@/components/SmartUpload";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px" }}>
      <p style={{ fontSize:12,color:T.muted,margin:"0 0 6px" }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ fontSize:13,fontWeight:700,color:p.color,margin:"2px 0" }}>
          £{Number(p.value).toLocaleString()} <span style={{ fontWeight:400,color:T.muted }}>{p.name}</span>
        </p>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
  }, [month, year]);

  const { data: reportData } = trpc.expenses.monthlySummary.useQuery({ month, year });

  const monthlyData = [
    { month:"Jan", income:12400, expenses:8200 },
    { month:"Feb", income:15800, expenses:9100 },
    { month:"Mar", income:11200, expenses:7800 },
    { month:"Apr", income:18600, expenses:11200 },
    { month:"May", income:14300, expenses:8900 },
    { month:"Jun", income:21000, expenses:13400 },
  ];

  const categoryData = [
    { name:"Maintenance", amount:4200 },
    { name:"Catering", amount:3100 },
    { name:"Payroll", amount:8400 },
    { name:"Utilities", amount:1200 },
    { name:"Events", amount:2300 },
    { name:"Travel", amount:680 },
  ];

  const handleGeneratePDF = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/reports/monthly?month=${month}&year=${year}`, { method:"POST" });
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast.success("Report generated");
    } catch {
      toast.error("Could not generate report");
    } finally {
      setGenerating(false);
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
              Financial <span style={{ color:T.mint }}>Reports</span>
            </h1>
            <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>Monthly summaries, exports and analytics</p>
          </div>
          <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap" }}>
            <div style={{ display:"flex",gap:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:12,padding:"6px 12px",alignItems:"center" }}>
              <select value={month} onChange={e=>setMonth(Number(e.target.value))}
                style={{ background:"transparent",border:"none",color:T.white,fontSize:13,outline:"none",cursor:"pointer" }}>
                {Array.from({length:12},(_,i)=>i+1).map(m=>(
                  <option key={m} value={m} style={{background:"#0D2240"}}>{new Date(2000,m-1).toLocaleString("en-GB",{month:"long"})}</option>
                ))}
              </select>
              <input type="number" value={year} onChange={e=>setYear(Number(e.target.value))}
                style={{ background:"transparent",border:"none",color:T.white,fontSize:13,outline:"none",width:52 }}/>
            </div>
            <SmartUpload
              moduleType="bank_statement"
              buttonLabel="Scan / Upload"
              buttonVariant="outline"
              onConfirm={(result) => {
                const d = result.extractedData as any;
                toast.info(`AI extracted bank statement: closing balance £${d.closingBalance ?? "?"}. Review data below.`);
              }}
            />
            <Button onClick={handleGeneratePDF} disabled={generating}
              style={{ background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",border:"none",borderRadius:12,padding:"10px 20px",fontWeight:700,display:"flex",alignItems:"center",gap:8 }}>
              <Download size={15}/>{generating?"Generating…":"Export PDF"}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16,marginBottom:28 }}>
          {[
            { label:"Total Income", value:"£42,800", change:"+12%", color:T.mint, icon:TrendingUp },
            { label:"Total Expenses", value:"£28,340", change:"-3%", color:"#f87171", icon:Receipt },
            { label:"Net Balance", value:"£14,460", change:"+28%", color:T.purple, icon:DollarSign },
            { label:"Transactions", value:"284", change:"+7%", color:"#f59e0b", icon:BarChart3 },
          ].map((s,i) => (
            <div key={s.label} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:"20px",animation:`fadeUp 0.5s ease ${i*80}ms both` }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12 }}>
                <div style={{ width:36,height:36,borderRadius:10,background:`${s.color}22`,border:`1px solid ${s.color}44`,display:"flex",alignItems:"center",justifyContent:"center" }}>
                  <s.icon size={16} style={{ color:s.color }}/>
                </div>
                <span style={{ fontSize:11,fontWeight:700,color:s.change.startsWith("+")?T.mint:"#f87171",background:s.change.startsWith("+")?"rgba(0,255,194,0.1)":"rgba(248,113,113,0.1)",padding:"2px 8px",borderRadius:999 }}>
                  {s.change}
                </span>
              </div>
              <p style={{ fontSize:24,fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>{s.value}</p>
              <p style={{ fontSize:12,color:T.muted,margin:"3px 0 0" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:24 }}>

          {/* Monthly bar chart */}
          <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:24,animation:"fadeUp 0.5s ease 300ms both" }}>
            <h2 style={{ fontSize:15,fontWeight:700,color:T.white,margin:"0 0 20px",letterSpacing:"-0.01em" }}>Income vs Expenses</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} barSize={16} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                <XAxis dataKey="month" tick={{ fill:"rgba(255,255,255,0.4)",fontSize:11 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:"rgba(255,255,255,0.4)",fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v=>`£${(v/1000).toFixed(0)}k`}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Bar dataKey="income" name="Income" fill={T.mint} radius={[4,4,0,0]} opacity={0.85}/>
                <Bar dataKey="expenses" name="Expenses" fill={T.purple} radius={[4,4,0,0]} opacity={0.85}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Expense by category */}
          <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:24,animation:"fadeUp 0.5s ease 380ms both" }}>
            <h2 style={{ fontSize:15,fontWeight:700,color:T.white,margin:"0 0 20px",letterSpacing:"-0.01em" }}>Expenses by Category</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData} layout="vertical" barSize={12}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false}/>
                <XAxis type="number" tick={{ fill:"rgba(255,255,255,0.4)",fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v=>`£${(v/1000).toFixed(1)}k`}/>
                <YAxis type="category" dataKey="name" tick={{ fill:"rgba(255,255,255,0.5)",fontSize:11 }} axisLine={false} tickLine={false} width={80}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Bar dataKey="amount" name="Amount" fill={T.purple} radius={[0,4,4,0]} opacity={0.85}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Report cards */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:16 }}>
          {[
            { title:"Monthly Income & Expenses", desc:"Full breakdown of all income sources and expenditure", icon:FileText, color:T.mint },
            { title:"Payroll Summary", desc:"Staff salaries, deductions and net payments", icon:DollarSign, color:T.purple },
            { title:"Qarde Hasan Report", desc:"Active loans, repayment schedule, outstanding balance", icon:BarChart3, color:"#f59e0b" },
            { title:"Fundraising Report", desc:"Campaign progress, donation breakdown by method", icon:TrendingUp, color:"#a78bfa" },
          ].map((r,i) => (
            <div key={r.title} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:20,animation:`fadeUp 0.5s ease ${460+i*80}ms both` }}>
              <div style={{ width:40,height:40,borderRadius:12,background:`${r.color}22`,border:`1px solid ${r.color}44`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14 }}>
                <r.icon size={18} style={{ color:r.color }}/>
              </div>
              <h3 style={{ fontSize:14,fontWeight:700,color:T.white,margin:"0 0 6px" }}>{r.title}</h3>
              <p style={{ fontSize:12,color:T.muted,margin:"0 0 16px",lineHeight:1.5 }}>{r.desc}</p>
              <button onClick={handleGeneratePDF} disabled={generating}
                style={{ width:"100%",padding:"9px",borderRadius:10,background:`${r.color}15`,border:`1px solid ${r.color}30`,color:r.color,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all 0.2s" }}>
                <Download size={13}/> Export PDF
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
