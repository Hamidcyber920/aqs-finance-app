import { useState, useRef, useCallback, useEffect } from "react";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Inbox, Star, Pin, Archive, Flag, CheckCircle, Trash2, MoveRight,
  Plus, Settings, Search, RefreshCw, Sparkles, Paperclip, Send,
  AlertTriangle, MessageSquare, Calculator, Shield, Building2,
  Home, HelpCircle, User, Hash, ChevronRight, X, Eye, Reply,
  Upload, FileText, Image as ImageIcon, Loader2, Mail, Clock,
  ArrowLeft, MoreHorizontal, Edit3, Zap, Tag,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useVoiceContext } from "@/contexts/VoiceContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = {
  id: number; name: string; slug: string; description?: string;
  icon: string; color: string; sortOrder: number; isSystem: boolean;
  total?: number; unread?: number; urgent?: number;
};

type Message = {
  id: number; sectionId: number; source: string; subject: string;
  fromName?: string; fromEmail?: string; toNames?: string; body?: string;
  aiSummary?: string; aiKeyPoints?: string; aiActionItems?: string;
  status: string; priority: string; isStarred: boolean; isPinned: boolean;
  visibility: string; receivedAt: string; sectionName?: string;
  sectionColor?: string; sectionIcon?: string;
  attachmentCount?: number; replyCount?: number;
};

type MessageDetail = Message & {
  attachments: Attachment[];
  replies: Reply[];
};

type Attachment = {
  id: number; fileName: string; fileUrl: string; mimeType?: string;
  fileSizeBytes?: number; ocrText?: string; ocrSummary?: string;
};

type Reply = {
  id: number; body: string; fromName?: string; isInternal: boolean;
  createdAt: string;
};

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  inbox: Inbox, "alert-triangle": AlertTriangle, calculator: Calculator,
  shield: Shield, "building-2": Building2, home: Home,
  "message-circle": MessageSquare, user: User, hash: Hash,
  mail: Mail, star: Star, flag: Flag,
};

function SectionIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Hash;
  return <Icon className={className ?? "h-4 w-4"} />;
}

