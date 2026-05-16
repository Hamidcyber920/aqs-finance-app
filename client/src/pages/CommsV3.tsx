import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Send, Plus, Eye, Edit2, Trash2, Clock, AlertCircle, Sparkles } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

const CATEGORIES = [
  { value: "trustee_meeting", label: "Trustee Meeting" },
  { value: "donor_thankyou", label: "Donor Thank You" },
  { value: "gift_aid_declaration", label: "Gift Aid Declaration" },
  { value: "commission_response", label: "Commission Response" },
  { value: "staff_bulletin", label: "Staff Bulletin" },
  { value: "supplier_query", label: "Supplier Query" },
  { value: "training_invite", label: "Training Invite" },
  { value: "general", label: "General" },
] as const;

type Category = typeof CATEGORIES[number]["value"];

const CATEGORY_COLORS: Record<Category, string> = {
  trustee_meeting: "bg-purple-100 text-purple-800 border-purple-200",
  donor_thankyou: "bg-green-100 text-green-800 border-green-200",
  gift_aid_declaration: "bg-blue-100 text-blue-800 border-blue-200",
  commission_response: "bg-orange-100 text-orange-800 border-orange-200",
  staff_bulletin: "bg-amber-100 text-amber-800 border-amber-200",
  supplier_query: "bg-gray-100 text-gray-700 border-gray-200",
  training_invite: "bg-teal-100 text-teal-800 border-teal-200",
  general: "bg-gray-100 text-gray-700 border-gray-200",
};

function CategoryBadge({ category }: { category: Category }) {
  const label = CATEGORIES.find(c => c.value === category)?.label ?? category;
  return <span className={`px-2 py-0.5 rounded text-xs font-medium border ${CATEGORY_COLORS[category]}`}>{label}</span>;
}

const RECIPIENT_GROUPS = [
  { value: "trustees_all", label: "All Trustees" },
  { value: "staff_all", label: "All Staff" },
  { value: "donors_all", label: "All Donors" },
  { value: "donors_major", label: "Major Donors" },
  { value: "donors_monthly", label: "Monthly Donors" },
  { value: "donors_eid", label: "Eid Donors" },
  { value: "donors_friday", label: "Friday Donors" },
  { value: "students_current", label: "Current Students" },
  { value: "suppliers", label: "Suppliers" },
  { value: "individual", label: "Individual" },
  { value: "custom", label: "Custom List" },
] as const;

type RecipientGroup = typeof RECIPIENT_GROUPS[number]["value"];

const EMPTY_TEMPLATE = {
  name: "",
  category: "general" as Category,
  type: "email" as "email" | "sms" | "letter",
  subject: "",
  body: "",
};

const EMPTY_BULK = {
  templateId: undefined as number | undefined,
  subject: "",
  body: "",
  type: "email" as "email" | "sms" | "letter",
  recipientGroup: "staff_all" as RecipientGroup,
};

