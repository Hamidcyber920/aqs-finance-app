import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { Plus, TrendingUp, DollarSign, Calendar, ChevronRight, ArrowLeft, Upload, X, Camera } from "lucide-react";
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
      "£1,000 Donors Wall",
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

// Friday Income and Kiosk Donations use a date picker instead of period dropdown
const FRIDAY_INCOME_CATS = new Set([
  "Friday Collections","Mussallah Sales £20","£100 Rimmers Mussallah",
  "£1,000 Donors Wall","Direct Donations","Restaurant/Bistro 87","Biryani Sale",
  "Other Campaign Sales","Stalls","Coffee Shop","Quilliam Bazaar","Eid Income",
  "Kiosk Donations",
]);

function Badge({ status }: { status: string }) {
  const map: Record<string,{bg:string;color:string}> = {
    paid:{bg:"rgba(0,255,194,0.1)",color:T.mint},
    pending:{bg:"rgba(251,191,36,0.1)",color:"#fbbf24"},
    overdue:{bg:"rgba(255,80,80,0.1)",color:"#ff5050"},
  };
  const s = map[status?.toLowerCase()] ?? {bg:T.glass,color:T.muted};
  return <span style={{padding:"3px 10px",borderRadius:999,fontSize:11,fontWeight:600,background:s.bg,color:s.color,textTransform:"capitalize"}}>{status}</span>;
}

// Generate Eid date options: past 3 years + next year, formatted as "Wednesday, 2 April 2025"
function generateEidDates(): { value: string; label: string }[] {
  const dates: { value: string; label: string }[] = [];
  const currentYear = new Date().getFullYear();
  // Approximate Eid-ul-Fitr dates (1 Shawwal) — hardcoded known/estimated dates
  const eidFitrDates = [
    new Date(2022, 4, 2),   // 2 May 2022
    new Date(2023, 3, 21),  // 21 Apr 2023
    new Date(2024, 3, 10),  // 10 Apr 2024
    new Date(2025, 2, 30),  // 30 Mar 2025
    new Date(2026, 2, 20),  // 20 Mar 2026
  ];
  // Approximate Eid-ul-Adha dates (10 Dhul Hijjah)
  const eidAdhaDatesList = [
    new Date(2022, 6, 9),   // 9 Jul 2022
    new Date(2023, 5, 28),  // 28 Jun 2023
    new Date(2024, 5, 16),  // 16 Jun 2024
    new Date(2025, 5, 6),   // 6 Jun 2025
    new Date(2026, 4, 27),  // 27 May 2026
  ];
  const allDates = [...eidFitrDates, ...eidAdhaDatesList].sort((a, b) => b.getTime() - a.getTime());
  for (const d of allDates) {
    const value = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    dates.push({ value, label });
  }
  return dates;
}

const EID_DATES = generateEidDates();