// ─── Priority badge ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; className: string }> = {
    urgent: { label: "Urgent", className: "bg-red-500/20 text-red-400 border-red-500/30" },
    high: { label: "High", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    normal: { label: "Normal", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    low: { label: "Low", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  };
  const { label, className } = map[priority] ?? map.normal;
  return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${className}`}>{label}</Badge>;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    unread: "bg-blue-400", read: "bg-gray-500", actioned: "bg-green-400",
    archived: "bg-gray-600", flagged: "bg-yellow-400",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] ?? "bg-gray-500"}`} />;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatDate(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// ─── Upload helper ────────────────────────────────────────────────────────────

async function uploadFile(file: File): Promise<{ key: string; url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

// ─── Compose Dialog ───────────────────────────────────────────────────────────

function ComposeDialog({
  open, onClose, sections, defaultSectionId,
}: {
  open: boolean; onClose: () => void; sections: Section[]; defaultSectionId?: number;
}) {
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [body, setBody] = useState("");
  const [sectionId, setSectionId] = useState<number>(defaultSectionId ?? sections[0]?.id ?? 0);
  const [priority, setPriority] = useState("normal");
  const [visibility, setVisibility] = useState("all_senior");
  const [source, setSource] = useState("manual_entry");
  const utils = trpc.useUtils();

  const createMsg = trpc.commsHub.createMessage.useMutation({
    onSuccess: () => {
      toast.success("Message added to hub");
      utils.commsHub.listMessages.invalidate();
      utils.commsHub.getStats.invalidate();
      onClose();
      setSubject(""); setFromName(""); setFromEmail(""); setBody("");
    },
    onError: (e) => toast.error(e.message),
  });

  const pushGmail = trpc.commsHub.pushGmailMessage.useMutation({
    onSuccess: (data) => {
      toast.success(`Email pushed to "${data.sectionSlug}" section`);
      utils.commsHub.listMessages.invalidate();
      utils.commsHub.getStats.invalidate();
      onClose();
      setSubject(""); setFromName(""); setFromEmail(""); setBody("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!subject.trim()) { toast.error("Subject is required"); return; }
    if (source === "gmail_push") {
      pushGmail.mutate({ subject, fromName, fromEmail, body, suggestedSectionSlug: sections.find(s => s.id === sectionId)?.slug });
    } else {
      createMsg.mutate({ sectionId, subject, fromName, fromEmail, body, priority: priority as any, visibility: visibility as any, source: source as any });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-[#0d1f3c] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-[#635BFF]" />
            Add Message to Hub
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-white/70 text-xs">Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual_entry">Manual Entry</SelectItem>
                  <SelectItem value="gmail_push">Gmail Push-In</SelectItem>
                  <SelectItem value="internal_compose">Internal Compose</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-white/70 text-xs">Section</Label>
              <Select value={String(sectionId)} onValueChange={v => setSectionId(Number(v))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sections.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-white/70 text-xs">Subject *</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="Email subject or message title"
              className="bg-white/5 border-white/10 text-white mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-white/70 text-xs">From Name</Label>
              <Input value={fromName} onChange={e => setFromName(e.target.value)}
                placeholder="Sender name"
                className="bg-white/5 border-white/10 text-white mt-1" />
            </div>
            <div>
              <Label className="text-white/70 text-xs">From Email</Label>
              <Input value={fromEmail} onChange={e => setFromEmail(e.target.value)}
                placeholder="sender@example.com" type="email"
                className="bg-white/5 border-white/10 text-white mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-white/70 text-xs">Message Body</Label>
            <Textarea value={body} onChange={e => setBody(e.target.value)}
              placeholder="Paste the email body here..."
              rows={6} className="bg-white/5 border-white/10 text-white mt-1 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-white/70 text-xs">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">🔴 Urgent</SelectItem>
                  <SelectItem value="high">🟠 High</SelectItem>
                  <SelectItem value="normal">🔵 Normal</SelectItem>
                  <SelectItem value="low">⚪ Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-white/70 text-xs">Visibility</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_senior">All Senior Staff</SelectItem>
                  <SelectItem value="trustees_only">Trustees Only</SelectItem>
                  <SelectItem value="chair_only">Chair Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/20 text-white/70">Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMsg.isPending || pushGmail.isPending}
            className="bg-[#635BFF] hover:bg-[#4f46e5] text-white">
            {(createMsg.isPending || pushGmail.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add to Hub
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Section Dialog ───────────────────────────────────────────────────────

function AddSectionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#635BFF");
  const [icon, setIcon] = useState("hash");
  const utils = trpc.useUtils();

  const createSection = trpc.commsHub.createSection.useMutation({
    onSuccess: () => {
      toast.success("Section created");
      utils.commsHub.listSections.invalidate();
      utils.commsHub.getStats.invalidate();
      onClose();
      setName(""); setDescription("");
    },
    onError: (e) => toast.error(e.message),
  });

  const ICON_OPTIONS = [
    { value: "hash", label: "# General" }, { value: "inbox", label: "Inbox" },
    { value: "alert-triangle", label: "Urgent" }, { value: "calculator", label: "Accounts" },
    { value: "shield", label: "Trustees" }, { value: "building-2", label: "Facilities" },
    { value: "home", label: "Housing" }, { value: "message-circle", label: "Enquiries" },
    { value: "user", label: "Person" }, { value: "mail", label: "Email" },
    { value: "star", label: "Star" }, { value: "flag", label: "Flag" },
  ];

  const COLOR_OPTIONS = [
    "#635BFF", "#EF4444", "#F59E0B", "#00FFC2", "#3B82F6",
    "#8B5CF6", "#6B7280", "#F97316", "#10B981", "#EC4899",
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-[#0d1f3c] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-[#635BFF]" />
            Create New Section
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-white/70 text-xs">Section Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. HMRC Correspondence"
              className="bg-white/5 border-white/10 text-white mt-1" />
          </div>
          <div>
            <Label className="text-white/70 text-xs">Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of this section"
              className="bg-white/5 border-white/10 text-white mt-1" />
          </div>
          <div>
            <Label className="text-white/70 text-xs">Icon</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ICON_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-white/70 text-xs">Colour</Label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {COLOR_OPTIONS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? "border-white scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/20 text-white/70">Cancel</Button>
          <Button onClick={() => createSection.mutate({ name, description, icon, color })}
            disabled={!name.trim() || createSection.isPending}
            className="bg-[#635BFF] hover:bg-[#4f46e5] text-white">
            {createSection.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Section
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Message Detail Panel ─────────────────────────────────────────────────────

function MessageDetailPanel({
  messageId, sections, onClose, onMoved,
}: {
  messageId: number; sections: Section[]; onClose: () => void; onMoved: () => void;
}) {
  const [replyBody, setReplyBody] = useState("");
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: msg, isLoading, refetch } = trpc.commsHub.getMessage.useQuery(
    { id: messageId },
    { refetchOnWindowFocus: false }
  );

  const summarise = trpc.commsHub.summariseMessage.useMutation({
    onSuccess: () => { toast.success("AI summary generated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const ocrAtt = trpc.commsHub.ocrAttachment.useMutation({
    onSuccess: () => { toast.success("OCR complete"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateStatus = trpc.commsHub.updateMessageStatus.useMutation({
    onSuccess: () => { utils.commsHub.listMessages.invalidate(); utils.commsHub.getStats.invalidate(); refetch(); },
  });

  const addReply = trpc.commsHub.addReply.useMutation({
    onSuccess: () => { toast.success("Reply added"); setReplyBody(""); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const addAttachment = trpc.commsHub.addAttachment.useMutation({
    onSuccess: () => { toast.success("Attachment added"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMsg = trpc.commsHub.deleteMessage.useMutation({
    onSuccess: () => { toast.success("Message deleted"); utils.commsHub.listMessages.invalidate(); utils.commsHub.getStats.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleFileUpload = useCallback(async (file: File) => {
    setUploadingFile(true);
    try {
      const { key, url } = await uploadFile(file);
      await addAttachment.mutateAsync({
        messageId, fileName: file.name, fileKey: key, fileUrl: url,
        mimeType: file.type, fileSizeBytes: file.size,
      });
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploadingFile(false);
    }
  }, [messageId, addAttachment]);

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#635BFF]" />
    </div>
  );
  if (!msg) return null;

  const keyPoints: string[] = msg.aiKeyPoints ? JSON.parse(msg.aiKeyPoints) : [];
  const actionItems: string[] = msg.aiActionItems ? JSON.parse(msg.aiActionItems) : [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/10">
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white/60 hover:text-white h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-semibold text-sm truncate">{msg.subject}</h2>
          <p className="text-white/50 text-xs">
            {msg.fromName ?? msg.fromEmail ?? "Unknown"} · {formatDate(msg.receivedAt)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white/60 hover:text-yellow-400"
                onClick={() => updateStatus.mutate({ id: msg.id, isStarred: !msg.isStarred })}>
                <Star className={`h-4 w-4 ${msg.isStarred ? "fill-yellow-400 text-yellow-400" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{msg.isStarred ? "Unstar" : "Star"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white/60 hover:text-[#00FFC2]"
                onClick={() => summarise.mutate({ id: msg.id })}
                disabled={summarise.isPending}>
                {summarise.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>AI Summarise</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white/60 hover:text-white">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#0d1f3c] border-white/10 text-white">
              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: msg.id, status: "actioned" })}
                className="hover:bg-white/10">
                <CheckCircle className="h-4 w-4 mr-2 text-green-400" /> Mark Actioned
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: msg.id, status: "flagged" })}
                className="hover:bg-white/10">
                <Flag className="h-4 w-4 mr-2 text-yellow-400" /> Flag
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: msg.id, status: "archived" })}
                className="hover:bg-white/10">
                <Archive className="h-4 w-4 mr-2 text-gray-400" /> Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem className="hover:bg-white/10 text-white/70">
                <MoveRight className="h-4 w-4 mr-2" /> Move to Section
              </DropdownMenuItem>
              {sections.map(s => (
                <DropdownMenuItem key={s.id} className="pl-8 hover:bg-white/10 text-white/60 text-xs"
                  onClick={() => { updateStatus.mutate({ id: msg.id, sectionId: s.id }); onMoved(); }}>
                    <span style={{ color: s.color }} className="mr-2"><SectionIcon name={s.icon} className="h-3 w-3" /></span>
                  {s.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem onClick={() => deleteMsg.mutate({ id: msg.id })}
                className="hover:bg-red-500/20 text-red-400">
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Meta */}
          <div className="flex items-center gap-2 flex-wrap">
            <PriorityBadge priority={msg.priority} />
            <Badge variant="outline" className="text-[10px] border-white/20 text-white/60">{msg.source.replace("_", " ")}</Badge>
            {msg.sectionName && (
              <Badge variant="outline" className="text-[10px] border-white/20" style={{ color: msg.sectionColor }}>
                {msg.sectionName}
              </Badge>
            )}
          </div>

          {/* AI Summary */}
          {msg.aiSummary && (
            <div className="rounded-xl border border-[#635BFF]/30 bg-[#635BFF]/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#635BFF]" />
                <span className="text-[#635BFF] font-semibold text-sm">AI Summary</span>
              </div>
              <p className="text-white/80 text-sm leading-relaxed">{msg.aiSummary}</p>
              {keyPoints.length > 0 && (
                <div>
                  <p className="text-white/50 text-xs font-medium mb-1">Key Points</p>
                  <ul className="space-y-1">
                    {keyPoints.map((kp, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-white/70">
                        <span className="text-[#00FFC2] mt-0.5">•</span>{kp}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {actionItems.length > 0 && (
                <div>
                  <p className="text-white/50 text-xs font-medium mb-1">Action Items</p>
                  <ul className="space-y-1">
                    {actionItems.map((ai, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-white/70">
                        <Zap className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0" />{ai}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Body */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <p className="text-white/40 text-xs mb-2">Message Body</p>
            <p className="text-white/80 text-sm whitespace-pre-wrap leading-relaxed">
              {msg.body ?? "(No body content)"}
            </p>
          </div>

          {/* Attachments */}
          {(msg.attachments?.length > 0 || true) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/50 text-xs font-medium">Attachments ({msg.attachments?.length ?? 0})</p>
                <div className="flex gap-1">
                  <input ref={fileInputRef} type="file" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-white/60 hover:text-white"
                    onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}>
                    {uploadingFile ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                    Upload
                  </Button>
                </div>
              </div>
              {msg.attachments?.map((att: Attachment) => (
                <div key={att.id} className="rounded-lg bg-white/5 border border-white/10 p-3 mb-2">
                  <div className="flex items-center gap-2 mb-2">
                    {att.mimeType?.startsWith("image/") ? (
                      <ImageIcon className="h-4 w-4 text-blue-400" />
                    ) : (
                      <FileText className="h-4 w-4 text-orange-400" />
                    )}
                    <a href={att.fileUrl} target="_blank" rel="noopener noreferrer"
                      className="text-white/80 text-xs hover:text-[#635BFF] truncate flex-1">
                      {att.fileName}
                    </a>
                    {!att.ocrText && (
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] text-[#635BFF] hover:bg-[#635BFF]/20"
                        onClick={() => ocrAtt.mutate({ attachmentId: att.id })}
                        disabled={ocrAtt.isPending}>
                        {ocrAtt.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3 mr-1" />}
                        OCR
                      </Button>
                    )}
                  </div>
                  {att.ocrSummary && (
                    <p className="text-white/50 text-xs bg-white/5 rounded p-2 mt-1">{att.ocrSummary}</p>
                  )}
                  {att.mimeType?.startsWith("image/") && (
                    <img src={att.fileUrl} alt={att.fileName}
                      className="mt-2 rounded-lg max-h-48 object-contain w-full" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Replies */}
          {msg.replies?.length > 0 && (
            <div>
              <p className="text-white/50 text-xs font-medium mb-2">Replies ({msg.replies.length})</p>
              {msg.replies.map((r: Reply) => (
                <div key={r.id} className="rounded-lg bg-white/5 border border-white/10 p-3 mb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white/60 text-xs font-medium">{r.fromName ?? "You"}</span>
                    {r.isInternal && <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-400">Internal</Badge>}
                    <span className="text-white/30 text-xs ml-auto">{formatDate(r.createdAt)}</span>
                  </div>
                  <p className="text-white/70 text-xs whitespace-pre-wrap">{r.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Reply box */}
      <div className="p-4 border-t border-white/10">
        <Textarea value={replyBody} onChange={e => setReplyBody(e.target.value)}
          placeholder="Add an internal note or reply..."
          rows={3} className="bg-white/5 border-white/10 text-white text-sm resize-none mb-2" />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" className="border-white/20 text-white/70 text-xs"
            onClick={() => addReply.mutate({ messageId: msg.id, body: replyBody, isInternal: true })}
            disabled={!replyBody.trim() || addReply.isPending}>
            <Reply className="h-3 w-3 mr-1" /> Internal Note
          </Button>
          <Button size="sm" className="bg-[#635BFF] hover:bg-[#4f46e5] text-white text-xs"
            onClick={() => addReply.mutate({ messageId: msg.id, body: replyBody, isInternal: false, sendEmail: true })}
            disabled={!replyBody.trim() || addReply.isPending}>
            {addReply.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
            Send Reply
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Message List Item ────────────────────────────────────────────────────────

function MessageItem({ msg, isSelected, onClick }: { msg: Message; isSelected: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick}
      className={`p-3 rounded-xl cursor-pointer transition-all border ${
        isSelected
          ? "bg-[#635BFF]/20 border-[#635BFF]/40"
          : "bg-white/3 border-white/5 hover:bg-white/8 hover:border-white/15"
      }`}>
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center gap-1 pt-0.5">
          <StatusDot status={msg.status} />
          {msg.isStarred && <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />}
          {msg.isPinned && <Pin className="h-2.5 w-2.5 text-[#00FFC2]" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-sm truncate flex-1 ${msg.status === "unread" ? "text-white font-semibold" : "text-white/70"}`}>
              {msg.fromName ?? msg.fromEmail ?? "Unknown"}
            </span>
            <span className="text-white/30 text-[10px] shrink-0">{formatDate(msg.receivedAt)}</span>
          </div>
          <p className={`text-xs truncate mb-1 ${msg.status === "unread" ? "text-white/80" : "text-white/50"}`}>
            {msg.subject}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <PriorityBadge priority={msg.priority} />
            {(msg.attachmentCount ?? 0) > 0 && (
              <span className="text-white/30 text-[10px] flex items-center gap-0.5">
                <Paperclip className="h-2.5 w-2.5" />{msg.attachmentCount}
              </span>
            )}
            {(msg.replyCount ?? 0) > 0 && (
              <span className="text-white/30 text-[10px] flex items-center gap-0.5">
                <Reply className="h-2.5 w-2.5" />{msg.replyCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main CommHub Page ────────────────────────────────────────────────────────

export default function CommHub() {
  const { user } = useAuth();
  const [activeSectionId, setActiveSectionId] = useState<number | undefined>(undefined);
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [showCompose, setShowCompose] = useState(false);
  const [showAddSection, setShowAddSection] = useState(false);
  // Mobile: which panel is visible — "sections" | "messages" | "detail"
  const [mobilePanel, setMobilePanel] = useState<"sections" | "messages" | "detail">("sections");
  const isMobile = useIsMobile();
  const utils = trpc.useUtils();

  const { setEntityContext } = useVoiceContext();
  useEffect(() => {
    setEntityContext("Viewing Comms Hub — centralised communications management centre");
    return () => setEntityContext(null);
  }, [setEntityContext]);

  const { data: stats = [], isLoading: statsLoading } = trpc.commsHub.getStats.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const { data: sections = [] } = trpc.commsHub.listSections.useQuery();

  const { data: messages = [], isLoading: msgsLoading, refetch: refetchMessages } = trpc.commsHub.listMessages.useQuery({
    sectionId: activeSectionId,
    status: statusFilter as any,
    search: search || undefined,
    limit: 100,
  }, { refetchInterval: 30000 });

  const totalUnread = stats.reduce((sum: number, s: any) => sum + (Number(s.unread) || 0), 0);

  const SENIOR_ROLES = ["superadmin", "trustee", "manager", "deputy", "admin"];
  const isSenior = user && SENIOR_ROLES.includes(user.role);

  if (!isSenior) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-center space-y-3">
          <Shield className="h-12 w-12 text-white/20 mx-auto" />
          <p className="text-white/60">Comms Hub is restricted to managers, trustees, and senior staff.</p>
        </div>
      </div>
    );
  }

  // Mobile helpers
  const handleSelectSection = (id?: number) => {
    setActiveSectionId(id);
    if (isMobile) setMobilePanel("messages");
  };
  const handleSelectMessage = (id: number) => {
    setSelectedMessageId(id);
    if (isMobile) setMobilePanel("detail");
  };
  const handleCloseDetail = () => {
    setSelectedMessageId(null);
    if (isMobile) setMobilePanel("messages");
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-[#0A192F]">
      {/* ── Left Sidebar: Sections ── */}
      <div className={`${isMobile ? (mobilePanel === "sections" ? "flex" : "hidden") : "flex"} w-full md:w-64 md:shrink-0 border-r border-white/10 flex-col bg-[#0d1f3c]`}>
        {/* Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Inbox className="h-5 w-5 text-[#635BFF]" />
              <span className="text-white font-bold text-sm">Comms Hub</span>
              {totalUnread > 0 && (
                <Badge className="bg-[#635BFF] text-white text-[10px] px-1.5 py-0 h-4">{totalUnread}</Badge>
              )}
            </div>
            <div className="flex gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white"
                    onClick={() => setShowCompose(true)}>
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add Message</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white"
                    onClick={() => setShowAddSection(true)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New Section</TooltipContent>
              </Tooltip>
            </div>
          </div>
          {/* Filter pills */}
          <div className="flex gap-1 flex-wrap">
            {[
              { label: "All", value: undefined },
              { label: "Unread", value: "unread" },
              { label: "Flagged", value: "flagged" },
              { label: "Actioned", value: "actioned" },
            ].map(f => (
              <button key={String(f.value)} onClick={() => setStatusFilter(f.value)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                  statusFilter === f.value
                    ? "bg-[#635BFF] border-[#635BFF] text-white"
                    : "border-white/20 text-white/50 hover:border-white/40"
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Section list */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {/* All Messages */}
            <button
              onClick={() => { handleSelectSection(undefined); setSelectedMessageId(null); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${
                activeSectionId === undefined
                  ? "bg-[#635BFF]/20 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}>
              <Inbox className="h-4 w-4 shrink-0" />
              <span className="text-xs flex-1">All Messages</span>
              {totalUnread > 0 && (
                <span className="text-[10px] bg-[#635BFF]/30 text-[#635BFF] px-1.5 rounded-full">{totalUnread}</span>
              )}
            </button>

            <Separator className="bg-white/10 my-1" />

            {statsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-white/30" />
              </div>
            ) : (
              stats.map((s: any) => {
                const isActive = activeSectionId === s.id;
                return (
                  <button key={s.id}
                    onClick={() => { handleSelectSection(s.id); setSelectedMessageId(null); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${
                      isActive ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}>
                    <SectionIcon name={s.icon} className="h-4 w-4 shrink-0" />
                    <span className="text-xs flex-1 truncate">{s.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {Number(s.urgent) > 0 && (
                        <span className="text-[9px] bg-red-500/20 text-red-400 px-1 rounded-full">{s.urgent}</span>
                      )}
                      {Number(s.unread) > 0 && (
                        <span className="text-[10px] bg-[#635BFF]/20 text-[#635BFF] px-1.5 rounded-full">{s.unread}</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}

            <Separator className="bg-white/10 my-1" />
            <button onClick={() => setShowAddSection(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-white/30 hover:text-white/60 hover:bg-white/5 transition-all">
              <Plus className="h-4 w-4 shrink-0" />
              <span className="text-xs">Add Section</span>
            </button>
          </div>
        </ScrollArea>

        {/* Gmail push instructions */}
        <div className="p-3 border-t border-white/10">
          <div className="rounded-lg bg-[#635BFF]/10 border border-[#635BFF]/20 p-2.5">
            <p className="text-[#635BFF] text-[10px] font-semibold mb-1 flex items-center gap-1">
              <Mail className="h-3 w-3" /> Gmail Push-In
            </p>
            <p className="text-white/40 text-[9px] leading-relaxed">
              Use "Add Message" → Gmail Push-In to paste emails from your Gmail inbox directly into the hub.
            </p>
          </div>
        </div>
      </div>

      {/* ── Middle: Message List ── */}
      <div className={`${isMobile ? (mobilePanel === "messages" ? "flex" : "hidden") : "flex"} flex-col border-r border-white/10 ${!isMobile && selectedMessageId ? "w-80 shrink-0" : "flex-1"} w-full`}>
        {/* Mobile back button */}
        {isMobile && (
          <div className="flex items-center gap-2 p-3 border-b border-white/10">
            <Button variant="ghost" size="sm" className="text-white/60 hover:text-white h-8 px-2"
              onClick={() => setMobilePanel("sections")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Sections
            </Button>
          </div>
        )}
        {/* Search bar */}
        <div className="p-3 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search messages..."
              className="pl-8 bg-white/5 border-white/10 text-white text-xs h-8" />
          </div>
        </div>

        {/* Section header */}
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-white/50 text-xs">
            {activeSectionId
              ? stats.find((s: any) => s.id === activeSectionId)?.name ?? "Section"
              : "All Messages"
            } · {messages.length} items
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-white"
            onClick={() => refetchMessages()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        {/* Message list */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {msgsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-white/30" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <Inbox className="h-8 w-8 text-white/20 mx-auto" />
                <p className="text-white/30 text-xs">No messages</p>
                <Button variant="outline" size="sm" className="border-white/20 text-white/50 text-xs mt-2"
                  onClick={() => setShowCompose(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Add First Message
                </Button>
              </div>
            ) : (
              messages.map((msg: Message) => (
                <MessageItem key={msg.id} msg={msg}
                  isSelected={selectedMessageId === msg.id}
                  onClick={() => handleSelectMessage(msg.id)} />
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── Right: Message Detail ── */}
      {selectedMessageId ? (
        <div className={`${isMobile ? (mobilePanel === "detail" ? "flex" : "hidden") : "flex"} flex-1 flex-col overflow-hidden w-full`}>
          <MessageDetailPanel
            messageId={selectedMessageId}
            sections={sections}
            onClose={handleCloseDetail}
            onMoved={() => { handleCloseDetail(); refetchMessages(); utils.commsHub.getStats.invalidate(); }}
          />
        </div>
      ) : (
        <div className={`${isMobile ? "hidden" : "flex"} flex-1 items-center justify-center`}>
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-[#635BFF]/10 border border-[#635BFF]/20 flex items-center justify-center mx-auto">
              <MessageSquare className="h-8 w-8 text-[#635BFF]/60" />
            </div>
            <p className="text-white/40 text-sm">Select a message to read</p>
            <Button variant="outline" size="sm" className="border-white/20 text-white/50 text-xs"
              onClick={() => setShowCompose(true)}>
              <Plus className="h-3 w-3 mr-1" /> Add Message
            </Button>
          </div>
        </div>
      )}

      {/* ── Dialogs ── */}
      <ComposeDialog open={showCompose} onClose={() => setShowCompose(false)}
        sections={sections} defaultSectionId={activeSectionId} />
      <AddSectionDialog open={showAddSection} onClose={() => setShowAddSection(false)} />
    </div>
  );
}
