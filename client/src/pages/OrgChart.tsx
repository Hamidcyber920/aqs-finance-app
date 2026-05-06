import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Upload,
  Users,
  Building2,
} from "lucide-react";

type OrgMember = {
  id: number;
  name: string;
  title: string;
  department?: string | null;
  photoUrl?: string | null;
  parentId?: number | null;
  sortOrder: number;
  isActive: boolean;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type TreeNode = OrgMember & { children: TreeNode[] };

function buildTree(members: OrgMember[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  members.forEach((m) => map.set(m.id, { ...m, children: [] }));
  const roots: TreeNode[] = [];
  members.forEach((m) => {
    if (m.parentId && map.has(m.parentId)) {
      map.get(m.parentId)!.children.push(map.get(m.id)!);
    } else {
      roots.push(map.get(m.id)!);
    }
  });
  return roots;
}

// Dept → colour mapping
const DEPT_COLORS: Record<string, string> = {
  "Board of Trustees": "bg-amber-100 text-amber-800 border-amber-200",
  Management: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Operations: "bg-blue-100 text-blue-800 border-blue-200",
  Restaurant: "bg-orange-100 text-orange-800 border-orange-200",
  Reception: "bg-purple-100 text-purple-800 border-purple-200",
};
function deptColor(dept?: string | null) {
  return dept && DEPT_COLORS[dept]
    ? DEPT_COLORS[dept]
    : "bg-slate-100 text-slate-700 border-slate-200";
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ─── Single card ──────────────────────────────────────────────────────────────
function OrgCard({
  node,
  canEdit,
  onEdit,
  onAdd,
  onDelete,
  depth,
}: {
  node: TreeNode;
  canEdit: boolean;
  onEdit: (m: OrgMember) => void;
  onAdd: (parentId: number) => void;
  onDelete: (id: number) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <div className="relative group">
        <div
          className={`
            bg-white border-2 rounded-2xl shadow-md hover:shadow-xl transition-all duration-200
            w-44 sm:w-52 p-4 flex flex-col items-center gap-2 cursor-default
            ${depth === 0 ? "border-amber-400" : depth === 1 ? "border-emerald-400" : "border-slate-200"}
          `}
        >
          {/* Photo */}
          <div className="relative">
            <Avatar className="h-16 w-16 border-4 border-white shadow-md">
              <AvatarImage src={node.photoUrl ?? undefined} alt={node.name} />
              <AvatarFallback
                className={`text-lg font-bold ${
                  depth === 0
                    ? "bg-amber-500 text-white"
                    : depth === 1
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-500 text-white"
                }`}
              >
                {initials(node.name)}
              </AvatarFallback>
            </Avatar>
          </div>
          {/* Name & title */}
          <div className="text-center">
            <p className="font-semibold text-sm text-slate-900 leading-tight">
              {node.name}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 leading-tight">
              {node.title}
            </p>
          </div>
          {/* Dept badge */}
          {node.department && (
            <Badge
              variant="outline"
              className={`text-xs px-2 py-0.5 ${deptColor(node.department)}`}
            >
              {node.department}
            </Badge>
          )}
          {/* Edit actions — visible on hover */}
          {canEdit && (
            <div className="absolute -top-2 -right-2 hidden group-hover:flex gap-1">
              <button
                onClick={() => onEdit(node)}
                className="bg-white border border-slate-200 rounded-full p-1 shadow hover:bg-slate-50 transition"
                title="Edit"
              >
                <Pencil className="h-3 w-3 text-slate-600" />
              </button>
              <button
                onClick={() => onAdd(node.id)}
                className="bg-emerald-600 rounded-full p-1 shadow hover:bg-emerald-700 transition"
                title="Add report"
              >
                <Plus className="h-3 w-3 text-white" />
              </button>
              <button
                onClick={() => onDelete(node.id)}
                className="bg-white border border-red-200 rounded-full p-1 shadow hover:bg-red-50 transition"
                title="Remove"
              >
                <Trash2 className="h-3 w-3 text-red-500" />
              </button>
            </div>
          )}
        </div>
        {/* Expand / collapse toggle */}
        {hasChildren && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-white border border-slate-200 rounded-full p-0.5 shadow hover:bg-slate-50 transition z-10"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
            )}
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="mt-8 flex flex-row flex-wrap justify-center gap-6 relative">
          {/* Horizontal connector line */}
          {node.children.length > 1 && (
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 h-px bg-slate-300"
              style={{
                width: `calc(${node.children.length - 1} * (13rem + 1.5rem))`,
                maxWidth: "90vw",
              }}
            />
          )}
          {node.children.map((child) => (
            <div key={child.id} className="flex flex-col items-center">
              {/* Vertical connector */}
              <div className="w-px h-8 bg-slate-300" />
              <OrgCard
                node={child}
                canEdit={canEdit}
                onEdit={onEdit}
                onAdd={onAdd}
                onDelete={onDelete}
                depth={depth + 1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function OrgChartPage() {
  const { user } = useAuth();
  const canEdit =
    user?.role === "superadmin" || user?.role === "trustee";

  const { data: members = [], refetch } = trpc.orgChart.list.useQuery();
  const upsertMutation = trpc.orgChart.upsert.useMutation({
    onSuccess: () => { refetch(); toast.success("Saved"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const removeMutation = trpc.orgChart.remove.useMutation({
    onSuccess: () => { refetch(); toast.success("Removed"); },
    onError: (e) => toast.error(e.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<OrgMember> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const tree = buildTree(members as OrgMember[]);

  function openAdd(parentId?: number) {
    setEditing({ parentId: parentId ?? null, sortOrder: 0 });
    setDialogOpen(true);
  }
  function openEdit(m: OrgMember) {
    setEditing({ ...m });
    setDialogOpen(true);
  }
  function handleDelete(id: number) {
    if (confirm("Remove this person from the org chart?")) {
      removeMutation.mutate({ id });
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (json.url) {
        setEditing((prev) => prev ? { ...prev, photoUrl: json.url } : prev);
        toast.success("Photo uploaded");
      } else {
        toast.error("Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleSave() {
    if (!editing?.name || !editing?.title) {
      toast.error("Name and title are required");
      return;
    }
    upsertMutation.mutate({
      id: editing.id,
      name: editing.name!,
      title: editing.title!,
      department: editing.department ?? undefined,
      photoUrl: editing.photoUrl ?? undefined,
      parentId: editing.parentId ?? null,
      sortOrder: editing.sortOrder ?? 0,
      notes: editing.notes ?? undefined,
    });
  }

  // All members for parent selector
  const allMembers = members as OrgMember[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-emerald-600" />
            Organisation Chart
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Abdullah Quilliam Society — staff structure
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => openAdd(undefined)}
            className="bg-emerald-700 hover:bg-emerald-800 text-white gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Person
          </Button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(DEPT_COLORS).map(([dept, cls]) => (
          <Badge key={dept} variant="outline" className={`${cls} gap-1`}>
            <Building2 className="h-3 w-3" />
            {dept}
          </Badge>
        ))}
      </div>

      {/* Tree */}
      <div className="overflow-x-auto pb-8">
        <div className="min-w-max flex flex-col items-center gap-8 pt-4">
          {tree.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No members yet</p>
              {canEdit && (
                <Button
                  onClick={() => openAdd()}
                  variant="outline"
                  className="mt-4"
                >
                  Add first person
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Trustees row (roots) */}
              <div className="flex flex-row flex-wrap justify-center gap-6">
                {tree.map((root) => (
                  <OrgCard
                    key={root.id}
                    node={root}
                    canEdit={canEdit}
                    onEdit={openEdit}
                    onAdd={openAdd}
                    onDelete={handleDelete}
                    depth={0}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? "Edit Person" : "Add Person"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Photo */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border-2 border-slate-200">
                <AvatarImage src={editing?.photoUrl ?? undefined} />
                <AvatarFallback className="bg-slate-200 text-slate-600 text-lg font-bold">
                  {editing?.name ? initials(editing.name) : "?"}
                </AvatarFallback>
              </Avatar>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="gap-2"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? "Uploading…" : "Upload Photo"}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  JPG, PNG — max 5 MB
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Full Name *</Label>
                <Input
                  value={editing?.name ?? ""}
                  onChange={(e) =>
                    setEditing((p) => p ? { ...p, name: e.target.value } : p)
                  }
                  placeholder="e.g. Dr Abdul Hamid"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Title / Role *</Label>
                <Input
                  value={editing?.title ?? ""}
                  onChange={(e) =>
                    setEditing((p) => p ? { ...p, title: e.target.value } : p)
                  }
                  placeholder="e.g. Trustee & Super Admin"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Department</Label>
                <Input
                  value={editing?.department ?? ""}
                  onChange={(e) =>
                    setEditing((p) => p ? { ...p, department: e.target.value } : p)
                  }
                  placeholder="e.g. Board of Trustees"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Reports To</Label>
                <Select
                  value={editing?.parentId?.toString() ?? "none"}
                  onValueChange={(v) =>
                    setEditing((p) =>
                      p ? { ...p, parentId: v === "none" ? null : parseInt(v) } : p
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Top-level (no parent)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Top-level (no parent) —</SelectItem>
                    {allMembers
                      .filter((m) => m.id !== editing?.id)
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id.toString()}>
                          {m.name} — {m.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={editing?.sortOrder ?? 0}
                  onChange={(e) =>
                    setEditing((p) =>
                      p ? { ...p, sortOrder: parseInt(e.target.value) || 0 } : p
                    )
                  }
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={editing?.notes ?? ""}
                onChange={(e) =>
                  setEditing((p) => p ? { ...p, notes: e.target.value } : p)
                }
                rows={2}
                placeholder="Optional notes…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={upsertMutation.isPending}
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              {upsertMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
