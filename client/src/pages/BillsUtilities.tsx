import { useState, useMemo, useEffect , useCallback} from "react";
import { useHibbaFormFill } from "@/hooks/useHibbaFormFill";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus, Zap, Droplets, Flame, Wifi, Phone, Shield, MoreHorizontal,
  AlertTriangle, CheckCircle, Clock, Trash2, Edit2, FileText,
  ChevronLeft, ChevronRight, CalendarDays, Settings, Building2, Tag,
  Receipt, ScanLine, Users,
} from "lucide-react";
import { AiDocumentScanner } from "@/components/AiDocumentScanner";
import { LineChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { useVoiceContext } from "@/contexts/VoiceContext";

const FALLBACK_BUILDINGS = ["QLH", "Bistro", "Accommodation", "Other"];
const FALLBACK_CATEGORIES = ["electricity", "gas", "water", "broadband", "telephone", "insurance", "other"];

const CATEGORY_COLOURS: Record<string, string> = {
  electricity: "#f59e0b",
  gas: "#f97316",
  water: "#3b82f6",
  broadband: "#8b5cf6",
  telephone: "#06b6d4",
  insurance: "#10b981",
  other: "#6b7280",
};

const categoryIcon = (cat: string) => {
  switch (cat) {
    case "electricity": return <Zap className="w-4 h-4 text-yellow-500" />;
    case "gas": return <Flame className="w-4 h-4 text-orange-500" />;
    case "water": return <Droplets className="w-4 h-4 text-blue-500" />;
    case "broadband": return <Wifi className="w-4 h-4 text-purple-500" />;
    case "telephone": return <Phone className="w-4 h-4 text-cyan-500" />;
    case "insurance": return <Shield className="w-4 h-4 text-indigo-500" />;
    default: return <MoreHorizontal className="w-4 h-4 text-gray-500" />;
  }
};

const categoryBg = (cat: string) => {
  const map: Record<string, string> = {
    electricity: "bg-yellow-100 text-yellow-800 border-yellow-300",
    gas: "bg-orange-100 text-orange-800 border-orange-300",
    water: "bg-blue-100 text-blue-800 border-blue-300",
    broadband: "bg-purple-100 text-purple-800 border-purple-300",
    telephone: "bg-cyan-100 text-cyan-800 border-cyan-300",
    insurance: "bg-indigo-100 text-indigo-800 border-indigo-300",
    other: "bg-gray-100 text-gray-800 border-gray-300",
  };
  return map[cat] ?? "bg-gray-100 text-gray-800 border-gray-300";
};

// ── DD Calendar Component ─────────────────────────────────────────────────────
function DDCalendar({ accounts, categories }: { accounts: any[]; categories: any[] }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const accountsWithDD = useMemo(
    () => accounts.filter(a => a.billingDay && a.directDebitAmount),
    [accounts]
  );

  const ddByDay = useMemo(() => {
    const map: Record<number, typeof accountsWithDD> = {};
    for (const acc of accountsWithDD) {
      const day = acc.billingDay as number;
      if (!map[day]) map[day] = [];
      map[day].push(acc);
    }
    return map;
  }, [accountsWithDD]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const startOffset = (firstDayOfWeek + 6) % 7;
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString("default", { month: "long", year: "numeric" });

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  const totalDDThisMonth = accountsWithDD.reduce((s, a) => s + parseFloat(a.directDebitAmount ?? "0"), 0);

  const upcoming = useMemo(() => {
    const results: { acc: any; date: Date }[] = [];
    for (let offset = 0; offset <= 7; offset++) {
      const d = new Date(today);
      d.setDate(today.getDate() + offset);
      const day = d.getDate();
      if (ddByDay[day]) {
        for (const acc of ddByDay[day]) {
          results.push({ acc, date: new Date(d.getFullYear(), d.getMonth(), day) });
        }
      }
    }
    return results.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [ddByDay]);

  // Build legend from dynamic categories
  const legendCats = categories.length > 0 ? categories : FALLBACK_CATEGORIES.map(c => ({ name: c, colour: CATEGORY_COLOURS[c] ?? "#6b7280" }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Card className="flex-1 min-w-[180px]">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Accounts with DD dates</p>
            <p className="text-2xl font-bold">{accountsWithDD.length}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[180px]">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total monthly DD</p>
            <p className="text-2xl font-bold text-green-600">£{totalDDThisMonth.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        {upcoming.length > 0 && (
          <Card className="flex-1 min-w-[220px] border-amber-300">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Next DD due</p>
              <p className="text-sm font-semibold text-amber-700">{upcoming[0].acc.supplier} — {upcoming[0].date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
              <p className="text-xs text-muted-foreground">£{parseFloat(upcoming[0].acc.directDebitAmount).toFixed(2)}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
            <CardTitle className="text-base">{monthName} — Direct Debit Calendar</CardTitle>
            <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {accountsWithDD.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No accounts have a billing day set.</p>
              <p className="text-xs mt-1">Edit an account and set the "DD Day" field to populate this calendar.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startOffset }).map((_, i) => <div key={`empty-${i}`} className="min-h-[72px]" />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                  const ddAccounts = ddByDay[day] ?? [];
                  return (
                    <div key={day} className={`min-h-[72px] rounded-lg border p-1 text-xs transition-colors ${isToday ? "border-primary bg-primary/5" : "border-border"} ${ddAccounts.length > 0 ? "bg-muted/30" : ""}`}>
                      <div className={`font-semibold mb-1 ${isToday ? "text-primary" : "text-foreground"}`}>{day}</div>
                      <div className="space-y-0.5">
                        {ddAccounts.map(acc => (
                          <div key={acc.id} title={`${acc.supplier} — £${parseFloat(acc.directDebitAmount).toFixed(2)}/mo`} className={`rounded px-1 py-0.5 text-[10px] leading-tight border truncate ${categoryBg(acc.category)}`}>
                            <span className="font-medium">{acc.supplier}</span>
                            <span className="ml-1 opacity-75">£{parseFloat(acc.directDebitAmount).toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {upcoming.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Upcoming Direct Debits (Next 7 Days)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcoming.map(({ acc, date }) => (
                <div key={`${acc.id}-${date.toISOString()}`} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                  <div className="flex items-center gap-2">
                    {categoryIcon(acc.category)}
                    <div>
                      <p className="font-medium">{acc.supplier}</p>
                      <p className="text-xs text-muted-foreground">{acc.building} · {acc.category}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600">£{parseFloat(acc.directDebitAmount).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        {legendCats.map((cat: any) => (
          <span key={cat.name} className={`px-2 py-1 rounded border flex items-center gap-1 ${categoryBg(cat.name)}`}>
            {categoryIcon(cat.name)} {cat.name.charAt(0).toUpperCase() + cat.name.slice(1)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel() {
  const utils = trpc.useUtils();
  const { data: buildings = [] } = trpc.bills.listBuildings.useQuery();
  const { data: categories = [] } = trpc.bills.listCategories.useQuery();
  const { data: contacts = [] } = trpc.supplierContacts.list.useQuery({});

  const [newBuilding, setNewBuilding] = useState({ name: "", address: "" });
  const [newCategory, setNewCategory] = useState({ name: "", colour: "#6b7280" });
  const [editBuilding, setEditBuilding] = useState<any>(null);
  const [editCategory, setEditCategory] = useState<any>(null);
  const [newContact, setNewContact] = useState({ supplierName: "", contactName: "", role: "", phone: "", email: "", notes: "" });
  const [editContact, setEditContact] = useState<any>(null);
  const [contactSearch, setContactSearch] = useState("");

  const addBuilding = trpc.bills.addBuilding.useMutation({
    onSuccess: () => { utils.bills.listBuildings.invalidate(); setNewBuilding({ name: "", address: "" }); toast.success("Building added"); },
    onError: (e) => toast.error(e.message),
  });
  const updateBuilding = trpc.bills.updateBuilding.useMutation({
    onSuccess: () => { utils.bills.listBuildings.invalidate(); setEditBuilding(null); toast.success("Building updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteBuilding = trpc.bills.deleteBuilding.useMutation({
    onSuccess: () => { utils.bills.listBuildings.invalidate(); toast.success("Building removed"); },
    onError: (e) => toast.error(e.message),
  });
  const addCategory = trpc.bills.addCategory.useMutation({
    onSuccess: () => { utils.bills.listCategories.invalidate(); setNewCategory({ name: "", colour: "#6b7280" }); toast.success("Category added"); },
    onError: (e) => toast.error(e.message),
  });
  const updateCategory = trpc.bills.updateCategory.useMutation({
    onSuccess: () => { utils.bills.listCategories.invalidate(); setEditCategory(null); toast.success("Category updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteCategory = trpc.bills.deleteCategory.useMutation({
    onSuccess: () => { utils.bills.listCategories.invalidate(); toast.success("Category removed"); },
    onError: (e) => toast.error(e.message),
  });

  const addContact = trpc.supplierContacts.create.useMutation({
    onSuccess: () => { utils.supplierContacts.list.invalidate(); setNewContact({ supplierName: "", contactName: "", role: "", phone: "", email: "", notes: "" }); toast.success("Contact added"); },
    onError: (e) => toast.error(e.message),
  });
  const updateContact = trpc.supplierContacts.update.useMutation({
    onSuccess: () => { utils.supplierContacts.list.invalidate(); setEditContact(null); toast.success("Contact updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteContact = trpc.supplierContacts.delete.useMutation({
    onSuccess: () => { utils.supplierContacts.list.invalidate(); toast.success("Contact removed"); },
    onError: (e) => toast.error(e.message),
  });

  const filteredContacts = contacts.filter((c: any) =>
    !contactSearch ||
    c.supplierName?.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.contactName?.toLowerCase().includes(contactSearch.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Buildings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4" /> Buildings</CardTitle>
          <p className="text-xs text-muted-foreground">Manage the list of buildings used across utility accounts.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {buildings.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                {editBuilding?.id === b.id ? (
                  <div className="flex gap-2 flex-1 mr-2">
                    <Input value={editBuilding.name} onChange={e => setEditBuilding((x: any) => ({ ...x, name: e.target.value }))} className="h-7 text-xs" />
                    <Input value={editBuilding.address ?? ""} onChange={e => setEditBuilding((x: any) => ({ ...x, address: e.target.value }))} placeholder="Address (optional)" className="h-7 text-xs" />
                  </div>
                ) : (
                  <div className="flex-1">
                    <span className="font-medium">{b.name}</span>
                    {b.address && <span className="text-xs text-muted-foreground ml-2">{b.address}</span>}
                    {b.id < 0 && <Badge variant="secondary" className="ml-2 text-[10px]">Default</Badge>}
                  </div>
                )}
                <div className="flex gap-1">
                  {editBuilding?.id === b.id ? (
                    <>
                      <Button size="sm" className="h-6 px-2 text-xs" onClick={() => updateBuilding.mutate({ id: b.id, name: editBuilding.name, address: editBuilding.address })}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditBuilding(null)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      {b.id > 0 && <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditBuilding(b)}><Edit2 className="w-3 h-3" /></Button>}
                      {b.id > 0 && <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { if (confirm(`Remove building "${b.name}"?`)) deleteBuilding.mutate({ id: b.id }); }}><Trash2 className="w-3 h-3 text-red-500" /></Button>}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <Input value={newBuilding.name} onChange={e => setNewBuilding(f => ({ ...f, name: e.target.value }))} placeholder="Building name *" className="h-8 text-sm" />
            <Input value={newBuilding.address} onChange={e => setNewBuilding(f => ({ ...f, address: e.target.value }))} placeholder="Address (optional)" className="h-8 text-sm" />
            <Button size="sm" className="h-8 shrink-0" onClick={() => addBuilding.mutate(newBuilding)} disabled={!newBuilding.name || addBuilding.isPending}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Categories */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Tag className="w-4 h-4" /> Utility Categories</CardTitle>
          <p className="text-xs text-muted-foreground">Manage utility types and their calendar colours.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {categories.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                {editCategory?.id === c.id ? (
                  <div className="flex gap-2 flex-1 mr-2 items-center">
                    <Input value={editCategory.name} onChange={e => setEditCategory((x: any) => ({ ...x, name: e.target.value }))} className="h-7 text-xs" />
                    <input type="color" value={editCategory.colour} onChange={e => setEditCategory((x: any) => ({ ...x, colour: e.target.value }))} className="w-8 h-7 rounded cursor-pointer border" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{ background: c.colour }} />
                    <span className="font-medium capitalize">{c.name}</span>
                    {c.id < 0 && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                  </div>
                )}
                <div className="flex gap-1">
                  {editCategory?.id === c.id ? (
                    <>
                      <Button size="sm" className="h-6 px-2 text-xs" onClick={() => updateCategory.mutate({ id: c.id, name: editCategory.name, colour: editCategory.colour })}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditCategory(null)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      {c.id > 0 && <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditCategory(c)}><Edit2 className="w-3 h-3" /></Button>}
                      {c.id > 0 && <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { if (confirm(`Remove category "${c.name}"?`)) deleteCategory.mutate({ id: c.id }); }}><Trash2 className="w-3 h-3 text-red-500" /></Button>}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t items-center">
            <Input value={newCategory.name} onChange={e => setNewCategory(f => ({ ...f, name: e.target.value }))} placeholder="Category name *" className="h-8 text-sm" />
            <input type="color" value={newCategory.colour} onChange={e => setNewCategory(f => ({ ...f, colour: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border shrink-0" title="Pick colour" />
            <Button size="sm" className="h-8 shrink-0" onClick={() => addCategory.mutate(newCategory)} disabled={!newCategory.name || addCategory.isPending}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Supplier Contacts */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" /> Supplier Contacts</CardTitle>
          <p className="text-xs text-muted-foreground">Store account manager names, phone numbers, and emails per supplier for quick reference.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="Search by supplier or contact name..." className="h-8 text-sm" />
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {filteredContacts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No supplier contacts yet.</p>}
            {filteredContacts.map((c: any) => (
              <div key={c.id} className="p-3 bg-muted/30 rounded text-sm">
                {editContact?.id === c.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={editContact.supplierName ?? ""} onChange={e => setEditContact((x: any) => ({ ...x, supplierName: e.target.value }))} placeholder="Supplier *" className="h-7 text-xs" />
                      <Input value={editContact.contactName ?? ""} onChange={e => setEditContact((x: any) => ({ ...x, contactName: e.target.value }))} placeholder="Contact Name" className="h-7 text-xs" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Input value={editContact.role ?? ""} onChange={e => setEditContact((x: any) => ({ ...x, role: e.target.value }))} placeholder="Role" className="h-7 text-xs" />
                      <Input value={editContact.phone ?? ""} onChange={e => setEditContact((x: any) => ({ ...x, phone: e.target.value }))} placeholder="Phone" className="h-7 text-xs" />
                      <Input value={editContact.email ?? ""} onChange={e => setEditContact((x: any) => ({ ...x, email: e.target.value }))} placeholder="Email" className="h-7 text-xs" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-6 px-2 text-xs" onClick={() => updateContact.mutate({ id: c.id, ...editContact })}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditContact(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.supplierName}</span>
                        {c.contactName && <span className="text-muted-foreground">— {c.contactName}</span>}
                        {c.role && <Badge variant="secondary" className="text-[10px]">{c.role}</Badge>}
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        {c.phone && <a href={`tel:${c.phone}`} className="hover:text-primary">📞 {c.phone}</a>}
                        {c.email && <a href={`mailto:${c.email}`} className="hover:text-primary">✉️ {c.email}</a>}
                      </div>
                      {c.notes && <p className="text-xs text-muted-foreground mt-1 italic">{c.notes}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditContact(c)}><Edit2 className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { if (confirm(`Remove contact for "${c.supplierName}"?`)) deleteContact.mutate({ id: c.id }); }}><Trash2 className="w-3 h-3 text-red-500" /></Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Add new contact */}
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Add New Contact</p>
            <div className="grid grid-cols-2 gap-2">
              <Input value={newContact.supplierName} onChange={e => setNewContact(f => ({ ...f, supplierName: e.target.value }))} placeholder="Supplier name *" className="h-8 text-sm" />
              <Input value={newContact.contactName} onChange={e => setNewContact(f => ({ ...f, contactName: e.target.value }))} placeholder="Contact name" className="h-8 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input value={newContact.role} onChange={e => setNewContact(f => ({ ...f, role: e.target.value }))} placeholder="Role / Title" className="h-8 text-sm" />
              <Input value={newContact.phone} onChange={e => setNewContact(f => ({ ...f, phone: e.target.value }))} placeholder="Phone" className="h-8 text-sm" />
              <Input value={newContact.email} onChange={e => setNewContact(f => ({ ...f, email: e.target.value }))} placeholder="Email" className="h-8 text-sm" />
            </div>
            <div className="flex gap-2">
              <Input value={newContact.notes} onChange={e => setNewContact(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" className="h-8 text-sm flex-1" />
              <Button size="sm" className="h-8 shrink-0" onClick={() => addContact.mutate(newContact)} disabled={!newContact.supplierName || addContact.isPending}>
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto-expense info */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Receipt className="w-4 h-4" /> Auto-Fill into Monthly Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            When you record a bill for a utility account, the system automatically creates a corresponding entry in the Monthly Expenses section (under <strong>Bills &amp; Utilities — [Category]</strong>). This keeps your monthly expense reconciliation up to date without manual re-entry. You can disable this per-bill using the toggle in the "Record Bill" dialog.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
// ─── Payment History Timeline Component ───────────────────────────────────────
function PaymentHistoryTimeline({ accountId, onDeleteBill }: { accountId: number; onDeleteBill: (id: number) => void }) {
  const { data: history, isLoading } = trpc.bills.paymentHistory.useQuery({ accountId }, { enabled: !!accountId });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "paid" | "pending" | "held">("all");

  if (isLoading) return <div className="text-sm text-muted-foreground py-4 text-center">Loading history...</div>;
  if (!history || history.length === 0) return <div className="text-sm text-muted-foreground py-4 text-center">No payment history yet.</div>;

  const filtered = activeFilter === "all" ? history : history.filter(h => h.status === activeFilter);
  const totalPaid = history.filter(h => h.status === "paid").reduce((s, h) => s + parseFloat(h.amount), 0);
  const totalPending = history.filter(h => h.status === "pending").reduce((s, h) => s + parseFloat(h.amount), 0);
  const totalHeld = history.filter(h => h.status === "held").reduce((s, h) => s + parseFloat(h.amount), 0);

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-green-50 dark:bg-green-950/30 rounded p-2">
          <div className="font-bold text-green-700 dark:text-green-400">£{totalPaid.toFixed(2)}</div>
          <div className="text-muted-foreground">Paid</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/30 rounded p-2">
          <div className="font-bold text-blue-700 dark:text-blue-400">£{totalPending.toFixed(2)}</div>
          <div className="text-muted-foreground">Pending</div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/30 rounded p-2">
          <div className="font-bold text-amber-700 dark:text-amber-400">£{totalHeld.toFixed(2)}</div>
          <div className="text-muted-foreground">Held</div>
        </div>
      </div>
      {/* Filter tabs */}
      <div className="flex gap-1">
        {(["all", "paid", "pending", "held"] as const).map(f => (
          <button key={f} onClick={() => setActiveFilter(f)}
            className={`px-2 py-1 text-xs rounded capitalize transition-colors ${activeFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {f}
          </button>
        ))}
      </div>
      {/* Timeline */}
      <div className="relative space-y-2 max-h-72 overflow-y-auto pr-1">
        <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
        {filtered.map(item => {
          const isOverdue = item.status === "pending" && new Date(item.date as any) < new Date();
          const dotColor = item.status === "paid" ? "bg-green-500" : item.status === "held" ? "bg-amber-500" : isOverdue ? "bg-red-500" : "bg-blue-500";
          const dateStr = new Date(item.date as any).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
          return (
            <div key={item.id} className="flex gap-3 pl-7 relative">
              <div className={`absolute left-2 top-2.5 w-2.5 h-2.5 rounded-full border-2 border-background ${dotColor}`} />
              <div className="flex-1 min-w-0 bg-muted/30 rounded p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-sm">£{parseFloat(item.amount).toFixed(2)}</span>
                    <span className="text-muted-foreground truncate">{item.description}</span>
                    {item.consumption && <span className="text-muted-foreground">· {item.consumption}</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.status === "paid" && <Badge className="text-[9px] bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">PAID</Badge>}
                    {item.status === "pending" && !isOverdue && <Badge className="text-[9px] bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-0">PENDING</Badge>}
                    {item.status === "pending" && isOverdue && <Badge className="text-[9px] bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-0">OVERDUE</Badge>}
                    {item.status === "held" && <Badge className="text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-0">HELD</Badge>}
                    {item.type === "bill" && item.fileUrl && (
                      <button onClick={() => setPreviewUrl(item.fileUrl!)} className="text-blue-500 hover:text-blue-700 underline">File</button>
                    )}
                    {item.type === "bill" && (
                      <button onClick={() => { const id = parseInt(item.id.replace("bill-", "")); onDeleteBill(id); }} className="text-red-400 hover:text-red-600 ml-1">✕</button>
                    )}
                  </div>
                </div>
                <div className="text-muted-foreground mt-0.5">{dateStr}{item.note ? ` · ${item.note}` : ""}</div>
                {item.autoExpenseLinkedId && <div className="text-[10px] text-muted-foreground mt-0.5">→ Linked to Expense #{item.autoExpenseLinkedId}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {/* File preview dialog */}
      {previewUrl && (
        <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader><DialogTitle>Attached Document</DialogTitle></DialogHeader>
            {previewUrl.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? (
              <img src={previewUrl} alt="Bill document" className="w-full rounded max-h-[60vh] object-contain" />
            ) : (
              <iframe src={previewUrl} className="w-full h-[60vh] rounded border" title="Bill document" />
            )}
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline text-center block">Open in new tab</a>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function BillsUtilities() {
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddBill, setShowAddBill] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [editAccount, setEditAccount] = useState<any>(null);
  const [autoFillExpense, setAutoFillExpense] = useState(true);
  const [billScannerOpen, setBillScannerOpen] = useState(false);

  const [accountForm, setAccountForm] = useState({
    building: "QLH",
    supplier: "",
    accountNumber: "",
    category: "electricity",
    tariff: "",
    contractStartDate: "",
    contractEndDate: "",
    mpan: "",
    directDebitAmount: "",
    billingDay: "",
    notes: "",
    supplierContactId: null as number | null,
    monthlyBudget: "",
    supplierNotes: "",
  });

  const [billForm, setBillForm] = useState({
    accountId: 0,
    billDate: new Date().toISOString().split("T")[0],
    periodStart: "",
    periodEnd: "",
    amount: "",
    consumptionUnits: "",
    unitType: "",
    notes: "",
  });
  // Listen for Hibba voice form-fill commands
  useHibbaFormFill("/bills-utilities", useCallback((fields: Record<string, any>) => {
    if (fields.amount) setBillForm(f => ({ ...f, amount: String(fields.amount) }));
    if (fields.dueDate || fields.billDate) setBillForm(f => ({ ...f, billDate: fields.dueDate || fields.billDate }));
    if (fields.notes || fields.description) setBillForm(f => ({ ...f, notes: fields.notes || fields.description }));
    if (fields.periodStart) setBillForm(f => ({ ...f, periodStart: fields.periodStart }));
    if (fields.periodEnd) setBillForm(f => ({ ...f, periodEnd: fields.periodEnd }));
    setShowAddBill(true);
  }, [setBillForm]));


  const utils = trpc.useUtils();
  const { setEntityContext } = useVoiceContext();
  useEffect(() => {
    setEntityContext("Viewing Bills & Utilities — supplier bills, utility contracts and payment schedules");
    return () => setEntityContext(null);
  }, [setEntityContext]);

  const { data: summary } = trpc.bills.summary.useQuery();
  const { data: allBuildings = [] } = trpc.bills.listBuildings.useQuery();
  const { data: allCategories = [] } = trpc.bills.listCategories.useQuery();
  const { data: allSupplierContacts = [] } = trpc.supplierContacts.list.useQuery();

  const buildingNames = useMemo(() => allBuildings.map((b: any) => b.name), [allBuildings]);
  const categoryNames = useMemo(() => allCategories.map((c: any) => c.name), [allCategories]);

  const { data: accounts = [], isLoading } = trpc.bills.listAccounts.useQuery(
    buildingFilter !== "all" || categoryFilter !== "all"
      ? { building: buildingFilter !== "all" ? buildingFilter : undefined, category: categoryFilter !== "all" ? categoryFilter : undefined }
      : undefined
  );
  const { data: allAccounts = [] } = trpc.bills.listAccounts.useQuery(undefined);

  const { data: accountDetail } = trpc.bills.getAccount.useQuery(
    { id: selectedAccountId! },
    { enabled: !!selectedAccountId }
  );

  const createAccount = trpc.bills.createAccount.useMutation({
    onSuccess: () => {
      utils.bills.listAccounts.invalidate();
      utils.bills.summary.invalidate();
      setShowAddAccount(false);
      setAccountForm({ building: "QLH", supplier: "", accountNumber: "", category: "electricity", tariff: "", contractStartDate: "", contractEndDate: "", mpan: "", directDebitAmount: "", billingDay: "", notes: "", supplierContactId: null, monthlyBudget: "", supplierNotes: "" });
      toast.success("Account added successfully.");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateAccount = trpc.bills.updateAccount.useMutation({
    onSuccess: () => {
      utils.bills.listAccounts.invalidate();
      utils.bills.summary.invalidate();
      setEditAccount(null);
      toast.success("Account updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteAccount = trpc.bills.deleteAccount.useMutation({
    onSuccess: () => {
      utils.bills.listAccounts.invalidate();
      utils.bills.summary.invalidate();
      setSelectedAccountId(null);
      toast.success("Account deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const addBill = trpc.bills.addBill.useMutation({
    onSuccess: (data) => {
      utils.bills.getAccount.invalidate({ id: billForm.accountId });
      utils.bills.summary.invalidate();
      setShowAddBill(false);
      setBillForm({ accountId: 0, billDate: new Date().toISOString().split("T")[0], periodStart: "", periodEnd: "", amount: "", consumptionUnits: "", unitType: "", notes: "" });
      if (data.isAnomaly) {
        toast.warning(`⚠️ Anomaly Detected — This bill (£${parseFloat(billForm.amount).toFixed(2)}) is 50%+ above the 3-month average (£${data.avg3m}).`);
      } else {
        const expMsg = data.autoExpenseId ? " Auto-filled into Monthly Expenses." : "";
        toast.success(`Bill recorded.${expMsg}`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteBill = trpc.bills.deleteBill.useMutation({
    onSuccess: () => {
      utils.bills.getAccount.invalidate({ id: selectedAccountId! });
      toast.success("Bill deleted");
    },
  });

  return (
      <>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Bills & Utilities</h1>
            <p className="text-muted-foreground text-sm mt-1">Track utility accounts and bills across all AQS buildings</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBillScannerOpen(true)} className="gap-2">
              <ScanLine className="w-4 h-4" /> Scan Bill
            </Button>
            <Button onClick={() => setShowAddAccount(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Add Account
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Accounts</p><p className="text-2xl font-bold">{summary.totalAccounts}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Monthly Direct Debits</p><p className="text-2xl font-bold text-green-600">£{parseFloat(summary.totalMonthlyDD).toLocaleString()}</p></CardContent></Card>
            <Card className={summary.expiringSoon > 0 ? "border-amber-400" : ""}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Contracts Expiring Soon</p><p className={`text-2xl font-bold ${summary.expiringSoon > 0 ? "text-amber-600" : ""}`}>{summary.expiringSoon}</p></CardContent></Card>
            <Card className={summary.expired > 0 ? "border-red-400" : ""}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Contracts Expired</p><p className={`text-2xl font-bold ${summary.expired > 0 ? "text-red-600" : ""}`}>{summary.expired}</p></CardContent></Card>
          </div>
        )}

        {/* Building breakdown */}
        {summary && summary.byBuilding.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {summary.byBuilding.map(b => (
              <Card key={b.building} className="cursor-pointer hover:border-primary transition-colors" onClick={() => setBuildingFilter(buildingFilter === b.building ? "all" : b.building)}>
                <CardContent className="pt-3 pb-3">
                  <p className="text-xs font-medium text-muted-foreground">{b.building}</p>
                  <p className="text-lg font-semibold">{b.count} accounts</p>
                  <p className="text-xs text-muted-foreground">£{parseFloat(b.totalDD).toLocaleString()}/mo DD</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Main Tabs */}
        <Tabs defaultValue="accounts">
          <TabsList>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="calendar">DD Calendar</TabsTrigger>
            <TabsTrigger value="settings" className="gap-1"><Settings className="w-3 h-3" /> Settings</TabsTrigger>
          </TabsList>

          {/* ── Accounts Tab ── */}
          <TabsContent value="accounts" className="mt-4 space-y-4">
            <div className="flex gap-3 flex-wrap">
              <Select value={buildingFilter} onValueChange={setBuildingFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="All Buildings" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Buildings</SelectItem>
                  {buildingNames.map((b: string) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All Categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categoryNames.map((c: string) => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Accounts list */}
              <div className="lg:col-span-1 space-y-2">
                {isLoading && <p className="text-muted-foreground text-sm">Loading accounts...</p>}
                {accounts.length === 0 && !isLoading && (
                  <Card><CardContent className="pt-6 text-center text-muted-foreground text-sm">No utility accounts yet. Click "Add Account" to get started.</CardContent></Card>
                )}
                {accounts.map(acc => (
                  <Card
                    key={acc.id}
                    className={`cursor-pointer transition-colors hover:border-primary ${selectedAccountId === acc.id ? "border-primary bg-primary/5" : ""} ${acc.contractExpired ? "border-red-300" : acc.contractExpiringSoon ? "border-amber-300" : ""}`}
                    onClick={() => setSelectedAccountId(acc.id === selectedAccountId ? null : acc.id)}
                  >
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {categoryIcon(acc.category)}
                          <div>
                            <p className="font-medium text-sm">{acc.supplier}</p>
                            <p className="text-xs text-muted-foreground">{acc.building} · {acc.category}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {acc.directDebitAmount && <p className="text-sm font-semibold">£{parseFloat(acc.directDebitAmount).toFixed(0)}/mo</p>}
                          {acc.billingDay && <p className="text-xs text-muted-foreground">DD: {acc.billingDay}th</p>}
                          {acc.contractExpired && <Badge variant="destructive" className="text-xs">Expired</Badge>}
                          {acc.contractExpiringSoon && !acc.contractExpired && <Badge className="text-xs bg-amber-100 text-amber-800">Expiring Soon</Badge>}
                        </div>
                      </div>
                      {acc.accountNumber && <p className="text-xs text-muted-foreground mt-1">Acc: {acc.accountNumber}</p>}
                      {acc.contractEndDate && (
                        <p className={`text-xs mt-0.5 font-medium ${
                          acc.contractExpired ? 'text-red-600' :
                          acc.contractExpiringSoon ? 'text-amber-600' :
                          'text-muted-foreground'
                        }`}>
                          Contract ends: {new Date(acc.contractEndDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {acc.contractExpired && ' — EXPIRED'}
                          {acc.contractExpiringSoon && !acc.contractExpired && ` — ${Math.ceil((new Date(acc.contractEndDate).getTime() - Date.now()) / 86400000)}d left`}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Account detail */}
              <div className="lg:col-span-2">
                {!selectedAccountId && (
                  <Card className="h-full flex items-center justify-center">
                    <CardContent className="text-center text-muted-foreground py-12">
                      <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p>Select an account to view details and bills</p>
                    </CardContent>
                  </Card>
                )}
                {selectedAccountId && accountDetail && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            {categoryIcon(accountDetail.account.category)}
                            {accountDetail.account.supplier}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">{accountDetail.account.building} · {accountDetail.account.category}</p>
                        </div>
                        <div className="flex gap-2 flex-wrap justify-end">
                          <Button size="sm" variant="outline" onClick={() => setEditAccount(accountDetail.account)}><Edit2 className="w-3 h-3" /></Button>
                          <Button size="sm" variant="outline" onClick={() => { setBillForm(f => ({ ...f, accountId: selectedAccountId })); setShowAddBill(true); }}>
                            <Plus className="w-3 h-3 mr-1" /> Bill
                          </Button>
                          {accountDetail.account.contractEndDate && new Date(accountDetail.account.contractEndDate) < new Date(Date.now() + 60 * 86400000) && (
                            <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-50"
                              onClick={() => {
                                const today = new Date().toISOString().split('T')[0];
                                const newEnd = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];
                                setEditAccount({ ...accountDetail.account, contractStartDate: today, contractEndDate: newEnd });
                              }}
                            >
                              ↺ Renew
                            </Button>
                          )}
                          <Button size="sm" variant="destructive" onClick={() => { if (confirm("Delete this account and all its bills?")) deleteAccount.mutate({ id: selectedAccountId }); }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {accountDetail.account.accountNumber && <div><span className="text-muted-foreground">Account No:</span> <span className="font-medium">{accountDetail.account.accountNumber}</span></div>}
                        {accountDetail.account.mpan && <div><span className="text-muted-foreground">MPAN:</span> <span className="font-medium">{accountDetail.account.mpan}</span></div>}
                        {accountDetail.account.tariff && <div><span className="text-muted-foreground">Tariff:</span> <span className="font-medium">{accountDetail.account.tariff}</span></div>}
                        {accountDetail.account.directDebitAmount && <div><span className="text-muted-foreground">Direct Debit:</span> <span className="font-medium text-green-600">£{parseFloat(accountDetail.account.directDebitAmount).toFixed(2)}/mo</span></div>}
                        {accountDetail.account.billingDay && <div><span className="text-muted-foreground">DD Day:</span> <span className="font-medium">{accountDetail.account.billingDay}{["st","nd","rd"][accountDetail.account.billingDay - 1] ?? "th"} of month</span></div>}
                        {accountDetail.account.contractStartDate && <div><span className="text-muted-foreground">Contract Start:</span> <span className="font-medium">{new Date(accountDetail.account.contractStartDate).toLocaleDateString()}</span></div>}
                        {accountDetail.account.contractEndDate && <div><span className="text-muted-foreground">Contract End:</span> <span className={`font-medium ${new Date(accountDetail.account.contractEndDate) < new Date() ? "text-red-600" : ""}`}>{new Date(accountDetail.account.contractEndDate).toLocaleDateString()}</span></div>}
                        {accountDetail.avg3m !== null && <div><span className="text-muted-foreground">3-Month Avg:</span> <span className="font-medium">£{parseFloat(accountDetail.avg3m!.toString()).toFixed(2)}</span></div>}
                        {accountDetail.account.monthlyBudget && <div><span className="text-muted-foreground">Monthly Budget:</span> <span className="font-medium text-blue-600">£{parseFloat(accountDetail.account.monthlyBudget).toFixed(2)}</span></div>}
                        {accountDetail.account.supplierNotes && <div className="col-span-2"><span className="text-muted-foreground">Supplier Notes:</span> <span className="font-medium">{accountDetail.account.supplierNotes}</span></div>}
                      </div>
                      {accountDetail.account.notes && <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{accountDetail.account.notes}</p>}

                      {/* Sparkline: last 6 bills */}
                      {accountDetail.bills.length >= 2 && (() => {
                        const sparkData = [...accountDetail.bills]
                          .sort((a: any, b: any) => new Date(a.billDate).getTime() - new Date(b.billDate).getTime())
                          .slice(-6)
                          .map((b: any) => ({ date: new Date(b.billDate).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), amount: parseFloat(b.amount) }));
                        const budget = accountDetail.account.monthlyBudget ? parseFloat(accountDetail.account.monthlyBudget) : null;
                        const latest = sparkData[sparkData.length - 1]?.amount ?? 0;
                        const overBudget = budget !== null && latest > budget;
                        return (
                          <div className="p-3 bg-muted/30 rounded-lg">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-medium text-muted-foreground">Bill trend (last {sparkData.length})</p>
                              {budget !== null && (
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${overBudget ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                                  {overBudget ? "Over budget" : "Within budget"}
                                </span>
                              )}
                            </div>
                            <ResponsiveContainer width="100%" height={60}>
                              <LineChart data={sparkData}>
                                <Line type="monotone" dataKey="amount" stroke={overBudget ? "#dc2626" : "#1a4731"} strokeWidth={2} dot={{ r: 3 }} />
                                <RechartsTooltip formatter={(v: number) => [`£${v.toFixed(2)}`, "Amount"]} labelFormatter={(l) => l} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        );
                      })()}

                      {/* Supplier Contact inline card */}
                      {(accountDetail.account as any).supplierContact && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1.5">Supplier Contact</p>
                          <div className="grid grid-cols-2 gap-1 text-sm">
                            {(accountDetail.account as any).supplierContact.contactName && (
                              <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{(accountDetail.account as any).supplierContact.contactName}</span></div>
                            )}
                            {(accountDetail.account as any).supplierContact.role && (
                              <div><span className="text-muted-foreground">Role:</span> <span className="font-medium">{(accountDetail.account as any).supplierContact.role}</span></div>
                            )}
                            {(accountDetail.account as any).supplierContact.phone && (
                              <div><span className="text-muted-foreground">Phone:</span> <a href={`tel:${(accountDetail.account as any).supplierContact.phone}`} className="font-medium text-blue-600 hover:underline">{(accountDetail.account as any).supplierContact.phone}</a></div>
                            )}
                            {(accountDetail.account as any).supplierContact.email && (
                              <div><span className="text-muted-foreground">Email:</span> <a href={`mailto:${(accountDetail.account as any).supplierContact.email}`} className="font-medium text-blue-600 hover:underline">{(accountDetail.account as any).supplierContact.email}</a></div>
                            )}
                          </div>
                        </div>
                      )}

                      <div>
                        <h3 className="font-medium text-sm mb-2 flex items-center gap-2">
                          Payment History
                          <Badge variant="outline" className="text-[10px]">{accountDetail.bills.length} bills</Badge>
                        </h3>
                        <PaymentHistoryTimeline accountId={selectedAccountId!} onDeleteBill={(id) => deleteBill.mutate({ id })} />
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── DD Calendar Tab ── */}
          <TabsContent value="calendar" className="mt-4">
            <DDCalendar accounts={allAccounts} categories={allCategories} />
          </TabsContent>

          {/* ── Settings Tab ── */}
          <TabsContent value="settings" className="mt-4">
            <SettingsPanel />
          </TabsContent>
        </Tabs>
      </div>

      {/* AI Bill Scanner Dialog */}
      <Dialog open={billScannerOpen} onOpenChange={setBillScannerOpen}>
        <DialogContent className="max-w-xl">
          <AiDocumentScanner
            mode="bill"
            onClose={() => setBillScannerOpen(false)}
            onExtracted={(fields, fileUrl) => {
              setBillScannerOpen(false);
              setBillForm(f => ({
                ...f,
                billDate: fields.billDate || f.billDate,
                periodStart: fields.periodStart || f.periodStart,
                periodEnd: fields.periodEnd || f.periodEnd,
                amount: fields.amount ? String(fields.amount) : f.amount,
                consumptionUnits: fields.consumptionUnits ? String(fields.consumptionUnits) : f.consumptionUnits,
                unitType: fields.unitType || f.unitType,
                notes: fields.notes ? `[Scanned] ${fields.notes}` : f.notes,
              }));
              // If an account is selected, open the bill dialog; otherwise prompt to select one
              if (selectedAccountId) {
                setShowAddBill(true);
              } else {
                toast.info("Bill fields extracted — select an account then click \"+ Bill\" to record it.");
              }
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Add Account Dialog */}
      <Dialog open={showAddAccount} onOpenChange={setShowAddAccount}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Utility Account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Building *</Label>
                <Select value={accountForm.building} onValueChange={v => setAccountForm(f => ({ ...f, building: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{buildingNames.map((b: string) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category *</Label>
                <Select value={accountForm.category} onValueChange={v => setAccountForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categoryNames.map((c: string) => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Supplier *</Label>
              <Input value={accountForm.supplier} onChange={e => setAccountForm(f => ({ ...f, supplier: e.target.value }))} placeholder="e.g. British Gas" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Account Number</Label><Input value={accountForm.accountNumber} onChange={e => setAccountForm(f => ({ ...f, accountNumber: e.target.value }))} /></div>
              <div><Label>MPAN / Meter Ref</Label><Input value={accountForm.mpan} onChange={e => setAccountForm(f => ({ ...f, mpan: e.target.value }))} /></div>
            </div>
            <div><Label>Tariff / Plan</Label><Input value={accountForm.tariff} onChange={e => setAccountForm(f => ({ ...f, tariff: e.target.value }))} placeholder="e.g. Standard Variable" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contract Start</Label><Input type="date" value={accountForm.contractStartDate} onChange={e => setAccountForm(f => ({ ...f, contractStartDate: e.target.value }))} /></div>
              <div><Label>Contract End</Label><Input type="date" value={accountForm.contractEndDate} onChange={e => setAccountForm(f => ({ ...f, contractEndDate: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Monthly Direct Debit (£)</Label><Input type="number" step="0.01" value={accountForm.directDebitAmount} onChange={e => setAccountForm(f => ({ ...f, directDebitAmount: e.target.value }))} placeholder="0.00" /></div>
              <div><Label>DD Day of Month (1–31)</Label><Input type="number" min="1" max="31" value={accountForm.billingDay} onChange={e => setAccountForm(f => ({ ...f, billingDay: e.target.value }))} placeholder="e.g. 15" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Monthly Budget (£)</Label><Input type="number" step="0.01" value={accountForm.monthlyBudget} onChange={e => setAccountForm(f => ({ ...f, monthlyBudget: e.target.value }))} placeholder="0.00" /></div>
              <div><Label>Supplier Notes</Label><Textarea value={accountForm.supplierNotes} onChange={e => setAccountForm(f => ({ ...f, supplierNotes: e.target.value }))} placeholder="Contact tips, escalation path, account manager name…" rows={3} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={accountForm.notes} onChange={e => setAccountForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            <div>
              <Label>Supplier Contact (optional)</Label>
              <Select value={accountForm.supplierContactId ? String(accountForm.supplierContactId) : "none"} onValueChange={v => setAccountForm(f => ({ ...f, supplierContactId: v === "none" ? null : parseInt(v) }))}>
                <SelectTrigger><SelectValue placeholder="Link a supplier contact" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(allSupplierContacts as any[]).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.supplierName}{c.contactName ? ` — ${c.contactName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddAccount(false)}>Cancel</Button>
            <Button onClick={() => createAccount.mutate({ ...accountForm, billingDay: accountForm.billingDay ? parseInt(accountForm.billingDay) : undefined })} disabled={!accountForm.supplier || createAccount.isPending}>
              {createAccount.isPending ? "Adding..." : "Add Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Account Dialog */}
      {editAccount && (
        <Dialog open={!!editAccount} onOpenChange={() => setEditAccount(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Account</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Building</Label>
                  <Select value={editAccount.building} onValueChange={v => setEditAccount((a: any) => ({ ...a, building: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{buildingNames.map((b: string) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={editAccount.category} onValueChange={v => setEditAccount((a: any) => ({ ...a, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{categoryNames.map((c: string) => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Supplier</Label><Input value={editAccount.supplier} onChange={e => setEditAccount((a: any) => ({ ...a, supplier: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Account Number</Label><Input value={editAccount.accountNumber ?? ""} onChange={e => setEditAccount((a: any) => ({ ...a, accountNumber: e.target.value }))} /></div>
                <div><Label>Direct Debit (£/mo)</Label><Input type="number" step="0.01" value={editAccount.directDebitAmount ?? ""} onChange={e => setEditAccount((a: any) => ({ ...a, directDebitAmount: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>DD Day of Month (1–31)</Label><Input type="number" min="1" max="31" value={editAccount.billingDay ?? ""} onChange={e => setEditAccount((a: any) => ({ ...a, billingDay: e.target.value ? parseInt(e.target.value) : null }))} placeholder="e.g. 15" /></div>
                <div><Label>MPAN / Meter Ref</Label><Input value={editAccount.mpan ?? ""} onChange={e => setEditAccount((a: any) => ({ ...a, mpan: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Monthly Budget (£)</Label><Input type="number" step="0.01" value={editAccount.monthlyBudget ?? ""} onChange={e => setEditAccount((a: any) => ({ ...a, monthlyBudget: e.target.value }))} placeholder="0.00" /></div>
                <div><Label>Supplier Notes</Label><Textarea value={editAccount.supplierNotes ?? ""} onChange={e => setEditAccount((a: any) => ({ ...a, supplierNotes: e.target.value }))} placeholder="Contact tips, escalation path, account manager name…" rows={3} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Contract Start</Label><Input type="date" value={editAccount.contractStartDate ? new Date(editAccount.contractStartDate).toISOString().split("T")[0] : ""} onChange={e => setEditAccount((a: any) => ({ ...a, contractStartDate: e.target.value }))} /></div>
                <div><Label>Contract End</Label><Input type="date" value={editAccount.contractEndDate ? new Date(editAccount.contractEndDate).toISOString().split("T")[0] : ""} onChange={e => setEditAccount((a: any) => ({ ...a, contractEndDate: e.target.value }))} /></div>
              </div>
              <div><Label>Notes</Label><Textarea value={editAccount.notes ?? ""} onChange={e => setEditAccount((a: any) => ({ ...a, notes: e.target.value }))} rows={2} /></div>
              <div>
                <Label>Supplier Contact (optional)</Label>
                <Select value={editAccount.supplierContactId ? String(editAccount.supplierContactId) : "none"} onValueChange={v => setEditAccount((a: any) => ({ ...a, supplierContactId: v === "none" ? null : parseInt(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Link a supplier contact" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(allSupplierContacts as any[]).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.supplierName}{c.contactName ? ` — ${c.contactName}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditAccount(null)}>Cancel</Button>
              <Button onClick={() => updateAccount.mutate({ id: editAccount.id, ...editAccount, contractStartDate: editAccount.contractStartDate ? new Date(editAccount.contractStartDate).toISOString().split("T")[0] : null, contractEndDate: editAccount.contractEndDate ? new Date(editAccount.contractEndDate).toISOString().split("T")[0] : null, billingDay: editAccount.billingDay ?? null })} disabled={updateAccount.isPending}>
                {updateAccount.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Bill Dialog */}
      <Dialog open={showAddBill} onOpenChange={setShowAddBill}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Bill</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Bill Date *</Label><Input type="date" value={billForm.billDate} onChange={e => setBillForm(f => ({ ...f, billDate: e.target.value }))} /></div>
            <div><Label>Amount (£) *</Label><Input type="number" step="0.01" value={billForm.amount} onChange={e => setBillForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Period Start</Label><Input type="date" value={billForm.periodStart} onChange={e => setBillForm(f => ({ ...f, periodStart: e.target.value }))} /></div>
              <div><Label>Period End</Label><Input type="date" value={billForm.periodEnd} onChange={e => setBillForm(f => ({ ...f, periodEnd: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Consumption</Label><Input type="number" step="0.001" value={billForm.consumptionUnits} onChange={e => setBillForm(f => ({ ...f, consumptionUnits: e.target.value }))} placeholder="e.g. 450" /></div>
              <div><Label>Unit</Label><Input value={billForm.unitType} onChange={e => setBillForm(f => ({ ...f, unitType: e.target.value }))} placeholder="kWh / m³" /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={billForm.notes} onChange={e => setBillForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded">
              <div>
                <p className="text-sm font-medium">Auto-fill into Monthly Expenses</p>
                <p className="text-xs text-muted-foreground">Creates a matching expense entry automatically</p>
              </div>
              <Switch checked={autoFillExpense} onCheckedChange={setAutoFillExpense} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBill(false)}>Cancel</Button>
            <Button onClick={() => addBill.mutate({ ...billForm, accountId: selectedAccountId!, autoFillExpense })} disabled={!billForm.amount || !billForm.billDate || addBill.isPending}>
              {addBill.isPending ? "Saving..." : "Record Bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
  );
}
