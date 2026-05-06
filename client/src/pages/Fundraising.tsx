import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, HandHeart, TrendingUp, Calendar, Trash2, CheckCircle2, Clock, ShieldCheck, AlertTriangle } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

// Roles that can authorise Friday collections
const AUTHORISED_ROLES = ["superadmin", "admin", "trustee", "manager", "deputy"];

function AuthoriseConfirmDialog({
  open,
  onOpenChange,
  collection,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  collection: { collectionDate: string | Date; totalAmount: string | number; bucketTotal?: string | number; cardTerminalTotal?: string | number } | null;
  onConfirm: () => void;
  loading: boolean;
}) {
  const [checked, setChecked] = useState(false);

  const handleClose = (v: boolean) => {
    if (!v) setChecked(false);
    onOpenChange(v);
  };

  if (!collection) return null;

  const total = parseFloat(String(collection.totalAmount ?? 0)).toFixed(2);
  const bucket = parseFloat(String(collection.bucketTotal ?? 0)).toFixed(2);
  const card = parseFloat(String(collection.cardTerminalTotal ?? 0)).toFixed(2);
  const dateStr = new Date(collection.collectionDate).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <ShieldCheck className="h-5 w-5" />
            Authorise Friday Collection
          </DialogTitle>
          <DialogDescription>
            You are about to sign off this collection as accurate and verified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Collection summary */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <p className="text-sm font-semibold">{dateStr}</p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Bucket</p>
                <p className="font-medium">£{bucket}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Card Terminal</p>
                <p className="font-medium">£{card}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-semibold text-primary">£{total}</p>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              By authorising, you confirm that you have <strong>physically checked and verified</strong> these figures are correct. Your name and the current date and time will be permanently recorded.
            </p>
          </div>

          {/* Confirmation checkbox */}
          <div className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer" onClick={() => setChecked(c => !c)}>
            <Checkbox
              id="authorise-confirm"
              checked={checked}
              onCheckedChange={(v) => setChecked(!!v)}
              className="mt-0.5"
            />
            <label htmlFor="authorise-confirm" className="text-sm cursor-pointer leading-relaxed">
              I have checked these figures and confirm they are correct. I authorise this Friday collection record.
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button
            onClick={() => { onConfirm(); handleClose(false); }}
            disabled={!checked || loading}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {loading ? "Signing off…" : "Confirm & Sign Off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Fundraising() {
  const { user } = useAuth();
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [newDonationOpen, setNewDonationOpen] = useState(false);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [deleteCollectionId, setDeleteCollectionId] = useState<number | null>(null);
  const [authoriseTarget, setAuthoriseTarget] = useState<(typeof fridayCollections)[0] | null>(null);

  const canAuthorise = AUTHORISED_ROLES.includes(user?.role ?? "");

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

  const deleteCollection = trpc.fundraising.deleteFridayCollection.useMutation({
    onSuccess: () => { toast.success("Collection deleted"); setDeleteCollectionId(null); refetchCollections(); },
    onError: (e) => toast.error(e.message),
  });

  const authoriseCollection = trpc.fundraising.authoriseFridayCollection.useMutation({
    onSuccess: () => { toast.success("Collection authorised and signed off"); refetchCollections(); },
    onError: (e) => toast.error("Authorisation failed: " + e.message),
  });

  const unauthoriseCollection = trpc.fundraising.unauthoriseFridayCollection.useMutation({
    onSuccess: () => { toast.success("Authorisation removed"); refetchCollections(); },
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
            <HandHeart className="h-4 w-4 mr-2" /> Record Donation
          </Button>
          <Button size="sm" onClick={() => setNewCampaignOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Campaign
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Raised</p><p className="text-2xl font-bold">£{totalRaised.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Target</p><p className="text-2xl font-bold">£{totalTarget.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Campaigns</p><p className="text-2xl font-bold">{campaigns.length}</p></CardContent></Card>
      </div>

      {/* Campaigns */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Active Campaigns</h2>
        {campaigns.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No campaigns yet. Create your first campaign to get started.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map(c => {
              const raised = parseFloat(c.currentAmount?.toString() ?? "0");
              const target = parseFloat(c.targetAmount?.toString() ?? "0");
              const pct = target > 0 ? Math.min(100, Math.round((raised / target) * 100)) : 0;
              return (
                <Card key={c.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{c.name}</CardTitle>
                    {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold">£{raised.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
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
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4" /> Friday Collections
          {canAuthorise && (
            <Badge variant="outline" className="text-xs ml-auto font-normal text-muted-foreground">
              You can authorise collections
            </Badge>
          )}
        </h2>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Bucket</th>
                    <th>Card Terminal</th>
                    <th>Total</th>
                    <th>Recorded</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {fridayCollections.length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-muted-foreground py-8">No collections recorded yet</td></tr>
                  ) : fridayCollections.map(fc => {
                    const isAuthorised = !!fc.authorisedAt;
                    const recordedAt = fc.createdAt ? new Date(fc.createdAt) : null;
                    const authorisedAt = fc.authorisedAt ? new Date(fc.authorisedAt) : null;
                    const isOld = recordedAt && (Date.now() - recordedAt.getTime()) > 24 * 60 * 60 * 1000;

                    return (
                      <tr key={fc.id}>
                        <td className="font-medium">{new Date(fc.collectionDate).toLocaleDateString("en-GB")}</td>
                        <td>£{parseFloat(fc.bucketTotal?.toString() ?? "0").toFixed(2)}</td>
                        <td>£{parseFloat(fc.cardTerminalTotal?.toString() ?? "0").toFixed(2)}</td>
                        <td className="font-semibold">£{parseFloat(fc.totalAmount?.toString() ?? "0").toFixed(2)}</td>
                        <td className="text-xs text-muted-foreground">
                          {recordedAt ? (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {recordedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{" "}
                              {recordedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          ) : "—"}
                        </td>
                        <td>
                          {isAuthorised ? (
                            <div className="space-y-1">
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800 flex items-center gap-1 w-fit text-xs">
                                <CheckCircle2 className="h-3 w-3" />
                                Authorised
                              </Badge>
                              <p className="text-xs text-muted-foreground">
                                by {fc.authorisedByName}
                              </p>
                              {authorisedAt && (
                                <p className="text-xs text-muted-foreground">
                                  {authorisedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{" "}
                                  {authorisedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <Badge variant="outline" className={`flex items-center gap-1 w-fit text-xs ${isOld ? "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400" : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"}`}>
                                {isOld ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                {isOld ? "Overdue" : "Pending"}
                              </Badge>
                              {canAuthorise && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-xs border-green-400 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30"
                                  onClick={() => setAuthoriseTarget(fc as any)}
                                >
                                  <ShieldCheck className="h-3 w-3 mr-1" />
                                  Authorise
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="flex gap-1">
                            {isAuthorised && canAuthorise && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-amber-600"
                                title="Remove authorisation"
                                onClick={() => unauthoriseCollection.mutate({ id: fc.id })}
                              >
                                <ShieldCheck className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteCollectionId(fc.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
          <DialogHeader>
            <DialogTitle>Record Friday Collection</DialogTitle>
            <DialogDescription>Enter the cash bucket and card terminal totals for this Friday's collection.</DialogDescription>
          </DialogHeader>
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
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-xs text-blue-800 dark:text-blue-300">
              This entry will be time-stamped and will require authorisation from a manager, deputy, or trustee before it is considered verified.
            </div>
            <Button type="submit" className="w-full" disabled={recordCollection.isPending}>
              {recordCollection.isPending ? "Saving..." : "Save Collection"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Authorise Confirmation Dialog */}
      <AuthoriseConfirmDialog
        open={!!authoriseTarget}
        onOpenChange={(v) => { if (!v) setAuthoriseTarget(null); }}
        collection={authoriseTarget}
        onConfirm={() => authoriseTarget && authoriseCollection.mutate({ id: authoriseTarget.id })}
        loading={authoriseCollection.isPending}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteCollectionId !== null}
        onOpenChange={(v) => { if (!v) setDeleteCollectionId(null); }}
        itemLabel="this Friday collection record"
        onConfirm={() => deleteCollectionId !== null && deleteCollection.mutate({ id: deleteCollectionId })}
        loading={deleteCollection.isPending}
      />
    </div>
  );
}
