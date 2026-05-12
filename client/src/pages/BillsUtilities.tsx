import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Zap, Droplets, Flame, Wifi, Phone, Shield, MoreHorizontal,
  AlertTriangle, CheckCircle, Clock, Trash2, Edit2, FileText,
  ChevronLeft, ChevronRight, CalendarDays,
} from "lucide-react";

const BUILDINGS = ["QLH", "Bistro", "Accommodation", "Other"] as const;
const CATEGORIES = ["electricity", "gas", "water", "broadband", "telephone", "insurance", "other"] as const;

const categoryIcon = (cat: string) => {
  switch (cat) {
    case "electricity": return <Zap className="w-4 h-4 text-yellow-500" />;
    case "gas": return <Flame className="w-4 h-4 text-orange-500" />;
    case "water": return <Droplets className="w-4 h-4 text-blue-500" />;
    case "broadband": return <Wifi className="w-4 h-4 text-purple-500" />;
    case "telephone": return <Phone className="w-4 h-4 text-green-500" />;
    case "insurance": return <Shield className="w-4 h-4 text-indigo-500" />;
    default: return <MoreHorizontal className="w-4 h-4 text-gray-500" />;
  }
};

const categoryBg = (cat: string) => {
  const map: Record<string, string> = {
    electricity: "bg-yellow-100 text-yellow-800 border-yellow-300",
    gas: "bg-orange-100 text-orange-800 border-orange-300",
    water: "bg-blue-100 text-blue-800 border-blue-300",
    broadband: "bg-purple-100 text-purple-800 border-purple-300",
    telephone: "bg-green-100 text-green-800 border-green-300",
    insurance: "bg-indigo-100 text-indigo-800 border-indigo-300",
    other: "bg-gray-100 text-gray-800 border-gray-300",
  };
  return map[cat] ?? "bg-gray-100 text-gray-800 border-gray-300";
};

