import { useState, useRef, useMemo, useEffect } from "react";
import DOMPurify from "dompurify";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Mail, MailOpen, AlertTriangle, RefreshCw, Plus, Search, Zap, FileText,
  MoveRight, UserCheck, Archive, CheckCircle, ChevronRight, ChevronLeft, Inbox, Loader2,
  Upload, Eye, Clock, Tag, X, Paperclip, Filter, CalendarDays, ChevronDown,
  SquareCheck, Trash2, Flag
} from "lucide-react";
import { fmtDate } from "@/lib/dateUtils";

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  normal: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  low: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const STATUS_ICONS: Record<string, any> = {
  unread: Mail,
  read: MailOpen,
  actioned: CheckCircle,
  archived: Archive,
};

// Quick date range presets
const DATE_PRESETS = [
  { label: "Today", getValue: () => { const d = new Date(); d.setHours(0,0,0,0); return { from: d.getTime(), to: Date.now() }; } },
  { label: "Last 7 days", getValue: () => ({ from: Date.now() - 7*24*60*60*1000, to: Date.now() }) },
  { label: "Last 30 days", getValue: () => ({ from: Date.now() - 30*24*60*60*1000, to: Date.now() }) },
  { label: "This month", getValue: () => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return { from: d.getTime(), to: Date.now() }; } },
];

