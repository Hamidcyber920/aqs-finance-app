import { useState, useEffect , useCallback} from "react";
import { useHibbaFormFill } from "@/hooks/useHibbaFormFill";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, BookOpen, Clock, CheckCircle2, Mail,
  ChevronRight, Download, Send, AlertCircle, Users, TrendingDown, BarChart2, FileText
} from "lucide-react";
import { SmartUpload } from "@/components/SmartUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const T = {
  navy: "#0A192F", navyLight: "#112240", purple: "#635BFF",
  mint: "#00FFC2", white: "#FFFFFF",
  muted: "rgba(255,255,255,0.5)", border: "rgba(255,255,255,0.08)",
  glass: "rgba(255,255,255,0.04)", card: "rgba(13,34,64,0.8)",
};

const loanSchema = z.object({
  applicantName: z.string().min(2),
  applicantEmail: z.string().email(),
  amount: z.string().min(1),
  termValue: z.coerce.number().min(1),
  termUnit: z.enum(["months", "years"]),
  purpose: z.string().min(2),
  termNotes: z.string().optional(),
});
type LoanForm = z.infer<typeof loanSchema>;

function Badge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    approved: { bg: "rgba(0,255,194,0.1)", color: T.mint },
    pending: { bg: "rgba(251,191,36,0.1)", color: "#fbbf24" },
    rejected: { bg: "rgba(255,80,80,0.1)", color: "#ff5050" },
    active: { bg: "rgba(99,91,255,0.15)", color: "#a78bfa" },
    repaid: { bg: "rgba(0,255,194,0.08)", color: "#6ee7b7" },
  };
  const s = map[status?.toLowerCase()] ?? { bg: T.glass, color: T.muted };
  return (
    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, textTransform: "capitalize" }}>
      {status}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color, onClick, active }: any) {
  return (
    <div onClick={onClick} style={{ background: T.card, backdropFilter: "blur(20px)", border: `1px solid ${active ? color : T.border}`, borderRadius: 16, padding: "20px 24px", display: "flex", alignItems: "center", gap: 16, cursor: onClick ? "pointer" : "default", transition: "border-color 0.2s", boxShadow: active ? `0 0 0 2px ${color}33` : "none" }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}22`, border: `1px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p style={{ fontSize: 24, fontWeight: 800, color: T.white, margin: 0, letterSpacing: "-0.03em" }}>{value}</p>
        <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>{label}</p>
      </div>
    </div>
  );
}

const PURPOSES = ["Rimmers Purchase", "Refurbishment", "Equipment", "Events", "Emergency", "Other"];

