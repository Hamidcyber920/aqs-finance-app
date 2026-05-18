import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Search, Eye, Send, Upload, CheckCircle2, Clock, ArrowRight, FileText, MessageSquare, Camera, Users, Calendar, Utensils, Armchair, Mic, Car, GlassWater, Sparkles, Download, Link, Settings, Mail, MessageCircle, ExternalLink } from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  general_enquiry: "General Enquiry",
  interested: "Interested",
  going_ahead: "Going Ahead",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};
const STAGE_COLORS: Record<string, string> = {
  general_enquiry: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  interested: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  going_ahead: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  confirmed: "bg-green-500/20 text-green-300 border-green-500/30",
  cancelled: "bg-red-500/20 text-red-300 border-red-500/30",
};
const EVENT_TYPES = [
  { value: "wedding", label: "Wedding" },
  { value: "conference", label: "Conference" },
  { value: "community_event", label: "Community Event" },
  { value: "funeral", label: "Funeral / Janazah" },
  { value: "birthday", label: "Birthday / Celebration" },
  { value: "corporate", label: "Corporate Event" },
  { value: "charity", label: "Charity Event" },
  { value: "religious", label: "Religious Event" },
  { value: "other", label: "Other" },
];
const PAY_TYPE_LABELS: Record<string, string> = {
  deposit: "Deposit",
  fifty_percent: "50% Payment (4 weeks before)",
  full_payment: "Full Payment (5 days before)",
  other: "Other",
};
const PAY_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  received: "bg-green-500/20 text-green-300 border-green-500/30",
  overdue: "bg-red-500/20 text-red-300 border-red-500/30",
};

