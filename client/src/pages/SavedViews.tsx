import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bookmark, Plus, Trash2, Star } from "lucide-react";
import { useVoiceContext } from "@/contexts/VoiceContext";

const MODULE_LABELS: Record<string, string> = {
  donors: "Donors",
  receipts: "Receipts",
  fundraising: "Fundraising",
  comms: "Communications",
  pledges: "Pledges",
};

export default function SavedViews() {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedModule, setSelectedModule] = useState("donors");
  const [form, setForm] = useState({ name: "", module: "donors", isDefault: false });

  const { setEntityContext } = useVoiceContext();
  useEffect(() => {
    setEntityContext("Viewing Saved Views — custom saved filters and views across the system");
    return () => setEntityContext(null);
  }, [setEntityContext]);

  const { data: views, refetch } = (trpc as any).savedViews.list.useQuery({ module: selectedModule || undefined });

  const saveMut = (trpc as any).savedViews.save.useMutation({
    onSuccess: () => { toast.success("View saved"); refetch(); setShowAdd(false); setForm({ name: "", module: "donors", isDefault: false }); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = (trpc as any).savedViews.delete.useMutation({
    onSuccess: () => { toast.success("View deleted"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
      <>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Saved Views</h1>
            <p className="text-muted-foreground text-sm mt-1">Save and manage custom filter views for quick access across modules</p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-2" /> Save View
          </Button>
        </div>

        {/* Module filter */}
        <div className="flex gap-2">
          <Button size="sm" variant={!selectedModule ? "default" : "outline"} onClick={() => setSelectedModule("")}>All</Button>
          {Object.entries(MODULE_LABELS).map(([key, label]) => (
            <Button key={key} size="sm" variant={selectedModule === key ? "default" : "outline"} onClick={() => setSelectedModule(key)}>
              {label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {views?.map((view: any) => (
            <Card key={view.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bookmark className="w-4 h-4 text-blue-500" />
                  {view.name}
                  {view.isDefault && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <Badge className="bg-blue-100 text-blue-800">{MODULE_LABELS[view.module] || view.module}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(view.createdAt).toLocaleDateString("en-GB")}</span>
                </div>
                {view.filters && Object.keys(view.filters).length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium mb-1">Filters:</p>
                    {Object.entries(view.filters).slice(0, 3).map(([k, v]) => (
                      <p key={k}>{k}: {String(v)}</p>
                    ))}
                    {Object.keys(view.filters).length > 3 && <p>+{Object.keys(view.filters).length - 3} more</p>}
                  </div>
                )}
                <Button size="sm" variant="destructive" className="w-full mt-2"
                  onClick={() => deleteMut.mutate({ id: view.id })}>
                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                </Button>
              </CardContent>
            </Card>
          ))}
          {!views?.length && (
            <div className="col-span-3 text-center py-12 text-muted-foreground">
              <Bookmark className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p>No saved views yet</p>
              <p className="text-xs mt-1">Save filter combinations for quick access</p>
              <Button className="mt-3" onClick={() => setShowAdd(true)}>Save First View</Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save View</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">View Name *</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. High-value Gift Aid donors" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Module</label>
              <Select value={form.module} onValueChange={v => setForm(f => ({ ...f, module: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MODULE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isDefault" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} />
              <label htmlFor="isDefault" className="text-sm">Set as default view for this module</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button disabled={saveMut.isPending || !form.name}
              onClick={() => saveMut.mutate({ name: form.name, module: form.module, filters: {}, isDefault: form.isDefault })}>
              Save View
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
  );
}
