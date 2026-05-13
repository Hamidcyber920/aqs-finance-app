import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, BookOpen, Clock, CheckCircle2, Mail,
  ChevronRight, Download, Send, AlertCircle, Users, TrendingDown, BarChart2
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
import { useVoiceContext } from "@/contexts/VoiceContext";

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

  const { setEntityContext } = useVoiceContext();
  useEffect(() => {
    setEntityContext("Viewing Qard Hasan Loans — interest-free Islamic loan applications and repayments");
    return () => setEntityContext(null);
  }, [setEntityContext]);

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
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
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
          <StatCard label="Total Loaned" value={`£${totalLoaned.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={BookOpen} color={T.purple}
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
          return (
        <div style={{ background: T.card, backdropFilter: "blur(20px)", border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, animation: "fadeUp 0.5s ease 200ms both" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: T.white, margin: 0, letterSpacing: "-0.01em" }}>Loan Register — {filterLabel}</h2>
            {tableFilter !== "all" && (
              <button onClick={() => setTableFilter("all")} style={{ fontSize:11,color:T.muted,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:8,padding:"4px 10px",cursor:"pointer" }}>Show All</button>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead>
                <tr>
                  {["Lender / Donor", "Amount", "Term", "Monthly", "Purpose", "Status", "Actions"].map(h => (
                    <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", padding: "0 12px 12px 0", borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLoans.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 14 }}>{tableFilter !== "all" ? "No loans match this filter" : "No loan applications yet"}</td></tr>
                ) : filteredLoans.map((l: any) => {
                  const s = l._summary ?? {};
                  const termMonths = s.termMonths ?? (l.termUnit === "years" ? (l.termValue ?? 6) * 12 : (l.termValue ?? l.termMonths ?? 6));
                  const monthly = (Number(l.amount) / termMonths).toFixed(2);
                  const paidCount = s.paidCount ?? 0;
                  const totalInstalments = s.totalInstalments ?? termMonths;
                  const outstanding = s.outstanding ?? Number(l.amount);
                  const overdueCount = s.overdueCount ?? 0;
                  return (
                    <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => setLocation(`/loans/${l.id}`)}>
                      <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${T.border}` }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: T.white, margin: 0 }}>{l.borrowerName}</p>
                          <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>{l.borrowerEmail}</p>
                          <div style={{ display:"flex",gap:6,marginTop:5,flexWrap:"wrap" }}>
                            <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:999,background:"rgba(0,255,194,0.08)",color:"#6ee7b7" }}>{paidCount}/{totalInstalments} paid</span>
                            {outstanding > 0 && <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:999,background:"rgba(239,68,68,0.08)",color:"#f87171" }}>£{outstanding.toFixed(0)} outstanding</span>}
                            {overdueCount > 0 && <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:999,background:"rgba(239,68,68,0.15)",color:"#fca5a5" }}>⚠ {overdueCount} overdue</span>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 14, fontWeight: 700, color: T.mint, borderBottom: `1px solid ${T.border}` }}>£{Number(l.amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 13, color: T.muted, borderBottom: `1px solid ${T.border}` }}>
                        {l.termValue} {l.termUnit ?? "months"}
                      </td>
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
                })}
              </tbody>
            </table>
          </div>
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
