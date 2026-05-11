import { useState, useMemo, useCallback } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, User, Heart, FileText, MessageSquare, Activity, BookOpen, Plus, Share2, Send, Mail, Phone, Download, Calendar } from "lucide-react";
import { Link } from "wouter";

const TABS = [
  { id: "overview", label: "Overview", icon: User },
  { id: "donations", label: "Donations", icon: Heart },
  { id: "pledges", label: "Pledges", icon: FileText },
  { id: "comms", label: "Communications", icon: MessageSquare },
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

  const { data: notes, refetch: refetchNotes } = (trpc as any).donorPipeline.listNotes.useQuery(
    { donorId: donorId! },
    { enabled: !!donorId && activeTab === "notes" }
  );

  const { data: auditData } = (trpc as any).auditTrail.list.useQuery(
    { entity: "donor", search: donor?.fullName || donor?.name, pageSize: 50 },
    { enabled: !!donor && activeTab === "audit" }
  );

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
    const cleaned = donor.phone.replace(/\D/g, "");
    const waNumber = cleaned.startsWith("0") ? "44" + cleaned.slice(1) : cleaned;
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`, "_blank");
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
    <DashboardLayout>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}

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
          <Card>
            <CardHeader>
              <CardTitle>Communications</CardTitle>
              {donor?.email && <p className="text-xs text-muted-foreground mt-1">Showing emails from <strong>{donor.email}</strong></p>}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatementDialog(false)}>Cancel</Button>
            <Button
              disabled={exportStatementMut.isPending}
              onClick={() => donorId && exportStatementMut.mutate({ donorId, taxYear: statementTaxYear })}
            >
              <Download className="w-4 h-4 mr-1" />
              {exportStatementMut.isPending ? "Generating..." : "Generate PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