// Subcategory drill-down panel rendered inside the dialog
function SubcategoryPanel({
  parent,
  onSelect,
  onBack,
  eidType,
  setEidType,
  eidDate,
  setEidDate,
  bazaarDate,
  setBazaarDate,
}: {
  parent: string;
  onSelect: (sub: string) => void;
  onBack: () => void;
  eidType: string;
  setEidType: (v: string) => void;
  eidDate: string;
  setEidDate: (v: string) => void;
  bazaarDate: string;
  setBazaarDate: (v: string) => void;
}) {
  const subs = SUBCATEGORY_MAP[parent] ?? [];
  const isEid = parent === "Eid Income";
  const isBazaar = parent === "Quilliam Bazaar";
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

      {/* Quilliam Bazaar date picker */}
      {isBazaar && (
        <div style={{ display:"flex",flexDirection:"column",gap:12,marginBottom:18,padding:"14px 16px",background:"rgba(0,255,194,0.04)",border:`1px solid rgba(0,255,194,0.15)`,borderRadius:12 }}>
          <div>
            <p style={{ margin:"0 0 8px",fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em" }}>Bazaar Date</p>
            <label style={{ position:"relative",display:"block",cursor:"pointer" }}>
              <div style={{
                width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${bazaarDate ? T.mint : T.border}`,
                borderRadius:10,color: bazaarDate ? T.white : T.muted,height:44,padding:"0 12px",fontSize:13,
                display:"flex",alignItems:"center",gap:8,pointerEvents:"none",
              }}>
                <Calendar size={14} style={{ color: bazaarDate ? T.mint : T.muted, flexShrink:0 }}/>
                <span>{bazaarDate
                  ? new Date(bazaarDate + "T12:00:00").toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
                  : "Select date…"
                }</span>
              </div>
              <input
                type="date"
                value={bazaarDate}
                onChange={e => setBazaarDate(e.target.value)}
                style={{ position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer" }}
              />
            </label>
          </div>
        </div>
      )}

      {/* Eid-specific selectors */}
      {isEid && (
        <div style={{ display:"flex",flexDirection:"column",gap:12,marginBottom:18,padding:"14px 16px",background:"rgba(0,255,194,0.04)",border:`1px solid rgba(0,255,194,0.15)`,borderRadius:12 }}>
          {/* Eid type selector */}
          <div>
            <p style={{ margin:"0 0 8px",fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em" }}>Which Eid?</p>
            <div style={{ display:"flex",gap:10 }}>
              {["Eid-ul-Fitr","Eid-ul-Adha"].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setEidType(type)}
                  style={{
                    flex:1,padding:"10px 0",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.15s",
                    background: eidType === type ? "rgba(0,255,194,0.15)" : "rgba(255,255,255,0.04)",
                    border: eidType === type ? `1.5px solid ${T.mint}` : `1px solid ${T.border}`,
                    color: eidType === type ? T.mint : T.muted,
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          {/* Eid date picker */}
          <div>
            <p style={{ margin:"0 0 8px",fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em" }}>Eid Date</p>
            <label style={{ position:"relative",display:"block",cursor:"pointer" }}>
              {/* Visible formatted display */}
              <div style={{
                width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${eidDate ? T.mint : T.border}`,
                borderRadius:10,color: eidDate ? T.white : T.muted,height:44,padding:"0 12px",fontSize:13,
                display:"flex",alignItems:"center",gap:8,pointerEvents:"none",
              }}>
                <Calendar size={14} style={{ color: eidDate ? T.mint : T.muted, flexShrink:0 }}/>
                <span>{eidDate
                  ? new Date(eidDate + "T12:00:00").toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
                  : "Select Eid date…"
                }</span>
              </div>
              {/* Invisible native date input layered on top */}
              <input
                type="date"
                value={eidDate}
                onChange={e => setEidDate(e.target.value)}
                style={{
                  position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer",
                }}
              />
            </label>
          </div>
        </div>
      )}

      <p style={{ margin:"0 0 10px",fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em" }}>Choose subcategory</p>

      <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
        {subs.map(sub => {
          const eidBlocked = isEid && (!eidType || !eidDate);
          const bazaarBlocked = isBazaar && !bazaarDate;
          const blocked = eidBlocked || bazaarBlocked;
          return (
            <button
              key={sub}
              type="button"
              onClick={() => { if (!blocked) onSelect(sub); }}
              style={{
                display:"flex",alignItems:"center",justifyContent:"space-between",
                background: blocked ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                border:`1px solid ${T.border}`,
                borderRadius:12,padding:"14px 16px",color: blocked ? T.muted : T.white,fontSize:14,
                fontWeight:500,cursor: blocked ? "not-allowed" : "pointer",textAlign:"left",transition:"all 0.15s",
                opacity: blocked ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (!blocked) e.currentTarget.style.background="rgba(0,255,194,0.08)"; }}
              onMouseLeave={e => { if (!blocked) e.currentTarget.style.background="rgba(255,255,255,0.04)"; }}
            >
              <span>{sub}</span>
              <ChevronRight size={16} style={{ color:T.muted }}/>
            </button>
          );
        })}
        {isEid && (!eidType || !eidDate) && (
          <p style={{ margin:"4px 0 0",fontSize:11,color:"#fbbf24",textAlign:"center" }}>Please select which Eid and the date above first</p>
        )}
        {isBazaar && !bazaarDate && (
          <p style={{ margin:"4px 0 0",fontSize:11,color:"#fbbf24",textAlign:"center" }}>Please select the bazaar date above first</p>
        )}
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
  // Eid-specific state
  const [eidType, setEidType] = useState<string>("");
  const [eidDate, setEidDate] = useState<string>("");
  // Quilliam Bazaar date state
  const [bazaarDate, setBazaarDate] = useState<string>("");
  // Friday Collections upload state
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [evidenceUrl, setEvidenceUrl] = useState<string>("");
  const [evidencePreview, setEvidencePreview] = useState<string>("");
  // Friday Collections cash withheld reason
  const [cashWithheldReason, setCashWithheldReason] = useState<string>("");
  // Total banked date
  const [totalBankedDate, setTotalBankedDate] = useState<string>("");
  // Sign-off tick boxes with timestamps
  const [signFarid, setSignFarid] = useState<string>("");       // ISO timestamp when ticked
  const [signMumin, setSignMumin] = useState<string>("");       // ISO timestamp when ticked
  const [signAbdul, setSignAbdul] = useState<string>("");       // ISO timestamp when ticked
  const [signGhalib, setSignGhalib] = useState<string>("");     // ISO timestamp when ticked
  const [signOtherName, setSignOtherName] = useState<string>("");  // free-text trustee name
  const [signOther, setSignOther] = useState<string>("");       // ISO timestamp when ticked

  // Donation categories that collect donor info
  const DONOR_CATS = new Set(["£100 Rimmers Mussallah", "£1,000 Donors Wall", "Direct Donations", "Mussallah Sales £20"]);
  // Multi-donor entry state
  const [donors, setDonors] = useState<{ name:string; email:string; phone:string; amount:string }[]>([]);
  const [draftDonor, setDraftDonor] = useState({ name:"", email:"", phone:"", amount:"" });

  function addDonorEntry() {
    if (!draftDonor.name.trim()) { toast.error("Donor name is required"); return; }
    setDonors(prev => [...prev, { ...draftDonor }]);
    setDraftDonor({ name:"", email:"", phone:"", amount:"" });
  }
  function removeDonor(i: number) { setDonors(prev => prev.filter((_, idx) => idx !== i)); }

  const linkDonorsMutation = trpc.donors.linkToIncome.useMutation();

  function fmtStamp(iso: string) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { weekday:"short", day:"numeric", month:"short", year:"numeric" })
      + " " + d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
  }

  const { data, refetch } = trpc.income.list.useQuery({ month, year });
  const { data: cats } = trpc.income.categories?.useQuery?.() ?? { data: null };
  const createMutation = trpc.income.create.useMutation({
    onSuccess: async (result: any) => {
      // If there are donors to link, do so now
      if (donors.length > 0 && result?.id) {
        try {
          await linkDonorsMutation.mutateAsync({ incomeRecordId: result.id, donors });
        } catch { /* non-fatal */ }
      }
      toast.success("Income record added");
      setOpen(false);
      setSubPanel(null);
      setSelectedSub("");
      setEidType("");
      setEidDate("");
      setBazaarDate("");
      setEvidenceUrl("");
      setEvidencePreview("");
      setCashWithheldReason("");
      setTotalBankedDate("");
      setSignFarid(""); setSignMumin(""); setSignAbdul(""); setSignGhalib(""); setSignOther(""); setSignOtherName("");
      setDonors([]);
      setDraftDonor({ name:"", email:"", phone:"", amount:"" });
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
    if (subPanel === "Eid Income" && eidType) {
      setValue("subcategory", `${eidType} — ${sub}`);
      if (eidDate) setValue("incomeDate", eidDate);
    } else if (subPanel === "Quilliam Bazaar") {
      setValue("subcategory", sub);
      if (bazaarDate) setValue("incomeDate", bazaarDate);
    } else {
      setValue("subcategory", sub);
    }
    setSubPanel(null);
  }

  function handleDialogClose(v: boolean) {
    setOpen(v);
    if (!v) {
      setSubPanel(null);
      setSelectedSub("");
      setEidType("");
      setEidDate("");
      setBazaarDate("");
      setEvidenceUrl("");
      setEvidencePreview("");
      setCashWithheldReason("");
      setTotalBankedDate("");
      setSignFarid(""); setSignMumin(""); setSignAbdul(""); setSignGhalib(""); setSignOther(""); setSignOtherName("");
      setDonors([]);
      setDraftDonor({ name:"", email:"", phone:"", amount:"" });
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
                onBack={() => { setSubPanel(null); setValue("category",""); setEidType(""); setEidDate(""); setBazaarDate(""); }}
                eidType={eidType}
                setEidType={setEidType}
                eidDate={eidDate}
                setEidDate={setEidDate}
                bazaarDate={bazaarDate}
                setBazaarDate={setBazaarDate}
              />
            ) : (
              <form onSubmit={handleSubmit(d => {
                const payload: any = { ...d, month, year };
                if (watchCat === "Friday Collections") {
                  payload.receiptUrl = evidenceUrl || undefined;
                  payload.cashWithheldReason = cashWithheldReason || undefined;
                  payload.totalBankedDate = totalBankedDate || undefined;
                  // Build manager sign-off string from tick boxes
                  const mgrs = [
                    signFarid ? `Farid Ahmed (${fmtStamp(signFarid)})` : "",
                    signMumin ? `Mumin Khan (${fmtStamp(signMumin)})` : "",
                  ].filter(Boolean).join(", ");
                  payload.signedByManager = mgrs || undefined;
                  // Build trustee sign-off string from tick boxes
                  const trustees = [
                    signAbdul ? `Dr Abdul Hamid (${fmtStamp(signAbdul)})` : "",
                    signGhalib ? `Ghalib Khan (${fmtStamp(signGhalib)})` : "",
                    signOther && signOtherName ? `${signOtherName} (${fmtStamp(signOther)})` : "",
                  ].filter(Boolean).join(", ");
                  payload.signedByTrustee = trustees || undefined;
                  delete payload.signedByTrusteeOther;
                }
                createMutation.mutate(payload);
              })} style={{ display:"flex",flexDirection:"column",gap:14,marginTop:8 }}>
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
                    <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>{watchCat==="Friday Collections" ? "Total Collected (£)" : "Amount (£)"}</Label>
                    <Input {...register("amount",{required:true})} type="number" step="0.01" placeholder="0.00"
                      style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                  </div>
                  <div>
                    {FRIDAY_INCOME_CATS.has(watchCat) ? (
                      <>
                        <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Date</Label>
                        <label style={{ position:"relative",display:"block",cursor:"pointer",marginTop:6 }}>
                          {/* Styled display */}
                          <div style={{
                            width:"100%",background:"rgba(255,255,255,0.06)",
                            border:`1px solid ${watch("incomeDate") ? T.mint : T.border}`,
                            borderRadius:10,color: watch("incomeDate") ? T.white : T.muted,
                            height:44,padding:"0 10px",fontSize:12,
                            display:"flex",alignItems:"center",gap:6,pointerEvents:"none",
                          }}>
                            <Calendar size={13} style={{ color: watch("incomeDate") ? T.mint : T.muted, flexShrink:0 }}/>
                            <span style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                              {watch("incomeDate")
                                ? new Date(watch("incomeDate") + "T12:00:00").toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
                                : "Select date…"
                              }
                            </span>
                          </div>
                          {/* Invisible native date input */}
                          <input
                            type="date"
                            {...register("incomeDate")}
                            style={{ position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer" }}
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Period</Label>
                        <select {...register("period")}
                          style={{ marginTop:6,width:"100%",background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44,padding:"0 12px",fontSize:14 }}>
                          {PERIODS.map(p=><option key={p} value={p}>{p}</option>)}
                        </select>
                      </>
                    )}
                  </div>
                </div>
                {/* Friday Collections specific fields */}
                {watchCat === "Friday Collections" ? (
                  <>
                    {/* Breakdown amounts */}
                    <div style={{ background:"rgba(0,255,194,0.04)",border:`1px solid rgba(0,255,194,0.12)`,borderRadius:12,padding:"14px 16px",display:"flex",flexDirection:"column",gap:12 }}>
                      <p style={{ margin:"0 0 4px",fontSize:11,color:T.mint,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em" }}>Collection Breakdown</p>
                      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                        <div>
                          <Label style={{ fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Bucket Collection (£)</Label>
                          <Input {...register("bucketCollection")} type="number" step="0.01" placeholder="0.00"
                            style={{ marginTop:4,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:8,color:T.white,height:40,fontSize:13 }}/>
                        </div>
                        <div>
                          <Label style={{ fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Card Payment (£)</Label>
                          <Input {...register("cardPayment")} type="number" step="0.01" placeholder="0.00"
                            style={{ marginTop:4,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:8,color:T.white,height:40,fontSize:13 }}/>
                        </div>
                      </div>
                      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                        <div>
                          <Label style={{ fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Cash Withheld (£)</Label>
                          <Input {...register("cashWithheld")} type="number" step="0.01" placeholder="0.00"
                            style={{ marginTop:4,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:8,color:T.white,height:40,fontSize:13 }}/>
                        </div>
                        <div>
                          <Label style={{ fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Reason Withheld</Label>
                          <select
                            value={cashWithheldReason}
                            onChange={e => setCashWithheldReason(e.target.value)}
                            style={{ marginTop:4,width:"100%",background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:8,color: cashWithheldReason ? T.white : T.muted,height:40,padding:"0 10px",fontSize:12 }}
                          >
                            <option value="" disabled>Select reason…</option>
                            <option value="Change needed">Change needed</option>
                            <option value="Petty cash float">Petty cash float</option>
                            <option value="Awaiting banking">Awaiting banking</option>
                            <option value="Disputed amount">Disputed amount</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                        <div>
                          <Label style={{ fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Total Banked (£)</Label>
                          <Input {...register("totalBanked")} type="number" step="0.01" placeholder="0.00"
                            style={{ marginTop:4,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:8,color:T.white,height:40,fontSize:13 }}/>
                        </div>
                        <div>
                          <Label style={{ fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Date Banked</Label>
                          <label style={{ position:"relative",display:"block",cursor:"pointer",marginTop:4 }}>
                            <div style={{ width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${totalBankedDate ? T.mint : T.border}`,borderRadius:8,color: totalBankedDate ? T.white : T.muted,height:40,padding:"0 8px",fontSize:11,display:"flex",alignItems:"center",gap:5,pointerEvents:"none" }}>
                              <Calendar size={11} style={{ color: totalBankedDate ? T.mint : T.muted, flexShrink:0 }}/>
                              <span style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                                {totalBankedDate
                                  ? new Date(totalBankedDate + "T12:00:00").toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
                                  : "Select date…"}
                              </span>
                            </div>
                            <input type="date" value={totalBankedDate} onChange={e => setTotalBankedDate(e.target.value)}
                              style={{ position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer" }}/>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Evidence upload */}
                    <div>
                      <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Attach Record (Photo / Scan)</Label>
                      {evidencePreview ? (
                        <div style={{ marginTop:6,position:"relative",borderRadius:10,overflow:"hidden",border:`1px solid ${T.mint}` }}>
                          <img src={evidencePreview} alt="Evidence" style={{ width:"100%",maxHeight:140,objectFit:"cover",display:"block" }}/>
                          <button type="button" onClick={() => { setEvidenceUrl(""); setEvidencePreview(""); }}
                            style={{ position:"absolute",top:6,right:6,background:"rgba(0,0,0,0.7)",border:"none",borderRadius:999,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
                            <X size={12} style={{ color:T.white }}/>
                          </button>
                        </div>
                      ) : (
                        <label style={{ marginTop:6,display:"flex",alignItems:"center",justifyContent:"center",gap:8,height:60,border:`1.5px dashed ${uploadingEvidence ? T.mint : T.border}`,borderRadius:10,cursor:"pointer",background:"rgba(255,255,255,0.03)",transition:"all 0.2s" }}>
                          {uploadingEvidence ? (
                            <span style={{ fontSize:12,color:T.mint }}>Uploading…</span>
                          ) : (
                            <>
                              <Camera size={16} style={{ color:T.muted }}/>
                              <span style={{ fontSize:12,color:T.muted }}>Tap to upload photo or scan</span>
                              <Upload size={14} style={{ color:T.muted }}/>
                            </>
                          )}
                          <input type="file" accept="image/*,application/pdf" capture="environment"
                            style={{ position:"absolute",opacity:0,width:0,height:0 }}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setUploadingEvidence(true);
                              try {
                                const reader = new FileReader();
                                reader.onload = ev => setEvidencePreview(ev.target?.result as string);
                                reader.readAsDataURL(file);
                                const fd = new FormData();
                                fd.append("file", file);
                                const res = await fetch("/api/upload", { method:"POST", body:fd, credentials:"include" });
                                const json = await res.json();
                                if (json.url) setEvidenceUrl(json.url);
                                else toast.error("Upload failed");
                              } catch { toast.error("Upload failed"); }
                              finally { setUploadingEvidence(false); }
                            }}
                          />
                        </label>
                      )}
                    </div>

                    {/* Sign-off section */}
                    <div style={{ background:"rgba(99,91,255,0.06)",border:`1px solid rgba(99,91,255,0.2)`,borderRadius:12,padding:"14px 16px",display:"flex",flexDirection:"column",gap:14 }}>
                      <p style={{ margin:"0 0 2px",fontSize:11,color:"#a5b4fc",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em" }}>Signed By</p>

                      {/* Manager tick boxes */}
                      <div>
                        <Label style={{ fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:8 }}>Manager</Label>
                        {([
                          { label:"Farid Ahmed", state:signFarid, setter:setSignFarid },
                          { label:"Mumin Khan",  state:signMumin, setter:setSignMumin },
                        ] as { label:string; state:string; setter:(v:string)=>void }[]).map(({ label, state, setter }) => (
                          <div key={label} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,background: state ? "rgba(0,255,194,0.07)" : "rgba(255,255,255,0.03)",border:`1px solid ${state ? "rgba(0,255,194,0.3)" : T.border}`,marginBottom:6,cursor:"pointer" }}
                            onClick={() => setter(state ? "" : new Date().toISOString())}>
                            {/* Custom checkbox */}
                            <div style={{ width:20,height:20,borderRadius:5,border:`2px solid ${state ? T.mint : "rgba(255,255,255,0.25)"}`,background: state ? T.mint : "transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.15s" }}>
                              {state && <svg width="11" height="8" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="#081526" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </div>
                            <div style={{ flex:1 }}>
                              <span style={{ fontSize:13,color: state ? T.white : T.muted,fontWeight: state ? 600 : 400 }}>{label}</span>
                              {state && <span style={{ display:"block",fontSize:10,color:T.mint,marginTop:1 }}>{fmtStamp(state)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Trustee tick boxes */}
                      <div>
                        <Label style={{ fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:8 }}>Trustee</Label>
                        {([
                          { label:"Dr Abdul Hamid", state:signAbdul, setter:setSignAbdul },
                          { label:"Ghalib Khan",    state:signGhalib, setter:setSignGhalib },
                        ] as { label:string; state:string; setter:(v:string)=>void }[]).map(({ label, state, setter }) => (
                          <div key={label} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,background: state ? "rgba(99,91,255,0.1)" : "rgba(255,255,255,0.03)",border:`1px solid ${state ? "rgba(99,91,255,0.4)" : T.border}`,marginBottom:6,cursor:"pointer" }}
                            onClick={() => setter(state ? "" : new Date().toISOString())}>
                            <div style={{ width:20,height:20,borderRadius:5,border:`2px solid ${state ? "#a5b4fc" : "rgba(255,255,255,0.25)"}`,background: state ? "#635BFF" : "transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.15s" }}>
                              {state && <svg width="11" height="8" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </div>
                            <div style={{ flex:1 }}>
                              <span style={{ fontSize:13,color: state ? T.white : T.muted,fontWeight: state ? 600 : 400 }}>{label}</span>
                              {state && <span style={{ display:"block",fontSize:10,color:"#a5b4fc",marginTop:1 }}>{fmtStamp(state)}</span>}
                            </div>
                          </div>
                        ))}
                        {/* Other trustee (free text) */}
                        <div style={{ display:"flex",alignItems:"flex-start",gap:10,padding:"8px 10px",borderRadius:8,background: signOther ? "rgba(99,91,255,0.1)" : "rgba(255,255,255,0.03)",border:`1px solid ${signOther ? "rgba(99,91,255,0.4)" : T.border}`,cursor:"pointer" }}
                          onClick={() => { if (!signOther) setSignOther(new Date().toISOString()); else { setSignOther(""); setSignOtherName(""); } }}>
                          <div style={{ width:20,height:20,borderRadius:5,border:`2px solid ${signOther ? "#a5b4fc" : "rgba(255,255,255,0.25)"}`,background: signOther ? "#635BFF" : "transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2,transition:"all 0.15s" }}>
                            {signOther && <svg width="11" height="8" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                          <div style={{ flex:1 }} onClick={e => e.stopPropagation()}>
                            <input
                              placeholder="Other trustee name…"
                              value={signOtherName}
                              onChange={e => { setSignOtherName(e.target.value); if (!signOther) setSignOther(new Date().toISOString()); }}
                              style={{ background:"transparent",border:"none",outline:"none",color: signOther ? T.white : T.muted,fontSize:13,width:"100%",fontWeight: signOther ? 600 : 400 }}
                            />
                            {signOther && <span style={{ display:"block",fontSize:10,color:"#a5b4fc",marginTop:1 }}>{fmtStamp(signOther)}</span>}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Notes</Label>
                      <Input {...register("notes")} placeholder="Optional notes"
                        style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                    </div>
                  </>
                ) : DONOR_CATS.has(watchCat) ? (
                  /* Donation categories — multi-donor entry */
                  <>
                    <div style={{ background:"rgba(0,255,194,0.05)",border:`1px solid rgba(0,255,194,0.15)`,borderRadius:12,padding:"14px 16px",display:"flex",flexDirection:"column",gap:10 }}>
                      <p style={{ margin:"0 0 4px",fontSize:11,color:T.mint,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em" }}>Donor Details</p>

                      {/* Existing donors list */}
                      {donors.map((d, i) => (
                        <div key={i} style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:"rgba(0,255,194,0.07)",border:`1px solid rgba(0,255,194,0.2)` }}>
                          <div style={{ flex:1 }}>
                            <span style={{ fontSize:13,color:T.white,fontWeight:600 }}>{d.name}</span>
                            {d.amount && <span style={{ fontSize:11,color:T.mint,marginLeft:8 }}>£{d.amount}</span>}
                            {(d.email || d.phone) && <span style={{ display:"block",fontSize:11,color:T.muted,marginTop:1 }}>{[d.email,d.phone].filter(Boolean).join(" · ")}</span>}
                          </div>
                          <button type="button" onClick={() => removeDonor(i)} style={{ background:"none",border:"none",color:"rgba(255,100,100,0.7)",cursor:"pointer",fontSize:16,lineHeight:1,padding:2 }}>×</button>
                        </div>
                      ))}

                      {/* Draft donor form */}
                      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                        <input value={draftDonor.name} onChange={e => setDraftDonor(p => ({...p,name:e.target.value}))} placeholder="Full name *"
                          style={{ gridColumn:"1/-1",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:8,color:T.white,height:38,padding:"0 10px",fontSize:13,outline:"none" }}/>
                        <input value={draftDonor.email} onChange={e => setDraftDonor(p => ({...p,email:e.target.value}))} placeholder="Email (optional)"
                          type="email"
                          style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:8,color:T.white,height:38,padding:"0 10px",fontSize:13,outline:"none" }}/>
                        <input value={draftDonor.phone} onChange={e => setDraftDonor(p => ({...p,phone:e.target.value}))} placeholder="Phone (optional)"
                          type="tel"
                          style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:8,color:T.white,height:38,padding:"0 10px",fontSize:13,outline:"none" }}/>
                        <input value={draftDonor.amount} onChange={e => setDraftDonor(p => ({...p,amount:e.target.value}))} placeholder="Amount (£) optional"
                          type="number" step="0.01"
                          style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:8,color:T.white,height:38,padding:"0 10px",fontSize:13,outline:"none" }}/>
                      </div>
                      <button type="button" onClick={addDonorEntry}
                        style={{ alignSelf:"flex-start",background:`rgba(0,255,194,0.12)`,border:`1px solid rgba(0,255,194,0.3)`,borderRadius:8,color:T.mint,fontWeight:600,fontSize:12,padding:"6px 14px",cursor:"pointer" }}>
                        + Add Donor
                      </button>
                      {donors.length === 0 && <p style={{ margin:0,fontSize:10,color:T.muted,fontStyle:"italic" }}>Add at least one donor, or leave empty to record without donor details.</p>}
                    </div>
                    <div>
                      <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Notes</Label>
                      <Input {...register("notes")} placeholder="Optional notes"
                        style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                    </div>
                  </>
                ) : (
                  /* Other non-Friday-Collections categories */
                  <>
                    <div>
                      <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>
                        {FRIDAY_INCOME_CATS.has(watchCat) ? "Type / Reference" : "Payer / Tenant Name"}
                      </Label>
                      <Input {...register("tenantName")} placeholder={FRIDAY_INCOME_CATS.has(watchCat) ? "Type or reference…" : "Name or reference"}
                        style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                    </div>
                    <div>
                      <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Notes</Label>
                      <Input {...register("notes")} placeholder="Optional notes"
                        style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                    </div>
                  </>
                )}
                <Button type="submit" disabled={createMutation.isPending || uploadingEvidence}
                  style={{ background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",fontWeight:700,height:48,borderRadius:12,border:"none",fontSize:15 }}>
                  {createMutation.isPending?"Saving…":uploadingEvidence?"Uploading…":"Add Record"}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
