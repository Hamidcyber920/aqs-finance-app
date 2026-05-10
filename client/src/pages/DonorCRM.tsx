import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Users, Zap, Heart, FileCheck, Link2, Star, TrendingUp, Copy,
  CheckCircle2, Clock, AlertCircle, MessageCircle, Mail, Plus, Download,
  ChevronRight, Building2, BookOpen
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtCurrency(v: string | number | null | undefined) {
  const n = parseFloat(String(v || "0"));
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

function fmtDate(v: string | Date | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-GB");
}

function progressPct(current: string | number, target: string | number) {
  const c = parseFloat(String(current || "0"));
  const t = parseFloat(String(target || "1"));
  return Math.min(100, Math.round((c / t) * 100));
}

// ─── Two-Click QuickCapture Panel ────────────────────────────────────────────
function QuickCapturePanel() {
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [campaignId, setCampaignId] = useState<number | undefined>();
  const [result, setResult] = useState<{ whatsappLink: string; profileUrl: string } | null>(null);

  const { data: campaigns } = trpc.crm.listCampaignsWithProgress.useQuery();
  const utils = trpc.useUtils();

  const capture = trpc.crm.quickCapture.useMutation({
    onSuccess: (data) => {
      setResult(data);
      utils.crm.listLeads.invalidate();
      toast.success(`Donor lead captured for ${name}`);
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !whatsapp.trim()) return;
    capture.mutate({ name: name.trim(), whatsapp: whatsapp.trim(), campaignId });
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-900/40 to-teal-900/40 border border-emerald-700/40 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-5 h-5 text-emerald-400" />
          <h3 className="font-semibold text-emerald-300">Two-Click QuickCapture</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Capture a donor's Name and WhatsApp in 2 fields. The system automatically sends them a personalised welcome link to complete their full profile at their leisure.
        </p>

        {!result ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Muhammad Ali"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp / Phone *</Label>
                <Input
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+44 7700 000000"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Campaign (optional)</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={campaignId ?? ""}
                onChange={(e) => setCampaignId(e.target.value ? parseInt(e.target.value) : undefined)}
              >
                <option value="">— No specific campaign —</option>
                {campaigns?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={capture.isPending} className="w-full bg-emerald-600 hover:bg-emerald-700">
              {capture.isPending ? "Capturing..." : "⚡ Capture Donor Lead"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">Lead captured! Share the welcome link:</span>
            </div>
            <div className="bg-black/30 rounded-lg p-3 text-xs font-mono break-all text-muted-foreground">
              {result.profileUrl}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => { navigator.clipboard.writeText(result.profileUrl); toast.success("Link copied!"); }}
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Link
              </Button>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => window.open(result.whatsappLink, "_blank")}
              >
                <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Send via WhatsApp
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setResult(null); setName(""); setWhatsapp(""); }}>
                Capture Another
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Donor Leads CRM Table ────────────────────────────────────────────────────
function DonorLeadsTable() {
  const { data: leads, isLoading } = trpc.crm.listLeads.useQuery();
  const utils = trpc.useUtils();

  const generateLink = trpc.crm.generatePortalLink.useMutation({
    onSuccess: (data) => {
      navigator.clipboard.writeText(data.portalUrl);
      toast.success("Portal link copied to clipboard!");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Loading leads...</div>;
  if (!leads?.length) return (
    <div className="text-center py-12 text-muted-foreground">
      <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p>No donor leads yet. Use QuickCapture to add your first lead.</p>
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wide">
            <th className="text-left py-2 px-3">Name</th>
            <th className="text-left py-2 px-3">WhatsApp</th>
            <th className="text-left py-2 px-3">Status</th>
            <th className="text-left py-2 px-3">Gift Aid</th>
            <th className="text-left py-2 px-3">Captured</th>
            <th className="text-left py-2 px-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="border-b border-border/50 hover:bg-muted/30">
              <td className="py-2 px-3 font-medium">{lead.name}</td>
              <td className="py-2 px-3 text-muted-foreground">{lead.whatsapp}</td>
              <td className="py-2 px-3">
                {lead.profileComplete ? (
                  <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Complete
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-400 border-amber-600/30">
                    <Clock className="w-3 h-3 mr-1" /> Incomplete
                  </Badge>
                )}
              </td>
              <td className="py-2 px-3">
                {lead.giftAidConsent ? (
                  <Badge className="bg-purple-600/20 text-purple-400 border-purple-600/30">✓ Consented</Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </td>
              <td className="py-2 px-3 text-muted-foreground">{fmtDate(lead.createdAt)}</td>
              <td className="py-2 px-3">
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => window.open(`https://wa.me/${lead.whatsapp.replace(/\D/g, "").replace(/^0/, "44")}`, "_blank")}
                  >
                    <MessageCircle className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => generateLink.mutate({
                      donorLeadId: lead.id,
                      whatsapp: lead.whatsapp,
                      purpose: "donation_history",
                      origin: window.location.origin,
                    })}
                  >
                    <Link2 className="w-3 h-3" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Smart Gift Aid Panel ─────────────────────────────────────────────────────
function GiftAidPanel() {
  const [donorName, setDonorName] = useState("");
  const [donorAddress, setDonorAddress] = useState("");
  const [donorPostcode, setDonorPostcode] = useState("");
  const [isUkTaxpayer, setIsUkTaxpayer] = useState(false);
  const [signed, setSigned] = useState(false);
  const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1);
  const [exportYear, setExportYear] = useState(new Date().getFullYear());

  const { data: declarationText } = trpc.crm.getGiftAidDeclarationText.useQuery();
  const { data: certs, isLoading: certsLoading } = trpc.crm.listGiftAidCertificates.useQuery();

  const signDeclaration = trpc.crm.signGiftAidDeclaration.useMutation({
    onSuccess: () => {
      setSigned(true);
      toast.success("Gift Aid declaration signed and recorded!");
    },
    onError: (e) => toast.error(e.message),
  });

  const exportCsv = trpc.crm.exportGiftAidCsv.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.count} declarations`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {/* Gift Aid value calculator banner */}
      <div className="bg-purple-900/30 border border-purple-700/40 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Heart className="w-5 h-5 text-purple-400" />
          <h3 className="font-semibold text-purple-300">Smart Gift Aid — HMRC Compliant</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Every £1 donated by a UK taxpayer is worth <strong className="text-purple-300">£1.25</strong> to AQS through Gift Aid — at no extra cost to the donor.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          {[100, 500, 1000].map((amount) => (
            <div key={amount} className="bg-black/20 rounded-lg p-2">
              <div className="text-lg font-bold text-white">£{amount}</div>
              <div className="text-xs text-muted-foreground">donation</div>
              <div className="text-sm font-semibold text-purple-300 mt-1">→ £{(amount * 1.25).toFixed(0)}</div>
              <div className="text-xs text-purple-400">with Gift Aid</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sign Declaration Form */}
      {!signed ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-purple-400" />
              New Gift Aid Declaration (Click-to-Sign)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Donor Full Name *</Label>
                <Input value={donorName} onChange={(e) => setDonorName(e.target.value)} placeholder="Full legal name" />
              </div>
              <div className="space-y-1.5">
                <Label>Postcode *</Label>
                <Input value={donorPostcode} onChange={(e) => setDonorPostcode(e.target.value)} placeholder="e.g. L3 5UL" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Home Address *</Label>
              <Textarea value={donorAddress} onChange={(e) => setDonorAddress(e.target.value)} placeholder="House number, street, city" rows={2} />
            </div>

            {/* HMRC statutory wording */}
            <div className="bg-muted/30 rounded-lg p-4 text-xs text-muted-foreground leading-relaxed border border-border">
              <p className="font-semibold text-foreground mb-2">HMRC Gift Aid Declaration</p>
              <p className="whitespace-pre-line">{declarationText?.text}</p>
            </div>

            <div className="flex items-center gap-3 p-3 bg-emerald-900/20 rounded-lg border border-emerald-700/30">
              <Switch
                checked={isUkTaxpayer}
                onCheckedChange={setIsUkTaxpayer}
                id="taxpayer-switch"
              />
              <Label htmlFor="taxpayer-switch" className="cursor-pointer">
                I confirm I am a UK taxpayer and agree to the Gift Aid declaration above
              </Label>
            </div>

            <Button
              className="w-full bg-purple-600 hover:bg-purple-700"
              disabled={!donorName || !donorAddress || !donorPostcode || !isUkTaxpayer || signDeclaration.isPending}
              onClick={() => signDeclaration.mutate({
                donorName,
                donorAddress,
                donorPostcode,
                signatureMethod: "click_to_sign",
              })}
            >
              {signDeclaration.isPending ? "Signing..." : "✅ Click to Sign Gift Aid Declaration"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-3 p-4 bg-emerald-900/20 rounded-xl border border-emerald-700/30">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
          <div>
            <p className="font-medium text-emerald-300">Declaration Signed</p>
            <p className="text-sm text-muted-foreground">Gift Aid declaration recorded with timestamp and IP address.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setSigned(false)} className="ml-auto">New</Button>
        </div>
      )}

      {/* HMRC R68 Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-400" />
            HMRC R68 Export
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="space-y-1.5">
              <Label>Month</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={exportMonth}
                onChange={(e) => setExportMonth(parseInt(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2000, i).toLocaleString("en-GB", { month: "long" })}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Year</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={exportYear}
                onChange={(e) => setExportYear(parseInt(e.target.value))}
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              disabled={exportCsv.isPending}
              onClick={() => exportCsv.mutate({ month: exportMonth, year: exportYear })}
            >
              <Download className="w-4 h-4 mr-2" />
              {exportCsv.isPending ? "Generating..." : "Download R68 CSV"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Exports all signed Gift Aid declarations for the selected month in HMRC R68 format, ready for submission.
          </p>
        </CardContent>
      </Card>

      {/* Certificates list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signed Declarations ({certs?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {certsLoading ? (
            <div className="text-muted-foreground text-sm">Loading...</div>
          ) : !certs?.length ? (
            <div className="text-muted-foreground text-sm">No declarations signed yet.</div>
          ) : (
            <div className="space-y-2">
              {certs.slice(0, 10).map((cert) => (
                <div key={cert.id} className="flex items-center justify-between py-2 border-b border-border/50 text-sm">
                  <div>
                    <span className="font-medium">{cert.donorName}</span>
                    <span className="text-muted-foreground ml-2">{cert.donorPostcode}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {cert.isActive ? (
                      <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 text-xs">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-400 border-red-600/30 text-xs">Revoked</Badge>
                    )}
                    <span className="text-muted-foreground text-xs">{fmtDate(cert.signedAt)}</span>
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

// ─── Campaign Progress Panel ──────────────────────────────────────────────────
function CampaignProgressPanel() {
  const { data: campaigns, isLoading } = trpc.crm.listCampaignsWithProgress.useQuery();
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDesc, setMilestoneDesc] = useState("");
  const [milestoneDate, setMilestoneDate] = useState(new Date().toISOString().split("T")[0]);
  const [notifyDonors, setNotifyDonors] = useState(false);

  const { data: milestones } = trpc.crm.listMilestones.useQuery(
    { campaignId: selectedCampaign! },
    { enabled: !!selectedCampaign }
  );

  const addMilestone = trpc.crm.addMilestone.useMutation({
    onSuccess: () => {
      toast.success("Milestone added!");
      setMilestoneTitle("");
      setMilestoneDesc("");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Loading campaigns...</div>;

  return (
    <div className="space-y-6">
      {/* Campaign progress cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {campaigns?.map((c) => {
          const pct = progressPct(c.currentAmount, c.targetAmount);
          return (
            <Card
              key={c.id}
              className={`cursor-pointer transition-all ${selectedCampaign === c.id ? "ring-2 ring-emerald-500" : "hover:border-emerald-700/50"}`}
              onClick={() => setSelectedCampaign(c.id === selectedCampaign ? null : c.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtCurrency(c.currentAmount)} of {fmtCurrency(c.targetAmount)}
                    </p>
                  </div>
                  <Badge className={pct >= 100 ? "bg-emerald-600/20 text-emerald-400" : "bg-blue-600/20 text-blue-400"}>
                    {pct}%
                  </Badge>
                </div>
                <Progress value={pct} className="h-2" />
                {c.endDate && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Ends {fmtDate(c.endDate)}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Milestone panel for selected campaign */}
      {selectedCampaign && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Impact Timeline — {campaigns?.find((c) => c.id === selectedCampaign)?.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add milestone form */}
            <div className="bg-muted/20 rounded-lg p-4 space-y-3 border border-border">
              <p className="text-sm font-medium">Add Milestone / Update</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Title *</Label>
                  <Input
                    value={milestoneTitle}
                    onChange={(e) => setMilestoneTitle(e.target.value)}
                    placeholder="e.g. Rimmers Roof Completed"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Date *</Label>
                  <Input
                    type="date"
                    value={milestoneDate}
                    onChange={(e) => setMilestoneDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={milestoneDesc}
                  onChange={(e) => setMilestoneDesc(e.target.value)}
                  placeholder="Describe the milestone or update for donors..."
                  rows={2}
                  className="text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={notifyDonors} onCheckedChange={setNotifyDonors} id="notify-donors" />
                <Label htmlFor="notify-donors" className="text-xs cursor-pointer">Notify owner to send bulk update to all campaign donors</Label>
              </div>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={!milestoneTitle || !milestoneDate || addMilestone.isPending}
                onClick={() => addMilestone.mutate({
                  campaignId: selectedCampaign,
                  title: milestoneTitle,
                  description: milestoneDesc,
                  milestoneDate,
                  notifyDonors,
                })}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                {addMilestone.isPending ? "Adding..." : "Add Milestone"}
              </Button>
            </div>

            {/* Milestones list */}
            {milestones?.length ? (
              <div className="space-y-2">
                {milestones.map((m) => (
                  <div key={m.id} className="flex items-start gap-3 py-2 border-b border-border/50">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{m.title}</p>
                      {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{fmtDate(m.milestoneDate)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No milestones yet for this campaign.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Sadaqah Jariyah Panel ────────────────────────────────────────────────────
function SadaqahJariyahPanel() {
  const [campaignId, setCampaignId] = useState<number | undefined>();
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [beneficiaryRelation, setBeneficiaryRelation] = useState("");
  const [beneficiaryNotes, setBeneficiaryNotes] = useState("");
  const [displayOnWall, setDisplayOnWall] = useState(true);

  const { data: campaigns } = trpc.crm.listCampaignsWithProgress.useQuery();
  const { data: entries, isLoading } = trpc.crm.listSadaqahEntries.useQuery(
    { campaignId: campaignId! },
    { enabled: !!campaignId }
  );
  const utils = trpc.useUtils();

  const addEntry = trpc.crm.addSadaqahEntry.useMutation({
    onSuccess: () => {
      toast.success("Sadaqah Jariyah entry added!");
      setBeneficiaryName("");
      setBeneficiaryRelation("");
      setBeneficiaryNotes("");
      if (campaignId) utils.crm.listSadaqahEntries.invalidate({ campaignId });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 border border-amber-700/40 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-5 h-5 text-amber-400" />
          <h3 className="font-semibold text-amber-300">Sadaqah Jariyah Ledger</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          For donations of £1,000 and above, donors can dedicate their contribution in the name of a loved one. These names are recorded as a permanent spiritual record and displayed on the Donors Wall.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Beneficiary Entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Campaign *</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={campaignId ?? ""}
              onChange={(e) => setCampaignId(e.target.value ? parseInt(e.target.value) : undefined)}
            >
              <option value="">— Select a campaign —</option>
              {campaigns?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Beneficiary Name *</Label>
              <Input
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                placeholder="e.g. Late Hajji Muhammad"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Relation to Donor</Label>
              <Input
                value={beneficiaryRelation}
                onChange={(e) => setBeneficiaryRelation(e.target.value)}
                placeholder="e.g. Father, Mother, Self"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes / Du'a</Label>
            <Textarea
              value={beneficiaryNotes}
              onChange={(e) => setBeneficiaryNotes(e.target.value)}
              placeholder="Any specific du'a or notes for this Sadaqah Jariyah..."
              rows={2}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={displayOnWall} onCheckedChange={setDisplayOnWall} id="donor-wall" />
            <Label htmlFor="donor-wall" className="cursor-pointer text-sm">Display on Donors Wall (public)</Label>
          </div>
          <Button
            className="w-full bg-amber-600 hover:bg-amber-700"
            disabled={!campaignId || !beneficiaryName || addEntry.isPending}
            onClick={() => addEntry.mutate({
              campaignId: campaignId!,
              beneficiaryName,
              beneficiaryRelation,
              beneficiaryNotes,
              displayOnDonorWall: displayOnWall,
            })}
          >
            {addEntry.isPending ? "Recording..." : "📖 Record Sadaqah Jariyah"}
          </Button>
        </CardContent>
      </Card>

      {/* Entries list */}
      {campaignId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Beneficiary Records ({entries?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-muted-foreground text-sm">Loading...</div>
            ) : !entries?.length ? (
              <div className="text-muted-foreground text-sm">No entries yet for this campaign.</div>
            ) : (
              <div className="space-y-3">
                {entries.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 p-3 bg-amber-900/10 rounded-lg border border-amber-700/20">
                    <Star className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{entry.beneficiaryName}</p>
                      {entry.beneficiaryRelation && (
                        <p className="text-xs text-muted-foreground">{entry.beneficiaryRelation}</p>
                      )}
                      {entry.beneficiaryNotes && (
                        <p className="text-xs text-muted-foreground mt-1 italic">"{entry.beneficiaryNotes}"</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {entry.displayOnDonorWall && (
                        <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30 text-xs">Donors Wall</Badge>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{fmtDate(entry.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Donor Portal Link Generator ──────────────────────────────────────────────
function DonorPortalPanel() {
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [purpose, setPurpose] = useState<"donation_history" | "annual_summary" | "gift_aid_sign">("donation_history");
  const [result, setResult] = useState<{ portalUrl: string; expiresAt: string } | null>(null);

  const generateLink = trpc.crm.generatePortalLink.useMutation({
    onSuccess: (data) => {
      setResult(data);
      toast.success("Magic link generated!");
    },
    onError: (e) => toast.error(e.message),
  });

  const purposeLabels: Record<string, string> = {
    donation_history: "View Donation History",
    annual_summary: "Annual Tax Summary",
    gift_aid_sign: "Sign Gift Aid Declaration",
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-900/30 to-indigo-900/30 border border-blue-700/40 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Link2 className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-blue-300">Donor Portal — Magic Link</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Generate a secure, token-based link that gives a donor private access to their donation history, annual summary, or Gift Aid declaration — no password required.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>WhatsApp / Phone</Label>
              <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+44 7700 000000" />
            </div>
            <div className="space-y-1.5">
              <Label>Email (optional)</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="donor@example.com" type="email" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Portal Purpose</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as any)}
            >
              {Object.entries(purposeLabels).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={!whatsapp || generateLink.isPending}
            onClick={() => generateLink.mutate({
              whatsapp,
              email: email || undefined,
              purpose,
              origin: window.location.origin,
            })}
          >
            <Link2 className="w-4 h-4 mr-2" />
            {generateLink.isPending ? "Generating..." : "Generate Magic Link"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-blue-700/40">
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center gap-2 text-blue-400">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-medium">Magic link ready — expires {fmtDate(result.expiresAt)}</span>
            </div>
            <div className="bg-black/30 rounded-lg p-3 text-xs font-mono break-all text-muted-foreground">
              {result.portalUrl}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => { navigator.clipboard.writeText(result.portalUrl); toast.success("Copied!"); }}
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
              </Button>
              {whatsapp && (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    const msg = `Assalamu Alaikum! Here is your secure AQS donor portal link:\n\n${result.portalUrl}\n\nThis link expires in 30 days. JazakAllah Khayran.`;
                    window.open(`https://wa.me/${whatsapp.replace(/\D/g, "").replace(/^0/, "44")}?text=${encodeURIComponent(msg)}`, "_blank");
                  }}
                >
                  <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Send via WhatsApp
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DonorCRM() {
  const { data: leads } = trpc.crm.listLeads.useQuery();
  const { data: certs } = trpc.crm.listGiftAidCertificates.useQuery();
  const { data: campaigns } = trpc.crm.listCampaignsWithProgress.useQuery();

  const incompleteLeads = leads?.filter((l) => !l.profileComplete).length ?? 0;
  const totalLeads = leads?.length ?? 0;
  const activeCerts = certs?.filter((c) => c.isActive).length ?? 0;
  const totalCampaigns = campaigns?.length ?? 0;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Donor CRM</h1>
        <p className="text-muted-foreground text-sm mt-1">
          QuickCapture · Progressive Profiling · Gift Aid · Donor Portal · Sadaqah Jariyah
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground">Total Leads</span>
            </div>
            <div className="text-2xl font-bold">{totalLeads}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-muted-foreground">Incomplete</span>
            </div>
            <div className="text-2xl font-bold text-amber-400">{incompleteLeads}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Heart className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-muted-foreground">Gift Aid Certs</span>
            </div>
            <div className="text-2xl font-bold text-purple-400">{activeCerts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">Campaigns</span>
            </div>
            <div className="text-2xl font-bold text-blue-400">{totalCampaigns}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="quickcapture" className="space-y-4">
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList className="inline-flex w-max min-w-full h-auto gap-1 p-1">
            <TabsTrigger value="quickcapture" className="flex items-center gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <Zap className="w-3.5 h-3.5 shrink-0" /> <span>QuickCapture</span>
            </TabsTrigger>
            <TabsTrigger value="leads" className="flex items-center gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <Users className="w-3.5 h-3.5 shrink-0" /> <span>Donor Leads</span>
            </TabsTrigger>
            <TabsTrigger value="giftaid" className="flex items-center gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <Heart className="w-3.5 h-3.5 shrink-0" /> <span>Gift Aid</span>
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="flex items-center gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <TrendingUp className="w-3.5 h-3.5 shrink-0" /> <span>Campaigns</span>
            </TabsTrigger>
            <TabsTrigger value="sadaqah" className="flex items-center gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <BookOpen className="w-3.5 h-3.5 shrink-0" /> <span>Sadaqah Jariyah</span>
            </TabsTrigger>
            <TabsTrigger value="portal" className="flex items-center gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <Link2 className="w-3.5 h-3.5 shrink-0" /> <span>Donor Portal</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="quickcapture"><QuickCapturePanel /></TabsContent>
        <TabsContent value="leads"><DonorLeadsTable /></TabsContent>
        <TabsContent value="giftaid"><GiftAidPanel /></TabsContent>
        <TabsContent value="campaigns"><CampaignProgressPanel /></TabsContent>
        <TabsContent value="sadaqah"><SadaqahJariyahPanel /></TabsContent>
        <TabsContent value="portal"><DonorPortalPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
