import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Users, Heart, Search } from "lucide-react";

export default function Donors() {
  const [newOpen, setNewOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [regularOnly, setRegularOnly] = useState(false);

  const { data: donors = [], refetch } = trpc.donors.list.useQuery({ search: search || undefined, isRegular: regularOnly || undefined });

  const createDonor = trpc.donors.create.useMutation({
    onSuccess: () => { toast.success("Donor added"); setNewOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const totalGiven = donors.reduce((s, d) => s + parseFloat(d.totalGiven?.toString() ?? "0"), 0);
  const regularCount = donors.filter(d => d.isRegular).length;
  const giftAidCount = 0; // Gift Aid field not in current schema

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Donors</h1>
          <p className="page-subtitle">Donor management and Gift Aid tracking</p>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Donor
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Donors</p>
              <p className="text-xl font-bold">{donors.length}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-rose-100 flex items-center justify-center">
              <Heart className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Regular Donors</p>
              <p className="text-xl font-bold">{regularCount}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <span className="text-green-700 font-bold text-xs">GA</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gift Aid Eligible</p>
              <p className="text-xl font-bold">{giftAidCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-8 text-sm" placeholder="Search donors..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Switch checked={regularOnly} onCheckedChange={setRegularOnly} id="regular-filter" />
          <label htmlFor="regular-filter" className="text-sm cursor-pointer">Regular only</label>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Total Given</th>
                <th>Regular</th>
                <th>Gift Aid</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {donors.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground py-10">No donors found</td></tr>
              ) : donors.map(d => (
                <tr key={d.id}>
                  <td className="font-medium">{d.name}</td>
                  <td className="text-muted-foreground text-xs">{d.email ?? "—"}</td>
                  <td className="text-muted-foreground text-xs">{d.phone ?? "—"}</td>
                  <td className="font-semibold text-primary">£{parseFloat(d.totalGiven?.toString() ?? "0").toFixed(2)}</td>
                  <td>{d.isRegular ? <Badge variant="default" className="text-xs">Regular</Badge> : <span className="text-muted-foreground text-xs">—</span>}</td>
                  <td><span className="text-muted-foreground text-xs">—</span></td>
                  <td className="text-muted-foreground text-xs max-w-[150px] truncate">{d.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Add Donor Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Donor</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            createDonor.mutate({
              name: fd.get("name") as string,
              email: fd.get("email") as string || undefined,
              phone: fd.get("phone") as string || undefined,
              address: fd.get("address") as string || undefined,
              isRegular: fd.get("isRegular") === "on",

              notes: fd.get("notes") as string || undefined,
            });
          }} className="space-y-4">
            <div><Label>Full Name *</Label><Input name="name" required /></div>
            <div><Label>Email</Label><Input name="email" type="email" /></div>
            <div><Label>Phone</Label><Input name="phone" /></div>
            <div><Label>Address</Label><Input name="address" /></div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <input type="checkbox" name="isRegular" id="isRegular" className="h-4 w-4" />
                <label htmlFor="isRegular" className="text-sm">Regular Donor</label>
              </div>

            </div>
            <div><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
            <Button type="submit" className="w-full" disabled={createDonor.isPending}>
              {createDonor.isPending ? "Adding..." : "Add Donor"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
