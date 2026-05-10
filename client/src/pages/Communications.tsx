import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Mail, MessageSquare, Send, Users, Pencil, Check, X,
  AlertTriangle, Shield, Briefcase, Building2, Hash,
  Plus, RefreshCw, ArrowLeft, UserPlus, UserMinus, ChevronDown,
} from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  navy:   "#0A192F",
  card:   "rgba(13,34,64,0.85)",
  border: "rgba(255,255,255,0.08)",
  white:  "#FFFFFF",
  muted:  "rgba(255,255,255,0.45)",
  mint:   "#00FFC2",
  purple: "#635BFF",
  gold:   "#F59E0B",
};

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  alert:    <AlertTriangle size={14} />,
  shield:   <Shield size={14} />,
  briefcase:<Briefcase size={14} />,
  users:    <Users size={14} />,
  mosque:   <Building2 size={14} />,
  hash:     <Hash size={14} />,
};

const PRIORITY_OPTIONS = [
  { value: "urgent",  label: "🚨 Urgent",  color: "#EF4444" },
  { value: "high",    label: "🔴 High",    color: "#F97316" },
  { value: "normal",  label: "🟡 Normal",  color: "#F59E0B" },
  { value: "low",     label: "🟢 Low",     color: "#22C55E" },
];
const REPLY_BY_OPTIONS = [
  { value: "today",    label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "3days",    label: "3 Days" },
  { value: "7days",    label: "7 Days" },
  { value: "2weeks",   label: "2 Weeks" },
];

function getInitials(name: string) {
  const skip = ["mr","dr","mrs","ms","prof"];
  const parts = (name||"").trim().split(" ").filter(p=>!skip.includes(p.toLowerCase()));
  if (parts.length>=2) return (parts[0][0]+parts[1][0]).toUpperCase();
  return (parts[0]?.[0]??"?").toUpperCase();
}
function formatTime(ts: string|Date) {
  return new Date(ts).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: any }) {
  const isSent = msg.direction === "sent";
  const recipients: {name:string;email?:string}[] = msg.toEmailsJson ? JSON.parse(msg.toEmailsJson) : [];
  const waRecipients: {name:string;phone:string}[] = msg.whatsappNumbersJson ? JSON.parse(msg.whatsappNumbersJson) : [];
  const isWA = waRecipients.length>0 && !recipients.length;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:isSent?"flex-end":"flex-start",marginBottom:16}}>
      <div style={{maxWidth:"85%",background:isSent?`linear-gradient(135deg,${T.purple},#4f46e5)`:T.card,border:`1px solid ${T.border}`,borderRadius:isSent?"16px 16px 4px 16px":"16px 16px 16px 4px",padding:"12px 16px"}}>
        {msg.subject&&<p style={{fontSize:12,fontWeight:700,color:isWA?"#25d366":T.mint,margin:"0 0 6px"}}>{isWA?"📱 WhatsApp":`📧 ${msg.subject}`}</p>}
        <p style={{fontSize:13,color:T.white,margin:0,whiteSpace:"pre-wrap",lineHeight:1.5}}>{msg.body}</p>
        {recipients.length>0&&<p style={{fontSize:10,color:"rgba(255,255,255,0.5)",margin:"8px 0 0"}}>To: {recipients.map((r:any)=>r.name).join(", ")}</p>}
        {waRecipients.length>0&&<p style={{fontSize:10,color:"rgba(255,255,255,0.5)",margin:"8px 0 0"}}>Via WhatsApp: {waRecipients.map((r:any)=>r.name).join(", ")}</p>}
      </div>
      <p style={{fontSize:10,color:T.muted,margin:"4px 8px 0"}}>{formatTime(msg.sentAt)}{msg.fromName?` · ${msg.fromName}`:""}</p>
    </div>
  );
}

