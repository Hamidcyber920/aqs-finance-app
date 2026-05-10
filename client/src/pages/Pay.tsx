/**
 * /pay — Public donor payment page
 *
 * Reads URL parameters:
 *   ?ref=AQS-001          — pre-existing reference code (from QuickCapture)
 *   ?name=Brother+Ahmed   — pre-filled donor name
 *   ?campaign=Rimmers     — pre-filled campaign name
 *   ?amount=50.00         — pre-filled amount
 *   ?method=stripe|paypal|bank — default payment method tab
 *
 * Supports Stripe Payment Element (embedded), PayPal, and Bank Transfer.
 * No login required — this is a public-facing page.
 */
import { useState, useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard, Globe, Building2, Smartphone, Landmark, Copy, CheckCircle2 } from "lucide-react";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string);

// AQS Bank Details
const AQS_BANK = {
  accountName: "Abdullah Quilliam Society",
  sortCode: "30-96-26",
  accountNumber: "XXXXXXXX",
  iban: "GB00 LOYD 3096 26XX XXXX XX",
  swift: "LOYDGB21",
  bankName: "Lloyds Bank",
};

function useUrlParams() {
  return useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return {
      ref: p.get("ref") ?? "",
      name: p.get("name") ?? "",
      campaign: p.get("campaign") ?? "",
      amount: p.get("amount") ?? "",
      method: (p.get("method") ?? "stripe") as "stripe" | "paypal" | "bank",
    };
  }, []);
}

