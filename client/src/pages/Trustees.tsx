import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ShieldCheck, Phone, Mail } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

interface TrusteeForm {
  fullName: string;
  email: string;
  phone: string;
  role: string;
  notes: string;
}

const emptyForm: TrusteeForm = { fullName: "", email: "", phone: "", role: "Trustee", notes: "" };

export default function Trustees() {
  const utils = trpc.useUtils();
  const { data: trustees = [], isLoading } = trpc.trustees.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TrusteeForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const createMutation = trpc.trustees.create.useMutation({
    onSuccess: () => { utils.trustees.list.invalidate(); setDialogOpen(false); toast.success("Trustee added successfully"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.trustees.update.useMutation({
    onSuccess: () => { utils.trustees.list.invalidate(); setDialogOpen(false); toast.success("Trustee updated"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.trustees.delete.useMutation({
    onSuccess: () => { utils.trustees.list.invalidate(); setDeleteId(null); toast.success("Trustee deactivated"); },
    onError: (e) => toast.error(e.message),
  });

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); };
  const openEdit = (t: typeof trustees[0]) => {
    setForm({ fullName: t.fullName, email: t.email ?? "", phone: t.phone ?? "", role: t.role, notes: t.notes ?? "" });
    setEditingId(t.id);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.fullName.trim()) { toast.error("Full name is required"); return; }
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-[#1a4731]" />
            Trustees
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage trustees who co-sign Qarde Hasan loan agreements and repayment confirmations.
          </p>
        </div>
        <Button onClick={openAdd} className="bg-[#1a4731] hover:bg-[#1a4731]/90 text-white">
          <Plus className="h-4 w-4 mr-2" /> Add Trustee
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading trustees…</div>
      ) : trustees.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No trustees added yet.</p>
          <Button variant="outline" className="mt-4" onClick={openAdd}>Add First Trustee</Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trustees.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.fullName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[#1a4731] border-[#1a4731]">{t.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5 text-sm">
                      {t.email && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="h-3 w-3" /> {t.email}
                        </span>
                      )}
                      {t.phone && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="h-3 w-3" /> {t.phone}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={t.isActive ? "bg-green-100 text-green-800 border-green-200" : "bg-red-100 text-red-800 border-red-200"}>
                      {t.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{t.notes ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(t.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Trustee" : "Add Trustee"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Full Name *</Label>
              <Input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="e.g. Mumin Khan" />
            </div>
            <div>
              <Label>Role</Label>
              <Input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Trustee, Chair, Manager" />
            </div>
            <div>
              <Label>Email Address</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="trustee@example.com" />
            </div>
            <div>
              <Label>Phone / WhatsApp Number</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+44 7700 000000" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes about this trustee" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#1a4731] hover:bg-[#1a4731]/90 text-white"
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? "Save Changes" : "Add Trustee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <DeleteConfirmDialog
        open={deleteId !== null}
        onOpenChange={(v) => { if (!v) setDeleteId(null); }}
        itemLabel="this trustee record (they will be marked inactive)"
        onConfirm={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
