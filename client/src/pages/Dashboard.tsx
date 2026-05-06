import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, Wallet, Users, AlertCircle, ArrowRight,
  Plus, Receipt, Scale, Banknote, CalendarClock, CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

/* ─── Hibba brand colours ─────────────────────────────────────────── */
const NAVY = "#0A192F";
const PURPLE = "#635BFF";
const MINT = "#00FFC2";
const PURPLE_LIGHT = "rgba(99,91,255,0.12)";
const MINT_LIGHT = "rgba(0,255,194,0.12)";

function isAdminRole(role?: string | null) {
  return role === "superadmin" || role === "trustee" || role === "manager" || role === "admin";
}

/* ─── Stat card ──────────────────────────────────────────────────── */
function HibbaStatCard({
  title, value, subtitle, icon: Icon, accent = PURPLE, bg,
}: {
  title: string; value: string; subtitle?: string;
  icon: React.ElementType; accent?: string; bg?: string;
}) {
  return (
    <Card className="border-0 shadow-sm overflow-hidden card-lift" style={{ background: bg ?? "white" }}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: bg ? "rgba(255,255,255,0.65)" : "#6b7280" }}>
              {title}
            </p>
            <p className="text-2xl font-extrabold mt-1.5 tracking-tight" style={{ color: bg ? "white" : NAVY }}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs mt-1" style={{ color: bg ? "rgba(255,255,255,0.55)" : "#9ca3af" }}>
                {subtitle}
              </p>
            )}
          </div>
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: bg ? "rgba(255,255,255,0.15)" : `${accent}1a` }}
          >
            <Icon className="h-5 w-5" style={{ color: bg ? "white" : accent }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Mizan tooltip ──────────────────────────────────────────────── */
function MizanTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-bold text-[#0A192F] mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-semibold text-gray-800">£{Number(p.value).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [period, setPeriod] = useState("thismonth");
  const now = useMemo(() => new Date(), []);

  const dateRange = useMemo(() => {
    if (period === "thismonth") {
      return {
        dateFrom: format(startOfMonth(now), "yyyy-MM-dd"),
        dateTo: format(endOfMonth(now), "yyyy-MM-dd"),
      };
    }
    if (period === "last3") {
      return {
        dateFrom: format(startOfMonth(subMonths(now, 2)), "yyyy-MM-dd"),
        dateTo: format(endOfMonth(now), "yyyy-MM-dd"),
      };
    }
    if (period === "last6") {
      return {
        dateFrom: format(startOfMonth(subMonths(now, 5)), "yyyy-MM-dd"),
        dateTo: format(endOfMonth(now), "yyyy-MM-dd"),
      };
    }
    return {};
  }, [period, now]);

  /* ── Data queries ── */
  const { data: receiptsData, isLoading: receiptsLoading } = trpc.receipts.list.useQuery({ ...dateRange, limit: 100 });
  const { data: categoryTotals } = trpc.receipts.categoryTotals.useQuery(dateRange);
  const { data: adminData } = trpc.receipts.adminList.useQuery(
    { ...dateRange, limit: 200 },
    { enabled: isAdmin }
  );
  const { data: incomeData } = trpc.income.list.useQuery({ limit: 500 }, { enabled: isAdmin });
  const { data: payrollData } = trpc.payroll.list.useQuery(
    { year: now.getFullYear(), month: now.getMonth() + 1 },
    { enabled: isAdmin }
  );
  const { data: userList } = trpc.receipts.adminUserList.useQuery(undefined, { enabled: isAdmin });

  /* ── Derived stats ── */
  const totalExpenses = useMemo(() => {
    const rows = isAdmin ? (adminData?.rows ?? []) : (receiptsData?.rows ?? []);
    return rows.reduce((s, r) => s + (parseFloat(String(r.amount ?? 0)) || 0), 0);
  }, [adminData, receiptsData, isAdmin]);

  const totalIncome = useMemo(() => {
    if (!incomeData) return 0;
    return incomeData.reduce((s, r) => s + (parseFloat(String(r.amount ?? 0)) || 0), 0);
  }, [incomeData]);

  const balance = totalIncome - totalExpenses;

  const totalPayroll = useMemo(() => {
    if (!payrollData) return 0;
    return payrollData.reduce((s, r) => s + (parseFloat(String(r.grossPay ?? 0)) || 0), 0);
  }, [payrollData]);

  const pendingReceipts = useMemo(() => {
    const rows = isAdmin ? (adminData?.rows ?? []) : (receiptsData?.rows ?? []);
    return rows.filter(r => r.status === "pending" || r.status === "processing").length;
  }, [adminData, receiptsData, isAdmin]);

  /* ── Mizan chart data (last 6 months) ── */
  const mizanData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => subMonths(now, 5 - i));
    return months.map((m) => {
      const label = format(m, "MMM yy");
      const mStart = format(startOfMonth(m), "yyyy-MM-dd");
      const mEnd = format(endOfMonth(m), "yyyy-MM-dd");
      const expRows = (adminData?.rows ?? receiptsData?.rows ?? []).filter(r => {
        const d = r.receiptDate ? String(r.receiptDate).slice(0, 10) : null;
        return d && d >= mStart && d <= mEnd;
      });
      const exp = expRows.reduce((s, r) => s + (parseFloat(String(r.amount ?? 0)) || 0), 0);
      const inc = (incomeData ?? []).filter(r => {
        const d = r.date ? String(r.date).slice(0, 10) : null;
        return d && d >= mStart && d <= mEnd;
      }).reduce((s, r) => s + (parseFloat(String(r.amount ?? 0)) || 0), 0);
      return { month: label, Income: parseFloat(inc.toFixed(2)), Expenditure: parseFloat(exp.toFixed(2)) };
    });
  }, [adminData, receiptsData, incomeData, now]);

  const periodLabel = period === "thismonth" ? "This Month"
    : period === "last3" ? "Last 3 Months"
    : period === "last6" ? "Last 6 Months"
    : "All Time";

  const recentReceipts = (isAdmin ? adminData?.rows : receiptsData?.rows)?.slice(0, 6) ?? [];

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: NAVY }}>
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(now, "EEEE, d MMMM yyyy")} &middot; {periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-44 h-9 text-sm rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thismonth">This Month</SelectItem>
              <SelectItem value="last3">Last 3 Months</SelectItem>
              <SelectItem value="last6">Last 6 Months</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => setLocation("/capture")}
            className="h-9 gap-2 rounded-xl text-sm font-semibold shadow-sm"
            style={{ background: `linear-gradient(135deg, ${PURPLE} 0%, #4f46e5 100%)`, color: "white" }}
          >
            <Plus className="h-4 w-4" />
            Add Receipt
          </Button>
        </div>
      </div>

      {/* ── Top stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {receiptsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            {/* Total Funds in Trust — hero card */}
            <HibbaStatCard
              title="Total Funds in Trust"
              value={`£${totalIncome.toFixed(2)}`}
              subtitle={`${(incomeData?.length ?? 0)} income records`}
              icon={Banknote}
              bg={`linear-gradient(135deg, ${NAVY} 0%, #112240 100%)`}
            />
            <HibbaStatCard
              title="Mizan Balance"
              value={`£${balance.toFixed(2)}`}
              subtitle={balance >= 0 ? "Surplus" : "Deficit"}
              icon={Scale}
              accent={balance >= 0 ? MINT : "#ef4444"}
              bg={balance >= 0
                ? `linear-gradient(135deg, #00c49a 0%, #00a07e 100%)`
                : `linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)`}
            />
            <HibbaStatCard
              title="Total Expenditure"
              value={`£${totalExpenses.toFixed(2)}`}
              subtitle={`${(isAdmin ? adminData?.rows : receiptsData?.rows)?.length ?? 0} receipts`}
              icon={TrendingDown}
              accent={PURPLE}
            />
            <HibbaStatCard
              title="Payroll This Month"
              value={`£${totalPayroll.toFixed(2)}`}
              subtitle={`${payrollData?.length ?? 0} staff`}
              icon={Users}
              accent="#f59e0b"
            />
          </>
        )}
      </div>

      {/* ── Mizan Chart + HR Widget ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Mizan area chart — 2/3 width */}
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold tracking-tight" style={{ color: NAVY }}>
                  Mizan — Income vs Expenditure
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">6-month financial balance overview</CardDescription>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full" style={{ background: MINT }} />
                  <span className="text-muted-foreground">Income</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full" style={{ background: PURPLE }} />
                  <span className="text-muted-foreground">Expenditure</span>
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={mizanData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={MINT} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={MINT} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PURPLE} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={PURPLE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={(v) => `£${v}`} axisLine={false} tickLine={false} />
                <Tooltip content={<MizanTooltip />} />
                <Area type="monotone" dataKey="Income" stroke={MINT} strokeWidth={2.5} fill="url(#incomeGrad)" dot={false} />
                <Area type="monotone" dataKey="Expenditure" stroke={PURPLE} strokeWidth={2.5} fill="url(#expGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* HR Widget — 1/3 width */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold tracking-tight" style={{ color: NAVY }}>
              HR Snapshot
            </CardTitle>
            <CardDescription className="text-xs">{format(now, "MMMM yyyy")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Payroll alert */}
            <div
              className="rounded-xl p-3 flex items-start gap-3"
              style={{ background: `linear-gradient(135deg, ${PURPLE}15 0%, ${PURPLE}08 100%)`, border: `1px solid ${PURPLE}25` }}
            >
              <CalendarClock className="h-4 w-4 mt-0.5 shrink-0" style={{ color: PURPLE }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: NAVY }}>Payroll Due</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {payrollData && payrollData.length > 0
                    ? `${payrollData.length} payslip${payrollData.length !== 1 ? "s" : ""} processed this month`
                    : "No payroll records yet this month"}
                </p>
              </div>
            </div>

            {/* Staff count */}
            <div
              className="rounded-xl p-3 flex items-start gap-3"
              style={{ background: `${MINT}12`, border: `1px solid ${MINT}30` }}
            >
              <Users className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#00a07e" }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: NAVY }}>Active Staff</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {userList?.length ?? 0} registered accounts
                </p>
              </div>
            </div>

            {/* Pending receipts */}
            {pendingReceipts > 0 && (
              <div
                className="rounded-xl p-3 flex items-start gap-3"
                style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-xs font-semibold" style={{ color: NAVY }}>Pending Review</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {pendingReceipts} receipt{pendingReceipts !== 1 ? "s" : ""} awaiting processing
                  </p>
                </div>
              </div>
            )}

            {pendingReceipts === 0 && (
              <div
                className="rounded-xl p-3 flex items-start gap-3"
                style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}
              >
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                <div>
                  <p className="text-xs font-semibold" style={{ color: NAVY }}>All Clear</p>
                  <p className="text-xs text-muted-foreground mt-0.5">No pending receipts</p>
                </div>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 text-xs font-semibold rounded-xl mt-1 gap-1.5"
              style={{ borderColor: `${PURPLE}40`, color: PURPLE }}
              onClick={() => setLocation("/payroll")}
            >
              <Users className="h-3.5 w-3.5" />
              View Payroll
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Category bar chart ── */}
      {(categoryTotals ?? []).length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold tracking-tight" style={{ color: NAVY }}>
              Expenditure by Category
            </CardTitle>
            <CardDescription className="text-xs">Top expense categories for {periodLabel.toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={(categoryTotals ?? [])
                  .filter(c => c.categoryName && Number(c.total) > 0)
                  .slice(0, 8)
                  .map(c => ({ name: c.categoryName ?? "Other", value: Number(c.total) }))}
                margin={{ top: 5, right: 10, left: 0, bottom: 50 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} angle={-30} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={(v) => `£${v}`} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [`£${v.toFixed(2)}`, "Spend"]} contentStyle={{ borderRadius: 12, border: "1px solid #f0f0f0", fontSize: 12 }} />
                <Bar dataKey="value" fill={PURPLE} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Recent activity ── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-bold tracking-tight" style={{ color: NAVY }}>
              Recent Activity
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">Latest receipts and expenses</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs font-semibold rounded-lg"
            style={{ color: PURPLE }}
            onClick={() => setLocation("/receipts")}
          >
            View all <ArrowRight className="h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent>
          {receiptsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : recentReceipts.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No receipts yet. Start by capturing one.</p>
              <Button
                size="sm"
                className="mt-4 rounded-xl"
                style={{ background: PURPLE, color: "white" }}
                onClick={() => setLocation("/capture")}
              >
                <Plus className="h-4 w-4 mr-1" /> Capture Receipt
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              {recentReceipts.map((r) => {
                const displayName = (r as any).submitterFullName ?? (r as any).submitterName ?? null;
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between py-2.5 px-3 rounded-xl cursor-pointer transition-colors hover:bg-muted/40 -mx-1"
                    onClick={() => setLocation(`/receipts/${r.id}`)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold"
                        style={{ background: PURPLE_LIGHT, color: PURPLE }}
                      >
                        {(r.vendor ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: NAVY }}>
                          {r.vendor ?? "Unknown Vendor"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.receiptDate ? format(new Date(r.receiptDate), "d MMM yyyy") : "No date"}
                          {displayName ? ` · ${displayName}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-bold text-sm" style={{ color: NAVY }}>
                        {r.amount ? `£${parseFloat(String(r.amount)).toFixed(2)}` : "—"}
                      </span>
                      <Badge
                        variant={r.status === "processed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}
                        className="text-xs rounded-lg"
                        style={r.status === "processed" ? { background: MINT_LIGHT, color: "#00a07e", border: `1px solid ${MINT}50` } : {}}
                      >
                        {r.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Footer ── */}
      <div className="text-center pt-2 pb-4">
        <p className="text-xs text-muted-foreground/50">
          Official Platform of the Abdullah Quilliam Society &middot; Securely managed via Hibba.io
        </p>
      </div>
    </div>
  );
}
