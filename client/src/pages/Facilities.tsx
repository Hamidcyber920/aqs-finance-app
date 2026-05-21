import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Building2, CalendarDays, Plus, Users, PoundSterling, Clock, Edit2,
  Download, FileText, Trash2, Settings, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle2, MapPin, Timer, RefreshCw
} from "lucide-react";
import FacilitiesEnquiries from "./FacilitiesEnquiries";
import { fmtDate } from "@/lib/dateUtils";

const STATUS_COLORS: Record<string, string> = {
  enquiry: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  confirmed: "bg-green-500/20 text-green-300 border-green-500/30",
  cancelled: "bg-red-500/20 text-red-300 border-red-500/30",
  completed: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  pending: "bg-orange-500/20 text-orange-300 border-orange-500/30",
};
const PAY_COLORS: Record<string, string> = {
  unpaid: "bg-red-500/20 text-red-300 border-red-500/30",
  partial: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  paid: "bg-green-500/20 text-green-300 border-green-500/30",
};

function fmt(v: string | null | undefined) {
  if (!v) return "-";
  const n = parseFloat(v);
  return isNaN(n) ? "-" : `£${n.toFixed(2)}`;
}

function fmtDt(v: string | Date | null | undefined) {
  if (!v) return "-";
  return new Date(v).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(v: string | Date | null | undefined) {
  if (!v) return "-";
  return new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Returns a human-readable countdown label */
function countdownLabel(startDatetime: string | Date): string {
  const now = new Date();
  const start = new Date(startDatetime);
  const diffMs = start.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffMs < 0) return "In progress";
  if (diffHours < 1) return "< 1 hour";
  if (diffHours < 24) return `${diffHours}h away`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return `${diffDays} days`;
}

function countdownColor(startDatetime: string | Date): string {
  const now = new Date();
  const start = new Date(startDatetime);
  const diffMs = start.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffMs < 0) return "bg-blue-500/20 text-blue-300 border-blue-500/30";
  if (diffDays === 0) return "bg-red-500/20 text-red-300 border-red-500/30";
  if (diffDays === 1) return "bg-orange-500/20 text-orange-300 border-orange-500/30";
  if (diffDays <= 3) return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
  return "bg-green-500/20 text-green-300 border-green-500/30";
}

