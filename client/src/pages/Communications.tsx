import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Mail, MessageSquare, Send, Users, Pencil, Check, X,
  AlertTriangle, Shield, Briefcase, Building2, Hash,
  Plus, RefreshCw, ArrowLeft, UserPlus, ChevronDown, LogIn,
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
function normaliseUkPhone(phone: string) {
  const raw = (phone??"").replace(/[\s\-().]/g,"");
  if (raw.startsWith("+")) return raw.slice(1);
  if (raw.startsWith("44")) return raw;
  return `44${raw.replace(/^0/,"")}`;
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: any }) {
  const isSent = msg.direction === "sent";
  const isReceived = msg.direction === "received";
  const recipients: {name:string;email?:string}[] = msg.toEmailsJson ? JSON.parse(msg.toEmailsJson) : [];
  const waRecipients: {name:string;phone:string}[] = msg.whatsappNumbersJson ? JSON.parse(msg.whatsappNumbersJson) : [];
  const isWA = waRecipients.length>0 && !recipients.length;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:isSent?"flex-end":"flex-start",marginBottom:16}}>
      {isReceived&&(
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,marginLeft:4}}>
          <div style={{width:22,height:22,borderRadius:"50%",background:"rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:T.muted}}>
            {getInitials(msg.fromName||"?")}
          </div>
          <span style={{fontSize:11,color:T.muted}}>{msg.fromName}</span>
        </div>
      )}
      <div style={{maxWidth:"85%",background:isSent?`linear-gradient(135deg,${T.purple},#4f46e5)`:"rgba(255,255,255,0.07)",border:`1px solid ${isSent?"transparent":T.border}`,borderRadius:isSent?"16px 16px 4px 16px":"16px 16px 16px 4px",padding:"12px 16px"}}>
        {msg.subject&&<p style={{fontSize:12,fontWeight:700,color:isWA?"#25d366":T.mint,margin:"0 0 6px"}}>{isWA?"📱 WhatsApp":`📧 ${msg.subject}`}</p>}
        <p style={{fontSize:13,color:T.white,margin:0,whiteSpace:"pre-wrap",lineHeight:1.5}}>{msg.body}</p>
        {recipients.length>0&&<p style={{fontSize:10,color:"rgba(255,255,255,0.5)",margin:"8px 0 0"}}>To: {recipients.map((r:any)=>r.name).join(", ")}</p>}
        {waRecipients.length>0&&isSent&&<p style={{fontSize:10,color:"rgba(255,255,255,0.5)",margin:"8px 0 0"}}>Via WhatsApp: {waRecipients.map((r:any)=>r.name).join(", ")}</p>}
      </div>
      <p style={{fontSize:10,color:T.muted,margin:"4px 8px 0"}}>{formatTime(msg.sentAt)}{msg.fromName&&isSent?` · ${msg.fromName}`:""}</p>
    </div>
  );
}

