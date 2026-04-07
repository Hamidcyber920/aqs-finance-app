import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Plus, HandHeart, TrendingUp, Calendar, DollarSign } from "lucide-react";

export default function Fundraising() {
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [newDonationOpen, setNewDonationOpen] = useState(false);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);

  const { data: campaigns = [], refetch } = trpc.fundraising.listCampaigns.useQuery();
  const { data: fridayCollections = [], refetch: refetchCollections } = trpc.fundraising.listFridayCollections.useQuery();

  const createCampaign = trpc.fundraising.createCampaign.useMutation({
    onSuccess: () => { toast.success("Campaign created"); setNewCampaignOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const recordDonation = trpc.fundraising.recordDonation.useMutation({
    onSuccess: () => { toast.success("Donation recorded"); setNewDonationOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const recordCollection = trpc.fundraising.recordFridayCollection.useMutation({
    onSuccess: () => { toast.success("Friday collection recorded"); setNewCollectionOpen(false); refetchCollections(); },
    onError: (e) => toast.error(e.message),
  });

  const totalRaised = campaigns.reduce((s, c) => s + parseFloat(c.currentAmount?.toString() ?? "0"), 0);
  const totalTarget = campaigns.reduce((s, c) => s + parseFloat(c.targetAmount?.toString() ?? "0"), 0);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Fundraising</h1>
          <p className="page-subtitle">Campaigns, donations & Friday collections</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setNewCollectionOpen(true)}>
            <Calendar className="h-4 w-4 mr-2" /> Friday Collection
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setSelectedCampaignId(campaigns[0]?.id ?? null); setNewDonationOpen(true); }}>
            <DollarSign className="h-4 w-4 mr-2" /> Record Donation
          </Button>
          <Button size="sm" onClick={() => setNewCampaignOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Campaign
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <HandHeart className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Raised</p>
              <p className="text-xl font-bold text-foreground">£{totalRaised.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-accent/20 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Target</p>
              <p className="text-xl font-bold text-foreground">£{totalTarget.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Campaigns</p>
              <p className="text-xl font-bold text-foreground">{campaigns.filter(c => c.isActive).length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Campaigns */}
      <div>
        <h2 className="text-base font-semibold mb-3">Campaigns</h2>
        {campaigns.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No campaigns yet. Create your first campaign.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {campaigns.map(c => {
              const raised = parseFloat(c.currentAmount?.toString() ?? "0");
              const target = parseFloat(c.targetAmount?.toString() ?? "1");
              const pct = Math.min(100, Math.round((raised / target) * 100));
              return (
                <Card key={c.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm font-semibold">{c.name}</CardTitle>
                      <Badge variant={c.isActive ? "default" : "secondary"} className="text-xs">
                        {c.isActive ? "Active" : "Closed"}
                      </Badge>
                    </div>
                    {c.description && <p className="text-xs text-muted-foreground mt-1">{c.description}</p>}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold text-primary">£{raised.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
                      <span className="text-muted-foreground">of £{target.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <p className="text-xs text-muted-foreground">{pct}% of target reached</p>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => { setSelectedCampaignId(c.id); setNewDonationOpen(true); }}>
                      Record Donation
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Friday Collections */}
      <div>
        <h2 className="text-base font-semibold mb-3">Friday Collections</h2>
        <Card>
          <CardContent className="p-0">
            <table className="w-full data-table">
              <thead><tr><th>Date</th><th>Bucket</th><th>Card Terminal</th><th>Total</th><th>Notes</th></tr></thead>
              <tbody>
                {fridayCollections.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No collections recorded yet</td></tr>
                ) : fridayCollections.map(fc => (
                  <tr key={fc.id}>
                    <td>{new Date(fc.collectionDate).toLocaleDateString("en-GB")}</td>
                    <td>£{parseFloat(fc.bucketTotal?.toString() ?? "0").toFixed(2)}</td>
                    <td>£{parseFloat(fc.cardTerminalTotal?.toString() ?? "0").toFixed(2)}</td>
                    <td className="font-semibold">£{parseFloat(fc.totalAmount?.toString() ?? "0").toFixed(2)}</td>
                    <td className="text-muted-foreground text-xs">{fc.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* New Campaign Dialog */}
      <Dialog open={newCampaignOpen} onOpenChange={setNewCampaignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Fundraising Campaign</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            createCampaign.mutate({ name: fd.get("name") as string, description: fd.get("description") as string, targetAmount: fd.get("targetAmount") as string });
          }} className="space-y-4">
            <div><Label>Campaign Name *</Label><Input name="name" required /></div>
            <div><Label>Description</Label><Textarea name="description" rows={2} /></div>
            <div><Label>Target Amount (£) *</Label><Input name="targetAmount" type="number" step="0.01" required /></div>
            <Button type="submit" className="w-full" disabled={createCampaign.isPending}>
              {createCampaign.isPending ? "Creating..." : "Create Campaign"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record Donation Dialog */}
      <Dialog open={newDonationOpen} onOpenChange={setNewDonationOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Donation</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            if (!selectedCampaignId) return;
            recordDonation.mutate({ campaignId: selectedCampaignId, donorName: fd.get("donorName") as string, donorEmail: fd.get("donorEmail") as string || undefined, amount: fd.get("amount") as string, paymentMethod: fd.get("paymentMethod") as string });
          }} className="space-y-4">
            <div>
              <Label>Campaign *</Label>
              <Select value={selectedCampaignId?.toString()} onValueChange={(v) => setSelectedCampaignId(parseInt(v))}>
                <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
                <SelectContent>{campaigns.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Donor Name</Label><Input name="donorName" placeholder="Anonymous" /></div>
            <div><Label>Donor Email</Label><Input name="donorEmail" type="email" /></div>
            <div><Label>Amount (£) *</Label><Input name="amount" type="number" step="0.01" required /></div>
            <div>
              <Label>Payment Method *</Label>
              <Select name="paymentMethod" defaultValue="cash">
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
            <Button type="submit" className="w-full" disabled={recordDonation.isPending}>
              {recordDonation.isPending ? "Recording..." : "Record Donation"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Friday Collection Dialog */}
      <Dialog open={newCollectionOpen} onOpenChange={setNewCollectionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Friday Collection</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const bucket = parseFloat(fd.get("bucketTotal") as string || "0");
            const card = parseFloat(fd.get("cardTerminalTotal") as string || "0");
            recordCollection.mutate({ collectionDate: new Date(fd.get("collectionDate") as string), amount: (bucket + card).toFixed(2), notes: fd.get("notes") as string || undefined });
          }} className="space-y-4">
            <div><Label>Collection Date *</Label><Input name="collectionDate" type="date" required defaultValue={new Date().toISOString().split("T")[0]} /></div>
            <div><Label>Bucket Total (£)</Label><Input name="bucketTotal" type="number" step="0.01" defaultValue="0" /></div>
            <div><Label>Card Terminal Total (£)</Label><Input name="cardTerminalTotal" type="number" step="0.01" defaultValue="0" /></div>
            <div><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
            <Button type="submit" className="w-full" disabled={recordCollection.isPending}>
              {recordCollection.isPending ? "Saving..." : "Save Collection"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
