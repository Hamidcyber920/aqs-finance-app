import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, PoundSterling, CheckCircle, XCircle,
  Clock, AlertTriangle, BarChart3, FileText, Download, Send,
  ChevronLeft, ChevronRight, CheckSquare, Square, Loader2,
  Building2, Tag, ShieldCheck,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const CHART_COLORS = ["#1a4731", "#c9a84c", "#2563eb", "#7c3aed", "#dc2626", "#059669", "#d97706", "#0891b2"];

function fmtGBP(n: number) {
  return `£${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getMonthName(month: number) {
  return new Date(2000, month - 1, 1).toLocaleString("en-GB", { month: "long" });
}

export default function TrusteeDashboard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [closeReportOpen, setCloseReportOpen] = useState(false);
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
  const [sendToTrustees, setSendToTrustees] = useState(false);
  const [approveNoteId, setApproveNoteId] = useState<number | null>(null);
  const [approveNote, setApproveNote] = useState("");

  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.trusteeFinance.dashboard.useQuery(
    { year, month },
    { refetchOnWindowFocus: false }
  );

  const approveMutation = trpc.trusteeFinance.approveExpense.useMutation({
    onSuccess: (res) => {
      toast.success(`Approved by ${res.approvedBy}`);
      setApproveNoteId(null);
      setApproveNote("");
      utils.trusteeFinance.dashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMutation = trpc.trusteeFinance.rejectExpense.useMutation({
    onSuccess: () => {
      toast.success("Expense rejected");
      setRejectId(null);
      setRejectReason("");
      utils.trusteeFinance.dashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkApproveMutation = trpc.trusteeFinance.bulkApprove.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.approved} expense(s) approved`);
      setSelectedIds([]);
      utils.trusteeFinance.dashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const closeReportMutation = trpc.trusteeFinance.generateMonthlyCloseReport.useMutation({
    onSuccess: (res) => {
      toast.success(`Report generated${res.emailsSent > 0 ? ` — ${res.emailsSent} email(s) sent` : ""}`);
      window.open(res.url, "_blank");
      setCloseReportOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (!data?.pendingApprovals) return;
    if (selectedIds.length === data.pendingApprovals.length) setSelectedIds([]);
    else setSelectedIds(data.pendingApprovals.map(r => r.id));
  };

  const years = useMemo(() => {
    const arr = [];
    for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 1; y++) arr.push(y);
    return arr;
  }, []);

  const months = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: getMonthName(i + 1) })),
    []
  );

  const totals = data?.totals;
  const netPositive = (totals?.netPosition ?? 0) >= 0;

  return (
      <div className="p-6 space-y-6">
        {/* - Header - */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#1a4731] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-[#c9a84c]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Trustee Financial Dashboard</h1>
              <p className="text-sm text-gray-500">Budget vs actuals, income, expenses, approval queue</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="font-semibold text-gray-800 min-w-[140px] text-center">
              {getMonthName(month)} {year}
            </span>
            <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
            <Button
              className="ml-2 bg-[#1a4731] hover:bg-[#1a4731]/90 text-white"
              onClick={() => setCloseReportOpen(true)}
            >
              <FileText className="w-4 h-4 mr-2" />
              Monthly Close Report
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#1a4731]" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            Failed to load dashboard: {error.message}
          </div>
        )}

        {data && (
          <>
            {/* - Summary Cards - */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <SummaryCard
                label="Total Income"
                value={fmtGBP(totals?.income ?? 0)}
                icon={<TrendingUp className="w-5 h-5 text-green-600" />}
                color="border-l-green-500"
              />
              <SummaryCard
                label="Total Expenses"
                value={fmtGBP(totals?.expenses ?? 0)}
                icon={<TrendingDown className="w-5 h-5 text-red-500" />}
                color="border-l-red-500"
              />
              <SummaryCard
                label="Bills Paid"
                value={fmtGBP(totals?.bills ?? 0)}
                icon={<PoundSterling className="w-5 h-5 text-blue-500" />}
                color="border-l-blue-500"
              />
              <SummaryCard
                label="DD Paid"
                value={fmtGBP(totals?.scheduledPaid ?? 0)}
                icon={<CheckCircle className="w-5 h-5 text-purple-500" />}
                color="border-l-purple-500"
              />
              <SummaryCard
                label="Payments Held"
                value={fmtGBP(totals?.scheduledHeld ?? 0)}
                icon={<Clock className="w-5 h-5 text-amber-500" />}
                color="border-l-amber-500"
              />
              <SummaryCard
                label="Net Position"
                value={(totals?.netPosition ?? 0) < 0 ? `-${fmtGBP(totals?.netPosition ?? 0)}` : fmtGBP(totals?.netPosition ?? 0)}
                icon={netPositive ? <TrendingUp className="w-5 h-5 text-green-600" /> : <TrendingDown className="w-5 h-5 text-red-500" />}
                color={netPositive ? "border-l-green-500" : "border-l-red-500"}
                highlight
              />
            </div>

            {/* - Charts Row - */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Category breakdown */}
              {data.categoryBreakdown.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Tag className="w-4 h-4 text-[#1a4731]" />
                      Expenses by Category
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={data.categoryBreakdown} margin={{ top: 0, right: 8, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="category" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `£${v}`} />
                        <Tooltip formatter={(v: number) => fmtGBP(v)} />
                        <Bar dataKey="amount" fill="#1a4731" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Building breakdown */}
              {data.buildingBreakdown.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-[#1a4731]" />
                      Bills by Building
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={data.buildingBreakdown}
                          dataKey="amount"
                          nameKey="building"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ building, percent }) => `${building} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {data.buildingBreakdown.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmtGBP(v)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* - Budget vs Actuals - */}
            {data.budgetVsActuals.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-[#1a4731]" />
                    Budget vs Actuals
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-gray-500 uppercase">
                          <th className="text-left py-2 pr-4">Account</th>
                          <th className="text-left py-2 pr-4">Building</th>
                          <th className="text-right py-2 pr-4">Budget</th>
                          <th className="text-right py-2 pr-4">Actual</th>
                          <th className="text-right py-2 pr-4">Variance</th>
                          <th className="text-left py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.budgetVsActuals.map((row, i) => (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            <td className="py-2 pr-4 font-medium">{row.supplier}</td>
                            <td className="py-2 pr-4 text-gray-500">{row.building ?? "—"}</td>
                            <td className="py-2 pr-4 text-right">{fmtGBP(row.budget)}</td>
                            <td className="py-2 pr-4 text-right">{fmtGBP(row.actual)}</td>
                            <td className={`py-2 pr-4 text-right font-semibold ${row.variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {row.variance >= 0 ? "+" : "-"}{fmtGBP(Math.abs(row.variance))}
                            </td>
                            <td className="py-2">
                              {row.actual === 0 ? (
                                <Badge variant="outline" className="text-gray-500">No bills</Badge>
                              ) : row.variance >= 0 ? (
                                <Badge className="bg-green-100 text-green-800 border-green-200">Under budget</Badge>
                              ) : (
                                <Badge className="bg-red-100 text-red-800 border-red-200">Over budget</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* - Pending Approvals - */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Pending Approvals
                    {data.pendingApprovals.length > 0 && (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200 ml-1">
                        {data.pendingApprovals.length}
                      </Badge>
                    )}
                  </CardTitle>
                  {selectedIds.length > 0 && (
                    <Button
                      size="sm"
                      className="bg-[#1a4731] hover:bg-[#1a4731]/90 text-white"
                      onClick={() => bulkApproveMutation.mutate({ ids: selectedIds })}
                      disabled={bulkApproveMutation.isPending}
                    >
                      {bulkApproveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                      Approve {selectedIds.length} selected
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {data.pendingApprovals.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                    <p className="text-sm">No pending approvals — all clear!</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-gray-500 uppercase">
                          <th className="py-2 pr-2 w-8">
                            <button onClick={toggleAll} className="text-gray-400 hover:text-gray-700">
                              {selectedIds.length === data.pendingApprovals.length
                                ? <CheckSquare className="w-4 h-4" />
                                : <Square className="w-4 h-4" />}
                            </button>
                          </th>
                          <th className="text-left py-2 pr-4">Date</th>
                          <th className="text-left py-2 pr-4">Vendor</th>
                          <th className="text-left py-2 pr-4">Category</th>
                          <th className="text-right py-2 pr-4">Amount</th>
                          <th className="text-left py-2 pr-4">Status</th>
                          <th className="text-left py-2 pr-4">Source</th>
                          <th className="text-right py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.pendingApprovals.map(row => (
                          <tr key={row.id} className="border-b hover:bg-gray-50">
                            <td className="py-2 pr-2">
                              <button onClick={() => toggleSelect(row.id)} className="text-gray-400 hover:text-gray-700">
                                {selectedIds.includes(row.id)
                                  ? <CheckSquare className="w-4 h-4 text-[#1a4731]" />
                                  : <Square className="w-4 h-4" />}
                              </button>
                            </td>
                            <td className="py-2 pr-4 text-gray-600">
                              {row.receiptDate ? new Date(row.receiptDate).toLocaleDateString("en-GB") : "—"}
                            </td>
                            <td className="py-2 pr-4 font-medium">{row.vendor ?? "—"}</td>
                            <td className="py-2 pr-4 text-gray-500">{row.categoryName ?? "—"}</td>
                            <td className="py-2 pr-4 text-right font-semibold">
                              {fmtGBP(parseFloat(row.amount ?? "0"))}
                            </td>
                            <td className="py-2 pr-4">
                              <Badge className={
                                row.status === "pending"
                                  ? "bg-amber-100 text-amber-800 border-amber-200"
                                  : "bg-blue-100 text-blue-800 border-blue-200"
                              }>
                                {row.status}
                              </Badge>
                            </td>
                            <td className="py-2 pr-4">
                              {row.expenseSource && row.expenseSource !== "manual" && (
                                <Badge variant="outline" className="text-xs">
                                  {row.expenseSource === "auto_bill" ? "AUTO•BILL" :
                                    row.expenseSource === "auto_lbmw_invoice" ? "AUTO•LBMW" : row.expenseSource}
                                </Badge>
                              )}
                            </td>
                            <td className="py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-green-700 border-green-300 hover:bg-green-50"
                                  onClick={() => { setApproveNoteId(row.id); setApproveNote(""); }}
                                  disabled={approveMutation.isPending}
                                >
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-red-700 border-red-300 hover:bg-red-50"
                                  onClick={() => { setRejectId(row.id); setRejectReason(""); }}
                                  disabled={rejectMutation.isPending}
                                >
                                  <XCircle className="w-3 h-3 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* - Approve with note dialog - */}
      <Dialog open={approveNoteId !== null} onOpenChange={open => { if (!open) setApproveNoteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Note (optional)</Label>
            <Textarea
              placeholder="Add a note for the approval record..."
              value={approveNote}
              onChange={e => setApproveNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveNoteId(null)}>Cancel</Button>
            <Button
              className="bg-[#1a4731] hover:bg-[#1a4731]/90 text-white"
              onClick={() => approveMutation.mutate({ id: approveNoteId!, note: approveNote || undefined })}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Confirm Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* - Reject dialog - */}
      <Dialog open={rejectId !== null} onOpenChange={open => { if (!open) setRejectId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Reason for rejection *</Label>
            <Textarea
              placeholder="Please provide a reason for rejecting this expense..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate({ id: rejectId!, reason: rejectReason })}
              disabled={rejectMutation.isPending || !rejectReason.trim()}
            >
              {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* - Monthly Close Report dialog - */}
      <Dialog open={closeReportOpen} onOpenChange={setCloseReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#1a4731]" />
              Generate Monthly Close Report
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Generate a comprehensive PDF financial close report for the selected month, including income, expenses, bills, scheduled payments, and pending approvals.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Year</Label>
                <Select value={String(reportYear)} onValueChange={v => setReportYear(Number(v))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Month</Label>
                <Select value={String(reportMonth)} onValueChange={v => setReportMonth(Number(v))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map(m => (
                      <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <Switch
                checked={sendToTrustees}
                onCheckedChange={setSendToTrustees}
                id="send-trustees"
              />
              <div>
                <Label htmlFor="send-trustees" className="cursor-pointer font-medium">Send to Trustees</Label>
                <p className="text-xs text-gray-500">Email the PDF report to all trustees and admins</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseReportOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#1a4731] hover:bg-[#1a4731]/90 text-white"
              onClick={() => closeReportMutation.mutate({ year: reportYear, month: reportMonth, sendToTrustees })}
              disabled={closeReportMutation.isPending}
            >
              {closeReportMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating...</>
                : <><Download className="w-4 h-4 mr-2" />{sendToTrustees ? "Generate & Send" : "Generate PDF"}</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}

// - Summary Card component -
function SummaryCard({
  label, value, icon, color, highlight,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`border-l-4 ${color} ${highlight ? "ring-2 ring-offset-1 ring-[#1a4731]/20" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          {icon}
        </div>
        <div className={`text-lg font-bold ${highlight ? "text-[#1a4731]" : "text-gray-900"}`}>{value}</div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
}
