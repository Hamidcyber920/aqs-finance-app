import { useState, useMemo, useCallback, useEffect } from "react";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, User, Heart, FileText, MessageSquare, Activity, BookOpen, Plus, Share2, Send, Mail, Phone, Download, Calendar, Star } from "lucide-react";
import { Link } from "wouter";

const TABS = [
  { id: "overview", label: "Overview", icon: User },
  { id: "donations", label: "Donations", icon: Heart },
  { id: "pledges", label: "Pledges", icon: FileText },
  { id: "comms", label: "Communications", icon: MessageSquare },
  { id: "dedications", label: "Dedications", icon: Star },
  { id: "notes", label: "Notes", icon: BookOpen },
  { id: "audit", label: "Audit", icon: Activity },
];

const RFM_COLORS: Record<string, string> = {
  Champions: "bg-purple-100 text-purple-800",
  "Loyal Customers": "bg-blue-100 text-blue-800",
  "Potential Loyalists": "bg-cyan-100 text-cyan-800",
  "At Risk": "bg-amber-100 text-amber-800",
  "Cannot Lose Them": "bg-red-100 text-red-800",
  Hibernating: "bg-gray-100 text-gray-800",
  "New Customers": "bg-green-100 text-green-800",
};

const EMPTY_DONATION_FORM = {
  amount: "",
  campaignId: "",
  paymentMethod: "cash",
  isGiftAid: false,
  notes: "",
};
const EMPTY_PLEDGE_FORM = {
  totalAmount: "",
  frequency: "one_off" as "one_off" | "monthly" | "quarterly" | "annual",
  campaignId: "",
  startDate: "",
  nextDueDate: "",
  isGiftAid: false,
  notes: "",
};

