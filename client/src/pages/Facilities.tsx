import { useState, useEffect } from "react";
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
import { Building2, CalendarDays, Plus, Users, PoundSterling, CheckCircle2, Clock, XCircle, RefreshCw, Edit2, Download, FileText } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  enquiry: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  confirmed: "bg-green-500/20 text-green-300 border-green-500/30",
  cancelled: "bg-red-500/20 text-red-300 border-red-500/30",
  completed: "bg-blue-500/20 text-blue-300 border-blue-500/30",
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
  const create = trpc.facilities.createBooking.useMutation({
    onSuccess: () => { toast.success("Booking created"); onCreated(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

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
          <div><Label>Booking Title *</Label><Input className="bg-white/5 border-white/10" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><Label>Booker Name *</Label><Input className="bg-white/5 border-white/10" value={form.bookerName} onChange={e => setForm(f => ({ ...f, bookerName: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Email</Label><Input className="bg-white/5 border-white/10" value={form.bookerEmail} onChange={e => setForm(f => ({ ...f, bookerEmail: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input className="bg-white/5 border-white/10" value={form.bookerPhone} onChange={e => setForm(f => ({ ...f, bookerPhone: e.target.value }))} /></div>
          </div>
          <div><Label>Organisation</Label><Input className="bg-white/5 border-white/10" value={form.organisation} onChange={e => setForm(f => ({ ...f, organisation: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Rate Type</Label>
              <Select value={form.rateType} onValueChange={v => setForm(f => ({ ...f, rateType: v as any }))}>
                <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                  {["hourly", "half_day", "full_day", "custom", "free"].map(r => <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Agreed Amount (£)</Label><Input type="number" className="bg-white/5 border-white/10" value={form.agreedAmount} onChange={e => setForm(f => ({ ...f, agreedAmount: e.target.value }))} /></div>
          </div>
          <div><Label>Attendees</Label><Input type="number" className="bg-white/5 border-white/10" value={form.attendeeCount} onChange={e => setForm(f => ({ ...f, attendeeCount: e.target.value }))} /></div>
          <div><Label>Purpose / Notes</Label><Textarea className="bg-white/5 border-white/10" value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} /></div>
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
          >
            {create.isPending ? "Creating..." : "Create Booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Room Dialog ──────────────────────────────────────────────────────────
function NewRoomDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", building: "QLH", capacity: "", description: "", amenities: "", hourlyRate: "", halfDayRate: "", fullDayRate: "", notes: "" });
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
                {["QLH", "Bistro 87", "Accommodation", "Other"].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Facilities() {
  const [tab, setTab] = useState("bookings");
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split("T")[0]; });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
  }, [tab]);

  const utils = trpc.useUtils();
  const stats = trpc.facilities.stats.useQuery();
  const rooms = trpc.facilities.listRooms.useQuery({ activeOnly: false });
  const bookings = trpc.facilities.listBookings.useQuery({ limit: 100 });

  const updateBooking = trpc.facilities.updateBooking.useMutation({
    onSuccess: () => { toast.success("Booking updated"); utils.facilities.listBookings.invalidate(); utils.facilities.stats.invalidate(); setSelectedBooking(null); },
    onError: (e) => toast.error(e.message),
  });

  const refetch = () => { utils.facilities.listBookings.invalidate(); utils.facilities.stats.invalidate(); utils.facilities.listRooms.invalidate(); };

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
            <p className="text-sm text-white/70">Manage bookable spaces across QLH, Bistro 87 & Accommodation</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-32 h-8 text-xs bg-white/10 border-white/30 text-white" />
          <span className="text-xs text-white/70">to</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-32 h-8 text-xs bg-white/10 border-white/30 text-white" />
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs border-white/20 text-white hover:bg-white/10" onClick={() => {
            const allBookings = bookings.data ?? [];
            const filtered = allBookings.filter((b: any) => { const d = new Date(b.startDatetime); return d >= new Date(dateFrom) && d <= new Date(dateTo + "T23:59:59"); });
            if (!filtered.length) { toast.info("No bookings in selected range"); return; }
            const rows = filtered.map((b: any) => `${fmtDt(b.startDatetime)},${fmtDt(b.endDatetime)},${b.roomName || ""},${b.title || ""},${b.bookerName || ""},${b.status},${b.paymentStatus || ""},${fmt(b.agreedAmount)}`);
            const csv = "Start,End,Room,Title,Booker,Status,Payment,Amount\n" + rows.join("\n");
            const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `bookings_${dateFrom}_to_${dateTo}.csv`; a.click(); URL.revokeObjectURL(url);
          }}><Download className="w-3 h-3" /> CSV</Button>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs border-white/20 text-white hover:bg-white/10" onClick={() => {
            const allBookings = bookings.data ?? [];
            const filtered = allBookings.filter((b: any) => { const d = new Date(b.startDatetime); return d >= new Date(dateFrom) && d <= new Date(dateTo + "T23:59:59"); });
            if (!filtered.length) { toast.info("No bookings in selected range"); return; }
            const total = filtered.reduce((s: number, b: any) => s + Number(b.agreedAmount ?? 0), 0);
            let html = `<html><head><title>Bookings ${dateFrom} to ${dateTo}</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:15px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#f5f5f5;font-weight:600}.total{font-weight:bold;font-size:14px;margin-top:10px}</style></head><body>`;
            html += `<h2>Facilities & Bookings Report</h2><p>${dateFrom} to ${dateTo}</p><p class="total">Total Revenue: \u00a3${total.toFixed(2)} | Bookings: ${filtered.length}</p>`;
            html += `<table><tr><th>Start</th><th>End</th><th>Room</th><th>Title</th><th>Booker</th><th>Status</th><th>Payment</th><th>Amount</th></tr>`;
            filtered.forEach((b: any) => { html += `<tr><td>${fmtDt(b.startDatetime)}</td><td>${fmtDt(b.endDatetime)}</td><td>${b.roomName || ""}</td><td>${b.title || ""}</td><td>${b.bookerName || ""}</td><td>${b.status}</td><td>${b.paymentStatus || ""}</td><td>${fmt(b.agreedAmount)}</td></tr>`; });
            html += `</table></body></html>`;
            const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); w.print(); }
          }}><FileText className="w-3 h-3" /> PDF</Button>
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

      {/* Upcoming */}
      {stats.data?.upcoming && stats.data.upcoming.length > 0 && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-white/90">Upcoming Bookings</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.data.upcoming.map((u: any) => (
                <div key={u.booking.id} className="flex flex-wrap items-start justify-between gap-1 p-2 rounded-lg bg-white/5 text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{u.booking.title}</span>
                    <span className="text-white/70 ml-2">{u.roomName}</span>
                  </div>
                  <span className="text-white/80 text-xs whitespace-nowrap">{fmtDt(u.booking.startDatetime)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList className="bg-white/5 border border-white/10 inline-flex w-max min-w-full h-auto gap-1 p-1">
            <TabsTrigger value="bookings" className="whitespace-nowrap data-[state=active]:bg-indigo-600">Bookings</TabsTrigger>
            <TabsTrigger value="rooms" className="whitespace-nowrap data-[state=active]:bg-indigo-600">Rooms</TabsTrigger>
          </TabsList>
        </div>

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
      {showNewRoom && <NewRoomDialog onClose={() => setShowNewRoom(false)} onCreated={refetch} />}
    </div>
  );
}
