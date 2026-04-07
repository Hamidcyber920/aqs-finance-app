import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Download, FileText, FileSpreadsheet, BarChart3, Calendar, TrendingDown, TrendingUp, Printer, ArrowUpCircle, ArrowDownCircle, Banknote, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { trpc } from "@/lib/trpc";

const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#14b8a6", "#6b7280",
];

const PRESET_PERIODS = [
  { label: "March 2026", from: "2026-03-01", to: "2026-03-31" },
  { label: "February 2026", from: "2026-02-01", to: "2026-02-28" },
  { label: "January 2026", from: "2026-01-01", to: "2026-01-31" },
  { label: "Q1 2026", from: "2026-01-01", to: "2026-03-31" },
];

export default function ReportsPage() {
  const now = new Date();
  const [dateFrom, setDateFrom] = useState("2026-03-01");
  const [dateTo, setDateTo] = useState("2026-03-31");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isExporting, setIsExporting] = useState(false);

  // Monthly summary: derive month/year from dateFrom
  const [summaryMonth, setSummaryMonth] = useState(now.getMonth() + 1);
  const [summaryYear, setSummaryYear] = useState(now.getFullYear());
  const { data: monthlySummary, isLoading: summaryLoading } = trpc.expenses.monthlySummary.useQuery(
    { month: summaryMonth, year: summaryYear },
    { staleTime: 30_000 }
  );

  const dateRange = useMemo(() => ({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    categoryName: categoryFilter !== "all" ? categoryFilter : undefined,
  }), [dateFrom, dateTo, categoryFilter]);

  const { data: categoryTotals, isLoading: catLoading } = trpc.receipts.categoryTotals.useQuery({
    dateFrom: dateRange.dateFrom,
    dateTo: dateRange.dateTo,
  });

  const { data: csvData } = trpc.receipts.exportCsv.useQuery(dateRange, {
    enabled: false,
  });

  const { data: categories } = trpc.categories.list.useQuery();

  const utils = trpc.useUtils();

  const chartData = useMemo(() => {
    if (!categoryTotals) return [];
    return categoryTotals
      .filter((c) => c.categoryName && Number(c.total) > 0)
      .map((c) => ({
        name: c.categoryName ?? "Other",
        total: Number(c.total),
        count: Number(c.count),
      }));
  }, [categoryTotals]);

  const grandTotal = useMemo(
    () => chartData.reduce((sum, c) => sum + c.total, 0),
    [chartData]
  );

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const result = await utils.receipts.exportCsv.fetch(dateRange);
      if (!result?.csv) {
        toast.error("No data to export");
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipts-${dateFrom}-to-${dateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.count} receipts as CSV`);
    } catch (err) {
      toast.error("Export failed", { description: (err as Error).message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const result = await utils.receipts.exportCsv.fetch(dateRange);
      if (!result?.csv) {
        toast.error("No data to export");
        return;
      }

      // Build a simple HTML report and print it
      const rows = result.csv.split("\n").slice(1).filter(Boolean);
      const headers = result.csv.split("\n")[0].split(",");

      const tableRows = rows.map((row) => {
        const cols = row.split(",").map((c) => c.replace(/^"|"$/g, ""));
        return `<tr>${cols.map((c) => `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${c}</td>`).join("")}</tr>`;
      }).join("");

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Expense Report — Abdullah Quilliam Society</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a2e; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            .subtitle { color: #666; margin-bottom: 24px; }
            .summary { display: flex; gap: 24px; margin-bottom: 24px; }
            .stat { background: #f5f7fa; padding: 12px 20px; border-radius: 8px; }
            .stat-value { font-size: 22px; font-weight: bold; color: #1e3a5f; }
            .stat-label { font-size: 11px; color: #666; margin-top: 2px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #1e3a5f; color: white; padding: 8px 10px; text-align: left; font-size: 11px; }
            tr:nth-child(even) td { background: #f9fafb; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <h1>Expense Report</h1>
          <p class="subtitle">Abdullah Quilliam Society · ${dateFrom} to ${dateTo}</p>
          <div class="summary">
            <div class="stat">
              <div class="stat-value">£${grandTotal.toFixed(2)}</div>
              <div class="stat-label">Total Expenses</div>
            </div>
            <div class="stat">
              <div class="stat-value">${rows.length}</div>
              <div class="stat-label">Total Receipts</div>
            </div>
            <div class="stat">
              <div class="stat-value">${chartData.length}</div>
              <div class="stat-label">Categories</div>
            </div>
          </div>
          <table>
            <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </body>
        </html>
      `;

      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        win.print();
      }
      toast.success("PDF report opened for printing");
    } catch (err) {
      toast.error("Export failed", { description: (err as Error).message });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports & Export</h1>
        <p className="text-muted-foreground mt-1">
          Generate expense reports and export data for your organisation.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report Parameters</CardTitle>
          <CardDescription>Select a date range and category to generate your report.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Presets */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Quick Select</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_PERIODS.map((p) => (
                <Button
                  key={p.label}
                  size="sm"
                  variant={dateFrom === p.from && dateTo === p.to ? "default" : "outline"}
                  onClick={() => { setDateFrom(p.from); setDateTo(p.to); }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From Date</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To Date</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs text-muted-foreground">Total Expenses</p>
            <p className="text-2xl font-bold mt-1">£{grandTotal.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs text-muted-foreground">Categories</p>
            <p className="text-2xl font-bold mt-1">{chartData.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs text-muted-foreground">Top Category</p>
            <p className="text-lg font-bold mt-1 truncate">
              {chartData[0]?.name ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spending by Category</CardTitle>
        </CardHeader>
        <CardContent>
          {catLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No data for the selected period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 70 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
                <Tooltip
                  formatter={(value: number, name: string) => [`£${value.toFixed(2)}`, "Total"]}
                  labelFormatter={(label) => `Category: ${label}`}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Category breakdown table */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {chartData.map((cat, i) => (
                <div key={cat.name} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="text-sm font-medium">{cat.name}</span>
                    <Badge variant="secondary" className="text-xs">{cat.count} receipts</Badge>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">£{cat.total.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      {grandTotal > 0 ? ((cat.total / grandTotal) * 100).toFixed(1) : 0}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export Report</CardTitle>
          <CardDescription>Download the filtered data in your preferred format.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={handleExportCsv} disabled={isExporting} className="gap-2" variant="outline">
            <FileSpreadsheet className="h-4 w-4" /> Export as CSV
          </Button>
          <Button onClick={handleExportPdf} disabled={isExporting} className="gap-2">
            <FileText className="h-4 w-4" /> Export as PDF
          </Button>
        </CardContent>
      </Card>

      {/* ── Monthly Income & Expenses Summary ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">Monthly Income & Expenses Summary</CardTitle>
              <CardDescription>Full income vs expenses document for the selected month</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={summaryMonth.toString()} onValueChange={v => setSummaryMonth(parseInt(v))}>
                <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{["January","February","March","April","May","June","July","August","September","October","November","December"].map((m,i) => <SelectItem key={i} value={(i+1).toString()}>{m}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={summaryYear.toString()} onValueChange={v => setSummaryYear(parseInt(v))}>
                <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{[now.getFullYear(), now.getFullYear()-1, now.getFullYear()-2].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => printMonthlySummary(monthlySummary, summaryMonth, summaryYear)} disabled={!monthlySummary}>
                <Printer className="h-3 w-3" /> Print
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}</div>
          ) : !monthlySummary ? (
            <p className="text-sm text-muted-foreground text-center py-6">No data for this period</p>
          ) : (
            <div className="space-y-4">
              {/* Income vs Expenses headline */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <ArrowUpCircle className="h-5 w-5 text-green-600 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Total Income</p>
                  <p className="font-bold text-green-700">£{monthlySummary.income.total.toFixed(2)}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <ArrowDownCircle className="h-5 w-5 text-red-600 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Total Expenses</p>
                  <p className="font-bold text-red-700">£{monthlySummary.expenses.total.toFixed(2)}</p>
                </div>
                <div className={`border rounded-lg p-3 text-center ${monthlySummary.netBalance >= 0 ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200"}`}>
                  <BarChart3 className={`h-5 w-5 mx-auto mb-1 ${monthlySummary.netBalance >= 0 ? "text-blue-600" : "text-amber-600"}`} />
                  <p className="text-xs text-muted-foreground">Net Balance</p>
                  <p className={`font-bold ${monthlySummary.netBalance >= 0 ? "text-blue-700" : "text-amber-700"}`}>{monthlySummary.netBalance >= 0 ? "+" : ""}£{monthlySummary.netBalance.toFixed(2)}</p>
                </div>
              </div>

              {/* Unbanked tally */}
              {(monthlySummary.unbankedCash > 0 || monthlySummary.unbankedCheques > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-2">⚠ Unbanked Payments</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1"><Banknote className="h-3 w-3 text-amber-600" /> Cash: <strong>£{monthlySummary.unbankedCash.toFixed(2)}</strong></div>
                    <div className="flex items-center gap-1"><CreditCard className="h-3 w-3 text-amber-600" /> Cheques: <strong>£{monthlySummary.unbankedCheques.toFixed(2)}</strong></div>
                  </div>
                  <p className="text-xs text-amber-700 mt-1">Total unbanked: <strong>£{monthlySummary.unbankedTotal.toFixed(2)}</strong></p>
                </div>
              )}

              {/* Income breakdown */}
              {monthlySummary.income.breakdown.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Income Breakdown</p>
                  <div className="divide-y border rounded-lg overflow-hidden">
                    {monthlySummary.income.breakdown.map((item, i) => (
                      <div key={i} className="flex justify-between items-center px-3 py-2 text-sm">
                        <div>
                          <span className="font-medium">{item.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">{item.category}</span>
                        </div>
                        <span className="font-semibold text-green-700">+£{item.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payroll breakdown */}
              {monthlySummary.expenses.payroll.records.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payroll (£{monthlySummary.expenses.payroll.total.toFixed(2)})</p>
                  <div className="divide-y border rounded-lg overflow-hidden">
                    {monthlySummary.expenses.payroll.records.map((r, i) => (
                      <div key={i} className="flex justify-between items-center px-3 py-2 text-sm">
                        <div>
                          <span className="font-medium">{r.name}</span>
                          <span className={`text-xs ml-2 px-1.5 py-0.5 rounded ${r.status === "paid" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{r.status}</span>
                        </div>
                        <span className="font-semibold text-red-700">-£{r.net.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Receipts/expenses breakdown */}
              {monthlySummary.expenses.receipts.records.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Department Expenses (£{monthlySummary.expenses.receipts.total.toFixed(2)})</p>
                  <div className="divide-y border rounded-lg overflow-hidden">
                    {monthlySummary.expenses.receipts.records.map((r, i) => (
                      <div key={i} className="flex justify-between items-center px-3 py-2 text-sm">
                        <div>
                          <span className="font-medium">{r.vendor}</span>
                          <span className="text-xs text-muted-foreground ml-2">{r.department} · {r.category}</span>
                        </div>
                        <span className="font-semibold text-red-700">-£{r.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function printMonthlySummary(summary: any, month: number, year: number) {
  if (!summary) return;
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthName = MONTHS[month - 1];
  const fmt = (v: number) => "\u00a3" + v.toLocaleString("en-GB", { minimumFractionDigits: 2 });
  const incomeRows = summary.income.breakdown.map((r: any) =>
    "<tr><td>" + r.label + "</td><td>" + r.category + "</td><td style='text-align:right;color:#16a34a'>" + fmt(r.amount) + "</td></tr>"
  ).join("");
  const payrollRows = summary.expenses.payroll.records.map((r: any) =>
    "<tr><td>" + r.name + "</td><td>Payroll \u00b7 " + r.method + " \u00b7 " + r.status + "</td><td style='text-align:right;color:#dc2626'>" + fmt(r.net) + "</td></tr>"
  ).join("");
  const receiptRows = summary.expenses.receipts.records.map((r: any) =>
    "<tr><td>" + r.vendor + "</td><td>" + r.department + " \u00b7 " + r.category + "</td><td style='text-align:right;color:#dc2626'>" + fmt(r.amount) + "</td></tr>"
  ).join("");
  const balColor = summary.netBalance >= 0 ? "#1d4ed8" : "#d97706";
  const balSign = summary.netBalance >= 0 ? "+" : "";
  const unbankedHtml = summary.unbankedTotal > 0
    ? "<div class='warn'>\u26a0 Unbanked payments: Cash " + fmt(summary.unbankedCash) + " \u00b7 Cheques " + fmt(summary.unbankedCheques) + " \u00b7 Total " + fmt(summary.unbankedTotal) + "</div>"
    : "";
  const parts = [
    "<!DOCTYPE html><html><head><title>Monthly Summary \u2014 " + monthName + " " + year + "</title>",
    "<style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:24px}",
    "h1{font-size:20px;margin-bottom:2px}h2{font-size:13px;margin:18px 0 6px;color:#1a4731}",
    "table{width:100%;border-collapse:collapse;margin-bottom:12px}",
    "th{background:#1a4731;color:#fff;padding:6px 10px;text-align:left;font-size:11px}",
    "td{padding:5px 10px;border-bottom:1px solid #eee}tr:nth-child(even)td{background:#f9fafb}",
    ".summary{display:flex;gap:16px;margin:16px 0}.stat{background:#f5f7fa;padding:10px 16px;border-radius:8px;flex:1}",
    ".stat-val{font-size:18px;font-weight:bold}.stat-lbl{font-size:10px;color:#666;margin-top:2px}",
    ".warn{background:#fffbeb;border:1px solid #fcd34d;padding:10px 16px;border-radius:8px;margin-bottom:16px}",
    "@media print{body{margin:0}}</style></head><body>",
    "<h1>Monthly Income &amp; Expenses Summary</h1>",
    "<p style='color:#666;margin-bottom:16px'>Abdullah Quilliam Society &middot; " + monthName + " " + year + "</p>",
    "<div class='summary'>",
    "<div class='stat'><div class='stat-val' style='color:#16a34a'>" + fmt(summary.income.total) + "</div><div class='stat-lbl'>Total Income</div></div>",
    "<div class='stat'><div class='stat-val' style='color:#dc2626'>" + fmt(summary.expenses.total) + "</div><div class='stat-lbl'>Total Expenses</div></div>",
    "<div class='stat'><div class='stat-val' style='color:" + balColor + "'>" + balSign + fmt(summary.netBalance) + "</div><div class='stat-lbl'>Net Balance</div></div>",
    "</div>",
    unbankedHtml,
    "<h2>Income</h2>",
    "<table><thead><tr><th>Description</th><th>Category</th><th style='text-align:right'>Amount</th></tr></thead>",
    "<tbody>" + (incomeRows || "<tr><td colspan=3>No income records</td></tr>") + "</tbody>",
    "<tfoot><tr><td colspan='2' style='font-weight:bold;padding:6px 10px'>Total Income</td><td style='font-weight:bold;text-align:right;padding:6px 10px;color:#16a34a'>" + fmt(summary.income.total) + "</td></tr></tfoot></table>",
    "<h2>Payroll</h2>",
    "<table><thead><tr><th>Employee</th><th>Details</th><th style='text-align:right'>Net Pay</th></tr></thead>",
    "<tbody>" + (payrollRows || "<tr><td colspan=3>No payroll records</td></tr>") + "</tbody>",
    "<tfoot><tr><td colspan='2' style='font-weight:bold;padding:6px 10px'>Total Payroll</td><td style='font-weight:bold;text-align:right;padding:6px 10px;color:#dc2626'>" + fmt(summary.expenses.payroll.total) + "</td></tr></tfoot></table>",
    "<h2>Department Expenses</h2>",
    "<table><thead><tr><th>Vendor</th><th>Department \u00b7 Category</th><th style='text-align:right'>Amount</th></tr></thead>",
    "<tbody>" + (receiptRows || "<tr><td colspan=3>No expense records</td></tr>") + "</tbody>",
    "<tfoot><tr><td colspan='2' style='font-weight:bold;padding:6px 10px'>Total Expenses</td><td style='font-weight:bold;text-align:right;padding:6px 10px;color:#dc2626'>" + fmt(summary.expenses.receipts.total) + "</td></tr></tfoot></table>",
    "</body></html>",
  ];
  const html = parts.join("");
  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); win.print(); }
}
