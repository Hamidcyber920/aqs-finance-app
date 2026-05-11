import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { QrCode, Plus, Download, ExternalLink, Copy } from "lucide-react";

export default function QRCodes() {
  const [showGenerate, setShowGenerate] = useState(false);
  const [form, setForm] = useState({ label: "", targetUrl: "", campaignId: "", utmSource: "qr", utmMedium: "print", utmCampaign: "" });

  const { data: qrCodes, refetch } = (trpc as any).qrCodes.list.useQuery();
  const { data: campaigns } = (trpc as any).fundraising.getCampaigns.useQuery();

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
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
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
                <div className="flex justify-center items-center w-32 h-32 mx-auto border rounded bg-muted/30">
                  <QrCode className="w-12 h-12 text-muted-foreground" />
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="truncate"><strong>URL:</strong> {qr.targetUrl}</p>
                  {qr.utmSource && <p><strong>UTM:</strong> {qr.utmSource}/{qr.utmMedium}/{qr.utmCampaign}</p>}
                  <p><strong>Scans:</strong> {qr.scanCount ?? 0}</p>
                  <p><strong>Created:</strong> {new Date(qr.createdAt).toLocaleDateString("en-GB")}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => copyUrl(qr.targetUrl)}>
                    <Copy className="w-3 h-3 mr-1" /> Copy URL
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={qr.targetUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteMut.mutate({ id: qr.id })}>
                    ×
                  </Button>
                </div>
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
    </DashboardLayout>
  );
}
