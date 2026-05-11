import { useState, useRef } from "react";
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
import { toast } from "sonner";
import {
  Mail, MailOpen, AlertTriangle, RefreshCw, Plus, Search, Zap, FileText,
  MoveRight, UserCheck, Archive, CheckCircle, ChevronRight, Inbox, Loader2,
  Upload, Eye, Clock, Tag, X, Paperclip
} from "lucide-react";

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

export default function CommsInboxPage() {

  const utils = trpc.useUtils();

  // ── State ─────────────────────────────────────────────────────────────────
  const [selectedSectionId, setSelectedSectionId] = useState<number | undefined>(undefined);
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
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

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: sections = [], refetch: refetchSections } = trpc.commsInbox.listSections.useQuery();
  const { data: stats } = trpc.commsInbox.getInboxStats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: emails = [], isLoading: emailsLoading, refetch: refetchEmails } = trpc.commsInbox.listEmails.useQuery({
    sectionId: selectedSectionId,
    status: statusFilter !== "all" ? statusFilter as any : undefined,
    search: search || undefined,
    limit: 100,
  }, { refetchInterval: 60000 });
  const { data: emailDetail, refetch: refetchDetail } = trpc.commsInbox.getEmail.useQuery(
    { id: selectedEmailId! },
    { enabled: !!selectedEmailId }
  );

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

  const aiSummarise = trpc.commsInbox.aiSummariseEmail.useMutation({
    onSuccess: (data) => {
      toast.success(`AI summary ready`);
      refetchDetail();
    },
    onError: (e) => toast.error(`AI summary failed: ${e.message}`),
  });

  const ocrAttachment = trpc.commsInbox.ocrAttachment.useMutation({
    onSuccess: () => {
      toast.success("OCR complete");
      refetchDetail();
    },
    onError: (e) => toast.error(`OCR failed: ${e.message}`),
  });

  const uploadAttachment = trpc.commsInbox.uploadAttachment.useMutation({
    onSuccess: () => {
      toast.success("Attachment uploaded");
      refetchDetail();
    },
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

  const deleteSection = trpc.commsInbox.deleteSection.useMutation({
    onSuccess: () => { toast.success("Section deleted"); refetchSections(); },
    onError: (e) => toast.error(`Delete failed: ${e.message}`),
  });

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

  const selectedEmail = emailDetail?.email;
  const attachments = emailDetail?.attachments ?? [];
  const activity = emailDetail?.activity ?? [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-screen bg-[#0a0f1e]">
      {/* ── Left: Section sidebar ──────────────────────────────────────────── */}
      <div className="w-56 border-r border-white/10 flex flex-col bg-[#0d1426]">
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
          {stats && (
            <div className="flex gap-3 mt-2">
              <span className="text-xs text-gray-400">{stats.unread} unread</span>
              {stats.urgent > 0 && <span className="text-xs text-red-400 font-semibold">{stats.urgent} urgent</span>}
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
          </button>
          {/* Section list */}
          {sections.map((s: any) => (
            <button
              key={s.id}
              onClick={() => setSelectedSectionId(s.id)}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${selectedSectionId === s.id ? "bg-indigo-600/20 text-indigo-300" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="truncate">{s.name}</span>
              {!s.isSystem && (
                <button className="ml-auto text-gray-600 hover:text-red-400" onClick={(e) => { e.stopPropagation(); deleteSection.mutate({ id: s.id }); }}>
                  <X className="w-3 h-3" />
                </button>
              )}
            </button>
          ))}
        </div>
        {/* Gmail sync */}
        <div className="p-3 border-t border-white/10">
          <Button size="sm" variant="outline" className="w-full text-xs border-white/20 text-gray-300 hover:text-white hover:bg-white/10"
            onClick={() => fetchGmail.mutate({ maxResults: 20 })}
            disabled={fetchGmail.isPending}>
            {fetchGmail.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Sync Gmail
          </Button>
        </div>
      </div>

      {/* ── Middle: Email list ─────────────────────────────────────────────── */}
      <div className="w-80 border-r border-white/10 flex flex-col bg-[#0a0f1e]">
        {/* Toolbar */}
        <div className="p-3 border-b border-white/10 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search…" className="pl-7 h-7 text-xs bg-white/5 border-white/10 text-white" />
            </div>
            <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 px-2"
              onClick={() => setShowPushDialog(true)}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 text-xs bg-white/5 border-white/10 text-gray-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="actioned">Actioned</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto">
          {emailsLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500 text-sm">
              <Inbox className="w-8 h-8 mb-2 opacity-40" />
              <p>No emails</p>
            </div>
          ) : (
            emails.map((email: any) => {
              const isSelected = selectedEmailId === email.id;
              const isUnread = email.status === "unread";
              return (
                <button
                  key={email.id}
                  onClick={() => {
                    setSelectedEmailId(email.id);
                    if (isUnread) updateEmail.mutate({ id: email.id, status: "read" });
                  }}
                  className={`w-full text-left p-3 border-b border-white/5 transition-colors ${isSelected ? "bg-indigo-600/20" : "hover:bg-white/5"}`}
                >
                  <div className="flex items-start gap-2">
                    {isUnread ? (
                      <span className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-transparent mt-1.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs truncate ${isUnread ? "text-white font-semibold" : "text-gray-300"}`}>
                          {email.fromName || email.fromEmail}
                        </span>
                        <Badge className={`text-[10px] px-1 py-0 border ${PRIORITY_COLORS[email.priority] ?? ""}`}>
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
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right: Email detail ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedEmail ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Mail className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg">Select an email to read</p>
          </div>
        ) : (
          <>
            {/* Email header */}
            <div className="p-4 border-b border-white/10 bg-[#0d1426]">
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
                  <Button size="sm" variant="outline" className="h-8 text-xs border-white/20 text-gray-400 hover:text-white hover:bg-white/10"
                    onClick={() => updateEmail.mutate({ id: (selectedEmail as any).id, status: "archived" })}>
                    <Archive className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>

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
                  <TabsTrigger value="activity" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-400">Activity</TabsTrigger>
                </TabsList>

                {/* Body tab */}
                <TabsContent value="body" className="p-4">
                  {(selectedEmail as any).bodyHtml ? (
                    <div className="bg-white rounded-lg p-4 text-sm text-gray-900 max-h-[60vh] overflow-y-auto"
                      dangerouslySetInnerHTML={{ __html: (selectedEmail as any).bodyHtml }} />
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
                          <span className="text-sm text-orange-300 font-medium">Action Required</span>
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
                              <Button size="sm" variant="outline" className="h-7 text-xs border-white/20 text-gray-400 hover:text-white"
                                onClick={() => window.open(att.s3Url, "_blank")}>
                                <Eye className="w-3 h-3" />
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
              <Label className="text-xs text-gray-400">Colour</Label>
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
    </div>
  );
}
