import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { Receipt, TrendingUp, Clock, CheckCircle, AlertCircle, Plus, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#14b8a6", "#6b7280",
];

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
  const [period, setPeriod] = useState("march2026");

  const dateRange = useMemo(() => {
    if (period === "march2026") {
      return { dateFrom: "2026-03-01", dateTo: "2026-03-31" };
    }
    if (period === "last3") {
      const now = new Date();
      return {
        dateFrom: format(startOfMonth(subMonths(now, 2)), "yyyy-MM-dd"),
        dateTo: format(endOfMonth(now), "yyyy-MM-dd"),
      };
    }
    if (period === "thismonth") {
      const now = new Date();
      return {
        dateFrom: format(startOfMonth(now), "yyyy-MM-dd"),
        dateTo: format(endOfMonth(now), "yyyy-MM-dd"),
      };
    }
    return {};
  }, [period]);

  const { data: receiptsData, isLoading: receiptsLoading } = trpc.receipts.list.useQuery({
    ...dateRange,
    limit: 100,
  });

  const { data: categoryTotals, isLoading: catLoading } = trpc.receipts.categoryTotals.useQuery(dateRange);

  const stats = useMemo(() => {
    if (!receiptsData) return null;
    const rows = receiptsData.rows;
    const total = rows.reduce((sum, r) => sum + (parseFloat(String(r.amount ?? 0)) || 0), 0);
    const processed = rows.filter((r) => r.status === "processed").length;
    const pending = rows.filter((r) => r.status === "pending" || r.status === "processing").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    return { total, processed, pending, failed, count: rows.length };
  }, [receiptsData]);

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

  return (
    <div className="space-y-6">
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
              <SelectItem value="march2026">March 2026</SelectItem>
              <SelectItem value="thismonth">This Month</SelectItem>
              <SelectItem value="last3">Last 3 Months</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setLocation("/")} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Receipt
          </Button>
        </div>
      </div>

      {/* Stats */}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expenses by Category</CardTitle>
            <CardDescription>Breakdown of spending across categories</CardDescription>
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
            <CardTitle className="text-base">Category Totals</CardTitle>
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
            <CardTitle className="text-base">Recent Receipts</CardTitle>
            <CardDescription>Latest processed receipts</CardDescription>
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
