import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Send, Mail, Calendar, Users } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border border-gray-200",
  scheduled: "bg-blue-100 text-blue-800 border border-blue-200",
  sent: "badge-approved",
  failed: "badge-rejected",
};

export default function Campaigns() {
  const [newOpen, setNewOpen] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);

  const { data: campaigns = [], refetch } = trpc.campaigns.list.useQuery();
  const { data: preview } = trpc.campaigns.get.useQuery({ id: previewId! }, { enabled: !!previewId });

  const createCampaign = trpc.campaigns.create.useMutation({
    onSuccess: () => { toast.success("Campaign created"); setNewOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const sendCampaign = trpc.campaigns.send.useMutation({
    onSuccess: (data) => { toast.success(`Campaign sent to ${data.sent} donors`); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const sent = campaigns.filter(c => c.status === "sent").length;
  const scheduled = campaigns.filter(c => c.status === "scheduled").length;
  const totalSent = campaigns.reduce((s, c) => s + (c.sentCount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Email Campaigns</h1>
          <p className="page-subtitle">Automated donor communications and newsletters</p>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Campaign
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Sent</p>
              <p className="text-xl font-bold">{sent}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Scheduled</p>
              <p className="text-xl font-bold">{scheduled}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Recipients</p>
              <p className="text-xl font-bold">{totalSent.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Campaigns Grid */}
      {campaigns.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No campaigns yet. Create your first email campaign to communicate with donors.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaigns.map(c => (
            <Card key={c.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold leading-tight">{c.name}</CardTitle>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${STATUS_COLORS[c.status ?? "draft"] ?? STATUS_COLORS.draft}`}>
                    {c.status ?? "draft"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Subject: {c.subject}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span className="capitalize">{c.type}</span>
                  {c.sentAt && <span>Sent {new Date(c.sentAt).toLocaleDateString("en-GB")}</span>}
                  {c.sentCount ? <span>{c.sentCount} recipients</span> : null}
                  {c.scheduledAt && c.status === "scheduled" && <span>Scheduled {new Date(c.scheduledAt).toLocaleDateString("en-GB")}</span>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setPreviewId(c.id)}>
                    Preview
                  </Button>
                  {(c.status === "draft" || c.status === "scheduled") && (
                    <Button size="sm" className="flex-1" onClick={() => sendCampaign.mutate({ id: c.id })} disabled={sendCampaign.isPending}>
                      <Send className="h-3 w-3 mr-1" /> Send Now
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Campaign Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Email Campaign</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const scheduledAt = fd.get("scheduledAt") as string;
            createCampaign.mutate({
              name: fd.get("name") as string,
              subject: fd.get("subject") as string,
              body: fd.get("body") as string,
              type: fd.get("type") as string,
              targetAudience: fd.get("targetAudience") as string,
              scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
            });
          }} className="space-y-4">
            <div><Label>Campaign Name *</Label><Input name="name" required placeholder="e.g. Ramadan Thank You 2026" /></div>
            <div><Label>Email Subject *</Label><Input name="subject" required placeholder="Subject line" /></div>
            <div>
              <Label>Type</Label>
              <Select name="type" defaultValue="newsletter">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newsletter">Newsletter</SelectItem>
                  <SelectItem value="thank_you">Thank You</SelectItem>
                  <SelectItem value="appeal">Fundraising Appeal</SelectItem>
                  <SelectItem value="event">Event Invitation</SelectItem>
                  <SelectItem value="update">General Update</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target Audience</Label>
              <Select name="targetAudience" defaultValue="all_donors">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_donors">All Donors</SelectItem>
                  <SelectItem value="regular_donors">Regular Donors Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Email Body *</Label><Textarea name="body" rows={6} required placeholder="Write your email content here..." /></div>
            <div><Label>Schedule For (optional)</Label><Input name="scheduledAt" type="datetime-local" /></div>
            <Button type="submit" className="w-full" disabled={createCampaign.isPending}>
              {createCampaign.isPending ? "Creating..." : "Create Campaign"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewId} onOpenChange={(o) => !o && setPreviewId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{preview?.name}</DialogTitle></DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="font-medium">Subject: {preview.subject}</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
                {preview.body}
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-xs capitalize">{preview.type}</Badge>
                <Badge variant="outline" className="text-xs capitalize">{preview.targetAudience?.replace("_", " ")}</Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
