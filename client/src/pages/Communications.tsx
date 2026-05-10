import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Mail, MessageSquare, Send, Users, Pencil, Check, X,
  ChevronDown, ChevronUp, AlertTriangle, Shield, Briefcase,
  UserCheck, Building2, Hash, Plus, RefreshCw
} from "lucide-react";

// ── Design tokens ────────────────────────────────────────────────────────────
const T = {
  navy: "#0A192F",
  card: "rgba(13,34,64,0.85)",
  border: "rgba(255,255,255,0.08)",
  white: "#FFFFFF",
  muted: "rgba(255,255,255,0.45)",
  mint: "#00FFC2",
  purple: "#635BFF",
};

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  alert: <AlertTriangle size={14} />,
  shield: <Shield size={14} />,
  briefcase: <Briefcase size={14} />,
  users: <Users size={14} />,
  mosque: <Building2 size={14} />,
  hash: <Hash size={14} />,
};

function getInitials(name: string) {
  const skip = ["mr", "dr", "mrs", "ms", "prof"];
  const parts = (name || "").trim().split(" ").filter(p => !skip.includes(p.toLowerCase()));
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function formatTime(ts: string | Date) {
  const d = new Date(ts);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: any }) {
  const isSent = msg.direction === "sent";
  const recipients: { name: string; email?: string }[] = msg.toEmailsJson ? JSON.parse(msg.toEmailsJson) : [];
  const waRecipients: { name: string; phone: string }[] = msg.whatsappNumbersJson ? JSON.parse(msg.whatsappNumbersJson) : [];
  const isWA = waRecipients.length > 0 && !recipients.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isSent ? "flex-end" : "flex-start", marginBottom: 16 }}>
      <div style={{ maxWidth: "80%", background: isSent ? `linear-gradient(135deg,${T.purple},#4f46e5)` : T.card, border: `1px solid ${T.border}`, borderRadius: isSent ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "12px 16px" }}>
        {msg.subject && <p style={{ fontSize: 12, fontWeight: 700, color: isWA ? "#25d366" : T.mint, margin: "0 0 6px" }}>{isWA ? "📱 WhatsApp" : `📧 ${msg.subject}`}</p>}
        <p style={{ fontSize: 13, color: T.white, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{msg.body}</p>
        {recipients.length > 0 && (
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", margin: "8px 0 0" }}>
            To: {recipients.map((r: any) => r.name).join(", ")}
          </p>
        )}
        {waRecipients.length > 0 && (
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", margin: "8px 0 0" }}>
            Via WhatsApp: {waRecipients.map((r: any) => r.name).join(", ")}
          </p>
        )}
      </div>
      <p style={{ fontSize: 10, color: T.muted, margin: "4px 8px 0" }}>{formatTime(msg.sentAt)}{msg.fromName ? ` · ${msg.fromName}` : ""}</p>
    </div>
  );
}

