import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Download, FileText, FileSpreadsheet, BarChart3, Calendar, TrendingDown, TrendingUp } from "lucide-react";
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
          <Button
            onClick={handleExportCsv}
            disabled={isExporting}
            className="gap-2"
            variant="outline"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export as CSV
          </Button>
          <Button
            onClick={handleExportPdf}
            disabled={isExporting}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Export as PDF
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
