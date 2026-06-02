import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Clock, Users, Building2, PoundSterling, RefreshCw, ChevronRight, MapPin, Timer } from "lucide-react";
import { useLocation } from "wouter";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(v: string | Date | null | undefined) {
  if (!v) return "-";
  return new Date(v).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function fmtTime(v: string | Date | null | undefined) {
  if (!v) return "-";
  return new Date(v).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmt(v: string | null | undefined) {
  if (!v) return null;
  const n = parseFloat(v);
  return isNaN(n) || n === 0 ? null : `£${n.toFixed(2)}`;
}

/** Live countdown: returns { days, hours, minutes, seconds, label, urgent } */
function useCountdown(startDatetime: string | Date) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const start = new Date(startDatetime).getTime();
  const diffMs = start - now;

  if (diffMs <= 0) {
    const endMs = start - now; // negative
    const absMs = Math.abs(endMs);
    const h = Math.floor(absMs / 3600000);
    return { days: 0, hours: h, minutes: Math.floor((absMs % 3600000) / 60000), seconds: Math.floor((absMs % 60000) / 1000), label: "In progress", urgent: true, inProgress: true };
  }

  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);

  let label = "";
  if (days === 0 && hours === 0) label = `${minutes}m ${seconds}s`;
  else if (days === 0) label = `${hours}h ${minutes}m`;
  else if (days === 1) label = "Tomorrow";
  else label = `${days} days`;

  return { days, hours, minutes, seconds, label, urgent: days === 0, inProgress: false };
}

// ─── Countdown Ring ───────────────────────────────────────────────────────────
function CountdownRing({ startDatetime, endDatetime }: { startDatetime: string | Date; endDatetime: string | Date }) {
  const cd = useCountdown(startDatetime);

  const ringColor = cd.inProgress
    ? "text-blue-400 border-blue-400/40"
    : cd.days === 0
    ? "text-red-400 border-red-400/40"
    : cd.days === 1
    ? "text-orange-400 border-orange-400/40"
    : cd.days <= 3
    ? "text-yellow-400 border-yellow-400/40"
    : "text-green-400 border-green-400/40";

  const bgColor = cd.inProgress
    ? "bg-blue-500/10"
    : cd.days === 0
    ? "bg-red-500/10"
    : cd.days === 1
    ? "bg-orange-500/10"
    : cd.days <= 3
    ? "bg-yellow-500/10"
    : "bg-green-500/10";

  return (
    <div className={`flex flex-col items-center justify-center w-20 h-20 rounded-full border-2 ${ringColor} ${bgColor} shrink-0`}>
      {cd.inProgress ? (
        <>
          <Timer className={`w-5 h-5 ${ringColor.split(" ")[0]} mb-0.5`} />
          <span className={`text-xs font-bold ${ringColor.split(" ")[0]}`}>Live</span>
        </>
      ) : cd.days === 0 ? (
        <>
          <span className={`text-lg font-black leading-none ${ringColor.split(" ")[0]}`}>{cd.hours}h</span>
          <span className={`text-xs font-semibold ${ringColor.split(" ")[0]}`}>{cd.minutes}m</span>
        </>
      ) : (
        <>
          <span className={`text-2xl font-black leading-none ${ringColor.split(" ")[0]}`}>{cd.days}</span>
          <span className={`text-xs font-semibold ${ringColor.split(" ")[0]}`}>days</span>
        </>
      )}
    </div>
  );
}

