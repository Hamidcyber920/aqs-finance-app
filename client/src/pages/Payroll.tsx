import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import {
  Plus, Upload, Wallet, Users, CheckCircle2, Clock, FileText,
  ChevronDown, ChevronUp, Camera, Loader2, Banknote, CreditCard,
  Coins, Image as ImageIcon, X, CheckSquare, Square, Sparkles,
  Calendar, User, ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const T = {
  navy: "#0A192F", purple: "#635BFF", mint: "#00FFC2",
  white: "#FFFFFF", muted: "rgba(255,255,255,0.5)",
  border: "rgba(255,255,255,0.08)", glass: "rgba(255,255,255,0.04)",
  card: "rgba(13,34,64,0.8)"
};

type PaymentMethod = "bank_transfer" | "cheque" | "cash";

interface ExtractedEmployee {
  employeeName: string | null;
  employeeId: string | null;
  taxCode: string | null;
  niNumber: string | null;
  period: string | null;
  month: number | null;
  year: number | null;
  grossPay: number | null;
  incomeTax: number | null;
  nationalInsurance: number | null;
  pensionContribution: number | null;
  otherDeductions: number | null;
  netPay: number | null;
  paymentMethod: string | null;
}

interface VerificationRow extends ExtractedEmployee {
  checked: boolean;
  payMethod: PaymentMethod;
  chequeNumber: string;
  chequeEvidenceUrl: string;
  chequeEvidencePreview: string;
  uploadingEvidence: boolean;
  paidAt: string; // ISO date string
  authorisedByName: string;
  expanded: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    paid: { bg: "rgba(0,255,194,0.1)", color: T.mint },
    pending: { bg: "rgba(251,191,36,0.1)", color: "#fbbf24" },
    draft: { bg: "rgba(99,91,255,0.1)", color: "#a78bfa" },
    withheld: { bg: "rgba(248,113,113,0.1)", color: "#f87171" },
  };
  const s = map[status?.toLowerCase()] ?? { bg: T.glass, color: T.muted };
  return (
    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, textTransform: "capitalize" }}>
      {status}
    </span>
  );
}