// ── Log Incoming Reply panel ──────────────────────────────────────────────────
function LogIncomingPanel({ channelId, allTrustees, onSaved }: { channelId: number; allTrustees: any[]; onSaved: ()=>void }) {
  const [open, setOpen] = useState(false);
  const [fromName, setFromName] = useState("");
  const [body, setBody] = useState("");
  const [via, setVia] = useState<"whatsapp"|"email">("whatsapp");

  const logMutation = trpc.comms.logIncoming.useMutation({
    onSuccess:()=>{toast.success("Reply logged");setBody("");setFromName("");setOpen(false);onSaved();},
    onError:(e)=>toast.error(e.message),
  });

  const inp: React.CSSProperties = {width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,borderRadius:8,color:T.white,padding:"10px 12px",fontSize:13,boxSizing:"border-box"};

  return (
    <div style={{marginBottom:12}}>
      <button onClick={()=>setOpen(!open)}
        style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer",fontSize:11,fontWeight:600}}>
        <LogIn size={12}/> Log Incoming Reply
        <ChevronDown size={10} style={{transform:open?"rotate(180deg)":"none",transition:"transform 0.2s"}}/>
      </button>

      {open&&(
        <div style={{marginTop:8,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
          <p style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",margin:"0 0 10px"}}>Log a received reply</p>

          {/* Via toggle */}
          <div style={{display:"flex",gap:6,marginBottom:10}}>
            {(["whatsapp","email"] as const).map(v=>(
              <button key={v} onClick={()=>setVia(v)}
                style={{flex:1,padding:"6px 0",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",border:`1px solid ${via===v?(v==="whatsapp"?"#25d366":T.mint):T.border}`,background:via===v?(v==="whatsapp"?"rgba(37,211,102,0.12)":"rgba(0,255,194,0.08)"):"transparent",color:via===v?(v==="whatsapp"?"#25d366":T.mint):T.muted}}>
                {v==="whatsapp"?"📱 WhatsApp":"📧 Email"}
              </button>
            ))}
          </div>

          {/* From name */}
          <div style={{marginBottom:8}}>
            <label style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>From</label>
            <div style={{position:"relative"}}>
              <select value={fromName} onChange={e=>setFromName(e.target.value)} style={{...inp,appearance:"none" as any,paddingRight:28,cursor:"pointer"}}>
                <option value="" style={{color:T.muted,background:"#0A192F"}}>— Select sender —</option>
                {allTrustees.map((t:any)=><option key={t.id} value={t.fullName} style={{color:T.white,background:"#0A192F"}}>{t.fullName}</option>)}
                <option value="__other__" style={{color:T.white,background:"#0A192F"}}>Other (type below)</option>
              </select>
              <ChevronDown size={12} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",color:T.muted,pointerEvents:"none"}}/>
            </div>
            {fromName==="__other__"&&(
              <input placeholder="Sender name" style={{...inp,marginTop:6}}
                onChange={e=>setFromName(e.target.value==="__other__"?"":e.target.value)}/>
            )}
          </div>

          {/* Message body */}
          <div style={{marginBottom:10}}>
            <label style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>Their Message</label>
            <textarea value={body} onChange={e=>setBody(e.target.value)} rows={3} placeholder="Paste or type their reply here..." style={{...inp,resize:"vertical" as any}}/>
          </div>

          <button onClick={()=>{if(!fromName||fromName==="__other__"){toast.error("Please select a sender");return;}if(!body.trim()){toast.error("Message body required");return;}logMutation.mutate({channelId,fromName,body,via});}}
            disabled={logMutation.isPending}
            style={{width:"100%",padding:"10px 0",borderRadius:10,background:via==="whatsapp"?"linear-gradient(135deg,#25d366,#128C7E)":`linear-gradient(135deg,${T.mint},#00DDB0)`,color:via==="whatsapp"?T.white:"#081526",fontWeight:700,border:"none",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <LogIn size={14}/>{logMutation.isPending?"Saving…":"Save Reply to Thread"}
          </button>
        </div>
      )}
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

  // Email recipient selection
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // WhatsApp recipient selection
  const [selectedWaIds, setSelectedWaIds] = useState<number[]>([]);

  const emailMembers = channelMembers.filter((t:any)=>t.email);
  const waMembers    = channelMembers.filter((t:any)=>t.phone);

  const sendEmailMutation = trpc.comms.sendEmail.useMutation({
    onSuccess:(res)=>{toast.success(`Sent to ${res.sent} recipient${res.sent!==1?"s":""}`);setBody("");setSubject("");setSelectedIds([]);onSent();},
    onError:(e)=>toast.error(e.message),
  });
  const logWaMutation = trpc.comms.logWhatsApp.useMutation({
    onError:(e)=>console.error("WA log error:",e.message),
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
    // Use WhatsApp bold + emoji flags to draw attention (red circle = 🔴, exclamation = ❗)
    const priorityEmoji = priority === "urgent" ? "🔴" : priority === "high" ? "🟠" : priority === "normal" ? "🟡" : "🟢";
    return [
      "🔔 *AQS — Action Required*",
      "",
      "Assalamu Alaikum wa Rahmatullahi wa Barakatuh,",
      "",
      `${priorityEmoji} *Priority:* ${priorityLabel}`,
      `⏰ *Need reply back by:* ${replyLabel}`,
      actionName ? `👤 *Action by:* ${actionName}` : "",
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

  // Open WhatsApp for a single recipient AND log it silently
  const handleOpenWA = (trustee: any) => {
    if (!body.trim()){toast.error("Write a message body first");return;}
    const msg = buildWaBody();
    const normPhone = normaliseUkPhone(trustee.phone);
    const link = `https://wa.me/${normPhone}?text=${encodeURIComponent(msg)}`;
    window.open(link, "_blank", "noopener,noreferrer");
    // Silent background log
    logWaMutation.mutate({
      channelId: channel.id,
      recipients: [{name: trustee.fullName, phone: trustee.phone}],
      message: msg,
    });
    onSent();
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
          <button key={t} onClick={()=>setTab(t)}
            style={{flex:1,padding:"8px 0",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",border:`1px solid ${tab===t?T.purple:T.border}`,background:tab===t?"rgba(99,91,255,0.2)":"transparent",color:tab===t?T.white:T.muted}}>
            {t==="individual"?"✉️ Individual":t==="bulk"?"📨 Bulk":"📱 WhatsApp"}
          </button>
        ))}
      </div>

      {/* ── Structured template fields ── */}
      <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:14}}>
        <p style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",margin:"0 0 10px"}}>Message Template</p>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div>
            <label style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>Priority</label>
            <div style={{position:"relative"}}>
              <select value={priority} onChange={e=>setPriority(e.target.value)} style={{...sel,paddingRight:28,color:priorityColor,borderColor:`${priorityColor}40`}}>
                {PRIORITY_OPTIONS.map(o=><option key={o.value} value={o.value} style={{color:T.white,background:"#0A192F"}}>{o.label}</option>)}
              </select>
              <ChevronDown size={12} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",color:T.muted,pointerEvents:"none"}}/>
            </div>
          </div>
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

        {tab!=="whatsapp"&&(
          <div style={{marginBottom:8}}>
            <label style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>Subject</label>
            <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="e.g. Project Milestone Update" style={inp}/>
          </div>
        )}

        <div>
          <label style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>Message Body</label>
          <textarea value={body} onChange={e=>setBody(e.target.value)} rows={4} placeholder="Write your message here..." style={{...inp,resize:"vertical" as any}}/>
        </div>
      </div>

      {/* ── Email tabs ── */}
      {tab!=="whatsapp"&&(
        <>
          {tab==="individual"&&(
            <div style={{marginBottom:12}}>
              <p style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",margin:"0 0 6px"}}>Select Recipients (tap to toggle)</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {emailMembers.map((t:any)=>{
                  const isSel=selectedIds.includes(t.id);
                  return (
                    <button key={t.id} onClick={()=>setSelectedIds(prev=>isSel?prev.filter(i=>i!==t.id):[...prev,t.id])}
                      style={{padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${isSel?T.mint:T.border}`,background:isSel?"rgba(0,255,194,0.12)":"transparent",color:isSel?T.mint:T.muted,transition:"all 0.15s"}}>
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

      {/* ── WhatsApp tab: per-recipient buttons shown immediately ── */}
      {tab==="whatsapp"&&(
        <>
          {/* Group link banner */}
          {channel.whatsappGroupLink&&(
            <div style={{marginBottom:12,background:"rgba(37,211,102,0.08)",border:"1px solid rgba(37,211,102,0.25)",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
              <MessageSquare size={16} style={{color:"#25d366",flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:12,fontWeight:700,color:"#25d366",margin:0}}>WhatsApp Group</p>
                <p style={{fontSize:11,color:"rgba(255,255,255,0.5)",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{channel.whatsappGroupLink}</p>
              </div>
              <button onClick={()=>window.open(channel.whatsappGroupLink,"_blank","noopener,noreferrer")}
                style={{padding:"6px 12px",borderRadius:8,background:"linear-gradient(135deg,#25d366,#128C7E)",border:"none",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:11,flexShrink:0}}>
                Open Group
              </button>
            </div>
          )}
          <p style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",margin:"0 0 8px"}}>
            Tap a name to open WhatsApp — message is sent directly &amp; logged
          </p>
          {!waMembers.length&&<p style={{fontSize:12,color:T.muted}}>No phone numbers in this channel.</p>}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {waMembers.map((t:any)=>(
              <button key={t.id}
                onClick={()=>handleOpenWA(t)}
                style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:12,background:"rgba(37,211,102,0.08)",border:"1px solid rgba(37,211,102,0.25)",cursor:"pointer",width:"100%",textAlign:"left",transition:"background 0.15s"}}>
                <span style={{width:36,height:36,borderRadius:"50%",background:"rgba(37,211,102,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#25d366",flexShrink:0}}>
                  {getInitials(t.fullName)}
                </span>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:13,fontWeight:700,color:T.white,margin:0}}>{t.fullName}</p>
                  <p style={{fontSize:11,color:"rgba(255,255,255,0.4)",margin:0}}>{t.phone}</p>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",borderRadius:8,background:"rgba(37,211,102,0.15)",flexShrink:0}}>
                  <MessageSquare size={12} style={{color:"#25d366"}}/>
                  <span style={{fontSize:11,fontWeight:700,color:"#25d366"}}>Open WhatsApp</span>
                </div>
              </button>
            ))}
          </div>
          {!body.trim()&&(
            <p style={{fontSize:11,color:"rgba(239,68,68,0.7)",margin:"10px 0 0",textAlign:"center"}}>
              ⚠️ Write a message body above before opening WhatsApp
            </p>
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
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [waLink, setWaLink] = useState(channel.whatsappGroupLink ?? "");
  const [editingWa, setEditingWa] = useState(false);
  const updateChannel = trpc.comms.updateChannel.useMutation({
    onSuccess:()=>{toast.success("Members updated");onUpdate();setShowAddPicker(false);setEditingWa(false);},
    onError:(e)=>toast.error(e.message),
  });
  const saveWaLink = () => {
    updateChannel.mutate({id:channel.id,name:channel.name,description:channel.description??undefined,whatsappGroupLink:waLink.trim()||null});
  };

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

  const addMember = (trusteeId: number) => {
    updateChannel.mutate({id:channel.id,name:channel.name,description:channel.description??undefined,channelMemberIds:[...currentIds, trusteeId]});
  };
  const removeMember = (trusteeId: number) => {
    updateChannel.mutate({id:channel.id,name:channel.name,description:channel.description??undefined,channelMemberIds:currentIds.filter((i:number)=>i!==trusteeId)});
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

          {/* WhatsApp Group Link */}
          <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${T.border}`}}>
            <p style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",margin:"0 0 8px"}}>WhatsApp Group Link</p>
            {!editingWa?(
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {channel.whatsappGroupLink?(
                  <a href={channel.whatsappGroupLink} target="_blank" rel="noopener noreferrer"
                    style={{fontSize:11,color:"#25d366",textDecoration:"none",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {channel.whatsappGroupLink}
                  </a>
                ):(
                  <span style={{fontSize:11,color:T.muted,flex:1}}>No group link set</span>
                )}
                <button onClick={()=>setEditingWa(true)}
                  style={{padding:"4px 10px",borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer",fontSize:11,flexShrink:0}}>
                  {channel.whatsappGroupLink?"Edit":"Add Link"}
                </button>
              </div>
            ):(
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input value={waLink} onChange={e=>setWaLink(e.target.value)}
                  placeholder="https://chat.whatsapp.com/..."
                  style={{flex:1,padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,color:T.white,fontSize:12,outline:"none"}}/>
                <button onClick={saveWaLink} disabled={updateChannel.isPending}
                  style={{padding:"6px 12px",borderRadius:8,background:"linear-gradient(135deg,#25d366,#128C7E)",border:"none",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:11,flexShrink:0}}>
                  Save
                </button>
                <button onClick={()=>{setEditingWa(false);setWaLink(channel.whatsappGroupLink??"")}}
                  style={{padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer",fontSize:11,flexShrink:0}}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          {addCandidates.length>0&&(
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowAddPicker(!showAddPicker)}
                style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:10,background:"rgba(0,255,194,0.08)",border:"1px solid rgba(0,255,194,0.25)",color:T.mint,cursor:"pointer",fontSize:12,fontWeight:700}}>
                <UserPlus size={13}/> Add Member
                <ChevronDown size={10} style={{transform:showAddPicker?"rotate(180deg)":"none",transition:"transform 0.2s"}}/>
              </button>
              {showAddPicker&&(
                <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:50,background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:12,padding:8,minWidth:200,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",maxHeight:220,overflowY:"auto"}}>
                  {addCandidates.map((t:any)=>(
                    <button key={t.id} onClick={()=>addMember(t.id)}
                      style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:"transparent",border:"none",color:T.white,cursor:"pointer",fontSize:12,fontWeight:500,width:"100%",textAlign:"left",transition:"background 0.1s"}}
                      onMouseEnter={e=>(e.currentTarget.style.background="rgba(0,255,194,0.08)")}
                      onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                      <span style={{width:24,height:24,borderRadius:"50%",background:`linear-gradient(135deg,${T.purple},#4f46e5)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:T.white,flexShrink:0}}>
                        {getInitials(t.fullName)}
                      </span>
                      <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.fullName}</span>
                      <Plus size={10} style={{color:T.mint,flexShrink:0}}/>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
  const [orderedChannels, setOrderedChannels] = useState<any[]>([]);
  const dragItem = useRef<number|null>(null);
  const dragOver = useRef<number|null>(null);

  const {data:channels=[],refetch:refetchChannels} = trpc.comms.listChannels.useQuery();
  const {data:allTrustees=[]} = trpc.trustees.listActive.useQuery();
  const {data:messages=[],refetch:refetchMessages} = trpc.comms.listMessages.useQuery(
    {channelId:selectedChannelId!},{enabled:selectedChannelId!==null}
  );
  const {data:unreadCounts={},refetch:refetchUnread} = trpc.comms.getUnreadCounts.useQuery(undefined,{refetchInterval:30000});
  const markReadMutation = trpc.comms.markChannelRead.useMutation({
    onSuccess:()=>refetchUnread(),
  });
  const updateChannelMutation = trpc.comms.updateChannel.useMutation({
    onSuccess:()=>{toast.success("Channel updated");setEditingChannel(null);refetchChannels();},
    onError:(e)=>toast.error(e.message),
  });

  // Keep orderedChannels in sync with server data
  useEffect(()=>{ if ((channels as any[]).length) setOrderedChannels(channels as any[]); },[channels]);

  const handleDragStart = (idx: number) => { dragItem.current = idx; };
  const handleDragEnter = (idx: number) => { dragOver.current = idx; };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) {
      dragItem.current = null; dragOver.current = null; return;
    }
    const updated = [...orderedChannels];
    const [moved] = updated.splice(dragItem.current, 1);
    updated.splice(dragOver.current, 0, moved);
    setOrderedChannels(updated);
    // Persist new order
    updated.forEach((ch:any, i:number) => {
      if (ch.sortOrder !== i) {
        updateChannelMutation.mutate({id:ch.id,name:ch.name,description:ch.description??undefined,sortOrder:i});
      }
    });
    dragItem.current = null; dragOver.current = null;
  };

  const selectedChannel = orderedChannels.find((c:any)=>c.id===selectedChannelId) ||
    (channels as any[]).find((c:any)=>c.id===selectedChannelId);

  // Compute channel members
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
    // Mark incoming messages as read for this channel
    markReadMutation.mutate({ channelId: id });
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
            <p style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 8px 2px"}}>Channels <span style={{fontSize:9,opacity:0.5,fontWeight:400,textTransform:"none"}}>(drag to reorder)</span></p>
            {orderedChannels.map((ch:any,i:number)=>{
              const isSelected = ch.id===selectedChannelId;
              const isEditing  = editingChannel===ch.id;
              return (
                <div key={ch.id}
                  draggable
                  onDragStart={()=>handleDragStart(i)}
                  onDragEnter={()=>handleDragEnter(i)}
                  onDragEnd={handleDragEnd}
                  onDragOver={e=>e.preventDefault()}
                  style={{marginBottom:4,animation:`fadeUp 0.4s ease ${i*50}ms both`,cursor:"grab"}}>
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
                      {(unreadCounts as Record<number,number>)[ch.id]>0&&(
                        <span style={{minWidth:18,height:18,borderRadius:9,background:"#EF4444",color:"#fff",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px",flexShrink:0}}>
                          {(unreadCounts as Record<number,number>)[ch.id]}
                        </span>
                      )}
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
                <div style={{paddingBottom:12,borderBottom:`1px solid ${T.border}`,marginBottom:12,flexShrink:0}}>
                  {/* Row 1: back + icon + title */}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <button onClick={()=>setShowPanel(false)} id="comms-back-btn"
                      style={{width:32,height:32,borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer",display:"none",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <ArrowLeft size={14}/>
                    </button>
                    <style>{`@media(max-width:640px){#comms-back-btn{display:flex!important}}`}</style>
                    <span style={{color:(selectedChannel as any).color,fontSize:18,flexShrink:0}}>{CHANNEL_ICONS[(selectedChannel as any).icon]??<Hash size={18}/>}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <h2 style={{fontSize:16,fontWeight:800,color:T.white,margin:0}}>{(selectedChannel as any).name}</h2>
                      {(selectedChannel as any).description&&<p style={{fontSize:11,color:T.muted,margin:"2px 0 0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(selectedChannel as any).description}</p>}
                    </div>
                  </div>
                  {/* Row 2: avatars + action buttons */}
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <div style={{flex:1,overflowX:"auto",scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
                      <style>{`#avatar-scroll::-webkit-scrollbar{display:none}`}</style>
                      <div id="avatar-scroll" style={{display:"flex",alignItems:"center",gap:4,paddingBottom:2}}>
                        {channelMembers.map((t:any)=>(
                          <div key={t.id} title={t.fullName}
                            style={{width:26,height:26,borderRadius:"50%",background:`linear-gradient(135deg,${T.purple},#4f46e5)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:T.white,border:`2px solid ${T.navy}`,flexShrink:0,cursor:"default"}}>
                            {getInitials(t.fullName)}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0,alignItems:"center"}}>
                      <button onClick={()=>refetchMessages()} style={{width:30,height:30,borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <RefreshCw size={12}/>
                      </button>
                      {(selectedChannel as any).whatsappGroupLink&&(
                        <button onClick={()=>window.open((selectedChannel as any).whatsappGroupLink,"_blank","noopener,noreferrer")}
                          style={{padding:"6px 10px",borderRadius:8,background:"linear-gradient(135deg,#25d366,#128C7E)",border:"none",color:T.white,fontWeight:700,cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",gap:5}}>
                          <MessageSquare size={11}/>WA Group
                        </button>
                      )}
                      <button onClick={()=>setShowCompose(!showCompose)}
                        style={{padding:"6px 10px",borderRadius:8,background:showCompose?"rgba(0,255,194,0.12)":`linear-gradient(135deg,${T.purple},#4f46e5)`,border:`1px solid ${showCompose?T.mint:"transparent"}`,color:showCompose?T.mint:T.white,fontWeight:700,cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",gap:5}}>
                        {showCompose?<><X size={11}/>Close</>:<><Plus size={11}/>Compose</>}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Member manager */}
                <MemberManager
                  channel={selectedChannel}
                  allTrustees={allTrustees as any[]}
                  channelMembers={channelMembers}
                  onUpdate={refetchChannels}
                />

                {/* Log incoming reply */}
                <LogIncomingPanel
                  channelId={selectedChannelId!}
                  allTrustees={allTrustees as any[]}
                  onSaved={()=>{refetchMessages();}}
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
