import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trophy, Star, Sparkles, Users } from "lucide-react";

const TIER_COLORS: Record<string, string> = {
  Foundation: "bg-amber-100 text-amber-800",
  Wall: "bg-slate-100 text-slate-800",
  Roof: "bg-yellow-100 text-yellow-800",
  Mihrab: "bg-cyan-100 text-cyan-800",
};

export default function RecognitionTiers() {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<"tiers" | "leaderboard">("tiers");
  const [form, setForm] = useState({ name: "Foundation", minAmount: "", maxAmount: "", description: "", benefitDescription: "", color: "#4CAF50" });

  const { data: campaigns } = (trpc as any).fundraising.getCampaigns.useQuery();
  const { data: tiers, refetch } = (trpc as any).recognitionTiers.list.useQuery(
    { campaignId: selectedCampaign },
    { enabled: !!selectedCampaign }
  );
  const { data: leaderboard, isLoading: leaderboardLoading } = (trpc as any).recognitionTiers.leaderboard.useQuery(
    { campaignId: selectedCampaign! },
    { enabled: !!selectedCampaign && activeView === "leaderboard" }
  );

  const upsertMut = (trpc as any).recognitionTiers.upsert.useMutation({
    onSuccess: () => { toast.success("Tier saved"); refetch(); setShowAdd(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const seedMut = (trpc as any).recognitionTiers.seedDefaults.useMutation({
    onSuccess: (r: any) => { toast.success(`Seeded ${r.seeded} default tiers`); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = (trpc as any).recognitionTiers.delete.useMutation({
    onSuccess: () => { toast.success("Tier deleted"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Recognition Tiers</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage donor recognition tiers per campaign (Foundation, Wall, Roof, Mihrab)</p>
          </div>
          <div className="flex gap-2">
            {selectedCampaign && activeView === "tiers" && (
              <Button variant="outline" onClick={() => seedMut.mutate({ campaignId: selectedCampaign })} disabled={seedMut.isPending}>
                <Sparkles className="w-4 h-4 mr-2" /> Seed Defaults
              </Button>
            )}
            {selectedCampaign && activeView === "tiers" && (
              <Button onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4 mr-2" /> Add Tier
              </Button>
            )}
          </div>
        </div>

        {/* Campaign selector */}
        <Card>
          <CardHeader><CardTitle>Select Campaign</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {campaigns?.map((c: any) => (
                <Button key={c.id} size="sm"
                  variant={selectedCampaign === c.id ? "default" : "outline"}
                  onClick={() => setSelectedCampaign(c.id)}>
                  {c.name}
                </Button>
              ))}
              {!campaigns?.length && <p className="text-muted-foreground text-sm">No campaigns found.</p>}
            </div>
          </CardContent>
        </Card>

        {/* View toggle */}
        {selectedCampaign && (
          <div className="flex gap-1 border-b">
            <button
              onClick={() => setActiveView("tiers")}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeView === "tiers" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <Trophy className="w-4 h-4" /> Tier Configuration
            </button>
            <button
              onClick={() => setActiveView("leaderboard")}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeView === "leaderboard" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <Users className="w-4 h-4" /> Donor Leaderboard
            </button>
          </div>
        )}

        {/* Tier configuration view */}
        {selectedCampaign && activeView === "tiers" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {tiers?.map((tier: any) => (
              <Card key={tier.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Trophy className="w-4 h-4" />
                    {tier.name}
                    <Badge className={TIER_COLORS[tier.name] ?? "bg-gray-100 text-gray-800"}>{tier.name}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Min donation</span>
                    <span className="font-semibold">£{Number(tier.minAmount).toLocaleString()}</span>
                  </div>
                  {tier.maxAmount && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max donation</span>
                      <span className="font-semibold">£{Number(tier.maxAmount).toLocaleString()}</span>
                    </div>
                  )}
                  {tier.description && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-xs text-muted-foreground">{tier.description}</p>
                    </div>
                  )}
                  {tier.benefitDescription && (
                    <div className="mt-1">
                      <p className="text-xs font-medium">Benefits:</p>
                      <p className="text-xs text-muted-foreground">{tier.benefitDescription}</p>
                    </div>
                  )}
                  <Button size="sm" variant="destructive" className="w-full mt-2"
                    onClick={() => deleteMut.mutate({ id: tier.id })}>
                    Delete
                  </Button>
                </CardContent>
              </Card>
            ))}
            {tiers?.length === 0 && (
              <div className="col-span-4 text-center py-8 text-muted-foreground">
                <Star className="w-10 h-10 mx-auto mb-2 text-amber-300" />
                <p>No tiers defined for this campaign yet</p>
                <div className="flex gap-2 justify-center mt-3">
                  <Button size="sm" variant="outline" onClick={() => seedMut.mutate({ campaignId: selectedCampaign! })}>
                    <Sparkles className="w-4 h-4 mr-1" /> Seed Defaults
                  </Button>
                  <Button size="sm" onClick={() => setShowAdd(true)}>Add Custom Tier</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Leaderboard view */}
        {selectedCampaign && activeView === "leaderboard" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" /> Donor Leaderboard
              </CardTitle>
              <p className="text-sm text-muted-foreground">Donors ranked by total giving for this campaign, with their qualifying recognition tier</p>
            </CardHeader>
            <CardContent>
              {leaderboardLoading ? (
                <p className="text-muted-foreground text-sm py-4 text-center">Loading leaderboard...</p>
              ) : !leaderboard?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No donations recorded for this campaign yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(leaderboard as any[]).map((row: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 border rounded p-3 hover:bg-muted/20 transition-colors">
                      {/* Rank */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        idx === 0 ? "bg-yellow-100 text-yellow-700" :
                        idx === 1 ? "bg-slate-100 text-slate-600" :
                        idx === 2 ? "bg-amber-100 text-amber-700" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {idx + 1}
                      </div>
                      {/* Donor info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{row.donorName}</p>
                        {row.donorEmail && <p className="text-xs text-muted-foreground truncate">{row.donorEmail}</p>}
                      </div>
                      {/* Total given */}
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-lg">£{Number(row.totalGiven).toLocaleString()}</p>
                      </div>
                      {/* Tier badge */}
                      <div className="flex-shrink-0 w-28 text-right">
                        {row.tier ? (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
                            style={{
                              background: `${row.tier.color}22`,
                              color: row.tier.color,
                              border: `1px solid ${row.tier.color}55`,
                            }}
                          >
                            <Trophy className="w-3 h-3" />
                            {row.tier.name}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No tier</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Recognition Tier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Tier Name *</label>
                <select className="w-full border rounded px-3 py-2 text-sm bg-background" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}>
                  <option>Foundation</option>
                  <option>Wall</option>
                  <option>Roof</option>
                  <option>Mihrab</option>
                  <option>Custom</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Colour</label>
                <Input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Min Amount (£) *</label>
                <Input type="number" value={form.minAmount} onChange={e => setForm(f => ({ ...f, minAmount: e.target.value }))} placeholder="e.g. 100" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Max Amount (£)</label>
                <Input type="number" value={form.maxAmount} onChange={e => setForm(f => ({ ...f, maxAmount: e.target.value }))} placeholder="Leave blank for no max" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description of this tier" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Benefits / Perks</label>
              <Textarea value={form.benefitDescription} onChange={e => setForm(f => ({ ...f, benefitDescription: e.target.value }))} placeholder="Name on plaque, certificate, invitation to opening..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button disabled={upsertMut.isPending || !form.name || !form.minAmount || !selectedCampaign}
              onClick={() => upsertMut.mutate({
                campaignId: selectedCampaign!,
                name: form.name,
                minAmount: form.minAmount,
                maxAmount: form.maxAmount || undefined,
                description: form.description || undefined,
                benefitDescription: form.benefitDescription || undefined,
                color: form.color,
              })}>
              Create Tier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
