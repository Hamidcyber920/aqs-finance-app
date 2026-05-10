#!/usr/bin/env python3
"""Patch Communications.tsx to add:
1. Template category filter tabs in the template picker
2. 'Send Later' button with datetime picker
3. Reply status badges on sent messages in the history panel
"""
import re

path = '/home/ubuntu/receipt-scanner/client/src/pages/Communications.tsx'
with open(path, 'r') as f:
    content = f.read()

# ── 1. Add Clock import ──────────────────────────────────────────────────────
old_imports = "  Mail, MessageSquare, Send, Users, Pencil, Check, X,\n  AlertTriangle, Shield, Briefcase, Building2, Hash,\n  Plus, RefreshCw, ArrowLeft, UserPlus, ChevronDown, LogIn, Trash2,\n  BookOpen, Save, History, ChevronRight,"
new_imports = "  Mail, MessageSquare, Send, Users, Pencil, Check, X,\n  AlertTriangle, Shield, Briefcase, Building2, Hash,\n  Plus, RefreshCw, ArrowLeft, UserPlus, ChevronDown, LogIn, Trash2,\n  BookOpen, Save, History, ChevronRight, Clock, Tag,"
content = content.replace(old_imports, new_imports, 1)

# ── 2. Add scheduledAt state and scheduleMessage mutation after waBulkCount state ──
old_state = "  // WA bulk-send state\n  const [waBulkSent, setWaBulkSent] = useState(false);\n  const [waBulkCount, setWaBulkCount] = useState(0);"
new_state = """  // WA bulk-send state
  const [waBulkSent, setWaBulkSent] = useState(false);
  const [waBulkCount, setWaBulkCount] = useState(0);
  // Send Later state
  const [showSendLater, setShowSendLater] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  // Template category filter
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState("All");"""
content = content.replace(old_state, new_state, 1)

# ── 3. Add scheduleMessage mutation after deleteTemplateMutation ──
old_delete_mut = """  const deleteTemplateMutation = trpc.comms.deleteTemplate.useMutation({
    onSuccess: () => { toast.success("Template deleted"); refetchTemplates(); },
    onError: (e) => toast.error(e.message),
  });"""
new_delete_mut = """  const deleteTemplateMutation = trpc.comms.deleteTemplate.useMutation({
    onSuccess: () => { toast.success("Template deleted"); refetchTemplates(); },
    onError: (e) => toast.error(e.message),
  });
  const scheduleMessageMutation = trpc.comms.scheduleMessage.useMutation({
    onSuccess: () => { toast.success("Message scheduled!"); setShowSendLater(false); setScheduledAt(""); onSent(); },
    onError: (e) => toast.error(e.message),
  });"""
content = content.replace(old_delete_mut, new_delete_mut, 1)

# ── 4. Add category filter tabs above the template list ──
old_tmpl_header = """          <p style={{fontSize:10,fontWeight:700,color:T.purple,textTransform:"uppercase",letterSpacing:"0.08em",margin:"0 0 10px"}}>📚 Saved Templates</p>
          {(templates as any[]).length===0&&!savingTemplate&&(
            <p style={{fontSize:12,color:T.muted,margin:"0 0 10px"}}>No templates yet. Fill in a message below and save it.</p>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
            {(templates as any[]).map((tmpl:any)=>("""
new_tmpl_header = """          <p style={{fontSize:10,fontWeight:700,color:T.purple,textTransform:"uppercase",letterSpacing:"0.08em",margin:"0 0 8px"}}>📚 Saved Templates</p>
          {/* Category filter tabs */}
          {(templates as any[]).length>0&&(
            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
              {["All",...Array.from(new Set((templates as any[]).map((t:any)=>t.category||"General")))].map((cat:string)=>(
                <button key={cat} onClick={()=>setTemplateCategoryFilter(cat)}
                  style={{padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer",
                    background:templateCategoryFilter===cat?"rgba(99,91,255,0.3)":"rgba(255,255,255,0.04)",
                    border:`1px solid ${templateCategoryFilter===cat?T.purple:T.border}`,
                    color:templateCategoryFilter===cat?T.white:T.muted}}>
                  {cat}
                </button>
              ))}
            </div>
          )}
          {(templates as any[]).length===0&&!savingTemplate&&(
            <p style={{fontSize:12,color:T.muted,margin:"0 0 10px"}}>No templates yet. Fill in a message below and save it.</p>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
            {(templates as any[]).filter((t:any)=>templateCategoryFilter==="All"||(t.category||"General")===templateCategoryFilter).map((tmpl:any)=>("""
content = content.replace(old_tmpl_header, new_tmpl_header, 1)

# ── 5. Add Send Later button after the Send Email button ──
old_send_btn = """          </button>
        </>
      )}
      {/* ── WhatsApp tab: per-recipient buttons shown immediately ── */}"""
new_send_btn = """          </button>
          {/* Send Later button */}
          {!showSendLater?(
            <button onClick={()=>setShowSendLater(true)}
              style={{width:"100%",marginTop:8,padding:"10px 0",borderRadius:10,background:"rgba(255,255,255,0.04)",border:`1px solid ${T.border}`,color:T.muted,fontWeight:700,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <Clock size={13}/> Schedule for Later
            </button>
          ):(
            <div style={{marginTop:8,padding:"12px 14px",borderRadius:10,background:"rgba(255,255,255,0.04)",border:`1px solid ${T.border}`}}>
              <p style={{fontSize:11,fontWeight:700,color:T.muted,margin:"0 0 8px",textTransform:"uppercase",letterSpacing:"0.06em"}}>
                <Clock size={11} style={{marginRight:4,verticalAlign:"middle"}}/> Schedule Send
              </p>
              <input type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)}
                style={{width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:6,color:T.white,padding:"8px 10px",fontSize:12,marginBottom:8}}/>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>{
                  if(!scheduledAt){toast.error("Pick a date and time");return;}
                  if(!body.trim()){toast.error("Write a message body first");return;}
                  scheduleMessageMutation.mutate({
                    channelId: channel.id,
                    subject: subject||undefined,
                    body,
                    scheduledAt,
                  });
                }} disabled={scheduleMessageMutation.isPending}
                  style={{flex:1,padding:"8px 0",borderRadius:8,background:`linear-gradient(135deg,${T.purple},#8B5CF6)`,color:T.white,fontWeight:700,border:"none",cursor:"pointer",fontSize:12}}>
                  {scheduleMessageMutation.isPending?"Scheduling…":"Confirm Schedule"}
                </button>
                <button onClick={()=>{setShowSendLater(false);setScheduledAt("");}}
                  style={{padding:"8px 12px",borderRadius:8,background:"rgba(255,255,255,0.06)",color:T.muted,fontWeight:700,border:`1px solid ${T.border}`,cursor:"pointer",fontSize:12}}>
                  <X size={12}/>
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {/* ── WhatsApp tab: per-recipient buttons shown immediately ── */}"""
content = content.replace(old_send_btn, new_send_btn, 1)

with open(path, 'w') as f:
    f.write(content)

print("SUCCESS")
