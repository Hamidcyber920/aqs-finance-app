import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Mail, MessageSquare, Send, Users, Pencil, Check, X,
  AlertTriangle, Shield, Briefcase, Building2, Hash,
  Plus, RefreshCw, ArrowLeft,
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
};

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  alert:    <AlertTriangle size={14} />,
  shield:   <Shield size={14} />,
  briefcase:<Briefcase size={14} />,
  users:    <Users size={14} />,
  mosque:   <Building2 size={14} />,
  hash:     <Hash size={14} />,
};

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
function ComposePanel({ channel, trustees, onSent }: { channel:any; trustees:any[]; onSent:()=>void }) {
  const [tab, setTab] = useState<"individual"|"bulk"|"whatsapp">("individual");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [waMessage, setWaMessage] = useState("");
  const [showWaLinks, setShowWaLinks] = useState(false);

  const sendEmailMutation = trpc.comms.sendEmail.useMutation({
    onSuccess:(res)=>{toast.success(`Sent to ${res.sent} recipient${res.sent!==1?"s":""}`);setSubject("");setBody("");setSelectedEmails([]);onSent();},
    onError:(e)=>toast.error(e.message),
  });
  const logWaMutation = trpc.comms.logWhatsApp.useMutation({
    onSuccess:()=>{toast.success("WhatsApp messages logged");setWaMessage("");setShowWaLinks(false);onSent();},
    onError:(e)=>toast.error(e.message),
  });

  const channelRoles = (channel.memberRoles??"").split(",").map((r:string)=>r.trim().toLowerCase());
  const channelMembers = trustees.filter((t:any)=>{
    const r=(t.role??"").toLowerCase();
    return channelRoles.some((role:string)=>r.includes(role));
  });
  const emailMembers = channelMembers.filter((t:any)=>t.email);
  const waMembers    = channelMembers.filter((t:any)=>t.phone);

  const handleSendEmail = () => {
    if (!subject.trim()||!body.trim()){toast.error("Subject and body are required");return;}
    const recipients = tab==="bulk"
      ? emailMembers.map((t:any)=>({name:t.fullName,email:t.email}))
      : emailMembers.filter((t:any)=>selectedEmails.includes(t.email)).map((t:any)=>({name:t.fullName,email:t.email}));
    if (!recipients.length){toast.error("No recipients selected");return;}
    sendEmailMutation.mutate({channelId:channel.id,recipients,subject,body,isBulk:tab==="bulk"});
  };
  const handleSendWA = () => {
    if (!waMessage.trim()){toast.error("Message is required");return;}
    logWaMutation.mutate({channelId:channel.id,recipients:waMembers.map((t:any)=>({name:t.fullName,phone:t.phone})),message:waMessage});
    setShowWaLinks(true);
  };

  const inp: React.CSSProperties = {width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,borderRadius:8,color:T.white,padding:"10px 12px",fontSize:13,boxSizing:"border-box"};

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

      {tab!=="whatsapp"&&(
        <>
          {tab==="individual"&&(
            <div style={{marginBottom:12}}>
              <p style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",margin:"0 0 6px"}}>Recipients</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {emailMembers.map((t:any)=>(
                  <button key={t.email} onClick={()=>setSelectedEmails(prev=>prev.includes(t.email)?prev.filter(e=>e!==t.email):[...prev,t.email])}
                    style={{padding:"5px 10px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",border:`1px solid ${selectedEmails.includes(t.email)?T.mint:T.border}`,background:selectedEmails.includes(t.email)?"rgba(0,255,194,0.12)":"transparent",color:selectedEmails.includes(t.email)?T.mint:T.muted}}>
                    {t.fullName.split(" ").slice(-1)[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab==="bulk"&&(
            <div style={{background:"rgba(99,91,255,0.08)",border:"1px solid rgba(99,91,255,0.2)",borderRadius:8,padding:"10px 12px",marginBottom:12}}>
              <p style={{fontSize:12,color:T.muted,margin:0}}>📨 Will send to all <strong style={{color:T.white}}>{emailMembers.length}</strong> members with email addresses.</p>
            </div>
          )}
          <div style={{marginBottom:10}}>
            <label style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>Subject</label>
            <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="e.g. Project Milestone Update" style={{...inp,resize:"none" as any}} />
          </div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>Message Body</label>
            <textarea value={body} onChange={e=>setBody(e.target.value)} rows={5} placeholder="Write your message here..." style={{...inp,resize:"vertical" as any}} />
          </div>
          <button onClick={handleSendEmail} disabled={sendEmailMutation.isPending}
            style={{width:"100%",padding:"12px 0",borderRadius:10,background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",fontWeight:700,border:"none",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Send size={14}/>{sendEmailMutation.isPending?"Sending…":"Send Email"}
          </button>
        </>
      )}

      {tab==="whatsapp"&&(
        <>
          <div style={{marginBottom:12}}>
            <p style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",margin:"0 0 6px"}}>Channel Members</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {waMembers.map((t:any)=>(
                <span key={t.id} style={{padding:"4px 10px",borderRadius:20,fontSize:11,background:"rgba(37,211,102,0.1)",border:"1px solid rgba(37,211,102,0.25)",color:"#25d366",fontWeight:600}}>{t.fullName}</span>
              ))}
              {!waMembers.length&&<p style={{fontSize:12,color:T.muted}}>No phone numbers for this channel.</p>}
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>WhatsApp Message</label>
            <textarea value={waMessage} onChange={e=>setWaMessage(e.target.value)} rows={5} placeholder="Assalamu Alaikum, ..." style={{...inp,resize:"vertical" as any}} />
          </div>
          <button onClick={handleSendWA} disabled={!waMembers.length||logWaMutation.isPending}
            style={{width:"100%",padding:"12px 0",borderRadius:10,background:"linear-gradient(135deg,#25d366,#128C7E)",color:T.white,fontWeight:700,border:"none",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <MessageSquare size={14}/>{logWaMutation.isPending?"Logging…":"Open WhatsApp Links"}
          </button>
          {showWaLinks&&waMessage&&waMembers.length>0&&(
            <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:8}}>
              <p style={{fontSize:11,color:T.muted,margin:0}}>Tap each link to open WhatsApp:</p>
              {waMembers.map((t:any)=>{
                const link=`https://wa.me/44${t.phone.replace(/^0/,"").replace(/\s/g,"")}?text=${encodeURIComponent(waMessage)}`;
                return (
                  <a key={t.id} href={link} target="_blank" rel="noreferrer"
                    style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:10,background:"rgba(37,211,102,0.08)",border:"1px solid rgba(37,211,102,0.2)",textDecoration:"none"}}>
                    <span style={{width:30,height:30,borderRadius:"50%",background:"rgba(37,211,102,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#25d366",flexShrink:0}}>{getInitials(t.fullName)}</span>
                    <div>
                      <p style={{fontSize:13,fontWeight:600,color:T.white,margin:0}}>{t.fullName}</p>
                      <p style={{fontSize:11,color:"#25d366",margin:0}}>{t.phone} → Open WhatsApp ↗</p>
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
  const [selectedChannelId, setSelectedChannelId] = useState<number|null>(null);
  const [showPanel, setShowPanel] = useState(false); // mobile: show right panel
  const [editingChannel, setEditingChannel] = useState<number|null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [showCompose, setShowCompose] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {data:channels=[],refetch:refetchChannels} = trpc.comms.listChannels.useQuery();
  const {data:trustees=[]} = trpc.trustees.listActive.useQuery();
  const {data:messages=[],refetch:refetchMessages} = trpc.comms.listMessages.useQuery(
    {channelId:selectedChannelId!},{enabled:selectedChannelId!==null}
  );
  const updateChannelMutation = trpc.comms.updateChannel.useMutation({
    onSuccess:()=>{toast.success("Channel updated");setEditingChannel(null);refetchChannels();},
    onError:(e)=>toast.error(e.message),
  });

  const selectedChannel = (channels as any[]).find((c:any)=>c.id===selectedChannelId);

  useEffect(()=>{
    if (channels.length&&selectedChannelId===null){
      setSelectedChannelId((channels[0] as any).id);
    }
  },[channels]);

  useEffect(()=>{messagesEndRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);

  const channelRoles = selectedChannel?(selectedChannel.memberRoles??"").split(",").map((r:string)=>r.trim().toLowerCase()):[];
  const channelMembers = (trustees as any[]).filter((t:any)=>{
    const r=(t.role??"").toLowerCase();
    return channelRoles.some((role:string)=>r.includes(role));
  });

  const handleSelectChannel = (id: number) => {
    setSelectedChannelId(id);
    setShowPanel(true);
    setShowCompose(false);
  };

  return (
    <>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        textarea:focus,input:focus{outline:none;border-color:rgba(99,91,255,0.6)!important;}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
        .comms-grid{display:grid;grid-template-columns:220px 1fr;height:calc(100vh - 120px);overflow:hidden}
        @media(max-width:640px){.comms-grid{display:block;height:auto}}
        .comms-sidebar{overflow-y:auto;padding-right:10px;border-right:1px solid rgba(255,255,255,0.08)}
        @media(max-width:640px){.comms-sidebar{border-right:none;padding-right:0}}
        .comms-main{display:flex;flex-direction:column;padding-left:16px;overflow:hidden;height:100%}
        @media(max-width:640px){.comms-main{padding-left:0;height:auto;margin-top:12px}}
        .comms-thread{flex:1;overflow-y:auto;padding-right:4px}
        @media(max-width:640px){.comms-thread{max-height:50vh}}
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

          {/* ── Sidebar (always visible on desktop; hidden on mobile when panel is open) ── */}
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
                  {/* Back button — mobile only */}
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

                {/* Compose */}
                {showCompose&&(
                  <div style={{marginBottom:12,flexShrink:0}}>
                    <ComposePanel channel={selectedChannel} trustees={trustees as any[]} onSent={()=>{refetchMessages();setShowCompose(false);}}/>
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

          {/* Mobile: show channel list when no panel open */}
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
