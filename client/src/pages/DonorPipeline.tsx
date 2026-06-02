import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { Handshake, Plus, User, Calendar, ChevronRight, ArrowRight, StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const T = { navy: "#0A192F", purple: "#635BFF", mint: "#00FFC2", white: "#FFFFFF", muted: "rgba(255,255,255,0.5)", border: "rgba(255,255,255,0.08)", glass: "rgba(255,255,255,0.04)", card: "rgba(13,34,64,0.8)" };

const STAGES = [
  { key: "identification", label: "Identification", colour: "#6C63FF", bg: "rgba(108,99,255,0.15)" },
  { key: "qualification", label: "Qualification", colour: "#00B894", bg: "rgba(0,184,148,0.15)" },
  { key: "cultivation", label: "Cultivation", colour: "#FDCB6E", bg: "rgba(253,203,110,0.15)" },
  { key: "solicitation", label: "Solicitation", colour: "#E17055", bg: "rgba(225,112,85,0.15)" },
  { key: "stewardship", label: "Stewardship", colour: "#00FFC2", bg: "rgba(0,255,194,0.15)" },
] as const;

type Stage = typeof STAGES[number]["key"];

function fmtDate(v: string | Date | null | undefined) {
  if (!v) return null;
  return fmtDate(new Date(v));
}

export default function DonorPipelinePage() {
  const [showCreate, setShowCreate] = useState(false);
  const [showMove, setShowMove] = useState<any>(null);
  const [showNotes, setShowNotes] = useState<any>(null);
  const [moveStage, setMoveStage] = useState<Stage>("qualification");

  useEffect(() => {
  }, []);

  const { data: kanban, refetch } = trpc.donorPipeline.kanban.useQuery();
  const { data: notes, refetch: refetchNotes } = trpc.donorPipeline.listNotes.useQuery(
    { donorId: showNotes?.donorId ?? 0 },
    { enabled: !!showNotes?.donorId }
  );

  const createMutation = trpc.donorPipeline.create.useMutation({
    onSuccess: () => { toast.success("Added to pipeline"); setShowCreate(false); refetch(); createForm.reset(); },
    onError: (e) => toast.error(e.message),
  });

  const moveMutation = trpc.donorPipeline.moveStage.useMutation({
    onSuccess: () => { toast.success("Stage updated"); setShowMove(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const addNoteMutation = trpc.donorPipeline.addNote.useMutation({
    onSuccess: () => { toast.success("Note added"); noteForm.reset(); refetchNotes(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteNoteMutation = trpc.donorPipeline.deleteNote.useMutation({
    onSuccess: () => { refetchNotes(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.donorPipeline.delete.useMutation({
    onSuccess: () => { toast.success("Removed from pipeline"); setShowMove(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const createForm = useForm<any>({ defaultValues: { stage: "identification" } });
  const noteForm = useForm<any>();

  const board: Record<string, any[]> = kanban ?? {};

  return (
      <div className="min-h-screen p-6" style={{ background: "linear-gradient(135deg, #0A192F 0%, #0f2040 100%)" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(99,91,255,0.2)" }}>
              <Handshake className="w-5 h-5" style={{ color: T.purple }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Cultivation Pipeline</h1>
              <p className="text-xs" style={{ color: T.muted }}>Major donor relationship management — 5-stage Kanban</p>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2" style={{ background: T.purple }}>
            <Plus className="w-4 h-4" /> Add Donor
          </Button>
        </div>

        {/* Kanban Board */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto">
          {STAGES.map(stage => {
            const cards: any[] = board[stage.key] ?? [];
            return (
              <div key={stage.key} className="flex flex-col min-w-[220px]">
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: stage.colour }} />
                    <span className="text-xs font-semibold text-white">{stage.label}</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: stage.bg, color: stage.colour }}>{cards.length}</span>
                </div>
                <div className="flex flex-col gap-3 min-h-[200px] p-2 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}` }}>
                  {cards.map((card: any) => (
                    <div key={card.id} className="rounded-lg p-3 cursor-pointer hover:scale-[1.02] transition-transform"
                      style={{ background: T.card, border: `1px solid ${T.border}` }}
                      onClick={() => setShowMove(card)}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-white text-sm font-medium leading-tight">{card.donorName ?? `Donor #${card.donorId}`}</p>
                        <Button size="icon" variant="ghost" className="w-6 h-6 shrink-0 opacity-60 hover:opacity-100"
                          onClick={e => { e.stopPropagation(); setShowNotes(card); }}>
                          <StickyNote className="w-3 h-3 text-white" />
                        </Button>
                      </div>
                      {card.targetAmount && (
                        <p className="text-xs mb-1" style={{ color: T.mint }}>Target: £{parseFloat(card.targetAmount).toLocaleString()}</p>
                      )}
                      {card.nextAction && (
                        <p className="text-xs" style={{ color: T.muted }}>→ {card.nextAction}</p>
                      )}
                      {card.nextActionDate && (
                        <p className="text-xs mt-1" style={{ color: "#FDCB6E" }}>
                          <Calendar className="w-3 h-3 inline mr-1" />{fmtDate(card.nextActionDate)}
                        </p>
                      )}
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-xs" style={{ color: T.muted }}>No donors</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Create Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-md" style={{ background: "#0F1B2D", border: `1px solid ${T.border}` }}>
            <DialogHeader>
              <DialogTitle className="text-white">Add Donor to Pipeline</DialogTitle>
            </DialogHeader>
            <form onSubmit={createForm.handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-white/70 text-xs">Donor Name</Label>
                  <Input {...createForm.register("donorName")} className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Donor ID *</Label>
                  <Input {...createForm.register("donorId", { required: true, valueAsNumber: true })} type="number" className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Stage</Label>
                  <Select defaultValue="identification" onValueChange={v => createForm.setValue("stage", v)}>
                    <SelectTrigger className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Target Amount (£)</Label>
                  <Input {...createForm.register("targetAmount")} className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
                <div className="col-span-2">
                  <Label className="text-white/70 text-xs">Next Action</Label>
                  <Input {...createForm.register("nextAction")} className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Next Action Date</Label>
                  <Input {...createForm.register("nextActionDate")} type="date" className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                </div>
              </div>
              <div>
                <Label className="text-white/70 text-xs">Notes</Label>
                <Textarea {...createForm.register("notes")} className="text-white mt-1 resize-none" rows={2} style={{ background: T.glass, border: `1px solid ${T.border}` }} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)} style={{ borderColor: T.border }}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending} style={{ background: T.purple }}>
                  {createMutation.isPending ? "Adding…" : "Add to Pipeline"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Move Stage Dialog */}
        <Dialog open={!!showMove} onOpenChange={() => setShowMove(null)}>
          <DialogContent className="max-w-sm" style={{ background: "#0F1B2D", border: `1px solid ${T.border}` }}>
            <DialogHeader>
              <DialogTitle className="text-white">Move Stage — {showMove?.donorName ?? `Donor #${showMove?.donorId}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-white/70 text-xs">Move to Stage</Label>
                <Select defaultValue={showMove?.stage ?? "identification"} onValueChange={v => setMoveStage(v as Stage)}>
                  <SelectTrigger className="text-white mt-1" style={{ background: T.glass, border: `1px solid ${T.border}` }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 justify-between">
                <Button variant="outline" size="sm" className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                  onClick={() => deleteMutation.mutate({ id: showMove?.id })}>
                  <Trash2 className="w-3 h-3 mr-1" /> Remove
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowMove(null)} style={{ borderColor: T.border }}>Cancel</Button>
                  <Button onClick={() => moveMutation.mutate({ id: showMove?.id, stage: moveStage })}
                    disabled={moveMutation.isPending} style={{ background: T.purple }}>
                    <ArrowRight className="w-4 h-4 mr-1" /> Move
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Notes Dialog */}
        <Dialog open={!!showNotes} onOpenChange={() => setShowNotes(null)}>
          <DialogContent className="max-w-md" style={{ background: "#0F1B2D", border: `1px solid ${T.border}` }}>
            <DialogHeader>
              <DialogTitle className="text-white">Notes — {showNotes?.donorName ?? `Donor #${showNotes?.donorId}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="max-h-48 overflow-y-auto space-y-2">
                {(notes ?? []).length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: T.muted }}>No notes yet</p>
                )}
                {(notes ?? []).map((n: any) => (
                  <div key={n.id} className="flex items-start justify-between p-3 rounded-lg" style={{ background: T.glass, border: `1px solid ${T.border}` }}>
                    <div>
                      <p className="text-white text-sm">{n.note}</p>
                      <p className="text-xs mt-1" style={{ color: T.muted }}>{n.createdByName ?? "Unknown"} · {fmtDate(n.createdAt)}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="w-6 h-6 text-red-400 opacity-60 hover:opacity-100"
                      onClick={() => deleteNoteMutation.mutate({ id: n.id })}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <form onSubmit={noteForm.handleSubmit(d => addNoteMutation.mutate({ donorId: showNotes?.donorId, ...d }))} className="flex gap-2">
                <Input {...noteForm.register("note", { required: true })} placeholder="Add a note…" className="text-white flex-1"
                  style={{ background: T.glass, border: `1px solid ${T.border}` }} />
                <Button type="submit" disabled={addNoteMutation.isPending} style={{ background: T.purple }}>Add</Button>
              </form>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
}
