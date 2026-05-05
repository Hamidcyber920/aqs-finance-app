import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Receipt, TrendingUp, Clock, CheckCircle, AlertCircle, Plus, ArrowRight,
  Users, Filter, ChevronDown, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#14b8a6", "#6b7280",
];

function isAdminRole(role?: string | null) {
  return role === "superadmin" || role === "trustee" || role === "manager" || role === "admin";
}

function StatCard({
  title, value, subtitle, icon: Icon, color = "text-primary",
}: {
  title: string; value: string; subtitle?: string;
  icon: React.ElementType; color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [period, setPeriod] = useState("thismonth");
  // Admin: selected user filter (undefined = all users)
  const [filterUserId, setFilterUserId] = useState<number | undefined>(undefined);

  const dateRange = useMemo(() => {
    if (period === "thismonth") {
      const now = new Date();
      return {
        dateFrom: format(startOfMonth(now), "yyyy-MM-dd"),
        dateTo: format(endOfMonth(now), "yyyy-MM-dd"),
      };
    }
    if (period === "last3") {
      const now = new Date();
      return {
        dateFrom: format(startOfMonth(subMonths(now, 2)), "yyyy-MM-dd"),
        dateTo: format(endOfMonth(now), "yyyy-MM-dd"),
      };
    }
    if (period === "last6") {
      const now = new Date();
      return {
        dateFrom: format(startOfMonth(subMonths(now, 5)), "yyyy-MM-dd"),
        dateTo: format(endOfMonth(now), "yyyy-MM-dd"),
      };
    }
    // all time — no filter
    return {};
  }, [period]);

  // Own receipts (for charts / own stats)
  const { data: receiptsData, isLoading: receiptsLoading } = trpc.receipts.list.useQuery({
    ...dateRange,
    limit: 100,
  });

  const { data: categoryTotals, isLoading: catLoading } = trpc.receipts.categoryTotals.useQuery(dateRange);

  // Admin: all-users receipts
  const { data: adminData, isLoading: adminLoading } = trpc.receipts.adminList.useQuery(
    { ...dateRange, userId: filterUserId, limit: 200 },
    { enabled: isAdmin }
  );

  // Admin: user list for filter dropdown
  const { data: userList } = trpc.receipts.adminUserList.useQuery(undefined, { enabled: isAdmin });

  const stats = useMemo(() => {
    if (!receiptsData) return null;
    const rows = receiptsData.rows;
    const total = rows.reduce((sum, r) => sum + (parseFloat(String(r.amount ?? 0)) || 0), 0);
    const processed = rows.filter((r) => r.status === "processed").length;
    const pending = rows.filter((r) => r.status === "pending" || r.status === "processing").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    return { total, processed, pending, failed, count: rows.length };
  }, [receiptsData]);

  // Admin stats across all users
  const adminStats = useMemo(() => {
    if (!adminData) return null;
    const rows = adminData.rows;
    const total = rows.reduce((sum, r) => sum + (parseFloat(String(r.amount ?? 0)) || 0), 0);
    const pending = rows.filter((r) => r.status === "pending" || r.status === "processing").length;
    const uniqueUsers = new Set(rows.map(r => r.userId)).size;
    return { total, pending, count: rows.length, uniqueUsers };
  }, [adminData]);

  const pieData = useMemo(() => {
    if (!categoryTotals) return [];
    return categoryTotals
      .filter((c) => c.categoryName && Number(c.total) > 0)
      .map((c) => ({
        name: c.categoryName ?? "Other",
        value: Number(c.total),
        count: Number(c.count),
      }));
  }, [categoryTotals]);

  const recentReceipts = receiptsData?.rows.slice(0, 8) ?? [];

  const periodLabel = period === "thismonth" ? "This Month"
    : period === "last3" ? "Last 3 Months"
    : period === "last6" ? "Last 6 Months"
    : "All Time";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Expense overview for Abdullah Quilliam Society</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thismonth">This Month</SelectItem>
              <SelectItem value="last3">Last 3 Months</SelectItem>
              <SelectItem value="last6">Last 6 Months</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setLocation("/")} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Receipt
          </Button>
        </div>
      </div>

      {/* ── ADMIN: All-Users Expenses Section ── */}
      {isAdmin && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">All Staff Expenses</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {periodLabel} · {adminStats?.count ?? 0} receipts from {adminStats?.uniqueUsers ?? 0} user{adminStats?.uniqueUsers !== 1 ? "s" : ""}
                  </CardDescription>
                </div>
              </div>
              {/* User filter */}
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select
                  value={filterUserId === undefined ? "all" : String(filterUserId)}
                  onValueChange={v => setFilterUserId(v === "all" ? undefined : Number(v))}
                >
                  <SelectTrigger className="w-48 h-8 text-sm">
                    <SelectValue placeholder="All Users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {(userList ?? []).map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.displayName}
                        <span className="ml-1 text-xs text-muted-foreground capitalize">({u.role})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          {/* Admin summary stat cards */}
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Total Spend</p>
                <p className="text-xl font-bold text-primary mt-0.5">
                  £{adminStats?.total.toFixed(2) ?? "0.00"}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Receipts</p>
                <p className="text-xl font-bold mt-0.5">{adminStats?.count ?? 0}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Pending Review</p>
                <p className="text-xl font-bold text-amber-600 mt-0.5">{adminStats?.pending ?? 0}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Staff Members</p>
                <p className="text-xl font-bold mt-0.5">{adminStats?.uniqueUsers ?? 0}</p>
              </div>
            </div>

            {/* Expenses table */}
            {adminLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (adminData?.rows.length ?? 0) === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Receipt className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No expenses found for this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/60 border-b">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Staff Member</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Vendor / Description</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Category</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {adminData!.rows.map((r) => {
                      const displayName = r.submitterFullName ?? r.submitterName ?? `User #${r.userId}`;
                      return (
                        <tr
                          key={r.id}
                          className="hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => setLocation(`/receipts/${r.id}`)}
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                                {displayName.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium truncate max-w-[120px]">{displayName}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {r.receiptDate ? format(new Date(r.receiptDate), "d MMM yyyy") : "—"}
                          </td>
                          <td className="px-3 py-2 max-w-[160px] truncate">
                            {r.vendor ?? r.notes ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {r.categoryName ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                            {r.amount ? `£${parseFloat(String(r.amount)).toFixed(2)}` : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={
                                r.status === "processed" ? "default" :
                                r.status === "failed" ? "destructive" : "secondary"
                              }
                              className="text-xs capitalize"
                            >
                              {r.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(adminData?.total ?? 0) > (adminData?.rows.length ?? 0) && (
                  <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/20">
                    Showing {adminData?.rows.length} of {adminData?.total} receipts
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Own Stats ── */}
      <div>
        <h2 className="text-base font-semibold mb-3 text-muted-foreground">My Expenses</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {receiptsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))
          ) : (
            <>
              <StatCard
                title="Total Expenses"
                value={`£${stats?.total.toFixed(2) ?? "0.00"}`}
                subtitle={`${stats?.count ?? 0} receipts`}
                icon={TrendingUp}
                color="text-primary"
              />
              <StatCard
                title="Processed"
                value={String(stats?.processed ?? 0)}
                subtitle="Successfully extracted"
                icon={CheckCircle}
                color="text-green-600"
              />
              <StatCard
                title="Pending"
                value={String(stats?.pending ?? 0)}
                subtitle="Awaiting processing"
                icon={Clock}
                color="text-amber-500"
              />
              <StatCard
                title="Categories"
                value={String(pieData.length)}
                subtitle="Expense types"
                icon={Receipt}
                color="text-blue-500"
              />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">My Expenses by Category</CardTitle>
            <CardDescription>Breakdown of your spending across categories</CardDescription>
          </CardHeader>
          <CardContent>
            {catLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : pieData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Receipt className="h-10 w-10 opacity-30" />
                <p className="text-sm">No receipts for this period</p>
                <Button size="sm" variant="outline" onClick={() => setLocation("/")}>
                  Add your first receipt
                </Button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`£${value.toFixed(2)}`, "Amount"]}
                  />
                  <Legend
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">My Category Totals</CardTitle>
            <CardDescription>Total spend per expense category</CardDescription>
          </CardHeader>
          <CardContent>
            {catLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : pieData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                No data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={pieData} margin={{ top: 5, right: 10, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
                  <Tooltip formatter={(value: number) => [`£${value.toFixed(2)}`, "Total"]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent receipts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">My Recent Receipts</CardTitle>
            <CardDescription>Your latest processed receipts</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setLocation("/receipts")} className="gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent>
          {receiptsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : recentReceipts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No receipts yet. Start by capturing one.</p>
            </div>
          ) : (
            <div className="divide-y">
              {recentReceipts.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-3 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded transition-colors"
                  onClick={() => setLocation(`/receipts/${r.id}`)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{r.vendor ?? "Unknown Vendor"}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.receiptDate ? format(new Date(r.receiptDate), "d MMM yyyy") : "No date"} ·{" "}
                        {r.categoryName ?? "Uncategorised"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold text-sm">
                      {r.amount ? `£${parseFloat(String(r.amount)).toFixed(2)}` : "—"}
                    </span>
                    <Badge
                      variant={
                        r.status === "processed" ? "default" :
                        r.status === "failed" ? "destructive" : "secondary"
                      }
                      className="text-xs"
                    >
                      {r.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
