import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Users, AlertCircle,
  CheckCircle2, Clock, ArrowUpRight, ArrowDownRight, RefreshCw,
  Receipt, CreditCard, HandHeart, BookOpen, Wallet
} from "lucide-react";

/* ── Brand tokens ── */
const T = {
  navy: "#0A192F",
  navyLight: "#112240",
  purple: "#635BFF",
  mint: "#00FFC2",
  white: "#FFFFFF",
  muted: "rgba(255,255,255,0.5)",
  border: "rgba(255,255,255,0.08)",
  glass: "rgba(255,255,255,0.04)",
  card: "rgba(13,34,64,0.8)",
};

/* ── Glassmorphism stat card ── */
function StatCard({
  label, value, sub, icon: Icon, trend, color = T.purple, delay = 0
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; trend?: "up" | "down" | "neutral";
  color?: string; delay?: number;
}) {
  return (
    <div style={{
      background: T.card,
      backdropFilter: "blur(20px)",
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
      boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      animation: `fadeUp 0.5s ease ${delay}ms both`,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: `${color}22`,
          border: `1px solid ${color}44`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={18} style={{ color }} />
        </div>
        {trend && trend !== "neutral" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: 999,
            background: trend === "up" ? "rgba(0,255,194,0.1)" : "rgba(255,80,80,0.1)",
            border: `1px solid ${trend === "up" ? "rgba(0,255,194,0.2)" : "rgba(255,80,80,0.2)"}`,
          }}>
            {trend === "up"
              ? <ArrowUpRight size={12} style={{ color: T.mint }} />
              : <ArrowDownRight size={12} style={{ color: "#ff5050" }} />}
            <span style={{ fontSize: 11, fontWeight: 600, color: trend === "up" ? T.mint : "#ff5050" }}>
              {trend === "up" ? "↑" : "↓"}
            </span>
          </div>
        )}
      </div>
      <div>
        <p style={{ fontSize: 28, fontWeight: 800, color: T.white, letterSpacing: "-0.03em", margin: 0, lineHeight: 1 }}>
          {value}
        </p>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 4, fontWeight: 400 }}>{label}</p>
        {sub && <p style={{ fontSize: 11, color: `${T.mint}99`, marginTop: 2 }}>{sub}</p>}
      </div>
    </div>
  );
}

/* ── Section header ── */
function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: T.white, margin: 0, letterSpacing: "-0.01em" }}>{title}</h2>
      {sub && <p style={{ fontSize: 12, color: T.muted, margin: "3px 0 0" }}>{sub}</p>}
    </div>
  );
}

/* ── Status badge ── */
function Badge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    approved: { bg: "rgba(0,255,194,0.1)", color: T.mint },
    pending: { bg: "rgba(251,191,36,0.1)", color: "#fbbf24" },
    rejected: { bg: "rgba(255,80,80,0.1)", color: "#ff5050" },
    paid: { bg: "rgba(0,255,194,0.1)", color: T.mint },
    active: { bg: "rgba(99,91,255,0.15)", color: "#a78bfa" },
  };
  const s = map[status?.toLowerCase()] ?? { bg: T.glass, color: T.muted };
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color, textTransform: "capitalize",
    }}>{status}</span>
  );
}

