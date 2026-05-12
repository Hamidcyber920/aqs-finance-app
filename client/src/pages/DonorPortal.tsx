import { useState } from "react";
import { useParams, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { CreditCard, FileText, CheckCircle, AlertCircle, Loader2, Heart, Clock, UserCheck } from "lucide-react";

function statusColor(status: string) {
  if (status === "fulfilled") return "bg-green-100 text-green-800";
  if (status === "active") return "bg-blue-100 text-blue-800";
  if (status === "lapsed") return "bg-yellow-100 text-yellow-800";
  if (status === "cancelled") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-800";
}

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export default function DonorPortal() {
  const { token } = useParams<{ token: string }>();
  const search = useSearch();
  const paid = new URLSearchParams(search).get("paid") === "1";
  const [payingPledgeId, setPayingPledgeId] = useState<number | null>(null);
  const [donationAmount, setDonationAmount] = useState("");
  const [donationLoading, setDonationLoading] = useState(false);

  // Profile completion form state
  const [profileFormOpen, setProfileFormOpen] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [formAddress, setFormAddress] = useState("");
  const [formPostcode, setFormPostcode] = useState("");
  const [formIsUkTaxpayer, setFormIsUkTaxpayer] = useState(false);
  const [formGiftAidConsent, setFormGiftAidConsent] = useState(false);

  type PortalPledge = { id: number; campaignName?: string | null; totalAmount: string; balanceOwing: string; paidToDate: string; status: string; nextDueDate?: string | null; frequency: string; isGiftAid: boolean; };
  type PortalGiftAid = { id: number; campaignName?: string | null; amount: string; donationDate: string; declarationMethod: string; };
  type PortalDonor = { id: number; name: string; email?: string | null; phone?: string | null; totalGiven: string; };
  type LeadData = { isUkTaxpayer: boolean; giftAidConsent: boolean; profileComplete: boolean; address?: string | null; postcode?: string | null; };

  const { data, isLoading, error } = (trpc as any).donorPortal.getByToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token, retry: false }
  );

  const checkout = (trpc as any).donorPortal.createPledgeCheckout.useMutation({
    onSuccess: (d: any) => {
      if (d.url) window.open(d.url, "_blank");
      else toast.error("Could not create payment session");
      setPayingPledgeId(null);
    },
    onError: (e: any) => {
      toast.error(e.message);
      setPayingPledgeId(null);
    },
  });

  const leadDonationCheckout = (trpc as any).donorPortal.createLeadDonationCheckout.useMutation({
    onSuccess: (d: any) => {
      if (d.url) window.open(d.url, "_blank");
      else toast.error("Could not create payment session");
      setDonationLoading(false);
    },
    onError: (e: any) => {
      toast.error(e.message);
      setDonationLoading(false);
    },
  });

  const handleLeadDonate = () => {
    const amt = parseFloat(donationAmount);
    if (!amt || amt < 0.5) { toast.error("Minimum donation is £0.50"); return; }
    setDonationLoading(true);
    leadDonationCheckout.mutate({ token: token ?? "", amount: amt, origin: window.location.origin });
  };

  const completeProfile = (trpc as any).donorPortal.completeLeadProfile.useMutation({
    onSuccess: () => {
      setProfileSaved(true);
      setProfileFormOpen(false);
      toast.success("JazakAllah Khayran! Your profile has been updated.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handlePay = (pledgeId: number, balance: string) => {
    const amount = parseFloat(balance);
    if (!amount || amount <= 0) { toast.error("No balance owing"); return; }
    setPayingPledgeId(pledgeId);
    checkout.mutate({ token: token ?? "", pledgeId, amount, origin: window.location.origin });
  };

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAddress.trim() || !formPostcode.trim()) {
      toast.error("Please enter your address and postcode");
      return;
    }
    completeProfile.mutate({
      token: token ?? "",
      address: formAddress.trim(),
      postcode: formPostcode.trim(),
      isUkTaxpayer: formIsUkTaxpayer,
      giftAidConsent: formGiftAidConsent,
    });
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-8">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Invalid Link</h2>
          <p className="text-muted-foreground">This link is missing a valid token. Please check the link you received.</p>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-8">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Link Not Valid</h2>
          <p className="text-muted-foreground">{error.message}</p>
          <p className="text-sm text-muted-foreground mt-2">Please contact AQ Society for a new link.</p>
          <a href="https://wa.me/447958465328" className="inline-block mt-4 text-sm text-emerald-700 underline">Contact AQ Society via WhatsApp →</a>
        </Card>
      </div>
    );
  }

  const { donor, pledges, giftAidDeclarations, isLead, leadData, tokenExpiry } = data as {
    donor: PortalDonor;
    pledges: PortalPledge[];
    giftAidDeclarations: PortalGiftAid[];
    tokenPurpose: string;
    isLead?: boolean;
    leadData?: LeadData;
    tokenExpiry?: string;
  };

  const firstName = donor.name?.split(" ")[0] ?? "Brother/Sister";
  const activePledges = pledges.filter((p: PortalPledge) => p.status === "active" || p.status === "lapsed");
  const fulfilledPledges = pledges.filter((p: PortalPledge) => p.status === "fulfilled");

  // Expiry warning: show if fewer than 7 days remain
  const expiryDays = tokenExpiry ? daysUntil(tokenExpiry) : null;
  const showExpiryWarning = expiryDays !== null && expiryDays <= 7 && expiryDays > 0;

  // Pre-fill form from existing lead data when opening
  const openProfileForm = () => {
    setFormAddress(leadData?.address ?? "");
    setFormPostcode(leadData?.postcode ?? "");
    setFormIsUkTaxpayer(leadData?.isUkTaxpayer ?? false);
    setFormGiftAidConsent(leadData?.giftAidConsent ?? false);
    setProfileFormOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">
            <Heart className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">AQ Society</h1>
            <p className="text-xs text-muted-foreground">Donor Portal</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Payment success banner */}
        {paid && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-4 flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-600 shrink-0" />
              <div>
                <p className="font-semibold text-green-800">JazakAllah Khayran!</p>
                <p className="text-sm text-green-700">Your payment has been received. May Allah accept it and bless you abundantly. 🤲</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Token expiry warning */}
        {showExpiryWarning && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-orange-600 shrink-0" />
              <div>
                <p className="font-semibold text-orange-800">
                  {expiryDays === 1 ? "This link expires today!" : `This link expires in ${expiryDays} day${expiryDays !== 1 ? "s" : ""}`}
                </p>
                <p className="text-sm text-orange-700">Please bookmark this page or ask AQ Society for a new link before it expires.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Profile completion prompt / form */}
        {isLead && !profileSaved && !leadData?.profileComplete && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-4">
              {!profileFormOpen ? (
                <div className="flex items-start gap-3">
                  <UserCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-amber-800">Complete Your Donor Profile</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Add your address and Gift Aid consent to enable AQ Society to claim 25% Gift Aid on your donations — at no cost to you.
                    </p>
                    <Button
                      size="sm"
                      className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={openProfileForm}
                    >
                      Complete Profile Now
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <UserCheck className="h-5 w-5 text-amber-600" />
                    <p className="font-semibold text-amber-800">Complete Your Donor Profile</p>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="address" className="text-amber-900">Home Address</Label>
                    <Input
                      id="address"
                      placeholder="e.g. 12 High Street, Liverpool"
                      value={formAddress}
                      onChange={e => setFormAddress(e.target.value)}
                      className="bg-white border-amber-300"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="postcode" className="text-amber-900">Postcode</Label>
                    <Input
                      id="postcode"
                      placeholder="e.g. L3 8EE"
                      value={formPostcode}
                      onChange={e => setFormPostcode(e.target.value.toUpperCase())}
                      className="bg-white border-amber-300 max-w-[180px]"
                      required
                    />
                  </div>

                  <div className="space-y-3 pt-1">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="ukTaxpayer"
                        checked={formIsUkTaxpayer}
                        onCheckedChange={v => setFormIsUkTaxpayer(!!v)}
                        className="mt-0.5"
                      />
                      <Label htmlFor="ukTaxpayer" className="text-sm text-amber-900 leading-snug cursor-pointer">
                        I am a UK taxpayer and pay Income Tax or Capital Gains Tax equal to or more than the Gift Aid claimed on my donations.
                      </Label>
                    </div>

                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="giftAid"
                        checked={formGiftAidConsent}
                        onCheckedChange={v => setFormGiftAidConsent(!!v)}
                        className="mt-0.5"
                      />
                      <Label htmlFor="giftAid" className="text-sm text-amber-900 leading-snug cursor-pointer">
                        I consent to AQ Society claiming Gift Aid on all qualifying donations I have made in the past 4 years and any future donations.
                      </Label>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      type="submit"
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      disabled={completeProfile.isPending}
                    >
                      {completeProfile.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving…</> : "Save Profile"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-amber-700"
                      onClick={() => setProfileFormOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {/* Profile completion success */}
        {(profileSaved || (isLead && leadData?.profileComplete)) && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-4 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
              <div>
                <p className="font-semibold text-green-800">Profile Complete</p>
                <p className="text-sm text-green-700">Your donor profile is up to date. JazakAllah Khayran!</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Greeting */}
        <Card>
          <CardContent className="pt-6">
            <p className="text-lg font-semibold">Assalamu Alaikum, {firstName}</p>
            <p className="text-muted-foreground text-sm mt-1">
              Welcome to your personal donor portal. Here you can view your pledge commitments, Gift Aid declarations, and make payments.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-emerald-700">£{Number(donor.totalGiven ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Donated</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{pledges.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Pledge{pledges.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            {giftAidDeclarations.length > 0 && (
              <div className="mt-3 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                <CheckCircle className="h-4 w-4" />
                <span>Gift Aid registered — AQ Society can claim 25% uplift on your donations</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Make a Donation card — shown only for leads (no pledges yet) */}
        {isLead && pledges.length === 0 && (
          <Card className="border-emerald-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-emerald-600" />
                Make a Donation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You can make a secure card payment directly from this portal. Enter the amount you would like to donate below.
              </p>
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">£</span>
                  <Input
                    type="number"
                    min="0.50"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-7"
                    value={donationAmount}
                    onChange={e => setDonationAmount(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleLeadDonate()}
                  />
                </div>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
                  onClick={handleLeadDonate}
                  disabled={donationLoading || !donationAmount || parseFloat(donationAmount) < 0.5}
                >
                  {donationLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Redirecting…</> : <><CreditCard className="h-4 w-4 mr-1" />Pay Securely</>}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {[10, 25, 50, 100, 250].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    className="px-3 py-1 text-sm rounded-full border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors"
                    onClick={() => setDonationAmount(String(preset))}
                  >
                    £{preset}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Payments are processed securely via Stripe. You will be redirected to complete payment.</p>
            </CardContent>
          </Card>
        )}

        {/* Active Pledges */}
        {activePledges.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Active Pledges</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {activePledges.map((pledge: PortalPledge) => (
                <div key={pledge.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{pledge.campaignName ?? "AQ Society"}</p>
                      <p className="text-sm text-muted-foreground capitalize">{pledge.frequency?.replace("_", "-")} pledge</p>
                    </div>
                    <Badge className={statusColor(pledge.status)}>{pledge.status}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Total Pledge</p>
                      <p className="font-semibold">£{Number(pledge.totalAmount).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Paid</p>
                      <p className="font-semibold text-green-700">£{Number(pledge.paidToDate ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Balance</p>
                      <p className="font-semibold text-orange-700">£{Number(pledge.balanceOwing ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                  {pledge.nextDueDate && (
                    <p className="text-xs text-muted-foreground">
                      Next due: {new Date(pledge.nextDueDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  )}
                  {Number(pledge.balanceOwing ?? 0) > 0 && (
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => handlePay(pledge.id, pledge.balanceOwing)}
                      disabled={payingPledgeId === pledge.id}
                    >
                      {payingPledgeId === pledge.id ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Redirecting to payment…</>
                      ) : (
                        <><CreditCard className="h-4 w-4 mr-2" />Pay £{Number(pledge.balanceOwing).toLocaleString("en-GB", { minimumFractionDigits: 2 })} Now</>
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Fulfilled Pledges */}
        {fulfilledPledges.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Fulfilled Pledges
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {fulfilledPledges.map((pledge: PortalPledge) => (
                <div key={pledge.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{pledge.campaignName ?? "AQ Society"}</p>
                    <p className="text-xs text-muted-foreground">£{Number(pledge.totalAmount).toLocaleString("en-GB", { minimumFractionDigits: 2 })} — fully paid</p>
                  </div>
                  <Badge className="bg-green-100 text-green-800">Fulfilled</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Gift Aid Declarations */}
        {giftAidDeclarations.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                Gift Aid Declarations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {giftAidDeclarations.map((decl: PortalGiftAid) => (
                <div key={decl.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{decl.campaignName ?? "General Donation"}</p>
                    <p className="text-xs text-muted-foreground">
                      £{Number(decl.amount).toLocaleString("en-GB", { minimumFractionDigits: 2 })} •{" "}
                      {decl.donationDate ? new Date(decl.donationDate).toLocaleDateString("en-GB") : ""}
                    </p>
                  </div>
                  <Badge className="bg-blue-100 text-blue-800">Gift Aid</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {pledges.length === 0 && giftAidDeclarations.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <Heart className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p>No pledges or Gift Aid declarations on record yet.</p>
              <p className="text-sm mt-1">Contact AQ Society to set up a pledge.</p>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <Separator />
        <p className="text-center text-xs text-muted-foreground pb-6">
          Abdullah Quilliam Society · Registered Charity · This portal is secure and personalised for {donor.name}.
          <br />For queries, contact <a href="mailto:info@aqsociety.org" className="underline">info@aqsociety.org</a>
          {" "}or <a href="https://wa.me/447958465328" className="underline">WhatsApp</a>
        </p>
      </div>
    </div>
  );
}
