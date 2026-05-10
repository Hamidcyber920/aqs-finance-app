import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CreditCard, Zap, Building2, FileText, CheckCircle2, Clock, XCircle,
  Copy, MessageCircle, ExternalLink, Download, RefreshCw, Plus, Send,
  Smartphone, Globe, Landmark, QrCode
} from "lucide-react";

// AQS Bank Details for bank transfer
const AQS_BANK = {
  accountName: "Abdullah Quilliam Society",
  sortCode: "30-96-26",
  accountNumber: "XXXXXXXX",
  iban: "GB00 LOYD 3096 26XX XXXX XX",
  swift: "LOYDGB21",
  bankName: "Lloyds Bank",
  note: "Please use your reference code as the payment reference",
};

function fmtGBP(amount: string | number | null | undefined) {
  if (!amount) return "£0.00";
  return `£${Number(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDateTime(ts: Date | string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-amber-100 text-amber-800" },
    completed: { label: "Completed", className: "bg-green-100 text-green-800" },
    failed: { label: "Failed", className: "bg-red-100 text-red-800" },
    cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-600" },
  };
  const s = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return <Badge className={`text-xs font-medium ${s.className}`}>{s.label}</Badge>;
}

// ─── QUICK CAPTURE PANEL ──────────────────────────────────────────────────────
function QuickCapturePanel() {

  const [donorName, setDonorName] = useState("");
  const [donorPhone, setDonorPhone] = useState("");
  const [campaignId, setCampaignId] = useState<number | undefined>();
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<{
    referenceCode: string;
    paymentUrl: string;
    whatsAppUrl: string;
    whatsAppMessage: string;
  } | null>(null);

  const { data: campaigns } = trpc.fintech.listCampaigns.useQuery();
  const quickCapture = trpc.fintech.quickCaptureLink.useMutation({
    onSuccess: (data) => {
      setResult(data);
      toast.success(`Payment link generated! Reference: ${data.referenceCode}`);
    },
    onError: (e) => toast.error("Error: " + e.message),
  });

  const selectedCampaign = campaigns?.find((c) => c.id === campaignId);

  function handleGenerate() {
    if (!donorName.trim() || !amount) {
      toast.error("Required fields missing: Please enter donor name and amount");
      return;
    }
    quickCapture.mutate({
      donorName: donorName.trim(),
      donorPhone: donorPhone.trim() || undefined,
      campaignId,
      campaignName: selectedCampaign?.name,
      amount: parseFloat(amount),
      origin: window.location.origin,
    });
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div>
            <Label>Donor Name *</Label>
            <Input
              placeholder="e.g. Brother Ahmed"
              value={donorName}
              onChange={(e) => setDonorName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>WhatsApp / Phone Number</Label>
            <Input
              placeholder="+44 7700 000000"
              value={donorPhone}
              onChange={(e) => setDonorPhone(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Campaign</Label>
            <Select
              value={campaignId ? String(campaignId) : ""}
              onValueChange={(v) => setCampaignId(v ? parseInt(v) : undefined)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select campaign (optional)" />
              </SelectTrigger>
              <SelectContent>
                {campaigns?.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Pledge Amount (£) *</Label>
            <Input
              type="number"
              min="0.50"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button
            onClick={handleGenerate}
            disabled={quickCapture.isPending}
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            <Zap className="w-4 h-4 mr-2" />
            {quickCapture.isPending ? "Generating..." : "Generate Payment Link"}
          </Button>
        </div>

        {result && (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-800 mb-1">Reference Code</p>
              <div className="flex items-center gap-2">
                <code className="text-lg font-bold text-emerald-900">{result.referenceCode}</code>
                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(result.referenceCode, "Reference code")}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment Link</p>
              <p className="text-xs text-muted-foreground break-all">{result.paymentUrl}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => copyToClipboard(result.paymentUrl, "Payment link")}>
                  <Copy className="w-3 h-3 mr-1" /> Copy Link
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={result.paymentUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3 mr-1" /> Open
                  </a>
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-green-800 uppercase tracking-wide">WhatsApp Message</p>
              <p className="text-xs text-green-700 whitespace-pre-wrap line-clamp-4">{result.whatsAppMessage}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  asChild
                >
                  <a href={result.whatsAppUrl} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="w-3 h-3 mr-1" /> Send via WhatsApp
                  </a>
                </Button>
                <Button size="sm" variant="outline" onClick={() => copyToClipboard(result.whatsAppMessage, "WhatsApp message")}>
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STRIPE PAYMENT FORM ──────────────────────────────────────────────────────
function StripePaymentPanel() {

  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [donorPhone, setDonorPhone] = useState("");
  const [campaignId, setCampaignId] = useState<number | undefined>();
  const [amount, setAmount] = useState("");
  const [giftAid, setGiftAid] = useState(false);
  const [giftAidAddress, setGiftAidAddress] = useState("");

  const { data: campaigns } = trpc.fintech.listCampaigns.useQuery();
  const createSession = trpc.fintech.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        toast.success(`Redirecting to secure payment... Reference: ${data.referenceCode}`);
      }
    },
    onError: (e) => toast.error("Error: " + e.message),
  });

  const selectedCampaign = campaigns?.find((c) => c.id === campaignId);

  function handlePay() {
    if (!donorName.trim() || !amount || parseFloat(amount) < 0.5) {
      toast.error("Required fields missing: Please enter donor name and amount (min £0.50)");
      return;
    }
    createSession.mutate({
      donorName: donorName.trim(),
      donorEmail: donorEmail.trim() || undefined,
      donorPhone: donorPhone.trim() || undefined,
      campaignId,
      campaignName: selectedCampaign?.name,
      amount: parseFloat(amount),
      giftAidDeclared: giftAid,
      giftAidAddress: giftAid ? giftAidAddress : undefined,
      origin: window.location.origin,
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 mb-4">
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
        <div className="space-y-4">
          <div>
            <Label>Donor Name *</Label>
            <Input placeholder="Full name" value={donorName} onChange={(e) => setDonorName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Email Address</Label>
            <Input type="email" placeholder="donor@example.com" value={donorEmail} onChange={(e) => setDonorEmail(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Phone / WhatsApp</Label>
            <Input placeholder="+44 7700 000000" value={donorPhone} onChange={(e) => setDonorPhone(e.target.value)} className="mt-1" />
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <Label>Campaign</Label>
            <Select value={campaignId ? String(campaignId) : ""} onValueChange={(v) => setCampaignId(v ? parseInt(v) : undefined)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select campaign (optional)" />
              </SelectTrigger>
              <SelectContent>
                {campaigns?.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount (£) *</Label>
            <Input type="number" min="0.50" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Switch checked={giftAid} onCheckedChange={setGiftAid} id="gift-aid" />
            <div>
              <Label htmlFor="gift-aid" className="cursor-pointer font-semibold text-amber-900">Gift Aid Declaration</Label>
              <p className="text-xs text-amber-700">Adds 25p for every £1 donated at no cost to the donor</p>
            </div>
          </div>
          {giftAid && (
            <div>
              <Label>Home Address (required for Gift Aid)</Label>
              <Textarea
                placeholder="House number, street, postcode"
                value={giftAidAddress}
                onChange={(e) => setGiftAidAddress(e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
          )}
        </div>
      </div>

      <Button
        onClick={handlePay}
        disabled={createSession.isPending}
        className="w-full bg-emerald-700 hover:bg-emerald-800 text-white py-3 text-base"
      >
        <CreditCard className="w-4 h-4 mr-2" />
        {createSession.isPending ? "Creating secure checkout..." : `Proceed to Secure Payment${amount ? ` — £${parseFloat(amount || "0").toFixed(2)}` : ""}`}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Powered by Stripe · Encrypted & Secure · Test card: 4242 4242 4242 4242
      </p>
    </div>
  );
}

// ─── BANK TRANSFER PANEL ──────────────────────────────────────────────────────
function BankTransferPanel() {

  const [customRef, setCustomRef] = useState("");
  const [campaignId, setCampaignId] = useState<number | undefined>();
  const { data: campaigns } = trpc.fintech.listCampaigns.useQuery();
  const selectedCampaign = campaigns?.find((c) => c.id === campaignId);

  const generatedRef = useMemo(() => {
    if (customRef.trim()) return customRef.trim().toUpperCase();
    if (selectedCampaign) {
      const prefix = selectedCampaign.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
      return `${prefix}-${String(Date.now()).slice(-4)}`;
    }
    return `AQS-${String(Date.now()).slice(-6)}`;
  }, [customRef, selectedCampaign]);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  }

  const bankFields = [
    { label: "Account Name", value: AQS_BANK.accountName },
    { label: "Sort Code", value: AQS_BANK.sortCode },
    { label: "Account Number", value: AQS_BANK.accountNumber },
    { label: "IBAN", value: AQS_BANK.iban },
    { label: "SWIFT / BIC", value: AQS_BANK.swift },
    { label: "Bank", value: AQS_BANK.bankName },
    { label: "Payment Reference", value: generatedRef },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div>
            <Label>Campaign (optional)</Label>
            <Select value={campaignId ? String(campaignId) : ""} onValueChange={(v) => setCampaignId(v ? parseInt(v) : undefined)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaigns?.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Custom Reference (optional)</Label>
            <Input
              placeholder="e.g. RIMMERS-001 or leave blank to auto-generate"
              value={customRef}
              onChange={(e) => setCustomRef(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold text-emerald-800 mb-1">Generated Reference Code</p>
            <div className="flex items-center gap-2">
              <code className="text-xl font-bold text-emerald-900">{generatedRef}</code>
              <Button size="sm" variant="ghost" onClick={() => copy(generatedRef, "Reference code")}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <p className="text-xs text-emerald-700 mt-1">Ask the donor to use this as their payment reference</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground mb-3">AQ Society Bank Details</p>
          {bankFields.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`font-mono text-sm font-semibold ${label === "Payment Reference" ? "text-emerald-700" : ""}`}>{value}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => copy(value, label)}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          ))}
          <Button
            className="w-full mt-2 bg-emerald-700 hover:bg-emerald-800 text-white"
            onClick={() => {
              const allDetails = bankFields.map((f) => `${f.label}: ${f.value}`).join("\n");
              copy(allDetails, "All bank details");
            }}
          >
            <Copy className="w-4 h-4 mr-2" /> Copy All Details
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENT HISTORY ──────────────────────────────────────────────────────────
function PaymentHistoryPanel() {
  const [statusFilter, setStatusFilter] = useState<"pending" | "completed" | "failed" | "cancelled" | undefined>();
  const { data: sessions, refetch, isLoading } = trpc.fintech.listPaymentSessions.useQuery({
    status: statusFilter,
    limit: 100,
  });

  const markSent = trpc.fintech.markThankYouSent.useMutation({
    onSuccess: () => { refetch(); toast.success("Marked as sent"); },
  });

  const stats = useMemo(() => {
    if (!sessions) return { total: 0, completed: 0, pending: 0, totalAmount: 0 };
    return {
      total: sessions.length,
      completed: sessions.filter((s) => s.status === "completed").length,
      pending: sessions.filter((s) => s.status === "pending").length,
      totalAmount: sessions.filter((s) => s.status === "completed").reduce((sum, s) => sum + Number(s.amount ?? 0), 0),
    };
  }, [sessions]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Sessions", value: stats.total, color: "text-foreground" },
          { label: "Completed", value: stats.completed, color: "text-green-700" },
          { label: "Pending", value: stats.pending, color: "text-amber-700" },
          { label: "Amount Raised", value: fmtGBP(stats.totalAmount), color: "text-emerald-700" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["all", "completed", "pending", "failed"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === (s === "all" ? undefined : s) ? "default" : "outline"}
            onClick={() => setStatusFilter(s === "all" ? undefined : s)}
            className={statusFilter === (s === "all" ? undefined : s) ? "bg-emerald-700 text-white" : ""}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => refetch()}>
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading payment sessions...</div>
      ) : !sessions?.length ? (
        <div className="text-center py-8 text-muted-foreground">No payment sessions found</div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{s.donorName}</p>
                    <StatusBadge status={s.status} />
                    {s.giftAidDeclared && (
                      <Badge className="bg-amber-100 text-amber-800 text-xs">Gift Aid</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    {s.referenceCode && <span className="font-mono font-semibold text-emerald-700">{s.referenceCode}</span>}
                    {s.campaignName && <span>{s.campaignName}</span>}
                    {s.donorEmail && <span>{s.donorEmail}</span>}
                    <span>{fmtDateTime(s.createdAt)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-base">{fmtGBP(s.amount)}</p>
                  {s.status === "completed" && !s.thankYouWhatsAppSentAt && s.donorPhone && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-green-700 mt-1"
                      onClick={() => {
                        const firstName = s.donorName.split(" ")[0];
                        const msg = `Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${firstName}!\n\nJazakAllah Khayran for your generous donation of £${Number(s.amount).toFixed(2)}${s.campaignName ? ` towards the ${s.campaignName}` : ""}.\n\nMay Allah accept your contribution and reward you abundantly. Ameen.\n\nAQ Society`;
                        window.location.href = `https://wa.me/${s.donorPhone?.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
                        markSent.mutate({ sessionId: s.id });
                      }}
                    >
                      <MessageCircle className="w-3 h-3 mr-1" /> JazakAllah
                    </Button>
                  )}
                  {s.thankYouWhatsAppSentAt && (
                    <p className="text-xs text-green-600 mt-1">
                      <CheckCircle2 className="w-3 h-3 inline mr-1" />
                      Thank-you sent
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── GIFT AID R68 EXPORT ──────────────────────────────────────────────────────
function GiftAidPanel() {

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [manualForm, setManualForm] = useState({
    donorName: "", donorEmail: "", donorAddress: "", amount: "", donationDate: "", campaignName: "",
  });

  const { data: r68Data, refetch, isLoading } = trpc.fintech.exportGiftAidR68.useQuery({ month, year });
  const addDeclaration = trpc.fintech.addGiftAidDeclaration.useMutation({
    onSuccess: () => {
      refetch();
      setShowAddDialog(false);
      setManualForm({ donorName: "", donorEmail: "", donorAddress: "", amount: "", donationDate: "", campaignName: "" });
      toast.success("Gift Aid declaration added");
    },
    onError: (e) => toast.error("Error: " + e.message),
  });

  function downloadCSV() {
    if (!r68Data?.csvContent) return;
    const blob = new Blob([r68Data.csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AQS-GiftAid-R68-${r68Data.batch}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`R68 CSV downloaded — ${r68Data.count} declarations for ${r68Data.batch}`);
  }

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026, 2027].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="w-3 h-3 mr-1" /> Load
        </Button>
        <Button
          onClick={downloadCSV}
          disabled={!r68Data?.count}
          className="bg-emerald-700 hover:bg-emerald-800 text-white"
          size="sm"
        >
          <Download className="w-3 h-3 mr-1" /> Download R68 CSV
        </Button>
        <Button onClick={() => setShowAddDialog(true)} variant="outline" size="sm">
          <Plus className="w-3 h-3 mr-1" /> Add Manual Declaration
        </Button>
      </div>

      {r68Data && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Declarations</p>
            <p className="text-2xl font-bold text-emerald-700">{r68Data.count}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Donations</p>
            <p className="text-2xl font-bold text-emerald-700">{fmtGBP(r68Data.totalAmount)}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Gift Aid Reclaim (25%)</p>
            <p className="text-2xl font-bold text-amber-600">{fmtGBP((r68Data.totalAmount ?? 0) * 0.25)}</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-6 text-muted-foreground">Loading declarations...</div>
      ) : !r68Data?.declarations?.length ? (
        <div className="text-center py-6 text-muted-foreground">
          No Gift Aid declarations found for {months[month - 1]} {year}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 pr-4 font-semibold text-muted-foreground">Donor</th>
                <th className="pb-2 pr-4 font-semibold text-muted-foreground">Amount</th>
                <th className="pb-2 pr-4 font-semibold text-muted-foreground">Date</th>
                <th className="pb-2 pr-4 font-semibold text-muted-foreground">Campaign</th>
                <th className="pb-2 font-semibold text-muted-foreground">Reference</th>
              </tr>
            </thead>
            <tbody>
              {r68Data.declarations.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <p className="font-medium">{d.donorName}</p>
                    {d.donorEmail && <p className="text-xs text-muted-foreground">{d.donorEmail}</p>}
                  </td>
                  <td className="py-2 pr-4 font-semibold text-emerald-700">{fmtGBP(d.amount)}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{String(d.donationDate)}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{d.campaignName ?? "—"}</td>
                  <td className="py-2 font-mono text-xs">{d.stripeTransactionRef ?? d.stripePaymentIntentId ?? `#${d.id}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Gift Aid Declaration</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Donor Name *</Label>
              <Input value={manualForm.donorName} onChange={(e) => setManualForm((f) => ({ ...f, donorName: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={manualForm.donorEmail} onChange={(e) => setManualForm((f) => ({ ...f, donorEmail: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Home Address</Label>
              <Textarea value={manualForm.donorAddress} onChange={(e) => setManualForm((f) => ({ ...f, donorAddress: e.target.value }))} className="mt-1" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (£) *</Label>
                <Input type="number" value={manualForm.amount} onChange={(e) => setManualForm((f) => ({ ...f, amount: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Donation Date *</Label>
                <Input type="date" value={manualForm.donationDate} onChange={(e) => setManualForm((f) => ({ ...f, donationDate: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Campaign</Label>
              <Input value={manualForm.campaignName} onChange={(e) => setManualForm((f) => ({ ...f, campaignName: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={() => {
                if (!manualForm.donorName || !manualForm.amount || !manualForm.donationDate) {
                  toast.error("Required fields missing");
                  return;
                }
                addDeclaration.mutate({
                  donorName: manualForm.donorName,
                  donorEmail: manualForm.donorEmail || undefined,
                  donorAddress: manualForm.donorAddress || undefined,
                  amount: parseFloat(manualForm.amount),
                  donationDate: manualForm.donationDate,
                  campaignName: manualForm.campaignName || undefined,
                  declarationMethod: "manual",
                });
              }}
              disabled={addDeclaration.isPending}
            >
              Save Declaration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Fintech() {
  const { user } = useAuth();

  return (
    <div className="container py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">AQS Fintech — Payment Hub</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Stripe Payment Element · QuickCapture Links · Bank Transfer Codes · Gift Aid R68 Export
        </p>
      </div>

      <Tabs defaultValue="stripe" className="space-y-4">
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList className="inline-flex w-max min-w-full h-auto gap-1 p-1">
            <TabsTrigger value="stripe" className="flex items-center gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <CreditCard className="w-3.5 h-3.5 shrink-0" /> <span>Online Payment</span>
            </TabsTrigger>
            <TabsTrigger value="quickcapture" className="flex items-center gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <Zap className="w-3.5 h-3.5 shrink-0" /> <span>QuickCapture</span>
            </TabsTrigger>
            <TabsTrigger value="bank" className="flex items-center gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <Building2 className="w-3.5 h-3.5 shrink-0" /> <span>Bank Transfer</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <Clock className="w-3.5 h-3.5 shrink-0" /> <span>History</span>
            </TabsTrigger>
            <TabsTrigger value="giftaid" className="flex items-center gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <FileText className="w-3.5 h-3.5 shrink-0" /> <span>Gift Aid R68</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="stripe">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-700" />
                Secure Online Payment
              </CardTitle>
              <CardDescription>
                Accept card, Apple Pay, Google Pay, and BACS Direct Debit via Stripe Payment Element.
                A secure checkout link will open in a new tab.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StripePaymentPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quickcapture">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-emerald-700" />
                QuickCapture — Trackable Payment Link
              </CardTitle>
              <CardDescription>
                Enter a donor's name and pledge amount to instantly generate a personalised, trackable
                payment URL and a pre-written WhatsApp message ready to send.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <QuickCapturePanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bank">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-700" />
                Bank Transfer Instructions
              </CardTitle>
              <CardDescription>
                Generate a unique reference code and display AQ Society bank details for one-tap copy.
                Ask the donor to use the reference code when making their transfer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BankTransferPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-700" />
                Payment History
              </CardTitle>
              <CardDescription>
                All Stripe payment sessions — pending, completed, and failed.
                Send JazakAllah WhatsApp messages directly from completed payments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentHistoryPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="giftaid">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-700" />
                Gift Aid R68 Export
              </CardTitle>
              <CardDescription>
                Download HMRC-compatible R68 CSV for monthly Gift Aid reclaim submissions.
                Stripe Transaction IDs are included as unique references for audit compliance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GiftAidPanel />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
