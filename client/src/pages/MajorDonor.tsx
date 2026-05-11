import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { Flag, Plus, ShieldCheck, AlertTriangle, CheckCircle2, FileWarning, Clock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/DashboardLayout";

const T = { navy: "#0A192F", purple: "#635BFF", mint: "#00FFC2", white: "#FFFFFF", muted: "rgba(255,255,255,0.5)", border: "rgba(255,255,255,0.08)", glass: "rgba(255,255,255,0.04)", card: "rgba(13,34,64,0.8)" };

const STATUS_STYLES: Record<string, { colour: string; bg: string; Icon: React.ElementType }> = {
  open: { colour: "#FDCB6E", bg: "rgba(253,203,110,0.15)", Icon: Clock },
  cleared: { colour: "#00B894", bg: "rgba(0,184,148,0.15)", Icon: CheckCircle2 },
  escalated: { colour: "#E17055", bg: "rgba(225,112,85,0.15)", Icon: AlertTriangle },
  sir_filed: { colour: "#D63031", bg: "rgba(214,48,49,0.15)", Icon: FileWarning },
};

const SANCTIONS_STYLES: Record<string, string> = {
  pending: "text-yellow-400",
  clear: "text-emerald-400",
  flagged: "text-red-400",
  not_required: "text-white/40",
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

export default function MajorDonorPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showTrigger, setShowTrigger] = useState(false);
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [showSanctions, setShowSanctions] = useState(false);
  const [showSignOff, setShowSignOff] = useState(false);

  const { data: cases, refetch } = trpc.majorDonor.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter as any,
    limit: 200,
  });

  const { data: caseDetail } = trpc.majorDonor.getById.useQuery(
    { id: selectedCase?.id ?? 0 },
    { enabled: !!selectedCase?.id }
  );

  const triggerMutation = trpc.majorDonor.trigger.useMutation({
    onSuccess: (r) => { toast.success(`Due diligence case #${r.id} opened`); setShowTrigger(false); refetch(); triggerForm.reset(); },
    onError: (e) => toast.error(e.message),
  });

  const sanctionsMutation = trpc.majorDonor.updateSanctionsCheck.useMutation({
    onSuccess: () => { toast.success("Sanctions check updated"); setShowSanctions(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const signOffMutation = trpc.majorDonor.trusteeSignOff.useMutation({
    onSuccess: (r) => { toast.success(`Case ${r.status}`); setShowSignOff(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const sirMutation = trpc.majorDonor.fileSIR.useMutation({
    onSuccess: () => { toast.success("Serious Incident Report filed"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const triggerForm = useForm<any>({ defaultValues: { isAnonymous: false } });
  const sanctionsForm = useForm<any>();
  const signOffForm = useForm<any>({ defaultValues: { escalate: false } });

  const allCases: any[] = Array.isArray(cases) ? cases : [];
  const filtered = allCases.filter(c =>
    !search || (c.donorName ?? "").toLowerCase().includes(search.toLowerCase()) || (c.donationRef ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="min-h-screen p-6" style={{ background: "linear-gradient(135deg, #0A192F 0%, #0f2040 100%)" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(214,48,49,0.2)" }}>
              <Flag className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Major Donor Due Diligence</h1>
              <p className="text-xs" style={{ color: T.muted }}>Charity Commission compliance — donations ≥ £25,000</p>
            </div>
          </div>
          <Button onClick={() => setShowTrigger(true)} className="gap-2 bg-red-600 hover:bg-red-700">
            <Plus className="w-4 h-4" /> Open Case
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: T.muted }} />
            <Input placeholder="Search donor or reference…" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-9 text-white" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 text-white" style={{ background: T.glass, border: `1px solid ${T.border}` }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="cleared">Cleared</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="sir_filed">SIR Filed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Cases Table */}
        <Card style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    {["Case #", "Donor", "Amount", "Source", "Sanctions", "Trustee Sign-off", "Status", "Opened", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: T.muted }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center" style={{ color: T.muted }}>No cases found</td></tr>
                  )}
                  {filtered.map((c: any) => {
                    const { colour, bg, Icon } = STATUS_STYLES[c.status] ?? STATUS_STYLES.open;
                    return (
                      <tr key={c.id} className="hover:bg-white/5 cursor-pointer transition-colors" style={{ borderBottom: `1px solid ${T.border}` }}
                        onClick={() => setSelectedCase(c)}>
                        <td className="px-4 py-3 text-white font-mono">#{c.id}</td>
                        <td className="px-4 py-3 text-white font-medium">{c.donorName ?? (c.isAnonymous ? "Anonymous" : "—")}</td>
                        <td className="px-4 py-3 text-white">{fmt(c.donationAmount)}</td>
                        <td className="px-4 py-3" style={{ color: T.muted }}>{c.donationSource ?? "—"}</td>
                        <td className={`px-4 py-3 text-xs font-semibold capitalize ${SANCTIONS_STYLES[c.sanctionsCheckStatus] ?? ""}`}>
                          {(c.sanctionsCheckStatus ?? "").replace("_", " ")}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: T.muted }}>
                          {c.trusteeSignOffRequired ? (c.trusteeSignOffAt ? `✓ ${fmtDate(c.trusteeSignOffAt)}` : "Required") : "Not required"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border" style={{ color: colour, background: bg, borderColor: colour + "40" }}>
                            <Icon className="w-3 h-3" />{c.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: T.muted }}>{fmtDate(c.createdAt)}</td>
                        <td className="px-4 py-3">
                          {c.status === "open" && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="text-xs h-7"
                                onClick={e => { e.stopPropagation(); setSelectedCase(c); setShowSanctions(true); }}
                                style={{ borderColor: T.border, color: T.mint }}>
                                Sanctions
                              </Button>
                              {c.trusteeSignOffRequired && !c.trusteeSignOffAt && (
                                <Button size="sm" variant="outline" className="text-xs h-7"
                                  onClick={e => { e.stopPropagation(); setSelectedCase(c); setShowSignOff(true); }}
                                  style={{ borderColor: T.border, color: "#FDCB6E" }}>
                                  Sign-off
                                </Button>
                              )}
                            </div>
                          )}
                          {c.status === "escalated" && !c.sirRequired && (
                            <Button size="sm" variant="outline" className="text-xs h-7 text-red-400 border-red-500/30"
                              onClick={e => { e.stopPropagation(); if (confirm("File a Serious Incident Report with the Charity Commission?")) sirMutation.mutate({ id: c.id }); }}>
                              File SIR
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

        {/* Trigger Case Dialog */}
        <Dialog open={showTrigger} onOpenChange={setShowTrigger}>
          <DialogContent className="max-w-md" style={{ background: "#0F1B2D", border: `1px solid ${T.border}` }}>
            <DialogHeader>
              <DialogTitle className="text-white">Open Due Diligence Case</DialogTitle>
            </DialogHeader>
            <form onSubmit={triggerForm.handleSubmit(d => triggerMutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-white/70 text-xs">Donor Name</Label>
                  <Input {...triggerForm.register("donorName")} className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Donation Amount (£) *</Label>
                  <Input {...triggerForm.register("donationAmount", { required: true })} className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Source</Label>
                  <Input {...triggerForm.register("donationSource")} placeholder="e.g. cash, bank transfer" className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Reference</Label>
                  <Input {...triggerForm.register("donationRef")} className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
              </div>
              <div>
                <Label className="text-white/70 text-xs">Notes</Label>
                <Textarea {...triggerForm.register("notes")} className="text-white mt-1 resize-none" rows={2} style={{ background: T.glass, border: `1px solid ${T.border}` }} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isAnonymous" {...triggerForm.register("isAnonymous")} className="rounded" />
                <Label htmlFor="isAnonymous" className="text-white/70 text-xs cursor-pointer">Anonymous donor</Label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowTrigger(false)} style={{ borderColor: T.border }}>Cancel</Button>
                <Button type="submit" disabled={triggerMutation.isPending} className="bg-red-600 hover:bg-red-700">
                  {triggerMutation.isPending ? "Opening…" : "Open Case"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Sanctions Check Dialog */}
        <Dialog open={showSanctions} onOpenChange={() => setShowSanctions(false)}>
          <DialogContent className="max-w-sm" style={{ background: "#0F1B2D", border: `1px solid ${T.border}` }}>
            <DialogHeader>
              <DialogTitle className="text-white">Update Sanctions Check — Case #{selectedCase?.id}</DialogTitle>
            </DialogHeader>
            <form onSubmit={sanctionsForm.handleSubmit(d => sanctionsMutation.mutate({ id: selectedCase?.id, ...d }))} className="space-y-4">
              <div>
                <Label className="text-white/70 text-xs">Sanctions Check Result *</Label>
                <Select onValueChange={v => sanctionsForm.setValue("sanctionsCheckStatus", v)}>
                  <SelectTrigger className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }}>
                    <SelectValue placeholder="Select result…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clear">Clear — no match found</SelectItem>
                    <SelectItem value="flagged">Flagged — potential match</SelectItem>
                    <SelectItem value="pending">Pending — awaiting result</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-white/70 text-xs">Notes</Label>
                <Textarea {...sanctionsForm.register("sanctionsCheckNotes")} className="text-white mt-1 resize-none" rows={2} style={{ background: T.glass, border: `1px solid ${T.border}` }} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowSanctions(false)} style={{ borderColor: T.border }}>Cancel</Button>
                <Button type="submit" disabled={sanctionsMutation.isPending} style={{ background: T.purple }}>Update</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Trustee Sign-off Dialog */}
        <Dialog open={showSignOff} onOpenChange={() => setShowSignOff(false)}>
          <DialogContent className="max-w-sm" style={{ background: "#0F1B2D", border: `1px solid ${T.border}` }}>
            <DialogHeader>
              <DialogTitle className="text-white">Trustee Sign-off — Case #{selectedCase?.id}</DialogTitle>
            </DialogHeader>
            <form onSubmit={signOffForm.handleSubmit(d => signOffMutation.mutate({ id: selectedCase?.id, ...d }))} className="space-y-4">
              <div>
                <Label className="text-white/70 text-xs">Notes</Label>
                <Textarea {...signOffForm.register("notes")} className="text-white mt-1 resize-none" rows={3} style={{ background: T.glass, border: `1px solid ${T.border}` }} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="escalate" {...signOffForm.register("escalate")} className="rounded" />
                <Label htmlFor="escalate" className="text-red-400 text-xs cursor-pointer">Escalate — requires further investigation</Label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowSignOff(false)} style={{ borderColor: T.border }}>Cancel</Button>
                <Button type="submit" disabled={signOffMutation.isPending} style={{ background: "#00B894" }}>
                  {signOffMutation.isPending ? "Submitting…" : "Submit Sign-off"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