export default function DonorProfile() {
  const [, params] = useRoute("/donors/:id");
  const donorId = params ? parseInt(params.id) : null;
  const [activeTab, setActiveTab] = useState("overview");
  const [noteText, setNoteText] = useState("");
  const [showDonationDialog, setShowDonationDialog] = useState(false);
  const [donationForm, setDonationForm] = useState(EMPTY_DONATION_FORM);
  const [showPledgeDialog, setShowPledgeDialog] = useState(false);
  const [pledgeForm, setPledgeForm] = useState(EMPTY_PLEDGE_FORM);
  const [payingPledgeId, setPayingPledgeId] = useState<number | null>(null);
  const [showSendLinkDialog, setShowSendLinkDialog] = useState(false);
  const [portalLinkData, setPortalLinkData] = useState<{ token: string; url: string } | null>(null);
  const [showStatementDialog, setShowStatementDialog] = useState(false);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundDonationId, setRefundDonationId] = useState<number | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundReverseGiftAid, setRefundReverseGiftAid] = useState(true);
  const [statementTaxYear, setStatementTaxYear] = useState(() => {
    const now = new Date();
    return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  });

  const { data: donor } = (trpc as any).donors.get.useQuery(
    { id: donorId! },
    { enabled: !!donorId }
  );

  const { data: donations, refetch: refetchDonations } = (trpc as any).fundraising.getDonationsByDonor.useQuery(
    { donorId: donorId! },
    { enabled: !!donorId && activeTab === "donations" }
  );

  const { data: pledges } = (trpc as any).pledges.list.useQuery(
    { donorId: donorId! },
    { enabled: !!donorId && activeTab === "pledges" }
  );

  const { data: emailsList } = (trpc as any).commsInbox.listEmails.useQuery(
    { fromEmail: donor?.email, limit: 50 },
    { enabled: !!donor?.email && activeTab === "comms" }
  );

  const { data: commsLog, refetch: refetchCommsLog } = (trpc as any).crm.listCommsLog.useQuery(
    { donorId: donorId! },
    { enabled: !!donorId && activeTab === "comms" }
  );

  const [showAddLogDialog, setShowAddLogDialog] = useState(false);
  const [logForm, setLogForm] = useState({ type: "manual_note" as string, channel: "email" as string, subject: "", notes: "" });
  const refundMut = (trpc as any).crm.refundDonation.useMutation({
    onSuccess: (res: any) => {
      toast.success(res.message);
      setShowRefundDialog(false);
      setRefundDonationId(null);
      setRefundReason("");
      refetchDonations();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addCommsLogMut = (trpc as any).crm.addCommsLog.useMutation({
    onSuccess: () => { toast.success("Communication logged"); setShowAddLogDialog(false); setLogForm({ type: "manual_note", channel: "email", subject: "", notes: "" }); refetchCommsLog(); },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: notes, refetch: refetchNotes } = (trpc as any).donorPipeline.listNotes.useQuery(
    { donorId: donorId! },
    { enabled: !!donorId && activeTab === "notes" }
  );

  const { data: auditData } = (trpc as any).auditTrail.list.useQuery(
    { entity: "donor", search: donor?.fullName || donor?.name, pageSize: 50 },
    { enabled: !!donor && activeTab === "audit" }
  );

  const { data: sadaqahEntries, refetch: refetchSadaqah } = (trpc as any).crm.listSadaqahEntries.useQuery(
    { donorId: donorId! },
    { enabled: !!donorId && activeTab === "dedications" }
  );
  const [showDedicationDialog, setShowDedicationDialog] = useState(false);
  const [dedicationForm, setDedicationForm] = useState({ dedicatedTo: "", relationship: "", occasion: "", notes: "", isPublic: false });
  const addDedicationMut = (trpc as any).crm.addDonorDedication.useMutation({
    onSuccess: () => { toast.success("Dedication recorded"); setShowDedicationDialog(false); setDedicationForm({ dedicatedTo: "", relationship: "", occasion: "", notes: "", isPublic: false }); refetchSadaqah(); },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: campaigns } = (trpc as any).fundraising.listCampaigns.useQuery(
    undefined,
    { enabled: showDonationDialog }
  );

  // Load all recognition tiers (global, no campaignId filter) to compute donor's tier
  const { data: allTiers } = (trpc as any).recognitionTiers.list.useQuery(
    {},
    { enabled: !!donor && activeTab === "overview" }
  );

  // Compute the highest tier the donor qualifies for based on totalGiven
  const donorTier = useMemo(() => {
    if (!allTiers?.length || !donor) return null;
    const totalGiven = Number(donor.totalGiven ?? donor.totalDonated ?? 0);
    // Sort tiers by minAmount descending so we find the highest qualifying tier
    const sorted = [...allTiers].sort((a: any, b: any) => Number(b.minAmount) - Number(a.minAmount));
    return sorted.find((t: any) => totalGiven >= Number(t.minAmount)) ?? null;
  }, [allTiers, donor]);

  const { data: pledgeRefetch, refetch: refetchPledges } = (trpc as any).pledges.list.useQuery(
    { donorId: donorId! },
    { enabled: false }
  );
  void pledgeRefetch;
  const createPledgeMut = (trpc as any).pledges.create.useMutation({
    onSuccess: () => {
      toast.success("Pledge created successfully");
      setShowPledgeDialog(false);
      setPledgeForm(EMPTY_PLEDGE_FORM);
      refetchPledges();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const createPledgeCheckoutMut = (trpc as any).pledges.createPledgeCheckout.useMutation({
    onSuccess: (data: any) => {
      setPayingPledgeId(null);
      if (data?.checkoutUrl) {
        toast.info("Redirecting to Stripe Checkout...");
        window.open(data.checkoutUrl, "_blank");
      }
    },
    onError: (e: any) => { setPayingPledgeId(null); toast.error(e.message); },
  });
  const handleCreatePledge = () => {
    if (!pledgeForm.totalAmount || !donorId) { toast.error("Please enter a pledge amount"); return; }
    createPledgeMut.mutate({
      donorId: donorId!,
      donorName: donor?.fullName || donor?.name || undefined,
      campaignId: pledgeForm.campaignId ? Number(pledgeForm.campaignId) : undefined,
      totalAmount: pledgeForm.totalAmount,
      frequency: pledgeForm.frequency,
      startDate: pledgeForm.startDate || undefined,
      nextDueDate: pledgeForm.nextDueDate || undefined,
      isGiftAid: pledgeForm.isGiftAid,
      notes: pledgeForm.notes || undefined,
    });
  };
  const generatePortalTokenMut = (trpc as any).donorPortal.generateToken.useMutation({
    onSuccess: (data: any) => {
      const url = `${window.location.origin}/give/${data.token}`;
      setPortalLinkData({ token: data.token, url });
      setShowSendLinkDialog(true);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const exportStatementMut = (trpc as any).donors.exportAnnualStatement.useMutation({
    onSuccess: (data: any) => {
      if (data?.url) {
        window.open(data.url, "_blank");
        toast.success("Annual statement PDF generated");
      }
      setShowStatementDialog(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sendStatementMut = (trpc as any).donors.sendAnnualStatement.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Annual statement emailed to ${donor?.email ?? "donor"} — JazakAllah Khayran!`);
      setShowStatementDialog(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to send statement"),
  });

  useEffect(() => {
    if (donor) {
      const name = donor.fullName || donor.name || `Donor #${donorId}`;
    }
  }, [donor, donorId]);

  const donorName = donor?.fullName || donor?.name || "Donor";
  const donorFirstName = donorName.split(" ")[0];

  const handleCopyLink = useCallback(() => {
    if (!portalLinkData) return;
    navigator.clipboard.writeText(portalLinkData.url).then(() => {
      toast.success("Portal link copied to clipboard!");
    }).catch(() => {
      toast.info(`Link: ${portalLinkData.url}`);
    });
  }, [portalLinkData]);

  const handleSendWhatsApp = useCallback(() => {
    if (!portalLinkData || !donor?.phone) return;
    const msg = `Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${donorFirstName}!\n\nJazakAllah Khayran for your generous support of Abdullah Quilliam Society.\n\nYou can view your donation history, pledges, and Gift Aid declarations anytime using your secure Donor Portal:\n\n${portalLinkData.url}\n\nThis link is valid for 30 days.\n\nBarakAllahu feekum,\nAQS Finance Team`;
    window.open(buildWhatsAppUrl(donor.phone, msg), "_blank");
    toast.success("WhatsApp opened with portal link");
  }, [portalLinkData, donor, donorFirstName]);

  const handleSendEmail = useCallback(() => {
    if (!portalLinkData || !donor?.email) return;
    const subject = encodeURIComponent("Your AQ Society Donor Portal Link");
    const body = encodeURIComponent(`Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${donorFirstName},\n\nJazakAllah Khayran for your generous support of Abdullah Quilliam Society.\n\nYou can view your donation history, pledges, and Gift Aid declarations anytime using your secure Donor Portal:\n\n${portalLinkData.url}\n\nThis link is valid for 30 days.\n\nBarakAllahu feekum,\nAQS Finance Team`);
    window.open(`mailto:${donor.email}?subject=${subject}&body=${body}`, "_blank");
    toast.success("Email client opened with portal link");
  }, [portalLinkData, donor, donorFirstName]);
  const addNoteMut = (trpc as any).donorPipeline.addNote.useMutation({
    onSuccess: () => { toast.success("Note added"); refetchNotes(); setNoteText(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const recordDonationMut = (trpc as any).fundraising.recordDonation.useMutation({
    onSuccess: () => {
      toast.success(`Donation of £${donationForm.amount} recorded for ${donor?.fullName || donor?.name}`);
      setShowDonationDialog(false);
      setDonationForm(EMPTY_DONATION_FORM);
      refetchDonations();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleRecordDonation = () => {
    if (!donationForm.amount || !donationForm.campaignId) {
      toast.error("Please enter an amount and select a campaign");
      return;
    }
    recordDonationMut.mutate({
      campaignId: Number(donationForm.campaignId),
      donorName: donor?.fullName || donor?.name || "Unknown",
      donorEmail: donor?.email || undefined,
      amount: donationForm.amount,
      paymentMethod: donationForm.paymentMethod,
      isGiftAid: donationForm.isGiftAid,
      notes: donationForm.notes || undefined,
    });
  };

  // Pre-fill Gift Aid from donor record
  const defaultGiftAid = useMemo(() => !!donor?.isGiftAidEligible, [donor]);

  if (!donorId) return null;

  return (
      <>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/donors">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Donors
            </Button>
          </Link>
          {donor && (
            <div className="flex-1 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{donor.fullName || donor.name}</h1>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {donor.email && <span>{donor.email}</span>}
                    {donor.phone && <span>· {donor.phone}</span>}
                    {donor.rfmSegment && (
                      <Badge className={RFM_COLORS[donor.rfmSegment] ?? "bg-gray-100 text-gray-800"}>
                        {donor.rfmSegment}
                      </Badge>
                    )}
                    {donor.isGiftAidEligible && (
                      <Badge className="bg-green-100 text-green-800">Gift Aid</Badge>
                    )}
                  </div>
                </div>
              </div>
              {/* Quick Actions */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setDonationForm({ ...EMPTY_DONATION_FORM, isGiftAid: defaultGiftAid });
                    setShowDonationDialog(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" /> New Donation
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => donorId && generatePortalTokenMut.mutate({ donorId, purpose: "donation_history" })}
                  disabled={generatePortalTokenMut.isPending}
                >
                  <Send className="w-4 h-4 mr-1" /> Send Portal Link
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowStatementDialog(true)}
                >
                  <Download className="w-4 h-4 mr-1" /> Annual Statement
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === "overview" && donor && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Contact Details</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {donor.email && <p><span className="text-muted-foreground">Email:</span> {donor.email}</p>}
                {donor.phone && <p><span className="text-muted-foreground">Phone:</span> {donor.phone}</p>}
                {donor.address && <p><span className="text-muted-foreground">Address:</span> {donor.address}</p>}
                {donor.postcode && <p><span className="text-muted-foreground">Postcode:</span> {donor.postcode}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Donation Summary</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {donor.totalDonated !== undefined && <p><span className="text-muted-foreground">Total donated:</span> <strong>£{Number(donor.totalDonated || 0).toLocaleString()}</strong></p>}
                {donor.donationCount !== undefined && <p><span className="text-muted-foreground">Donations:</span> {donor.donationCount}</p>}
                {donor.lastDonationDate && <p><span className="text-muted-foreground">Last donation:</span> {new Date(donor.lastDonationDate).toLocaleDateString("en-GB")}</p>}
                {donor.rfmScore !== undefined && <p><span className="text-muted-foreground">RFM Score:</span> {donor.rfmScore}</p>}
                {donorTier && (
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground mb-1">Recognition Tier:</p>
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                      style={{ background: `${donorTier.color}22`, color: donorTier.color, border: `1px solid ${donorTier.color}55` }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ background: donorTier.color }} />
                      {donorTier.name}
                    </span>
                    {donorTier.description && <p className="text-xs text-muted-foreground mt-1">{donorTier.description}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Compliance</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">Gift Aid:</span> {donor.isGiftAidEligible ? "Eligible" : "Not eligible"}</p>
                {donor.giftAidDeclarationDate && <p><span className="text-muted-foreground">Declaration:</span> {new Date(donor.giftAidDeclarationDate).toLocaleDateString("en-GB")}</p>}
                {donor.lawfulBasis && <p><span className="text-muted-foreground">Lawful basis:</span> {donor.lawfulBasis}</p>}
                {donor.consentGiven !== undefined && <p><span className="text-muted-foreground">Consent:</span> {donor.consentGiven ? "Given" : "Not given"}</p>}
              </CardContent>
            </Card>
            {/* Next Best Action card (spec Module 01) */}
            <Card className="md:col-span-2 lg:col-span-3 border-l-4 border-l-emerald-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Suggested Next Action
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const seg = donor.rfmSegment ?? "";
                  const lastGift = donor.lastGiftDate ?? donor.lastDonationDate;
                  const daysSince = lastGift ? Math.floor((Date.now() - new Date(lastGift).getTime()) / 86400000) : null;
                  const status = donor.status ?? "lead";
                  const hasGiftAid = donor.isGiftAidEligible || donor.giftAidStatus === "eligible";
                  let action = "";
                  let colour = "text-emerald-700";
                  if (status === "lead" || status === "prospect") {
                    action = "Send a personalised welcome link via WhatsApp to complete their profile and make their first donation.";
                    colour = "text-blue-700";
                  } else if (status === "lapsed" || (daysSince !== null && daysSince > 365)) {
                    action = "This donor has not given in over a year. Send a re-engagement message with a campaign update and a donation link.";
                    colour = "text-amber-700";
                  } else if (!hasGiftAid) {
                    action = "Gift Aid declaration is missing. Send a portal link to collect their address and Gift Aid consent — worth 25% extra on every donation.";
                    colour = "text-orange-700";
                  } else if (seg === "Champion" || seg === "Loyal") {
                    action = "This is a high-value loyal donor. Consider inviting them to a Major Donor stewardship event or a personal thank-you call.";
                    colour = "text-purple-700";
                  } else if (seg === "At Risk") {
                    action = "Donor is at risk of lapsing. Send a personalised impact update and a soft ask within the next 14 days.";
                    colour = "text-red-700";
                  } else if (!donor.isRegular) {
                    action = "Invite this donor to set up a monthly standing order to become a regular supporter.";
                    colour = "text-teal-700";
                  } else {
                    action = "Donor is active and engaged. Send a campaign update or impact report to maintain the relationship.";
                    colour = "text-emerald-700";
                  }
                  return (
                    <div className={`text-sm font-medium ${colour}`}>
                      {action}
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => donorId && generatePortalTokenMut.mutate({ donorId, purpose: "donation_history" })} disabled={generatePortalTokenMut.isPending}>
                          <Send className="w-3.5 h-3.5 mr-1.5" /> Send Portal Link
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowDonationDialog(true)}>
                          <Plus className="w-3.5 h-3.5 mr-1.5" /> Record Donation
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "donations" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Donation History</CardTitle>
              <Button size="sm" onClick={() => {
                setDonationForm({ ...EMPTY_DONATION_FORM, isGiftAid: defaultGiftAid });
                setShowDonationDialog(true);
              }}>
                <Plus className="w-4 h-4 mr-1" /> Record Donation
              </Button>
            </CardHeader>
            <CardContent>
              {!donations?.length ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No donations recorded</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-4">Date</th>
                      <th className="text-left py-2 pr-4">Amount</th>
                      <th className="text-left py-2 pr-4">Campaign</th>
                      <th className="text-left py-2 pr-4">Method</th>
                      <th className="text-left py-2">Gift Aid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {donations.map((d: any) => (
                      <tr key={d.id} className="border-b hover:bg-muted/20">
                        <td className="py-2 pr-4">{d.donatedAt ? new Date(d.donatedAt).toLocaleDateString("en-GB") : "—"}</td>
                        <td className="py-2 pr-4 font-semibold">£{Number(d.amount).toLocaleString()}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{d.campaignName || "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground capitalize">{d.paymentMethod?.replace("_", " ") || "—"}</td>
                        <td className="py-2">{d.giftAidDeclared ? <Badge className="bg-green-100 text-green-800">Yes</Badge> : "No"}</td>
                        <td className="py-2">
                          {d.isRefund ? (
                            <Badge className="bg-red-100 text-red-800 text-xs">Refund</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700 h-6 px-2 text-xs"
                              onClick={() => { setRefundDonationId(d.id); setRefundReason(""); setRefundReverseGiftAid(d.giftAidDeclared); setShowRefundDialog(true); }}
                            >
                              Refund
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Refund Dialog */}
        <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Refund Donation</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">The original donation row will be preserved. A new negative-amount refund row will be created.</p>
              <div>
                <label className="text-sm font-medium">Reason for refund *</label>
                <Textarea
                  className="mt-1"
                  placeholder="e.g. Donor requested refund due to duplicate payment"
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="reverseGiftAid"
                  checked={refundReverseGiftAid}
                  onChange={e => setRefundReverseGiftAid(e.target.checked)}
                  className="h-4 w-4"
                />
                <label htmlFor="reverseGiftAid" className="text-sm">Reverse Gift Aid declaration</label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRefundDialog(false)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={refundReason.length < 5 || refundMut.isPending}
                onClick={() => refundDonationId && refundMut.mutate({ donationId: refundDonationId, reason: refundReason, reverseGiftAid: refundReverseGiftAid })}
              >
                {refundMut.isPending ? "Processing..." : "Confirm Refund"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {activeTab === "pledges" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Pledges</CardTitle>
              <Button size="sm" onClick={() => setShowPledgeDialog(true)}>
                <Plus className="h-4 w-4 mr-1" /> New Pledge
              </Button>
            </CardHeader>
            <CardContent>
              {!pledges?.length ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No pledges recorded yet</p>
              ) : (
                <div className="space-y-3">
                  {(pledges as any[]).map((p: any) => (
                    <div key={p.id} className="border rounded p-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">£{Number(p.totalAmount).toLocaleString()}</p>
                          {p.campaignName && <p className="text-xs text-muted-foreground">{p.campaignName}</p>}
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {p.frequency?.replace("_", "-")} · Paid: £{Number(p.paidAmount || 0).toLocaleString()} · Balance: £{Number(p.balanceOwing || 0).toLocaleString()}
                          </p>
                          {p.nextDueDate && <p className="text-xs text-muted-foreground">Next due: {new Date(p.nextDueDate).toLocaleDateString("en-GB")}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <Badge className={p.status === "fulfilled" ? "bg-green-100 text-green-800" : p.status === "lapsed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}>
                            {p.status}
                          </Badge>
                          {p.status !== "fulfilled" && Number(p.balanceOwing) >= 0.5 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 px-2"
                              disabled={payingPledgeId === p.id || createPledgeCheckoutMut.isPending}
                              onClick={() => {
                                setPayingPledgeId(p.id);
                                createPledgeCheckoutMut.mutate({ pledgeId: p.id, origin: window.location.origin });
                              }}
                            >
                              {payingPledgeId === p.id ? "Opening..." : "Pay Now"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "comms" && (
          <div className="space-y-4">
            {/* Communication History Log */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base">Communication History</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Portal links, statements, reminders and manual notes</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowAddLogDialog(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Log Interaction
                </Button>
              </CardHeader>
              <CardContent>
                {!commsLog?.length ? (
                  <p className="text-muted-foreground text-sm py-4 text-center">No communication history yet. Actions like sending portal links and annual statements are logged here automatically.</p>
                ) : (
                  <div className="space-y-2">
                    {(commsLog as any[]).map((entry: any) => {
                      const typeLabels: Record<string, string> = {
                        portal_link_sent: "Portal Link Sent",
                        annual_statement_sent: "Annual Statement Sent",
                        pledge_reminder_sent: "Pledge Reminder Sent",
                        payment_receipt_sent: "Payment Receipt Sent",
                        thank_you_sent: "Thank You Sent",
                        manual_note: "Manual Note",
                        email_sent: "Email Sent",
                        whatsapp_sent: "WhatsApp Sent",
                      };
                      const typeColors: Record<string, string> = {
                        portal_link_sent: "bg-blue-100 text-blue-800",
                        annual_statement_sent: "bg-green-100 text-green-800",
                        pledge_reminder_sent: "bg-amber-100 text-amber-800",
                        payment_receipt_sent: "bg-purple-100 text-purple-800",
                        thank_you_sent: "bg-pink-100 text-pink-800",
                        manual_note: "bg-gray-100 text-gray-800",
                        email_sent: "bg-cyan-100 text-cyan-800",
                        whatsapp_sent: "bg-emerald-100 text-emerald-800",
                      };
                      const channelIcon: Record<string, string> = { email: "✉️", whatsapp: "💬", sms: "📱", system: "⚙️" };
                      return (
                        <div key={entry.id} className="border rounded p-3 text-sm flex items-start gap-3">
                          <span className="text-base mt-0.5">{channelIcon[entry.channel] ?? "📧"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${typeColors[entry.type] ?? "bg-gray-100 text-gray-800"}`}>
                                {typeLabels[entry.type] ?? entry.type}
                              </span>
                              {entry.subject && <span className="font-medium truncate">{entry.subject}</span>}
                            </div>
                            {entry.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.notes}</p>}
                            <p className="text-xs text-muted-foreground mt-1">{new Date(entry.createdAt).toLocaleString("en-GB")}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Inbox Emails from this donor */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Inbox Emails</CardTitle>
                {donor?.email && <p className="text-xs text-muted-foreground mt-0.5">Emails received from <strong>{donor.email}</strong></p>}
              </CardHeader>
              <CardContent>
                {!emailsList?.length ? (
                  <p className="text-muted-foreground text-sm py-4 text-center">No emails found for this donor{donor?.email ? " (" + donor.email + ")" : ""}</p>
                ) : (
                  <div className="space-y-2">
                    {(emailsList as any[]).map((e: any) => (
                      <div key={e.id} className="border rounded p-3 text-sm hover:bg-muted/30 transition-colors">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {e.status === "unread" && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                            {e.priority === "urgent" && <span className="text-xs font-bold text-red-500 flex-shrink-0">URGENT</span>}
                            <span className="font-medium truncate">{e.subject || "(No subject)"}</span>
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">{e.receivedAt ? new Date(e.receivedAt).toLocaleDateString("en-GB") : ""}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-muted-foreground text-xs">{e.fromName ? `${e.fromName} <${e.fromEmail}>` : e.fromEmail}</p>
                          {e.sectionId && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Section #{e.sectionId}</span>}
                        </div>
                        {e.snippet && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.snippet}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "notes" && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Add Note</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Add a note about this donor..."
                  rows={3}
                />
                <Button disabled={!noteText || addNoteMut.isPending}
                  onClick={() => addNoteMut.mutate({ donorId: donorId!, note: noteText })}>
                  Add Note
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Notes History</CardTitle></CardHeader>
              <CardContent>
                {!notes?.length ? (
                  <p className="text-muted-foreground text-sm py-4 text-center">No notes yet</p>
                ) : (
                  <div className="space-y-3">
                    {notes.map((n: any) => (
                      <div key={n.id} className="border rounded p-3 text-sm">
                        <p>{n.note || n.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {n.authorName || "Staff"} · {new Date(n.createdAt).toLocaleDateString("en-GB")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "dedications" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Sadaqah Jariyah Dedications</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Perpetual charity dedications recorded for this donor</p>
                </div>
                <Button size="sm" onClick={() => setShowDedicationDialog(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Add Dedication
                </Button>
              </CardHeader>
              <CardContent>
                {!sadaqahEntries?.length ? (
                  <div className="text-center py-8">
                    <Star className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">No dedications recorded yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Sadaqah Jariyah dedications are perpetual charity gifts made in memory of or in honour of a named individual</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(sadaqahEntries as any[]).map((entry: any) => (
                      <div key={entry.id} className="border rounded-lg p-4 bg-amber-50/30 dark:bg-amber-900/10">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Star className="w-4 h-4 text-amber-500 flex-shrink-0" />
                            <div>
                              <p className="font-semibold">{entry.beneficiaryName}</p>
                              {entry.beneficiaryRelation && <p className="text-xs text-muted-foreground">{entry.beneficiaryRelation}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {entry.displayOnDonorWall && <Badge className="bg-green-100 text-green-800 text-xs">Public</Badge>}
                          </div>
                        </div>
                        {entry.beneficiaryNotes && <p className="text-sm text-muted-foreground mt-2 ml-6">{entry.beneficiaryNotes}</p>}
                        <p className="text-xs text-muted-foreground mt-2 ml-6">{new Date(entry.createdAt).toLocaleDateString("en-GB")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Add Dedication Dialog */}
            <Dialog open={showDedicationDialog} onOpenChange={setShowDedicationDialog}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Sadaqah Jariyah Dedication</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Dedicated To (Name) *</label>
                    <Input value={dedicationForm.dedicatedTo} onChange={e => setDedicationForm(f => ({ ...f, dedicatedTo: e.target.value }))} placeholder="e.g. Late Brother Muhammad Ali" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Relationship to Donor</label>
                    <Input value={dedicationForm.relationship} onChange={e => setDedicationForm(f => ({ ...f, relationship: e.target.value }))} placeholder="e.g. Father, Mother, Spouse" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Occasion</label>
                    <Input value={dedicationForm.occasion} onChange={e => setDedicationForm(f => ({ ...f, occasion: e.target.value }))} placeholder="e.g. In memory of, In honour of" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Notes</label>
                    <Textarea value={dedicationForm.notes} onChange={e => setDedicationForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes..." rows={2} />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="isPublic" checked={dedicationForm.isPublic} onChange={e => setDedicationForm(f => ({ ...f, isPublic: e.target.checked }))} />
                    <label htmlFor="isPublic" className="text-sm">Show on public Donors Wall</label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDedicationDialog(false)}>Cancel</Button>
                  <Button
                    disabled={!dedicationForm.dedicatedTo || addDedicationMut.isPending}
                    onClick={() => addDedicationMut.mutate({ donorId: donorId!, dedicatedTo: dedicationForm.dedicatedTo, relationship: dedicationForm.relationship || undefined, occasion: dedicationForm.occasion || undefined, notes: dedicationForm.notes || undefined, isPublic: dedicationForm.isPublic })}
                  >
                    {addDedicationMut.isPending ? "Saving..." : "Save Dedication"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {activeTab === "audit" && (
          <Card>
            <CardHeader><CardTitle>Audit Trail</CardTitle></CardHeader>
            <CardContent>
              {!auditData?.rows?.length ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No audit events for this donor</p>
              ) : (
                <div className="space-y-2">
                  {auditData.rows.map((log: any) => (
                    <div key={log.id} className="border rounded p-3 text-sm flex items-start gap-3">
                      <Activity className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">{log.action} {log.entity}</p>
                        {log.meta && <p className="text-muted-foreground text-xs">{typeof log.meta === "string" ? log.meta : JSON.stringify(log.meta)}</p>}
                        <p className="text-xs text-muted-foreground mt-1">
                          {log.userName || "System"} · {new Date(log.createdAt).toLocaleString("en-GB")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick-Add Pledge Dialog */}
      <Dialog open={showPledgeDialog} onOpenChange={setShowPledgeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Pledge — {donor?.fullName || donor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/40 rounded p-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">Donor:</span> <strong>{donor?.fullName || donor?.name}</strong></p>
              {donor?.isGiftAidEligible && <Badge className="bg-green-100 text-green-800 text-xs">Gift Aid Eligible</Badge>}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Total Pledge Amount (£) *</label>
              <Input
                type="number" min="0.50" step="0.01"
                value={pledgeForm.totalAmount}
                onChange={e => setPledgeForm(f => ({ ...f, totalAmount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Frequency</label>
              <Select value={pledgeForm.frequency} onValueChange={v => setPledgeForm(f => ({ ...f, frequency: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_off">One-off</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Campaign (optional)</label>
              <Select value={pledgeForm.campaignId} onValueChange={v => setPledgeForm(f => ({ ...f, campaignId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select campaign..." /></SelectTrigger>
                <SelectContent>
                  {campaigns?.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Start Date</label>
                <Input type="date" value={pledgeForm.startDate} onChange={e => setPledgeForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Next Due Date</label>
                <Input type="date" value={pledgeForm.nextDueDate} onChange={e => setPledgeForm(f => ({ ...f, nextDueDate: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox" id="pledgeGiftAid"
                checked={pledgeForm.isGiftAid}
                onChange={e => setPledgeForm(f => ({ ...f, isGiftAid: e.target.checked }))}
                className="w-4 h-4"
              />
              <label htmlFor="pledgeGiftAid" className="text-sm">
                Gift Aid declaration confirmed
                {donor?.isGiftAidEligible && <span className="text-green-600 ml-1">(donor is eligible)</span>}
              </label>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Notes (optional)</label>
              <Textarea
                value={pledgeForm.notes}
                onChange={e => setPledgeForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes about this pledge..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPledgeDialog(false)}>Cancel</Button>
            <Button
              disabled={createPledgeMut.isPending || !pledgeForm.totalAmount}
              onClick={handleCreatePledge}
            >
              {createPledgeMut.isPending ? "Creating..." : "Create Pledge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick-Add Donation Dialog */}
      <Dialog open={showDonationDialog} onOpenChange={setShowDonationDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Donation — {donor?.fullName || donor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Donor pre-fill info */}
            <div className="bg-muted/40 rounded p-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">Donor:</span> <strong>{donor?.fullName || donor?.name}</strong></p>
              {donor?.email && <p><span className="text-muted-foreground">Email:</span> {donor.email}</p>}
              {donor?.isGiftAidEligible && <Badge className="bg-green-100 text-green-800 text-xs">Gift Aid Eligible</Badge>}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Amount (£) *</label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={donationForm.amount}
                onChange={e => setDonationForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Campaign *</label>
              <Select value={donationForm.campaignId} onValueChange={v => setDonationForm(f => ({ ...f, campaignId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select campaign..." /></SelectTrigger>
                <SelectContent>
                  {campaigns?.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Payment Method</label>
              <Select value={donationForm.paymentMethod} onValueChange={v => setDonationForm(f => ({ ...f, paymentMethod: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="giftAidCheck"
                checked={donationForm.isGiftAid}
                onChange={e => setDonationForm(f => ({ ...f, isGiftAid: e.target.checked }))}
                className="w-4 h-4"
              />
              <label htmlFor="giftAidCheck" className="text-sm">
                Gift Aid declaration confirmed
                {donor?.isGiftAidEligible && <span className="text-green-600 ml-1">(donor is eligible)</span>}
              </label>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Notes (optional)</label>
              <Textarea
                value={donationForm.notes}
                onChange={e => setDonationForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes about this donation..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDonationDialog(false)}>Cancel</Button>
            <Button
              disabled={recordDonationMut.isPending || !donationForm.amount || !donationForm.campaignId}
              onClick={handleRecordDonation}
            >
              {recordDonationMut.isPending ? "Recording..." : "Record Donation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Portal Link Dialog */}
      <Dialog open={showSendLinkDialog} onOpenChange={setShowSendLinkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Portal Link to {donorName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A secure portal link has been generated. Choose how to send it to the donor:
            </p>
            {portalLinkData && (
              <div className="bg-muted/40 rounded p-3 text-xs font-mono break-all">
                {portalLinkData.url}
              </div>
            )}
            <div className="grid gap-2">
              <Button
                className="w-full justify-start gap-3"
                variant="outline"
                onClick={handleCopyLink}
              >
                <Share2 className="w-4 h-4" /> Copy Link to Clipboard
              </Button>
              {donor?.phone && (
                <Button
                  className="w-full justify-start gap-3"
                  variant="outline"
                  onClick={handleSendWhatsApp}
                >
                  <Phone className="w-4 h-4" /> Send via WhatsApp ({donor.phone})
                </Button>
              )}
              {donor?.email && (
                <Button
                  className="w-full justify-start gap-3"
                  variant="outline"
                  onClick={handleSendEmail}
                >
                  <Mail className="w-4 h-4" /> Send via Email ({donor.email})
                </Button>
              )}
              {!donor?.phone && !donor?.email && (
                <p className="text-sm text-amber-600">No phone or email on file — please copy the link manually.</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Link expires in 30 days.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendLinkDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Annual Statement Dialog */}
      <Dialog open={showStatementDialog} onOpenChange={setShowStatementDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Export Annual Giving Statement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate a PDF statement for <strong>{donorName}</strong> covering all donations in the selected UK tax year (6 Apr – 5 Apr).
            </p>
            <div>
              <label className="text-sm font-medium mb-1 block">Tax Year</label>
              <Select value={String(statementTaxYear)} onValueChange={v => setStatementTaxYear(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => {
                    const y = new Date().getFullYear() - i;
                    return <SelectItem key={y} value={String(y)}>{y}/{y + 1}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowStatementDialog(false)}>Cancel</Button>
            <Button
              variant="outline"
              disabled={exportStatementMut.isPending || sendStatementMut.isPending}
              onClick={() => donorId && exportStatementMut.mutate({ donorId, taxYear: statementTaxYear })}
            >
              <Download className="w-4 h-4 mr-1" />
              {exportStatementMut.isPending ? "Generating..." : "Download PDF"}
            </Button>
            <Button
              disabled={sendStatementMut.isPending || exportStatementMut.isPending || !donor?.email}
              title={!donor?.email ? "Donor has no email address" : `Send to ${donor?.email}`}
              onClick={() => donorId && sendStatementMut.mutate({ donorId, taxYear: statementTaxYear })}
            >
              <Mail className="w-4 h-4 mr-1" />
              {sendStatementMut.isPending ? "Sending..." : "Send via Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Log Interaction Dialog */}
      <Dialog open={showAddLogDialog} onOpenChange={setShowAddLogDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Interaction with {donorName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Type</label>
              <Select value={logForm.type} onValueChange={v => setLogForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual_note">Manual Note</SelectItem>
                  <SelectItem value="email_sent">Email Sent</SelectItem>
                  <SelectItem value="whatsapp_sent">WhatsApp Sent</SelectItem>
                  <SelectItem value="portal_link_sent">Portal Link Sent</SelectItem>
                  <SelectItem value="thank_you_sent">Thank You Sent</SelectItem>
                  <SelectItem value="pledge_reminder_sent">Pledge Reminder Sent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Channel</label>
              <Select value={logForm.channel} onValueChange={v => setLogForm(f => ({ ...f, channel: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="system">System / Auto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Subject / Title</label>
              <Input className="mt-1" placeholder="e.g. Ramadan appeal follow-up" value={logForm.subject} onChange={e => setLogForm(f => ({ ...f, subject: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea className="mt-1" rows={3} placeholder="What was communicated?" value={logForm.notes} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddLogDialog(false)}>Cancel</Button>
            <Button
              disabled={addCommsLogMut.isPending}
              onClick={() => addCommsLogMut.mutate({
                donorId: donorId!,
                type: logForm.type as any,
                channel: logForm.channel as any,
                subject: logForm.subject || undefined,
                notes: logForm.notes || undefined,
              })}
            >
              {addCommsLogMut.isPending ? "Saving..." : "Save Log Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
  );
}