// ── Compose panel ─────────────────────────────────────────────────────────────
function ComposePanel({
  channel, allTrustees, channelMembers, onSent,
}: { channel:any; allTrustees:any[]; channelMembers:any[]; onSent:()=>void }) {
  const [tab, setTab] = useState<"individual"|"bulk"|"whatsapp">("individual");

  // Structured template fields
  const [priority, setPriority]     = useState("normal");
  const [replyBy, setReplyBy]       = useState("7days");
  const [actionBy, setActionBy]     = useState("");
  const [fromPerson, setFromPerson] = useState("");
  const [subject, setSubject]       = useState("");
  const [body, setBody]             = useState("");

  // Recipient selection (email)
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // WhatsApp recipient selection
  const [selectedWaIds, setSelectedWaIds] = useState<number[]>([]);
  const [showWaLinks, setShowWaLinks]     = useState(false);

  const emailMembers = channelMembers.filter((t:any)=>t.email);
  const waMembers    = channelMembers.filter((t:any)=>t.phone);

  const sendEmailMutation = trpc.comms.sendEmail.useMutation({
    onSuccess:(res)=>{toast.success(`Sent to ${res.sent} recipient${res.sent!==1?"s":""}`);setBody("");setSubject("");setSelectedIds([]);onSent();},
    onError:(e)=>toast.error(e.message),
  });
  const logWaMutation = trpc.comms.logWhatsApp.useMutation({
    onSuccess:()=>{toast.success("WhatsApp messages logged");setBody("");setShowWaLinks(false);onSent();},
    onError:(e)=>toast.error(e.message),
  });

  // Build full message body from structured template
  const buildEmailBody = () => {
    const priorityLabel = PRIORITY_OPTIONS.find(p=>p.value===priority)?.label ?? priority;
    const replyLabel    = REPLY_BY_OPTIONS.find(r=>r.value===replyBy)?.label ?? replyBy;
    const actionName    = allTrustees.find((t:any)=>String(t.id)===actionBy)?.fullName ?? actionBy;
    const fromName      = allTrustees.find((t:any)=>String(t.id)===fromPerson)?.fullName ?? fromPerson;
    return [
      "Assalamu Alaikum wa Rahmatullahi wa Barakatuh,",
      "",
      `Priority: ${priorityLabel}`,
      `Need reply back by: ${replyLabel}`,
      actionName ? `Action by: ${actionName}` : "",
      "",
      body,
      "",
      `From: ${fromName || "AQS Team"}`,
      "JazakAllahu Khayran",
    ].filter((l,i,a)=>!(l===""&&a[i-1]==="")).join("\n");
  };

  const buildWaBody = () => {
    const priorityLabel = PRIORITY_OPTIONS.find(p=>p.value===priority)?.label ?? priority;
    const replyLabel    = REPLY_BY_OPTIONS.find(r=>r.value===replyBy)?.label ?? replyBy;
    const actionName    = allTrustees.find((t:any)=>String(t.id)===actionBy)?.fullName ?? actionBy;
    const fromName      = allTrustees.find((t:any)=>String(t.id)===fromPerson)?.fullName ?? fromPerson;
    return [
      "Assalamu Alaikum wa Rahmatullahi wa Barakatuh,",
      "",
      `*Priority:* ${priorityLabel}`,
      `*Need reply back by:* ${replyLabel}`,
      actionName ? `*Action by:* ${actionName}` : "",
      "",
      body,
      "",
      `*From:* ${fromName || "AQS Team"}`,
      "JazakAllahu Khayran 🤲",
    ].filter((l,i,a)=>!(l===""&&a[i-1]==="")).join("\n");
  };

  const handleSendEmail = () => {
    if (!subject.trim()||!body.trim()){toast.error("Subject and message body are required");return;}
    const recipients = tab==="bulk"
      ? emailMembers.map((t:any)=>({name:t.fullName,email:t.email}))
      : emailMembers.filter((t:any)=>selectedIds.includes(t.id)).map((t:any)=>({name:t.fullName,email:t.email}));
    if (!recipients.length){toast.error("No recipients selected");return;}
    sendEmailMutation.mutate({channelId:channel.id,recipients,subject,body:buildEmailBody(),isBulk:tab==="bulk"});
  };

  const handleSendWA = () => {
    if (!body.trim()){toast.error("Message body is required");return;}
    const recipients = waMembers.filter((t:any)=>selectedWaIds.includes(t.id));
    if (!recipients.length){toast.error("Select at least one WhatsApp recipient");return;}
    logWaMutation.mutate({channelId:channel.id,recipients:recipients.map((t:any)=>({name:t.fullName,phone:t.phone})),message:buildWaBody()});
    setShowWaLinks(true);
  };

  const inp: React.CSSProperties = {width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,borderRadius:8,color:T.white,padding:"10px 12px",fontSize:13,boxSizing:"border-box"};
  const sel: React.CSSProperties = {...inp,appearance:"none" as any,cursor:"pointer"};
  const priorityColor = PRIORITY_OPTIONS.find(p=>p.value===priority)?.color ?? T.mint;

  return (
    <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:20}}>
      <p style={{fontSize:12,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 14px"}}>Compose Message</p>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {(["individual","bulk","whatsapp"] as const).map(t=>(
          <button key={t} onClick={()=>{setTab(t);setShowWaLinks(false);}}
            style={{flex:1,padding:"8px 0",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",border:`1px solid ${tab===t?T.purple:T.border}`,background:tab===t?"rgba(99,91,255,0.2)":"transparent",color:tab===t?T.white:T.muted}}>
            {t==="individual"?"✉️ Individual":t==="bulk"?"📨 Bulk":"📱 WhatsApp"}
          </button>
        ))}
      </div>

      {/* ── Structured template fields (shared across all tabs) ── */}
      <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:14}}>
        <p style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",margin:"0 0 10px"}}>Message Template</p>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          {/* Priority */}
          <div>
            <label style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>Priority</label>
            <div style={{position:"relative"}}>
              <select value={priority} onChange={e=>setPriority(e.target.value)} style={{...sel,paddingRight:28,color:priorityColor,borderColor:`${priorityColor}40`}}>
                {PRIORITY_OPTIONS.map(o=><option key={o.value} value={o.value} style={{color:T.white,background:"#0A192F"}}>{o.label}</option>)}
              </select>
              <ChevronDown size={12} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",color:T.muted,pointerEvents:"none"}}/>
            </div>
          </div>
          {/* Reply by */}
          <div>
            <label style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>Need Reply By</label>
            <div style={{position:"relative"}}>
              <select value={replyBy} onChange={e=>setReplyBy(e.target.value)} style={{...sel,paddingRight:28}}>
                {REPLY_BY_OPTIONS.map(o=><option key={o.value} value={o.value} style={{color:T.white,background:"#0A192F"}}>{o.label}</option>)}
              </select>
              <ChevronDown size={12} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",color:T.muted,pointerEvents:"none"}}/>
            </div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          {/* Action by */}
          <div>
            <label style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>Action By</label>
            <div style={{position:"relative"}}>
              <select value={actionBy} onChange={e=>setActionBy(e.target.value)} style={{...sel,paddingRight:28}}>
                <option value="" style={{color:T.muted,background:"#0A192F"}}>— Select —</option>
                {allTrustees.map((t:any)=><option key={t.id} value={String(t.id)} style={{color:T.white,background:"#0A192F"}}>{t.fullName}</option>)}
              </select>
              <ChevronDown size={12} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",color:T.muted,pointerEvents:"none"}}/>
            </div>
          </div>
          {/* From */}
          <div>
            <label style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>From</label>
            <div style={{position:"relative"}}>
              <select value={fromPerson} onChange={e=>setFromPerson(e.target.value)} style={{...sel,paddingRight:28}}>
                <option value="" style={{color:T.muted,background:"#0A192F"}}>— Select —</option>
                {allTrustees.map((t:any)=><option key={t.id} value={String(t.id)} style={{color:T.white,background:"#0A192F"}}>{t.fullName} ({t.role})</option>)}
              </select>
              <ChevronDown size={12} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",color:T.muted,pointerEvents:"none"}}/>
            </div>
          </div>
        </div>

        {/* Subject (email only) */}
        {tab!=="whatsapp"&&(
          <div style={{marginBottom:8}}>
            <label style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>Subject</label>
            <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="e.g. Project Milestone Update" style={inp}/>
          </div>
        )}

        {/* Message body */}
        <div>
          <label style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>Message Body</label>
          <textarea value={body} onChange={e=>setBody(e.target.value)} rows={4} placeholder="Write your message here..." style={{...inp,resize:"vertical" as any}}/>
        </div>
      </div>

      {/* ── Email: recipient selection ── */}
      {tab!=="whatsapp"&&(
        <>
          {tab==="individual"&&(
            <div style={{marginBottom:12}}>
              <p style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",margin:"0 0 6px"}}>Select Recipients (tap to toggle)</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {emailMembers.map((t:any)=>{
                  const sel2=selectedIds.includes(t.id);
                  return (
                    <button key={t.id} onClick={()=>setSelectedIds(prev=>sel2?prev.filter(i=>i!==t.id):[...prev,t.id])}
                      style={{padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${sel2?T.mint:T.border}`,background:sel2?"rgba(0,255,194,0.12)":"transparent",color:sel2?T.mint:T.muted,transition:"all 0.15s"}}>
                      {t.fullName}
                    </button>
                  );
                })}
                {!emailMembers.length&&<p style={{fontSize:12,color:T.muted}}>No email addresses in this channel.</p>}
              </div>
            </div>
          )}
          {tab==="bulk"&&(
            <div style={{background:"rgba(99,91,255,0.08)",border:"1px solid rgba(99,91,255,0.2)",borderRadius:8,padding:"10px 12px",marginBottom:12}}>
              <p style={{fontSize:12,color:T.muted,margin:0}}>📨 Will send to all <strong style={{color:T.white}}>{emailMembers.length}</strong> channel members with email: {emailMembers.map((t:any)=>t.fullName).join(", ")}</p>
            </div>
          )}
          <button onClick={handleSendEmail} disabled={sendEmailMutation.isPending}
            style={{width:"100%",padding:"12px 0",borderRadius:10,background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",fontWeight:700,border:"none",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Send size={14}/>{sendEmailMutation.isPending?"Sending…":"Send Email"}
          </button>
        </>
      )}

      {/* ── WhatsApp ── */}
      {tab==="whatsapp"&&(
        <>
          <div style={{marginBottom:12}}>
            <p style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",margin:"0 0 6px"}}>Select WhatsApp Recipients (tap to toggle)</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {waMembers.map((t:any)=>{
                const sel2=selectedWaIds.includes(t.id);
                return (
                  <button key={t.id} onClick={()=>setSelectedWaIds(prev=>sel2?prev.filter(i=>i!==t.id):[...prev,t.id])}
                    style={{padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${sel2?"#25d366":T.border}`,background:sel2?"rgba(37,211,102,0.12)":"transparent",color:sel2?"#25d366":T.muted,transition:"all 0.15s"}}>
                    {t.fullName}
                  </button>
                );
              })}
              {!waMembers.length&&<p style={{fontSize:12,color:T.muted}}>No phone numbers in this channel.</p>}
            </div>
          </div>
          <button onClick={handleSendWA} disabled={!selectedWaIds.length||logWaMutation.isPending}
            style={{width:"100%",padding:"12px 0",borderRadius:10,background:"linear-gradient(135deg,#25d366,#128C7E)",color:T.white,fontWeight:700,border:"none",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:12}}>
            <MessageSquare size={14}/>{logWaMutation.isPending?"Logging…":"Open WhatsApp Links"}
          </button>
          {showWaLinks&&body&&selectedWaIds.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <p style={{fontSize:11,color:T.muted,margin:0}}>Tap each link to open WhatsApp:</p>
              {waMembers.filter((t:any)=>selectedWaIds.includes(t.id)).map((t:any)=>{
                const msg=buildWaBody();
                // Normalise UK phone: strip spaces/dashes, strip leading 0, prepend 44
                const rawPhone=(t.phone??"").replace(/[\s\-().]/g,"");
                const normPhone=rawPhone.startsWith("+")?rawPhone.slice(1):rawPhone.startsWith("44")?rawPhone:`44${rawPhone.replace(/^0/,"")}`;
                const link=`https://wa.me/${normPhone}?text=${encodeURIComponent(msg)}`;
                return (
                  <button key={t.id}
                    onClick={()=>window.open(link,"_blank","noopener,noreferrer")}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:10,background:"rgba(37,211,102,0.08)",border:"1px solid rgba(37,211,102,0.2)",cursor:"pointer",width:"100%",textAlign:"left"}}>
                    <span style={{width:32,height:32,borderRadius:"50%",background:"rgba(37,211,102,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#25d366",flexShrink:0}}>{getInitials(t.fullName)}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{fontSize:13,fontWeight:600,color:T.white,margin:0}}>{t.fullName}</p>
                      <p style={{fontSize:11,color:"#25d366",margin:0}}>{t.phone} → Open WhatsApp ↗</p>
                    </div>
                    <MessageSquare size={14} style={{color:"#25d366",flexShrink:0}}/>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Member management panel ───────────────────────────────────────────────────
function MemberManager({
  channel, allTrustees, channelMembers, onUpdate,
}: { channel:any; allTrustees:any[]; channelMembers:any[]; onUpdate:()=>void }) {
  const [open, setOpen] = useState(false);
  const updateChannel = trpc.comms.updateChannel.useMutation({
    onSuccess:()=>{toast.success("Members updated");onUpdate();},
    onError:(e)=>toast.error(e.message),
  });

  const currentIds = channelMembers.map((t:any)=>t.id);

  // For the Trustees channel, only allow adding actual trustees (not managers/deputies)
  const isTrusteesChannel = (channel.name??"").toLowerCase().includes("trust");
  const addCandidates = (allTrustees as any[]).filter((t:any) => {
    if (currentIds.includes(t.id)) return false;
    if (isTrusteesChannel) {
      const r = (t.role??"").toLowerCase();
      return r.includes("trustee") || r.includes("chair");
    }
    return true;
  });
  const notInChannel = addCandidates;

  const addMember = (trusteeId: number) => {
    const newIds = [...currentIds, trusteeId];
    updateChannel.mutate({id:channel.id,name:channel.name,description:channel.description??undefined,channelMemberIds:newIds});
  };
  const removeMember = (trusteeId: number) => {
    const newIds = currentIds.filter((i:number)=>i!==trusteeId);
    updateChannel.mutate({id:channel.id,name:channel.name,description:channel.description??undefined,channelMemberIds:newIds});
  };

  return (
    <div style={{marginBottom:12}}>
      <button onClick={()=>setOpen(!open)}
        style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer",fontSize:11,fontWeight:600}}>
        <Users size={12}/> Manage Members ({channelMembers.length})
        <ChevronDown size={10} style={{transform:open?"rotate(180deg)":"none",transition:"transform 0.2s"}}/>
      </button>

      {open&&(
        <div style={{marginTop:8,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
          <p style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",margin:"0 0 8px"}}>Current Members</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
            {channelMembers.map((t:any)=>(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px 4px 10px",borderRadius:20,background:"rgba(99,91,255,0.12)",border:"1px solid rgba(99,91,255,0.25)"}}>
                <span style={{fontSize:12,color:T.white,fontWeight:500}}>{t.fullName}</span>
                <button onClick={()=>removeMember(t.id)} style={{width:16,height:16,borderRadius:"50%",background:"rgba(239,68,68,0.2)",border:"none",color:"#EF4444",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>
                  <X size={9}/>
                </button>
              </div>
            ))}
            {!channelMembers.length&&<p style={{fontSize:12,color:T.muted,margin:0}}>No members yet.</p>}
          </div>

          {notInChannel.length>0&&(
            <>
              <p style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",margin:"0 0 8px"}}>Add Member</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {notInChannel.map((t:any)=>(
                  <button key={t.id} onClick={()=>addMember(t.id)}
                    style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:20,background:"rgba(0,255,194,0.06)",border:`1px solid rgba(0,255,194,0.2)`,color:T.mint,cursor:"pointer",fontSize:12,fontWeight:500}}>
                    <UserPlus size={10}/> {t.fullName}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CommunicationsPage() {
  const [selectedChannelId, setSelectedChannelId] = useState<number|null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [editingChannel, setEditingChannel] = useState<number|null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [showCompose, setShowCompose] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {data:channels=[],refetch:refetchChannels} = trpc.comms.listChannels.useQuery();
  const {data:allTrustees=[]} = trpc.trustees.listActive.useQuery();
  const {data:messages=[],refetch:refetchMessages} = trpc.comms.listMessages.useQuery(
    {channelId:selectedChannelId!},{enabled:selectedChannelId!==null}
  );
  const updateChannelMutation = trpc.comms.updateChannel.useMutation({
    onSuccess:()=>{toast.success("Channel updated");setEditingChannel(null);refetchChannels();},
    onError:(e)=>toast.error(e.message),
  });

  const selectedChannel = (channels as any[]).find((c:any)=>c.id===selectedChannelId);

  // Compute channel members: if channelMemberIds is set, use those; else fall back to role-based
  const channelMembers = (() => {
    if (!selectedChannel) return [];
    const ch = selectedChannel as any;
    if (ch.channelMemberIds) {
      try {
        const ids: number[] = JSON.parse(ch.channelMemberIds);
        return (allTrustees as any[]).filter((t:any)=>ids.includes(t.id));
      } catch { /* fall through */ }
    }
    const roles = (ch.memberRoles??"").split(",").map((r:string)=>r.trim().toLowerCase());
    return (allTrustees as any[]).filter((t:any)=>{
      const r=(t.role??"").toLowerCase();
      return roles.some((role:string)=>r.includes(role));
    });
  })();

  useEffect(()=>{
    if ((channels as any[]).length&&selectedChannelId===null){
      setSelectedChannelId((channels[0] as any).id);
    }
  },[channels]);

  useEffect(()=>{messagesEndRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);

  const handleSelectChannel = (id: number) => {
    setSelectedChannelId(id);
    setShowPanel(true);
    setShowCompose(false);
  };

  return (
    <>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        textarea:focus,input:focus,select:focus{outline:none;border-color:rgba(99,91,255,0.6)!important;}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
        .comms-grid{display:grid;grid-template-columns:240px 1fr;height:calc(100vh - 120px);overflow:hidden}
        @media(max-width:640px){.comms-grid{display:block;height:auto}}
        .comms-sidebar{overflow-y:auto;padding-right:10px;border-right:1px solid rgba(255,255,255,0.08)}
        @media(max-width:640px){.comms-sidebar{border-right:none;padding-right:0}}
        .comms-main{display:flex;flex-direction:column;padding-left:16px;overflow:hidden;height:100%}
        @media(max-width:640px){.comms-main{padding-left:0;height:auto;margin-top:12px}}
        .comms-thread{flex:1;overflow-y:auto;padding-right:4px}
        @media(max-width:640px){.comms-thread{max-height:50vh}}
        select option{background:#0A192F;color:#fff}
      `}</style>
      <div style={{minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,fontFamily:"'DM Sans',sans-serif",padding:"16px"}}>

        {/* Header */}
        <div style={{marginBottom:16,animation:"fadeUp 0.4s ease both"}}>
          <h1 style={{fontSize:"clamp(20px,3vw,26px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em"}}>
            Communications <span style={{color:T.mint}}>Hub</span>
          </h1>
          <p style={{fontSize:12,color:T.muted,margin:"4px 0 0"}}>AQS internal messaging — email &amp; WhatsApp</p>
        </div>

        {/* Grid */}
        <div className="comms-grid">

          {/* ── Sidebar ── */}
          <div className="comms-sidebar" style={{display: showPanel ? "none" : undefined}} id="comms-sidebar-mobile">
            <style>{`@media(min-width:641px){#comms-sidebar-mobile{display:block!important}}`}</style>
            <p style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 8px 2px"}}>Channels</p>
            {(channels as any[]).map((ch:any,i:number)=>{
              const isSelected = ch.id===selectedChannelId;
              const isEditing  = editingChannel===ch.id;
              return (
                <div key={ch.id} style={{marginBottom:4,animation:`fadeUp 0.4s ease ${i*50}ms both`}}>
                  {isEditing?(
                    <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 12px"}}>
                      <input value={editName} onChange={e=>setEditName(e.target.value)}
                        style={{width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:6,color:T.white,padding:"6px 8px",fontSize:12,marginBottom:6,boxSizing:"border-box"}}/>
                      <input value={editDesc} onChange={e=>setEditDesc(e.target.value)} placeholder="Description (optional)"
                        style={{width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:6,color:T.white,padding:"6px 8px",fontSize:12,marginBottom:8,boxSizing:"border-box"}}/>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>updateChannelMutation.mutate({id:ch.id,name:editName,description:editDesc})}
                          style={{flex:1,padding:"6px 0",borderRadius:6,background:T.mint,color:"#081526",fontWeight:700,border:"none",cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                          <Check size={10}/>Save
                        </button>
                        <button onClick={()=>setEditingChannel(null)}
                          style={{flex:1,padding:"6px 0",borderRadius:6,background:"rgba(255,255,255,0.06)",color:T.muted,fontWeight:700,border:`1px solid ${T.border}`,cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                          <X size={10}/>Cancel
                        </button>
                      </div>
                    </div>
                  ):(
                    <div onClick={()=>handleSelectChannel(ch.id)}
                      style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:10,cursor:"pointer",background:isSelected?"rgba(99,91,255,0.18)":"transparent",border:`1px solid ${isSelected?"rgba(99,91,255,0.35)":"transparent"}`,transition:"all 0.15s"}}>
                      <span style={{color:ch.color,flexShrink:0}}>{CHANNEL_ICONS[ch.icon]??<Hash size={14}/>}</span>
                      <span style={{fontSize:13,fontWeight:isSelected?700:500,color:isSelected?T.white:T.muted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ch.name}</span>
                      {ch.isEditable&&(
                        <button onClick={e=>{e.stopPropagation();setEditingChannel(ch.id);setEditName(ch.name);setEditDesc(ch.description??"");}}
                          style={{width:22,height:22,borderRadius:6,background:"transparent",border:"none",color:T.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,opacity:0.6}}>
                          <Pencil size={10}/>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Right panel ── */}
          <div className="comms-main" style={{display: !showPanel ? "none" : undefined}} id="comms-main-mobile">
            <style>{`@media(min-width:641px){#comms-main-mobile{display:flex!important}}`}</style>
            {selectedChannel?(
              <>
                {/* Channel header */}
                <div style={{display:"flex",alignItems:"center",gap:10,paddingBottom:12,borderBottom:`1px solid ${T.border}`,marginBottom:12,flexShrink:0,flexWrap:"wrap"}}>
                  <button onClick={()=>setShowPanel(false)} id="comms-back-btn"
                    style={{width:32,height:32,borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer",display:"none",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <ArrowLeft size={14}/>
                  </button>
                  <style>{`@media(max-width:640px){#comms-back-btn{display:flex!important}}`}</style>
                  <span style={{color:(selectedChannel as any).color,fontSize:18}}>{CHANNEL_ICONS[(selectedChannel as any).icon]??<Hash size={18}/>}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <h2 style={{fontSize:15,fontWeight:700,color:T.white,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(selectedChannel as any).name}</h2>
                    {(selectedChannel as any).description&&<p style={{fontSize:11,color:T.muted,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(selectedChannel as any).description}</p>}
                  </div>
                  {/* Member avatars */}
                  <div style={{display:"flex",flexShrink:0}}>
                    {channelMembers.slice(0,3).map((t:any,i:number)=>(
                      <div key={t.id} title={t.fullName} style={{width:26,height:26,borderRadius:"50%",background:`linear-gradient(135deg,${T.purple},#4f46e5)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:T.white,border:`2px solid ${T.navy}`,marginLeft:i>0?-6:0}}>
                        {getInitials(t.fullName)}
                      </div>
                    ))}
                    {channelMembers.length>3&&<div style={{width:26,height:26,borderRadius:"50%",background:"rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:T.muted,border:`2px solid ${T.navy}`,marginLeft:-6}}>+{channelMembers.length-3}</div>}
                  </div>
                  <button onClick={()=>refetchMessages()} style={{width:30,height:30,borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <RefreshCw size={12}/>
                  </button>
                  <button onClick={()=>setShowCompose(!showCompose)}
                    style={{padding:"7px 12px",borderRadius:8,background:showCompose?"rgba(0,255,194,0.12)":`linear-gradient(135deg,${T.purple},#4f46e5)`,border:`1px solid ${showCompose?T.mint:"transparent"}`,color:showCompose?T.mint:T.white,fontWeight:700,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                    {showCompose?<><X size={12}/>Close</>:<><Plus size={12}/>Compose</>}
                  </button>
                </div>

                {/* Member manager */}
                <MemberManager
                  channel={selectedChannel}
                  allTrustees={allTrustees as any[]}
                  channelMembers={channelMembers}
                  onUpdate={refetchChannels}
                />

                {/* Compose */}
                {showCompose&&(
                  <div style={{marginBottom:12,flexShrink:0,overflowY:"auto",maxHeight:"60vh"}}>
                    <ComposePanel
                      channel={selectedChannel}
                      allTrustees={allTrustees as any[]}
                      channelMembers={channelMembers}
                      onSent={()=>{refetchMessages();setShowCompose(false);}}
                    />
                  </div>
                )}

                {/* Thread */}
                <div className="comms-thread">
                  {(messages as any[]).length===0?(
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 0",gap:12,opacity:0.5}}>
                      <Mail size={36} style={{color:T.muted}}/>
                      <p style={{fontSize:13,color:T.muted,textAlign:"center"}}>No messages yet.<br/>Press Compose to send the first one.</p>
                    </div>
                  ):(
                    <>
                      {(messages as any[]).map((msg:any)=><MessageBubble key={msg.id} msg={msg}/>)}
                      <div ref={messagesEndRef}/>
                    </>
                  )}
                </div>
              </>
            ):(
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",flex:1,padding:40}}>
                <p style={{color:T.muted,fontSize:14}}>Select a channel to begin</p>
              </div>
            )}
          </div>

          {/* Mobile hint */}
          {!showPanel&&(
            <div id="comms-mobile-hint" style={{display:"none",marginTop:8,padding:"12px 16px",background:T.card,border:`1px solid ${T.border}`,borderRadius:12}}>
              <p style={{fontSize:12,color:T.muted,margin:0,textAlign:"center"}}>Tap a channel above to open it</p>
            </div>
          )}
          <style>{`@media(max-width:640px){#comms-mobile-hint{display:block!important}}`}</style>
        </div>
      </div>
    </>
  );
}