export default function CommsInboxPage() {
  const utils = trpc.useUtils();

  // ── State ─────────────────────────────────────────────────────────────────
  const [selectedSectionId, setSelectedSectionId] = useState<number | undefined>(undefined);
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<number | undefined>(undefined);
  const [dateTo, setDateTo] = useState<number | undefined>(undefined);
  const [activeDatePreset, setActiveDatePreset] = useState<string | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Bulk selection
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<number>>(new Set());
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState(false);
  const [bulkMoveTargetSectionId, setBulkMoveTargetSectionId] = useState<string>("");

  // Dialogs
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [showSectionDialog, setShowSectionDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [movingEmailId, setMovingEmailId] = useState<number | null>(null);
  const [moveTargetSectionId, setMoveTargetSectionId] = useState<string>("");
  const [sectionForm, setSectionForm] = useState({ name: "", description: "", color: "#6366f1", icon: "Mail" });
  const [pushForm, setPushForm] = useState({
    fromEmail: "", fromName: "", subject: "", bodyText: "", priority: "normal" as const, sectionId: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reply state
  const [replyBody, setReplyBody] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);

  // Gmail push webhook registration state
  const [showWebhookDialog, setShowWebhookDialog] = useState(false);

  // Compose new email state
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [composeForm, setComposeForm] = useState({
    to: "",
    toName: "",
    subject: "",
    body: "",
    priority: "normal" as "urgent" | "high" | "normal" | "low",
    sectionId: "",
  });
  const [webhookUrl, setWebhookUrl] = useState("");

  // ── Queries ───────────────────────────────────────────────────────────────
  useEffect(() => {
  }, []);

  const { data: sections = [], refetch: refetchSections } = trpc.commsInbox.listSections.useQuery();
  const { data: stats } = trpc.commsInbox.getInboxStats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: unreadCounts } = trpc.commsInbox.getSectionUnreadCounts.useQuery(undefined, { refetchInterval: 30000 });
  const { data: priorityStats } = (trpc as any).commsInbox.getPriorityStats.useQuery(undefined, { refetchInterval: 60000 });
  const { data: syncTimeData } = (trpc as any).commsInbox.getLastSyncTime.useQuery(undefined, { refetchInterval: 60000 });

  const emailQueryInput = useMemo(() => ({
    sectionId: selectedSectionId,
    status: statusFilter !== "all" ? statusFilter as any : undefined,
    priority: priorityFilter !== "all" ? priorityFilter as any : undefined,
    search: search || undefined,
    dateFrom,
    dateTo,
    limit: 100,
  }), [selectedSectionId, statusFilter, priorityFilter, search, dateFrom, dateTo]);

  const { data: emails = [], isLoading: emailsLoading, refetch: refetchEmails } = trpc.commsInbox.listEmails.useQuery(
    emailQueryInput,
    { refetchInterval: 60000 }
  );

  const { data: emailDetail, refetch: refetchDetail } = trpc.commsInbox.getEmail.useQuery(
    { id: selectedEmailId! },
    { enabled: !!selectedEmailId }
  );

  // Templates for reply
  const { data: templates = [] } = trpc.commsV3.listTemplates.useQuery({});
  // Section reply templates
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [templateForm, setTemplateForm] = useState({ id: undefined as number | undefined, title: "", body: "" });
  const { data: sectionTemplates = [], refetch: refetchSectionTemplates } = (trpc as any).commsInbox.listSectionTemplates.useQuery(
    { sectionId: selectedSectionId ?? null },
    { enabled: true }
  );
  const upsertSectionTemplate = (trpc as any).commsInbox.upsertSectionTemplate.useMutation({
    onSuccess: () => { toast.success("Template saved"); setTemplateForm({ id: undefined, title: "", body: "" }); refetchSectionTemplates(); },
    onError: (e: any) => toast.error(`Failed: ${e.message}`),
  });
  const deleteSectionTemplate = (trpc as any).commsInbox.deleteSectionTemplate.useMutation({
    onSuccess: () => { toast.success("Template deleted"); refetchSectionTemplates(); },
    onError: (e: any) => toast.error(`Failed: ${e.message}`),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const fetchGmail = trpc.commsInbox.fetchFromGmail.useMutation({
    onSuccess: (data) => {
      toast.success(`Gmail sync complete — ${data.imported} new, ${data.skipped} already imported`);
      refetchEmails();
    },
    onError: (e) => toast.error(`Gmail sync failed: ${e.message}`),
  });

  const pushEmail = trpc.commsInbox.pushEmail.useMutation({
    onSuccess: () => {
      toast.success("Email added to inbox");
      setShowPushDialog(false);
      setPushForm({ fromEmail: "", fromName: "", subject: "", bodyText: "", priority: "normal", sectionId: "" });
      refetchEmails();
    },
    onError: (e) => toast.error(`Failed to add email: ${e.message}`),
  });

  const updateEmail = trpc.commsInbox.updateEmail.useMutation({
    onSuccess: () => { refetchEmails(); refetchDetail(); },
    onError: (e) => toast.error(`Update failed: ${e.message}`),
  });

  const bulkAction = trpc.commsInbox.bulkAction.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.updated} email(s) updated`);
      setSelectedEmailIds(new Set());
      setShowBulkMoveDialog(false);
      setBulkMoveTargetSectionId("");
      refetchEmails();
    },
    onError: (e) => toast.error(`Bulk action failed: ${e.message}`),
  });

  const aiSummarise = trpc.commsInbox.aiSummariseEmail.useMutation({
    onSuccess: () => { toast.success("AI summary ready"); refetchDetail(); },
    onError: (e) => toast.error(`AI summary failed: ${e.message}`),
  });

  const ocrAttachment = trpc.commsInbox.ocrAttachment.useMutation({
    onSuccess: () => { toast.success("OCR complete"); refetchDetail(); },
    onError: (e) => toast.error(`OCR failed: ${e.message}`),
  });

  const uploadAttachment = trpc.commsInbox.uploadAttachment.useMutation({
    onSuccess: () => { toast.success("Attachment uploaded"); refetchDetail(); },
    onError: (e) => toast.error(`Upload failed: ${e.message}`),
  });

  const upsertSection = trpc.commsInbox.upsertSection.useMutation({
    onSuccess: () => {
      toast.success("Section saved");
      setShowSectionDialog(false);
      setSectionForm({ name: "", description: "", color: "#6366f1", icon: "Mail" });
      refetchSections();
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  const replyToEmail = trpc.commsInbox.replyToEmail.useMutation({
    onSuccess: (data) => {
      toast.success(`Reply sent to ${data.to}`);
      setReplyBody("");
      setSelectedTemplateId("");
      refetchDetail();
      refetchEmails();
    },
    onError: (e) => toast.error(`Reply failed: ${e.message}`),
  });

  const registerGmailPush = trpc.commsInbox.registerGmailPush.useMutation({
    onSuccess: (data) => {
      toast.success(`Gmail push registered — expires ${fmtDate(new Date(data.expiresAt))}`);
      setShowWebhookDialog(false);
    },
    onError: (e) => toast.error(`Webhook registration failed: ${e.message}`),
  });

  const deleteSection = trpc.commsInbox.deleteSection.useMutation({
    onSuccess: () => { toast.success("Section deleted"); refetchSections(); },
    onError: (e) => toast.error(`Delete failed: ${e.message}`),
  });

  const suggestRepliesMut = (trpc as any).commsInbox.suggestReplies.useMutation({
    onSuccess: (data: any) => { setAiSuggestions(data.replies); toast.success("3 AI reply suggestions ready"); },
    onError: (e: any) => toast.error(`AI suggestions failed: ${e.message}`),
  });

  const linkToReceipt = trpc.commsInbox.linkToReceipt.useMutation({
    onSuccess: () => {
      toast.success("Email linked to receipt");
      setShowLinkReceiptDialog(false);
      setReceiptSearchQuery("");
      setSelectedReceiptId(null);
      setLinkReceiptNote("");
      refetchDetail();
    },
    onError: (e) => toast.error(`Link failed: ${e.message}`),
  });

  const markAllRead = trpc.commsInbox.markAllRead.useMutation({
    onSuccess: () => {
      toast.success("All messages marked as read");
      refetchEmails();
      utils.commsInbox.getSectionUnreadCounts.invalidate();
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  const composeEmail = (trpc as any).commsInbox.composeEmail.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Email sent to ${data.to}`);
      setShowComposeDialog(false);
      setComposeForm({ to: "", toName: "", subject: "", body: "", priority: "normal", sectionId: "" });
      refetchEmails();
    },
    onError: (e: any) => toast.error(`Failed to send: ${e.message}`),
  });

  // Swipe-to-archive state
  const [swipingEmailId, setSwipingEmailId] = useState<number | null>(null);
  const [swipeX, setSwipeX] = useState(0);
  const swipeTouchStartX = useRef(0);
  const swipeTouchStartY = useRef(0);
  const handleSwipeTouchStart = (e: React.TouchEvent, emailId: number) => {
    swipeTouchStartX.current = e.touches[0].clientX;
    swipeTouchStartY.current = e.touches[0].clientY;
    setSwipingEmailId(emailId);
    setSwipeX(0);
  };
  const handleSwipeTouchMove = (e: React.TouchEvent, emailId: number) => {
    if (swipingEmailId !== emailId) return;
    const dx = e.touches[0].clientX - swipeTouchStartX.current;
    const dy = e.touches[0].clientY - swipeTouchStartY.current;
    if (Math.abs(dy) > Math.abs(dx)) { setSwipingEmailId(null); return; }
    if (dx < 0) setSwipeX(Math.max(dx, -80));
  };
  const handleSwipeTouchEnd = (emailId: number) => {
    if (swipeX < -60) {
      updateEmail.mutate({ id: emailId, status: "archived" });
      toast.success("Archived");
    }
    setSwipingEmailId(null);
    setSwipeX(0);
  };

  // Inline attachment preview state
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; mimeType: string; filename: string } | null>(null);

  const classifyPriority = trpc.commsInbox.classifyPriority.useMutation({
    onSuccess: (data) => {
      toast.success(`Priority set to ${data.priority} — ${data.reason}`);
      refetchEmails();
      refetchDetail();
    },
    onError: (e) => toast.error(`Classification failed: ${e.message}`),
  });

  // Link to Receipt dialog state
  const [showLinkReceiptDialog, setShowLinkReceiptDialog] = useState(false);
  const [receiptSearchQuery, setReceiptSearchQuery] = useState("");
  const [selectedReceiptId, setSelectedReceiptId] = useState<number | null>(null);
  const [linkReceiptNote, setLinkReceiptNote] = useState("");

  const { data: receiptSearchResults = [] } = trpc.commsInbox.searchReceiptsForLink.useQuery(
    { query: receiptSearchQuery },
    { enabled: receiptSearchQuery.length >= 2 }
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleMoveSection = () => {
    if (!movingEmailId || !moveTargetSectionId) return;
    updateEmail.mutate({ id: movingEmailId, sectionId: parseInt(moveTargetSectionId) });
    setShowMoveDialog(false);
    setMovingEmailId(null);
    setMoveTargetSectionId("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedEmailId || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadAttachment.mutate({
        emailId: selectedEmailId,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        base64Data: base64,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDatePreset = (preset: typeof DATE_PRESETS[0]) => {
    if (activeDatePreset === preset.label) {
      setActiveDatePreset(null);
      setDateFrom(undefined);
      setDateTo(undefined);
    } else {
      const { from, to } = preset.getValue();
      setActiveDatePreset(preset.label);
      setDateFrom(from);
      setDateTo(to);
    }
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setPriorityFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
    setActiveDatePreset(null);
    setSearch("");
  };

  const hasActiveFilters = statusFilter !== "all" || priorityFilter !== "all" || dateFrom !== undefined || search !== "";

  // Bulk selection helpers
  const allEmailIds = emails.map((e: any) => e.id);
  const allSelected = allEmailIds.length > 0 && allEmailIds.every((id: number) => selectedEmailIds.has(id));
  const someSelected = selectedEmailIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedEmailIds(new Set());
    } else {
      setSelectedEmailIds(new Set(allEmailIds));
    }
  };

  const toggleSelectEmail = (id: number) => {
    setSelectedEmailIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Template apply in reply
  const handleApplyTemplate = (templateId: string) => {
    const t = templates.find((t: any) => String(t.id) === templateId);
    if (t) {
      setReplyBody((t as any).body || "");
      setSelectedTemplateId(templateId);
    }
  };

  const selectedEmail = emailDetail?.email;
  const attachments = emailDetail?.attachments ?? [];
  const activity = emailDetail?.activity ?? [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-screen bg-[#0a0f1e] overflow-hidden">
      {/* ── Left: Section sidebar ──────────────────────────────────────────── */}
      <div className={`${selectedEmail ? "hidden md:flex" : "flex"} w-full md:w-56 border-r border-white/10 flex-col bg-[#0d1426] flex-shrink-0`}>
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-1">
            <span className="text-white font-semibold text-sm flex items-center gap-2">
              <Inbox className="w-4 h-4 text-indigo-400" /> Comms Inbox
            </span>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400 hover:text-white"
              onClick={() => setShowSectionDialog(true)}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
          {/* Priority stats bar */}
          {priorityStats && priorityStats.total > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {priorityStats.urgent > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-semibold">
                  {priorityStats.urgent} urgent
                </span>
              )}
              {priorityStats.high > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  {priorityStats.high} high
                </span>
              )}
              {priorityStats.normal > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  {priorityStats.normal} normal
                </span>
              )}
              {priorityStats.low > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-500/20 text-gray-400 border border-gray-500/30">
                  {priorityStats.low} low
                </span>
              )}
            </div>
          )}
          {/* Last sync indicator */}
          {syncTimeData?.lastSyncedAt ? (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
              <span className="text-[10px] text-gray-500">
                Synced {Math.round((Date.now() - syncTimeData.lastSyncedAt) / 60000)} min ago
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-600 flex-shrink-0" />
              <span className="text-[10px] text-gray-600">Not yet synced</span>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {/* All inbox */}
          <button
            onClick={() => setSelectedSectionId(undefined)}
            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${selectedSectionId === undefined ? "bg-indigo-600/20 text-indigo-300" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
          >
            <Mail className="w-3.5 h-3.5" /> All Emails
            {unreadCounts?.sections?.["unsorted"] ? (
              <span className="ml-auto text-[10px] bg-indigo-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                {unreadCounts.sections["unsorted"]}
              </span>
            ) : null}
          </button>
          {/* Section list */}
          {sections.map((s: any) => (
            <button
              key={s.id}
              onClick={() => setSelectedSectionId(s.id)}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${selectedSectionId === s.id ? "bg-indigo-600/20 text-indigo-300" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="truncate flex-1">{s.name}</span>
              {unreadCounts?.sections?.[String(s.id)] ? (
                <span className="ml-auto mr-1 text-[10px] bg-indigo-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                  {unreadCounts.sections[String(s.id)]}
                </span>
              ) : null}
              {!s.isSystem && (
                <button className="text-gray-600 hover:text-red-400" onClick={(e) => { e.stopPropagation(); deleteSection.mutate({ id: s.id }); }}>
                  <X className="w-3 h-3" />
                </button>
              )}
            </button>
          ))}
        </div>
        {/* Gmail sync + push webhook */}
        <div className="p-3 border-t border-white/10 space-y-2">
          <Button size="sm" variant="outline" className="w-full text-xs border-white/20 text-gray-300 hover:text-white hover:bg-white/10"
            onClick={() => fetchGmail.mutate({ maxResults: 20 })}
            disabled={fetchGmail.isPending}>
            {fetchGmail.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Sync Gmail
          </Button>
          <Button size="sm" variant="outline" className="w-full text-xs border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
            onClick={() => setShowWebhookDialog(true)}>
            <Zap className="w-3 h-3 mr-1" /> Enable Push
          </Button>
          <Button size="sm" variant="outline" className="w-full text-xs border-white/10 text-gray-400 hover:text-white hover:bg-white/5"
            onClick={() => setShowTemplateManager(true)}>
            <Tag className="w-3 h-3 mr-1" /> Manage Templates
          </Button>
        </div>
      </div>

      {/* ── Middle: Email list ─────────────────────────────────────────────── */}
      <div className="w-80 border-r border-white/10 flex flex-col bg-[#0a0f1e]">
        {/* Toolbar */}
        <div className="p-3 border-b border-white/10 space-y-2">
          {/* Search row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search sender, subject…" className="pl-7 h-7 text-xs bg-white/5 border-white/10 text-white" />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <Button size="sm" className={`h-7 text-xs px-2 ${showFilterPanel ? "bg-indigo-600 text-white" : "bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10"}`}
              onClick={() => setShowFilterPanel(p => !p)}>
              <Filter className="w-3 h-3" />
              {hasActiveFilters && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-orange-400" />}
            </Button>
            <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 px-2"
              onClick={() => setShowPushDialog(true)}
              title="Push email to inbox">
              <Plus className="w-3 h-3" />
            </Button>
            <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 px-2"
              onClick={() => setShowComposeDialog(true)}
              title="Compose new email">
              <Mail className="w-3 h-3" />
            </Button>
            <Button size="sm" title="Mark all as read" className="h-7 text-xs px-2 bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-emerald-700/30"
              onClick={() => markAllRead.mutate({ sectionId: selectedSectionId !== undefined ? selectedSectionId : undefined })}
              disabled={markAllRead.isPending}>
              {markAllRead.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <MailOpen className="w-3 h-3" />}
            </Button>
          </div>

          {/* Quick filter shortcuts */}
          <div className="flex gap-1 flex-wrap">
            {(["all", "unread", "flagged", "actioned"] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1 ${
                  statusFilter === s
                    ? s === "flagged" ? "bg-orange-600 border-orange-500 text-white" : "bg-indigo-600 border-indigo-500 text-white"
                    : "border-white/20 text-gray-400 hover:text-white hover:border-white/40"
                }`}>
                {s === "flagged" && <Flag className="w-2.5 h-2.5" />}
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Filter panel */}
          {showFilterPanel && (
            <div className="space-y-2 pt-1 border-t border-white/5">
              {/* Status */}
              <div className="flex flex-wrap gap-1">
                {["all", "unread", "read", "actioned", "archived", "flagged"].map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${statusFilter === s ? "bg-indigo-600 border-indigo-500 text-white" : "border-white/20 text-gray-400 hover:text-white hover:border-white/40"}`}>
                    {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              {/* Priority */}
              <div className="flex flex-wrap gap-1">
                {["all", "urgent", "high", "normal", "low"].map(p => (
                  <button key={p} onClick={() => setPriorityFilter(p)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${priorityFilter === p ? "bg-orange-600 border-orange-500 text-white" : "border-white/20 text-gray-400 hover:text-white hover:border-white/40"}`}>
                    {p === "all" ? "Any priority" : p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
              {/* Date presets */}
              <div className="flex flex-wrap gap-1">
                {DATE_PRESETS.map(preset => (
                  <button key={preset.label} onClick={() => handleDatePreset(preset)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1 ${activeDatePreset === preset.label ? "bg-emerald-700 border-emerald-600 text-white" : "border-white/20 text-gray-400 hover:text-white hover:border-white/40"}`}>
                    <CalendarDays className="w-2.5 h-2.5" /> {preset.label}
                  </button>
                ))}
              </div>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-[10px] text-orange-400 hover:text-orange-300 flex items-center gap-1">
                  <X className="w-2.5 h-2.5" /> Clear all filters
                </button>
              )}
            </div>
          )}

          {/* Bulk action bar */}
          {someSelected && (
            <div className="flex items-center gap-1 p-1.5 bg-indigo-900/30 border border-indigo-500/30 rounded-lg">
              <span className="text-[10px] text-indigo-300 font-semibold mr-1">{selectedEmailIds.size} selected</span>
              <Button size="sm" className="h-6 text-[10px] px-2 bg-emerald-700 hover:bg-emerald-600 text-white"
                onClick={() => bulkAction.mutate({ emailIds: Array.from(selectedEmailIds), action: "markRead" })}
                disabled={bulkAction.isPending}>
                <MailOpen className="w-2.5 h-2.5 mr-1" /> Read
              </Button>
              <Button size="sm" className="h-6 text-[10px] px-2 bg-gray-700 hover:bg-gray-600 text-white"
                onClick={() => bulkAction.mutate({ emailIds: Array.from(selectedEmailIds), action: "archive" })}
                disabled={bulkAction.isPending}>
                <Archive className="w-2.5 h-2.5 mr-1" /> Archive
              </Button>
              <Button size="sm" className="h-6 text-[10px] px-2 bg-blue-700 hover:bg-blue-600 text-white"
                onClick={() => setShowBulkMoveDialog(true)}>
                <MoveRight className="w-2.5 h-2.5 mr-1" /> Move
              </Button>
              <button onClick={() => setSelectedEmailIds(new Set())} className="ml-auto text-gray-500 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto">
          {/* Select all row */}
          {emails.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 bg-white/2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleSelectAll}
                className="border-white/30 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 w-3.5 h-3.5"
              />
              <span className="text-[10px] text-gray-500">{allSelected ? "Deselect all" : "Select all"} ({emails.length})</span>
            </div>
          )}

          {emailsLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500 text-sm">
              <Inbox className="w-8 h-8 mb-2 opacity-40" />
              <p>No emails</p>
              {hasActiveFilters && <button onClick={clearFilters} className="text-xs text-indigo-400 mt-1 hover:underline">Clear filters</button>}
            </div>
          ) : (
            emails.map((email: any) => {
              const isSelected = selectedEmailId === email.id;
              const isUnread = email.status === "unread";
              const isChecked = selectedEmailIds.has(email.id);
              return (
                <div key={email.id} className="relative border-b border-white/5 overflow-hidden">
                  {/* Swipe-to-archive background */}
                  <div className="absolute inset-y-0 right-0 w-20 bg-red-600/80 flex items-center justify-center pointer-events-none"
                    style={{ opacity: swipingEmailId === email.id && swipeX < -20 ? Math.min(1, Math.abs(swipeX) / 60) : 0 }}>
                    <Archive className="w-5 h-5 text-white" />
                  </div>
                  <div
                    className={`flex items-start gap-2 p-3 transition-colors ${isSelected ? "bg-indigo-600/20" : isChecked ? "bg-indigo-900/20" : "hover:bg-white/5"}`}
                    style={{ transform: swipingEmailId === email.id ? `translateX(${swipeX}px)` : "translateX(0)", transition: swipingEmailId === email.id ? "none" : "transform 0.2s ease" }}
                    onTouchStart={(e) => handleSwipeTouchStart(e, email.id)}
                    onTouchMove={(e) => handleSwipeTouchMove(e, email.id)}
                    onTouchEnd={() => handleSwipeTouchEnd(email.id)}
                  >
                    <div className="flex items-center gap-1.5 mt-1 flex-shrink-0">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleSelectEmail(email.id)}
                        className="border-white/30 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 w-3.5 h-3.5"
                      />
                      {isUnread ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-transparent flex-shrink-0" />
                      )}
                    </div>
                    {/* Flag toggle button on row */}
                    <button
                      className={`flex-shrink-0 mt-0.5 p-0.5 rounded hover:bg-white/10 transition-colors ${email.status === "flagged" ? "text-orange-400" : "text-gray-600 hover:text-orange-400"}`}
                      title={email.status === "flagged" ? "Unflag" : "Flag"}
                      onClick={(e) => { e.stopPropagation(); updateEmail.mutate({ id: email.id, status: email.status === "flagged" ? "unread" : "flagged" }); }}
                    >
                      <Flag className="w-3 h-3" />
                    </button>
                    <button
                      className="flex-1 text-left min-w-0"
                      onClick={() => {
                        setSelectedEmailId(email.id);
                        if (isUnread) updateEmail.mutate({ id: email.id, status: "read" });
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs truncate ${isUnread ? "text-white font-semibold" : email.status === "flagged" ? "text-orange-300" : "text-gray-300"}`}>
                          {email.fromName || email.fromEmail}
                        </span>
                        <Badge className={`text-[10px] px-1 py-0 border flex-shrink-0 ${PRIORITY_COLORS[email.priority] ?? ""}`}>
                          {email.priority}
                        </Badge>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${isUnread ? "text-gray-200" : "text-gray-400"}`}>
                        {email.subject}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate mt-0.5">{email.snippet}</p>
                      <p className="text-[10px] text-gray-600 mt-1">
                        {new Date(email.receivedAt).toLocaleString()}
                      </p>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right: Email detail ────────────────────────────────────────────── */}
      <div className={`${selectedEmail ? "flex" : "hidden md:flex"} flex-1 flex-col overflow-hidden`}>
        {!selectedEmail ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Mail className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg">Select a message to read</p>
          </div>
        ) : (
          <>
            {/* Email header */}
            <div className="p-4 border-b border-white/10 bg-[#0d1426]">
              {/* Mobile back button */}
              <button className="md:hidden flex items-center gap-1 text-indigo-400 text-sm mb-3 hover:text-indigo-300" onClick={() => setSelectedEmailId(null)}>
                <ChevronLeft className="w-4 h-4" /> Back to inbox
              </button>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-white font-semibold text-lg leading-tight">{(selectedEmail as any).subject}</h2>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-sm text-gray-400">
                      From: <span className="text-gray-200">{(selectedEmail as any).fromName || (selectedEmail as any).fromEmail}</span>
                      {(selectedEmail as any).fromName && <span className="text-gray-500 ml-1">&lt;{(selectedEmail as any).fromEmail}&gt;</span>}
                    </span>
                    <Badge className={`text-xs border ${PRIORITY_COLORS[(selectedEmail as any).priority] ?? ""}`}>
                      {(selectedEmail as any).priority}
                    </Badge>
                    <span className="text-xs text-gray-500">{new Date((selectedEmail as any).receivedAt).toLocaleString()}</span>
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" className="h-8 text-xs border-white/20 text-gray-300 hover:text-white hover:bg-white/10"
                    onClick={() => { setMovingEmailId((selectedEmail as any).id); setShowMoveDialog(true); }}>
                    <MoveRight className="w-3 h-3 mr-1" /> Move
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs border-white/20 text-gray-300 hover:text-white hover:bg-white/10"
                    onClick={() => aiSummarise.mutate({ id: (selectedEmail as any).id })}
                    disabled={aiSummarise.isPending}>
                    {aiSummarise.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
                    AI Summary
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                    onClick={() => updateEmail.mutate({ id: (selectedEmail as any).id, status: "actioned" })}>
                    <CheckCircle className="w-3 h-3 mr-1" /> Mark Actioned
                  </Button>
                  <Button size="sm" variant="outline"
                    className={`h-8 text-xs ${ (selectedEmail as any).status === "flagged" ? "border-orange-500/40 text-orange-400 hover:bg-orange-500/10" : "border-white/20 text-gray-300 hover:text-orange-400 hover:bg-orange-500/10" }`}
                    title={(selectedEmail as any).status === "flagged" ? "Unflag" : "Flag"}
                    onClick={() => updateEmail.mutate({ id: (selectedEmail as any).id, status: (selectedEmail as any).status === "flagged" ? "unread" : "flagged" })}>
                    <Flag className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs border-white/20 text-gray-400 hover:text-white hover:bg-white/10"
                    onClick={() => updateEmail.mutate({ id: (selectedEmail as any).id, status: "archived" })}>
                    <Archive className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                    onClick={() => classifyPriority.mutate({ emailId: (selectedEmail as any).id })}
                    disabled={classifyPriority.isPending}>
                    {classifyPriority.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Tag className="w-3 h-3 mr-1" />}
                    Auto-Priority
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
                    onClick={() => setShowLinkReceiptDialog(true)}>
                    <Paperclip className="w-3 h-3 mr-1" /> Link Receipt
                  </Button>
                </div>
              </div>
            </div>

            {/* Linked receipt badge */}
            {(selectedEmail as any).linkedReceiptId && (
              <div className="mx-4 mt-2 flex items-center gap-2 text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
                <Paperclip className="w-3 h-3" />
                <span>Linked to Receipt #{(selectedEmail as any).linkedReceiptId}</span>
                {(selectedEmail as any).linkedReceiptNote && <span className="text-gray-400">— {(selectedEmail as any).linkedReceiptNote}</span>}
              </div>
            )}

            {/* Email body + AI panel */}
            <div className="flex-1 overflow-y-auto">
              <Tabs defaultValue="body" className="h-full">
                <TabsList className="mx-4 mt-3 bg-white/5 border border-white/10">
                  <TabsTrigger value="body" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-400">Email Body</TabsTrigger>
                  <TabsTrigger value="ai" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-400">
                    AI Analysis {(selectedEmail as any).aiSummary ? "✓" : ""}
                  </TabsTrigger>
                  <TabsTrigger value="attachments" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-400">
                    Attachments {attachments.length > 0 ? `(${attachments.length})` : ""}
                  </TabsTrigger>
                  <TabsTrigger value="reply" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-400">Reply</TabsTrigger>
                  <TabsTrigger value="activity" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-400">Activity</TabsTrigger>
                </TabsList>

                {/* Body tab */}
                <TabsContent value="body" className="p-4">
                  {(selectedEmail as any).bodyHtml ? (
                    <div className="bg-white rounded-lg p-4 text-sm text-gray-900 max-h-[60vh] overflow-y-auto"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize((selectedEmail as any).bodyHtml, { ALLOWED_TAGS: ['p','br','div','span','a','b','strong','i','em','u','ul','ol','li','h1','h2','h3','h4','h5','h6','table','thead','tbody','tr','td','th','img','blockquote','pre','code','hr','sub','sup','small','font','center'], ALLOWED_ATTR: ['href','src','alt','style','class','width','height','target','color','size','face','align','valign','bgcolor','border','cellpadding','cellspacing'], ALLOW_DATA_ATTR: false }) }} />
                  ) : (
                    <pre className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">
                      {(selectedEmail as any).bodyText || "(No body)"}
                    </pre>
                  )}
                </TabsContent>

                {/* AI Analysis tab */}
                <TabsContent value="ai" className="p-4 space-y-4">
                  {!(selectedEmail as any).aiSummary ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                      <Zap className="w-10 h-10 mb-3 opacity-30" />
                      <p className="text-sm mb-4">No AI analysis yet</p>
                      <Button onClick={() => aiSummarise.mutate({ id: (selectedEmail as any).id })}
                        disabled={aiSummarise.isPending}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {aiSummarise.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                        Run AI Analysis
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Card className="bg-indigo-900/20 border-indigo-500/30">
                        <CardHeader className="pb-2"><CardTitle className="text-sm text-indigo-300 flex items-center gap-2"><Zap className="w-4 h-4" /> Summary</CardTitle></CardHeader>
                        <CardContent><p className="text-sm text-gray-200">{(selectedEmail as any).aiSummary}</p></CardContent>
                      </Card>
                      {((selectedEmail as any).aiKeyPoints as string[])?.length > 0 && (
                        <Card className="bg-white/5 border-white/10">
                          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-300">Key Points</CardTitle></CardHeader>
                          <CardContent>
                            <ul className="space-y-1">
                              {((selectedEmail as any).aiKeyPoints as string[]).map((pt: string, i: number) => (
                                <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                                  <ChevronRight className="w-3 h-3 mt-0.5 text-indigo-400 flex-shrink-0" />
                                  {pt}
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}
                      {(selectedEmail as any).aiActionRequired && (
                        <div className="flex items-center gap-2 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                          <AlertTriangle className="w-4 h-4 text-orange-400" />
                          <span className="text-sm text-orange-300">Action required</span>
                        </div>
                      )}
                      <Button size="sm" variant="outline" className="border-white/20 text-gray-400 hover:text-white"
                        onClick={() => aiSummarise.mutate({ id: (selectedEmail as any).id })}
                        disabled={aiSummarise.isPending}>
                        <RefreshCw className="w-3 h-3 mr-1" /> Re-analyse
                      </Button>
                    </div>
                  )}
                </TabsContent>

                {/* Attachments tab */}
                <TabsContent value="attachments" className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-300">Attachments</h3>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-white/20 text-gray-300 hover:text-white"
                      onClick={() => fileInputRef.current?.click()}>
                      <Upload className="w-3 h-3 mr-1" /> Upload File
                    </Button>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload}
                      accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" />
                  </div>
                  {attachments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                      <Paperclip className="w-8 h-8 mb-2 opacity-30" />
                      <p className="text-sm">No attachments</p>
                    </div>
                  ) : (
                    attachments.map((att: any) => (
                      <Card key={att.id} className="bg-white/5 border-white/10">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="text-sm text-gray-200 truncate">{att.filename}</span>
                                {att.mimeType && <span className="text-xs text-gray-500">{att.mimeType}</span>}
                              </div>
                              {att.ocrSummary && (
                                <div className="mt-2 p-2 bg-emerald-900/20 border border-emerald-500/20 rounded text-xs text-emerald-300">
                                  <strong>OCR Summary:</strong> {att.ocrSummary}
                                </div>
                              )}
                              {att.ocrText && !att.ocrSummary && (
                                <p className="mt-1 text-xs text-gray-400 line-clamp-2">{att.ocrText.slice(0, 200)}…</p>
                              )}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              {att.s3Url && (att.mimeType?.startsWith("image/") || att.mimeType === "application/pdf") && (
                                <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                                  onClick={() => setPreviewAttachment({ url: att.s3Url, mimeType: att.mimeType, filename: att.filename })}>
                                  <Eye className="w-3 h-3" />
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="h-7 text-xs border-white/20 text-gray-400 hover:text-white"
                                onClick={() => window.open(att.s3Url, "_blank")}>
                                <Paperclip className="w-3 h-3" />
                              </Button>
                              {(att.mimeType?.startsWith("image/") || att.mimeType === "application/pdf") && (
                                <Button size="sm" variant="outline" className="h-7 text-xs border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10"
                                  onClick={() => ocrAttachment.mutate({ attachmentId: att.id })}
                                  disabled={ocrAttachment.isPending}>
                                  {ocrAttachment.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>

                {/* Reply tab */}
                <TabsContent value="reply" className="p-4 space-y-3">
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-xs text-gray-400 space-y-1">
                    <div><span className="text-gray-500">To:</span> <span className="text-gray-200">{(selectedEmail as any)?.fromName || (selectedEmail as any)?.fromEmail} &lt;{(selectedEmail as any)?.fromEmail}&gt;</span></div>
                    <div><span className="text-gray-500">Subject:</span> <span className="text-gray-200">{(selectedEmail as any)?.subject?.startsWith("Re:") ? (selectedEmail as any)?.subject : `Re: ${(selectedEmail as any)?.subject}`}</span></div>
                  </div>

                  {/* Section-specific template picker */}
                  {sectionTemplates.length > 0 && (
                    <div>
                      <Label className="text-xs text-gray-400">Section Templates</Label>
                      <div className="flex flex-col gap-1 mt-1">
                        {sectionTemplates.map((t: any) => (
                          <button
                            key={t.id}
                            className="text-left text-xs px-2 py-1.5 rounded border border-white/10 bg-white/5 hover:bg-indigo-600/20 hover:border-indigo-500/40 text-gray-300 hover:text-white transition-colors"
                            onClick={() => setReplyBody(t.body)}
                          >
                            <span className="font-medium">{t.title}</span>
                            <span className="block text-gray-500 truncate">{t.body.slice(0, 60)}{t.body.length > 60 ? "…" : ""}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Global template picker */}
                  {templates.length > 0 && (
                    <div>
                      <Label className="text-xs text-gray-400">Use Template</Label>
                      <Select value={selectedTemplateId} onValueChange={handleApplyTemplate}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-gray-300 mt-1 h-8 text-xs">
                          <SelectValue placeholder="Choose a template…" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((t: any) => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              <span className="flex items-center gap-2">
                                <Tag className="w-3 h-3 text-gray-400" />
                                <span>{t.name}</span>
                                <span className="text-xs text-gray-500 capitalize">{t.category?.replace(/_/g, " ")}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* AI Suggested Replies */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-gray-400">AI Suggested Replies</Label>
                      <Button
                        size="sm" variant="outline"
                        className="h-6 text-xs border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                        disabled={suggestRepliesMut.isPending}
                        onClick={() => { setAiSuggestions([]); suggestRepliesMut.mutate({ emailId: (selectedEmail as any).id }); }}
                      >
                        {suggestRepliesMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
                        {suggestRepliesMut.isPending ? "Generating…" : "Generate 3 Replies"}
                      </Button>
                    </div>
                    {aiSuggestions.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {aiSuggestions.map((s, idx) => (
                          <button
                            key={idx}
                            className="text-left text-xs px-3 py-2 rounded-lg border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/15 hover:border-purple-500/40 text-gray-300 hover:text-white transition-colors"
                            onClick={() => setReplyBody(s)}
                          >
                            <span className="block font-semibold text-purple-400 mb-0.5">Option {idx + 1}</span>
                            <span className="line-clamp-2">{s.slice(0, 120)}{s.length > 120 ? "…" : ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Textarea
                    value={replyBody}
                    onChange={e => setReplyBody(e.target.value)}
                    placeholder="Write your reply here…"
                    className="bg-white/5 border-white/10 text-white min-h-[180px] text-sm"
                  />
                  <div className="text-xs text-gray-500 italic">Your reply will be prefixed with "Assalamu Alaikum," and signed "JazakAllah Khair" automatically.</div>
                  <div className="flex justify-end gap-2">
                    {replyBody && (
                      <Button size="sm" variant="outline" className="border-white/20 text-gray-400 hover:text-white"
                        onClick={() => { setReplyBody(""); setSelectedTemplateId(""); }}>
                        <X className="w-3 h-3 mr-1" /> Clear
                      </Button>
                    )}
                    <Button
                      onClick={() => replyToEmail.mutate({ emailId: (selectedEmail as any).id, replyBody })}
                      disabled={replyToEmail.isPending || !replyBody.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white">
                      {replyToEmail.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                      Send Reply
                    </Button>
                  </div>
                </TabsContent>

                {/* Activity tab */}
                <TabsContent value="activity" className="p-4">
                  {activity.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">No activity yet</p>
                  ) : (
                    <div className="space-y-2">
                      {activity.map((log: any) => (
                        <div key={log.id} className="flex items-start gap-3 text-xs text-gray-400">
                          <Clock className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-600" />
                          <div>
                            <span className="text-gray-300 capitalize">{log.action.replace(/_/g, " ")}</span>
                            {log.notes && <span className="ml-1 text-gray-500">— {log.notes}</span>}
                            <div className="text-gray-600">{new Date(log.createdAt).toLocaleString()}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </div>

      {/* ── Push Email Dialog ──────────────────────────────────────────────── */}
      <Dialog open={showPushDialog} onOpenChange={setShowPushDialog}>
        <DialogContent className="bg-[#0d1426] border-white/10 text-white max-w-lg">
          <DialogHeader><DialogTitle>Add Email to Inbox</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-400">From Email *</Label>
                <Input value={pushForm.fromEmail} onChange={e => setPushForm(p => ({ ...p, fromEmail: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white mt-1" placeholder="sender@example.com" />
              </div>
              <div>
                <Label className="text-xs text-gray-400">From Name</Label>
                <Input value={pushForm.fromName} onChange={e => setPushForm(p => ({ ...p, fromName: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white mt-1" placeholder="Galib Khan" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-400">Subject *</Label>
              <Input value={pushForm.subject} onChange={e => setPushForm(p => ({ ...p, subject: e.target.value }))}
                className="bg-white/5 border-white/10 text-white mt-1" />
            </div>
            <div>
              <Label className="text-xs text-gray-400">Body</Label>
              <Textarea value={pushForm.bodyText} onChange={e => setPushForm(p => ({ ...p, bodyText: e.target.value }))}
                className="bg-white/5 border-white/10 text-white mt-1 min-h-[100px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-400">Priority</Label>
                <Select value={pushForm.priority} onValueChange={v => setPushForm(p => ({ ...p, priority: v as any }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-400">Section</Label>
                <Select value={pushForm.sectionId} onValueChange={v => setPushForm(p => ({ ...p, sectionId: v }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPushDialog(false)} className="border-white/20 text-gray-300">Cancel</Button>
            <Button onClick={() => pushEmail.mutate({
              fromEmail: pushForm.fromEmail,
              fromName: pushForm.fromName || undefined,
              subject: pushForm.subject,
              bodyText: pushForm.bodyText || undefined,
              priority: pushForm.priority,
              sectionId: pushForm.sectionId ? parseInt(pushForm.sectionId) : undefined,
            })} disabled={pushEmail.isPending || !pushForm.fromEmail || !pushForm.subject}
              className="bg-indigo-600 hover:bg-indigo-700">
              {pushEmail.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Add Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Section Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showSectionDialog} onOpenChange={setShowSectionDialog}>
        <DialogContent className="bg-[#0d1426] border-white/10 text-white max-w-sm">
          <DialogHeader><DialogTitle>Add Section</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-400">Name *</Label>
              <Input value={sectionForm.name} onChange={e => setSectionForm(p => ({ ...p, name: e.target.value }))}
                className="bg-white/5 border-white/10 text-white mt-1" placeholder="e.g. Fundraising" />
            </div>
            <div>
              <Label className="text-xs text-gray-400">Description</Label>
              <Input value={sectionForm.description} onChange={e => setSectionForm(p => ({ ...p, description: e.target.value }))}
                className="bg-white/5 border-white/10 text-white mt-1" />
            </div>
            <div>
              <Label className="text-xs text-gray-400">Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={sectionForm.color} onChange={e => setSectionForm(p => ({ ...p, color: e.target.value }))}
                  className="w-8 h-8 rounded cursor-pointer border-0" />
                <span className="text-xs text-gray-400">{sectionForm.color}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSectionDialog(false)} className="border-white/20 text-gray-300">Cancel</Button>
            <Button onClick={() => upsertSection.mutate(sectionForm)} disabled={upsertSection.isPending || !sectionForm.name}
              className="bg-indigo-600 hover:bg-indigo-700">
              {upsertSection.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Gmail Push Webhook Dialog ──────────────────────────────────────── */}
      <Dialog open={showWebhookDialog} onOpenChange={setShowWebhookDialog}>
        <DialogContent className="bg-[#0d1426] border-white/10 text-white max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Zap className="w-4 h-4 text-indigo-400" /> Enable Gmail Push Notifications</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Register a Gmail push subscription so new emails arrive in real-time (within seconds) instead of only when you click "Sync Gmail".
            </p>
            <div className="bg-indigo-900/20 border border-indigo-500/20 rounded-lg p-3 text-xs text-indigo-300 space-y-1">
              <p className="font-semibold">Prerequisites:</p>
              <ol className="list-decimal list-inside space-y-1 text-indigo-400">
                <li>Create a Google Cloud Pub/Sub topic (e.g. <code>gmail-inbox</code>)</li>
                <li>Grant <code>gmail-api-push@system.gserviceaccount.com</code> the Pub/Sub Publisher role</li>
                <li>Create a push subscription pointing to <code>{window.location.origin}/api/gmail/push</code></li>
                <li>Enter the full topic name below and click Register</li>
              </ol>
            </div>
            <div>
              <Label className="text-xs text-gray-400">Pub/Sub Topic Name</Label>
              <Input
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="projects/my-project/topics/gmail-inbox"
                className="bg-white/5 border-white/10 text-white mt-1 font-mono text-xs"
              />
            </div>
            <div className="bg-white/5 border border-white/10 rounded p-2 text-xs text-gray-400">
              <span className="text-gray-500">Webhook URL:</span> <code className="text-gray-200">{window.location.origin}/api/gmail/push</code>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWebhookDialog(false)} className="border-white/20 text-gray-300">Cancel</Button>
            <Button
              onClick={() => registerGmailPush.mutate({ webhookUrl: `${window.location.origin}/api/gmail/push`, topicName: webhookUrl || undefined })}
              disabled={registerGmailPush.isPending}
              className="bg-indigo-600 hover:bg-indigo-700">
              {registerGmailPush.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              Register Push
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Move to Section Dialog ─────────────────────────────────────────── */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="bg-[#0d1426] border-white/10 text-white max-w-sm">
          <DialogHeader><DialogTitle>Move to Section</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs text-gray-400">Select Section</Label>
            <Select value={moveTargetSectionId} onValueChange={setMoveTargetSectionId}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Choose section…" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMoveDialog(false)} className="border-white/20 text-gray-300">Cancel</Button>
            <Button onClick={handleMoveSection} disabled={!moveTargetSectionId} className="bg-indigo-600 hover:bg-indigo-700">
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Move to Section Dialog ────────────────────────────────────── */}
      <Dialog open={showBulkMoveDialog} onOpenChange={setShowBulkMoveDialog}>
        <DialogContent className="bg-[#0d1426] border-white/10 text-white max-w-sm">
          <DialogHeader><DialogTitle>Move {selectedEmailIds.size} Email(s) to Section</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs text-gray-400">Select Section</Label>
            <Select value={bulkMoveTargetSectionId} onValueChange={setBulkMoveTargetSectionId}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Choose section…" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkMoveDialog(false)} className="border-white/20 text-gray-300">Cancel</Button>
            <Button
              onClick={() => bulkAction.mutate({
                emailIds: Array.from(selectedEmailIds),
                action: "moveToSection",
                sectionId: parseInt(bulkMoveTargetSectionId),
              })}
              disabled={bulkAction.isPending || !bulkMoveTargetSectionId}
              className="bg-indigo-600 hover:bg-indigo-700">
              {bulkAction.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Link to Receipt Dialog ────────────────────────────────────────────────── */}
      <Dialog open={showLinkReceiptDialog} onOpenChange={setShowLinkReceiptDialog}>
        <DialogContent className="bg-[#1a1f2e] border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-purple-400" /> Link Email to Receipt
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-gray-400 mb-1 block">Search Receipts</Label>
              <Input
                placeholder="Search by description, vendor, amount..."
                value={receiptSearchQuery}
                onChange={e => setReceiptSearchQuery(e.target.value)}
                className="bg-white/5 border-white/20 text-white placeholder:text-gray-500"
              />
            </div>
            {receiptSearchResults.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {receiptSearchResults.map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedReceiptId(r.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedReceiptId === r.id
                        ? "bg-purple-600/30 border border-purple-500/50 text-white"
                        : "bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10"
                    }`}
                  >
                    <div className="font-medium">{r.description || r.vendor || "Receipt"}</div>
                    <div className="text-xs text-gray-400">
                      {r.vendor && <span>{r.vendor} · </span>}
                      {r.amount && <span>£{Number(r.amount).toFixed(2)} · </span>}
                      {r.date && <span>{fmtDate(new Date(r.date))}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {receiptSearchQuery.length >= 2 && receiptSearchResults.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-3">No receipts found for "{receiptSearchQuery}"</p>
            )}
            {selectedReceiptId && (
              <div>
                <Label className="text-xs text-gray-400 mb-1 block">Note (optional)</Label>
                <Input
                  placeholder="e.g. Invoice confirmation email"
                  value={linkReceiptNote}
                  onChange={e => setLinkReceiptNote(e.target.value)}
                  className="bg-white/5 border-white/20 text-white placeholder:text-gray-500"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkReceiptDialog(false)}
              className="border-white/20 text-gray-300 hover:text-white hover:bg-white/10">
              Cancel
            </Button>
            <Button
              onClick={() => selectedEmailId && selectedReceiptId && linkToReceipt.mutate({
                emailId: selectedEmailId,
                receiptId: selectedReceiptId,
                note: linkReceiptNote || undefined,
              })}
              disabled={!selectedReceiptId || linkToReceipt.isPending}
              className="bg-purple-600 hover:bg-purple-700">
              {linkToReceipt.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Paperclip className="w-4 h-4 mr-2" />}
              Link Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Manager Dialog */}
      <Dialog open={showTemplateManager} onOpenChange={setShowTemplateManager}>
        <DialogContent className="bg-[#0d1226] border-white/10 text-white max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Tag className="w-4 h-4 text-indigo-400" />
              {selectedSectionId ? `Templates for ${sections.find((s: any) => s.id === selectedSectionId)?.name ?? "Section"}` : "All Section Templates"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Existing templates */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {sectionTemplates.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">No templates yet. Add one below.</p>
              ) : sectionTemplates.map((t: any) => (
                <div key={t.id} className="flex items-start gap-2 p-2 rounded border border-white/10 bg-white/5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200">{t.title}</p>
                    <p className="text-xs text-gray-500 truncate">{t.body.slice(0, 80)}{t.body.length > 80 ? "…" : ""}</p>
                  </div>
                  <div className="flex gap-1">
                    <button className="text-gray-500 hover:text-indigo-400" onClick={() => setTemplateForm({ id: t.id, title: t.title, body: t.body })}>
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                    <button className="text-gray-500 hover:text-red-400" onClick={() => deleteSectionTemplate.mutate({ id: t.id })}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {/* Add / edit form */}
            <div className="space-y-2 border-t border-white/10 pt-3">
              <Label className="text-xs text-gray-400">{templateForm.id ? "Edit Template" : "New Template"}</Label>
              <Input
                placeholder="Template title…"
                value={templateForm.title}
                onChange={e => setTemplateForm(f => ({ ...f, title: e.target.value }))}
                className="bg-white/5 border-white/10 text-white text-sm"
              />
              <Textarea
                placeholder="Template body…"
                value={templateForm.body}
                onChange={e => setTemplateForm(f => ({ ...f, body: e.target.value }))}
                className="bg-white/5 border-white/10 text-white text-sm min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-white/20 text-gray-300 hover:text-white hover:bg-white/10"
              onClick={() => { setShowTemplateManager(false); setTemplateForm({ id: undefined, title: "", body: "" }); }}>
              Close
            </Button>
            <Button
              disabled={!templateForm.title.trim() || !templateForm.body.trim() || upsertSectionTemplate.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => upsertSectionTemplate.mutate({
                id: templateForm.id,
                sectionId: selectedSectionId ?? null,
                title: templateForm.title,
                body: templateForm.body,
              })}>
              {upsertSectionTemplate.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              {templateForm.id ? "Update" : "Add Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline Attachment Preview Dialog */}
      <Dialog open={!!previewAttachment} onOpenChange={(open) => { if (!open) setPreviewAttachment(null); }}>
        <DialogContent className="bg-[#0d1226] border-white/10 text-white max-w-3xl w-full max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2 text-sm">
              <Paperclip className="w-4 h-4 text-gray-400" />
              {previewAttachment?.filename}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center min-h-0 bg-black/30 rounded-lg p-2">
            {previewAttachment?.mimeType?.startsWith("image/") ? (
              <img
                src={previewAttachment.url}
                alt={previewAttachment.filename}
                className="max-w-full max-h-[70vh] object-contain rounded"
              />
            ) : previewAttachment?.mimeType === "application/pdf" ? (
              <iframe
                src={previewAttachment.url}
                title={previewAttachment.filename}
                className="w-full h-[70vh] rounded border-0"
              />
            ) : null}
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" className="border-white/20 text-gray-300 hover:text-white hover:bg-white/10"
              onClick={() => setPreviewAttachment(null)}>
              Close
            </Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => window.open(previewAttachment?.url, "_blank")}>
              Open in New Tab
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Compose New Email Dialog ──────────────────────────────────────────── */}
      <Dialog open={showComposeDialog} onOpenChange={(o) => { if (!o) { setShowComposeDialog(false); setComposeForm({ to: "", toName: "", subject: "", body: "", priority: "normal", sectionId: "" }); } }}>
        <DialogContent className="max-w-lg bg-[#0d1326] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Compose New Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-400">To (email) *</Label>
                <Input
                  className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                  placeholder="recipient@example.com"
                  value={composeForm.to}
                  onChange={e => setComposeForm(f => ({ ...f, to: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Recipient Name</Label>
                <Input
                  className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                  placeholder="e.g. Ahmed Khan"
                  value={composeForm.toName}
                  onChange={e => setComposeForm(f => ({ ...f, toName: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-400">Subject *</Label>
              <Input
                className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                placeholder="Email subject"
                value={composeForm.subject}
                onChange={e => setComposeForm(f => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-400">Priority</Label>
                <Select value={composeForm.priority} onValueChange={v => setComposeForm(f => ({ ...f, priority: v as any }))}>
                  <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0d1326] border-white/10">
                    <SelectItem value="urgent" className="text-red-400">Urgent</SelectItem>
                    <SelectItem value="high" className="text-orange-400">High</SelectItem>
                    <SelectItem value="normal" className="text-white">Normal</SelectItem>
                    <SelectItem value="low" className="text-gray-400">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-400">File in Section</Label>
                <Select value={composeForm.sectionId} onValueChange={v => setComposeForm(f => ({ ...f, sectionId: v }))}>
                  <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent className="bg-[#0d1326] border-white/10">
                    <SelectItem value="none" className="text-gray-400">None</SelectItem>
                    {(sections as any[]).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)} className="text-white">{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-400">Message *</Label>
              <Textarea
                className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-gray-500 min-h-[140px]"
                placeholder="Write your message here..."
                value={composeForm.body}
                onChange={e => setComposeForm(f => ({ ...f, body: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-white/20 text-gray-300 hover:text-white hover:bg-white/10"
              onClick={() => { setShowComposeDialog(false); setComposeForm({ to: "", toName: "", subject: "", body: "", priority: "normal", sectionId: "" }); }}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={composeEmail.isPending || !composeForm.to || !composeForm.subject || !composeForm.body}
              onClick={() => composeEmail.mutate({
                to: composeForm.to,
                toName: composeForm.toName || undefined,
                subject: composeForm.subject,
                body: composeForm.body,
                priority: composeForm.priority,
                sectionId: composeForm.sectionId && composeForm.sectionId !== "none" ? Number(composeForm.sectionId) : undefined,
              })}
            >
              <Mail className="w-4 h-4 mr-1" />
              {composeEmail.isPending ? "Sending..." : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