function fmtDt(v: string | Date | null | undefined) {
  if (!v) return "-";
  return new Date(v).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Enquiry Form Dialog ─────────────────────────────────────────────────────
function EnquiryFormDialog({ rooms, onClose, onCreated, prefill }: { rooms: any[]; onClose: () => void; onCreated: () => void; prefill?: any }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    stage: prefill?.stage || "general_enquiry",
    eventType: prefill?.eventType || "other",
    eventTypeOther: prefill?.eventTypeOther || "",
    eventDate: prefill?.eventDate || "",
    eventStartTime: prefill?.eventStartTime || "",
    eventEndTime: prefill?.eventEndTime || "",
    expectedAttendees: prefill?.expectedAttendees || "",
    contactName: prefill?.contactName || "",
    contactEmail: prefill?.contactEmail || "",
    contactPhone: prefill?.contactPhone || "",
    contactAddress: prefill?.contactAddress || "",
    isOrganisation: prefill?.isOrganisation || false,
    organisationName: prefill?.organisationName || "",
    organisationAddress: prefill?.organisationAddress || "",
    leadContactName: prefill?.leadContactName || "",
    leadContactRole: prefill?.leadContactRole || "",
    roomId: prefill?.roomId?.toString() || "",
    roomPreference: prefill?.roomPreference || "",
    foodRequired: prefill?.foodRequired || false,
    foodHeadcount: prefill?.foodHeadcount || "",
    cateringType: prefill?.cateringType || "none",
    teaCoffeeRequired: prefill?.teaCoffeeRequired || false,
    foodPreferences: prefill?.foodPreferences || "",
    halalRequired: prefill?.halalRequired !== undefined ? prefill.halalRequired : true,
    vegetarianRequired: prefill?.vegetarianRequired || false,
    veganRequired: prefill?.veganRequired || false,
    allergyNotes: prefill?.allergyNotes || "",
    menuChoices: prefill?.menuChoices || "",
    linenHireRequired: prefill?.linenHireRequired || "hire",
    linenHireNotes: prefill?.linenHireNotes || "",
    tablesRequired: prefill?.tablesRequired || false,
    tablesCount: prefill?.tablesCount || "",
    chairsRequired: prefill?.chairsRequired || false,
    chairsCount: prefill?.chairsCount || "",
    cutleryPlatesRequired: prefill?.cutleryPlatesRequired || false,
    cutleryPlatesCount: prefill?.cutleryPlatesCount || "",
    decorRequired: prefill?.decorRequired || false,
    decorType: prefill?.decorType || "none",
    decorNotes: prefill?.decorNotes || "",
    speakersRequired: prefill?.speakersRequired || false,
    micSystemRequired: prefill?.micSystemRequired || false,
    avNotes: prefill?.avNotes || "",
    meetAndGreetRoom: prefill?.meetAndGreetRoom || false,
    groomRoom: prefill?.groomRoom || false,
    brideRoom: prefill?.brideRoom || false,
    additionalRoomNotes: prefill?.additionalRoomNotes || "",
    parkingRequired: prefill?.parkingRequired || false,
    parkingSpaces: prefill?.parkingSpaces || "",
    beveragesRequired: prefill?.beveragesRequired || false,
    beveragesNotes: prefill?.beveragesNotes || "",
    agreedAmount: prefill?.agreedAmount || "",
    depositAmount: prefill?.depositAmount || "",
    notes: prefill?.notes || "",
  });

  const createEnquiry = trpc.facilities.createEnquiry.useMutation({
    onSuccess: () => { toast.success("Enquiry created successfully"); onCreated(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.contactName.trim()) { toast.error("Contact name is required"); return; }
    createEnquiry.mutate({
      ...form,
      expectedAttendees: form.expectedAttendees ? Number(form.expectedAttendees) : undefined,
      roomId: form.roomId ? Number(form.roomId) : undefined,
      foodHeadcount: form.foodHeadcount ? Number(form.foodHeadcount) : undefined,
      tablesCount: form.tablesCount ? Number(form.tablesCount) : undefined,
      chairsCount: form.chairsCount ? Number(form.chairsCount) : undefined,
      cutleryPlatesCount: form.cutleryPlatesCount ? Number(form.cutleryPlatesCount) : undefined,
      parkingSpaces: form.parkingSpaces ? Number(form.parkingSpaces) : undefined,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-[#0d1b2a] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-indigo-400" />
            New Enquiry — Step {step} of 5
          </DialogTitle>
          <div className="flex gap-1 mt-2">
            {[1,2,3,4,5].map(s => (
              <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? "bg-indigo-500" : "bg-white/10"}`} />
            ))}
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Step 1: Event Details & Contact */}
          {step === 1 && (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300"><Calendar className="w-4 h-4" /> Event Details</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs text-white/70">Event Type *</Label>
                  <Select value={form.eventType} onValueChange={v => set("eventType", v)}>
                    <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                      {EVENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.eventType === "other" && (
                  <div className="col-span-2">
                    <Label className="text-xs text-white/70">Specify Event Type</Label>
                    <Input className="bg-white/5 border-white/10" value={form.eventTypeOther} onChange={e => set("eventTypeOther", e.target.value)} />
                  </div>
                )}
                <div>
                  <Label className="text-xs text-white/70">Event Date</Label>
                  <Input type="date" className="bg-white/5 border-white/10" value={form.eventDate} onChange={e => set("eventDate", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-white/70">Expected Attendees</Label>
                  <Input type="number" className="bg-white/5 border-white/10" value={form.expectedAttendees} onChange={e => set("expectedAttendees", e.target.value)} placeholder="e.g. 150" />
                </div>
                <div>
                  <Label className="text-xs text-white/70">Start Time</Label>
                  <Input type="time" className="bg-white/5 border-white/10" value={form.eventStartTime} onChange={e => set("eventStartTime", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-white/70">End Time</Label>
                  <Input type="time" className="bg-white/5 border-white/10" value={form.eventEndTime} onChange={e => set("eventEndTime", e.target.value)} />
                </div>
              </div>
              <Separator className="bg-white/10" />
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300"><Users className="w-4 h-4" /> Contact Details</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs text-white/70">Contact Name *</Label>
                  <Input className="bg-white/5 border-white/10" value={form.contactName} onChange={e => set("contactName", e.target.value)} placeholder="Full name" />
                </div>
                <div>
                  <Label className="text-xs text-white/70">Email</Label>
                  <Input type="email" className="bg-white/5 border-white/10" value={form.contactEmail} onChange={e => set("contactEmail", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-white/70">Telephone</Label>
                  <Input className="bg-white/5 border-white/10" value={form.contactPhone} onChange={e => set("contactPhone", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-white/70">Address</Label>
                  <Textarea className="bg-white/5 border-white/10" rows={2} value={form.contactAddress} onChange={e => set("contactAddress", e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* Step 2: Organisation */}
          {step === 2 && (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300"><Users className="w-4 h-4" /> Organisation Details</div>
              <div className="flex items-center gap-3 py-2">
                <Switch checked={form.isOrganisation} onCheckedChange={v => set("isOrganisation", v)} />
                <Label className="text-sm">Booking on behalf of an organisation</Label>
              </div>
              {form.isOrganisation && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs text-white/70">Organisation Name</Label>
                    <Input className="bg-white/5 border-white/10" value={form.organisationName} onChange={e => set("organisationName", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-white/70">Organisation Address</Label>
                    <Textarea className="bg-white/5 border-white/10" rows={2} value={form.organisationAddress} onChange={e => set("organisationAddress", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-white/70">Lead Contact Name</Label>
                    <Input className="bg-white/5 border-white/10" value={form.leadContactName} onChange={e => set("leadContactName", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-white/70">Lead Contact Role</Label>
                    <Input className="bg-white/5 border-white/10" value={form.leadContactRole} onChange={e => set("leadContactRole", e.target.value)} />
                  </div>
                </div>
              )}
              <Separator className="bg-white/10" />
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300"><Sparkles className="w-4 h-4" /> Room Preference</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs text-white/70">Select Room</Label>
                  <Select value={form.roomId} onValueChange={v => set("roomId", v)}>
                    <SelectTrigger className="bg-white/5 border-white/10"><SelectValue placeholder="Choose a room..." /></SelectTrigger>
                    <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                      {rooms.map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.name} ({r.building})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-white/70">Room Preference / Notes</Label>
                  <Input className="bg-white/5 border-white/10" value={form.roomPreference} onChange={e => set("roomPreference", e.target.value)} placeholder="e.g. Main hall preferred" />
                </div>
              </div>
              <Separator className="bg-white/10" />
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300"><Utensils className="w-4 h-4" /> Food & Catering</div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch checked={form.foodRequired} onCheckedChange={v => set("foodRequired", v)} />
                  <Label className="text-sm">Food required</Label>
                </div>
                {form.foodRequired && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-white/70">Headcount for food</Label>
                        <Input type="number" className="bg-white/5 border-white/10" value={form.foodHeadcount} onChange={e => set("foodHeadcount", e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs text-white/70">Catering Type</Label>
                        <Select value={form.cateringType} onValueChange={v => set("cateringType", v)}>
                          <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                            <SelectItem value="internal">Internal (AQS Catering)</SelectItem>
                            <SelectItem value="external">External Caterer</SelectItem>
                            <SelectItem value="self_catering">Self Catering</SelectItem>
                            <SelectItem value="none">None</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 space-y-2">
                      <p className="text-xs font-semibold text-orange-300">Dietary Preferences</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex items-center gap-2">
                          <Switch checked={form.halalRequired} onCheckedChange={v => set("halalRequired", v)} />
                          <Label className="text-xs">Halal</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={form.vegetarianRequired} onCheckedChange={v => set("vegetarianRequired", v)} />
                          <Label className="text-xs">Vegetarian</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={form.veganRequired} onCheckedChange={v => set("veganRequired", v)} />
                          <Label className="text-xs">Vegan</Label>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-white/70">Food Preferences / Special Requests</Label>
                        <Textarea className="bg-white/5 border-white/10 text-sm" rows={2} value={form.foodPreferences} onChange={e => set("foodPreferences", e.target.value)} placeholder="e.g. No nuts, gluten-free options needed..." />
                      </div>
                      <div>
                        <Label className="text-xs text-white/70">Allergy Notes</Label>
                        <Input className="bg-white/5 border-white/10 text-sm" value={form.allergyNotes} onChange={e => set("allergyNotes", e.target.value)} placeholder="e.g. Nut allergy for 3 guests" />
                      </div>
                      <div>
                        <Label className="text-xs text-white/70">Menu Choices (if known)</Label>
                        <Textarea className="bg-white/5 border-white/10 text-sm" rows={2} value={form.menuChoices} onChange={e => set("menuChoices", e.target.value)} placeholder="e.g. Starter: soup, Main: chicken biryani..." />
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Switch checked={form.teaCoffeeRequired} onCheckedChange={v => set("teaCoffeeRequired", v)} />
                  <Label className="text-sm">Tea & coffee facilities required</Label>
                </div>
              </div>
              <Separator className="bg-white/10" />
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 space-y-3">
                <p className="text-xs font-bold text-red-300 uppercase tracking-wide">⚠ Linen & Table Covers — Mandatory Chargeable Service</p>
                <p className="text-xs text-white/60">All events must either hire linen from AQS (chargeable) or bring their own linen and table covers.</p>
                <div>
                  <Label className="text-xs text-white/70">Linen Option *</Label>
                  <Select value={form.linenHireRequired} onValueChange={v => set("linenHireRequired", v)}>
                    <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                      <SelectItem value="hire">Hire from AQS (chargeable)</SelectItem>
                      <SelectItem value="own">Own linen / table covers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.linenHireRequired === "hire" && (
                  <div>
                    <Label className="text-xs text-white/70">Linen Notes (colours, style, quantity)</Label>
                    <Textarea className="bg-white/5 border-white/10 text-sm" rows={2} value={form.linenHireNotes} onChange={e => set("linenHireNotes", e.target.value)} placeholder="e.g. White tablecloths x20, gold chair sashes x150" />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step 3: Equipment & Decor */}
          {step === 3 && (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300"><Armchair className="w-4 h-4" /> Tables, Chairs & Cutlery</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch checked={form.tablesRequired} onCheckedChange={v => set("tablesRequired", v)} />
                    <Label className="text-sm">Tables required</Label>
                  </div>
                  {form.tablesRequired && <Input type="number" className="w-20 bg-white/5 border-white/10 text-sm" placeholder="Qty" value={form.tablesCount} onChange={e => set("tablesCount", e.target.value)} />}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch checked={form.chairsRequired} onCheckedChange={v => set("chairsRequired", v)} />
                    <Label className="text-sm">Chairs required</Label>
                  </div>
                  {form.chairsRequired && <Input type="number" className="w-20 bg-white/5 border-white/10 text-sm" placeholder="Qty" value={form.chairsCount} onChange={e => set("chairsCount", e.target.value)} />}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch checked={form.cutleryPlatesRequired} onCheckedChange={v => set("cutleryPlatesRequired", v)} />
                    <Label className="text-sm">Cutlery & plates required</Label>
                  </div>
                  {form.cutleryPlatesRequired && <Input type="number" className="w-20 bg-white/5 border-white/10 text-sm" placeholder="Qty" value={form.cutleryPlatesCount} onChange={e => set("cutleryPlatesCount", e.target.value)} />}
                </div>
              </div>
              <Separator className="bg-white/10" />
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300"><Sparkles className="w-4 h-4" /> Decor</div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch checked={form.decorRequired} onCheckedChange={v => set("decorRequired", v)} />
                  <Label className="text-sm">Decor required</Label>
                </div>
                {form.decorRequired && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-white/70">Decor Type</Label>
                      <Select value={form.decorType} onValueChange={v => set("decorType", v)}>
                        <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                          <SelectItem value="internal">Internal</SelectItem>
                          <SelectItem value="external">External</SelectItem>
                          <SelectItem value="both">Both</SelectItem>
                          <SelectItem value="none">None</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs text-white/70">Decor Notes</Label>
                      <Textarea className="bg-white/5 border-white/10" rows={2} value={form.decorNotes} onChange={e => set("decorNotes", e.target.value)} placeholder="Colour scheme, theme, etc." />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step 4: AV, Rooms, Parking */}
          {step === 4 && (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300"><Mic className="w-4 h-4" /> Speakers & Sound System</div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch checked={form.speakersRequired} onCheckedChange={v => set("speakersRequired", v)} />
                  <Label className="text-sm">Speakers required</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.micSystemRequired} onCheckedChange={v => set("micSystemRequired", v)} />
                  <Label className="text-sm">Microphone system required</Label>
                </div>
                {(form.speakersRequired || form.micSystemRequired) && (
                  <div>
                    <Label className="text-xs text-white/70">AV Notes</Label>
                    <Textarea className="bg-white/5 border-white/10" rows={2} value={form.avNotes} onChange={e => set("avNotes", e.target.value)} placeholder="Specific AV requirements..." />
                  </div>
                )}
              </div>
              <Separator className="bg-white/10" />
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300"><Users className="w-4 h-4" /> Additional Rooms</div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch checked={form.meetAndGreetRoom} onCheckedChange={v => set("meetAndGreetRoom", v)} />
                  <Label className="text-sm">Meet & Greet room</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.groomRoom} onCheckedChange={v => set("groomRoom", v)} />
                  <Label className="text-sm">Groom's room</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.brideRoom} onCheckedChange={v => set("brideRoom", v)} />
                  <Label className="text-sm">Bride's room</Label>
                </div>
                {(form.meetAndGreetRoom || form.groomRoom || form.brideRoom) && (
                  <div>
                    <Label className="text-xs text-white/70">Additional Room Notes</Label>
                    <Textarea className="bg-white/5 border-white/10" rows={2} value={form.additionalRoomNotes} onChange={e => set("additionalRoomNotes", e.target.value)} />
                  </div>
                )}
              </div>
              <Separator className="bg-white/10" />
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300"><Car className="w-4 h-4" /> Parking</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch checked={form.parkingRequired} onCheckedChange={v => set("parkingRequired", v)} />
                    <Label className="text-sm">Parking required</Label>
                  </div>
                  {form.parkingRequired && <Input type="number" className="w-20 bg-white/5 border-white/10 text-sm" placeholder="Spaces" value={form.parkingSpaces} onChange={e => set("parkingSpaces", e.target.value)} />}
                </div>
              </div>
              <Separator className="bg-white/10" />
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300"><GlassWater className="w-4 h-4" /> Beverages</div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch checked={form.beveragesRequired} onCheckedChange={v => set("beveragesRequired", v)} />
                  <Label className="text-sm">Beverages required</Label>
                </div>
                {form.beveragesRequired && (
                  <div>
                    <Label className="text-xs text-white/70">Beverages Notes</Label>
                    <Textarea className="bg-white/5 border-white/10" rows={2} value={form.beveragesNotes} onChange={e => set("beveragesNotes", e.target.value)} placeholder="Type of beverages, quantities..." />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step 5: Pricing & Notes */}
          {step === 5 && (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300"><FileText className="w-4 h-4" /> Pricing & Summary</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-white/70">Agreed Amount (£)</Label>
                  <Input type="number" step="0.01" className="bg-white/5 border-white/10" value={form.agreedAmount} onChange={e => set("agreedAmount", e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <Label className="text-xs text-white/70">Deposit Amount (£)</Label>
                  <Input type="number" step="0.01" className="bg-white/5 border-white/10" value={form.depositAmount} onChange={e => set("depositAmount", e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-white/70">Stage</Label>
                <Select value={form.stage} onValueChange={v => set("stage", v)}>
                  <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                    <SelectItem value="general_enquiry">General Enquiry</SelectItem>
                    <SelectItem value="interested">Interested</SelectItem>
                    <SelectItem value="going_ahead">Going Ahead</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-white/70">Notes</Label>
                <Textarea className="bg-white/5 border-white/10" rows={3} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any additional notes or requirements..." />
              </div>
              <Card className="bg-indigo-500/10 border-indigo-500/20">
                <CardContent className="p-3 text-xs space-y-1">
                  <p className="font-semibold text-indigo-300">Summary</p>
                  <p><span className="text-white/70">Event:</span> {EVENT_TYPES.find(t => t.value === form.eventType)?.label} {form.eventDate && `on ${form.eventDate}`}</p>
                  <p><span className="text-white/70">Contact:</span> {form.contactName} {form.contactPhone && `· ${form.contactPhone}`}</p>
                  {form.expectedAttendees && <p><span className="text-white/70">Attendees:</span> {form.expectedAttendees}</p>}
                  {form.foodRequired && <p><span className="text-white/70">Food:</span> {form.cateringType} for {form.foodHeadcount || "?"}</p>}
                  {form.agreedAmount && <p><span className="text-white/70">Amount:</span> £{form.agreedAmount}</p>}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div className="flex gap-2">
            {step > 1 && <Button variant="outline" onClick={() => setStep(s => s - 1)} className="border-white/20 text-white hover:bg-white/10">Back</Button>}
          </div>
          <div className="flex gap-2">
            {step < 5 && <Button onClick={() => setStep(s => s + 1)} className="bg-indigo-600 hover:bg-indigo-700">Next <ArrowRight className="w-4 h-4 ml-1" /></Button>}
            {step === 5 && <Button onClick={handleSubmit} disabled={createEnquiry.isPending} className="bg-green-600 hover:bg-green-700">{createEnquiry.isPending ? "Saving..." : "Create Enquiry"}</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Enquiry Detail Dialog ───────────────────────────────────────────────────
function EnquiryDetailDialog({ enquiryId, rooms, onClose, onRefresh }: { enquiryId: number; rooms: any[]; onClose: () => void; onRefresh: () => void }) {
  const { data, isLoading, refetch } = trpc.facilities.getEnquiry.useQuery({ id: enquiryId });
  const updateStage = trpc.facilities.updateEnquiryStage.useMutation({ onSuccess: () => { toast.success("Stage updated"); refetch(); onRefresh(); } });
  const sendForm = trpc.facilities.sendEnquiryForm.useMutation({ onSuccess: (r) => { toast.success(r.message); refetch(); } });
  const recordPayment = trpc.facilities.recordPayment.useMutation({ onSuccess: () => { toast.success("Payment recorded"); refetch(); } });
  const authorisePayment = trpc.facilities.authorisePayment.useMutation({ onSuccess: () => { toast.success("Payment authorised"); refetch(); } });
  const sendConfirmation = trpc.facilities.sendPaymentConfirmation.useMutation({ onSuccess: () => { toast.success("Confirmation sent"); refetch(); } });
  const uploadEvidence = trpc.facilities.uploadPaymentEvidence.useMutation({ onSuccess: () => { toast.success("Evidence uploaded"); refetch(); } });
  const convertToBooking = trpc.facilities.convertToBooking.useMutation({ onSuccess: () => { toast.success("Converted to booking!"); refetch(); onRefresh(); } });

  // New comms mutations
  const generatePdf = trpc.facilities.generateEnquiryPdf.useMutation({ onSuccess: (r) => { toast.success("PDF generated!"); window.open(r.url, "_blank"); refetch(); } });
  const syncDrive = trpc.facilities.syncEnquiryToDrive.useMutation({ onSuccess: (r) => { toast.success("Synced to Google Drive!"); window.open(r.webViewLink, "_blank"); refetch(); } });
  const sendEmail = trpc.facilities.sendEnquiryEmail.useMutation({ onSuccess: () => { toast.success("Email sent!"); setShowEmailCompose(false); refetch(); repliesQuery.refetch(); } });
  const addReply = trpc.facilities.addEnquiryReply.useMutation({ onSuccess: () => { toast.success("Reply recorded"); setShowAddReply(false); repliesQuery.refetch(); refetch(); } });
  const scanReply = trpc.facilities.scanReplyDocument.useMutation({ onSuccess: (r) => { setReplyForm(f => ({ ...f, fromName: r.senderName || "", fromEmail: r.senderEmail || "", fromPhone: r.senderPhone || "", subject: r.subject || "", body: r.body || "", scanUrl: r.scanUrl || "", receivedAt: r.receivedDate || "" })); toast.success("Document scanned — review and save"); } });
  const repliesQuery = trpc.facilities.listEnquiryReplies.useQuery({ enquiryId: enquiryId });
  const waQuery = trpc.facilities.getWhatsAppLink.useQuery({ enquiryId: enquiryId }, { enabled: false });

  const [showEmailCompose, setShowEmailCompose] = useState(false);
  const [showAddReply, setShowAddReply] = useState(false);
  const [emailForm, setEmailForm] = useState({ subject: "", body: "", attachPdf: true });
  const [replyForm, setReplyForm] = useState({ direction: "received" as string, method: "email" as string, fromName: "", fromEmail: "", fromPhone: "", subject: "", body: "", scanUrl: "", receivedAt: "" });
  const scanFileRef = useRef<HTMLInputElement>(null);

  const handleScanReply = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      scanReply.mutate({ enquiryId: enquiryId, fileBase64: base64, fileName: file.name });
    };
    reader.readAsDataURL(file);
  };

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payForm, setPayForm] = useState({ paymentType: "deposit" as string, amount: "", dueDate: "", paymentMethod: "bank_transfer" as string, reference: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingPaymentId, setUploadingPaymentId] = useState<number | null>(null);

  if (isLoading) return <Dialog open onOpenChange={onClose}><DialogContent className="bg-[#0d1b2a] border-white/10 text-white"><p className="text-center py-8">Loading...</p></DialogContent></Dialog>;
  if (!data) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingPaymentId) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadEvidence.mutate({ paymentId: uploadingPaymentId, enquiryId: data.id, fileBase64: base64, fileName: file.name });
      setUploadingPaymentId(null);
    };
    reader.readAsDataURL(file);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0d1b2a] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-indigo-400" />
            Enquiry — {data.contactName}
            <Badge className={`ml-2 text-xs border ${STAGE_COLORS[data.stage]}`}>{STAGE_LABELS[data.stage]}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stage Actions */}
          <div className="flex flex-wrap gap-2">
            {data.stage !== "confirmed" && data.stage !== "cancelled" && (
              <>
                {data.stage === "general_enquiry" && <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700" onClick={() => updateStage.mutate({ id: data.id, stage: "interested" })}>Mark Interested</Button>}
                {data.stage === "interested" && <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={() => updateStage.mutate({ id: data.id, stage: "going_ahead" })}>Going Ahead</Button>}
                {data.stage === "going_ahead" && <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => convertToBooking.mutate({ enquiryId: data.id })} disabled={convertToBooking.isPending}>Convert to Booking</Button>}
                <Button size="sm" variant="outline" className="border-red-500/30 text-red-300 hover:bg-red-500/10" onClick={() => updateStage.mutate({ id: data.id, stage: "cancelled" })}>Cancel</Button>
              </>
            )}
          </div>

          {/* Event Info */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-indigo-300">Event Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-white/60">Type:</span> {EVENT_TYPES.find(t => t.value === data.eventType)?.label}</div>
              <div><span className="text-white/60">Date:</span> {data.eventDate || "-"}</div>
              <div><span className="text-white/60">Time:</span> {data.eventStartTime || "-"} – {data.eventEndTime || "-"}</div>
              <div><span className="text-white/60">Attendees:</span> {data.expectedAttendees || "-"}</div>
              <div><span className="text-white/60">Room:</span> {rooms.find(r => r.id === data.roomId)?.name || data.roomPreference || "-"}</div>
              <div><span className="text-white/60">Amount:</span> {data.agreedAmount ? `£${data.agreedAmount}` : "-"}</div>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-indigo-300">Contact</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-white/60">Name:</span> {data.contactName}</div>
              <div><span className="text-white/60">Email:</span> {data.contactEmail || "-"}</div>
              <div><span className="text-white/60">Phone:</span> {data.contactPhone || "-"}</div>
              <div><span className="text-white/60">Address:</span> {data.contactAddress || "-"}</div>
              {data.isOrganisation && <>
                <div><span className="text-white/60">Organisation:</span> {data.organisationName}</div>
                <div><span className="text-white/60">Lead:</span> {data.leadContactName} {data.leadContactRole && `(${data.leadContactRole})`}</div>
              </>}
            </CardContent>
          </Card>

          {/* Requirements */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-indigo-300">Requirements</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {data.foodRequired && <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30">Food ({data.cateringType}, {data.foodHeadcount || "?"} pax)</Badge>}
              {data.teaCoffeeRequired && <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">Tea & Coffee</Badge>}
              {data.tablesRequired && <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">Tables ({data.tablesCount || "?"})</Badge>}
              {data.chairsRequired && <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">Chairs ({data.chairsCount || "?"})</Badge>}
              {data.cutleryPlatesRequired && <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">Cutlery & Plates</Badge>}
              {data.decorRequired && <Badge className="bg-pink-500/20 text-pink-300 border-pink-500/30">Decor ({data.decorType})</Badge>}
              {data.speakersRequired && <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30">Speakers</Badge>}
              {data.micSystemRequired && <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30">Mic System</Badge>}
              {data.meetAndGreetRoom && <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30">Meet & Greet Room</Badge>}
              {data.groomRoom && <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30">Groom's Room</Badge>}
              {data.brideRoom && <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30">Bride's Room</Badge>}
              {data.parkingRequired && <Badge className="bg-gray-500/20 text-gray-300 border-gray-500/30">Parking ({data.parkingSpaces || "?"} spaces)</Badge>}
              {data.beveragesRequired && <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30">Beverages</Badge>}
              {!data.foodRequired && !data.tablesRequired && !data.chairsRequired && !data.decorRequired && !data.speakersRequired && !data.micSystemRequired && !data.meetAndGreetRoom && !data.groomRoom && !data.brideRoom && !data.parkingRequired && !data.beveragesRequired && (
                <span className="text-white/50 text-xs">No special requirements</span>
              )}
            </CardContent>
          </Card>

          {/* Communications */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-indigo-300">Communications & Form</CardTitle>
              {/* Action row */}
              <div className="flex flex-wrap gap-2 mt-2">
                <Button size="sm" variant="outline" className="h-7 text-xs border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10" onClick={() => generatePdf.mutate({ enquiryId: data.id })} disabled={generatePdf.isPending}>
                  <FileText className="w-3 h-3 mr-1" /> {generatePdf.isPending ? "Generating..." : "Generate PDF"}
                </Button>
                {data.pdfUrl && (
                  <>
                    <a href={data.pdfUrl} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline" className="h-7 text-xs border-white/20 text-white hover:bg-white/10">
                        <Upload className="w-3 h-3 mr-1" /> Download PDF
                      </Button>
                    </a>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10" onClick={() => syncDrive.mutate({ enquiryId: data.id })} disabled={syncDrive.isPending}>
                      <ArrowRight className="w-3 h-3 mr-1" /> {syncDrive.isPending ? "Syncing..." : "Sync to Drive"}
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs border-white/20 text-white hover:bg-white/10" onClick={() => { setEmailForm({ subject: `Facilities Booking Enquiry — ${data.contactName}`, body: `AssalamuAlaikum wa Rahmatullahi wa Barakatuh,\n\nDear ${data.contactName},\n\nThank you for your enquiry regarding ${EVENT_TYPES.find(t => t.value === data.eventType)?.label || "your event"}${data.eventDate ? ` on ${data.eventDate}` : ""}.\n\nPlease find attached our booking enquiry form. Kindly complete and return at your earliest convenience.\n\nJazakAllah Khair,\nAQS Facilities Team`, attachPdf: true }); setShowEmailCompose(true); }}>
                  <Send className="w-3 h-3 mr-1" /> Compose Email
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs border-green-500/30 text-green-300 hover:bg-green-500/10" onClick={() => {
                  const phone = (data.contactPhone || "").replace(/[^0-9]/g, "").replace(/^0/, "44");
                  const msg = encodeURIComponent(`AssalamuAlaikum wa Rahmatullahi wa Barakatuh,\n\nDear ${data.contactName},\n\nThank you for your facilities booking enquiry. We will be in touch shortly.\n\nJazakAllah Khair,\nAQS Facilities Team`);
                  window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
                }}>
                  <MessageSquare className="w-3 h-3 mr-1" /> WhatsApp
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs border-purple-500/30 text-purple-300 hover:bg-purple-500/10" onClick={() => setShowAddReply(true)}>
                  <Plus className="w-3 h-3 mr-1" /> Add Reply
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {/* Status row */}
              <div className="flex flex-wrap gap-3">
                {data.formSentAt ? (
                  <span className="text-green-300"><CheckCircle2 className="w-3 h-3 inline mr-1" />Form sent {fmtDt(data.formSentAt)}</span>
                ) : (
                  <span className="text-white/50">Form not yet sent</span>
                )}
                {data.pdfGeneratedAt && <span className="text-indigo-300"><FileText className="w-3 h-3 inline mr-1" />PDF {fmtDt(data.pdfGeneratedAt)}</span>}
                {data.driveSyncedAt && <a href={data.driveFileUrl || "#"} target="_blank" className="text-yellow-300 underline"><ArrowRight className="w-3 h-3 inline mr-1" />Drive {fmtDt(data.driveSyncedAt)}</a>}
                {(data.replyCount || 0) > 0 && <span className="text-purple-300"><MessageSquare className="w-3 h-3 inline mr-1" />{data.replyCount} message{data.replyCount !== 1 ? "s" : ""}</span>}
              </div>
              {/* Email compose panel */}
              {showEmailCompose && (
                <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 space-y-2">
                  <p className="text-xs font-semibold text-indigo-300">Compose Email to {data.contactEmail || "(no email)"}</p>
                  <div>
                    <Label className="text-xs text-white/70">Subject</Label>
                    <Input className="bg-white/5 border-white/10 text-xs" value={emailForm.subject} onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs text-white/70">Body</Label>
                    <Textarea className="bg-white/5 border-white/10 text-xs" rows={5} value={emailForm.body} onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={emailForm.attachPdf} onCheckedChange={v => setEmailForm(f => ({ ...f, attachPdf: v }))} />
                    <Label className="text-xs">Include PDF link (if generated)</Label>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-xs" onClick={() => sendEmail.mutate({ enquiryId: data.id, subject: emailForm.subject, body: emailForm.body, attachPdf: emailForm.attachPdf, linkToComms: true })} disabled={sendEmail.isPending || !data.contactEmail}>
                      {sendEmail.isPending ? "Sending..." : "Send Email"}
                    </Button>
                    <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10 text-xs" onClick={() => setShowEmailCompose(false)}>Cancel</Button>
                  </div>
                </div>
              )}
              {/* Add Reply panel */}
              {showAddReply && (
                <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 space-y-2">
                  <p className="text-xs font-semibold text-purple-300">Record Reply / Communication</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-white/70">Direction</Label>
                      <Select value={replyForm.direction} onValueChange={v => setReplyForm(f => ({ ...f, direction: v }))}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                          <SelectItem value="received">Received (from client)</SelectItem>
                          <SelectItem value="sent">Sent (by us)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-white/70">Method</Label>
                      <Select value={replyForm.method} onValueChange={v => setReplyForm(f => ({ ...f, method: v }))}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="phone">Phone Call</SelectItem>
                          <SelectItem value="in_person">In Person</SelectItem>
                          <SelectItem value="manual_entry">Manual Entry</SelectItem>
                          <SelectItem value="scanned">Scanned Document</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-white/70">From Name</Label>
                      <Input className="bg-white/5 border-white/10 text-xs" value={replyForm.fromName} onChange={e => setReplyForm(f => ({ ...f, fromName: e.target.value }))} placeholder={data.contactName} />
                    </div>
                    <div>
                      <Label className="text-xs text-white/70">Date Received</Label>
                      <Input type="date" className="bg-white/5 border-white/10 text-xs" value={replyForm.receivedAt} onChange={e => setReplyForm(f => ({ ...f, receivedAt: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-white/70">Subject</Label>
                    <Input className="bg-white/5 border-white/10 text-xs" value={replyForm.subject} onChange={e => setReplyForm(f => ({ ...f, subject: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs text-white/70">Message / Notes</Label>
                    <Textarea className="bg-white/5 border-white/10 text-xs" rows={3} value={replyForm.body} onChange={e => setReplyForm(f => ({ ...f, body: e.target.value }))} placeholder="Enter the reply content or notes from the call..." />
                  </div>
                  {replyForm.method === "scanned" && (
                    <div>
                      <Label className="text-xs text-white/70">Scan Document (AI will extract text)</Label>
                      <div className="flex gap-2 items-center">
                        <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10 text-xs" onClick={() => scanFileRef.current?.click()} disabled={scanReply.isPending}>
                          <Camera className="w-3 h-3 mr-1" /> {scanReply.isPending ? "Scanning..." : "Upload & Scan"}
                        </Button>
                        {replyForm.scanUrl && <span className="text-green-300 text-xs">✓ Scanned</span>}
                        <input ref={scanFileRef} type="file" className="hidden" accept="image/*,.pdf" onChange={handleScanReply} />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-xs" onClick={() => addReply.mutate({ enquiryId: data.id, direction: replyForm.direction as any, method: replyForm.method as any, fromName: replyForm.fromName || data.contactName, fromEmail: replyForm.fromEmail, fromPhone: replyForm.fromPhone, subject: replyForm.subject, body: replyForm.body, scanUrl: replyForm.scanUrl || undefined, receivedAt: replyForm.receivedAt || undefined })} disabled={addReply.isPending || !replyForm.body}>
                      {addReply.isPending ? "Saving..." : "Save Reply"}
                    </Button>
                    <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10 text-xs" onClick={() => setShowAddReply(false)}>Cancel</Button>
                  </div>
                </div>
              )}
              {/* Reply history */}
              {repliesQuery.data && repliesQuery.data.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-white/60">Message History</p>
                  {repliesQuery.data.map((r: any) => (
                    <div key={r.id} className={`p-2 rounded-lg text-xs ${r.direction === "sent" ? "bg-indigo-500/10 border border-indigo-500/20 ml-4" : "bg-white/5 border border-white/10 mr-4"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-semibold ${r.direction === "sent" ? "text-indigo-300" : "text-white"}`}>{r.direction === "sent" ? "→ Sent" : "← Received"} via {r.method}</span>
                        <span className="text-white/40">{fmtDt(r.receivedAt)}</span>
                      </div>
                      {r.subject && <p className="text-white/70 mt-0.5">Re: {r.subject}</p>}
                      <p className="text-white/80 mt-1 whitespace-pre-wrap line-clamp-3">{r.body}</p>
                      {r.scanUrl && <a href={r.scanUrl} target="_blank" className="text-indigo-300 underline text-xs">View scanned document</a>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payments */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm text-indigo-300">Payment Schedule</CardTitle>
              <Button size="sm" variant="outline" className="h-7 text-xs border-white/20 text-white hover:bg-white/10" onClick={() => setShowPaymentForm(true)}>
                <Plus className="w-3 h-3 mr-1" /> Record Payment
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.payments?.length === 0 && <p className="text-white/50 text-xs">No payments recorded yet</p>}
              {data.payments?.map((p: any) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-white/5 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs border ${PAY_STATUS_COLORS[p.status]}`}>{p.status}</Badge>
                    <span className="font-medium">{PAY_TYPE_LABELS[p.paymentType]}</span>
                    <span className="text-white/70">£{p.amount}</span>
                    {p.dueDate && <span className="text-white/50">Due: {p.dueDate}</span>}
                  </div>
                  <div className="flex gap-1">
                    {p.status === "pending" && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs text-green-300 hover:bg-green-500/10" onClick={() => authorisePayment.mutate({ paymentId: p.id, enquiryId: data.id })}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Authorise
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-6 text-xs text-white/70 hover:bg-white/10" onClick={() => { setUploadingPaymentId(p.id); fileRef.current?.click(); }}>
                      <Upload className="w-3 h-3 mr-1" /> Evidence
                    </Button>
                    {p.status === "received" && !p.confirmationSentAt && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs text-indigo-300 hover:bg-indigo-500/10" onClick={() => sendConfirmation.mutate({ enquiryId: data.id, paymentId: p.id, method: "both" })}>
                        <Send className="w-3 h-3 mr-1" /> Send Confirmation
                      </Button>
                    )}
                  </div>
                  {p.authorisedByName && <div className="w-full text-xs text-green-300/70"><CheckCircle2 className="w-3 h-3 inline mr-1" />Authorised by {p.authorisedByName} on {fmtDt(p.authorisedAt)}</div>}
                  {p.evidenceUrl && <a href={p.evidenceUrl} target="_blank" className="text-xs text-indigo-300 underline">View Evidence</a>}
                  {p.confirmationSentAt && <div className="w-full text-xs text-green-300/70">Confirmation sent via {p.confirmationMethod} on {fmtDt(p.confirmationSentAt)}</div>}
                </div>
              ))}
              <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf" onChange={handleFileUpload} />
            </CardContent>
          </Card>

          {/* Payment Form */}
          {showPaymentForm && (
            <Card className="bg-indigo-500/10 border-indigo-500/20">
              <CardContent className="p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-white/70">Payment Type</Label>
                    <Select value={payForm.paymentType} onValueChange={v => setPayForm(f => ({ ...f, paymentType: v }))}>
                      <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                        <SelectItem value="deposit">Deposit</SelectItem>
                        <SelectItem value="fifty_percent">50% (4 weeks before)</SelectItem>
                        <SelectItem value="full_payment">Full Payment (5 days before)</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-white/70">Amount (£)</Label>
                    <Input type="number" step="0.01" className="bg-white/5 border-white/10" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs text-white/70">Due Date</Label>
                    <Input type="date" className="bg-white/5 border-white/10" value={payForm.dueDate} onChange={e => setPayForm(f => ({ ...f, dueDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs text-white/70">Method</Label>
                    <Select value={payForm.paymentMethod} onValueChange={v => setPayForm(f => ({ ...f, paymentMethod: v }))}>
                      <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0d1b2a] border-white/10 text-white">
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-white/70">Reference</Label>
                    <Input className="bg-white/5 border-white/10" value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} placeholder="Payment reference..." />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" className="border-white/20 text-white" onClick={() => setShowPaymentForm(false)}>Cancel</Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => {
                    if (!payForm.amount) { toast.error("Amount is required"); return; }
                    recordPayment.mutate({ enquiryId: data.id, paymentType: payForm.paymentType as any, amount: payForm.amount, dueDate: payForm.dueDate || undefined, paymentMethod: payForm.paymentMethod as any, reference: payForm.reference || undefined });
                    setShowPaymentForm(false);
                    setPayForm({ paymentType: "deposit", amount: "", dueDate: "", paymentMethod: "bank_transfer", reference: "" });
                  }} disabled={recordPayment.isPending}>Save Payment</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Audit Trail */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-indigo-300">Audit Trail</CardTitle></CardHeader>
            <CardContent className="space-y-1 max-h-40 overflow-y-auto">
              {data.audit?.length === 0 && <p className="text-white/50 text-xs">No activity yet</p>}
              {data.audit?.map((a: any) => (
                <div key={a.id} className="flex items-start gap-2 text-xs py-1 border-b border-white/5 last:border-0">
                  <Clock className="w-3 h-3 text-white/40 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-white/90">{a.description}</span>
                    <span className="text-white/40 ml-2">{a.performedByName} · {fmtDt(a.timestamp)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Send Blank Form Dialog ──────────────────────────────────────────────────
function SendBlankFormDialog({
  savedPdfUrl, googleFormUrl, generateBlankPdf, sendBlankEmail, sendBlankSubject, setSendBlankSubject, onClose
}: {
  savedPdfUrl: string;
  googleFormUrl: string;
  generateBlankPdf: any;
  sendBlankEmail: any;
  sendBlankSubject: string;
  setSendBlankSubject: (v: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [extraMsg, setExtraMsg] = useState("");
  const [pdfReady, setPdfReady] = useState(false);
  const [localPdfUrl, setLocalPdfUrl] = useState("");

  // Auto-generate PDF if not already available
  const handleOpen = () => {
    if (!localPdfUrl) {
      generateBlankPdf.mutate(undefined, {
        onSuccess: (data: { url: string }) => { setLocalPdfUrl(data.url); setPdfReady(true); },
      });
    } else {
      setPdfReady(true);
    }
  };

  // Trigger auto-generate on mount
  useState(() => { handleOpen(); });

  const buildWaMsg = () => {
    let msg = `AssalamuAlaikum${name ? " " + name : ""},\n\nThank you for your interest in our facilities at the Abdullah Quilliam Society.\n\nPlease find our Facilities Booking Enquiry Form below:`;
    if (localPdfUrl) msg += `\n\n\uD83D\uDCC4 Download & print the form:\n${localPdfUrl}`;
    if (googleFormUrl) msg += `\n\n\uD83D\uDCBB Or complete it online:\n${googleFormUrl}`;
    if (extraMsg) msg += `\n\n${extraMsg}`;
    msg += `\n\nPlease complete and return it to us.\n\nJazakAllah Khair,\nAQS Facilities Team`;
    return msg;
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-[#0d1b2a] border-white/10 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" /> Send Blank Enquiry Form
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">

          {/* PDF status */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
            {generateBlankPdf.isPending ? (
              <><Clock className="w-4 h-4 text-yellow-400 animate-spin" /><span className="text-sm text-yellow-300">Preparing form PDF...</span></>
            ) : localPdfUrl ? (
              <><CheckCircle2 className="w-4 h-4 text-green-400" /><span className="text-sm text-green-300">Form PDF ready</span>
                <Button size="sm" variant="outline" className="ml-auto border-green-500/40 text-green-300 hover:bg-green-500/10" onClick={() => window.open(localPdfUrl, "_blank")}>
                  <Download className="w-3 h-3 mr-1" /> Preview
                </Button>
              </>
            ) : (
              <><FileText className="w-4 h-4 text-white/40" /><span className="text-sm text-white/50">No PDF yet</span>
                <Button size="sm" variant="outline" className="ml-auto border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10" onClick={handleOpen}>
                  Generate
                </Button>
              </>
            )}
          </div>

          {/* Google Form status */}
          {googleFormUrl ? (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <ExternalLink className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-blue-300 flex-1 truncate">Google Form linked</span>
              <Button size="sm" variant="outline" className="border-white/20 text-white/60 hover:bg-white/10" onClick={() => { navigator.clipboard.writeText(googleFormUrl); toast.success("Link copied!"); }}>
                <Link className="w-3 h-3 mr-1" /> Copy
              </Button>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
              No Google Form URL configured. Click the <Settings className="w-3 h-3 inline" /> settings icon to add one.
            </div>
          )}

          {/* Single recipient block */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">Recipient Details</p>
            <div>
              <Label className="text-xs text-white/60">Full Name</Label>
              <Input className="bg-white/5 border-white/10 mt-1" placeholder="e.g. Ahmed Ali" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-white/60">Phone (with country code)</Label>
                <Input className="bg-white/5 border-white/10 mt-1" placeholder="447700900000" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-white/60">Email Address</Label>
                <Input type="email" className="bg-white/5 border-white/10 mt-1" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-white/60">Additional Note (optional)</Label>
              <Textarea className="bg-white/5 border-white/10 mt-1 text-sm" rows={2} placeholder="Any extra message to include..." value={extraMsg} onChange={e => setExtraMsg(e.target.value)} />
            </div>
          </div>

          {/* Send buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!phone || !localPdfUrl}
              onClick={() => {
                const cleaned = phone.replace(/[^0-9]/g, "");
                window.open(`https://wa.me/${cleaned}?text=${encodeURIComponent(buildWaMsg())}`, "_blank");
              }}
            >
              <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={!email || !localPdfUrl || sendBlankEmail.isPending}
              onClick={() => sendBlankEmail.mutate({
                toEmail: email,
                toName: name || email,
                subject: sendBlankSubject,
                body: extraMsg || undefined,
                pdfUrl: localPdfUrl || undefined,
                googleFormUrl: googleFormUrl || undefined,
              })}
            >
              <Mail className="w-4 h-4 mr-1" /> {sendBlankEmail.isPending ? "Sending..." : "Send Email"}
            </Button>
          </div>
          <p className="text-xs text-white/40 text-center">Both buttons include the PDF link{googleFormUrl ? " and Google Form link" : ""}.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Enquiries Tab Component ────────────────────────────────────────────
export default function FacilitiesEnquiries({ rooms }: { rooms: any[] }) {
  const [showNewEnquiry, setShowNewEnquiry] = useState(false);
  const [selectedEnquiryId, setSelectedEnquiryId] = useState<number | null>(null);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanPrefill, setScanPrefill] = useState<any>(null);
  const [showSendBlankForm, setShowSendBlankForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [blankFormPdfUrl, setBlankFormPdfUrl] = useState("");
  const [sendBlankTo, setSendBlankTo] = useState({ name: "", email: "", phone: "" });
  const [sendBlankSubject, setSendBlankSubject] = useState("Facilities Booking Enquiry Form \u2014 Abdullah Quilliam Society");
  const [sendBlankBody, setSendBlankBody] = useState("");
  const [settingsValues, setSettingsValues] = useState<Record<string, string>>({});

  const utils = trpc.useUtils();
  const enquiries = trpc.facilities.listEnquiries.useQuery(
    stageFilter !== "all" ? { stage: stageFilter as any } : undefined
  );
  const facilitySettingsQ = trpc.facilities.getFacilitySettings.useQuery();
  const updateSetting = trpc.facilities.updateFacilitySetting.useMutation({
    onSuccess: () => { toast.success("Setting saved"); facilitySettingsQ.refetch(); },
    onError: (e) => toast.error("Failed to save: " + e.message),
  });
  const generateBlankPdf = trpc.facilities.generateBlankEnquiryPdf.useMutation({
    onSuccess: (data) => { setBlankFormPdfUrl(data.url); toast.success("Blank enquiry form PDF generated"); },
    onError: (e) => toast.error("PDF generation failed: " + e.message),
  });
  const sendBlankEmail = trpc.facilities.sendBlankFormEmail.useMutation({
    onSuccess: () => { toast.success("Enquiry form sent by email"); setShowSendBlankForm(false); },
    onError: (e) => toast.error("Email failed: " + e.message),
  });
  const scanForm = trpc.facilities.scanEnquiryForm.useMutation({
    onSuccess: (result) => {
      toast.success("Form scanned successfully");
      setScanPrefill(result.extracted);
      setShowScanDialog(false);
      setShowNewEnquiry(true);
    },
    onError: (e) => toast.error("Scan failed: " + e.message),
  });

  const refetch = () => { utils.facilities.listEnquiries.invalidate(); utils.facilities.stats.invalidate(); };
  const currentSettings = facilitySettingsQ.data || {};
  const googleFormUrl = currentSettings["google_form_url"] || "";
  const savedPdfUrl = blankFormPdfUrl; // Always use freshly generated URL, never cached

  const filtered = (enquiries.data || []).filter((e: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return e.contactName?.toLowerCase().includes(s) || e.contactEmail?.toLowerCase().includes(s) || e.organisationName?.toLowerCase().includes(s) || e.eventType?.toLowerCase().includes(s);
  });

  const stageCounts = (enquiries.data || []).reduce((acc: Record<string, number>, e: any) => {
    acc[e.stage] = (acc[e.stage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleScanUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      scanForm.mutate({ fileBase64: base64, fileName: file.name });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      {/* Pipeline Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {(["general_enquiry", "interested", "going_ahead", "confirmed", "cancelled"] as const).map(stage => (
          <button key={stage} onClick={() => setStageFilter(stageFilter === stage ? "all" : stage)} className={`p-3 rounded-xl border text-left transition-all ${stageFilter === stage ? "ring-2 ring-indigo-500 " + STAGE_COLORS[stage].replace("text-", "bg-").split(" ")[0] : "bg-white/5 border-white/10 hover:bg-white/10"}`}>
            <div className="text-xs text-white/70">{STAGE_LABELS[stage]}</div>
            <div className="text-lg font-bold">{stageCounts[stage] || 0}</div>
          </button>
        ))}
      </div>

      {/* Actions Bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <Input className="pl-9 bg-white/5 border-white/10" placeholder="Search enquiries..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={() => setShowScanDialog(true)}>
          <Camera className="w-4 h-4 mr-1" /> Scan Form
        </Button>
        <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10" onClick={() => setShowSendBlankForm(true)}>
          <Send className="w-4 h-4 mr-1" /> Send Blank Form
        </Button>
        <Button size="sm" variant="outline" className="border-white/20 text-white/60 hover:bg-white/10 px-2" onClick={() => { setSettingsValues({ ...currentSettings }); setShowSettings(true); }}>
          <Settings className="w-4 h-4" />
        </Button>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => { setScanPrefill(null); setShowNewEnquiry(true); }}>
          <Plus className="w-4 h-4 mr-1" /> New Enquiry
        </Button>
      </div>

      {/* Enquiries List */}
      <div className="space-y-2">
        {enquiries.isLoading && <p className="text-center py-8 text-white/60">Loading enquiries...</p>}
        {filtered.length === 0 && !enquiries.isLoading && (
          <div className="text-center py-12 text-white/50">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No enquiries found. Create the first one or scan a form.</p>
          </div>
        )}
        {filtered.map((enq: any) => (
          <Card key={enq.id} className="bg-white/5 border-white/10 hover:bg-white/8 transition-colors cursor-pointer" onClick={() => setSelectedEnquiryId(enq.id)}>
            <CardContent className="p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-indigo-300">{enq.contactName?.charAt(0)?.toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{enq.contactName}</div>
                  <div className="text-xs text-white/60 truncate">
                    {EVENT_TYPES.find(t => t.value === enq.eventType)?.label}
                    {enq.eventDate && ` · ${enq.eventDate}`}
                    {enq.expectedAttendees && ` · ${enq.expectedAttendees} guests`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {enq.agreedAmount && <span className="text-xs font-mono text-green-300">£{enq.agreedAmount}</span>}
                <Badge className={`text-xs border ${STAGE_COLORS[enq.stage]}`}>{STAGE_LABELS[enq.stage]}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialogs */}
      {showNewEnquiry && <EnquiryFormDialog rooms={rooms} onClose={() => setShowNewEnquiry(false)} onCreated={refetch} prefill={scanPrefill} />}
      {selectedEnquiryId && <EnquiryDetailDialog enquiryId={selectedEnquiryId} rooms={rooms} onClose={() => setSelectedEnquiryId(null)} onRefresh={refetch} />}

      {/* Send Blank Form Dialog */}
      {showSendBlankForm && (
        <SendBlankFormDialog
          savedPdfUrl={savedPdfUrl}
          googleFormUrl={googleFormUrl}
          generateBlankPdf={generateBlankPdf}
          sendBlankEmail={sendBlankEmail}
          sendBlankSubject={sendBlankSubject}
          setSendBlankSubject={setSendBlankSubject}
          onClose={() => setShowSendBlankForm(false)}
        />
      )}

      {/* Settings Dialog */}
      {showSettings && (
        <Dialog open onOpenChange={() => setShowSettings(false)}>
          <DialogContent className="max-w-md bg-[#0d1b2a] border-white/10 text-white">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Settings className="w-5 h-5" /> Enquiry Form Settings</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs text-white/60">Google Form URL</Label>
                <p className="text-xs text-white/40 mb-1">Paste your Google Form link. It will be included in emails and the blank PDF.</p>
                <Input className="bg-white/5 border-white/10 text-sm" placeholder="https://forms.google.com/..." value={settingsValues["google_form_url"] ?? currentSettings["google_form_url"] ?? ""} onChange={e => setSettingsValues(p => ({ ...p, google_form_url: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-white/60">Organisation Name (on PDF)</Label>
                <Input className="bg-white/5 border-white/10 text-sm" value={settingsValues["org_name"] ?? currentSettings["org_name"] ?? ""} onChange={e => setSettingsValues(p => ({ ...p, org_name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-white/60">Organisation Address (on PDF)</Label>
                <Input className="bg-white/5 border-white/10 text-sm" value={settingsValues["org_address"] ?? currentSettings["org_address"] ?? ""} onChange={e => setSettingsValues(p => ({ ...p, org_address: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-white/60">Phone (on PDF)</Label>
                  <Input className="bg-white/5 border-white/10 text-sm" value={settingsValues["org_phone"] ?? currentSettings["org_phone"] ?? ""} onChange={e => setSettingsValues(p => ({ ...p, org_phone: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs text-white/60">Email (on PDF)</Label>
                  <Input className="bg-white/5 border-white/10 text-sm" value={settingsValues["org_email"] ?? currentSettings["org_email"] ?? ""} onChange={e => setSettingsValues(p => ({ ...p, org_email: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-white/20 text-white" onClick={() => setShowSettings(false)}>Cancel</Button>
              <Button className="bg-indigo-600 hover:bg-indigo-700" disabled={updateSetting.isPending} onClick={async () => {
                for (const [key, value] of Object.entries(settingsValues)) {
                  await updateSetting.mutateAsync({ key, value });
                }
                setShowSettings(false);
              }}>
                {updateSetting.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Scan Dialog */}
      {showScanDialog && (
        <Dialog open onOpenChange={() => setShowScanDialog(false)}>
          <DialogContent className="max-w-sm bg-[#0d1b2a] border-white/10 text-white">
            <DialogHeader><DialogTitle>Scan Enquiry Form</DialogTitle></DialogHeader>
            <p className="text-sm text-white/70">Upload a photo or PDF of a completed enquiry form. AI will extract the fields automatically.</p>
            <div className="flex flex-col gap-3 py-4">
              <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-white/20 rounded-xl cursor-pointer hover:border-indigo-500/50 transition-colors">
                <Upload className="w-8 h-8 text-white/40" />
                <span className="text-sm text-white/60">{scanForm.isPending ? "Scanning..." : "Tap to upload form"}</span>
                <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleScanUpload} disabled={scanForm.isPending} />
              </label>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
