import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, AlertTriangle, CheckCircle, FileText } from "lucide-react";
import { fmtDate } from "@/lib/dateUtils";

export default function ConflictsRegister() {
  const [showAdd, setShowAdd] = useState(false);
  const [showResolve, setShowResolve] = useState<number | null>(null);
  const [resolution, setResolution] = useState("");
  const [resolutionStatus, setResolutionStatus] = useState<"resolved" | "noted">("resolved");
  const [form, setForm] = useState({
    trusteeId: "",
    trusteeName: "",
    description: "",
    donorName: "",
    donationAmount: "",
  });

  useEffect(() => {
  }, []);

  const { data: conflicts, refetch } = (trpc as any).conflicts.list.useQuery();

  const createMut = (trpc as any).conflicts.create.useMutation({
    onSuccess: () => { toast.success("Conflict of interest declared"); refetch(); setShowAdd(false); setForm({ trusteeId: "", trusteeName: "", description: "", donorName: "", donationAmount: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const resolveMut = (trpc as any).conflicts.resolve.useMutation({
    onSuccess: () => { toast.success("Conflict updated"); refetch(); setShowResolve(null); setResolution(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = (trpc as any).conflicts.delete.useMutation({
    onSuccess: () => { toast.success("Record deleted"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const statusBadge = (status: string) => {
    if (status === "resolved") return <Badge className="bg-green-100 text-green-800">Resolved</Badge>;
    if (status === "noted") return <Badge className="bg-blue-100 text-blue-800">Noted</Badge>;
    return <Badge className="bg-red-100 text-red-800">Open</Badge>;
  };

  return (
      <>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Conflicts of Interest Register</h1>
            <p className="text-muted-foreground text-sm mt-1">Charity Commission requirement — record and manage trustee conflicts of interest</p>
          </div>
          <Button onClick={() => setShowAdd(true)} className="self-start sm:self-auto">
            <Plus className="w-4 h-4 mr-2" /> Declare Conflict
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Conflicts Register
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!conflicts?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-400" />
                <p>No conflicts of interest recorded</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-4">Trustee</th>
                      <th className="text-left py-2 pr-4">Description</th>
                      <th className="text-left py-2 pr-4">Related Donor</th>
                      <th className="text-left py-2 pr-4">Amount</th>
                      <th className="text-left py-2 pr-4">Disclosed</th>
                      <th className="text-left py-2 pr-4">Status</th>
                      <th className="text-left py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conflicts.map((c: any) => (
                      <tr key={c.id} className="border-b hover:bg-muted/20">
                        <td className="py-2 pr-4 font-medium">{c.trusteeName}</td>
                        <td className="py-2 pr-4 max-w-[200px]">{c.description}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{c.donorName ?? "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{c.donationAmount ? `£${Number(c.donationAmount).toLocaleString()}` : "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{c.disclosedAt ? fmtDate(new Date(c.disclosedAt)) : "—"}</td>
                        <td className="py-2 pr-4">{statusBadge(c.status)}</td>
                        <td className="py-2 flex gap-1">
                          {c.status === "open" && (
                            <Button size="sm" variant="outline" onClick={() => setShowResolve(c.id)}>
                              Resolve
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-red-500"
                            onClick={() => deleteMut.mutate({ id: c.id })}>
                            ×
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add conflict dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Declare Conflict of Interest</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Trustee Name *</label>
                <Input value={form.trusteeName} onChange={e => setForm(f => ({ ...f, trusteeName: e.target.value }))} placeholder="Full name" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Trustee ID *</label>
                <Input type="number" value={form.trusteeId} onChange={e => setForm(f => ({ ...f, trusteeId: e.target.value }))} placeholder="Trustee record ID" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Conflict Description *</label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the nature of the conflict..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Related Donor Name</label>
                <Input value={form.donorName} onChange={e => setForm(f => ({ ...f, donorName: e.target.value }))} placeholder="Optional" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Donation Amount (£)</label>
                <Input type="number" value={form.donationAmount} onChange={e => setForm(f => ({ ...f, donationAmount: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button disabled={createMut.isPending || !form.trusteeName || !form.trusteeId || !form.description}
              onClick={() => createMut.mutate({
                trusteeId: Number(form.trusteeId),
                trusteeName: form.trusteeName,
                description: form.description,
                donorName: form.donorName || undefined,
                donationAmount: form.donationAmount || undefined,
              })}>
              Declare
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve dialog */}
      <Dialog open={!!showResolve} onOpenChange={() => setShowResolve(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Conflict of Interest</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Resolution Status</label>
              <Select value={resolutionStatus} onValueChange={(v: any) => setResolutionStatus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="noted">Noted (ongoing)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Resolution Notes *</label>
              <Textarea value={resolution} onChange={e => setResolution(e.target.value)}
                placeholder="Describe how the conflict was resolved or managed..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolve(null)}>Cancel</Button>
            <Button disabled={resolveMut.isPending || !resolution}
              onClick={() => resolveMut.mutate({ id: showResolve!, resolution, status: resolutionStatus })}>
              Save Resolution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
  );
}