// ── Compose panel ─────────────────────────────────────────────────────────────
function ComposePanel({ channel, trustees, onSent }: { channel: any; trustees: any[]; onSent: () => void }) {
  const [tab, setTab] = useState<"individual" | "bulk" | "whatsapp">("individual");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [waMessage, setWaMessage] = useState("");
  const [showWaLinks, setShowWaLinks] = useState(false);

  const sendEmailMutation = trpc.comms.sendEmail.useMutation({
    onSuccess: (res) => {
      toast.success(`Sent to ${res.sent} recipient${res.sent !== 1 ? "s" : ""}${res.errors?.length ? ` (${res.errors.length} failed)` : ""}`);
      setSubject(""); setBody(""); setSelectedEmails([]);
      onSent();
    },
    onError: (e) => toast.error(e.message),
  });

  const logWaMutation = trpc.comms.logWhatsApp.useMutation({
    onSuccess: () => { toast.success("WhatsApp messages logged"); setWaMessage(""); setShowWaLinks(false); onSent(); },
    onError: (e) => toast.error(e.message),
  });

  const channelRoles = (channel.memberRoles ?? "").split(",").map((r: string) => r.trim().toLowerCase());
  const channelMembers = trustees.filter((t: any) => {
    const r = (t.role ?? "").toLowerCase();
    return channelRoles.some((role: string) => r.includes(role));
  });

  const emailMembers = channelMembers.filter((t: any) => t.email);
  const waMembers = channelMembers.filter((t: any) => t.phone);

  const handleSendEmail = () => {
    if (!subject.trim() || !body.trim()) { toast.error("Subject and body are required"); return; }
    const recipients = tab === "bulk"
      ? emailMembers.map((t: any) => ({ name: t.fullName, email: t.email }))
      : emailMembers.filter((t: any) => selectedEmails.includes(t.email)).map((t: any) => ({ name: t.fullName, email: t.email }));
    if (!recipients.length) { toast.error("No recipients selected"); return; }
    sendEmailMutation.mutate({ channelId: channel.id, recipients, subject, body, isBulk: tab === "bulk" });
  };

  const handleSendWA = () => {
    if (!waMessage.trim()) { toast.error("Message is required"); return; }
    const recipients = waMembers.map((t: any) => ({ name: t.fullName, phone: t.phone }));
    logWaMutation.mutate({ channelId: channel.id, recipients, message: waMessage });
    setShowWaLinks(true);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`,
    borderRadius: 8, color: T.white, padding: "10px 12px", fontSize: 13, boxSizing: "border-box",
    resize: "vertical" as const,
  };

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "20px" }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 14px" }}>Compose Message</p>

      {/* Tab selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["individual", "bulk", "whatsapp"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", border: `1px solid ${tab === t ? T.purple : T.border}`, background: tab === t ? `rgba(99,91,255,0.2)` : "transparent", color: tab === t ? T.white : T.muted, transition: "all 0.2s" }}>
            {t === "individual" ? "✉️ Individual" : t === "bulk" ? "📨 Bulk Email" : "📱 WhatsApp"}
          </button>
        ))}
      </div>

      {tab !== "whatsapp" && (
        <>
          {tab === "individual" && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", margin: "0 0 6px" }}>Recipients</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {emailMembers.map((t: any) => (
                  <button key={t.email} onClick={() => setSelectedEmails(prev => prev.includes(t.email) ? prev.filter(e => e !== t.email) : [...prev, t.email])}
                    style={{ padding: "5px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1px solid ${selectedEmails.includes(t.email) ? T.mint : T.border}`, background: selectedEmails.includes(t.email) ? "rgba(0,255,194,0.12)" : "transparent", color: selectedEmails.includes(t.email) ? T.mint : T.muted }}>
                    {getInitials(t.fullName)} {t.fullName.split(" ").slice(-1)[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === "bulk" && (
            <div style={{ background: "rgba(99,91,255,0.08)", border: `1px solid rgba(99,91,255,0.2)`, borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>
                📨 Will send to all <strong style={{ color: T.white }}>{emailMembers.length}</strong> members in this channel with email addresses.
              </p>
            </div>
          )}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Project Milestone Update — Rimmers Building" style={{ ...inputStyle, resize: "none" }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Message Body</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} placeholder="Write your message here..." style={inputStyle} />
          </div>
          <button onClick={handleSendEmail} disabled={sendEmailMutation.isPending}
            style={{ width: "100%", padding: "12px 0", borderRadius: 10, background: `linear-gradient(135deg,${T.mint},#00DDB0)`, color: "#081526", fontWeight: 700, border: "none", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Send size={14} /> {sendEmailMutation.isPending ? "Sending…" : "Send Email"}
          </button>
        </>
      )}

      {tab === "whatsapp" && (
        <>
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", margin: "0 0 6px" }}>Channel Members with WhatsApp</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {waMembers.map((t: any) => (
                <span key={t.id} style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.25)", color: "#25d366", fontWeight: 600 }}>
                  {t.fullName}
                </span>
              ))}
              {!waMembers.length && <p style={{ fontSize: 12, color: T.muted }}>No phone numbers stored for this channel's members.</p>}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", display: "block", marginBottom: 4 }}>WhatsApp Message</label>
            <textarea value={waMessage} onChange={e => setWaMessage(e.target.value)} rows={5} placeholder="Assalamu Alaikum, ..." style={inputStyle} />
          </div>
          <button onClick={handleSendWA} disabled={!waMembers.length || logWaMutation.isPending}
            style={{ width: "100%", padding: "12px 0", borderRadius: 10, background: "linear-gradient(135deg,#25d366,#128C7E)", color: T.white, fontWeight: 700, border: "none", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <MessageSquare size={14} /> {logWaMutation.isPending ? "Logging…" : "Open WhatsApp Links"}
          </button>
          {showWaLinks && waMessage && waMembers.length > 0 && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>Click each link to open WhatsApp:</p>
              {waMembers.map((t: any) => {
                const link = `https://wa.me/44${t.phone.replace(/^0/, "").replace(/\s/g, "")}?text=${encodeURIComponent(waMessage)}`;
                return (
                  <a key={t.id} href={link} target="_blank" rel="noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.2)", textDecoration: "none" }}>
                    <span style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(37,211,102,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#25d366", flexShrink: 0 }}>{getInitials(t.fullName)}</span>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: T.white, margin: 0 }}>{t.fullName}</p>
                      <p style={{ fontSize: 11, color: "#25d366", margin: 0 }}>{t.phone} → Open WhatsApp ↗</p>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CommunicationsPage() {
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [editingChannel, setEditingChannel] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [showCompose, setShowCompose] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: channels = [], refetch: refetchChannels } = trpc.comms.listChannels.useQuery();
  const { data: trustees = [] } = trpc.trustees.listActive.useQuery();
  const { data: messages = [], refetch: refetchMessages } = trpc.comms.listMessages.useQuery(
    { channelId: selectedChannelId! },
    { enabled: selectedChannelId !== null }
  );

  const updateChannelMutation = trpc.comms.updateChannel.useMutation({
    onSuccess: () => { toast.success("Channel updated"); setEditingChannel(null); refetchChannels(); },
    onError: (e) => toast.error(e.message),
  });

  const selectedChannel = channels.find((c: any) => c.id === selectedChannelId);

  useEffect(() => {
    if (channels.length && selectedChannelId === null) {
      setSelectedChannelId((channels[0] as any).id);
    }
  }, [channels]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const channelRoles = selectedChannel ? (selectedChannel.memberRoles ?? "").split(",").map((r: string) => r.trim().toLowerCase()) : [];
  const channelMembers = (trustees as any[]).filter((t: any) => {
    const r = (t.role ?? "").toLowerCase();
    return channelRoles.some((role: string) => r.includes(role));
  });

  return (
    <>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        textarea:focus,input:focus{outline:none;border-color:rgba(99,91,255,0.6)!important;}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
      `}</style>
      <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`, fontFamily: "'DM Sans',sans-serif", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "20px 16px 0", animation: "fadeUp 0.4s ease both" }}>
          <h1 style={{ fontSize: "clamp(20px,3vw,28px)", fontWeight: 800, color: T.white, margin: 0, letterSpacing: "-0.03em" }}>
            Communications <span style={{ color: T.mint }}>Hub</span>
          </h1>
          <p style={{ fontSize: 13, color: T.muted, margin: "4px 0 16px" }}>AQS internal messaging — email & WhatsApp</p>
        </div>

        {/* Main layout */}
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 0, flex: 1, padding: "0 16px 20px", minHeight: 0 }}>

          {/* ── Channel sidebar ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingRight: 12, borderRight: `1px solid ${T.border}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px 4px" }}>Channels</p>
            {(channels as any[]).map((ch: any, i: number) => {
              const isSelected = ch.id === selectedChannelId;
              const isEditing = editingChannel === ch.id;
              return (
                <div key={ch.id} style={{ animation: `fadeUp 0.4s ease ${i * 50}ms both` }}>
                  {isEditing ? (
                    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px" }}>
                      <input value={editName} onChange={e => setEditName(e.target.value)}
                        style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 6, color: T.white, padding: "6px 8px", fontSize: 12, marginBottom: 6, boxSizing: "border-box" }} />
                      <input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description (optional)"
                        style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 6, color: T.white, padding: "6px 8px", fontSize: 12, marginBottom: 8, boxSizing: "border-box" }} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => updateChannelMutation.mutate({ id: ch.id, name: editName, description: editDesc })}
                          style={{ flex: 1, padding: "6px 0", borderRadius: 6, background: T.mint, color: "#081526", fontWeight: 700, border: "none", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          <Check size={10} /> Save
                        </button>
                        <button onClick={() => setEditingChannel(null)}
                          style={{ flex: 1, padding: "6px 0", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: T.muted, fontWeight: 700, border: `1px solid ${T.border}`, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          <X size={10} /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => setSelectedChannelId(ch.id)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 10, cursor: "pointer", background: isSelected ? `rgba(99,91,255,0.18)` : "transparent", border: `1px solid ${isSelected ? "rgba(99,91,255,0.35)" : "transparent"}`, transition: "all 0.15s" }}>
                      <span style={{ color: ch.color, flexShrink: 0 }}>{CHANNEL_ICONS[ch.icon] ?? <Hash size={14} />}</span>
                      <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? T.white : T.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</span>
                      {ch.isEditable && (
                        <button onClick={e => { e.stopPropagation(); setEditingChannel(ch.id); setEditName(ch.name); setEditDesc(ch.description ?? ""); }}
                          style={{ width: 22, height: 22, borderRadius: 6, background: "transparent", border: "none", color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.6 }} title="Edit channel">
                          <Pencil size={10} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Right panel ── */}
          <div style={{ display: "flex", flexDirection: "column", paddingLeft: 16, minHeight: 0, overflow: "hidden" }}>
            {selectedChannel ? (
              <>
                {/* Channel header */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 14, borderBottom: `1px solid ${T.border}`, marginBottom: 14, flexShrink: 0 }}>
                  <span style={{ color: (selectedChannel as any).color, fontSize: 18 }}>{CHANNEL_ICONS[(selectedChannel as any).icon] ?? <Hash size={18} />}</span>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: T.white, margin: 0 }}>{(selectedChannel as any).name}</h2>
                    {(selectedChannel as any).description && <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>{(selectedChannel as any).description}</p>}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {/* Member avatars */}
                    <div style={{ display: "flex" }}>
                      {channelMembers.slice(0, 4).map((t: any, i: number) => (
                        <div key={t.id} title={t.fullName} style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg,${T.purple},#4f46e5)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: T.white, border: `2px solid ${T.navy}`, marginLeft: i > 0 ? -8 : 0, zIndex: 4 - i }}>
                          {getInitials(t.fullName)}
                        </div>
                      ))}
                      {channelMembers.length > 4 && <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: T.muted, border: `2px solid ${T.navy}`, marginLeft: -8 }}>+{channelMembers.length - 4}</div>}
                    </div>
                    <button onClick={() => refetchMessages()} style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Refresh">
                      <RefreshCw size={13} />
                    </button>
                    <button onClick={() => setShowCompose(!showCompose)}
                      style={{ padding: "7px 14px", borderRadius: 8, background: showCompose ? "rgba(0,255,194,0.12)" : `linear-gradient(135deg,${T.purple},#4f46e5)`, border: `1px solid ${showCompose ? T.mint : "transparent"}`, color: showCompose ? T.mint : T.white, fontWeight: 700, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                      {showCompose ? <><X size={12} /> Close</> : <><Plus size={12} /> Compose</>}
                    </button>
                  </div>
                </div>

                {/* Compose panel */}
                {showCompose && (
                  <div style={{ marginBottom: 14, flexShrink: 0 }}>
                    <ComposePanel channel={selectedChannel} trustees={trustees as any[]} onSent={() => { refetchMessages(); setShowCompose(false); }} />
                  </div>
                )}

                {/* Message thread */}
                <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
                  {(messages as any[]).length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, opacity: 0.5 }}>
                      <Mail size={40} style={{ color: T.muted }} />
                      <p style={{ fontSize: 14, color: T.muted, textAlign: "center" }}>No messages yet in this channel.<br />Press Compose to send the first one.</p>
                    </div>
                  ) : (
                    <>
                      {(messages as any[]).map((msg: any) => <MessageBubble key={msg.id} msg={msg} />)}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
                <p style={{ color: T.muted, fontSize: 14 }}>Select a channel to begin</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
