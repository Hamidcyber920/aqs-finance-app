import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Gift, Users, Heart, Clock, Download, CheckCircle, AlertCircle, RefreshCw, Send, Tag, FileText } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { fmtDate } from "@/lib/dateUtils";

const CURRENT_YEAR = new Date().getFullYear();
const TAX_YEARS = Array.from({ length: 4 }, (_, i) => {
  const y = CURRENT_YEAR - i;
  return `${y}-${String(y + 1).slice(-2)}`;
});
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    submitted: "bg-blue-100 text-blue-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-700"}`}>{status}</span>;
}

export default function GiftAidPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [tab, setTab] = useState("gift-aid");
  const [taxYear, setTaxYear] = useState(TAX_YEARS[0]);
  const [quarter, setQuarter] = useState<"Q1" | "Q2" | "Q3" | "Q4">("Q1");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [hmrcRef, setHmrcRef] = useState("");
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showChr1Dialog, setShowR68Dialog] = useState(false);
  const [chr1Xml, setR68Xml] = useState("");
  const [chr1ClaimCount, setR68ClaimCount] = useState(0);
  const [chr1Total, setR68Total] = useState("0.00");
  const [trusteeEmail, setTrusteeEmail] = useState("");
  const [trusteeName, setTrusteeName] = useState("Dr. Abdul Hamid");
  const [markHmrcRef, setMarkHmrcRef] = useState("");
  const [showMarkSubmittedDialog, setShowMarkSubmittedDialog] = useState(false);
  const [lapsedDays, setLapsedDays] = useState(90);
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split("T")[0]; });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [reEngageDonorId, setReEngageDonorId] = useState<number | null>(null);
  const [reEngageMsg, setReEngageMsg] = useState("");
  const [thankYouDonorId, setThankYouDonorId] = useState<number | null>(null);

  const stats = trpc.donorsV3.getDonorStats.useQuery();
  const claims = trpc.donorsV3.listGiftAidClaims.useQuery({ taxYear, quarter, limit: 200 });
  const segments = trpc.donorsV3.getSegmentSummary.useQuery();
  const lapsed = trpc.donorsV3.getLapsedDonors.useQuery({ daysSinceLastGift: lapsedDays });
  const thankYouLog = trpc.donorsV3.listThankYouLog.useQuery({ limit: 30 });

  const bulkCreate = trpc.donorsV3.bulkCreateGiftAidClaims.useMutation({
    onSuccess: (d) => { toast.success(`Created ${d.created} Gift Aid claims`); utils.donorsV3.listGiftAidClaims.invalidate(); utils.donorsV3.getDonorStats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const submitClaims = trpc.donorsV3.submitGiftAidClaims.useMutation({
    onSuccess: (d) => { toast.success(`Submitted ${d.updated} claims`); setShowSubmitDialog(false); setSelectedIds([]); utils.donorsV3.listGiftAidClaims.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const exportCsv = trpc.donorsV3.exportGiftAidCsv.useQuery(
    { taxYear, quarter },
    { enabled: false }
  );

  const generateMsg = trpc.donorsV3.generateReEngagementMessage.useMutation({
    onSuccess: (d) => setReEngageMsg(d.message),
    onError: (e) => toast.error(e.message),
  });

  const buildChr1 = trpc.donorsV3.buildGiftAidChr1Xml.useMutation({
    onSuccess: (d) => {
      setR68Xml(d.xml);
      setR68ClaimCount(d.claimCount);
      setR68Total(d.totalGiftAid);
      setShowR68Dialog(true);
      toast.success(`ChR1 XML built for ${d.claimCount} donors — £${d.totalGiftAid} reclaimable`);
      utils.donorsV3.listGiftAidClaims.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const sendChr1ToTrustee = trpc.donorsV3.submitGiftAidToTrustee.useMutation({
    onSuccess: () => { toast.success("ChR1 XML emailed to trustee for review"); setShowR68Dialog(false); },
    onError: (e) => toast.error(e.message),
  });

  const markSubmitted = trpc.donorsV3.markGiftAidSubmitted.useMutation({
    onSuccess: (d) => {
      toast.success(`Marked as submitted to HMRC at ${new Date(d.submittedAt).toLocaleString()}`);
      setShowMarkSubmittedDialog(false);
      setShowR68Dialog(false);
      setMarkHmrcRef("");
      utils.donorsV3.listGiftAidClaims.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDownloadChr1 = () => {
    const blob = new Blob([chr1Xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ChR1-${taxYear}-${quarter}.xml`; a.click();
    URL.revokeObjectURL(url);
    toast.success("ChR1 XML downloaded");
  };

  const sendThankYou = trpc.donorsV3.sendThankYou.useMutation({
    onSuccess: (d) => { toast.success(`Thank-you ${d.status === "sent" ? "sent" : "logged"}`); setThankYouDonorId(null); utils.donorsV3.listThankYouLog.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const [showBatchStatementDialog, setShowBatchStatementDialog] = useState(false);
  const [batchStatementYear, setBatchStatementYear] = useState(() => {
    const now = new Date();
    return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  });
  const [batchResult, setBatchResult] = useState<{ sent: number; skipped: number; failed: number; errors: string[] } | null>(null);

  const batchSendStatements = (trpc as any).donors.batchSendAnnualStatements.useMutation({
    onSuccess: (d: any) => {
      setBatchResult(d);
      toast.success(`Statements sent to ${d.sent} donors (${d.skipped} skipped, ${d.failed} failed)`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleExport = async () => {
    const result = await utils.donorsV3.exportGiftAidCsv.fetch({ taxYear, quarter });
    if (!result?.csv) { toast.error("No data to export"); return; }
    const blob = new Blob([result.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `gift-aid-${taxYear}-${quarter}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const pendingClaims = useMemo(() => (claims.data ?? []).filter(c => c.claimStatus === "pending"), [claims.data]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enhanced Donor CRM</h1>
          <p className="text-sm text-gray-500 mt-1">Gift Aid, donor segments, lapsed donors & thank-you log</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-8 text-xs" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 h-8 text-xs" />
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => {
            const allClaims = claims.data ?? [];
            const filtered = allClaims.filter((c: any) => { const d = new Date(c.donationDate); return d >= new Date(dateFrom) && d <= new Date(dateTo + "T23:59:59"); });
            if (!filtered.length) { toast.info("No claims in selected range"); return; }
            const rows = filtered.map((c: any) => `${c.donorName},${fmtDate(new Date(c.donationDate))},\u00a3${Number(c.amount).toFixed(2)},\u00a3${(Number(c.amount) * 0.25).toFixed(2)},${c.claimStatus},${c.hmrcRef || ""}`);
            const csv = "Donor,Donation Date,Amount,Gift Aid (25%),Status,HMRC Ref\n" + rows.join("\n");
            const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `gift_aid_${dateFrom}_to_${dateTo}.csv`; a.click(); URL.revokeObjectURL(url);
          }}><Download className="w-3 h-3" /> CSV</Button>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => {
            const allClaims = claims.data ?? [];
            const filtered = allClaims.filter((c: any) => { const d = new Date(c.donationDate); return d >= new Date(dateFrom) && d <= new Date(dateTo + "T23:59:59"); });
            if (!filtered.length) { toast.info("No claims in selected range"); return; }
            const total = filtered.reduce((s: number, c: any) => s + Number(c.amount ?? 0), 0);
            const giftAidTotal = total * 0.25;
            let html = `<html><head><title>Gift Aid ${dateFrom} to ${dateTo}</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:15px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#f5f5f5;font-weight:600}.total{font-weight:bold;font-size:14px;margin-top:10px}</style></head><body>`;
            html += `<h2>Gift Aid Report</h2><p>${dateFrom} to ${dateTo}</p><p class="total">Total Donations: \u00a3${total.toFixed(2)} | Gift Aid Claimable: \u00a3${giftAidTotal.toFixed(2)}</p>`;
            html += `<table><tr><th>Donor</th><th>Date</th><th>Amount</th><th>Gift Aid</th><th>Status</th><th>HMRC Ref</th></tr>`;
            filtered.forEach((c: any) => { html += `<tr><td>${c.donorName}</td><td>${fmtDate(new Date(c.donationDate))}</td><td>\u00a3${Number(c.amount).toFixed(2)}</td><td>\u00a3${(Number(c.amount) * 0.25).toFixed(2)}</td><td>${c.claimStatus}</td><td>${c.hmrcRef || ""}</td></tr>`; });
            html += `</table></body></html>`;
            const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); w.print(); }
          }}><FileText className="w-3 h-3" /> PDF</Button>
        </div>
      </div>

      {/* Stats row */}
      {stats.data && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: "Total Donors", value: stats.data.total, icon: Users, color: "text-blue-600" },
            { label: "Regular Givers", value: stats.data.regular, icon: Heart, color: "text-pink-600" },
            { label: "Gift Aid Eligible", value: stats.data.giftAidEligible, icon: Gift, color: "text-green-600" },
            { label: "Total Given", value: `£${Number(stats.data.totalGiven).toLocaleString()}`, icon: CheckCircle, color: "text-emerald-600" },
            { label: "Lapsed (90d)", value: stats.data.lapsed, icon: Clock, color: "text-orange-600" },
            { label: "Pending Claims", value: stats.data.pendingGiftAid, icon: AlertCircle, color: "text-red-600" },
          ].map(s => (
            <Card key={s.label} className="p-3">
              <div className="flex items-center gap-2">
                <s.icon className={`h-4 w-4 ${s.color}`} />
                <div>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className="text-lg font-bold">{s.value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="gift-aid">Gift Aid Claims</TabsTrigger>
          <TabsTrigger value="segments">Donor Segments</TabsTrigger>
          <TabsTrigger value="lapsed">Lapsed Donors</TabsTrigger>
          <TabsTrigger value="thankyou">Thank-You Log</TabsTrigger>
        </TabsList>

        {/* ── Gift Aid Tab ── */}
        <TabsContent value="gift-aid" className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <p className="text-xs text-gray-500 mb-1">Tax Year</p>
              <Select value={taxYear} onValueChange={setTaxYear}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{TAX_YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Quarter</p>
              <Select value={quarter} onValueChange={(v) => setQuarter(v as any)}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{QUARTERS.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => bulkCreate.mutate({ taxYear, quarter })} disabled={bulkCreate.isPending}>
              <RefreshCw className="h-4 w-4 mr-1" />{bulkCreate.isPending ? "Generating..." : "Auto-Generate Claims"}
            </Button>
            {selectedIds.length > 0 && (
              <Button size="sm" onClick={() => setShowSubmitDialog(true)}>
                <CheckCircle className="h-4 w-4 mr-1" />Submit {selectedIds.length} to HMRC
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => buildChr1.mutate({ taxYear, quarter })} disabled={buildChr1.isPending}>
              <Download className="h-4 w-4 mr-1" />{buildChr1.isPending ? "Building XML..." : "Build ChR1 XML"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setBatchResult(null); setShowBatchStatementDialog(true); }}>
              <Send className="h-4 w-4 mr-1" />Export All Statements
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-left w-8">
                        <Checkbox
                          checked={selectedIds.length === pendingClaims.length && pendingClaims.length > 0}
                          onCheckedChange={(c) => setSelectedIds(c ? pendingClaims.map(r => r.id) : [])}
                        />
                      </th>
                      <th className="p-3 text-left">Donor</th>
                      <th className="p-3 text-left">Donation Date</th>
                      <th className="p-3 text-right">Donation</th>
                      <th className="p-3 text-right">Gift Aid (25%)</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">HMRC Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.isLoading ? (
                      <tr><td colSpan={7} className="p-6 text-center text-gray-400">Loading...</td></tr>
                    ) : (claims.data ?? []).length === 0 ? (
                      <tr><td colSpan={7} className="p-6 text-center text-gray-400">No claims for {taxYear} {quarter}. Click "Auto-Generate Claims" to create them.</td></tr>
                    ) : (claims.data ?? []).map(c => (
                      <tr key={c.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          {c.claimStatus === "pending" && (
                            <Checkbox checked={selectedIds.includes(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                          )}
                        </td>
                        <td className="p-3 font-medium">{c.donorName ?? `Donor #${c.donorId}`}</td>
                        <td className="p-3 text-gray-600">{c.donationDate ? fmtDate(new Date(c.donationDate)) : "—"}</td>
                        <td className="p-3 text-right font-mono">£{Number(c.donationAmount).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-green-700">£{Number(c.giftAidAmount ?? 0).toFixed(2)}</td>
                        <td className="p-3"><StatusBadge status={c.claimStatus} /></td>
                        <td className="p-3 text-gray-500 text-xs">{c.hmrcRef ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  {(claims.data ?? []).length > 0 && (
                    <tfoot className="bg-gray-50 border-t font-semibold">
                      <tr>
                        <td colSpan={3} className="p-3 text-right">Totals</td>
                        <td className="p-3 text-right font-mono">£{(claims.data ?? []).reduce((s, c) => s + Number(c.donationAmount), 0).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-green-700">£{(claims.data ?? []).reduce((s, c) => s + Number(c.giftAidAmount ?? 0), 0).toFixed(2)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Segments Tab ── */}
        <TabsContent value="segments" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {(segments.data ?? []).map(s => (
              <Card key={s.segment} className="p-4 text-center">
                <Tag className="h-6 w-6 mx-auto mb-2 text-indigo-500" />
                <p className="text-2xl font-bold">{s.count}</p>
                <p className="text-sm text-gray-500 capitalize">{s.segment}</p>
              </Card>
            ))}
            {(segments.data ?? []).length === 0 && (
              <div className="col-span-5 text-center text-gray-400 py-8">No segments assigned yet. Use the Donor CRM to assign segments.</div>
            )}
          </div>
        </TabsContent>

        {/* ── Lapsed Donors Tab ── */}
        <TabsContent value="lapsed" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-600">Show donors with no gift in last</p>
            <Input type="number" value={lapsedDays} onChange={e => setLapsedDays(Number(e.target.value))} className="w-20" min={1} />
            <p className="text-sm text-gray-600">days</p>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-3 text-left">Name</th>
                    <th className="p-3 text-left">Email</th>
                    <th className="p-3 text-right">Total Given</th>
                    <th className="p-3 text-right">Days Since Last Gift</th>
                    <th className="p-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lapsed.isLoading ? (
                    <tr><td colSpan={5} className="p-6 text-center text-gray-400">Loading...</td></tr>
                  ) : (lapsed.data ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-gray-400">No lapsed donors found.</td></tr>
                  ) : (lapsed.data ?? []).map((d: any) => (
                    <tr key={d.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{d.name}</td>
                      <td className="p-3 text-gray-500">{d.email ?? "—"}</td>
                      <td className="p-3 text-right font-mono">£{Number(d.totalGiven ?? 0).toLocaleString()}</td>
                      <td className="p-3 text-right">
                        <span className={`font-semibold ${(d.daysSinceLastGift ?? 999) > 180 ? "text-red-600" : "text-orange-600"}`}>
                          {d.daysSinceLastGift ?? "Never given"}
                        </span>
                      </td>
                      <td className="p-3">
                        <Button size="sm" variant="outline" onClick={() => { setReEngageDonorId(d.id); setReEngageMsg(""); }}>
                          <Send className="h-3 w-3 mr-1" />Re-engage
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Thank-You Log Tab ── */}
        <TabsContent value="thankyou" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-3 text-left">Donor</th>
                    <th className="p-3 text-left">Channel</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Sent At</th>
                    <th className="p-3 text-left">Message Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {thankYouLog.isLoading ? (
                    <tr><td colSpan={5} className="p-6 text-center text-gray-400">Loading...</td></tr>
                  ) : (thankYouLog.data ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-gray-400">No thank-you messages sent yet.</td></tr>
                  ) : (thankYouLog.data ?? []).map((t: any) => (
                    <tr key={t.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">Donor #{t.donorId}</td>
                      <td className="p-3 capitalize">{t.channel}</td>
                      <td className="p-3"><StatusBadge status={t.status} /></td>
                      <td className="p-3 text-gray-500">{fmtDate(new Date(t.sentAt))}</td>
                      <td className="p-3 text-gray-500 truncate max-w-xs">{(t.message ?? "").slice(0, 80)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Submit to HMRC dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit {selectedIds.length} Claims to HMRC</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Enter the HMRC reference number (optional):</p>
            <Input placeholder="e.g. ChR1-2024-Q1-001" value={hmrcRef} onChange={e => setHmrcRef(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>Cancel</Button>
            <Button onClick={() => submitClaims.mutate({ ids: selectedIds, hmrcRef: hmrcRef || undefined })} disabled={submitClaims.isPending}>
              {submitClaims.isPending ? "Submitting..." : "Confirm Submission"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ChR1 XML Review & Submit to Trustee dialog */}
      <Dialog open={showChr1Dialog} onOpenChange={setShowR68Dialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>ChR1 XML — {taxYear} {quarter}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-green-50 rounded p-3">
                <p className="text-gray-500">Donors</p>
                <p className="text-xl font-bold text-green-700">{chr1ClaimCount}</p>
              </div>
              <div className="bg-green-50 rounded p-3">
                <p className="text-gray-500">Gift Aid Reclaimable</p>
                <p className="text-xl font-bold text-green-700">£{chr1Total}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">XML Preview</p>
              <pre className="bg-gray-50 border rounded p-3 text-xs overflow-auto max-h-48 font-mono">{chr1Xml.slice(0, 1200)}{chr1Xml.length > 1200 ? "\n... (truncated)" : ""}</pre>
            </div>
            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium">Email to Finance Trustee for Review</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Trustee Name</p>
                  <Input value={trusteeName} onChange={e => setTrusteeName(e.target.value)} placeholder="Dr. Abdul Hamid" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Trustee Email</p>
                  <Input value={trusteeEmail} onChange={e => setTrusteeEmail(e.target.value)} placeholder="trustee@example.com" type="email" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowR68Dialog(false)}>Close</Button>
            <Button variant="outline" onClick={handleDownloadChr1}>
              <Download className="h-4 w-4 mr-1" />Download XML
            </Button>
            <Button
              onClick={() => sendChr1ToTrustee.mutate({ xml: chr1Xml, taxYear, quarter, claimCount: chr1ClaimCount, totalGiftAid: chr1Total, trusteeEmail, trusteeName })}
              disabled={sendChr1ToTrustee.isPending || !trusteeEmail}
            >
              <Send className="h-4 w-4 mr-1" />{sendChr1ToTrustee.isPending ? "Sending..." : "Email to Trustee"}
            </Button>
            <Button
              variant="default"
              className="bg-blue-700 hover:bg-blue-800"
              onClick={() => setShowMarkSubmittedDialog(true)}
            >
              <CheckCircle className="h-4 w-4 mr-1" />Mark as Submitted to HMRC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Submitted to HMRC confirmation dialog */}
      <Dialog open={showMarkSubmittedDialog} onOpenChange={setShowMarkSubmittedDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Mark as Submitted to HMRC</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              This will mark all <strong>{taxYear} {quarter}</strong> Gift Aid claims as submitted to HMRC.
              This action cannot be undone.
            </p>
            <div>
              <p className="text-xs text-gray-500 mb-1">HMRC Reference Number (optional)</p>
              <Input
                value={markHmrcRef}
                onChange={e => setMarkHmrcRef(e.target.value)}
                placeholder="e.g. ChR1-2024-Q1-XXXXXXXX"
              />
              <p className="text-xs text-gray-400 mt-1">You can find this in your HMRC Charities Online submission confirmation.</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
              <strong>What happens next:</strong> All pending claims for {taxYear} {quarter} will be stamped with today's date and status changed to "submitted". The HMRC reference will be saved for audit purposes.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkSubmittedDialog(false)}>Cancel</Button>
            <Button
              className="bg-blue-700 hover:bg-blue-800"
              onClick={() => markSubmitted.mutate({ taxYear, quarter, hmrcRef: markHmrcRef || undefined })}
              disabled={markSubmitted.isPending}
            >
              <CheckCircle className="h-4 w-4 mr-1" />{markSubmitted.isPending ? "Saving..." : "Confirm Submission"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-engagement message dialog */}
      <Dialog open={reEngageDonorId !== null} onOpenChange={(o) => { if (!o) setReEngageDonorId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Re-Engagement Message</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!reEngageMsg ? (
              <Button onClick={() => generateMsg.mutate({ donorId: reEngageDonorId!, channel: "email" })} disabled={generateMsg.isPending}>
                {generateMsg.isPending ? "Generating..." : "Generate AI Message"}
              </Button>
            ) : (
              <>
                <textarea className="w-full border rounded p-3 text-sm h-40 resize-none" value={reEngageMsg} onChange={e => setReEngageMsg(e.target.value)} />
                <Button onClick={() => { sendThankYou.mutate({ donorId: reEngageDonorId!, channel: "email", message: reEngageMsg }); setReEngageDonorId(null); }} disabled={sendThankYou.isPending}>
                  <Send className="h-4 w-4 mr-1" />{sendThankYou.isPending ? "Sending..." : "Send Email"}
                </Button>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReEngageDonorId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Batch Annual Statement Dialog */}
      <Dialog open={showBatchStatementDialog} onOpenChange={(o) => { if (!o) { setShowBatchStatementDialog(false); setBatchResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Export All Annual Statements</DialogTitle>
          </DialogHeader>
          {!batchResult ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">This will generate and email a personalised Annual Giving Statement PDF to every donor who has an email address and made at least one donation in the selected tax year.</p>
              <div>
                <label className="text-sm font-medium">Tax Year</label>
                <Select value={String(batchStatementYear)} onValueChange={v => setBatchStatementYear(Number(v))}>
                  <SelectTrigger className="mt-1 w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                      <SelectItem key={y} value={String(y)}>{y}/{y + 1}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">UK tax year: 6 April {batchStatementYear} – 5 April {batchStatementYear + 1}</p>
              </div>
              <div className="rounded bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <strong>Note:</strong> This sends emails immediately to all eligible donors. Donors with £0 total giving in this tax year are automatically skipped.
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded border p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{batchResult.sent}</p>
                  <p className="text-xs text-muted-foreground">Sent</p>
                </div>
                <div className="rounded border p-3 text-center">
                  <p className="text-2xl font-bold text-gray-500">{batchResult.skipped}</p>
                  <p className="text-xs text-muted-foreground">Skipped (£0)</p>
                </div>
                <div className="rounded border p-3 text-center">
                  <p className="text-2xl font-bold text-red-500">{batchResult.failed}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>
              {batchResult.errors.length > 0 && (
                <div className="rounded bg-red-50 border border-red-200 p-3 text-xs text-red-800 max-h-32 overflow-y-auto">
                  <p className="font-medium mb-1">Errors:</p>
                  {batchResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowBatchStatementDialog(false); setBatchResult(null); }}>Close</Button>
            {!batchResult && (
              <Button
                disabled={batchSendStatements.isPending}
                onClick={() => batchSendStatements.mutate({ taxYear: batchStatementYear })}
              >
                <Send className="h-4 w-4 mr-1" />
                {batchSendStatements.isPending ? "Sending..." : `Send All Statements for ${batchStatementYear}/${batchStatementYear + 1}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