function PayMethodBadge({ method }: { method: string }) {
  const map: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    bank_transfer: { icon: Banknote, color: "#3B82F6", label: "Bank Transfer" },
    cheque: { icon: CreditCard, color: "#F59E0B", label: "Cheque" },
    cash: { icon: Coins, color: "#10B981", label: "Cash" },
  };
  const m = map[method] ?? map.bank_transfer;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: `${m.color}22`, color: m.color }}>
      <m.icon size={11} />{m.label}
    </span>
  );
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function PayrollPage() {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  // AI extraction state
  const [analyzing, setAnalyzing] = useState(false);
  const [verificationRows, setVerificationRows] = useState<VerificationRow[]>([]);
  const [showVerification, setShowVerification] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  // Expanded row in saved table
  const [expandedSavedRow, setExpandedSavedRow] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'payroll' | 'cheques'>('payroll');
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [chequeYear, setChequeYear] = useState(new Date().getFullYear());

  const fileRef = useRef<HTMLInputElement>(null);
  const chequeRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const { data, refetch } = trpc.payroll.list.useQuery({ month, year });
  const { data: chequeData, refetch: refetchCheques } = trpc.payroll.getChequeRegister.useQuery({ year: chequeYear });
  const markChequeBanked = trpc.payroll.markChequeBanked.useMutation({ onSuccess: () => { refetchCheques(); toast.success('Cheque marked as banked'); } });
  const analyzePayslipBulk = trpc.payroll.analyzePayslipBulk.useMutation();
  const createMutation = trpc.payroll.create.useMutation();
  const updateMutation = trpc.payroll.update.useMutation();

  const { register, handleSubmit, reset, setValue } = useForm<any>();

  const records: any[] = Array.isArray(data) ? data : [];
  const totalGross = records.reduce((s: number, r: any) => s + Number(r.grossPay ?? 0), 0);
  const totalNet = records.reduce((s: number, r: any) => s + Number(r.netPay ?? 0), 0);
  const totalDeductions = totalGross - totalNet;

  // ── Upload & AI extract ──────────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzing(true);
    setShowVerification(false);
    setVerificationRows([]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const { url } = await res.json();
      toast.info("AI is analysing the payslip…");
      const result = await analyzePayslipBulk.mutateAsync({ fileUrl: url, mimeType: file.type || "application/pdf" });
      const employees: ExtractedEmployee[] = result.employees ?? [];
      if (employees.length === 0) {
        toast.error("No employee data found — please try a clearer image or fill manually");
        return;
      }
      const now = new Date().toISOString().slice(0, 16); // datetime-local format
      const rows: VerificationRow[] = employees.map(emp => ({
        ...emp,
        checked: true,
        payMethod: (emp.paymentMethod as PaymentMethod) ?? "bank_transfer",
        chequeNumber: "",
        chequeEvidenceUrl: "",
        chequeEvidencePreview: "",
        uploadingEvidence: false,
        paidAt: now,
        authorisedByName: "Dr Abdul Hamid",
        expanded: true,
      }));
      setVerificationRows(rows);
      setShowVerification(true);
      toast.success(`AI extracted ${employees.length} employee record${employees.length > 1 ? "s" : ""} — review and confirm below`);
    } catch (err: any) {
      toast.error("Extraction failed: " + (err?.message ?? "unknown error"));
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Cheque evidence upload ───────────────────────────────────────────────────
  const handleChequeEvidence = async (rowIndex: number, file: File) => {
    setVerificationRows(prev => prev.map((r, i) => i === rowIndex ? { ...r, uploadingEvidence: true } : r));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const { url } = await res.json();
      const preview = URL.createObjectURL(file);
      setVerificationRows(prev => prev.map((r, i) => i === rowIndex ? { ...r, chequeEvidenceUrl: url, chequeEvidencePreview: preview, uploadingEvidence: false } : r));
      toast.success("Cheque evidence uploaded");
    } catch {
      toast.error("Evidence upload failed");
      setVerificationRows(prev => prev.map((r, i) => i === rowIndex ? { ...r, uploadingEvidence: false } : r));
    }
  };

  // ── Save verified rows ───────────────────────────────────────────────────────
  const handleSaveVerified = async () => {
    const toSave = verificationRows.filter(r => r.checked);
    if (toSave.length === 0) { toast.error("Select at least one employee to save"); return; }
    setSavingAll(true);
    let saved = 0;
    for (const row of toSave) {
      try {
        const grossPay = String(row.grossPay ?? 0);
        const netPay = String(row.netPay ?? 0);
        const incomeTax = String(row.incomeTax ?? 0);
        const nationalInsurance = String(row.nationalInsurance ?? 0);
        const pensionContribution = String(row.pensionContribution ?? 0);
        const otherDeductions = String(row.otherDeductions ?? 0);
        const rec = await createMutation.mutateAsync({
          employeeName: row.employeeName ?? "Unknown",
          month: row.month ?? month,
          year: row.year ?? year,
          grossPay,
          incomeTax,
          nationalInsurance,
          pensionContribution,
          otherDeductions,
          netPay,
          paymentMethod: row.payMethod,
          notes: row.taxCode ? `Tax Code: ${row.taxCode}` : undefined,
        });
        // Update with payment details, cheque evidence, signatory, paidAt
        if (rec?.id) {
          await updateMutation.mutateAsync({
            id: rec.id,
            paymentStatus: "paid",
            chequeImageUrl: row.chequeEvidenceUrl || undefined,
            chequeNumber: row.chequeNumber || undefined,
            paidAt: row.paidAt ? new Date(row.paidAt) : new Date(),
            notes: [
              row.taxCode ? `Tax Code: ${row.taxCode}` : "",
              row.niNumber ? `NI: ${row.niNumber}` : "",
              `Authorised by: ${row.authorisedByName}`,
            ].filter(Boolean).join(" | "),
          });
        }
        saved++;
      } catch (err: any) {
        toast.error(`Failed to save ${row.employeeName ?? "employee"}: ${err?.message ?? "error"}`);
      }
    }
    setSavingAll(false);
    if (saved > 0) {
      toast.success(`Saved ${saved} payroll record${saved > 1 ? "s" : ""}`);
      setShowVerification(false);
      setVerificationRows([]);
      refetch();
    }
  };

  const allChecked = verificationRows.length > 0 && verificationRows.every(r => r.checked);
  const toggleAll = () => setVerificationRows(prev => prev.map(r => ({ ...r, checked: !allChecked })));

  const updateRow = (i: number, patch: Partial<VerificationRow>) =>
    setVerificationRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  // ── Staff profile auto-fill ──────────────────────────────────────────────────
  const [profileLookupName, setProfileLookupName] = useState('');
  const [profileLookupIdx, setProfileLookupIdx] = useState<number | null>(null);
  const { data: staffProfileData } = trpc.payroll.getStaffProfileByName.useQuery(
    { name: profileLookupName },
    { enabled: profileLookupName.length >= 3 }
  );
  // Effect: when staffProfileData arrives, apply to the target row
  const prevProfileName = useRef('');
  if (staffProfileData !== undefined && profileLookupName !== prevProfileName.current && profileLookupIdx !== null) {
    prevProfileName.current = profileLookupName;
    if (staffProfileData) {
      const idx = profileLookupIdx;
      setTimeout(() => {
        updateRow(idx, {
          niNumber: staffProfileData.niNumber ?? null,
          taxCode: staffProfileData.taxCode ?? null,
          payMethod: (staffProfileData.paymentMethod as PaymentMethod) ?? 'bank_transfer',
        });
        toast.success(`Auto-filled NI & Tax Code from staff profile`);
      }, 0);
    }
  }
  const autoFillFromProfile = (i: number, name: string) => {
    setProfileLookupIdx(i);
    setProfileLookupName(name);
  };

  // ── Export handlers ───────────────────────────────────────────────────────────
  const [exportMonth, setExportMonth] = useState(month);
  const [exportYear, setExportYear] = useState(year);
  const { data: exportCsvData, refetch: refetchCsv } = trpc.payroll.exportMonthly.useQuery(
    { month: exportMonth, year: exportYear },
    { enabled: false }
  );
  const { data: exportPdfData, refetch: refetchPdf } = trpc.payroll.exportMonthlyPdf.useQuery(
    { month: exportMonth, year: exportYear },
    { enabled: false }
  );

  const handleExportCsv = async () => {
    setExportMonth(month); setExportYear(year);
    setExportingCsv(true);
    try {
      const result = await refetchCsv();
      const data = result.data;
      if (!data) { toast.error('No data to export'); return; }
      const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Payroll_${data.monthLabel.replace(' ', '_')}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success(`Downloaded ${data.monthLabel} payroll CSV (${data.rowCount} records)`);
    } catch { toast.error('Export failed'); } finally { setExportingCsv(false); }
  };

  const handleExportPdf = async () => {
    setExportMonth(month); setExportYear(year);
    setExportingPdf(true);
    try {
      const result = await refetchPdf();
      const data = result.data;
      if (!data) { toast.error('No data to export'); return; }
      const blob = new Blob([data.html], { type: 'text/html;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (win) { setTimeout(() => win.print(), 800); }
      toast.success(`Opened ${data.monthLabel} payroll summary for printing`);
    } catch { toast.error('PDF export failed'); } finally { setExportingPdf(false); }
  };

  return (
    <>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        .payroll-input{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;padding:6px 10px;font-size:13px;width:100%;outline:none;}
        .payroll-input:focus{border-color:#635BFF;}
        .payroll-select{background:#0D2240;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;padding:6px 10px;font-size:13px;outline:none;cursor:pointer;}
        .payroll-select:focus{border-color:#635BFF;}
      `}</style>

      <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`, padding: 24, fontFamily: "'DM Sans',sans-serif" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12, animation: "fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize: "clamp(22px,3vw,30px)", fontWeight: 800, color: T.white, margin: 0, letterSpacing: "-0.03em" }}>
              Payroll <span style={{ color: T.mint }}>Management</span>
            </h1>
            <p style={{ fontSize: 13, color: T.muted, margin: "4px 0 0" }}>Monthly payslips, cheque scans, AI analysis</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {/* Month/Year selector */}
            <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 12, padding: "6px 12px", alignItems: "center" }}>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} className="payroll-select" style={{ background: "transparent", border: "none", padding: "0 4px" }}>
                {MONTHS.map(m => (
                  <option key={m} value={m} style={{ background: "#0D2240" }}>
                    {new Date(2000, m - 1).toLocaleString("en-GB", { month: "short" })}
                  </option>
                ))}
              </select>
              <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="payroll-input" style={{ width: 70, background: "transparent", border: "none", padding: "0 4px", textAlign: "center" }} />
            </div>
            {/* Upload payslip */}
            <input ref={fileRef} type="file" accept=".pdf,image/*" onChange={handleFileUpload} style={{ display: "none" }} />
            <Button onClick={() => fileRef.current?.click()} disabled={analyzing}
              style={{ background: "rgba(99,91,255,0.15)", border: `1px solid rgba(99,91,255,0.3)`, color: T.purple, borderRadius: 12, padding: "10px 18px", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              {analyzing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {analyzing ? "Analysing…" : "Upload Payslip"}
            </Button>
            <Button onClick={() => setOpen(true)}
              style={{ background: `linear-gradient(135deg,${T.purple},#4f46e5)`, color: T.white, border: "none", borderRadius: 12, padding: "10px 18px", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <Plus size={15} /> Manual Entry
            </Button>
            {/* Export buttons */}
            <Button onClick={handleExportCsv} disabled={exportingCsv || records.length === 0}
              style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981", borderRadius: 12, padding: "10px 16px", fontWeight: 700, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              {exportingCsv ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
              CSV
            </Button>
            <Button onClick={handleExportPdf} disabled={exportingPdf || records.length === 0}
              style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24", borderRadius: 12, padding: "10px 16px", fontWeight: 700, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              {exportingPdf ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
              Print
            </Button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 16, marginBottom: 28 }}>
          {[
            { label: "Gross Pay", value: `£${totalGross.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`, color: T.mint, icon: Wallet },
            { label: "Net Pay", value: `£${totalNet.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`, color: T.purple, icon: CheckCircle2 },
            { label: "Deductions", value: `£${totalDeductions.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`, color: "#f87171", icon: Clock },
            { label: "Staff", value: records.length, color: "#a78bfa", icon: Users },
          ].map((s, i) => (
            <div key={s.label} style={{ background: T.card, backdropFilter: "blur(20px)", border: `1px solid ${T.border}`, borderRadius: 16, padding: "18px 20px", display: "flex", alignItems: "center", gap: 14, animation: `fadeUp 0.5s ease ${i * 80}ms both` }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: `${s.color}22`, border: `1px solid ${s.color}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <s.icon size={18} style={{ color: s.color }} />
              </div>
              <div>
                <p style={{ fontSize: 20, fontWeight: 800, color: T.white, margin: 0, letterSpacing: "-0.03em" }}>{s.value}</p>
                <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tab Navigation ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 12, padding: 4, width: "fit-content" }}>
          {([['payroll', 'Payroll Records'], ['cheques', 'Cheque Register']] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ padding: "8px 18px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all 0.2s",
                background: activeTab === tab ? T.purple : "transparent",
                color: activeTab === tab ? T.white : T.muted }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── AI Verification Panel ── */}
        {showVerification && verificationRows.length > 0 && (
          <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 16, padding: 20, marginBottom: 24, animation: "fadeUp 0.4s ease both" }}>
            {/* Verification header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Sparkles size={18} style={{ color: T.mint }} />
                <div>
                  <p style={{ color: T.mint, fontSize: 15, fontWeight: 700, margin: 0 }}>AI Extraction Complete</p>
                  <p style={{ color: T.muted, fontSize: 12, margin: "2px 0 0" }}>{verificationRows.length} employee{verificationRows.length > 1 ? "s" : ""} found — review, edit, and confirm before saving</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setShowVerification(false); setVerificationRows([]); }}
                  style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 12px", color: T.muted, cursor: "pointer", fontSize: 12 }}>
                  <X size={13} style={{ display: "inline", marginRight: 4 }} />Dismiss
                </button>
                <Button onClick={handleSaveVerified} disabled={savingAll || verificationRows.filter(r => r.checked).length === 0}
                  style={{ background: "linear-gradient(135deg,#10B981,#059669)", color: T.white, border: "none", borderRadius: 10, padding: "8px 18px", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  {savingAll ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Save {verificationRows.filter(r => r.checked).length} Record{verificationRows.filter(r => r.checked).length !== 1 ? "s" : ""}
                </Button>
              </div>
            </div>

            {/* Select All */}
            <button onClick={toggleAll} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 12, marginBottom: 12, padding: 0 }}>
              {allChecked ? <CheckSquare size={16} style={{ color: T.mint }} /> : <Square size={16} />}
              {allChecked ? "Deselect All" : "Select All"}
            </button>

            {/* Per-employee verification cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {verificationRows.map((row, i) => (
                <div key={i} style={{ background: "rgba(13,34,64,0.9)", border: `1px solid ${row.checked ? "rgba(16,185,129,0.4)" : T.border}`, borderRadius: 12, overflow: "hidden", transition: "border-color 0.2s" }}>
                  {/* Row header — always visible */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer" }}
                    onClick={() => updateRow(i, { expanded: !row.expanded })}>
                    {/* Checkbox */}
                    <button onClick={e => { e.stopPropagation(); updateRow(i, { checked: !row.checked }); }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                      {row.checked
                        ? <CheckSquare size={20} style={{ color: T.mint }} />
                        : <Square size={20} style={{ color: T.muted }} />}
                    </button>
                    {/* Avatar */}
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: T.purple, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: T.white, flexShrink: 0 }}>
                      {(row.employeeName ?? "?")[0]}
                    </div>
                    {/* Name + summary */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: T.white, margin: 0 }}>{row.employeeName ?? "Unknown Employee"}</p>
                      <p style={{ fontSize: 11, color: T.muted, margin: "2px 0 0" }}>
                        Gross: <span style={{ color: T.mint }}>£{(row.grossPay ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
                        {" · "}Net: <span style={{ color: T.white }}>£{(row.netPay ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
                        {row.niNumber ? ` · NI: ${row.niNumber}` : ""}
                        {row.taxCode ? ` · Tax: ${row.taxCode}` : ""}
                      </p>
                    </div>
                    <PayMethodBadge method={row.payMethod} />
                    {row.expanded ? <ChevronUp size={16} style={{ color: T.muted, flexShrink: 0 }} /> : <ChevronDown size={16} style={{ color: T.muted, flexShrink: 0 }} />}
                  </div>

                  {/* Expanded detail */}
                  {row.expanded && (
                    <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${T.border}` }}>
                      {/* Pay figures */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginTop: 14 }}>
                        {[
                          { label: "Gross Pay (£)", field: "grossPay", value: row.grossPay },
                          { label: "Income Tax (£)", field: "incomeTax", value: row.incomeTax },
                          { label: "NI (£)", field: "nationalInsurance", value: row.nationalInsurance },
                          { label: "Pension (£)", field: "pensionContribution", value: row.pensionContribution },
                          { label: "Other Deductions (£)", field: "otherDeductions", value: row.otherDeductions },
                          { label: "Net Pay (£)", field: "netPay", value: row.netPay },
                        ].map(f => (
                          <div key={f.field}>
                            <label style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{f.label}</label>
                            <input
                              type="number" step="0.01"
                              value={f.value ?? ""}
                              onChange={e => updateRow(i, { [f.field]: e.target.value === "" ? null : parseFloat(e.target.value) } as any)}
                              className="payroll-input"
                              style={{ marginTop: 4 }}
                            />
                          </div>
                        ))}
                      </div>

                      {/* NI / Tax Code */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>NI Number</label>
                          <input value={row.niNumber ?? ""} onChange={e => updateRow(i, { niNumber: e.target.value })} className="payroll-input" style={{ marginTop: 4 }} placeholder="AB123456C" />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Tax Code</label>
                          <input value={row.taxCode ?? ""} onChange={e => updateRow(i, { taxCode: e.target.value })} className="payroll-input" style={{ marginTop: 4 }} placeholder="1257L" />
                        </div>
                      </div>

                      {/* Payment Method + Date + Signatory */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                        {/* Payment method dropdown */}
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 4 }}>
                            <Banknote size={11} />Payment Method
                          </label>
                          <select value={row.payMethod} onChange={e => updateRow(i, { payMethod: e.target.value as PaymentMethod })} className="payroll-select" style={{ marginTop: 4, width: "100%" }}>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="cheque">Cheque</option>
                            <option value="cash">Cash</option>
                          </select>
                        </div>
                        {/* Payment date */}
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 4 }}>
                            <Calendar size={11} />Payment Date & Time
                          </label>
                          <input type="datetime-local" value={row.paidAt} onChange={e => updateRow(i, { paidAt: e.target.value })} className="payroll-input" style={{ marginTop: 4 }} />
                        </div>
                        {/* Authorising signatory */}
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 4 }}>
                            <ShieldCheck size={11} />Authorised By
                          </label>
                          <input value={row.authorisedByName} onChange={e => updateRow(i, { authorisedByName: e.target.value })} className="payroll-input" style={{ marginTop: 4 }} placeholder="Dr Abdul Hamid" />
                        </div>
                      </div>

                      {/* Cheque details — shown only when cheque selected */}
                      {row.payMethod === "cheque" && (
                        <div style={{ marginTop: 12, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: 12 }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                            <CreditCard size={13} />Cheque Details
                          </p>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div>
                              <label style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Cheque Number</label>
                              <input value={row.chequeNumber} onChange={e => updateRow(i, { chequeNumber: e.target.value })} className="payroll-input" style={{ marginTop: 4 }} placeholder="000001" />
                            </div>
                            <div>
                              <label style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Evidence (photo/scan)</label>
                              <div style={{ marginTop: 4 }}>
                                {row.chequeEvidenceUrl ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <img src={row.chequeEvidencePreview || row.chequeEvidenceUrl} alt="cheque" style={{ width: 60, height: 40, objectFit: "cover", borderRadius: 6, border: `1px solid ${T.border}` }} />
                                    <button onClick={() => updateRow(i, { chequeEvidenceUrl: "", chequeEvidencePreview: "" })}
                                      style={{ background: "rgba(248,113,113,0.15)", border: "none", borderRadius: 6, padding: "4px 8px", color: "#f87171", cursor: "pointer", fontSize: 11 }}>
                                      <X size={11} style={{ display: "inline", marginRight: 3 }} />Remove
                                    </button>
                                  </div>
                                ) : (
                                  <button onClick={() => chequeRefs.current[i]?.click()} disabled={row.uploadingEvidence}
                                    style={{ background: "rgba(245,158,11,0.1)", border: "1px dashed rgba(245,158,11,0.4)", borderRadius: 8, padding: "8px 14px", color: "#F59E0B", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                                    {row.uploadingEvidence ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                                    {row.uploadingEvidence ? "Uploading…" : "Upload Cheque"}
                                  </button>
                                )}
                                <input ref={el => { chequeRefs.current[i] = el; }} type="file" accept="image/*,.pdf" style={{ display: "none" }}
                                  onChange={e => { const f = e.target.files?.[0]; if (f) handleChequeEvidence(i, f); if (e.target) e.target.value = ""; }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Bottom save bar */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <Button onClick={handleSaveVerified} disabled={savingAll || verificationRows.filter(r => r.checked).length === 0}
                style={{ background: "linear-gradient(135deg,#10B981,#059669)", color: T.white, border: "none", borderRadius: 12, padding: "12px 28px", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                {savingAll ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {savingAll ? "Saving…" : `Save ${verificationRows.filter(r => r.checked).length} Confirmed Record${verificationRows.filter(r => r.checked).length !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        )}

        {/* ── Saved Payroll Table ── */}
        {activeTab === 'payroll' && <div style={{ background: T.card, backdropFilter: "blur(20px)", border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, animation: "fadeUp 0.5s ease 300ms both" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: T.white, margin: "0 0 20px", letterSpacing: "-0.01em" }}>
            {new Date(year, month - 1).toLocaleString("en-GB", { month: "long", year: "numeric" })} Payroll
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
              <thead>
                <tr>
                  {["Employee", "NI Number", "Gross Pay", "Deductions", "Net Pay", "Payment", "Paid At", "Status", ""].map(h => (
                    <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", padding: "0 12px 12px 0", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: "center", padding: 48, color: T.muted, fontSize: 14 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                      <FileText size={32} style={{ color: T.muted, opacity: 0.4 }} />
                      <span>No payroll records — upload a payslip PDF or add manually</span>
                    </div>
                  </td></tr>
                ) : records.map((r: any, i: number) => (
                  <>
                    <tr key={r.id ?? i} style={{ cursor: "pointer" }} onClick={() => setExpandedSavedRow(expandedSavedRow === r.id ? null : r.id)}>
                      <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: T.purple, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: T.white, flexShrink: 0 }}>
                            {(r.employeeName ?? r.userName ?? "?")[0]}
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: T.white, margin: 0 }}>{r.employeeName ?? r.userName ?? "—"}</p>
                            {r.authorisedByName && <p style={{ fontSize: 10, color: T.muted, margin: 0, display: "flex", alignItems: "center", gap: 3 }}><ShieldCheck size={9} />{r.authorisedByName}</p>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 12, color: T.muted, borderBottom: `1px solid ${T.border}` }}>{r.niNumber ?? "—"}</td>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 13, fontWeight: 700, color: T.mint, borderBottom: `1px solid ${T.border}` }}>£{Number(r.grossPay ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 13, color: "#f87171", borderBottom: `1px solid ${T.border}` }}>£{Number(r.totalDeductions ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 14, fontWeight: 800, color: T.white, borderBottom: `1px solid ${T.border}` }}>£{Number(r.netPay ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${T.border}` }}><PayMethodBadge method={r.paymentMethod ?? "bank_transfer"} /></td>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 11, color: T.muted, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>
                        {r.paidAt ? new Date(r.paidAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${T.border}` }}><StatusBadge status={r.paymentStatus ?? "pending"} /></td>
                      <td style={{ padding: "12px 0", borderBottom: `1px solid ${T.border}` }}>
                        {expandedSavedRow === r.id ? <ChevronUp size={14} style={{ color: T.muted }} /> : <ChevronDown size={14} style={{ color: T.muted }} />}
                      </td>
                    </tr>
                    {/* Expanded row — cheque evidence + details */}
                    {expandedSavedRow === r.id && (
                      <tr key={`${r.id}-expanded`}>
                        <td colSpan={9} style={{ padding: "0 0 16px", borderBottom: `1px solid ${T.border}` }}>
                          <div style={{ background: "rgba(99,91,255,0.06)", border: `1px solid rgba(99,91,255,0.2)`, borderRadius: 10, padding: 16, margin: "8px 0 0" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, fontSize: 12 }}>
                              {[
                                { label: "Tax Code", value: r.taxCode ?? r.notes?.match(/Tax Code: ([^\s|]+)/)?.[1] ?? "—" },
                                { label: "Income Tax", value: `£${Number(r.incomeTax ?? 0).toFixed(2)}` },
                                { label: "National Insurance", value: `£${Number(r.nationalInsurance ?? 0).toFixed(2)}` },
                                { label: "Pension", value: `£${Number(r.pensionContribution ?? 0).toFixed(2)}` },
                                { label: "Other Deductions", value: `£${Number(r.otherDeductions ?? 0).toFixed(2)}` },
                                { label: "Cheque No.", value: r.chequeNumber ?? "—" },
                                { label: "Authorised By", value: r.authorisedByName ?? "—" },
                                { label: "Authorised At", value: r.authorisedAt ? new Date(r.authorisedAt).toLocaleString("en-GB") : "—" },
                              ].map(f => (
                                <div key={f.label}>
                                  <p style={{ fontSize: 10, color: T.muted, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{f.label}</p>
                                  <p style={{ fontSize: 13, color: T.white, margin: 0, fontWeight: 600 }}>{f.value}</p>
                                </div>
                              ))}
                            </div>
                            {r.chequeImageUrl && (
                              <div style={{ marginTop: 12 }}>
                                <p style={{ fontSize: 10, color: T.muted, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 4 }}>
                                  <ImageIcon size={11} />Cheque Evidence
                                </p>
                                <a href={r.chequeImageUrl} target="_blank" rel="noopener noreferrer">
                                  <img src={r.chequeImageUrl} alt="cheque evidence" style={{ maxWidth: 280, maxHeight: 160, objectFit: "contain", borderRadius: 8, border: `1px solid ${T.border}` }} />
                                </a>
                              </div>
                            )}
                            {r.payslipUrl && (
                              <a href={r.payslipUrl} target="_blank" rel="noopener noreferrer"
                                style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, color: T.purple, textDecoration: "none" }}>
                                <FileText size={13} />View Payslip PDF
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
              {records.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: `2px solid rgba(99,91,255,0.3)` }}>
                    <td colSpan={2} style={{ padding: "16px 12px 0 0", fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Totals</td>
                    <td style={{ padding: "16px 12px 0 0", fontSize: 15, fontWeight: 800, color: T.mint }}>£{totalGross.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: "16px 12px 0 0", fontSize: 15, fontWeight: 800, color: "#f87171" }}>£{totalDeductions.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: "16px 0 0", fontSize: 16, fontWeight: 800, color: T.white }}>£{totalNet.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>}

        {/* ── Cheque Register Tab ── */}
        {activeTab === 'cheques' && (
          <div style={{ background: T.card, backdropFilter: "blur(20px)", border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, animation: "fadeUp 0.5s ease both" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: T.white, margin: 0 }}>Cheque Register</h2>
                <p style={{ fontSize: 12, color: T.muted, margin: "4px 0 0" }}>All cheques issued — mark as banked when cleared</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: T.muted }}>Year:</span>
                <select value={chequeYear} onChange={e => setChequeYear(Number(e.target.value))} className="payroll-select" style={{ padding: "6px 12px" }}>
                  {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead>
                  <tr>
                    {["Employee", "Cheque No.", "Amount", "Issued", "Authorised By", "Status", ""].map(h => (
                      <th key={h} style={{ padding: "8px 12px 8px 0", fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "left", borderBottom: `1px solid ${T.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(!chequeData || (chequeData as any[]).length === 0) ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 14 }}>
                      No cheques issued for {chequeYear}
                    </td></tr>
                  ) : (chequeData as any[]).map((c: any) => (
                    <tr key={c.id}>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 13, fontWeight: 600, color: T.white, borderBottom: `1px solid ${T.border}` }}>{c.employeeName ?? "—"}</td>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 12, color: T.muted, borderBottom: `1px solid ${T.border}`, fontFamily: "monospace" }}>{c.chequeNumber ?? "—"}</td>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 13, fontWeight: 700, color: T.mint, borderBottom: `1px solid ${T.border}` }}>£{Number(c.netPay ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 11, color: T.muted, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>
                        {c.paidAt ? new Date(c.paidAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 12, color: T.muted, borderBottom: `1px solid ${T.border}` }}>{c.authorisedByName ?? "—"}</td>
                      <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${T.border}` }}>
                        {c.bankingStatus === 'banked'
                          ? <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "rgba(0,255,194,0.1)", color: T.mint }}>Banked</span>
                          : <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>Pending</span>}
                      </td>
                      <td style={{ padding: "12px 0", borderBottom: `1px solid ${T.border}` }}>
                        {c.bankingStatus !== 'banked' && (
                          <button onClick={() => markChequeBanked.mutate({ id: c.id })}
                            disabled={markChequeBanked.isPending}
                            style={{ fontSize: 11, fontWeight: 600, color: T.mint, background: "rgba(0,255,194,0.1)", border: "1px solid rgba(0,255,194,0.3)", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>
                            Mark Banked
                          </button>
                        )}
                        {c.chequeImageUrl && (
                          <a href={c.chequeImageUrl} target="_blank" rel="noopener noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6, fontSize: 11, color: T.purple, textDecoration: "none" }}>
                            <ImageIcon size={11} />Evidence
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Manual Entry Dialog ── */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent style={{ background: "#0D2240", border: `1px solid ${T.border}`, borderRadius: 20, maxWidth: 520 }}>
            <DialogHeader>
              <DialogTitle style={{ color: T.white, fontSize: 18, fontWeight: 800 }}>Manual Payroll Entry</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(d => createMutation.mutate({ ...d, month, year }))} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
              <div>
                <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Employee Name</Label>
                <Input {...register("employeeName", { required: true })} placeholder="Full name"
                  style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>NI Number</Label>
                  <Input {...register("niNumber")} placeholder="AB123456C"
                    style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                </div>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Tax Code</Label>
                  <Input {...register("taxCode")} placeholder="1257L"
                    style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Gross Pay (£)</Label>
                  <Input {...register("grossPay", { required: true })} type="number" step="0.01"
                    style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                </div>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Income Tax (£)</Label>
                  <Input {...register("incomeTax")} type="number" step="0.01" defaultValue="0"
                    style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                </div>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Net Pay (£)</Label>
                  <Input {...register("netPay", { required: true })} type="number" step="0.01"
                    style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Payment Method</Label>
                  <select {...register("paymentMethod")} defaultValue="bank_transfer" className="payroll-select"
                    style={{ marginTop: 6, width: "100%", height: 44 }}>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Authorised By</Label>
                  <Input {...register("authorisedByName")} defaultValue="Dr Abdul Hamid"
                    style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                </div>
              </div>
              <Button type="submit" disabled={createMutation.isPending}
                style={{ background: `linear-gradient(135deg,${T.purple},#4f46e5)`, color: T.white, border: "none", borderRadius: 12, height: 48, fontWeight: 700, fontSize: 15, marginTop: 4 }}>
                {createMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                Save Payroll Record
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
