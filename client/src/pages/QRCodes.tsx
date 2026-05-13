import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { QrCode, Plus, Download, ExternalLink, Copy, Printer } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useVoiceContext } from "@/contexts/VoiceContext";

/** Build the full URL with UTM params appended */
function buildQrUrl(qr: { targetUrl: string; utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null }) {
  try {
    const url = new URL(qr.targetUrl);
    if (qr.utmSource) url.searchParams.set("utm_source", qr.utmSource);
    if (qr.utmMedium) url.searchParams.set("utm_medium", qr.utmMedium);
    if (qr.utmCampaign) url.searchParams.set("utm_campaign", qr.utmCampaign);
    return url.toString();
  } catch {
    return qr.targetUrl;
  }
}

/** Download the QR canvas as a PNG file */
function downloadQrPng(canvasId: string, label: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) { toast.error("QR canvas not found"); return; }
  const link = document.createElement("a");
  link.download = `${label.replace(/\s+/g, "-").toLowerCase()}-qr.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
  toast.success("QR code downloaded");
}

/** Open a print window with the QR code and label */
function printQr(canvasId: string, label: string, targetUrl: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) { toast.error("QR canvas not found"); return; }
  const dataUrl = canvas.toDataURL("image/png");
  const win = window.open("", "_blank");
  if (!win) { toast.error("Pop-up blocked — please allow pop-ups for this site"); return; }
  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>QR Code — ${label}</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 40px; }
          img { width: 300px; height: 300px; display: block; margin: 0 auto 16px; }
          h2 { margin: 0 0 8px; font-size: 22px; }
          p { color: #555; font-size: 13px; word-break: break-all; max-width: 320px; margin: 0 auto; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" alt="QR Code" />
        <h2>${label}</h2>
        <p>${targetUrl}</p>
        <br/>
        <button onclick="window.print()">Print</button>
        <script>window.onload = () => window.print();<\/script>
      </body>
    </html>
  `);
  win.document.close();
}

export default function QRCodes() {
  const [showGenerate, setShowGenerate] = useState(false);
  const [form, setForm] = useState({ label: "", targetUrl: "", campaignId: "", utmSource: "qr", utmMedium: "print", utmCampaign: "" });

  const { setEntityContext } = useVoiceContext();
  useEffect(() => {
    setEntityContext("Viewing QR Codes — donation QR codes for campaigns and events");
    return () => setEntityContext(null);
  }, [setEntityContext]);

  const { data: qrCodes, refetch } = (trpc as any).qrCodes.list.useQuery();
  const { data: campaigns } = (trpc as any).fundraising.listCampaigns.useQuery();

  const createMut = (trpc as any).qrCodes.create.useMutation({
    onSuccess: () => { toast.success("QR code generated"); refetch(); setShowGenerate(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = (trpc as any).qrCodes.delete.useMutation({
    onSuccess: () => { toast.success("QR code deleted"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard");
  };

  return (
      <>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">QR Code Generator</h1>
            <p className="text-muted-foreground text-sm mt-1">Generate trackable QR codes for campaigns with UTM attribution</p>
          </div>
          <Button onClick={() => setShowGenerate(true)}>
            <Plus className="w-4 h-4 mr-2" /> Generate QR Code
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {qrCodes?.map((qr: any) => (
            <Card key={qr.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-blue-500" />
                  {qr.label || "Unnamed QR"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Real QR code rendered on canvas */}
                {(() => {
                  const fullUrl = buildQrUrl(qr);
                  const canvasId = `qr-canvas-${qr.id}`;
                  return (
                    <>
                      <div className="flex justify-center items-center p-3 border rounded bg-white">
                        <QRCodeCanvas
                          id={canvasId}
                          value={fullUrl}
                          size={160}
                          level="H"
                          includeMargin={true}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p className="truncate"><strong>URL:</strong> {qr.targetUrl}</p>
                        {qr.utmSource && <p><strong>UTM:</strong> {qr.utmSource}/{qr.utmMedium}/{qr.utmCampaign}</p>}
                        <p><strong>Scans:</strong> {qr.scanCount ?? 0}</p>
                        <p><strong>Created:</strong> {new Date(qr.createdAt).toLocaleDateString("en-GB")}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button size="sm" variant="outline" onClick={() => downloadQrPng(canvasId, qr.label || "qr-code")}>
                          <Download className="w-3 h-3 mr-1" /> Download PNG
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => printQr(canvasId, qr.label || "QR Code", fullUrl)}>
                          <Printer className="w-3 h-3 mr-1" /> Print
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => copyUrl(fullUrl)}>
                          <Copy className="w-3 h-3 mr-1" /> Copy URL
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a href={fullUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3 h-3 mr-1" /> Open
                          </a>
                        </Button>
                      </div>
                      <Button size="sm" variant="destructive" className="w-full" onClick={() => deleteMut.mutate({ id: qr.id })}>
                        Delete
                      </Button>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
          {!qrCodes?.length && (
            <div className="col-span-3 text-center py-12 text-muted-foreground">
              <QrCode className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p>No QR codes generated yet</p>
              <Button className="mt-3" onClick={() => setShowGenerate(true)}>Generate First QR Code</Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate QR Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Label *</label>
              <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Ramadan 2025 Poster" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Target URL *</label>
              <Input value={form.targetUrl} onChange={e => setForm(f => ({ ...f, targetUrl: e.target.value }))} placeholder="https://donate.example.com/campaign" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Campaign (optional)</label>
              <Select value={form.campaignId} onValueChange={v => setForm(f => ({ ...f, campaignId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select campaign..." /></SelectTrigger>
                <SelectContent>
                  {campaigns?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-sm font-medium mb-1 block">UTM Source</label>
                <Input value={form.utmSource} onChange={e => setForm(f => ({ ...f, utmSource: e.target.value }))} placeholder="qr" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">UTM Medium</label>
                <Input value={form.utmMedium} onChange={e => setForm(f => ({ ...f, utmMedium: e.target.value }))} placeholder="print" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">UTM Campaign</label>
                <Input value={form.utmCampaign} onChange={e => setForm(f => ({ ...f, utmCampaign: e.target.value }))} placeholder="ramadan-2025" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>Cancel</Button>
            <Button disabled={createMut.isPending || !form.label || !form.targetUrl}
              onClick={() => createMut.mutate({
                label: form.label,
                targetUrl: form.targetUrl,
                campaignId: form.campaignId ? Number(form.campaignId) : undefined,
                campaignName: campaigns?.find((c: any) => String(c.id) === form.campaignId)?.name,
                utmSource: form.utmSource || undefined,
                utmMedium: form.utmMedium || undefined,
                utmCampaign: form.utmCampaign || undefined,
              })}>
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
  );
}