/* ── Custom tooltip for charts ── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0D2240", border: `1px solid ${T.border}`,
      borderRadius: 10, padding: "10px 14px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    }}>
      <p style={{ fontSize: 12, color: T.muted, margin: "0 0 6px" }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ fontSize: 13, fontWeight: 700, color: p.color, margin: "2px 0" }}>
          £{Number(p.value).toLocaleString()} <span style={{ fontWeight: 400, color: T.muted }}>{p.name}</span>
        </p>
      ))}
    </div>
  );
}

/* ── Main Dashboard ── */
export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role;
  const isAdmin = ["superadmin", "trustee", "manager"].includes(role ?? "");
  const [userFilter, setUserFilter] = useState<number | "all">("all");

  /* tRPC queries */
  const { data: receipts } = trpc.receipts.list.useQuery({ limit: 5 });
  const { data: loans } = trpc.loans.list.useQuery({});
  const { data: allExpenses } = trpc.receipts.adminList.useQuery(
    { userId: userFilter === "all" ? undefined : userFilter, limit: 50 },
    { enabled: isAdmin }
  );
  const { data: users } = trpc.users.list.useQuery({}, { enabled: isAdmin });
  const { data: complianceActions = [] } = (trpc as any).compliance.listActions.useQuery(undefined, { enabled: isAdmin });
  const { data: trainingData = [] } = (trpc as any).compliance.listTraining.useQuery(undefined, { enabled: isAdmin });
  const { data: policies = [] } = (trpc as any).compliance.listPolicies.useQuery(undefined, { enabled: isAdmin });

  // Compliance heat map stats
  const criticalItems = (complianceActions as any[]).filter((a: any) => a.priority === 'critical' && a.status !== 'completed').length;
  const overdueItems = (complianceActions as any[]).filter((a: any) => a.status === 'overdue' || (a.dueDate && new Date(a.dueDate) < new Date() && a.status !== 'completed')).length;
  const expiredTraining = (trainingData as any[]).filter((t: any) => t.computedStatus === 'expired' || t.computedStatus === 'expiring_soon').length;
  const overduePolicies = (policies as any[]).filter((p: any) => p.status === 'overdue' || p.status === 'due_review').length;
  const complianceScore = Math.max(0, 100 - criticalItems * 20 - overdueItems * 10 - expiredTraining * 5 - overduePolicies * 5);
  const complianceColor = complianceScore >= 80 ? T.mint : complianceScore >= 60 ? '#f59e0b' : '#f87171';

  // Today's action tiles
  const pendingReceipts = (receipts?.rows ?? []).filter((r: any) => r.status === 'pending').length;
  const pendingLoans = (loans as any[] ?? []).filter((l: any) => l.status === 'pending').length;

  /* Mock chart data — replaced by real data when queries land */
  const chartData = [
    { month: "Jan", income: 12400, expenses: 8200 },
    { month: "Feb", income: 15800, expenses: 9100 },
    { month: "Mar", income: 11200, expenses: 7800 },
    { month: "Apr", income: 18600, expenses: 11200 },
    { month: "May", income: 14300, expenses: 8900 },
    { month: "Jun", income: 21000, expenses: 13400 },
  ];

  const pieData = [
    { name: "Fundraising", value: 38, color: T.purple },
    { name: "Rentals", value: 28, color: T.mint },
    { name: "Friday Collection", value: 20, color: "#f59e0b" },
    { name: "Other", value: 14, color: "#64748b" },
  ];

  const loansList: any[] = Array.isArray(loans) && loans.length > 0 ? (loans as any[]) : [
    { id: 1, borrowerName: "Ahmed Siddiqui", amount: 2500, status: "active" },
    { id: 2, borrowerName: "Fatima Hassan", amount: 1200, status: "approved" },
    { id: 3, borrowerName: "Omar Khalid", amount: 3000, status: "pending" },
    { id: 4, borrowerName: "Zainab Ali", amount: 800, status: "active" },
  ];

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .dash-table tr:hover td { background: rgba(99,91,255,0.06); }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: `linear-gradient(160deg, #0E2244 0%, ${T.navy} 50%, #070F1E 100%)`,
        padding: "clamp(12px, 4vw, 24px)",
        fontFamily: "'DM Sans', sans-serif",
        overflowX: "hidden",
      }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 28, animation: "fadeUp 0.4s ease both" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: "clamp(22px,3vw,30px)", fontWeight: 800, color: T.white, margin: 0, letterSpacing: "-0.03em" }}>
                Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
                <span style={{ color: T.mint }}>{user?.name?.split(" ")[0] ?? "there"}</span>
              </h1>
              <p style={{ fontSize: 13, color: T.muted, margin: "4px 0 0" }}>
                {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                {" · "}Abdullah Quilliam Society
              </p>
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "7px 16px", borderRadius: 999,
              border: `1px solid ${T.border}`, background: T.glass,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.mint, boxShadow: `0 0 8px ${T.mint}` }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Live Dashboard
              </span>
            </div>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
          gap: 12, marginBottom: 20,
        }}>
          <StatCard label="Total Income" value="£42,800" sub="This month" icon={TrendingUp} trend="up" color={T.mint} delay={0} />
          <StatCard label="Total Expenses" value="£28,340" sub="This month" icon={TrendingDown} trend="down" color="#f59e0b" delay={80} />
          <StatCard label="Available Balance" value="£14,460" sub="Reconciled" icon={DollarSign} trend="up" color={T.purple} delay={160} />
          <StatCard label="Pending Approvals" value="7" sub="Requires action" icon={AlertCircle} trend="neutral" color="#f87171" delay={240} />
        </div>

        {/* ── Today's action tiles ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 20, animation: 'fadeUp 0.5s ease 280ms both' }}>
          {[
            { label: 'Pending Receipts', value: pendingReceipts || 0, path: '/expenses', color: '#f59e0b', icon: Receipt },
            { label: 'Pending Loans', value: pendingLoans || 0, path: '/loans', color: T.purple, icon: HandHeart },
            { label: 'Compliance Issues', value: criticalItems + overdueItems, path: '/compliance', color: criticalItems > 0 ? '#f87171' : T.mint, icon: AlertCircle },
            { label: 'Training Gaps', value: expiredTraining, path: '/compliance', color: expiredTraining > 0 ? '#f59e0b' : T.mint, icon: BookOpen },
          ].map((tile) => (
            <Link key={tile.label} href={tile.path}>
              <div style={{ background: `${tile.color}11`, border: `1px solid ${tile.color}33`, borderRadius: 14, padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px ${tile.color}33`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <tile.icon size={16} style={{ color: tile.color }} />
                  {tile.value > 0 && <span style={{ width: 7, height: 7, borderRadius: '50%', background: tile.color, boxShadow: `0 0 6px ${tile.color}` }} />}
                </div>
                <p style={{ fontSize: 26, fontWeight: 800, color: T.white, margin: 0, lineHeight: 1 }}>{tile.value}</p>
                <p style={{ fontSize: 11, color: T.muted, margin: '4px 0 0', fontWeight: 500 }}>{tile.label}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* ── Compliance health strip (admin only) ── */}
        {isAdmin && (
          <Link href="/compliance">
            <div style={{ background: T.card, backdropFilter: 'blur(20px)', border: `1px solid ${complianceColor}44`, borderRadius: 14, padding: '14px 20px', marginBottom: 20, cursor: 'pointer', animation: 'fadeUp 0.5s ease 320ms both', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${complianceColor}22`, border: `1px solid ${complianceColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CheckCircle2 size={20} style={{ color: complianceColor }} />
                </div>
                <div>
                  <p style={{ fontSize: 11, color: T.muted, margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Compliance Score</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: complianceColor, margin: 0, lineHeight: 1.1 }}>{complianceScore}%</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {[{ label: 'Critical Actions', value: criticalItems, color: '#f87171' }, { label: 'Overdue Items', value: overdueItems, color: '#f59e0b' }, { label: 'Training Gaps', value: expiredTraining, color: '#a78bfa' }, { label: 'Policy Reviews Due', value: overduePolicies, color: T.mint }].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 18, fontWeight: 800, color: s.value > 0 ? s.color : T.muted, margin: 0 }}>{s.value}</p>
                    <p style={{ fontSize: 10, color: T.muted, margin: 0, whiteSpace: 'nowrap' }}>{s.label}</p>
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 11, color: T.muted, marginLeft: 'auto' }}>View Compliance Cockpit →</span>
            </div>
          </Link>
        )}

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mb-6">

          {/* Area chart */}
          <div style={{
            background: T.card, backdropFilter: "blur(20px)",
            border: `1px solid ${T.border}`, borderRadius: 16, padding: "24px",
            animation: "fadeUp 0.5s ease 300ms both",
          }}>
            <SectionHeader title="Income vs Expenses" sub="Last 6 months" />
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={T.mint} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={T.mint} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={T.purple} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={T.purple} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `£${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="income" name="Income" stroke={T.mint} strokeWidth={2} fill="url(#incGrad)" />
                <Area type="monotone" dataKey="expenses" name="Expenses" stroke={T.purple} strokeWidth={2} fill="url(#expGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Pie chart */}
          <div style={{
            background: T.card, backdropFilter: "blur(20px)",
            border: `1px solid ${T.border}`, borderRadius: 16, padding: "24px",
            animation: "fadeUp 0.5s ease 380ms both",
          }}>
            <SectionHeader title="Income Sources" sub="Current month" />
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                  dataKey="value" strokeWidth={0}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => [`${v}%`]} contentStyle={{ background: "#0D2240", border: `1px solid ${T.border}`, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {pieData.map((d) => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: T.muted }}>{d.name}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.white }}>{d.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Recent activity row ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">

          {/* Recent receipts */}
          <div style={{
            background: T.card, backdropFilter: "blur(20px)",
            border: `1px solid ${T.border}`, borderRadius: 16, padding: "24px",
            animation: "fadeUp 0.5s ease 460ms both",
          }}>
            <SectionHeader title="Recent Receipts" sub="Your latest submissions" />
            <table className="dash-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Description", "Amount", "Status"].map((h) => (
                    <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", paddingBottom: 10, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(receipts?.rows ?? [
                  { id: 1, description: "Cleaning supplies", amount: 124.50, status: "approved" },
                  { id: 2, description: "Catering — Iftar", amount: 340.00, status: "pending" },
                  { id: 3, description: "Office stationery", amount: 45.20, status: "approved" },
                  { id: 4, description: "Maintenance — roof", amount: 820.00, status: "pending" },
                ]).slice(0, 5).map((r: any, i: number) => (
                  <tr key={r.id ?? i}>
                    <td style={{ padding: "10px 0", fontSize: 13, color: T.white, borderBottom: `1px solid ${T.border}` }}>
                      {r.description ?? r.notes ?? "—"}
                    </td>
                    <td style={{ padding: "10px 8px", fontSize: 13, fontWeight: 600, color: T.mint, borderBottom: `1px solid ${T.border}` }}>
                      £{Number(r.amount ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                      <Badge status={r.status ?? "pending"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Active loans */}
          <div style={{
            background: T.card, backdropFilter: "blur(20px)",
            border: `1px solid ${T.border}`, borderRadius: 16, padding: "24px",
            animation: "fadeUp 0.5s ease 540ms both",
          }}>
            <SectionHeader title="Qarde Hasan Loans" sub="Active loan register" />
            <table className="dash-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Borrower", "Amount", "Status"].map((h) => (
                    <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", paddingBottom: 10, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loansList.slice(0, 5).map((l: any, i: number) => (
                  <tr key={l.id ?? i}>
                    <td style={{ padding: "10px 0", fontSize: 13, color: T.white, borderBottom: `1px solid ${T.border}` }}>
                      {l.borrowerName ?? "—"}
                    </td>
                    <td style={{ padding: "10px 8px", fontSize: 13, fontWeight: 600, color: T.purple, borderBottom: `1px solid ${T.border}` }}>
                      £{Number(l.amount ?? 0).toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                      <Badge status={l.status ?? "pending"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Admin: All users expenses ── */}
        {isAdmin && (
          <div style={{
            background: T.card, backdropFilter: "blur(20px)",
            border: `1px solid ${T.border}`, borderRadius: 16, padding: "24px",
            animation: "fadeUp 0.5s ease 620ms both",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
              <SectionHeader title="All Users Expenses" sub="Superadmin view across all staff" />
              {/* User filter */}
              <select
                value={userFilter === "all" ? "all" : String(userFilter)}
                onChange={(e) => setUserFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                style={{
                  background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`,
                  borderRadius: 8, color: T.white, fontSize: 13, padding: "6px 12px",
                  outline: "none", cursor: "pointer",
                }}
              >
                <option value="all" style={{ background: "#0D2240" }}>All Users</option>
                {(users?.rows ?? []).map((u: any) => (
                  <option key={u.id} value={u.id} style={{ background: "#0D2240" }}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* Summary stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Total Spend", value: "£28,340", icon: CreditCard, color: T.purple },
                { label: "Receipts", value: "142", icon: Receipt, color: T.mint },
                { label: "Pending", value: "7", icon: Clock, color: "#f59e0b" },
              ].map((s) => (
                <div key={s.label} style={{
                  background: `${s.color}11`, border: `1px solid ${s.color}22`,
                  borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
                }}>
                  <s.icon size={20} style={{ color: s.color, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 18, fontWeight: 800, color: T.white, margin: 0 }}>{s.value}</p>
                    <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="dash-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
                <thead>
                  <tr>
                    {["User", "Date", "Category", "Amount", "Status", "Description"].map((h) => (
                      <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", padding: "0 12px 10px 0", borderBottom: `1px solid ${T.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(allExpenses?.rows ?? [
                    { id: 1, userName: "Abdul Hamid", date: "2026-05-07", category: "Maintenance", amount: 820, status: "pending", description: "Roof repair" },
                    { id: 2, userName: "Fatma El Sayed", date: "2026-05-06", category: "Cleaning", amount: 124.50, status: "approved", description: "Cleaning supplies" },
                    { id: 3, userName: "Mumin Khan", date: "2026-05-05", category: "Catering", amount: 340, status: "approved", description: "Iftar event" },
                    { id: 4, userName: "Farid Ahmed", date: "2026-05-04", category: "Travel", amount: 67.20, status: "approved", description: "Site visit" },
                    { id: 5, userName: "Abdul Hamid", date: "2026-05-03", category: "Stationery", amount: 45.20, status: "approved", description: "Office supplies" },
                  ]).map((r: any, i: number) => (
                    <tr key={r.id ?? i} style={{ transition: "background 0.15s" }}>
                      <td style={{ padding: "10px 12px 10px 0", fontSize: 13, color: T.white, borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.purple, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: T.white, flexShrink: 0 }}>
                            {(r.userName ?? r.name ?? "?")[0]}
                          </div>
                          {r.userName ?? r.name ?? "—"}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px 10px 0", fontSize: 12, color: T.muted, borderBottom: `1px solid ${T.border}` }}>
                        {r.date ? new Date(r.date).toLocaleDateString("en-GB") : "—"}
                      </td>
                      <td style={{ padding: "10px 12px 10px 0", fontSize: 12, color: T.muted, borderBottom: `1px solid ${T.border}` }}>
                        {r.category ?? "—"}
                      </td>
                      <td style={{ padding: "10px 12px 10px 0", fontSize: 13, fontWeight: 700, color: T.mint, borderBottom: `1px solid ${T.border}` }}>
                        £{Number(r.amount ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "10px 12px 10px 0", borderBottom: `1px solid ${T.border}` }}>
                        <Badge status={r.status ?? "pending"} />
                      </td>
                      <td style={{ padding: "10px 0", fontSize: 12, color: T.muted, borderBottom: `1px solid ${T.border}` }}>
                        {r.description ?? r.notes ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Quick actions ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12, marginTop: 28,
          animation: "fadeUp 0.5s ease 700ms both",
        }}>
          {[
            { label: "Scan Receipt", icon: Receipt, path: "/", color: T.purple },
            { label: "New Loan", icon: BookOpen, path: "/loans", color: T.mint },
            { label: "Add Income", icon: TrendingUp, path: "/income", color: "#f59e0b" },
            { label: "Payroll", icon: Wallet, path: "/payroll", color: "#a78bfa" },
            { label: "Donors", icon: HandHeart, path: "/donors", color: "#f472b6" },
          ].map((a) => (
            <a key={a.label} href={a.path} style={{ textDecoration: "none" }}>
              <div style={{
                background: `${a.color}11`,
                border: `1px solid ${a.color}22`,
                borderRadius: 14, padding: "16px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                cursor: "pointer", transition: "all 0.2s ease",
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${a.color}22`; (e.currentTarget as HTMLElement).style.borderColor = `${a.color}44`; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = `${a.color}11`; (e.currentTarget as HTMLElement).style.borderColor = `${a.color}22`; (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
              >
                <a.icon size={22} style={{ color: a.color }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: T.white, textAlign: "center" }}>{a.label}</span>
              </div>
            </a>
          ))}
        </div>

      </div>
    </>
  );
}