export default function LoansPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = ["superadmin", "trustee", "manager"].includes(user?.role ?? "");
  const [open, setOpen] = useState(false);
  const [termUnit, setTermUnit] = useState<"months" | "years">("months");
  const [forecastDrilldown, setForecastDrilldown] = useState<{ label: string; donors: { name: string; email: string; amount: number; dueDate: Date }[] } | null>(null);
  const [tableFilter, setTableFilter] = useState<"all" | "active" | "pending" | "donors">("all");
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split("T")[0]; });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
  }, []);

  const { data, refetch } = trpc.loans.listWithSummary.useQuery({});

  const createMutation = trpc.loans.create.useMutation({
    onSuccess: () => { toast.success("Loan application submitted"); setOpen(false); refetch(); reset(); },
    onError: (e) => toast.error(e.message),
  });

  const approveMutation = trpc.loans.approveAdmin.useMutation({
    onSuccess: () => { toast.success("Loan approved"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const monthlyReportMutation = trpc.loans.triggerMonthlyReport.useMutation({
    onSuccess: () => toast.success("Monthly trustee report sent successfully"),
    onError: (e) => toast.error(`Failed to send report: ${e.message}`),
  });

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<any>({
    resolver: zodResolver(loanSchema),
    defaultValues: { termUnit: "months", termValue: 6 },
  });
  // Listen for Hibba voice form-fill commands
  useHibbaFormFill("/loans", useCallback((fields: Record<string, any>) => {
    // Auto-open the dialog first
    setOpen(true);
    // Fill fields after a short delay to let the dialog mount
    setTimeout(() => {
      if (fields.applicantName || fields.name) setValue("applicantName", fields.applicantName || fields.name);
      if (fields.applicantEmail || fields.email) setValue("applicantEmail", fields.applicantEmail || fields.email);
      if (fields.applicantPhone || fields.phone) setValue("applicantPhone", fields.applicantPhone || fields.phone);
      if (fields.applicantAddress || fields.address) setValue("applicantAddress", fields.applicantAddress || fields.address);
      if (fields.amount) setValue("amount", String(fields.amount));
      if (fields.purpose) setValue("purpose", fields.purpose);
      if (fields.guarantorName || fields.guarantor) setValue("guarantorName", fields.guarantorName || fields.guarantor);
      if (fields.notes) setValue("notes", fields.notes);
      if (fields.termValue || fields.term) setValue("termValue", String(fields.termValue || fields.term));
      toast.success("Hibba filled the form — please review");
    }, 300);
  }, [setValue, setOpen]));


  const watchAmount = watch("amount");
  const watchTermValue = watch("termValue");
  const monthlyPayment = watchAmount && watchTermValue
    ? (Number(watchAmount) / (termUnit === "years" ? watchTermValue * 12 : watchTermValue)).toFixed(2)
    : "0.00";

  const loans: any[] = Array.isArray(data) ? data : [];
  const totalLoaned = loans.reduce((s: number, l: any) => s + Number(l.amount ?? 0), 0);
  const activeLoans = loans.filter((l: any) => l.status === "active" || l.status === "approved").length;
  const pendingLoans = loans.filter((l: any) => l.status === "pending").length;

  // Total outstanding across all active loans
  const totalOutstanding = loans.reduce((s: number, l: any) => {
    const outstanding = l._summary?.outstanding ?? Math.max(0, Number(l.amount ?? 0) - Number(l.totalRepaid ?? 0));
    return s + outstanding;
  }, 0);

  // Unique donor count (unique borrowerName or borrowerEmail)
  const donorCount = new Set(loans.map((l: any) => l.borrowerEmail || l.borrowerName)).size;

  // Repayment forecast buckets: for each active loan, distribute remaining repayments across months
  const now = new Date();
  const forecastBuckets = {
    "4 weeks": 0,
    "2 months": 0,
    "3 months": 0,
    "6 months": 0,
    "12 months": 0,
    "15 months": 0,
    "2 years": 0,
    "5 years": 0,
  };
  const bucketMonths: [string, number][] = [
    ["4 weeks", 1],
    ["2 months", 2],
    ["3 months", 3],
    ["6 months", 6],
    ["12 months", 12],
    ["15 months", 15],
    ["2 years", 24],
    ["5 years", 60],
  ];
  loans.forEach((l: any) => {
    if (l.status !== "active" && l.status !== "approved") return;
    const s = l._summary ?? {};
    const outstanding = s.outstanding ?? Math.max(0, Number(l.amount ?? 0) - Number(l.totalRepaid ?? 0));
    if (outstanding <= 0) return;
    const termMonths = s.termMonths ?? (l.termUnit === "years" ? (l.termValue ?? 6) * 12 : (l.termValue ?? l.termMonths ?? 6));
    const monthly = Number(l.amount ?? 0) / termMonths;
    const startDate = l.startDate ? new Date(l.startDate) : new Date(l.createdAt ?? now);
    // Distribute future monthly payments into buckets
    for (let m = 1; m <= termMonths; m++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + m);
      if (dueDate <= now) continue; // already passed
      const monthsFromNow = (dueDate.getFullYear() - now.getFullYear()) * 12 + (dueDate.getMonth() - now.getMonth());
      // Add to the smallest bucket that covers this month
      for (const [label, maxMonths] of bucketMonths) {
        if (monthsFromNow <= maxMonths) {
          (forecastBuckets as any)[label] += monthly;
          break;
        }
      }
    }
  });
  // Make buckets cumulative (each bucket = total due within that period from now)
  const cumulativeForecast: [string, number][] = [];
  let runningTotal = 0;
  for (const [label] of bucketMonths) {
    runningTotal += (forecastBuckets as any)[label];
    cumulativeForecast.push([label, runningTotal]);
  }

  // Per-bucket donor breakdown for drill-down modal
  // donorBuckets[label] = array of { name, email, amount (cumulative within period), dueDate (earliest in period) }
  const donorBuckets: Record<string, { name: string; email: string; loanId: number; amount: number; dueDate: Date }[]> = {};
  for (const [label] of bucketMonths) donorBuckets[label] = [];
  loans.forEach((l: any) => {
    if (l.status !== "active" && l.status !== "approved") return;
    const s = l._summary ?? {};
    const outstanding = s.outstanding ?? Math.max(0, Number(l.amount ?? 0) - Number(l.totalRepaid ?? 0));
    if (outstanding <= 0) return;
    const termMonths = s.termMonths ?? (l.termUnit === "years" ? (l.termValue ?? 6) * 12 : (l.termValue ?? l.termMonths ?? 6));
    const monthly = Number(l.amount ?? 0) / termMonths;
    const startDate = l.startDate ? new Date(l.startDate) : new Date(l.createdAt ?? now);
    const perBucketAmt: Record<string, { amount: number; earliest: Date | null }> = {};
    for (const [label] of bucketMonths) perBucketAmt[label] = { amount: 0, earliest: null };
    for (let m = 1; m <= termMonths; m++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + m);
      if (dueDate <= now) continue;
      const monthsFromNow = (dueDate.getFullYear() - now.getFullYear()) * 12 + (dueDate.getMonth() - now.getMonth());
      for (const [label, maxMonths] of bucketMonths) {
        if (monthsFromNow <= maxMonths) {
          perBucketAmt[label].amount += monthly;
          if (!perBucketAmt[label].earliest || dueDate < perBucketAmt[label].earliest!) perBucketAmt[label].earliest = dueDate;
          break;
        }
      }
    }
    for (const [label] of bucketMonths) {
      if (perBucketAmt[label].amount > 0) {
        donorBuckets[label].push({ name: l.borrowerName ?? "Unknown", email: l.borrowerEmail ?? "", loanId: l.id, amount: perBucketAmt[label].amount, dueDate: perBucketAmt[label].earliest! });
      }
    }
  });
  // For cumulative drill-down: each period shows all donors due UP TO that period
  const cumulativeDonorBuckets: Record<string, { name: string; email: string; loanId: number; amount: number; dueDate: Date }[]> = {};
  for (let i = 0; i < bucketMonths.length; i++) {
    const [label] = bucketMonths[i];
    const seen = new Map<number, { name: string; email: string; loanId: number; amount: number; dueDate: Date }>();
    for (let j = 0; j <= i; j++) {
      const [bl] = bucketMonths[j];
      for (const d of donorBuckets[bl]) {
        const existing = seen.get(d.loanId);
        if (existing) { existing.amount += d.amount; if (d.dueDate < existing.dueDate) existing.dueDate = d.dueDate; }
        else seen.set(d.loanId, { ...d });
      }
    }
    cumulativeDonorBuckets[label] = Array.from(seen.values()).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`, padding: 24, fontFamily: "'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12, animation: "fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize: "clamp(22px,3vw,30px)", fontWeight: 800, color: T.white, margin: 0, letterSpacing: "-0.03em" }}>
              Qarde Hasan <span style={{ color: T.mint }}>Loans</span>
            </h1>
            <p style={{ fontSize: 13, color: T.muted, margin: "4px 0 0" }}>Interest-free loans — Amanah of the community</p>
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
            {/* Date range + CSV/PDF export */}
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.glass,color:T.white,padding:"0 8px",fontSize:11}} />
            <span style={{color:T.muted,fontSize:11}}>to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.glass,color:T.white,padding:"0 8px",fontSize:11}} />
            <button onClick={() => {
              const filtered = loans.filter((l: any) => { const d = new Date(l.createdAt); return d >= new Date(dateFrom) && d <= new Date(dateTo + "T23:59:59"); });
              if (!filtered.length) { toast.info("No loans in selected range"); return; }
              const rows = filtered.map((l: any) => `${new Date(l.createdAt).toLocaleDateString()},${l.borrowerName},${l.borrowerEmail || ""},\u00a3${Number(l.amount).toFixed(2)},${l.status},${l.purpose || ""}`);
              const csv = "Date,Borrower,Email,Amount,Status,Purpose\n" + rows.join("\n");
              const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = `loans_${dateFrom}_to_${dateTo}.csv`; a.click(); URL.revokeObjectURL(url);
            }} style={{height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.glass,color:T.white,padding:"0 10px",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              <Download size={12} /> CSV
            </button>
            <button onClick={() => {
              const filtered = loans.filter((l: any) => { const d = new Date(l.createdAt); return d >= new Date(dateFrom) && d <= new Date(dateTo + "T23:59:59"); });
              if (!filtered.length) { toast.info("No loans in selected range"); return; }
              // Summary stats (same as dashboard)
              const totalBorrowed = filtered.reduce((s: number, l: any) => s + Number(l.amount ?? 0), 0);
              const filteredActive = filtered.filter((l: any) => l.status === "active" || l.status === "approved").length;
              const filteredOutstanding = filtered.reduce((s: number, l: any) => {
                const out = l._summary?.outstanding ?? Math.max(0, Number(l.amount ?? 0) - Number(l.totalRepaid ?? 0));
                return s + out;
              }, 0);
              const filteredDonors = new Set(filtered.map((l: any) => l.borrowerEmail || l.borrowerName)).size;
              const filteredPending = filtered.filter((l: any) => l.status === "pending" || l.status === "pending_review").length;
              const generatedDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
              let html = `<html><head><title>Qarde Hasan Loans Report ${dateFrom} to ${dateTo}</title><style>
                @page { margin: 20mm; }
                body { font-family: Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 0; }
                .letterhead { background: #5C1A1A; color: #fff; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; }
                .letterhead-title { font-size: 22px; font-weight: 800; margin: 0; }
                .letterhead-sub { color: #c9a84c; font-size: 13px; margin: 4px 0 0; }
                .letterhead-meta { text-align: right; font-size: 11px; color: #e5c9a0; }
                .report-info { padding: 16px 32px 8px; border-bottom: 2px solid #5C1A1A; }
                .report-info h2 { margin: 0 0 4px; font-size: 16px; color: #5C1A1A; }
                .report-info p { margin: 0; font-size: 12px; color: #555; }
                .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; padding: 16px 32px; }
                .stat-box { background: #f8f8f8; border-radius: 8px; padding: 12px 14px; border-left: 4px solid #5C1A1A; }
                .stat-box.green { border-left-color: #16a34a; }
                .stat-box.red { border-left-color: #dc2626; }
                .stat-box.purple { border-left-color: #7c3aed; }
                .stat-box.amber { border-left-color: #d97706; }
                .stat-label { font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 4px; }
                .stat-value { font-size: 16px; font-weight: 800; margin: 0; color: #1a1a1a; }
                table { width: calc(100% - 64px); margin: 0 32px 20px; border-collapse: collapse; font-size: 11px; }
                th { background: #5C1A1A; color: #fff; padding: 8px 10px; text-align: left; font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; }
                td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
                tr:nth-child(even) td { background: #fafafa; }
                .status-approved { color: #16a34a; font-weight: 700; }
                .status-pending { color: #d97706; font-weight: 700; }
                .status-completed { color: #2563eb; font-weight: 700; }
                .status-draft { color: #6b7280; }
                .status-rejected { color: #dc2626; }
                .footer { background: #f5f5f5; padding: 12px 32px; text-align: center; font-size: 10px; color: #888; border-top: 1px solid #e5e7eb; margin-top: 20px; }
                .hadith { padding: 12px 32px; font-style: italic; font-size: 11px; color: #5C1A1A; border-left: 3px solid #c9a84c; margin: 0 32px 16px; background: #fffbf0; }
              </style></head><body>`;
              html += `<div class="letterhead">`;
              html += `<div><p class="letterhead-title">Abdullah Quilliam Society</p><p class="letterhead-sub">Qarde Hasan Amanah — Finance Report</p></div>`;
              html += `<div class="letterhead-meta">Generated: ${generatedDate}<br>Registered Charity No. 1169382<br>receiptapp-excmtodu.manus.space</div>`;
              html += `</div>`;
              html += `<div class="report-info"><h2>Qarde Hasan Loans Report</h2><p>Period: ${dateFrom} to ${dateTo}</p></div>`;
              html += `<div class="stats-grid">`;
              html += `<div class="stat-box"><p class="stat-label">Total Borrowed</p><p class="stat-value">\u00a3${totalBorrowed.toLocaleString("en-GB", {minimumFractionDigits:2,maximumFractionDigits:2})}</p></div>`;
              html += `<div class="stat-box red"><p class="stat-label">Total Outstanding</p><p class="stat-value">\u00a3${filteredOutstanding.toLocaleString("en-GB", {minimumFractionDigits:2,maximumFractionDigits:2})}</p></div>`;
              html += `<div class="stat-box green"><p class="stat-label">Active Loans</p><p class="stat-value">${filteredActive}</p></div>`;
              html += `<div class="stat-box purple"><p class="stat-label">No. of Donors</p><p class="stat-value">${filteredDonors}</p></div>`;
              html += `<div class="stat-box amber"><p class="stat-label">Pending Review</p><p class="stat-value">${filteredPending}</p></div>`;
              html += `</div>`;
              html += `<div class="hadith">The Prophet (PBUH) said: \u201cWhoever builds a mosque for Allah, Allah will build for him a house in Jannah.\u201d</div>`;
              html += `<table><tr><th>Date</th><th>Borrower</th><th>Email</th><th>Amount</th><th>Status</th><th>Purpose</th></tr>`;
              filtered.forEach((l: any) => {
                const statusClass = `status-${l.status}`;
                html += `<tr><td>${new Date(l.createdAt).toLocaleDateString("en-GB")}</td><td>${l.borrowerName}</td><td style="font-size:10px">${l.borrowerEmail || ""}</td><td>\u00a3${Number(l.amount).toFixed(2)}</td><td class="${statusClass}">${l.status}</td><td>${l.purpose || ""}</td></tr>`;
              });
              html += `</table>`;
              html += `<div class="footer">JazakAllahu Khayran \u2014 Abdullah Quilliam Society \u2014 Qarde Hasan Amanah Finance System</div>`;
              html += `</body></html>`;
              const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); w.print(); }
            }} style={{height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.glass,color:T.white,padding:"0 10px",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              <FileText size={12} /> PDF
            </button>
            {isAdmin&&(
              <Button onClick={() => monthlyReportMutation.mutate()}
                disabled={monthlyReportMutation.isPending}
                style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, padding: "10px 16px", fontWeight: 700, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <Mail size={15} /> {monthlyReportMutation.isPending ? "Sending…" : "Send Monthly Report"}
              </Button>
            )}
            <SmartUpload
              moduleType="loan_application"
              buttonLabel="Scan / Upload"
              buttonVariant="outline"
              onConfirm={(result) => {
                const d = result.extractedData as any;
                setOpen(true);
                setTimeout(() => {
                  if (d.applicantName) setValue("applicantName", d.applicantName);
                  if (d.amountRequested) setValue("amount", String(d.amountRequested));
                  if (d.purpose) setValue("purpose", d.purpose);
                  if (d.guarantorName) setValue("guarantorName", d.guarantorName);
                  if (d.notes) setValue("notes", d.notes);
                }, 200);
              }}
            />
            <Button onClick={() => setOpen(true)}
              style={{ background: `linear-gradient(135deg,${T.purple},#4f46e5)`, color: T.white, border: "none", borderRadius: 12, padding: "10px 20px", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <Plus size={16} /> New Application
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginBottom: 20 }}>
          <StatCard label="Total Borrowed" value={`£${totalLoaned.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={BookOpen} color={T.purple}
            onClick={() => setTableFilter(f => f === "all" ? "all" : "all")} active={tableFilter === "all"} />
          <StatCard label="Total Outstanding" value={`£${totalOutstanding.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingDown} color="#f87171"
            onClick={() => setTableFilter(f => f === "all" ? "all" : "all")} active={false} />
          <StatCard label="Active Loans" value={activeLoans} icon={CheckCircle2} color={T.mint}
            onClick={() => setTableFilter(f => f === "active" ? "all" : "active")} active={tableFilter === "active"} />
          <StatCard label="Number of Donors" value={donorCount} icon={Users} color="#a78bfa"
            onClick={() => setTableFilter(f => f === "donors" ? "all" : "donors")} active={tableFilter === "donors"} />
          <StatCard label="Pending Review" value={pendingLoans} icon={Clock} color="#fbbf24"
            onClick={() => setTableFilter(f => f === "pending" ? "all" : "pending")} active={tableFilter === "pending"} />
        </div>

        {/* Repayment Forecast */}
        <div style={{ background: T.card, backdropFilter: "blur(20px)", border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, marginBottom: 20, animation: "fadeUp 0.45s ease 100ms both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <BarChart2 size={16} style={{ color: T.mint }} />
            <h2 style={{ fontSize: 14, fontWeight: 700, color: T.white, margin: 0 }}>Repayment Forecast</h2>
            <span style={{ fontSize: 11, color: T.muted, marginLeft: 4 }}>Cumulative amount due back to Donors / Lenders within each period</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
              <thead>
                <tr>
                  {["Period", "Due by", "Cumulative Amount", "% of Outstanding"].map(h => (
                    <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", padding: "0 16px 10px 0", borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cumulativeForecast.map(([label, amount], i) => {
                  const pct = totalOutstanding > 0 ? (amount / totalOutstanding) * 100 : 0;
                  const dueDate = new Date(now);
                  const months = bucketMonths[i]?.[1] ?? 1;
                  dueDate.setMonth(dueDate.getMonth() + months);
                  const isHighlight = label === "12 months" || label === "6 months";
                  return (
                    <tr key={label} style={{ cursor: "pointer" }}
                      onClick={() => setForecastDrilldown({ label, donors: cumulativeDonorBuckets[label] ?? [] })}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ padding: "10px 16px 10px 0", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: isHighlight ? 700 : 500, color: isHighlight ? T.white : T.muted }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{label} <span style={{ fontSize: 9, color: T.mint, opacity: 0.7 }}>▶ details</span></span>
                      </td>
                      <td style={{ padding: "10px 16px 10px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12, color: T.muted }}>{dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td style={{ padding: "10px 16px 10px 0", borderBottom: `1px solid ${T.border}`, fontSize: 14, fontWeight: 700, color: amount > 0 ? T.mint : T.muted }}>
                        £{amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", maxWidth: 120 }}>
                            <div style={{ height: "100%", borderRadius: 3, background: `linear-gradient(90deg,${T.mint},#00DDB0)`, width: `${Math.min(100, pct)}%`, transition: "width 0.4s ease" }} />
                          </div>
                          <span style={{ fontSize: 11, color: T.muted, minWidth: 36 }}>{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {cumulativeForecast.every(([, v]) => v === 0) && (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: "24px 0", color: T.muted, fontSize: 13 }}>No active loans with outstanding balances</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Forecast Drill-down Modal */}
        {forecastDrilldown && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
            onClick={() => setForecastDrilldown(null)}>
            <div style={{ background: "#0D2240", border: `1px solid ${T.border}`, borderRadius: 20, padding: 28, maxWidth: 560, width: "100%", maxHeight: "80vh", overflowY: "auto" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: T.white, margin: 0 }}>Due within {forecastDrilldown.label}</h3>
                  <p style={{ fontSize: 12, color: T.muted, margin: "4px 0 0" }}>Donors / Lenders with repayments due in this period</p>
                </div>
                <button onClick={() => setForecastDrilldown(null)}
                  style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, color: T.muted, cursor: "pointer", padding: "6px 12px", fontSize: 13 }}>✕ Close</button>
              </div>
              {forecastDrilldown.donors.length === 0 ? (
                <p style={{ color: T.muted, textAlign: "center", padding: "24px 0", fontSize: 13 }}>No repayments due in this period</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Donor / Lender", "Amount Due", "Next Due Date"].map(h => (
                        <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 12px 10px 0", borderBottom: `1px solid ${T.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {forecastDrilldown.donors.map((d, idx) => (
                      <tr key={idx} style={{ cursor: "pointer" }} onClick={() => { setForecastDrilldown(null); setLocation(`/loans/${(d as any).loanId}`); }}>
                        <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${T.border}` }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: T.white, margin: 0 }}>{d.name}</p>
                          <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>{d.email}</p>
                        </td>
                        <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${T.border}`, fontSize: 14, fontWeight: 700, color: T.mint }}>
                          £{d.amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12, color: T.muted }}>
                          {d.dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ padding: "12px 0 0", fontSize: 12, color: T.muted, fontWeight: 600 }}>Total</td>
                      <td style={{ padding: "12px 0 0", fontSize: 14, fontWeight: 800, color: T.mint }}>
                        £{forecastDrilldown.donors.reduce((s, d) => s + d.amount, 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Loans table */}
        {(() => {
          const filteredLoans = tableFilter === "active"
            ? loans.filter((l: any) => l.status === "active" || l.status === "approved")
            : tableFilter === "pending"
            ? loans.filter((l: any) => l.status === "pending")
            : tableFilter === "donors"
            ? Array.from(new Map(loans.map((l: any) => [l.borrowerEmail || l.borrowerName, l])).values())
            : loans;
          const filterLabel = tableFilter === "active" ? "Active Loans" : tableFilter === "pending" ? "Pending Review" : tableFilter === "donors" ? "Donors" : "All Loans";

          const isRepaidInFull = (l: any) => (l._summary?.outstanding ?? Number(l.amount)) <= 0;
          const activeList = filteredLoans.filter((l: any) => !isRepaidInFull(l));
          const pastList = filteredLoans.filter((l: any) => isRepaidInFull(l));

          const renderRow = (l: any) => {
            const s = l._summary ?? {};
            const termMonths = s.termMonths ?? (l.termUnit === "years" ? (l.termValue ?? 6) * 12 : (l.termValue ?? l.termMonths ?? 6));
            const monthly = (Number(l.amount) / termMonths).toFixed(2);
            const paidCount = s.paidCount ?? 0;
            const totalInstalments = s.totalInstalments ?? termMonths;
            const outstanding = s.outstanding ?? Number(l.amount);
            const overdueCount = s.overdueCount ?? 0;
            const repaidFull = outstanding <= 0;
            return (
              <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => setLocation(`/loans/${l.id}`)}>      
                <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${T.border}` }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: T.white, margin: 0 }}>{l.borrowerName}</p>
                    <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>{l.borrowerEmail}</p>
                    <div style={{ display:"flex",gap:6,marginTop:5,flexWrap:"wrap" }}>
                      <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:999,background:"rgba(0,255,194,0.08)",color:"#6ee7b7" }}>{paidCount}/{totalInstalments} paid</span>
                      {repaidFull
                        ? <span style={{ fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:999,background:"rgba(239,68,68,0.12)",color:"#f87171",border:"1px solid rgba(239,68,68,0.3)" }}>✓ Repaid in Full</span>
                        : <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:999,background:"rgba(239,68,68,0.08)",color:"#f87171" }}>£{outstanding.toFixed(0)} outstanding</span>
                      }
                      {overdueCount > 0 && <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:999,background:"rgba(239,68,68,0.15)",color:"#fca5a5" }}>⚠ {overdueCount} overdue</span>}
                    </div>
                  </div>
                </td>
                <td style={{ padding: "12px 12px 12px 0", fontSize: 14, fontWeight: 700, color: T.mint, borderBottom: `1px solid ${T.border}` }}>£{Number(l.amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{ padding: "12px 12px 12px 0", fontSize: 13, color: T.muted, borderBottom: `1px solid ${T.border}` }}>{l.termValue} {l.termUnit ?? "months"}</td>
                <td style={{ padding: "12px 12px 12px 0", fontSize: 13, color: T.purple, fontWeight: 600, borderBottom: `1px solid ${T.border}` }}>£{monthly}/mo</td>
                <td style={{ padding: "12px 12px 12px 0", fontSize: 12, color: T.muted, borderBottom: `1px solid ${T.border}` }}>{l.purpose}</td>
                <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${T.border}` }}><Badge status={l.status} /></td>
                <td style={{ padding: "12px 0", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    {isAdmin && l.status === "pending" && (
                      <button onClick={(e) => { e.stopPropagation(); approveMutation.mutate({ id: l.id }); }}
                        style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(0,255,194,0.1)", border: "1px solid rgba(0,255,194,0.2)", color: T.mint, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                        Approve
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setLocation(`/loans/${l.id}`); }}
                      style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(99,91,255,0.1)", border: "1px solid rgba(99,91,255,0.2)", color: T.purple, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                      View
                    </button>
                  </div>
                </td>
              </tr>
            );
          };

          const tableHeaders = ["Lender / Donor", "Amount", "Term", "Monthly", "Purpose", "Status", "Actions"];

          return (
        <div style={{ background: T.card, backdropFilter: "blur(20px)", border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, animation: "fadeUp 0.5s ease 200ms both" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: T.white, margin: 0, letterSpacing: "-0.01em" }}>Loan Register — {filterLabel}</h2>
            {tableFilter !== "all" && (
              <button onClick={() => setTableFilter("all")} style={{ fontSize:11,color:T.muted,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:8,padding:"4px 10px",cursor:"pointer" }}>Show All</button>
            )}
          </div>
          {filteredLoans.length === 0 ? (
            <p style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 14 }}>{tableFilter !== "all" ? "No loans match this filter" : "No loan applications yet"}</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              {/* Active / Outstanding section */}
              {activeList.length > 0 && (
                <>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Active — {activeList.length} loan{activeList.length !== 1 ? "s" : ""}</p>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600, marginBottom: 24 }}>
                    <thead><tr>{tableHeaders.map(h => <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", padding: "0 12px 12px 0", borderBottom: `1px solid ${T.border}` }}>{h}</th>)}</tr></thead>
                    <tbody>{activeList.map(renderRow)}</tbody>
                  </table>
                </>
              )}
              {/* Past / Repaid section */}
              {pastList.length > 0 && (
                <>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Past / Repaid — {pastList.length} loan{pastList.length !== 1 ? "s" : ""}</p>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                    <thead><tr>{tableHeaders.map(h => <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", padding: "0 12px 12px 0", borderBottom: `1px solid ${T.border}` }}>{h}</th>)}</tr></thead>
                    <tbody>{pastList.map(renderRow)}</tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </div>
          );
        })()}

        {/* New loan dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent style={{ background: "#0D2240", border: `1px solid ${T.border}`, borderRadius: 20, maxWidth: 520 }}>
            <DialogHeader>
              <DialogTitle style={{ color: T.white, fontSize: 18, fontWeight: 800 }}>New Loan Application</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit((d: any) => createMutation.mutate({ ...d, termUnit }))} style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Lender / Donor Name *</Label>
                  <Input {...register("applicantName", { required: true })} placeholder="Full name"
                    style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                </div>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Email</Label>
                  <Input {...register("applicantEmail")} type="email" placeholder="email@example.com"
                    style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Phone Number *</Label>
                  <Input {...register("applicantPhone", { required: true })} type="tel" placeholder="+44 7700 000000"
                    style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                </div>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Address (optional)</Label>
                  <Input {...register("applicantAddress")} placeholder="Street, City"
                    style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Amount (£)</Label>
                  <Input {...register("amount")} type="number" placeholder="0.00"
                    style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                </div>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Purpose</Label>
                  <select {...register("purpose")}
                    style={{ marginTop: 6, width: "100%", background: "#0D2240", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44, padding: "0 12px", fontSize: 14 }}>
                    {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {/* Term */}
              <div>
                <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Repayment Term</Label>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <Input {...register("termValue")} type="number" placeholder="6"
                    style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                  <div style={{ display: "flex", borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                    {(["months", "years"] as const).map(u => (
                      <button key={u} type="button" onClick={() => setTermUnit(u)}
                        style={{ padding: "0 16px", height: 44, background: termUnit === u ? T.purple : "rgba(255,255,255,0.06)", color: termUnit === u ? T.white : T.muted, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, transition: "all 0.2s" }}>
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
                {watchAmount && watchTermValue && (
                  <p style={{ fontSize: 12, color: T.mint, marginTop: 6 }}>
                    Monthly repayment: <strong>£{monthlyPayment}</strong>
                  </p>
                )}
              </div>

              <div>
                <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Notes (optional)</Label>
                <textarea {...register("termNotes")} rows={2} placeholder="Additional context..."
                  style={{ marginTop: 6, width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, padding: "10px 14px", fontSize: 14, resize: "vertical", boxSizing: "border-box" }} />
              </div>

              <Button type="submit" disabled={createMutation.isPending}
                style={{ background: `linear-gradient(135deg,${T.mint},#00DDB0)`, color: "#081526", fontWeight: 700, height: 48, borderRadius: 12, border: "none", fontSize: 15, marginTop: 4 }}>
                {createMutation.isPending ? "Submitting…" : "Submit Application"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

      </div>
    </>
  );
}
