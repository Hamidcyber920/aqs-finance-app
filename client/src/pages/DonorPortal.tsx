import { useState } from "react";
import { useParams, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CreditCard, FileText, CheckCircle, AlertCircle, Loader2, Heart } from "lucide-react";

function statusColor(status: string) {
  if (status === "fulfilled") return "bg-green-100 text-green-800";
  if (status === "active") return "bg-blue-100 text-blue-800";
  if (status === "lapsed") return "bg-yellow-100 text-yellow-800";
  if (status === "cancelled") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-800";
}

export default function DonorPortal() {
  const { token } = useParams<{ token: string }>();
  const search = useSearch();
  const paid = new URLSearchParams(search).get("paid") === "1";
  const [payingPledgeId, setPayingPledgeId] = useState<number | null>(null);

  type PortalPledge = { id: number; campaignName?: string | null; totalAmount: string; balanceOwing: string; paidToDate: string; status: string; nextDueDate?: string | null; frequency: string; isGiftAid: boolean; };
  type PortalGiftAid = { id: number; campaignName?: string | null; amount: string; donationDate: string; declarationMethod: string; };
  type PortalDonor = { id: number; name: string; email?: string | null; phone?: string | null; totalGiven: string; };
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

  const handlePay = (pledgeId: number, balance: string) => {
    const amount = parseFloat(balance);
    if (!amount || amount <= 0) { toast.error("No balance owing"); return; }
    setPayingPledgeId(pledgeId);
    checkout.mutate({ token: token ?? "", pledgeId, amount, origin: window.location.origin });
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
        </Card>
      </div>
    );
  }

  const { donor, pledges, giftAidDeclarations } = data as { donor: PortalDonor; pledges: PortalPledge[]; giftAidDeclarations: PortalGiftAid[]; tokenPurpose: string; };
  const firstName = donor.name?.split(" ")[0] ?? "Brother/Sister";
  const activePledges = pledges.filter((p: PortalPledge) => p.status === "active" || p.status === "lapsed");
  const fulfilledPledges = pledges.filter((p: PortalPledge) => p.status === "fulfilled");

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
        </p>
      </div>
    </div>
  );
}