// ── DD Calendar Component ─────────────────────────────────────────────────────
function DDCalendar({ accounts }: { accounts: any[] }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const accountsWithDD = useMemo(
    () => accounts.filter(a => a.billingDay && a.directDebitAmount),
    [accounts]
  );

  // Build a map: day → list of accounts
  const ddByDay = useMemo(() => {
    const map: Record<number, typeof accountsWithDD> = {};
    for (const acc of accountsWithDD) {
      const day = acc.billingDay as number;
      if (!map[day]) map[day] = [];
      map[day].push(acc);
    }
    return map;
  }, [accountsWithDD]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  // Adjust to Mon-first (UK)
  const startOffset = (firstDayOfWeek + 6) % 7;

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString("default", { month: "long", year: "numeric" });

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const totalDDThisMonth = accountsWithDD.reduce((s, a) => s + parseFloat(a.directDebitAmount ?? "0"), 0);

  // Compute upcoming DDs (next 7 days from today)
  const upcoming = useMemo(() => {
    const results: { acc: any; date: Date }[] = [];
    for (let offset = 0; offset <= 7; offset++) {
      const d = new Date(today);
      d.setDate(today.getDate() + offset);
      const day = d.getDate();
      if (ddByDay[day]) {
        for (const acc of ddByDay[day]) {
          results.push({ acc, date: new Date(d.getFullYear(), d.getMonth(), day) });
        }
      }
    }
    return results.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [ddByDay]);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex flex-wrap gap-3">
        <Card className="flex-1 min-w-[180px]">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Accounts with DD dates</p>
            <p className="text-2xl font-bold">{accountsWithDD.length}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[180px]">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total monthly DD</p>
            <p className="text-2xl font-bold text-green-600">£{totalDDThisMonth.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        {upcoming.length > 0 && (
          <Card className="flex-1 min-w-[220px] border-amber-300">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Next DD due</p>
              <p className="text-sm font-semibold text-amber-700">
                {upcoming[0].acc.supplier} — {upcoming[0].date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </p>
              <p className="text-xs text-muted-foreground">£{parseFloat(upcoming[0].acc.directDebitAmount).toFixed(2)}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Calendar grid */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
            <CardTitle className="text-base">{monthName} — Direct Debit Calendar</CardTitle>
            <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {accountsWithDD.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No accounts have a billing day set.</p>
              <p className="text-xs mt-1">Edit an account and set the "DD Day" field to populate this calendar.</p>
            </div>
          ) : (
            <>
              {/* Day-of-week headers (Mon–Sun) */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              {/* Calendar cells */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells before month start */}
                {Array.from({ length: startOffset }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[72px]" />
                ))}
                {/* Day cells */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                  const ddAccounts = ddByDay[day] ?? [];
                  return (
                    <div
                      key={day}
                      className={`min-h-[72px] rounded-lg border p-1 text-xs transition-colors ${
                        isToday ? "border-primary bg-primary/5" : "border-border"
                      } ${ddAccounts.length > 0 ? "bg-muted/30" : ""}`}
                    >
                      <div className={`font-semibold mb-1 ${isToday ? "text-primary" : "text-foreground"}`}>{day}</div>
                      <div className="space-y-0.5">
                        {ddAccounts.map(acc => (
                          <div
                            key={acc.id}
                            title={`${acc.supplier} — £${parseFloat(acc.directDebitAmount).toFixed(2)}/mo`}
                            className={`rounded px-1 py-0.5 text-[10px] leading-tight border truncate ${categoryBg(acc.category)}`}
                          >
                            <span className="font-medium">{acc.supplier}</span>
                            <span className="ml-1 opacity-75">£{parseFloat(acc.directDebitAmount).toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Upcoming DDs list */}
      {upcoming.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Upcoming Direct Debits (Next 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcoming.map(({ acc, date }) => (
                <div key={`${acc.id}-${date.toISOString()}`} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                  <div className="flex items-center gap-2">
                    {categoryIcon(acc.category)}
                    <div>
                      <p className="font-medium">{acc.supplier}</p>
                      <p className="text-xs text-muted-foreground">{acc.building} · {acc.category}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600">£{parseFloat(acc.directDebitAmount).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {CATEGORIES.map(cat => (
          <span key={cat} className={`px-2 py-1 rounded border ${categoryBg(cat)} flex items-center gap-1`}>
            {categoryIcon(cat)} {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BillsUtilities() {
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddBill, setShowAddBill] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [editAccount, setEditAccount] = useState<any>(null);

  // Form state for new account
  const [accountForm, setAccountForm] = useState({
    building: "QLH" as typeof BUILDINGS[number],
    supplier: "",
    accountNumber: "",
    category: "electricity" as typeof CATEGORIES[number],
    tariff: "",
    contractStartDate: "",
    contractEndDate: "",
    mpan: "",
    directDebitAmount: "",
    billingDay: "",
    notes: "",
  });

  // Form state for new bill
  const [billForm, setBillForm] = useState({
    accountId: 0,
    billDate: new Date().toISOString().split("T")[0],
    periodStart: "",
    periodEnd: "",
    amount: "",
    consumptionUnits: "",
    unitType: "",
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: summary } = trpc.bills.summary.useQuery();
  const { data: accounts = [], isLoading } = trpc.bills.listAccounts.useQuery(
    buildingFilter !== "all" || categoryFilter !== "all"
      ? { building: buildingFilter !== "all" ? buildingFilter : undefined, category: categoryFilter !== "all" ? categoryFilter : undefined }
      : undefined
  );
  // For calendar we always need all accounts (unfiltered)
  const { data: allAccounts = [] } = trpc.bills.listAccounts.useQuery(undefined);

  const { data: accountDetail } = trpc.bills.getAccount.useQuery(
    { id: selectedAccountId! },
    { enabled: !!selectedAccountId }
  );

  const createAccount = trpc.bills.createAccount.useMutation({
    onSuccess: () => {
      utils.bills.listAccounts.invalidate();
      utils.bills.summary.invalidate();
      setShowAddAccount(false);
      setAccountForm({ building: "QLH", supplier: "", accountNumber: "", category: "electricity", tariff: "", contractStartDate: "", contractEndDate: "", mpan: "", directDebitAmount: "", billingDay: "", notes: "" });
      toast.success("Account added — utility account created successfully.");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateAccount = trpc.bills.updateAccount.useMutation({
    onSuccess: () => {
      utils.bills.listAccounts.invalidate();
      utils.bills.summary.invalidate();
      setEditAccount(null);
      toast.success("Account updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteAccount = trpc.bills.deleteAccount.useMutation({
    onSuccess: () => {
      utils.bills.listAccounts.invalidate();
      utils.bills.summary.invalidate();
      setSelectedAccountId(null);
      toast.success("Account deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const addBill = trpc.bills.addBill.useMutation({
    onSuccess: (data) => {
      utils.bills.getAccount.invalidate({ id: billForm.accountId });
      utils.bills.summary.invalidate();
      setShowAddBill(false);
      setBillForm({ accountId: 0, billDate: new Date().toISOString().split("T")[0], periodStart: "", periodEnd: "", amount: "", consumptionUnits: "", unitType: "", notes: "" });
      if (data.isAnomaly) {
        toast.warning(`⚠️ Anomaly Detected — This bill (£${parseFloat(billForm.amount).toFixed(2)}) is 50%+ above the 3-month average (£${data.avg3m}).`);
      } else {
        toast.success("Bill recorded — utility bill added successfully.");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteBill = trpc.bills.deleteBill.useMutation({
    onSuccess: () => {
      utils.bills.getAccount.invalidate({ id: selectedAccountId! });
      toast.success("Bill deleted");
    },
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Bills & Utilities</h1>
            <p className="text-muted-foreground text-sm mt-1">Track utility accounts and bills across all AQS buildings</p>
          </div>
          <Button onClick={() => setShowAddAccount(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Account
          </Button>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total Accounts</p>
                <p className="text-2xl font-bold">{summary.totalAccounts}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Monthly Direct Debits</p>
                <p className="text-2xl font-bold text-green-600">£{parseFloat(summary.totalMonthlyDD).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className={summary.expiringSoon > 0 ? "border-amber-400" : ""}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Contracts Expiring Soon</p>
                <p className={`text-2xl font-bold ${summary.expiringSoon > 0 ? "text-amber-600" : ""}`}>{summary.expiringSoon}</p>
              </CardContent>
            </Card>
            <Card className={summary.expired > 0 ? "border-red-400" : ""}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Contracts Expired</p>
                <p className={`text-2xl font-bold ${summary.expired > 0 ? "text-red-600" : ""}`}>{summary.expired}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Building breakdown */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {summary.byBuilding.map(b => (
              <Card key={b.building} className="cursor-pointer hover:border-primary transition-colors" onClick={() => setBuildingFilter(buildingFilter === b.building ? "all" : b.building)}>
                <CardContent className="pt-3 pb-3">
                  <p className="text-xs font-medium text-muted-foreground">{b.building}</p>
                  <p className="text-lg font-semibold">{b.count} accounts</p>
                  <p className="text-xs text-muted-foreground">£{parseFloat(b.totalDD).toLocaleString()}/mo DD</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Main Tabs */}
        <Tabs defaultValue="accounts">
          <TabsList>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="calendar">DD Calendar</TabsTrigger>
          </TabsList>

          {/* ── Accounts Tab ── */}
          <TabsContent value="accounts" className="mt-4 space-y-4">
            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              <Select value={buildingFilter} onValueChange={setBuildingFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Buildings" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Buildings</SelectItem>
                  {BUILDINGS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Accounts list + detail panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Accounts list */}
              <div className="lg:col-span-1 space-y-2">
                {isLoading && <p className="text-muted-foreground text-sm">Loading accounts...</p>}
                {accounts.length === 0 && !isLoading && (
                  <Card>
                    <CardContent className="pt-6 text-center text-muted-foreground text-sm">
                      No utility accounts yet. Click "Add Account" to get started.
                    </CardContent>
                  </Card>
                )}
                {accounts.map(acc => (
                  <Card
                    key={acc.id}
                    className={`cursor-pointer transition-colors hover:border-primary ${selectedAccountId === acc.id ? "border-primary bg-primary/5" : ""} ${acc.contractExpired ? "border-red-300" : acc.contractExpiringSoon ? "border-amber-300" : ""}`}
                    onClick={() => setSelectedAccountId(acc.id === selectedAccountId ? null : acc.id)}
                  >
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {categoryIcon(acc.category)}
                          <div>
                            <p className="font-medium text-sm">{acc.supplier}</p>
                            <p className="text-xs text-muted-foreground">{acc.building} · {acc.category}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {acc.directDebitAmount && <p className="text-sm font-semibold">£{parseFloat(acc.directDebitAmount).toFixed(0)}/mo</p>}
                          {acc.billingDay && <p className="text-xs text-muted-foreground">DD: {acc.billingDay}th</p>}
                          {acc.contractExpired && <Badge variant="destructive" className="text-xs">Expired</Badge>}
                          {acc.contractExpiringSoon && !acc.contractExpired && <Badge className="text-xs bg-amber-100 text-amber-800">Expiring Soon</Badge>}
                        </div>
                      </div>
                      {acc.accountNumber && <p className="text-xs text-muted-foreground mt-1">Acc: {acc.accountNumber}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Account detail */}
              <div className="lg:col-span-2">
                {!selectedAccountId && (
                  <Card className="h-full flex items-center justify-center">
                    <CardContent className="text-center text-muted-foreground py-12">
                      <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p>Select an account to view details and bills</p>
                    </CardContent>
                  </Card>
                )}
                {selectedAccountId && accountDetail && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            {categoryIcon(accountDetail.account.category)}
                            {accountDetail.account.supplier}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">{accountDetail.account.building} · {accountDetail.account.category}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setEditAccount(accountDetail.account); }}>
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => {
                            setBillForm(f => ({ ...f, accountId: selectedAccountId }));
                            setShowAddBill(true);
                          }}>
                            <Plus className="w-3 h-3 mr-1" /> Bill
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => {
                            if (confirm("Delete this account and all its bills?")) deleteAccount.mutate({ id: selectedAccountId });
                          }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Account details */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {accountDetail.account.accountNumber && <div><span className="text-muted-foreground">Account No:</span> <span className="font-medium">{accountDetail.account.accountNumber}</span></div>}
                        {accountDetail.account.mpan && <div><span className="text-muted-foreground">MPAN:</span> <span className="font-medium">{accountDetail.account.mpan}</span></div>}
                        {accountDetail.account.tariff && <div><span className="text-muted-foreground">Tariff:</span> <span className="font-medium">{accountDetail.account.tariff}</span></div>}
                        {accountDetail.account.directDebitAmount && <div><span className="text-muted-foreground">Direct Debit:</span> <span className="font-medium text-green-600">£{parseFloat(accountDetail.account.directDebitAmount).toFixed(2)}/mo</span></div>}
                        {accountDetail.account.billingDay && <div><span className="text-muted-foreground">DD Day:</span> <span className="font-medium">{accountDetail.account.billingDay}{["st","nd","rd"][accountDetail.account.billingDay - 1] ?? "th"} of month</span></div>}
                        {accountDetail.account.contractStartDate && <div><span className="text-muted-foreground">Contract Start:</span> <span className="font-medium">{new Date(accountDetail.account.contractStartDate).toLocaleDateString()}</span></div>}
                        {accountDetail.account.contractEndDate && <div><span className="text-muted-foreground">Contract End:</span> <span className={`font-medium ${new Date(accountDetail.account.contractEndDate) < new Date() ? "text-red-600" : ""}`}>{new Date(accountDetail.account.contractEndDate).toLocaleDateString()}</span></div>}
                        {accountDetail.avg3m !== null && <div><span className="text-muted-foreground">3-Month Avg:</span> <span className="font-medium">£{parseFloat(accountDetail.avg3m!.toString()).toFixed(2)}</span></div>}
                      </div>
                      {accountDetail.account.notes && <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{accountDetail.account.notes}</p>}

                      {/* Bills history */}
                      <div>
                        <h3 className="font-medium text-sm mb-2">Bill History</h3>
                        {accountDetail.bills.length === 0 && <p className="text-sm text-muted-foreground">No bills recorded yet.</p>}
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {accountDetail.bills.map(bill => (
                            <div key={bill.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                              <div>
                                <span className="font-medium">£{parseFloat(bill.amount).toFixed(2)}</span>
                                <span className="text-muted-foreground ml-2">{new Date(bill.billDate).toLocaleDateString()}</span>
                                {bill.consumptionUnits && <span className="text-muted-foreground ml-2">{bill.consumptionUnits} {bill.unitType}</span>}
                              </div>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => deleteBill.mutate({ id: bill.id })}>
                                <Trash2 className="w-3 h-3 text-red-500" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── DD Calendar Tab ── */}
          <TabsContent value="calendar" className="mt-4">
            <DDCalendar accounts={allAccounts} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Account Dialog */}
      <Dialog open={showAddAccount} onOpenChange={setShowAddAccount}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Utility Account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Building *</Label>
                <Select value={accountForm.building} onValueChange={v => setAccountForm(f => ({ ...f, building: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BUILDINGS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category *</Label>
                <Select value={accountForm.category} onValueChange={v => setAccountForm(f => ({ ...f, category: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Supplier *</Label>
              <Input value={accountForm.supplier} onChange={e => setAccountForm(f => ({ ...f, supplier: e.target.value }))} placeholder="e.g. British Gas" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Account Number</Label>
                <Input value={accountForm.accountNumber} onChange={e => setAccountForm(f => ({ ...f, accountNumber: e.target.value }))} />
              </div>
              <div>
                <Label>MPAN / Meter Ref</Label>
                <Input value={accountForm.mpan} onChange={e => setAccountForm(f => ({ ...f, mpan: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Tariff / Plan</Label>
              <Input value={accountForm.tariff} onChange={e => setAccountForm(f => ({ ...f, tariff: e.target.value }))} placeholder="e.g. Standard Variable" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contract Start</Label>
                <Input type="date" value={accountForm.contractStartDate} onChange={e => setAccountForm(f => ({ ...f, contractStartDate: e.target.value }))} />
              </div>
              <div>
                <Label>Contract End</Label>
                <Input type="date" value={accountForm.contractEndDate} onChange={e => setAccountForm(f => ({ ...f, contractEndDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Monthly Direct Debit (£)</Label>
                <Input type="number" step="0.01" value={accountForm.directDebitAmount} onChange={e => setAccountForm(f => ({ ...f, directDebitAmount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <Label>DD Day of Month (1–31)</Label>
                <Input type="number" min="1" max="31" value={accountForm.billingDay} onChange={e => setAccountForm(f => ({ ...f, billingDay: e.target.value }))} placeholder="e.g. 15" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={accountForm.notes} onChange={e => setAccountForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddAccount(false)}>Cancel</Button>
            <Button
              onClick={() => createAccount.mutate({
                ...accountForm,
                billingDay: accountForm.billingDay ? parseInt(accountForm.billingDay) : undefined,
              })}
              disabled={!accountForm.supplier || createAccount.isPending}
            >
              {createAccount.isPending ? "Adding..." : "Add Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Account Dialog */}
      {editAccount && (
        <Dialog open={!!editAccount} onOpenChange={() => setEditAccount(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Account</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Building</Label>
                  <Select value={editAccount.building} onValueChange={v => setEditAccount((a: any) => ({ ...a, building: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{BUILDINGS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={editAccount.category} onValueChange={v => setEditAccount((a: any) => ({ ...a, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Supplier</Label>
                <Input value={editAccount.supplier} onChange={e => setEditAccount((a: any) => ({ ...a, supplier: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Account Number</Label>
                  <Input value={editAccount.accountNumber ?? ""} onChange={e => setEditAccount((a: any) => ({ ...a, accountNumber: e.target.value }))} />
                </div>
                <div>
                  <Label>Direct Debit (£/mo)</Label>
                  <Input type="number" step="0.01" value={editAccount.directDebitAmount ?? ""} onChange={e => setEditAccount((a: any) => ({ ...a, directDebitAmount: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>DD Day of Month (1–31)</Label>
                  <Input type="number" min="1" max="31" value={editAccount.billingDay ?? ""} onChange={e => setEditAccount((a: any) => ({ ...a, billingDay: e.target.value ? parseInt(e.target.value) : null }))} placeholder="e.g. 15" />
                </div>
                <div>
                  <Label>MPAN / Meter Ref</Label>
                  <Input value={editAccount.mpan ?? ""} onChange={e => setEditAccount((a: any) => ({ ...a, mpan: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Contract Start</Label>
                  <Input type="date" value={editAccount.contractStartDate ? new Date(editAccount.contractStartDate).toISOString().split("T")[0] : ""} onChange={e => setEditAccount((a: any) => ({ ...a, contractStartDate: e.target.value }))} />
                </div>
                <div>
                  <Label>Contract End</Label>
                  <Input type="date" value={editAccount.contractEndDate ? new Date(editAccount.contractEndDate).toISOString().split("T")[0] : ""} onChange={e => setEditAccount((a: any) => ({ ...a, contractEndDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={editAccount.notes ?? ""} onChange={e => setEditAccount((a: any) => ({ ...a, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditAccount(null)}>Cancel</Button>
              <Button
                onClick={() => updateAccount.mutate({
                  id: editAccount.id,
                  ...editAccount,
                  contractStartDate: editAccount.contractStartDate ? new Date(editAccount.contractStartDate).toISOString().split("T")[0] : null,
                  contractEndDate: editAccount.contractEndDate ? new Date(editAccount.contractEndDate).toISOString().split("T")[0] : null,
                  billingDay: editAccount.billingDay ?? null,
                })}
                disabled={updateAccount.isPending}
              >
                {updateAccount.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Bill Dialog */}
      <Dialog open={showAddBill} onOpenChange={setShowAddBill}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Bill</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Bill Date *</Label>
              <Input type="date" value={billForm.billDate} onChange={e => setBillForm(f => ({ ...f, billDate: e.target.value }))} />
            </div>
            <div>
              <Label>Amount (£) *</Label>
              <Input type="number" step="0.01" value={billForm.amount} onChange={e => setBillForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Period Start</Label>
                <Input type="date" value={billForm.periodStart} onChange={e => setBillForm(f => ({ ...f, periodStart: e.target.value }))} />
              </div>
              <div>
                <Label>Period End</Label>
                <Input type="date" value={billForm.periodEnd} onChange={e => setBillForm(f => ({ ...f, periodEnd: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Consumption</Label>
                <Input type="number" step="0.001" value={billForm.consumptionUnits} onChange={e => setBillForm(f => ({ ...f, consumptionUnits: e.target.value }))} placeholder="e.g. 450" />
              </div>
              <div>
                <Label>Unit</Label>
                <Input value={billForm.unitType} onChange={e => setBillForm(f => ({ ...f, unitType: e.target.value }))} placeholder="kWh / m³" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={billForm.notes} onChange={e => setBillForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBill(false)}>Cancel</Button>
            <Button onClick={() => addBill.mutate({ ...billForm, accountId: selectedAccountId! })} disabled={!billForm.amount || !billForm.billDate || addBill.isPending}>
              {addBill.isPending ? "Saving..." : "Record Bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