// ─── Booking Card ─────────────────────────────────────────────────────────────
function BookingCard({ booking, onClick }: { booking: any; onClick: () => void }) {
  const cd = useCountdown(booking.startDatetime);

  const badgeColor = cd.inProgress
    ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
    : cd.days === 0
    ? "bg-red-500/20 text-red-300 border-red-500/30"
    : cd.days === 1
    ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
    : cd.days <= 3
    ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
    : "bg-green-500/20 text-green-300 border-green-500/30";

  const statusColor: Record<string, string> = {
    confirmed: "bg-green-500/20 text-green-300 border-green-500/30",
    pending: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    enquiry: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  };

  return (
    <Card
      className="bg-white/5 border-white/10 hover:border-white/20 transition-all cursor-pointer group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Countdown ring */}
          <CountdownRing startDatetime={booking.startDatetime} endDatetime={booking.endDatetime} />

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-white text-base leading-tight">{booking.title}</h3>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge className={`text-xs border ${badgeColor}`}>{cd.label}</Badge>
                  <Badge className={`text-xs border ${statusColor[booking.status] || "bg-white/10 text-white/70 border-white/20"}`}>{booking.status}</Badge>
                </div>
              </div>
              {fmt(booking.agreedAmount) && (
                <div className="flex items-center gap-1 text-emerald-400 font-mono font-semibold text-sm shrink-0">
                  <PoundSterling className="w-3.5 h-3.5" />
                  {fmt(booking.agreedAmount)?.replace("£", "")}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-white/70">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">{booking.roomName || "Room TBC"}{booking.building ? ` · ${booking.building}` : ""}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">{booking.bookerName}{booking.attendeeCount ? ` · ${booking.attendeeCount} guests` : ""}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>{fmtDate(booking.startDatetime)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>{fmtTime(booking.startDatetime)} – {fmtTime(booking.endDatetime)}</span>
              </div>
            </div>
          </div>

          <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors shrink-0 mt-1 hidden sm:block" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Live Ticker ──────────────────────────────────────────────────────────────
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function UpcomingBookingsPage() {
  const [, navigate] = useLocation();
  const [days, setDays] = useState(7);
  const [filterBuilding, setFilterBuilding] = useState("all");

  const { data: bookings, isLoading, refetch, dataUpdatedAt } = trpc.facilities.upcomingBookings.useQuery(
    { days },
    { refetchInterval: 60000 } // auto-refresh every minute
  );
  const rooms = trpc.facilities.listRooms.useQuery({ activeOnly: true });

  // Derive unique buildings from bookings
  const buildings = Array.from(new Set((bookings || []).map((b: any) => b.building).filter(Boolean)));

  const filtered = (bookings || []).filter((b: any) =>
    filterBuilding === "all" || b.building === filterBuilding
  );

  // Group by day
  const grouped: Record<string, any[]> = {};
  for (const b of filtered) {
    const key = new Date(b.startDatetime).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(b);
  }

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;

  return (
    <div className="p-4 md:p-6 space-y-6 text-white min-h-screen" style={{ background: "linear-gradient(160deg, #0E2244 0%, #0A192F 50%, #070F1E 100%)" }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <Timer className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Upcoming Bookings</h1>
            <p className="text-sm text-white/60">
              Live countdown for confirmed & pending bookings
              {lastUpdated && <span className="ml-2 text-white/40">· Updated {lastUpdated}</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {/* Day range selector */}
          <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
            <SelectTrigger className="bg-white/10 border-white/20 text-white h-8 text-xs w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
              <SelectItem value="3">Next 3 days</SelectItem>
              <SelectItem value="7">Next 7 days</SelectItem>
              <SelectItem value="14">Next 14 days</SelectItem>
              <SelectItem value="30">Next 30 days</SelectItem>
            </SelectContent>
          </Select>

          {/* Building filter */}
          {buildings.length > 0 && (
            <Select value={filterBuilding} onValueChange={setFilterBuilding}>
              <SelectTrigger className="bg-white/10 border-white/20 text-white h-8 text-xs w-36">
                <SelectValue placeholder="All buildings" />
              </SelectTrigger>
              <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                <SelectItem value="all">All buildings</SelectItem>
                {buildings.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 border-white/20 text-white hover:bg-white/10"
            onClick={() => refetch()}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>

          <Button
            size="sm"
            className="h-8 bg-indigo-600 hover:bg-indigo-700"
            onClick={() => navigate("/facilities")}
          >
            <CalendarDays className="w-3.5 h-3.5 mr-1" /> All Bookings
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      {!isLoading && bookings && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total upcoming", value: filtered.length, color: "text-indigo-400" },
            { label: "Today", value: filtered.filter((b: any) => { const d = new Date(b.startDatetime); const t = new Date(); return d.toDateString() === t.toDateString(); }).length, color: "text-red-400" },
            { label: "Tomorrow", value: filtered.filter((b: any) => { const d = new Date(b.startDatetime); const t = new Date(); t.setDate(t.getDate() + 1); return d.toDateString() === t.toDateString(); }).length, color: "text-orange-400" },
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
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-white/60 text-sm">Loading upcoming bookings...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="py-16 text-center">
            <CalendarDays className="w-12 h-12 mx-auto mb-4 text-white/20" />
            <p className="text-white/60 font-medium">No upcoming bookings</p>
            <p className="text-white/40 text-sm mt-1">
              No confirmed or pending bookings in the next {days} days.
            </p>
            <Button
              className="mt-4 bg-indigo-600 hover:bg-indigo-700"
              onClick={() => navigate("/facilities")}
            >
              <CalendarDays className="w-4 h-4 mr-2" /> Go to Facilities
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Grouped by day */}
      {!isLoading && Object.entries(grouped).map(([day, dayBookings]) => {
        const isToday = new Date(dayBookings[0].startDatetime).toDateString() === new Date().toDateString();
        const isTomorrow = (() => { const t = new Date(); t.setDate(t.getDate() + 1); return new Date(dayBookings[0].startDatetime).toDateString() === t.toDateString(); })();

        return (
          <div key={day} className="space-y-3">
            {/* Day header */}
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold
                ${isToday ? "bg-red-500/20 text-red-300 border border-red-500/30" :
                  isTomorrow ? "bg-orange-500/20 text-orange-300 border border-orange-500/30" :
                  "bg-white/10 text-white/80 border border-white/10"}`}>
                <CalendarDays className="w-3.5 h-3.5" />
                {isToday ? "Today — " : isTomorrow ? "Tomorrow — " : ""}{day}
                <span className="ml-1 text-xs opacity-70">{dayBookings.length} booking{dayBookings.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Booking cards */}
            <div className="space-y-3">
              {dayBookings.map((b: any) => (
                <div key={b.id} className="space-y-1">
                  <BookingCard
                    booking={b}
                    onClick={() => navigate("/facilities")}
                  />
                  {/* Live ticker row */}
                  <div className="flex items-center justify-between px-4 py-1.5 rounded-b-lg bg-white/3 border border-t-0 border-white/5 text-xs text-white/50">
                    <span className="flex items-center gap-1.5">
                      <Timer className="w-3 h-3" /> Live countdown:
                    </span>
                    <LiveTicker startDatetime={b.startDatetime} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