export default function CommsV3Page() {
  useAuth();
  useEffect(() => {
  }, []);

  const utils = trpc.useUtils();

  const [tab, setTab] = useState("templates");
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [editTemplate, setEditTemplate] = useState<any>(null);
  const [templateForm, setTemplateForm] = useState({ ...EMPTY_TEMPLATE });
  const [bulkForm, setBulkForm] = useState({ ...EMPTY_BULK });
  const [previewContent, setPreviewContent] = useState<{ subject: string; body: string } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");

  const templates = trpc.commsV3.listTemplates.useQuery({
    category: categoryFilter === "all" ? undefined : categoryFilter,
  });
  const outbox = trpc.commsV3.listOutbox.useQuery({ limit: 50 });

  const upsertTemplate = trpc.commsV3.upsertTemplate.useMutation({
    onSuccess: () => {
      toast.success(editTemplate ? "Template updated" : "Template saved");
      setShowTemplateDialog(false);
      setEditTemplate(null);
      setTemplateForm({ ...EMPTY_TEMPLATE });
      utils.commsV3.listTemplates.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTemplate = trpc.commsV3.deleteTemplate.useMutation({
    onSuccess: () => { toast.success("Template deleted"); utils.commsV3.listTemplates.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const sendBulk = trpc.commsV3.sendBulk.useMutation({
    onSuccess: (d) => {
      toast.success(`Queued for ${d.sentCount} recipients`);
      setShowBulkDialog(false);
      setBulkForm({ ...EMPTY_BULK });
      utils.commsV3.listOutbox.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const aiCompose = trpc.commsV3.aiCompose.useMutation({
    onSuccess: (d) => { setPreviewContent({ subject: d.subject ?? "", body: d.body }); setShowPreviewDialog(true); },
    onError: (e) => toast.error(e.message),
  });

  const handleEditTemplate = (t: any) => {
    setEditTemplate(t);
    setTemplateForm({ name: t.name, category: t.category, type: t.type, subject: t.subject ?? "", body: t.body });
    setShowTemplateDialog(true);
  };

  const handleSaveTemplate = () => {
    upsertTemplate.mutate({ id: editTemplate?.id, ...templateForm });
  };

  const handleUseTemplate = (t: any) => {
    setBulkForm(f => ({ ...f, templateId: t.id, subject: t.subject ?? "", body: t.body, type: t.type }));
    setShowBulkDialog(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Communications Hub V3</h1>
          <p className="text-sm text-gray-500 mt-1">Template library, bulk send, outbox log — email, SMS & letters</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowBulkDialog(true)}>
            <Send className="h-4 w-4 mr-1" />Bulk Send
          </Button>
          <Button size="sm" onClick={() => { setEditTemplate(null); setTemplateForm({ ...EMPTY_TEMPLATE }); setShowTemplateDialog(true); }}>
            <Plus className="h-4 w-4 mr-1" />New Template
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="templates">Template Library</TabsTrigger>
          <TabsTrigger value="outbox">Outbox Log</TabsTrigger>
        </TabsList>

        {/* ── Templates Tab ── */}
        <TabsContent value="templates" className="space-y-4 mt-4">
          <div className="flex gap-2 flex-wrap">
            <Button variant={categoryFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setCategoryFilter("all")}>All</Button>
            {CATEGORIES.map(c => (
              <Button key={c.value} variant={categoryFilter === c.value ? "default" : "outline"} size="sm" onClick={() => setCategoryFilter(c.value)}>
                {c.label}
              </Button>
            ))}
          </div>

          {templates.isLoading ? (
            <div className="text-center text-gray-400 py-8">Loading templates...</div>
          ) : (templates.data ?? []).length === 0 ? (
            <div className="text-center text-gray-400 py-8">No templates yet. Click "New Template" to create one.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(templates.data ?? []).map((t: any) => (
                <Card key={t.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-semibold">{t.name}</CardTitle>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="AI Preview" onClick={() => aiCompose.mutate({ category: t.category, type: t.type })}>
                          <Sparkles className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEditTemplate(t)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => { if (confirm("Delete this template?")) deleteTemplate.mutate({ id: t.id }); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <CategoryBadge category={t.category} />
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 capitalize">{t.type}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {t.subject && <p className="text-xs text-gray-500 mb-1 font-medium">Subject: {t.subject}</p>}
                    <p className="text-xs text-gray-600 line-clamp-3">{t.body}</p>
                    <Button size="sm" variant="outline" className="mt-3 w-full h-7 text-xs" onClick={() => handleUseTemplate(t)}>
                      <Send className="h-3 w-3 mr-1" />Use Template
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Outbox Tab ── */}
        <TabsContent value="outbox" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-left">Recipient Group</th>
                      <th className="p-3 text-left">Type</th>
                      <th className="p-3 text-left">Subject / Body</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">Sent At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outbox.isLoading ? (
                      <tr><td colSpan={5} className="p-6 text-center text-gray-400">Loading...</td></tr>
                    ) : (outbox.data ?? []).length === 0 ? (
                      <tr><td colSpan={5} className="p-6 text-center text-gray-400">No messages sent yet.</td></tr>
                    ) : (outbox.data ?? []).map((m: any) => (
                      <tr key={m.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 capitalize">{m.recipientGroup?.replace(/_/g, " ")}</td>
                        <td className="p-3 capitalize">{m.type}</td>
                        <td className="p-3 max-w-xs truncate">{m.subject ?? (m.body ?? "").slice(0, 50)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${m.status === "sent" ? "bg-green-100 text-green-800" : m.status === "failed" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="p-3 text-gray-500">{m.sentAt ? new Date(m.sentAt).toLocaleString("en-GB") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Template Create/Edit Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={(o) => { if (!o) { setShowTemplateDialog(false); setEditTemplate(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editTemplate ? "Edit Template" : "New Template"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Friday Jumu'ah Reminder" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={templateForm.category} onValueChange={(v) => setTemplateForm(f => ({ ...f, category: v as Category }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={templateForm.type} onValueChange={(v) => setTemplateForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="letter">Letter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {templateForm.type === "email" && (
              <div>
                <Label>Email Subject</Label>
                <Input value={templateForm.subject} onChange={e => setTemplateForm(f => ({ ...f, subject: e.target.value }))} placeholder="Subject line..." />
              </div>
            )}
            <div>
              <Label>Message Body *</Label>
              <p className="text-xs text-gray-500 mb-1">Use {"{{name}}"} for recipient name, {"{{date}}"} for today's date</p>
              <textarea
                className="w-full border rounded p-3 text-sm h-48 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={templateForm.body}
                onChange={e => setTemplateForm(f => ({ ...f, body: e.target.value }))}
                placeholder="Dear {{name}},&#10;AssalamuAlaikum&#10;&#10;..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowTemplateDialog(false); setEditTemplate(null); }}>Cancel</Button>
            <Button onClick={handleSaveTemplate} disabled={upsertTemplate.isPending || !templateForm.name || !templateForm.body}>
              {upsertTemplate.isPending ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Send Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Bulk Send Message</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Recipient Group</Label>
              <Select value={bulkForm.recipientGroup} onValueChange={(v) => setBulkForm(f => ({ ...f, recipientGroup: v as RecipientGroup }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECIPIENT_GROUPS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={bulkForm.type} onValueChange={(v) => setBulkForm(f => ({ ...f, type: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="letter">Letter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {bulkForm.type === "email" && (
              <div>
                <Label>Subject *</Label>
                <Input value={bulkForm.subject} onChange={e => setBulkForm(f => ({ ...f, subject: e.target.value }))} placeholder="Email subject..." />
              </div>
            )}
            <div>
              <Label>Message Body *</Label>
              <textarea
                className="w-full border rounded p-3 text-sm h-32 resize-none"
                value={bulkForm.body}
                onChange={e => setBulkForm(f => ({ ...f, body: e.target.value }))}
                placeholder="Dear {{name}},&#10;AssalamuAlaikum..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDialog(false)}>Cancel</Button>
            <Button
              onClick={() => sendBulk.mutate({ ...bulkForm, subject: bulkForm.subject || "No subject" })}
              disabled={sendBulk.isPending || !bulkForm.body}
            >
              {sendBulk.isPending ? "Sending..." : "Send Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-indigo-500" />AI-Composed Preview</DialogTitle></DialogHeader>
          {previewContent && (
            <div className="space-y-3">
              {previewContent.subject && (
                <div className="bg-gray-50 rounded p-3">
                  <p className="text-xs text-gray-500 mb-1">Subject</p>
                  <p className="font-medium">{previewContent.subject}</p>
                </div>
              )}
              <div className="bg-gray-50 rounded p-3">
                <p className="text-xs text-gray-500 mb-1">Body</p>
                <pre className="text-sm whitespace-pre-wrap font-sans">{previewContent.body}</pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowPreviewDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
