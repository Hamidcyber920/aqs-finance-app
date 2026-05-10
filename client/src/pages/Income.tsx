import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { Plus, TrendingUp, DollarSign, Calendar, ChevronRight, ArrowLeft, Upload, X, Camera, Search, Download, ChevronDown } from "lucide-react";
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

const RENTAL_INCOME_CATS = new Set([
  "Student Accommodation","Dar Al Zahra","Office Rental",
  "Hall Hire","Weddings","Community Hire","Accountants Office Hire",
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
  const { canDelete: canDeleteIncome } = usePermissions();
  const [open, setOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0); // increment to force dialog remount with fresh state
  const [dialogInitialCat, setDialogInitialCat] = useState<string>(""); // category to pre-select when dialog opens
  const [catFilter, setCatFilter] = useState("All");
  const [period, setPeriod] = useState("Monthly");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);

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
  // Donor sign-off state
  const [donorSignManager, setDonorSignManager] = useState<string>(""); // "Farid Ahmed" | "Mumin Khan"
  const [donorSignManagerTs, setDonorSignManagerTs] = useState<string>("");
  const [donorSignTrustee, setDonorSignTrustee] = useState<string>(""); // trustee name
  const [donorSignTrusteeTs, setDonorSignTrusteeTs] = useState<string>("");
  const [donorSignTrusteeOther, setDonorSignTrusteeOther] = useState<string>("");
  const [sendingReceipt, setSendingReceipt] = useState<number | null>(null); // index of donor being emailed

  function addDonorEntry() {
    if (!draftDonor.name.trim()) { toast.error("Donor name is required"); return; }
    if (!draftDonor.email.trim()) { toast.error("Donor email is required"); return; }
    if (!draftDonor.phone.trim()) { toast.error("Donor phone is required"); return; }
    setDonors(prev => [...prev, { ...draftDonor }]);
    setDraftDonor({ name:"", email:"", phone:"", amount:"" });
  }
  function removeDonor(i: number) { setDonors(prev => prev.filter((_, idx) => idx !== i)); }

  const linkDonorsMutation = trpc.donors.linkToIncome.useMutation();
  const sendReceiptMutation = trpc.donors.sendReceipt.useMutation();
  const deleteMutation = trpc.income.delete.useMutation({
    onSuccess: () => { toast.success("Record deleted"); refetch(); setExpandedRow(null); },
    onError: (e) => toast.error(e.message),
  });
  const checkFaridMutation = trpc.income.checkFarid.useMutation({ onSuccess: () => refetch(), onError: (e) => toast.error(e.message) });
  const checkMuminMutation = trpc.income.checkMumin.useMutation({ onSuccess: () => refetch(), onError: (e) => toast.error(e.message) });
  const trusteeVerifyMutation = trpc.income.trusteeVerify.useMutation({ onSuccess: () => refetch(), onError: (e) => toast.error(e.message) });
  const updateRentalDetailsMutation = trpc.income.updateRentalDetails.useMutation({ onSuccess: () => { toast.success("Rental details updated"); refetch(); }, onError: (e) => toast.error(e.message) });
  const [editingRentalId, setEditingRentalId] = useState<number | null>(null);
  const [rentalEditFrom, setRentalEditFrom] = useState<string>("");
  const [rentalEditTo, setRentalEditTo] = useState<string>("");
  const [uploadingEvidence2, setUploadingEvidence2] = useState<number | null>(null);

  function fmtStamp(iso: string) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { weekday:"short", day:"numeric", month:"short", year:"numeric" })
      + " " + d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
  }

  const { data, refetch } = trpc.income.list.useQuery(showAll ? {} : { month, year });
  const { data: cats } = trpc.income.categories?.useQuery?.() ?? { data: null };
  const createMutation = trpc.income.create.useMutation({
    onSuccess: async (result: any) => {
      // If there are donors to link, do so now
      if (donors.length > 0 && result?.id) {
        try {
          await linkDonorsMutation.mutateAsync({ incomeRecordId: result.id, donors });
        } catch { /* non-fatal */ }
      }
      toast.success(`Income record added — £${Number(result?.amount ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`);
      setOpen(false);
      setSubPanel(null);
      setSelectedSub("");
      setSelectedCat("");
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
      setDonorSignManager(""); setDonorSignManagerTs(""); setDonorSignTrustee(""); setDonorSignTrusteeTs(""); setDonorSignTrusteeOther("");
      refetch();
      reset();
    },
    onError: (e) => toast.error(e.message),
  });

  const { register, handleSubmit, reset, watch, setValue } = useForm<any>({
    defaultValues: { category: dialogInitialCat }
  });
  const [selectedCat, setSelectedCat] = useState<string>(dialogInitialCat);
  const watchCat = selectedCat; // driven by state, not watch(), to ensure reliable re-renders

  // Sync subPanel with the initial category on mount
  useEffect(() => {
    if (dialogInitialCat) {
      if (SUBCATEGORY_MAP[dialogInitialCat]) {
        setSubPanel(dialogInitialCat);
      } else {
        setSubPanel(null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open the dialog with a pre-selected category so the correct fields show on the very first render.
  // We increment dialogKey to force a full remount of the dialog with fresh state.
  function openDialog(preselect?: string) {
    const cat = preselect ?? (catFilter !== "All" ? catFilter : "");
    setDialogInitialCat(cat);
    setDialogKey(k => k + 1);
    setOpen(true);
  }

  const records: any[] = (data as any[]) ?? [];
  const totalIncome = records.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const paidCount = records.filter((r: any) => r.paymentStatus === "paid").length;

  const filtered = records.filter((r: any) => {
    const matchCat = catFilter === "All" || r.category === catFilter || r.categoryName === catFilter;
    if (!searchQuery.trim()) return matchCat;
    const q = searchQuery.toLowerCase();
    return matchCat && (
      (r.categoryName ?? r.category ?? "").toLowerCase().includes(q) ||
      (r.subcategory ?? "").toLowerCase().includes(q) ||
      (r.tenantName ?? r.reference ?? "").toLowerCase().includes(q) ||
      String(r.amount ?? "").includes(q)
    );
  });

  function exportCSV() {
    const headers = ["Category","Subcategory","Payer/Ref","Period","Amount","Status","Date","Notes","Signed By Manager","Signed By Trustee"];
    const rows = filtered.map((r: any) => [
      r.categoryName ?? r.category ?? "",
      r.subcategory ?? "",
      r.tenantName ?? r.reference ?? "",
      r.period ?? "",
      Number(r.amount ?? 0).toFixed(2),
      r.paymentStatus ?? "",
      r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-GB") : "",
      (r.notes ?? "").replace(/,/g,";"),
      (r.signedByManager ?? "").replace(/,/g,";"),
      (r.signedByTrustee ?? "").replace(/,/g,";")
    ]);
    const csv = [headers, ...rows].map(row => row.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `income-records-${showAll ? "all" : `${year}-${String(month).padStart(2,"0")}`}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const allCats = ["All", ...INCOME_CATEGORIES];

  function handleCategoryChange(cat: string) {
    setValue("category", cat);
    setSelectedCat(cat);
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
    if (!v) {
      setOpen(false); // must explicitly close since open is controlled
      setConfirmed(false);
      setSubPanel(null);
      setSelectedSub("");
      setSelectedCat("");
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
      setDonorSignManager(""); setDonorSignManagerTs(""); setDonorSignTrustee(""); setDonorSignTrusteeTs(""); setDonorSignTrusteeOther("");
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
            <button onClick={()=>setShowAll(v=>!v)}
              style={{ padding:"8px 14px",borderRadius:12,fontSize:12,fontWeight:600,border:`1px solid ${showAll ? T.mint : T.border}`,background:showAll ? `rgba(52,211,153,0.15)` : `rgba(255,255,255,0.06)`,color:showAll ? T.mint : T.muted,cursor:"pointer",transition:"all 0.2s" }}>
              {showAll ? "Showing All" : "Show All"}
            </button>
            <Button onClick={()=>{ openDialog(); }}
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

        {/* Search bar + Export */}
        <div style={{ display:"flex",gap:10,alignItems:"center",marginBottom:16,flexWrap:"wrap" }}>
          <div style={{ flex:1,minWidth:200,display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:12,padding:"8px 14px" }}>
            <Search size={14} style={{color:T.muted,flexShrink:0}}/>
            <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search by category, reference, amount…"
              style={{ flex:1,background:"transparent",border:"none",color:T.white,fontSize:13,outline:"none" }}/>
            {searchQuery && <button onClick={()=>setSearchQuery("")} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",padding:0}}><X size={12}/></button>}
          </div>
          <button onClick={exportCSV}
            style={{ display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:12,fontSize:12,fontWeight:600,border:`1px solid ${T.border}`,background:`rgba(255,255,255,0.06)`,color:T.muted,cursor:"pointer",transition:"all 0.2s" }}>
            <Download size={13}/> Export CSV
          </button>
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
                  {["Category","Payer / Ref","Period","Amount","Status","Date",""].map(h=>(
                    <th key={h} style={{ textAlign:"left",fontSize:10,fontWeight:600,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",padding:"0 12px 12px 0",borderBottom:`1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length===0 ? (
                  <tr><td colSpan={7} style={{ textAlign:"center",padding:40,color:T.muted,fontSize:14 }}>No income records for this period</td></tr>
                ) : filtered.map((r:any,i:number)=>{
                  const isExpanded = expandedRow === (r.id ?? i);
                  const fmtDate = (d:string|Date|null|undefined) => { if (!d) return "—"; if (d instanceof Date) return d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"}); const s = String(d); return new Date(s+(s.includes("T")?"":"T12:00:00")).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"}); };
                  return (
                  <>
                    <tr key={r.id??i} onClick={()=>setExpandedRow(isExpanded ? null : (r.id??i))} style={{ cursor:"pointer",transition:"background 0.15s" }}
                      onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.03)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                      <td style={{ padding:"12px 12px 12px 0",borderBottom:isExpanded?"none":`1px solid ${T.border}` }}>
                        <span style={{ fontSize:13,fontWeight:600,color:T.white }}>{r.categoryName??r.category??"—"}</span>
                        {r.subcategory && <span style={{ display:"block",fontSize:11,color:T.muted,marginTop:2 }}>{r.subcategory}</span>}
                      </td>
                      <td style={{ padding:"12px 12px 12px 0",fontSize:13,color:T.muted,borderBottom:isExpanded?"none":`1px solid ${T.border}` }}>{r.tenantName??r.reference??"—"}</td>
                      <td style={{ padding:"12px 12px 12px 0",fontSize:12,color:T.muted,borderBottom:isExpanded?"none":`1px solid ${T.border}` }}>{r.period??"—"}</td>
                      <td style={{ padding:"12px 12px 12px 0",fontSize:14,fontWeight:700,color:T.mint,borderBottom:isExpanded?"none":`1px solid ${T.border}` }}>£{Number(r.amount??0).toLocaleString("en-GB",{minimumFractionDigits:2})}</td>
                      <td style={{ padding:"12px 12px 12px 0",borderBottom:isExpanded?"none":`1px solid ${T.border}` }}><Badge status={r.paymentStatus??"paid"}/></td>
                      <td style={{ padding:"12px 8px 12px 0",fontSize:12,color:T.muted,borderBottom:isExpanded?"none":`1px solid ${T.border}` }}>{fmtDate(r.incomeDate ?? r.createdAt)}</td>
                      <td style={{ padding:"12px 0",borderBottom:isExpanded?"none":`1px solid ${T.border}`,textAlign:"right" }}>
                        <ChevronDown size={14} style={{color:T.muted,transition:"transform 0.2s",transform:isExpanded?"rotate(180deg)":"rotate(0deg)"}}/>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${r.id??i}-detail`}>
                        <td colSpan={7} style={{ padding:"0 0 16px 0",borderBottom:`1px solid ${T.border}` }}>
                          <div style={{ background:"rgba(255,255,255,0.03)",borderRadius:12,padding:"14px 16px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:"10px 20px",fontSize:12 }}>
                            {r.notes && <div><span style={{color:T.muted,display:"block",marginBottom:2}}>NOTES</span><span style={{color:T.white}}>{r.notes}</span></div>}
                            {r.bucketCollection != null && <div><span style={{color:T.muted,display:"block",marginBottom:2}}>BUCKET COLLECTION</span><span style={{color:T.white}}>£{Number(r.bucketCollection).toLocaleString("en-GB",{minimumFractionDigits:2})}</span></div>}
                            {r.cardPayment != null && <div><span style={{color:T.muted,display:"block",marginBottom:2}}>CARD PAYMENT</span><span style={{color:T.white}}>£{Number(r.cardPayment).toLocaleString("en-GB",{minimumFractionDigits:2})}</span></div>}
                            {r.cashWithheld != null && <div><span style={{color:T.muted,display:"block",marginBottom:2}}>CASH WITHHELD</span><span style={{color:T.white}}>£{Number(r.cashWithheld).toLocaleString("en-GB",{minimumFractionDigits:2})}{r.cashWithheldReason ? ` — ${r.cashWithheldReason}` : ""}</span></div>}
                            {r.totalBanked != null && <div><span style={{color:T.muted,display:"block",marginBottom:2}}>TOTAL BANKED</span><span style={{color:T.white}}>£{Number(r.totalBanked).toLocaleString("en-GB",{minimumFractionDigits:2})}{r.totalBankedDate ? ` on ${fmtDate(r.totalBankedDate)}` : ""}</span></div>}
                            {r.signedByManager && <div><span style={{color:T.muted,display:"block",marginBottom:2}}>SIGNED BY MANAGER</span><span style={{color:T.white}}>{r.signedByManager}</span></div>}
                            {r.signedByTrustee && <div><span style={{color:T.muted,display:"block",marginBottom:2}}>SIGNED BY TRUSTEE</span><span style={{color:T.white}}>{r.signedByTrustee}</span></div>}
                            {r.receiptUrl && <div style={{gridColumn:"1/-1"}}><span style={{color:T.muted,display:"block",marginBottom:4}}>EVIDENCE 1</span><a href={r.receiptUrl} target="_blank" rel="noreferrer" style={{color:T.mint,textDecoration:"underline"}}>View attached document</a></div>}
                            {(r as any).evidenceUrl2 && <div style={{gridColumn:"1/-1"}}><span style={{color:T.muted,display:"block",marginBottom:4}}>EVIDENCE 2</span><a href={(r as any).evidenceUrl2} target="_blank" rel="noreferrer" style={{color:T.mint,textDecoration:"underline"}}>View second document</a></div>}
                            {/* Rental date range + evidence upload for rental income categories */}
                            {RENTAL_INCOME_CATS.has((r as any).categoryName ?? "") && (
                              <div style={{gridColumn:"1/-1",background:"rgba(165,180,252,0.06)",border:"1px solid rgba(165,180,252,0.2)",borderRadius:10,padding:"12px 14px",marginTop:4}}>
                                <span style={{color:"#a5b4fc",display:"block",marginBottom:8,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>Rental Period</span>
                                {editingRentalId === r.id ? (
                                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                                      <div><label style={{fontSize:10,color:T.muted,display:"block",marginBottom:2}}>From</label><input type="date" value={rentalEditFrom} onChange={e=>setRentalEditFrom(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(165,180,252,0.3)",borderRadius:6,color:T.white,padding:"6px 8px",fontSize:12}}/></div>
                                      <div><label style={{fontSize:10,color:T.muted,display:"block",marginBottom:2}}>To</label><input type="date" value={rentalEditTo} onChange={e=>setRentalEditTo(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(165,180,252,0.3)",borderRadius:6,color:T.white,padding:"6px 8px",fontSize:12}}/></div>
                                    </div>
                                    <div style={{display:"flex",gap:6}}>
                                      <button onClick={()=>{ updateRentalDetailsMutation.mutate({id:r.id,rentalDateFrom:rentalEditFrom||null,rentalDateTo:rentalEditTo||null}); setEditingRentalId(null); }} style={{padding:"5px 12px",borderRadius:6,fontSize:11,fontWeight:600,background:"rgba(165,180,252,0.2)",border:"1px solid rgba(165,180,252,0.4)",color:"#a5b4fc",cursor:"pointer"}}>Save</button>
                                      <button onClick={()=>setEditingRentalId(null)} style={{padding:"5px 12px",borderRadius:6,fontSize:11,fontWeight:600,background:"transparent",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer"}}>Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                                    <span style={{color:T.white,fontSize:12}}>
                                      {(r as any).rentalDateFrom ? fmtDate((r as any).rentalDateFrom) : "Not set"}
                                      {" → "}
                                      {(r as any).rentalDateTo ? fmtDate((r as any).rentalDateTo) : "Not set"}
                                    </span>
                                    <button onClick={()=>{ setEditingRentalId(r.id); setRentalEditFrom((r as any).rentalDateFrom?.slice(0,10)??"" ); setRentalEditTo((r as any).rentalDateTo?.slice(0,10)??"" ); }} style={{padding:"3px 8px",borderRadius:5,fontSize:10,fontWeight:600,background:"rgba(165,180,252,0.1)",border:"1px solid rgba(165,180,252,0.3)",color:"#a5b4fc",cursor:"pointer"}}>Edit Dates</button>
                                  </div>
                                )}
                                {/* Evidence upload for rental records */}
                                <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                                  <span style={{fontSize:10,color:T.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em"}}>Upload Evidence:</span>
                                  <label style={{cursor:"pointer",display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:6,background:"rgba(0,255,194,0.08)",border:"1px solid rgba(0,255,194,0.25)",fontSize:11,color:T.mint,fontWeight:600}}>
                                    <Upload size={11}/> {uploadingEvidence2===r.id ? "Uploading…" : "Add Evidence"}
                                    <input type="file" accept="image/*,application/pdf" style={{position:"absolute",opacity:0,width:0,height:0}} onChange={async(e)=>{
                                      const file=e.target.files?.[0]; if(!file) return;
                                      setUploadingEvidence2(r.id);
                                      try {
                                        const fd=new FormData(); fd.append("file",file);
                                        const res=await fetch("/api/upload",{method:"POST",body:fd,credentials:"include"});
                                        const json=await res.json();
                                        if(json.url) { updateRentalDetailsMutation.mutate({id:r.id,evidenceUrl2:json.url}); }
                                        else toast.error("Upload failed");
                                      } catch { toast.error("Upload failed"); } finally { setUploadingEvidence2(null); }
                                    }}/>
                                  </label>
                                </div>
                              </div>
                            )}
                            {/* Authorisation tick boxes — Farid Ahmed, Mumin Khan, Trustee */}
                            <div style={{gridColumn:"1/-1",background:"rgba(99,91,255,0.06)",border:"1px solid rgba(99,91,255,0.2)",borderRadius:10,padding:"12px 14px",marginTop:4}}>
                              <span style={{color:"#a5b4fc",display:"block",marginBottom:8,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>Authorisation</span>
                              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8}}>
                                {/* Farid Ahmed */}
                                <div onClick={()=>checkFaridMutation.mutate({id:r.id,undo:!!(r as any).checkedByFaridAt})} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:(r as any).checkedByFaridAt?"rgba(0,255,194,0.08)":"rgba(255,255,255,0.03)",border:`1px solid ${(r as any).checkedByFaridAt?"rgba(0,255,194,0.4)":T.border}`,cursor:"pointer"}}>
                                  <div style={{width:20,height:20,borderRadius:5,border:`2px solid ${(r as any).checkedByFaridAt?T.mint:"rgba(255,255,255,0.25)"}`,background:(r as any).checkedByFaridAt?T.mint:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                                    {(r as any).checkedByFaridAt && <svg width="11" height="8" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="#081526" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                  </div>
                                  <div style={{flex:1}}>
                                    <span style={{fontSize:12,color:(r as any).checkedByFaridAt?T.white:T.muted,fontWeight:(r as any).checkedByFaridAt?600:400}}>Farid Ahmed</span>
                                    {(r as any).checkedByFaridAt && <span style={{display:"block",fontSize:10,color:T.mint,marginTop:1}}>{new Date((r as any).checkedByFaridAt).toLocaleString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span>}
                                  </div>
                                </div>
                                {/* Mumin Khan */}
                                <div onClick={()=>checkMuminMutation.mutate({id:r.id,undo:!!(r as any).checkedByMuminAt})} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:(r as any).checkedByMuminAt?"rgba(0,255,194,0.08)":"rgba(255,255,255,0.03)",border:`1px solid ${(r as any).checkedByMuminAt?"rgba(0,255,194,0.4)":T.border}`,cursor:"pointer"}}>
                                  <div style={{width:20,height:20,borderRadius:5,border:`2px solid ${(r as any).checkedByMuminAt?T.mint:"rgba(255,255,255,0.25)"}`,background:(r as any).checkedByMuminAt?T.mint:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                                    {(r as any).checkedByMuminAt && <svg width="11" height="8" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="#081526" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                  </div>
                                  <div style={{flex:1}}>
                                    <span style={{fontSize:12,color:(r as any).checkedByMuminAt?T.white:T.muted,fontWeight:(r as any).checkedByMuminAt?600:400}}>Mumin Khan</span>
                                    {(r as any).checkedByMuminAt && <span style={{display:"block",fontSize:10,color:T.mint,marginTop:1}}>{new Date((r as any).checkedByMuminAt).toLocaleString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span>}
                                  </div>
                                </div>
                                {/* Trustee toggle: Dr Abdul Hamid / Galib Khan */}
                                <div style={{gridColumn:"1/-1"}}>
                                  <span style={{fontSize:10,color:T.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:6}}>Trustee Verification</span>
                                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                    {(["Dr Abdul Hamid","Galib Khan"] as const).map(name=>(
                                      <div key={name} onClick={()=>trusteeVerifyMutation.mutate({id:r.id,trusteeName:(r as any).trusteeVerifiedBy===name?null:name})} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:8,background:(r as any).trusteeVerifiedBy===name?"rgba(99,91,255,0.12)":"rgba(255,255,255,0.03)",border:`1px solid ${(r as any).trusteeVerifiedBy===name?"rgba(99,91,255,0.5)":T.border}`,cursor:"pointer"}}>
                                        <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${(r as any).trusteeVerifiedBy===name?"#a5b4fc":"rgba(255,255,255,0.25)"}`,background:(r as any).trusteeVerifiedBy===name?"#635BFF":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                                          {(r as any).trusteeVerifiedBy===name && <svg width="10" height="7" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                        </div>
                                        <div style={{flex:1}}>
                                          <span style={{fontSize:12,color:(r as any).trusteeVerifiedBy===name?T.white:T.muted,fontWeight:(r as any).trusteeVerifiedBy===name?600:400}}>{name}</span>
                                          {(r as any).trusteeVerifiedBy===name && (r as any).trusteeVerifiedAt && <span style={{display:"block",fontSize:10,color:"#a5b4fc",marginTop:1}}>{new Date((r as any).trusteeVerifiedAt).toLocaleString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div><span style={{color:T.muted,display:"block",marginBottom:2}}>RECORDED AT</span><span style={{color:T.white}}>{r.createdAt ? new Date(r.createdAt).toLocaleString("en-GB") : "—"}</span></div>
                            {/* Delete button — only superadmin/owner can delete */}
                            {canDeleteIncome && (
                              <div style={{gridColumn:"1/-1",marginTop:4}}>
                                <button onClick={(e)=>{ e.stopPropagation(); if(window.confirm("Delete this income record? This cannot be undone.")) deleteMutation.mutate({id:r.id}); }}
                                  style={{padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:600,border:"1px solid rgba(239,68,68,0.4)",background:"rgba(239,68,68,0.1)",color:"#f87171",cursor:"pointer"}}>
                                  Delete Record
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )})}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add income dialog — key forces full remount so selectedCat initialises correctly */}
        <Dialog key={dialogKey} open={open} onOpenChange={handleDialogClose}>
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
                // Pass rental date range as periodStart/periodEnd for Rental Income categories
                if (RENTAL_INCOME_CATS.has(watchCat)) {
                  if (d.rentalFrom) payload.periodStart = d.rentalFrom;
                  if (d.rentalTo) payload.periodEnd = d.rentalTo;
                }
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
                      {...register("category",{required:true, onChange: e => handleCategoryChange(e.target.value)})}
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
                        <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Date</Label>
                        <label style={{ position:"relative",display:"block",cursor:"pointer",marginTop:6 }}>
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
                          <input
                            type="date"
                            {...register("incomeDate")}
                            style={{ position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer" }}
                          />
                        </label>
                      </>
                    )}
                  </div>
                </div>
                {/* Rental Income date range */}
                {RENTAL_INCOME_CATS.has(watchCat) && (
                  <div style={{ background:"rgba(99,91,255,0.04)",border:`1px solid rgba(99,91,255,0.15)`,borderRadius:12,padding:"14px 16px",display:"flex",flexDirection:"column",gap:12 }}>
                    <p style={{ margin:"0 0 4px",fontSize:11,color:"#a5b4fc",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em" }}>Rental Period</p>
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                      <div>
                        <Label style={{ fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>From</Label>
                        <label style={{ position:"relative",display:"block",cursor:"pointer",marginTop:4 }}>
                          <div style={{ width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${watch("rentalFrom") ? "#a5b4fc" : T.border}`,borderRadius:10,color:watch("rentalFrom") ? T.white : T.muted,height:44,padding:"0 10px",fontSize:12,display:"flex",alignItems:"center",gap:6,pointerEvents:"none" }}>
                            <Calendar size={13} style={{ color:watch("rentalFrom") ? "#a5b4fc" : T.muted,flexShrink:0 }}/>
                            <span style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                              {watch("rentalFrom") ? new Date(watch("rentalFrom")+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) : "Select date…"}
                            </span>
                          </div>
                          <input type="date" {...register("rentalFrom")} style={{ position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer" }}/>
                        </label>
                      </div>
                      <div>
                        <Label style={{ fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>To</Label>
                        <label style={{ position:"relative",display:"block",cursor:"pointer",marginTop:4 }}>
                          <div style={{ width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${watch("rentalTo") ? "#a5b4fc" : T.border}`,borderRadius:10,color:watch("rentalTo") ? T.white : T.muted,height:44,padding:"0 10px",fontSize:12,display:"flex",alignItems:"center",gap:6,pointerEvents:"none" }}>
                            <Calendar size={13} style={{ color:watch("rentalTo") ? "#a5b4fc" : T.muted,flexShrink:0 }}/>
                            <span style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                              {watch("rentalTo") ? new Date(watch("rentalTo")+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) : "Select date…"}
                            </span>
                          </div>
                          <input type="date" {...register("rentalTo")} style={{ position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer" }}/>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
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
                  /* Donation categories — multi-donor entry with sign-off */
                  <>
                    {/* Donor Details panel */}
                    <div style={{ background:"rgba(0,255,194,0.05)",border:`1px solid rgba(0,255,194,0.15)`,borderRadius:12,padding:"14px 16px",display:"flex",flexDirection:"column",gap:10 }}>
                      <p style={{ margin:"0 0 4px",fontSize:11,color:T.mint,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em" }}>Donor Details</p>

                      {/* Existing donors list */}
                      {donors.map((d, i) => (
                        <div key={i} style={{ borderRadius:10,background:"rgba(0,255,194,0.07)",border:`1px solid rgba(0,255,194,0.2)`,padding:"10px 12px" }}>
                          <div style={{ display:"flex",alignItems:"flex-start",gap:8 }}>
                            <div style={{ flex:1 }}>
                              <span style={{ fontSize:13,color:T.white,fontWeight:600 }}>{d.name}</span>
                              {d.amount && <span style={{ fontSize:11,color:T.mint,marginLeft:8 }}>£{d.amount}</span>}
                              <span style={{ display:"block",fontSize:11,color:T.muted,marginTop:1 }}>{[d.email,d.phone].filter(Boolean).join(" · ")}</span>
                            </div>
                            <button type="button" onClick={() => removeDonor(i)} style={{ background:"none",border:"none",color:"rgba(255,100,100,0.7)",cursor:"pointer",fontSize:16,lineHeight:1,padding:2 }}>×</button>
                          </div>
                          {/* Email receipt + WhatsApp buttons per donor */}
                          <div style={{ display:"flex",gap:8,marginTop:8 }}>
                            {d.email && (
                              <button type="button"
                                disabled={sendingReceipt === i}
                                onClick={async () => {
                                  setSendingReceipt(i);
                                  try {
                                    const authorisedBy = [donorSignManager, donorSignTrustee === "Other" ? donorSignTrusteeOther : donorSignTrustee].filter(Boolean).join(" & ");
                                    await sendReceiptMutation.mutateAsync({ donorName:d.name, donorEmail:d.email, amount:d.amount||undefined, category:watchCat, incomeDate:watch("incomeDate")||undefined, authorisedBy:authorisedBy||undefined });
                                    toast.success(`Receipt sent to ${d.email}`);
                                  } catch(e:any) { toast.error(e.message||"Failed to send email"); }
                                  setSendingReceipt(null);
                                }}
                                style={{ flex:1,padding:"6px 10px",borderRadius:8,background:"rgba(99,91,255,0.12)",border:"1px solid rgba(99,91,255,0.3)",color:"#a5b4fc",fontSize:11,fontWeight:600,cursor:"pointer" }}>
                                {sendingReceipt === i ? "Sending…" : "✉️ Send Email Receipt"}
                              </button>
                            )}
                            {d.phone && (
                              <button type="button"
                                onClick={() => {
                                  const phone = d.phone.replace(/[^0-9]/g,"");
                                  const authorisedBy = [donorSignManager, donorSignTrustee === "Other" ? donorSignTrusteeOther : donorSignTrustee].filter(Boolean).join(" & ");
                                  const amtStr = d.amount ? `£${parseFloat(d.amount).toFixed(2)}` : "your donation";
                                  const msg = encodeURIComponent(`Assalamu Alaikum ${d.name.split(" ")[0]}, JazakAllahu Khayran for your generous donation of ${amtStr} to Abdullah Quilliam Society (${watchCat}). This is your confirmation receipt.${authorisedBy ? ` Authorised by: ${authorisedBy}.` : ""} May Allah bless you.`);
                                  window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");
                                }}
                                style={{ flex:1,padding:"6px 10px",borderRadius:8,background:"rgba(37,211,102,0.1)",border:"1px solid rgba(37,211,102,0.3)",color:"#4ade80",fontSize:11,fontWeight:600,cursor:"pointer" }}>
                                💬 Send WhatsApp
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Draft donor form */}
                      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                        <input value={draftDonor.name} onChange={e => setDraftDonor(p => ({...p,name:e.target.value}))} placeholder="Full name *"
                          style={{ gridColumn:"1/-1",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:8,color:T.white,height:38,padding:"0 10px",fontSize:13,outline:"none" }}/>
                        <input value={draftDonor.email} onChange={e => setDraftDonor(p => ({...p,email:e.target.value}))} placeholder="Email *"
                          type="email"
                          style={{ background:"rgba(255,255,255,0.06)",border:`1px solid rgba(0,255,194,0.3)`,borderRadius:8,color:T.white,height:38,padding:"0 10px",fontSize:13,outline:"none" }}/>
                        <input value={draftDonor.phone} onChange={e => setDraftDonor(p => ({...p,phone:e.target.value}))} placeholder="Phone *"
                          type="tel"
                          style={{ background:"rgba(255,255,255,0.06)",border:`1px solid rgba(0,255,194,0.3)`,borderRadius:8,color:T.white,height:38,padding:"0 10px",fontSize:13,outline:"none" }}/>
                        <input value={draftDonor.amount} onChange={e => setDraftDonor(p => ({...p,amount:e.target.value}))} placeholder="Amount (£)"
                          type="number" step="0.01"
                          style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:8,color:T.white,height:38,padding:"0 10px",fontSize:13,outline:"none" }}/>
                      </div>
                      <button type="button" onClick={addDonorEntry}
                        style={{ alignSelf:"flex-start",background:`rgba(0,255,194,0.12)`,border:`1px solid rgba(0,255,194,0.3)`,borderRadius:8,color:T.mint,fontWeight:600,fontSize:12,padding:"6px 14px",cursor:"pointer" }}>
                        + Add Donor
                      </button>
                    </div>

                    {/* Notes — mandatory */}
                    <div>
                      <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Notes <span style={{ color:"#f87171" }}>*</span></Label>
                      <Input {...register("notes",{required:true})} placeholder="Notes (required)"
                        style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                    </div>

                    {/* Donor sign-off section */}
                    <div style={{ background:"rgba(99,91,255,0.06)",border:`1px solid rgba(99,91,255,0.2)`,borderRadius:12,padding:"14px 16px",display:"flex",flexDirection:"column",gap:12 }}>
                      <p style={{ margin:0,fontSize:11,color:T.purple,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em" }}>Authorised By</p>

                      {/* Manager tick boxes */}
                      <div>
                        <p style={{ margin:"0 0 8px",fontSize:10,color:T.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em" }}>Manager</p>
                        {(["Farid Ahmed","Mumin Khan"] as const).map(name => {
                          const isSelected = donorSignManager === name;
                          return (
                            <div key={name} onClick={() => { if(isSelected){setDonorSignManager("");setDonorSignManagerTs("");}else{setDonorSignManager(name);setDonorSignManagerTs(new Date().toISOString());} }}
                              style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,cursor:"pointer",marginBottom:6,background:isSelected?"rgba(0,255,194,0.08)":"rgba(255,255,255,0.03)",border:`1px solid ${isSelected?"rgba(0,255,194,0.3)":T.border}`,transition:"all 0.15s" }}>
                              <div style={{ width:18,height:18,borderRadius:4,border:`2px solid ${isSelected?T.mint:"rgba(255,255,255,0.3)"}`,background:isSelected?T.mint:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.15s" }}>
                                {isSelected && <span style={{ fontSize:11,color:T.navy,fontWeight:900 }}>✓</span>}
                              </div>
                              <div style={{ flex:1 }}>
                                <span style={{ fontSize:13,color:T.white,fontWeight:600 }}>{name}</span>
                                {isSelected && donorSignManagerTs && <span style={{ display:"block",fontSize:10,color:T.mint,marginTop:1 }}>{fmtStamp(donorSignManagerTs)}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Trustee tick boxes */}
                      <div>
                        <p style={{ margin:"0 0 8px",fontSize:10,color:T.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em" }}>Trustee</p>
                        {(["Dr Abdul Hamid","Ghalib Khan","Other"] as const).map(name => {
                          const isSelected = donorSignTrustee === name;
                          return (
                            <div key={name}>
                              <div onClick={() => { if(isSelected){setDonorSignTrustee("");setDonorSignTrusteeTs("");}else{setDonorSignTrustee(name);setDonorSignTrusteeTs(new Date().toISOString());} }}
                                style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,cursor:"pointer",marginBottom:4,background:isSelected?"rgba(165,180,252,0.08)":"rgba(255,255,255,0.03)",border:`1px solid ${isSelected?"rgba(165,180,252,0.4)":T.border}`,transition:"all 0.15s" }}>
                                <div style={{ width:18,height:18,borderRadius:4,border:`2px solid ${isSelected?"#a5b4fc":"rgba(255,255,255,0.3)"}`,background:isSelected?"#a5b4fc":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.15s" }}>
                                  {isSelected && <span style={{ fontSize:11,color:T.navy,fontWeight:900 }}>✓</span>}
                                </div>
                                <div style={{ flex:1 }}>
                                  <span style={{ fontSize:13,color:T.white,fontWeight:600 }}>{name}</span>
                                  {isSelected && donorSignTrusteeTs && <span style={{ display:"block",fontSize:10,color:"#a5b4fc",marginTop:1 }}>{fmtStamp(donorSignTrusteeTs)}</span>}
                                </div>
                              </div>
                              {isSelected && name === "Other" && (
                                <input value={donorSignTrusteeOther} onChange={e => setDonorSignTrusteeOther(e.target.value)} placeholder="Enter trustee name"
                                  style={{ width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid rgba(165,180,252,0.3)`,borderRadius:8,color:T.white,height:36,padding:"0 10px",fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:4 }}/>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  /* Other non-Friday-Collections categories */
                  <>
                    <div>
                      <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Details</Label>
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
                {/* Confirmation checkbox */}
                <div onClick={()=>setConfirmed(c=>!c)}
                  style={{ display:"flex",alignItems:"flex-start",gap:10,padding:"12px 14px",borderRadius:10,border:`1px solid ${confirmed ? T.mint : T.border}`,background:confirmed ? "rgba(0,255,178,0.06)" : "rgba(255,255,255,0.03)",cursor:"pointer",transition:"all 0.2s" }}>
                  <div style={{ width:18,height:18,borderRadius:4,border:`2px solid ${confirmed ? T.mint : T.muted}`,background:confirmed ? T.mint : "transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,transition:"all 0.2s" }}>
                    {confirmed && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#081526" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span style={{ fontSize:12,color:confirmed ? T.white : T.muted,lineHeight:1.4 }}>I confirm that the figures above have been checked and are correct, and I authorise this record to be saved.</span>
                </div>
                <Button type="submit" disabled={createMutation.isPending || uploadingEvidence || !confirmed}
                  style={{ background:confirmed ? `linear-gradient(135deg,${T.mint},#00DDB0)` : "rgba(255,255,255,0.1)",color:confirmed ? "#081526" : T.muted,fontWeight:700,height:48,borderRadius:12,border:"none",fontSize:15,transition:"all 0.3s",cursor:confirmed ? "pointer" : "not-allowed" }}>
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