// ─── Stripe Checkout Form ────────────────────────────────────────────────────
function StripeCheckoutForm({ referenceCode, amount, onBack }: { referenceCode: string; amount: number; onBack: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payment/success?ref=${referenceCode}`,
      },
    });
    if (error) {
      toast.error(error.message ?? "Payment failed. Please try again.");
      setProcessing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">Reference</p>
          <p className="font-mono font-bold text-emerald-900">{referenceCode}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">Amount</p>
          <p className="font-bold text-emerald-900 text-lg">£{amount.toFixed(2)}</p>
        </div>
      </div>
      <div className="rounded-lg border p-4 bg-background">
        <PaymentElement options={{ layout: "tabs", paymentMethodOrder: ["apple_pay", "google_pay", "card", "bacs_debit"] }} />
      </div>
      <Button type="submit" disabled={!stripe || !elements || processing} className="w-full bg-emerald-700 hover:bg-emerald-800 text-white py-3 text-base">
        <CreditCard className="w-4 h-4 mr-2" />
        {processing ? "Processing..." : `Pay £${amount.toFixed(2)} securely`}
      </Button>
      <button type="button" onClick={onBack} className="w-full text-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
        ← Change payment details
      </button>
      <p className="text-center text-xs text-muted-foreground">Powered by Stripe · Encrypted & Secure</p>
    </form>
  );
}

// ─── Stripe Tab ──────────────────────────────────────────────────────────────
function StripeTab({ prefillName, prefillEmail, prefillCampaign, prefillAmount }: {
  prefillName: string; prefillEmail: string; prefillCampaign: string; prefillAmount: string;
}) {
  const [donorName, setDonorName] = useState(prefillName);
  const [donorEmail, setDonorEmail] = useState(prefillEmail);
  const [donorPhone, setDonorPhone] = useState("");
  const [amount, setAmount] = useState(prefillAmount);
  const [giftAid, setGiftAid] = useState(false);
  const [giftAidAddress, setGiftAidAddress] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [referenceCode, setReferenceCode] = useState("");

  const createIntent = trpc.fintech.createPaymentIntent.useMutation({
    onSuccess: (data) => { setClientSecret(data.clientSecret); setReferenceCode(data.referenceCode); },
    onError: (e) => toast.error("Error: " + e.message),
  });

  function handleProceed() {
    if (!donorName.trim() || !amount || parseFloat(amount) < 0.5) {
      toast.error("Please enter your name and amount (min £0.50)");
      return;
    }
    createIntent.mutate({
      donorName: donorName.trim(),
      donorEmail: donorEmail.trim() || undefined,
      donorPhone: donorPhone.trim() || undefined,
      campaignName: prefillCampaign || undefined,
      amount: parseFloat(amount),
      giftAidDeclared: giftAid,
      giftAidAddress: giftAid ? giftAidAddress : undefined,
    });
  }

  if (clientSecret) {
    return (
      <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#047857", borderRadius: "8px" } } }}>
        <StripeCheckoutForm referenceCode={referenceCode} amount={parseFloat(amount)} onBack={() => setClientSecret(null)} />
      </Elements>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 mb-2">
        {[
          { icon: CreditCard, label: "Debit / Credit Card" },
          { icon: Smartphone, label: "Apple Pay / Google Pay" },
          { icon: Landmark, label: "BACS Direct Debit" },
          { icon: Globe, label: "International Cards" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <Icon className="w-4 h-4 text-emerald-700" />
            <span className="text-xs font-medium">{label}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div><Label>Your Name *</Label><Input value={donorName} onChange={(e) => setDonorName(e.target.value)} className="mt-1" placeholder="Full name" /></div>
          <div><Label>Email</Label><Input type="email" value={donorEmail} onChange={(e) => setDonorEmail(e.target.value)} className="mt-1" placeholder="your@email.com" /></div>
          <div><Label>Phone</Label><Input value={donorPhone} onChange={(e) => setDonorPhone(e.target.value)} className="mt-1" placeholder="+44 7700 000000" /></div>
        </div>
        <div className="space-y-3">
          {prefillCampaign && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">Campaign</p>
              <p className="font-semibold text-emerald-900">{prefillCampaign}</p>
            </div>
          )}
          <div><Label>Amount (£) *</Label><Input type="number" min="0.50" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" placeholder="0.00" /></div>
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Switch checked={giftAid} onCheckedChange={setGiftAid} id="pay-gift-aid" />
            <div>
              <Label htmlFor="pay-gift-aid" className="cursor-pointer font-semibold text-amber-900">Gift Aid Declaration</Label>
              <p className="text-xs text-amber-700">Adds 25p for every £1 at no cost to you</p>
            </div>
          </div>
          {giftAid && <Textarea placeholder="Home address for Gift Aid" value={giftAidAddress} onChange={(e) => setGiftAidAddress(e.target.value)} rows={2} />}
        </div>
      </div>
      <Button onClick={handleProceed} disabled={createIntent.isPending} className="w-full bg-emerald-700 hover:bg-emerald-800 text-white py-3 text-base">
        <CreditCard className="w-4 h-4 mr-2" />
        {createIntent.isPending ? "Preparing payment..." : `Continue to Payment${amount ? ` — £${parseFloat(amount || "0").toFixed(2)}` : ""}`}
      </Button>
    </div>
  );
}

// ─── PayPal Tab ──────────────────────────────────────────────────────────────
function PayPalTab({ prefillName, prefillEmail, prefillCampaign, prefillAmount }: {
  prefillName: string; prefillEmail: string; prefillCampaign: string; prefillAmount: string;
}) {
  const [donorName, setDonorName] = useState(prefillName);
  const [donorEmail, setDonorEmail] = useState(prefillEmail);
  const [amount, setAmount] = useState(prefillAmount);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [referenceCode, setReferenceCode] = useState("");
  const [step, setStep] = useState<"form" | "paypal">("form");

  const createOrder = trpc.fintech.createPayPalOrder.useMutation({
    onSuccess: (data) => { setSessionId(data.sessionId); setReferenceCode(data.referenceCode); setStep("paypal"); },
    onError: (e) => toast.error("PayPal error: " + e.message),
  });
  const captureOrder = trpc.fintech.capturePayPalOrder.useMutation({
    onSuccess: (data) => { if (data.status === "COMPLETED") toast.success("Payment completed! JazakAllah Khayran."); },
  });

  const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID as string;

  if (step === "paypal" && paypalClientId) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-center justify-between">
          <div><p className="text-xs text-blue-700 font-semibold uppercase tracking-wide">Reference</p><p className="font-mono font-bold text-blue-900">{referenceCode}</p></div>
          <div className="text-right"><p className="text-xs text-blue-700 font-semibold uppercase tracking-wide">Amount</p><p className="font-bold text-blue-900 text-lg">£{parseFloat(amount).toFixed(2)}</p></div>
        </div>
        <PayPalScriptProvider options={{ clientId: paypalClientId, currency: "GBP" }}>
          <PayPalButtons
            style={{ layout: "vertical", color: "blue", shape: "rect", label: "donate" }}
            createOrder={async () => {
              const res = await createOrder.mutateAsync({ donorName: donorName.trim(), donorEmail: donorEmail.trim() || undefined, campaignName: prefillCampaign || undefined, amount: parseFloat(amount), giftAidDeclared: false, origin: window.location.origin });
              return res.orderId;
            }}
            onApprove={async (data) => { if (sessionId) await captureOrder.mutateAsync({ orderId: data.orderID, sessionId }); }}
          />
        </PayPalScriptProvider>
        <button type="button" onClick={() => setStep("form")} className="w-full text-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">← Change details</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!paypalClientId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          PayPal is not yet configured for this site. Please use another payment method.
        </div>
      )}
      <div><Label>Your Name *</Label><Input value={donorName} onChange={(e) => setDonorName(e.target.value)} className="mt-1" placeholder="Full name" /></div>
      <div><Label>Email</Label><Input type="email" value={donorEmail} onChange={(e) => setDonorEmail(e.target.value)} className="mt-1" placeholder="your@email.com" /></div>
      <div><Label>Amount (£) *</Label><Input type="number" min="0.50" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" placeholder="0.00" /></div>
      <Button
        onClick={() => {
          if (!donorName.trim() || !amount || parseFloat(amount) < 0.5) { toast.error("Please enter your name and amount (min £0.50)"); return; }
          createOrder.mutate({ donorName: donorName.trim(), donorEmail: donorEmail.trim() || undefined, campaignName: prefillCampaign || undefined, amount: parseFloat(amount), giftAidDeclared: false, origin: window.location.origin });
        }}
        disabled={createOrder.isPending || !paypalClientId}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
      >
        <Globe className="w-4 h-4 mr-2" />
        {createOrder.isPending ? "Preparing PayPal..." : `Continue to PayPal${amount ? ` — £${parseFloat(amount || "0").toFixed(2)}` : ""}`}
      </Button>
    </div>
  );
}

// ─── Bank Transfer Tab ───────────────────────────────────────────────────────
function BankTab({ prefillRef }: { prefillRef: string }) {
  function copy(text: string, label: string) { navigator.clipboard.writeText(text); toast.success(`${label} copied!`); }
  const ref = prefillRef || `AQS-${String(Date.now()).slice(-6)}`;
  const fields = [
    { label: "Account Name", value: AQS_BANK.accountName },
    { label: "Sort Code", value: AQS_BANK.sortCode },
    { label: "Account Number", value: AQS_BANK.accountNumber },
    { label: "IBAN", value: AQS_BANK.iban },
    { label: "SWIFT / BIC", value: AQS_BANK.swift },
    { label: "Bank", value: AQS_BANK.bankName },
    { label: "Payment Reference", value: ref },
  ];
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide mb-1">Your Reference Code</p>
        <div className="flex items-center gap-2">
          <code className="text-xl font-bold text-emerald-900">{ref}</code>
          <Button size="sm" variant="ghost" onClick={() => copy(ref, "Reference code")}><Copy className="w-3 h-3" /></Button>
        </div>
        <p className="text-xs text-emerald-700 mt-1">Please use this as your payment reference</p>
      </div>
      <div className="space-y-2">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`font-mono text-sm font-semibold ${label === "Payment Reference" ? "text-emerald-700" : ""}`}>{value}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => copy(value, label)}><Copy className="w-3 h-3" /></Button>
          </div>
        ))}
      </div>
      <Button className="w-full bg-emerald-700 hover:bg-emerald-800 text-white" onClick={() => { const all = fields.map((f) => `${f.label}: ${f.value}`).join("\n"); copy(all, "All bank details"); }}>
        <Copy className="w-4 h-4 mr-2" /> Copy All Details
      </Button>
    </div>
  );
}

// ─── Main Pay Page ────────────────────────────────────────────────────────────
export default function PayPage() {
  const params = useUrlParams();

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-700" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Abdullah Quilliam Society</h1>
          <p className="text-muted-foreground text-sm">Secure Donation Portal</p>
          {params.campaign && (
            <Badge className="bg-emerald-100 text-emerald-800 text-sm px-3 py-1">{params.campaign}</Badge>
          )}
          {params.name && (
            <p className="text-sm text-muted-foreground">
              Welcome, <strong>{params.name}</strong>
            </p>
          )}
          {params.ref && (
            <p className="text-xs font-mono text-emerald-700 font-semibold">Ref: {params.ref}</p>
          )}
        </div>

        {/* Payment tabs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Choose Payment Method</CardTitle>
            <CardDescription>All payments are secure and encrypted.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={params.method} className="space-y-4">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="stripe" className="text-xs">
                  <CreditCard className="w-3.5 h-3.5 mr-1" /> Card / Apple / Google
                </TabsTrigger>
                <TabsTrigger value="paypal" className="text-xs">
                  <Globe className="w-3.5 h-3.5 mr-1" /> PayPal
                </TabsTrigger>
                <TabsTrigger value="bank" className="text-xs">
                  <Building2 className="w-3.5 h-3.5 mr-1" /> Bank Transfer
                </TabsTrigger>
              </TabsList>
              <TabsContent value="stripe">
                <StripeTab
                  prefillName={params.name}
                  prefillEmail=""
                  prefillCampaign={params.campaign}
                  prefillAmount={params.amount}
                />
              </TabsContent>
              <TabsContent value="paypal">
                <PayPalTab
                  prefillName={params.name}
                  prefillEmail=""
                  prefillCampaign={params.campaign}
                  prefillAmount={params.amount}
                />
              </TabsContent>
              <TabsContent value="bank">
                <BankTab prefillRef={params.ref} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          AQ Society · Registered Charity · All donations are processed securely
        </p>
      </div>
    </div>
  );
}
