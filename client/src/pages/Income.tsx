import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { Plus, TrendingUp, DollarSign, Calendar, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

// Categories that have subcategory drill-downs
const SUBCATEGORY_MAP: Record<string, string[]> = {
  "Quilliam Bazaar": [
    "Stalls Hire",
    "Donations Collected",
    "Restaurant Sales",
    "General Sales",
  ],
  "Eid Income": [
    "Donations Collected",
    "Musallahs",
    "Rimmers Campaign £1,000",
    "Rimmers Campaign Other",
    "Restaurant Sales",
    "General Sales",
    "Stalls Hire",
  ],
};

const INCOME_CATEGORY_GROUPS = [
  {
    group: "Friday Income",
    items: [
      "Friday Collections",
      "Mussallah Sales £20",
      "£100 Rimmers Mussallah",
      "Direct Donations",
      "Restaurant/Bistro 87",
      "Biryani Sale",
      "Other Campaign Sales",
      "Stalls",
      "Coffee Shop",
      "Quilliam Bazaar",
      "Eid Income",
    ],
  },
  {
    group: "Kiosk Donations",
    items: ["Kiosk Donations"],
  },
  {
    group: "Rental Income",
    items: [
      "Student Accommodation",
      "Dar Al Zahra",
      "Office Rental",
      "Hall Hire",
      "Weddings",
      "Community Hire",
      "Accountants Office Hire",
      "Other",
    ],
  },
];
const INCOME_CATEGORIES = INCOME_CATEGORY_GROUPS.flatMap(g => g.items);

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

// Subcategory drill-down panel rendered inside the dialog
function SubcategoryPanel({
  parent,
  onSelect,
  onBack,
}: {
  parent: string;
  onSelect: (sub: string) => void;
  onBack: () => void;
}) {
  const subs = SUBCATEGORY_MAP[parent] ?? [];
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:0 }}>
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        style={{ display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:T.mint,fontSize:13,fontWeight:600,cursor:"pointer",padding:"0 0 16px 0",width:"fit-content" }}
      >
        <ArrowLeft size={15}/> Back to categories
      </button>

      {/* Parent label */}
      <div style={{ marginBottom:14,padding:"10px 14px",background:"rgba(99,91,255,0.12)",border:`1px solid rgba(99,91,255,0.3)`,borderRadius:10 }}>
        <p style={{ margin:0,fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em" }}>Selected category</p>
        <p style={{ margin:"4px 0 0",fontSize:15,fontWeight:700,color:T.white }}>{parent}</p>
      </div>

      <p style={{ margin:"0 0 10px",fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em" }}>Choose subcategory</p>

      <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
        {subs.map(sub => (
          <button
            key={sub}
            type="button"
            onClick={() => onSelect(sub)}
            style={{
              display:"flex",alignItems:"center",justifyContent:"space-between",
              background:"rgba(255,255,255,0.04)",border:`1px solid ${T.border}`,
              borderRadius:12,padding:"14px 16px",color:T.white,fontSize:14,
              fontWeight:500,cursor:"pointer",textAlign:"left",transition:"all 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background="rgba(0,255,194,0.08)")}
            onMouseLeave={e => (e.currentTarget.style.background="rgba(255,255,255,0.04)")}
          >
            <span>{sub}</span>
            <ChevronRight size={16} style={{ color:T.muted }}/>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function IncomePage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [catFilter, setCatFilter] = useState("All");
  const [period, setPeriod] = useState("Monthly");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  // Subcategory drill-down state
  const [subPanel, setSubPanel] = useState<string | null>(null); // parent category name when drill-down is open
  const [selectedSub, setSelectedSub] = useState<string>("");

  const { data, refetch } = trpc.income.list.useQuery({ month, year });
  const { data: cats } = trpc.income.categories?.useQuery?.() ?? { data: null };
  const createMutation = trpc.income.create.useMutation({
    onSuccess: () => {
      toast.success("Income record added");
      setOpen(false);
      setSubPanel(null);
      setSelectedSub("");
      refetch();
      reset();
    },
    onError: (e) => toast.error(e.message),
  });

  const { register, handleSubmit, reset, watch, setValue } = useForm<any>();
  const watchCat = watch("category");

  const records = data?.records ?? [];
  const totalIncome = records.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const paidCount = records.filter((r: any) => r.paymentStatus === "paid").length;

  const filtered = catFilter === "All" ? records : records.filter((r: any) => r.category === catFilter || r.categoryName === catFilter);

  const allCats = ["All", ...INCOME_CATEGORIES];

  function handleCategoryChange(cat: string) {
    setValue("category", cat);
    if (SUBCATEGORY_MAP[cat]) {
      setSubPanel(cat);
      setSelectedSub("");
    } else {
      setSubPanel(null);
      setSelectedSub("");
    }
  }

  function handleSubSelect(sub: string) {
    setSelectedSub(sub);
    setValue("subcategory", sub);
    setSubPanel(null); // close drill-down, return to main form
  }

  function handleDialogClose(v: boolean) {
    setOpen(v);
    if (!v) {
      setSubPanel(null);
      setSelectedSub("");
      reset();
    }
  }

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
                      {r.subcategory && <span style={{ display:"block",fontSize:11,color:T.muted,marginTop:2 }}>{r.subcategory}</span>}
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
        <Dialog open={open} onOpenChange={handleDialogClose}>
          <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:480 }}>
            <DialogHeader>
              <DialogTitle style={{ color:T.white,fontSize:18,fontWeight:800 }}>
                {subPanel ? `${subPanel} — Subcategory` : "Add Income Record"}
              </DialogTitle>
            </DialogHeader>

            {/* Subcategory drill-down panel */}
            {subPanel ? (
              <SubcategoryPanel
                parent={subPanel}
                onSelect={handleSubSelect}
                onBack={() => { setSubPanel(null); setValue("category",""); }}
              />
            ) : (
              <form onSubmit={handleSubmit(d => createMutation.mutate({ ...d, month, year }))} style={{ display:"flex",flexDirection:"column",gap:14,marginTop:8 }}>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Category</Label>
                  {/* Show selected category + subcategory badge when a sub was chosen */}
                  {selectedSub && watchCat ? (
                    <div style={{ marginTop:6,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                      <span style={{ padding:"6px 12px",background:"rgba(99,91,255,0.15)",border:`1px solid rgba(99,91,255,0.4)`,borderRadius:8,fontSize:13,color:T.white,fontWeight:600 }}>
                        {watchCat}
                      </span>
                      <ChevronRight size={14} style={{ color:T.muted }}/>
                      <span style={{ padding:"6px 12px",background:"rgba(0,255,194,0.1)",border:`1px solid rgba(0,255,194,0.3)`,borderRadius:8,fontSize:13,color:T.mint,fontWeight:600 }}>
                        {selectedSub}
                      </span>
                      <button type="button" onClick={() => { setValue("category",""); setValue("subcategory",""); setSelectedSub(""); }}
                        style={{ fontSize:11,color:T.muted,background:"none",border:"none",cursor:"pointer",textDecoration:"underline",padding:0 }}>
                        change
                      </button>
                    </div>
                  ) : (
                    <select
                      {...register("category",{required:true})}
                      onChange={e => handleCategoryChange(e.target.value)}
                      style={{ marginTop:6,width:"100%",background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44,padding:"0 12px",fontSize:14 }}
                    >
                      <option value="" disabled>Select category…</option>
                      {INCOME_CATEGORY_GROUPS.map(g => (
                        <optgroup key={g.group} label={`── ${g.group} ──`} style={{ color: T.mint, fontWeight: 700, background: "#081526" }}>
                          {g.items.map(c => (
                            <option key={c} value={c} style={{ background: "#0D2240", color: T.white }}>
                              {c}{SUBCATEGORY_MAP[c] ? " ›" : ""}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  )}
                  {/* Hidden subcategory field */}
                  <input type="hidden" {...register("subcategory")} />
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
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
