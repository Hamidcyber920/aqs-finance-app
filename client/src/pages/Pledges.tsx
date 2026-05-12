import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import {
  TrendingUp, Plus, Search, CheckCircle2, AlertCircle, Clock, XCircle,
  ChevronDown, Banknote, Calendar, User, Tag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const T = { navy: "#0A192F", purple: "#635BFF", mint: "#00FFC2", white: "#FFFFFF", muted: "rgba(255,255,255,0.5)", border: "rgba(255,255,255,0.08)", glass: "rgba(255,255,255,0.04)", card: "rgba(13,34,64,0.8)" };

const STATUS_COLOURS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  fulfilled: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  lapsed: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  cancelled: "bg-red-500/20 text-red-300 border-red-500/30",
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  active: Clock,
  fulfilled: CheckCircle2,
  lapsed: AlertCircle,
  cancelled: XCircle,
};

function fmt(v: string | number | null | undefined) {
  if (v == null) return "—";
  const n = parseFloat(String(v));
  return isNaN(n) ? "—" : `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(v: string | Date | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-GB");
}

export default function PledgesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showPayment, setShowPayment] = useState<number | null>(null);
  const [selectedPledge, setSelectedPledge] = useState<any>(null);

  const { data: pledges, refetch } = trpc.pledges.list.useQuery({ limit: 200 });
  const { data: stats } = trpc.pledges.stats.useQuery();
  const { data: pledgeDetail } = trpc.pledges.getById.useQuery(
    { id: selectedPledge?.id ?? 0 },
    { enabled: !!selectedPledge?.id }
  );

  const createMutation = trpc.pledges.create.useMutation({
    onSuccess: () => { toast.success("Pledge created"); setShowCreate(false); refetch(); createForm.reset(); },
    onError: (e: any) => toast.error(e.message),
  });

  const markPaidMutation = trpc.pledges.markPaid.useMutation({
    onSuccess: () => { toast.success("Payment recorded"); setShowPayment(null); refetch(); payForm.reset(); },
    onError: (e: any) => toast.error(e.message),
  });

  const createForm = useForm<any>({ defaultValues: { frequency: "one_off", isGiftAid: false } });
  const payForm = useForm<any>({ defaultValues: { paymentMethod: "cash" } });

  const allPledges: any[] = Array.isArray(pledges) ? pledges : [];
  const filtered = allPledges.filter(p => {
    const matchSearch = !search || (p.donorName ?? "").toLowerCase().includes(search.toLowerCase()) || (p.campaignName ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalActive = stats?.find((s: any) => s.status === "active");
  const totalFulfilled = stats?.find((s: any) => s.status === "fulfilled");

  return (
      <div className="min-h-screen p-6" style={{ background: "linear-gradient(135deg, #0A192F 0%, #0f2040 100%)" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(99,91,255,0.2)" }}>
              <TrendingUp className="w-5 h-5" style={{ color: T.purple }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Pledge Tracker</h1>
              <p className="text-xs" style={{ color: T.muted }}>Track donor pledges and payment schedules</p>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2" style={{ background: T.purple }}>
            <Plus className="w-4 h-4" /> New Pledge
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Active Pledges", value: totalActive?.count ?? 0, sub: fmt(totalActive?.balanceOwing), colour: "#635BFF" },
            { label: "Total Pledged (Active)", value: fmt(totalActive?.totalAmount), sub: "total committed", colour: "#00B894" },
            { label: "Collected (Active)", value: fmt(totalActive?.paidAmount), sub: "received so far", colour: "#00FFC2" },
            { label: "Fulfilled", value: totalFulfilled?.count ?? 0, sub: fmt(totalFulfilled?.totalAmount), colour: "#6C63FF" },
          ].map(s => (
            <Card key={s.label} style={{ background: T.card, border: `1px solid ${T.border}` }}>
              <CardContent className="p-4">
                <p className="text-xs mb-1" style={{ color: T.muted }}>{s.label}</p>
                <p className="text-xl font-bold" style={{ color: s.colour }}>{s.value}</p>
                <p className="text-xs mt-1" style={{ color: T.muted }}>{s.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: T.muted }} />
            <Input
              placeholder="Search donor or campaign…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 text-white"
              style={{ background: T.glass, border: `1px solid ${T.border}` }}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 text-white" style={{ background: T.glass, border: `1px solid ${T.border}` }}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="fulfilled">Fulfilled</SelectItem>
              <SelectItem value="lapsed">Lapsed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    {["Donor", "Campaign", "Total", "Paid", "Balance", "Frequency", "Next Due", "Status", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: T.muted }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center" style={{ color: T.muted }}>No pledges found</td></tr>
                  )}
                  {filtered.map((p: any) => {
                    const StatusIcon = STATUS_ICONS[p.status] ?? Clock;
                    return (
                      <tr key={p.id} className="hover:bg-white/5 cursor-pointer transition-colors" style={{ borderBottom: `1px solid ${T.border}` }}
                        onClick={() => setSelectedPledge(p)}>
                        <td className="px-4 py-3 font-medium text-white">{p.donorName ?? "—"}</td>
                        <td className="px-4 py-3" style={{ color: T.muted }}>{p.campaignName ?? "—"}</td>
                        <td className="px-4 py-3 text-white">{fmt(p.totalAmount)}</td>
                        <td className="px-4 py-3 text-emerald-400">{fmt(p.paidAmount)}</td>
                        <td className="px-4 py-3 text-yellow-400">{fmt(p.balanceOwing)}</td>
                        <td className="px-4 py-3 capitalize" style={{ color: T.muted }}>{(p.frequency ?? "").replace("_", "-")}</td>
                        <td className="px-4 py-3" style={{ color: T.muted }}>{fmtDate(p.nextDueDate)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${STATUS_COLOURS[p.status] ?? ""}`}>
                            <StatusIcon className="w-3 h-3" />{p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {p.status === "active" && (
                            <Button size="sm" variant="outline" className="text-xs h-7"
                              onClick={e => { e.stopPropagation(); setShowPayment(p.id); }}
                              style={{ borderColor: T.border, color: T.mint }}>
                              + Payment
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Create Pledge Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-lg" style={{ background: "#0F1B2D", border: `1px solid ${T.border}` }}>
            <DialogHeader>
              <DialogTitle className="text-white">New Pledge</DialogTitle>
            </DialogHeader>
            <form onSubmit={createForm.handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-white/70 text-xs">Donor Name</Label>
                  <Input {...createForm.register("donorName")} className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Donor ID (optional)</Label>
                  <Input {...createForm.register("donorId", { valueAsNumber: true })} type="number" className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Total Amount (£) *</Label>
                  <Input {...createForm.register("totalAmount", { required: true })} className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Frequency</Label>
                  <Select defaultValue="one_off" onValueChange={v => createForm.setValue("frequency", v)}>
                    <SelectTrigger className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one_off">One-off</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Campaign Name</Label>
                  <Input {...createForm.register("campaignName")} className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Next Due Date</Label>
                  <Input {...createForm.register("nextDueDate")} type="date" className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
              </div>
              <div>
                <Label className="text-white/70 text-xs">Notes</Label>
                <Textarea {...createForm.register("notes")} className="text-white mt-1 resize-none" rows={2} style={{ background: T.glass, border: `1px solid ${T.border}` }} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isGiftAid" {...createForm.register("isGiftAid")} className="rounded" />
                <Label htmlFor="isGiftAid" className="text-white/70 text-xs cursor-pointer">Gift Aid eligible</Label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)} style={{ borderColor: T.border }}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending} style={{ background: T.purple }}>
                  {createMutation.isPending ? "Saving…" : "Create Pledge"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Record Payment Dialog */}
        <Dialog open={showPayment !== null} onOpenChange={() => setShowPayment(null)}>
          <DialogContent className="max-w-md" style={{ background: "#0F1B2D", border: `1px solid ${T.border}` }}>
            <DialogHeader>
              <DialogTitle className="text-white">Record Payment</DialogTitle>
            </DialogHeader>
            <form onSubmit={payForm.handleSubmit(d => markPaidMutation.mutate({ ...d, pledgeId: showPayment! }))} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-white/70 text-xs">Amount (£) *</Label>
                  <Input {...payForm.register("amount", { required: true })} className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Payment Date *</Label>
                  <Input {...payForm.register("paymentDate", { required: true })} type="date" className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Method</Label>
                  <Select defaultValue="cash" onValueChange={v => payForm.setValue("paymentMethod", v)}>
                    <SelectTrigger className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["cash", "card", "bacs", "cheque", "paypal", "stripe", "other"].map(m => (
                        <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Reference</Label>
                  <Input {...payForm.register("reference")} className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
              </div>
              <div>
                <Label className="text-white/70 text-xs">Notes</Label>
                <Textarea {...payForm.register("notes")} className="text-white mt-1 resize-none" rows={2} style={{ background: T.glass, border: `1px solid ${T.border}` }} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowPayment(null)} style={{ borderColor: T.border }}>Cancel</Button>
                <Button type="submit" disabled={markPaidMutation.isPending} style={{ background: "#00B894" }}>
                  {markPaidMutation.isPending ? "Saving…" : "Record Payment"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Pledge Detail Dialog */}
        <Dialog open={!!selectedPledge} onOpenChange={() => setSelectedPledge(null)}>
          <DialogContent className="max-w-lg" style={{ background: "#0F1B2D", border: `1px solid ${T.border}` }}>
            <DialogHeader>
              <DialogTitle className="text-white">Pledge Detail</DialogTitle>
            </DialogHeader>
            {pledgeDetail && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: "Donor", value: pledgeDetail.donorName ?? "—" },
                    { label: "Campaign", value: pledgeDetail.campaignName ?? "—" },
                    { label: "Total Pledged", value: fmt(pledgeDetail.totalAmount) },
                    { label: "Paid", value: fmt(pledgeDetail.paidAmount) },
                    { label: "Balance Owing", value: fmt(pledgeDetail.balanceOwing) },
                    { label: "Frequency", value: (pledgeDetail.frequency ?? "").replace("_", "-") },
                    { label: "Next Due", value: fmtDate(pledgeDetail.nextDueDate) },
                    { label: "Gift Aid", value: pledgeDetail.isGiftAid ? "Yes" : "No" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs" style={{ color: T.muted }}>{label}</p>
                      <p className="text-white font-medium">{value}</p>
                    </div>
                  ))}
                </div>
                {pledgeDetail.notes && (
                  <div>
                    <p className="text-xs mb-1" style={{ color: T.muted }}>Notes</p>
                    <p className="text-white/80 text-sm">{pledgeDetail.notes}</p>
                  </div>
                )}
                {(pledgeDetail.payments ?? []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: T.muted }}>Payment History</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {pledgeDetail.payments.map((pay: any) => (
                        <div key={pay.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: T.glass, border: `1px solid ${T.border}` }}>
                          <div>
                            <p className="text-white text-sm font-medium">{fmt(pay.amount)}</p>
                            <p className="text-xs" style={{ color: T.muted }}>{pay.paymentMethod} · {fmtDate(pay.paymentDate)}</p>
                          </div>
                          {pay.reference && <p className="text-xs" style={{ color: T.muted }}>{pay.reference}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
  );
}
