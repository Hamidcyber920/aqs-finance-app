import { useState } from "react";
import { Copy, Check, ExternalLink, Phone, Building2, Heart, CreditCard, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="p-1 rounded hover:bg-zinc-700/50 transition-colors" title={`Copy ${label}`}>
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
    </button>
  );
}

export default function DonatePage() {
  return (
    <div className="container max-w-5xl py-8 space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium">
          <Heart className="w-4 h-4" />
          Support Our Mission
        </div>
        <h1 className="text-3xl font-bold text-zinc-100">Donate to Abdullah Quilliam Mosque</h1>
        <p className="text-zinc-400 max-w-2xl mx-auto">
          Abdullah Quilliam Mosque & National Heritage Centre — England's first mosque, established 1889.
          <br />
          <span className="text-zinc-500">Charity No: 1194942</span>
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Donorbox Widget - Online Donation */}
        <Card className="border-zinc-700 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-100">
              <CreditCard className="w-5 h-5 text-emerald-400" />
              Donate Online
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Set up a one-off or recurring donation via Donorbox. Card, Apple Pay, Google Pay accepted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg overflow-hidden border border-zinc-700 bg-white">
              <iframe
                src="https://donorbox.org/embed/build-a-new-mosque?default_interval=m&hide_donation_meter=true"
                name="donorbox"
                allowPaymentRequest
                seamless
                frameBorder="0"
                scrolling="no"
                height="900px"
                width="100%"
                style={{ maxWidth: "500px", minWidth: "250px", maxHeight: "none !important" as any }}
                allow="payment"
              />
            </div>
            <div className="text-center">
              <a
                href="https://donorbox.org/build-a-new-mosque"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Open in new tab <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Bank Transfer Details */}
        <div className="space-y-6">
          <Card className="border-zinc-700 bg-zinc-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-zinc-100">
                <Banknote className="w-5 h-5 text-emerald-400" />
                Bank Transfer (Reduce Fees)
              </CardTitle>
              <CardDescription className="text-zinc-400">
                Transfer directly to us and call to confirm your donation. No processing fees.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider">Account Name</p>
                    <p className="text-sm font-medium text-zinc-200">Abdullah Quilliam Society</p>
                  </div>
                  <CopyButton text="Abdullah Quilliam Society" label="Account Name" />
                </div>
                <div className="border-t border-zinc-700/50" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider">Account Number</p>
                    <p className="text-sm font-mono font-medium text-zinc-200">01158945</p>
                  </div>
                  <CopyButton text="01158945" label="Account Number" />
                </div>
                <div className="border-t border-zinc-700/50" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider">Sort Code</p>
                    <p className="text-sm font-mono font-medium text-zinc-200">40-29-28</p>
                  </div>
                  <CopyButton text="40-29-28" label="Sort Code" />
                </div>
                <div className="border-t border-zinc-700/50" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider">IBAN</p>
                    <p className="text-sm font-mono font-medium text-zinc-200">GB96HBUK40292801158945</p>
                  </div>
                  <CopyButton text="GB96HBUK40292801158945" label="IBAN" />
                </div>
                <div className="border-t border-zinc-700/50" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider">Swift Code</p>
                    <p className="text-sm font-mono font-medium text-zinc-200">HBUKGB4B</p>
                  </div>
                  <CopyButton text="HBUKGB4B" label="Swift Code" />
                </div>
                <div className="border-t border-zinc-700/50" />
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Bank</p>
                  <p className="text-sm text-zinc-300">HSBC Bank Plc, 99-101 Lord Street, Liverpool L2 6PG</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Confirm by Phone */}
          <Card className="border-zinc-700 bg-zinc-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-zinc-100">
                <Phone className="w-5 h-5 text-emerald-400" />
                Confirm Your Donation
              </CardTitle>
              <CardDescription className="text-zinc-400">
                After transferring, please call us to confirm your donation and provide a reference.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a
                href="tel:+441512603986"
                className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
              >
                <Phone className="w-6 h-6 text-emerald-400" />
                <div>
                  <p className="text-lg font-semibold text-emerald-300">0151 260 3986</p>
                  <p className="text-xs text-zinc-400">Tap to call</p>
                </div>
              </a>
            </CardContent>
          </Card>

          {/* Mosque Info */}
          <Card className="border-zinc-700 bg-zinc-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-zinc-100">
                <Building2 className="w-5 h-5 text-emerald-400" />
                Visit Us
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-300">
              <p className="font-medium">Abdullah Quilliam Mosque & National Heritage Centre</p>
              <p>8-10 Brougham Terrace, Liverpool, L6 1AE</p>
              <p className="text-zinc-500">Charity No: 1194942</p>
              <div className="flex gap-3 pt-2">
                <a href="https://www.abdullahquilliam.org" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-1">
                  abdullahquilliam.org <ExternalLink className="w-3 h-3" />
                </a>
                <a href="https://theaqs.org" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-1">
                  theaqs.org <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