// ─── New Booking Dialog ───────────────────────────────────────────────────────
function NewBookingDialog({ rooms, onClose, onCreated }: { rooms: any[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    roomId: "",
    bookerName: "",
    bookerEmail: "",
    bookerPhone: "",
    organisation: "",
    title: "",
    purpose: "",
    startDatetime: "",
    endDatetime: "",
    attendeeCount: "",
    rateType: "hourly" as const,
    agreedAmount: "0",
    internalNotes: "",
  });

  const conflictInput = useMemo(() => {
    if (!form.roomId || !form.startDatetime || !form.endDatetime) return null;
    return {
      roomId: parseInt(form.roomId),
      startDatetime: new Date(form.startDatetime),
      endDatetime: new Date(form.endDatetime),
    };
  }, [form.roomId, form.startDatetime, form.endDatetime]);

  const conflicts = trpc.facilities.checkConflicts.useQuery(
    conflictInput ?? { roomId: 0, startDatetime: new Date(), endDatetime: new Date() },
    { enabled: !!conflictInput }
  );

  const create = trpc.facilities.createBooking.useMutation({
    onSuccess: () => { toast.success("Booking created"); onCreated(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const hasConflict = conflictInput && conflicts.data?.hasConflict;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-[#0d1b2a] border-white/10 text-white">
        <DialogHeader><DialogTitle>New Room Booking</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Room *</Label>
            <Select value={form.roomId} onValueChange={v => setForm(f => ({ ...f, roomId: v }))}>
              <SelectTrigger className="bg-white/5 border-white/10"><SelectValue placeholder="Select room..." /></SelectTrigger>
              <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                {rooms.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name} ({r.building})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Start *</Label><Input type="datetime-local" className="bg-white/5 border-white/10" value={form.startDatetime} onChange={e => setForm(f => ({ ...f, startDatetime: e.target.value }))} /></div>
            <div><Label>End *</Label><Input type="datetime-local" className="bg-white/5 border-white/10" value={form.endDatetime} onChange={e => setForm(f => ({ ...f, endDatetime: e.target.value }))} /></div>
          </div>

          {/* Conflict warning */}
          {hasConflict && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Booking conflict detected!</div>
                <div className="text-xs mt-1 text-red-300/80">
                  {conflicts.data?.conflicts.map((c: any) => (
                    <div key={c.id}>{c.title} — {fmtDt(c.startDatetime)} to {fmtDt(c.endDatetime)}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {conflictInput && !conflicts.isLoading && !hasConflict && form.roomId && form.startDatetime && form.endDatetime && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-300 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> Room is available for this time slot
            </div>
          )}

          <div><Label>Booking Title *</Label><Input className="bg-white/5 border-white/10" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><Label>Booker Name *</Label><Input className="bg-white/5 border-white/10" value={form.bookerName} onChange={e => setForm(f => ({ ...f, bookerName: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Email</Label><Input type="email" className="bg-white/5 border-white/10" value={form.bookerEmail} onChange={e => setForm(f => ({ ...f, bookerEmail: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input className="bg-white/5 border-white/10" value={form.bookerPhone} onChange={e => setForm(f => ({ ...f, bookerPhone: e.target.value }))} /></div>
          </div>
          <div><Label>Organisation</Label><Input className="bg-white/5 border-white/10" value={form.organisation} onChange={e => setForm(f => ({ ...f, organisation: e.target.value }))} /></div>
          <div><Label>Purpose</Label><Textarea className="bg-white/5 border-white/10" rows={2} value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Attendees</Label><Input type="number" className="bg-white/5 border-white/10" value={form.attendeeCount} onChange={e => setForm(f => ({ ...f, attendeeCount: e.target.value }))} /></div>
            <div>
              <Label>Rate Type</Label>
              <Select value={form.rateType} onValueChange={v => setForm(f => ({ ...f, rateType: v as any }))}>
                <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                  {["hourly", "half_day", "full_day", "custom"].map(r => <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Agreed Amount (£)</Label><Input type="number" className="bg-white/5 border-white/10" value={form.agreedAmount} onChange={e => setForm(f => ({ ...f, agreedAmount: e.target.value }))} /></div>
          <div><Label>Internal Notes</Label><Textarea className="bg-white/5 border-white/10" rows={2} value={form.internalNotes} onChange={e => setForm(f => ({ ...f, internalNotes: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => create.mutate({
              roomId: parseInt(form.roomId),
              bookerName: form.bookerName,
              bookerEmail: form.bookerEmail || undefined,
              bookerPhone: form.bookerPhone || undefined,
              organisation: form.organisation || undefined,
              title: form.title,
              purpose: form.purpose || undefined,
              startDatetime: form.startDatetime,
              endDatetime: form.endDatetime,
              attendeeCount: form.attendeeCount ? parseInt(form.attendeeCount) : undefined,
              rateType: form.rateType,
              agreedAmount: form.agreedAmount,
              internalNotes: form.internalNotes || undefined,
            })}
            disabled={create.isPending || !form.roomId || !form.bookerName || !form.title || !form.startDatetime || !form.endDatetime}
            className={hasConflict ? "bg-orange-600 hover:bg-orange-700" : ""}
          >
            {create.isPending ? "Creating..." : hasConflict ? "Create Anyway (Conflict!)" : "Create Booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Room Dialog ──────────────────────────────────────────────────────────
function NewRoomDialog({ buildings, onClose, onCreated }: { buildings: any[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: "",
    building: buildings[0]?.name || "QLH",
    capacity: "",
    description: "",
    amenities: "",
    hourlyRate: "",
    halfDayRate: "",
    fullDayRate: "",
    notes: ""
  });
  const create = trpc.facilities.createRoom.useMutation({
    onSuccess: () => { toast.success("Room created"); onCreated(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-[#0d1b2a] border-white/10 text-white">
        <DialogHeader><DialogTitle>Add Room / Space</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>Name *</Label><Input className="bg-white/5 border-white/10" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div>
            <Label>Building</Label>
            <Select value={form.building} onValueChange={v => setForm(f => ({ ...f, building: v }))}>
              <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                {buildings.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Capacity</Label><Input type="number" className="bg-white/5 border-white/10" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Hourly (£)</Label><Input type="number" className="bg-white/5 border-white/10" value={form.hourlyRate} onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))} /></div>
            <div><Label>Half Day (£)</Label><Input type="number" className="bg-white/5 border-white/10" value={form.halfDayRate} onChange={e => setForm(f => ({ ...f, halfDayRate: e.target.value }))} /></div>
            <div><Label>Full Day (£)</Label><Input type="number" className="bg-white/5 border-white/10" value={form.fullDayRate} onChange={e => setForm(f => ({ ...f, fullDayRate: e.target.value }))} /></div>
          </div>
          <div><Label>Description</Label><Textarea className="bg-white/5 border-white/10" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div><Label>Amenities (comma-separated)</Label><Input className="bg-white/5 border-white/10" value={form.amenities} onChange={e => setForm(f => ({ ...f, amenities: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate({ ...form, capacity: form.capacity ? parseInt(form.capacity) : undefined, hourlyRate: form.hourlyRate || undefined, halfDayRate: form.halfDayRate || undefined, fullDayRate: form.fullDayRate || undefined })} disabled={create.isPending || !form.name}>
            {create.isPending ? "Saving..." : "Add Room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Buildings Management Dialog ──────────────────────────────────────────────
function ManageBuildingsDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const buildings = trpc.facilities.listBuildings.useQuery();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", address: "", notes: "", sortOrder: 0 });
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", address: "", notes: "", sortOrder: 0 });

  const createBuilding = trpc.facilities.createBuilding.useMutation({
    onSuccess: () => { toast.success("Building added"); utils.facilities.listBuildings.invalidate(); setShowAdd(false); setAddForm({ name: "", address: "", notes: "", sortOrder: 0 }); },
    onError: (e) => toast.error(e.message),
  });
  const updateBuilding = trpc.facilities.updateBuilding.useMutation({
    onSuccess: () => { toast.success("Building updated"); utils.facilities.listBuildings.invalidate(); setEditingId(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteBuilding = trpc.facilities.deleteBuilding.useMutation({
    onSuccess: () => { toast.success("Building removed"); utils.facilities.listBuildings.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const startEdit = (b: any) => {
    setEditingId(b.id);
    setEditForm({ name: b.name, address: b.address || "", notes: b.notes || "", sortOrder: b.sortOrder || 0 });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-[#0d1b2a] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-indigo-400" /> Manage Buildings
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-white/60">Add, edit or remove buildings. These appear as options when creating rooms and bookings.</p>

          {buildings.isLoading && <p className="text-white/60 text-sm">Loading...</p>}
          {buildings.data?.map((b: any) => (
            <div key={b.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
              {editingId === b.id ? (
                <div className="space-y-2">
                  <Input className="bg-white/5 border-white/10 text-sm" placeholder="Building name *" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                  <Input className="bg-white/5 border-white/10 text-sm" placeholder="Address (optional)" value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} />
                  <Input className="bg-white/5 border-white/10 text-sm" placeholder="Notes (optional)" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                  <Input type="number" className="bg-white/5 border-white/10 text-sm w-24" placeholder="Sort order" value={editForm.sortOrder} onChange={e => setEditForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateBuilding.mutate({ id: b.id, ...editForm })} disabled={updateBuilding.isPending || !editForm.name}>Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{b.name}</div>
                    {b.address && <div className="text-xs text-white/60 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{b.address}</div>}
                    {b.notes && <div className="text-xs text-white/50 mt-0.5">{b.notes}</div>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-white/10" onClick={() => startEdit(b)}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-red-500/20 text-red-400" onClick={() => {
                      if (confirm(`Remove "${b.name}"? Rooms assigned to it will keep their building label.`)) {
                        deleteBuilding.mutate({ id: b.id });
                      }
                    }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add new building */}
          {showAdd ? (
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-2">
              <div className="text-xs font-semibold text-indigo-300 mb-1">New Building</div>
              <Input className="bg-white/5 border-white/10 text-sm" placeholder="Building name *" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
              <Input className="bg-white/5 border-white/10 text-sm" placeholder="Address (optional)" value={addForm.address} onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))} />
              <Input className="bg-white/5 border-white/10 text-sm" placeholder="Notes (optional)" value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => createBuilding.mutate(addForm)} disabled={createBuilding.isPending || !addForm.name}>Add Building</Button>
                <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-full border-dashed border-white/20 text-white/70 hover:bg-white/5" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add Building
            </Button>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Availability Calendar ────────────────────────────────────────────────────
function AvailabilityCalendar({ bookings, rooms }: { bookings: any[]; rooms: any[] }) {
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [filterRoom, setFilterRoom] = useState<string>("all");

  const monthName = new Date(calYear, calMonth, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
  const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  // Adjust so week starts on Monday
  const startOffset = (firstDay + 6) % 7;

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };

  // Group bookings by day (YYYY-MM-DD)
  const bookingsByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    const filtered = filterRoom === "all" ? bookings : bookings.filter((b: any) => String(b.booking?.roomId || b.roomId) === filterRoom);
    for (const b of filtered) {
      const dt = b.booking?.startDatetime || b.startDatetime;
      if (!dt) continue;
      const key = new Date(dt).toISOString().split("T")[0];
      if (!map[key]) map[key] = [];
      map[key].push(b);
    }
    return map;
  }, [bookings, filterRoom]);

  // Detect conflicts: same room, overlapping times
  const conflictDays = useMemo(() => {
    const days = new Set<string>();
    const filtered = filterRoom === "all" ? bookings : bookings.filter((b: any) => String(b.booking?.roomId || b.roomId) === filterRoom);
    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        const a = filtered[i];
        const b = filtered[j];
        const aRoomId = a.booking?.roomId || a.roomId;
        const bRoomId = b.booking?.roomId || b.roomId;
        if (aRoomId !== bRoomId) continue;
        const aStart = new Date(a.booking?.startDatetime || a.startDatetime).getTime();
        const aEnd = new Date(a.booking?.endDatetime || a.endDatetime).getTime();
        const bStart = new Date(b.booking?.startDatetime || b.startDatetime).getTime();
        const bEnd = new Date(b.booking?.endDatetime || b.endDatetime).getTime();
        if (aStart < bEnd && aEnd > bStart) {
          const key = new Date(aStart).toISOString().split("T")[0];
          days.add(key);
        }
      }
    }
    return days;
  }, [bookings, filterRoom]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedDayKey = selectedDay ? selectedDay.toISOString().split("T")[0] : null;
  const selectedBookings = selectedDayKey ? (bookingsByDay[selectedDayKey] || []) : [];

  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Build calendar grid
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-white/10" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-semibold text-white min-w-[140px] text-center">{monthName}</span>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-white/10" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterRoom} onValueChange={setFilterRoom}>
            <SelectTrigger className="bg-white/5 border-white/10 h-8 text-xs w-40"><SelectValue placeholder="All rooms" /></SelectTrigger>
            <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
              <SelectItem value="all">All rooms</SelectItem>
              {rooms.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-white/60">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-indigo-500/40 inline-block" /> Booked</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500/40 inline-block" /> Conflict</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-white/10 border border-white/20 inline-block" /> Today</span>
      </div>

      {/* Calendar grid */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 bg-white/5">
          {WEEKDAYS.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-white/60">{d}</div>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7 divide-x divide-y divide-white/5">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`empty-${idx}`} className="h-14 md:h-16 bg-white/2" />;
            const dateKey = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayBookings = bookingsByDay[dateKey] || [];
            const isToday = new Date(calYear, calMonth, day).getTime() === today.getTime();
            const isSelected = selectedDayKey === dateKey;
            const hasConflict = conflictDays.has(dateKey);
            const hasBookings = dayBookings.length > 0;

            return (
              <div
                key={dateKey}
                onClick={() => setSelectedDay(isSelected ? null : new Date(calYear, calMonth, day))}
                className={`h-14 md:h-16 p-1 cursor-pointer transition-colors relative
                  ${isSelected ? "bg-indigo-600/30 ring-1 ring-inset ring-indigo-400/50" : "hover:bg-white/5"}
                  ${isToday ? "ring-1 ring-inset ring-white/30" : ""}
                `}
              >
                <div className={`text-xs font-medium mb-0.5 ${isToday ? "text-white font-bold" : "text-white/70"}`}>{day}</div>
                {hasConflict && (
                  <div className="text-[10px] bg-red-500/30 text-red-300 rounded px-1 truncate">⚠ Conflict</div>
                )}
                {!hasConflict && hasBookings && (
                  <div className="space-y-0.5">
                    {dayBookings.slice(0, 2).map((b: any, i: number) => (
                      <div key={i} className="text-[10px] bg-indigo-500/30 text-indigo-200 rounded px-1 truncate leading-tight">
                        {b.booking?.title || b.title || "Booking"}
                      </div>
                    ))}
                    {dayBookings.length > 2 && (
                      <div className="text-[10px] text-white/40">+{dayBookings.length - 2} more</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white/90">
              {selectedDay.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              {selectedBookings.length === 0 && <span className="ml-2 text-xs text-white/50 font-normal">— No bookings</span>}
            </CardTitle>
          </CardHeader>
          {selectedBookings.length > 0 && (
            <CardContent>
              <div className="space-y-2">
                {selectedBookings.map((b: any, i: number) => {
                  const booking = b.booking || b;
                  return (
                    <div key={i} className="flex flex-wrap items-start justify-between gap-2 p-2 rounded-lg bg-white/5 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{booking.title}</div>
                        <div className="text-xs text-white/60">{b.roomName || ""} · {booking.bookerName}</div>
                        <div className="text-xs text-white/50 mt-0.5">{fmtDt(booking.startDatetime)} → {fmtDt(booking.endDatetime)}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge className={`text-xs border ${STATUS_COLORS[booking.status] || ""}`}>{booking.status}</Badge>
                        {booking.agreedAmount && <span className="text-xs font-mono text-white/70">{fmt(booking.agreedAmount)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── 7-Day Upcoming Summary ────────────────────────────────────────────────────
function UpcomingSummary() {
  const upcoming = trpc.facilities.upcomingBookings.useQuery({ days: 7 });

  if (upcoming.isLoading) return (
    <Card className="bg-white/5 border-white/10">
      <CardContent className="p-4 text-white/60 text-sm">Loading upcoming bookings...</CardContent>
    </Card>
  );

  if (!upcoming.data || upcoming.data.length === 0) return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-white/90 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-indigo-400" /> Next 7 Days
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <p className="text-white/50 text-sm">No confirmed bookings in the next 7 days.</p>
      </CardContent>
    </Card>
  );

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-white/90 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-indigo-400" /> Next 7 Days — {upcoming.data.length} booking{upcoming.data.length !== 1 ? "s" : ""}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {upcoming.data.map((b: any) => (
            <div key={b.id} className="flex flex-wrap items-start justify-between gap-2 p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{b.title}</div>
                <div className="text-xs text-white/60 mt-0.5">
                  <span className="font-medium text-white/80">{b.roomName || "Room"}</span>
                  {b.building && <span className="text-white/40"> ({b.building})</span>}
                  {" · "}{b.bookerName}
                </div>
                <div className="text-xs text-white/50 mt-0.5">
                  {fmtDt(b.startDatetime)}
                  {b.attendeeCount && <span className="ml-2"><Users className="w-3 h-3 inline" /> {b.attendeeCount}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge className={`text-xs border ${countdownColor(b.startDatetime)}`}>
                  {countdownLabel(b.startDatetime)}
                </Badge>
                {b.agreedAmount && parseFloat(b.agreedAmount) > 0 && (
                  <span className="text-xs font-mono text-white/60">{fmt(b.agreedAmount)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Upcoming Bookings Tab ────────────────────────────────────────────────────
function useCountdown(startDatetime: string | Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const start = new Date(startDatetime).getTime();
  const diffMs = start - now;
  if (diffMs <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, label: "In progress", urgent: true, inProgress: true };
  }
  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  const label = days === 0 && hours === 0 ? `${minutes}m ${seconds}s` : days === 0 ? `${hours}h ${minutes}m` : days === 1 ? "Tomorrow" : `${days} days`;
  return { days, hours, minutes, seconds, label, urgent: days === 0, inProgress: false };
}

function LiveTicker({ startDatetime }: { startDatetime: string | Date }) {
  const cd = useCountdown(startDatetime);
  if (cd.inProgress) return <span className="text-blue-300 font-mono text-sm animate-pulse">● In progress</span>;
  if (cd.days === 0) {
    return (
      <span className="text-red-300 font-mono text-sm tabular-nums">
        {String(cd.hours).padStart(2, "0")}:{String(cd.minutes).padStart(2, "0")}:{String(cd.seconds).padStart(2, "0")}
      </span>
    );
  }
  return (
    <span className="font-mono text-sm tabular-nums text-white/70">
      {cd.days}d {String(cd.hours).padStart(2, "0")}:{String(cd.minutes).padStart(2, "0")}:{String(cd.seconds).padStart(2, "0")}
    </span>
  );
}

function CountdownRing({ startDatetime }: { startDatetime: string | Date }) {
  const cd = useCountdown(startDatetime);
  const ringColor = cd.inProgress ? "text-blue-400 border-blue-400/40" : cd.days === 0 ? "text-red-400 border-red-400/40" : cd.days === 1 ? "text-orange-400 border-orange-400/40" : cd.days <= 3 ? "text-yellow-400 border-yellow-400/40" : "text-green-400 border-green-400/40";
  const bgColor = cd.inProgress ? "bg-blue-500/10" : cd.days === 0 ? "bg-red-500/10" : cd.days === 1 ? "bg-orange-500/10" : cd.days <= 3 ? "bg-yellow-500/10" : "bg-green-500/10";
  const textColor = ringColor.split(" ")[0];
  return (
    <div className={`flex flex-col items-center justify-center w-16 h-16 rounded-full border-2 ${ringColor} ${bgColor} shrink-0`}>
      {cd.inProgress ? (
        <><Timer className={`w-4 h-4 ${textColor} mb-0.5`} /><span className={`text-xs font-bold ${textColor}`}>Live</span></>
      ) : cd.days === 0 ? (
        <><span className={`text-base font-black leading-none ${textColor}`}>{cd.hours}h</span><span className={`text-xs font-semibold ${textColor}`}>{cd.minutes}m</span></>
      ) : (
        <><span className={`text-xl font-black leading-none ${textColor}`}>{cd.days}</span><span className={`text-xs font-semibold ${textColor}`}>days</span></>
      )}
    </div>
  );
}

function UpcomingBookingsTab() {
  const [days, setDays] = useState(7);
  const [filterBuilding, setFilterBuilding] = useState("all");
  const { data: bookings, isLoading, refetch, dataUpdatedAt } = trpc.facilities.upcomingBookings.useQuery(
    { days },
    { refetchInterval: 60000 }
  );
  const buildings = useMemo(() => Array.from(new Set((bookings || []).map((b: any) => b.building).filter(Boolean))), [bookings]);
  const filtered = useMemo(() => (bookings || []).filter((b: any) => filterBuilding === "all" || b.building === filterBuilding), [bookings, filterBuilding]);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const b of filtered) {
      const key = new Date(b.startDatetime).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
      if (!g[key]) g[key] = [];
      g[key].push(b);
    }
    return g;
  }, [filtered]);

  const today = new Date().toDateString();
  const tomorrow = new Date(Date.now() + 86400000).toDateString();
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-white/60">
          Live countdown for confirmed &amp; pending bookings
          {lastUpdated && <span className="ml-2 text-white/40">· Updated {lastUpdated}</span>}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={String(days)} onChange={e => setDays(Number(e.target.value))}
            className="bg-white/10 border border-white/20 text-white text-xs rounded-md px-2 py-1.5 h-8">
            <option value="3">Next 3 days</option>
            <option value="7">Next 7 days</option>
            <option value="14">Next 14 days</option>
            <option value="30">Next 30 days</option>
          </select>
          {buildings.length > 0 && (
            <select value={filterBuilding} onChange={e => setFilterBuilding(e.target.value)}
              className="bg-white/10 border border-white/20 text-white text-xs rounded-md px-2 py-1.5 h-8">
              <option value="all">All buildings</option>
              {buildings.map((b: string) => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          <Button variant="outline" size="sm" className="h-8 border-white/20 text-white hover:bg-white/10" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      {!isLoading && bookings && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total upcoming", value: filtered.length, color: "text-indigo-400" },
            { label: "Today", value: filtered.filter((b: any) => new Date(b.startDatetime).toDateString() === today).length, color: "text-red-400" },
            { label: "Tomorrow", value: filtered.filter((b: any) => new Date(b.startDatetime).toDateString() === tomorrow).length, color: "text-orange-400" },
            { label: "Total revenue", value: `£${filtered.reduce((s: number, b: any) => s + Number(b.agreedAmount || 0), 0).toFixed(2)}`, color: "text-emerald-400" },
          ].map(s => (
            <Card key={s.label} className="bg-white/5 border-white/10">
              <CardContent className="p-3">
                <div className="text-xs text-white/60 mb-1">{s.label}</div>
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-white/60 text-sm">Loading upcoming bookings...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="py-14 text-center">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 text-white/20" />
            <p className="text-white/60 font-medium">No upcoming bookings</p>
            <p className="text-white/40 text-sm mt-1">No confirmed or pending bookings in the next {days} days.</p>
          </CardContent>
        </Card>
      )}

      {/* Grouped by day */}
      {!isLoading && Object.entries(grouped).map(([day, dayBookings]) => {
        const isToday = new Date((dayBookings as any[])[0].startDatetime).toDateString() === today;
        const isTomorrow = new Date((dayBookings as any[])[0].startDatetime).toDateString() === tomorrow;
        return (
          <div key={day} className="space-y-2">
            {/* Day header */}
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold
                ${isToday ? "bg-red-500/20 text-red-300 border border-red-500/30" :
                  isTomorrow ? "bg-orange-500/20 text-orange-300 border border-orange-500/30" :
                  "bg-white/10 text-white/80 border border-white/10"}`}>
                <CalendarDays className="w-3.5 h-3.5" />
                {isToday ? "Today — " : isTomorrow ? "Tomorrow — " : ""}{day}
                <span className="ml-1 text-xs opacity-70">{(dayBookings as any[]).length} booking{(dayBookings as any[]).length !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex-1 h-px bg-white/10" />
            </div>
            {/* Booking cards */}
            {(dayBookings as any[]).map((b: any) => {
              const cd_days = Math.max(0, Math.floor((new Date(b.startDatetime).getTime() - Date.now()) / 86400000));
              const badgeColor = cd_days === 0 ? "bg-red-500/20 text-red-300 border-red-500/30" : cd_days === 1 ? "bg-orange-500/20 text-orange-300 border-orange-500/30" : cd_days <= 3 ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" : "bg-green-500/20 text-green-300 border-green-500/30";
              return (
                <div key={b.id} className="space-y-0">
                  <Card className="bg-white/5 border-white/10 hover:border-white/20 transition-all rounded-b-none border-b-0">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <CountdownRing startDatetime={b.startDatetime} />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="font-semibold text-white text-sm leading-tight">{b.title}</h3>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <Badge className={`text-xs border ${badgeColor}`}>{countdownLabel(b.startDatetime)}</Badge>
                                <Badge className={`text-xs border ${STATUS_COLORS[b.status] || "bg-white/10 text-white/70 border-white/20"}`}>{b.status}</Badge>
                              </div>
                            </div>
                            {b.agreedAmount && parseFloat(b.agreedAmount) > 0 && (
                              <span className="text-emerald-400 font-mono font-semibold text-sm shrink-0">{fmt(b.agreedAmount)}</span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-white/60">
                            <div className="flex items-center gap-1.5"><Building2 className="w-3 h-3 text-indigo-400" />{b.roomName || "Room TBC"}{b.building ? ` · ${b.building}` : ""}</div>
                            <div className="flex items-center gap-1.5"><Users className="w-3 h-3 text-indigo-400" />{b.bookerName}{b.attendeeCount ? ` · ${b.attendeeCount} guests` : ""}</div>
                            <div className="flex items-center gap-1.5"><CalendarDays className="w-3 h-3 text-indigo-400" />{new Date(b.startDatetime).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}</div>
                            <div className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-indigo-400" />{new Date(b.startDatetime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} – {new Date(b.endDatetime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  {/* Live ticker */}
                  <div className="flex items-center justify-between px-4 py-1.5 rounded-b-lg bg-white/3 border border-t-0 border-white/5 text-xs text-white/50">
                    <span className="flex items-center gap-1.5"><Timer className="w-3 h-3" /> Live countdown:</span>
                    <LiveTicker startDatetime={b.startDatetime} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Facilities() {
  const [tab, setTab] = useState("enquiries");
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [showManageBuildings, setShowManageBuildings] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split("T")[0]; });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const utils = trpc.useUtils();
  const stats = trpc.facilities.stats.useQuery();
  const rooms = trpc.facilities.listRooms.useQuery({ activeOnly: false });
  const buildings = trpc.facilities.listBuildings.useQuery();
  const bookings = trpc.facilities.listBookings.useQuery({ limit: 200 });

  const updateBooking = trpc.facilities.updateBooking.useMutation({
    onSuccess: () => { toast.success("Booking updated"); utils.facilities.listBookings.invalidate(); utils.facilities.stats.invalidate(); setSelectedBooking(null); },
    onError: (e) => toast.error(e.message),
  });

  const refetch = () => {
    utils.facilities.listBookings.invalidate();
    utils.facilities.stats.invalidate();
    utils.facilities.listRooms.invalidate();
    utils.facilities.upcomingBookings.invalidate();
  };

  return (
    <div className="p-4 md:p-6 space-y-6 text-white min-h-screen" style={{ background: "linear-gradient(160deg, #0E2244 0%, #0A192F 50%, #070F1E 100%)" }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Facilities & Room Booking</h1>
            <p className="text-sm text-white/70">Manage bookable spaces across all buildings</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-32 h-8 text-xs bg-white/10 border-white/30 text-white" />
          <span className="text-xs text-white/70">to</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-32 h-8 text-xs bg-white/10 border-white/30 text-white" />
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs border-white/20 text-white hover:bg-white/10" onClick={() => {
            const allBookings = bookings.data ?? [];
            const filtered = allBookings.filter((b: any) => { const d = new Date(b.booking?.startDatetime || b.startDatetime); return d >= new Date(dateFrom) && d <= new Date(dateTo + "T23:59:59"); });
            if (!filtered.length) { toast.info("No bookings in selected range"); return; }
            const rows = filtered.map((b: any) => `${fmtDt(b.booking?.startDatetime || b.startDatetime)},${fmtDt(b.booking?.endDatetime || b.endDatetime)},${b.roomName || ""},${(b.booking?.title || b.title) || ""},${(b.booking?.bookerName || b.bookerName) || ""},${(b.booking?.status || b.status)},${(b.booking?.paymentStatus || b.paymentStatus) || ""},${fmt(b.booking?.agreedAmount || b.agreedAmount)}`);
            const csv = "Start,End,Room,Title,Booker,Status,Payment,Amount\n" + rows.join("\n");
            const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `bookings_${dateFrom}_to_${dateTo}.csv`; a.click(); URL.revokeObjectURL(url);
          }}><Download className="w-3 h-3" /> CSV</Button>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs border-white/20 text-white hover:bg-white/10" onClick={() => {
            const allBookings = bookings.data ?? [];
            const filtered = allBookings.filter((b: any) => { const d = new Date(b.booking?.startDatetime || b.startDatetime); return d >= new Date(dateFrom) && d <= new Date(dateTo + "T23:59:59"); });
            if (!filtered.length) { toast.info("No bookings in selected range"); return; }
            const total = filtered.reduce((s: number, b: any) => s + Number(b.booking?.agreedAmount || b.agreedAmount || 0), 0);
            let html = `<html><head><title>Bookings ${dateFrom} to ${dateTo}</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:15px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#f5f5f5;font-weight:600}.total{font-weight:bold;font-size:14px;margin-top:10px}</style></head><body>`;
            html += `<h2>Facilities & Bookings Report</h2><p>${dateFrom} to ${dateTo}</p><p class="total">Total Revenue: \u00a3${total.toFixed(2)} | Bookings: ${filtered.length}</p>`;
            html += `<table><tr><th>Start</th><th>End</th><th>Room</th><th>Title</th><th>Booker</th><th>Status</th><th>Payment</th><th>Amount</th></tr>`;
            filtered.forEach((b: any) => { html += `<tr><td>${fmtDt(b.booking?.startDatetime || b.startDatetime)}</td><td>${fmtDt(b.booking?.endDatetime || b.endDatetime)}</td><td>${b.roomName || ""}</td><td>${b.booking?.title || b.title || ""}</td><td>${b.booking?.bookerName || b.bookerName || ""}</td><td>${b.booking?.status || b.status}</td><td>${b.booking?.paymentStatus || b.paymentStatus || ""}</td><td>${fmt(b.booking?.agreedAmount || b.agreedAmount)}</td></tr>`; });
            html += `</table></body></html>`;
            const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); w.print(); }
          }}><FileText className="w-3 h-3" /> PDF</Button>
          <Button size="sm" variant="outline" onClick={() => setShowManageBuildings(true)} className="border-white/20 text-white hover:bg-white/10">
            <Settings className="w-4 h-4 mr-1" /> Buildings
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowNewRoom(true)} className="border-white/20 text-white hover:bg-white/10">
            <Plus className="w-4 h-4 mr-1" /> Add Room
          </Button>
          <Button size="sm" onClick={() => setShowNewBooking(true)} className="bg-indigo-600 hover:bg-indigo-700">
            <CalendarDays className="w-4 h-4 mr-1" /> New Booking
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Active Rooms", value: stats.data.totalRooms, icon: Building2, color: "text-indigo-400" },
            { label: "This Month Bookings", value: stats.data.thisMonthBookings, icon: CalendarDays, color: "text-green-400" },
            { label: "This Month Revenue", value: `£${parseFloat(stats.data.thisMonthRevenue || "0").toFixed(2)}`, icon: PoundSterling, color: "text-emerald-400" },
            { label: "Pending Enquiries", value: stats.data.pendingEnquiries, icon: Clock, color: "text-yellow-400" },
          ].map(s => (
            <Card key={s.label} className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                  <span className="text-xs text-white/70 font-medium">{s.label}</span>
                </div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList className="bg-white/5 border border-white/10 inline-flex w-max min-w-full h-auto gap-1 p-1">
            <TabsTrigger value="enquiries" className="whitespace-nowrap data-[state=active]:bg-indigo-600">Enquiries</TabsTrigger>
            <TabsTrigger value="bookings" className="whitespace-nowrap data-[state=active]:bg-indigo-600">Bookings</TabsTrigger>
            <TabsTrigger value="upcoming" className="whitespace-nowrap data-[state=active]:bg-indigo-600 flex items-center gap-1"><Timer className="w-3.5 h-3.5" />Upcoming</TabsTrigger>
            <TabsTrigger value="calendar" className="whitespace-nowrap data-[state=active]:bg-indigo-600">Calendar</TabsTrigger>
            <TabsTrigger value="rooms" className="whitespace-nowrap data-[state=active]:bg-indigo-600">Rooms</TabsTrigger>
          </TabsList>
        </div>

        {/* Enquiries Tab */}
        <TabsContent value="enquiries" className="mt-4">
          <FacilitiesEnquiries rooms={rooms.data || []} />
        </TabsContent>

        {/* Bookings Tab */}
        <TabsContent value="bookings" className="mt-4">
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  {["Room", "Title", "Booker", "Start", "End", "Amount", "Status", "Payment", ""].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-white/70 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bookings.isLoading && (
                  <tr><td colSpan={9} className="text-center py-8 text-white/60">Loading...</td></tr>
                )}
                {!bookings.isLoading && (!bookings.data || bookings.data.length === 0) && (
                  <tr><td colSpan={9} className="text-center py-8 text-white/60">No bookings yet. Create the first one.</td></tr>
                )}
                {bookings.data?.map((row: any) => (
                  <tr key={row.booking.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium">{row.roomName || "-"}</span>
                      {row.building && <span className="ml-1 text-xs text-white/60">({row.building})</span>}
                    </td>
                    <td className="px-3 py-2 max-w-[180px] truncate">{row.booking.title}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div>{row.booking.bookerName}</div>
                      {row.booking.organisation && <div className="text-xs text-white/60">{row.booking.organisation}</div>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDt(row.booking.startDatetime)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDt(row.booking.endDatetime)}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono">{fmt(row.booking.agreedAmount)}</td>
                    <td className="px-3 py-2">
                      <Badge className={`text-xs border ${STATUS_COLORS[row.booking.status] || ""}`}>{row.booking.status}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={`text-xs border ${PAY_COLORS[row.booking.paymentStatus] || ""}`}>{row.booking.paymentStatus}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-white/10" onClick={() => setSelectedBooking(row)}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Upcoming Bookings Tab */}
        <TabsContent value="upcoming" className="mt-4">
          <UpcomingBookingsTab />
        </TabsContent>

        {/* Calendar Tab */}
        <TabsContent value="calendar" className="mt-4">
          <AvailabilityCalendar bookings={bookings.data || []} rooms={rooms.data || []} />
        </TabsContent>

        {/* Rooms Tab */}
        <TabsContent value="rooms" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.isLoading && <p className="text-white/60 col-span-3">Loading rooms...</p>}
            {rooms.data?.map((room: any) => (
              <Card key={room.id} className={`bg-white/5 border-white/10 ${!room.isActive ? "opacity-50" : ""}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">{room.name}</div>
                      <div className="text-xs text-white/70">{room.building}</div>
                    </div>
                    {!room.isActive && <Badge className="text-xs bg-red-500/20 text-red-300 border-red-500/30">Inactive</Badge>}
                  </div>
                  {room.capacity && (
                    <div className="flex items-center gap-1 text-xs text-white/60">
                      <Users className="w-3 h-3" /> Capacity: {room.capacity}
                    </div>
                  )}
                  {room.description && <p className="text-xs text-white/70 line-clamp-2">{room.description}</p>}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {room.hourlyRate && <span className="bg-white/10 px-2 py-0.5 rounded">{fmt(room.hourlyRate)}/hr</span>}
                    {room.halfDayRate && <span className="bg-white/10 px-2 py-0.5 rounded">{fmt(room.halfDayRate)} half-day</span>}
                    {room.fullDayRate && <span className="bg-white/10 px-2 py-0.5 rounded">{fmt(room.fullDayRate)} full-day</span>}
                  </div>
                  {room.amenities && (
                    <div className="flex flex-wrap gap-1">
                      {room.amenities.split(",").map((a: string) => (
                        <span key={a.trim()} className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">{a.trim()}</span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {rooms.data?.length === 0 && (
              <div className="col-span-3 text-center py-12 text-white/60">
                <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No rooms configured yet. Add the first room.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Booking Dialog */}
      {selectedBooking && (
        <Dialog open onOpenChange={() => setSelectedBooking(null)}>
          <DialogContent className="max-w-md bg-[#0d1b2a] border-white/10 text-white">
            <DialogHeader><DialogTitle>Update Booking — {selectedBooking.booking.title}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label>Status</Label>
                <Select defaultValue={selectedBooking.booking.status} onValueChange={v => setSelectedBooking((b: any) => ({ ...b, booking: { ...b.booking, status: v } }))}>
                  <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                    {["enquiry", "confirmed", "cancelled", "completed"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment Status</Label>
                <Select defaultValue={selectedBooking.booking.paymentStatus} onValueChange={v => setSelectedBooking((b: any) => ({ ...b, booking: { ...b.booking, paymentStatus: v } }))}>
                  <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                    {["unpaid", "partial", "paid"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Internal Notes</Label>
                <Textarea className="bg-white/5 border-white/10" defaultValue={selectedBooking.booking.internalNotes || ""} onChange={e => setSelectedBooking((b: any) => ({ ...b, booking: { ...b.booking, internalNotes: e.target.value } }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedBooking(null)}>Cancel</Button>
              <Button onClick={() => updateBooking.mutate({ id: selectedBooking.booking.id, status: selectedBooking.booking.status, paymentStatus: selectedBooking.booking.paymentStatus, internalNotes: selectedBooking.booking.internalNotes })} disabled={updateBooking.isPending}>
                {updateBooking.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showNewBooking && rooms.data && (
        <NewBookingDialog rooms={rooms.data} onClose={() => setShowNewBooking(false)} onCreated={refetch} />
      )}
      {showNewRoom && (
        <NewRoomDialog
          buildings={buildings.data || [{ id: 0, name: "QLH" }, { id: 1, name: "Bistro 87" }, { id: 2, name: "Accommodation" }, { id: 3, name: "Other" }]}
          onClose={() => setShowNewRoom(false)}
          onCreated={refetch}
        />
      )}
      {showManageBuildings && <ManageBuildingsDialog onClose={() => { setShowManageBuildings(false); utils.facilities.listBuildings.invalidate(); }} />}
    </div>
  );
}
