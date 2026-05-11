import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { Plus, Send, Mail, Users, Clock, CheckCircle2, Calendar, Eye } from "lucide-react";
import { SmartUpload } from "@/components/SmartUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

const CAMPAIGN_TYPES = ["email","sms"];
const TEMPLATES = [
  { id:"ramadan", name:"Ramadan Appeal", subject:"🌙 Support our Ramadan Appeal", body:"Assalamu Alaikum,\n\nRamadan Mubarak! This blessed month we are reaching out to our generous community to support the Abdullah Quilliam Society.\n\nYour Sadaqah helps us maintain the mosque, support our community programmes, and preserve this historic institution.\n\nJazakAllah Khair,\nAbdullah Quilliam Society" },
  { id:"zakat", name:"Zakat Reminder", subject:"Zakat — Purify Your Wealth", body:"Assalamu Alaikum,\n\nWe hope this message finds you in good health and Iman. As you calculate your annual Zakat, please consider directing it to the Abdullah Quilliam Society.\n\nJazakAllah Khair,\nAbdullah Quilliam Society" },
  { id:"thankyou", name:"Donor Thank You", subject:"JazakAllah Khair — Thank You for Your Generosity", body:"Assalamu Alaikum,\n\nWe are deeply grateful for your recent donation to the Abdullah Quilliam Society. Your generosity makes a real difference to our community.\n\nJazakAllah Khair,\nAbdullah Quilliam Society" },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string,{bg:string;color:string}> = {
    sent:{bg:"rgba(0,255,194,0.1)",color:T.mint},
    draft:{bg:"rgba(99,91,255,0.12)",color:"#a78bfa"},
    scheduled:{bg:"rgba(251,191,36,0.1)",color:"#fbbf24"},
    failed:{bg:"rgba(255,80,80,0.1)",color:"#ff5050"},
  };
  const s = map[status?.toLowerCase()] ?? {bg:T.glass,color:T.muted};
  return <span style={{ padding:"3px 10px",borderRadius:999,fontSize:11,fontWeight:600,background:s.bg,color:s.color,textTransform:"capitalize" }}>{status}</span>;
}

export default function CampaignsPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCampaign, setPreviewCampaign] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string|null>(null);

  const { data, refetch } = trpc.campaigns.list.useQuery();
  const { data: donors } = trpc.donors.list.useQuery({ limit:200 });
  const createMutation = trpc.campaigns.create.useMutation({
    onSuccess: () => { toast.success("Campaign created"); setOpen(false); refetch(); reset(); },
    onError: (e) => toast.error(e.message),
  });
  const sendMutation = trpc.campaigns.send?.useMutation?.({
    onSuccess: () => { toast.success("Campaign sent!"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm<any>({ defaultValues:{ type:"email" } });
  const watchBody = watch("body","");

  const campaigns: any[] = Array.isArray(data) ? data : [];
  const sent = campaigns.filter((c: any) => c.status === "sent").length;
  const totalSent = campaigns.reduce((s: number, c: any) => s + Number(c.sentCount ?? 0), 0);
  const donorCount = Array.isArray(donors) ? donors.length : 0;

  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    setValue("subject", tpl.subject);
    setValue("body", tpl.body);
    setValue("name", tpl.name);
    setSelectedTemplate(tpl.id);
  };

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:24,fontFamily:"'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12,animation:"fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
              Email <span style={{ color:T.mint }}>Campaigns</span>
            </h1>
            <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>Communicate with donors — Ramadan appeals, Zakat, thank-yous</p>
          </div>
          <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap" }}>
            <SmartUpload
              moduleType="fundraising_donation"
              buttonLabel="Scan / Upload"
              buttonVariant="outline"
              onConfirm={(result) => {
                const d = result.extractedData as any;
                toast.info(`AI extracted: ${d.donorName || "donor"} — £${d.amount || "?"}. Use the donation section to record.`);
              }}
            />
            <Button onClick={() => setOpen(true)}
              style={{ background:`linear-gradient(135deg,${T.purple},#4f46e5)`,color:T.white,border:"none",borderRadius:12,padding:"10px 20px",fontWeight:700,display:"flex",alignItems:"center",gap:8 }}>
              <Plus size={15}/> New Campaign
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:16,marginBottom:28 }}>
          {[
            { label:"Campaigns Sent", value:sent, color:T.mint, icon:Send },
            { label:"Emails Sent", value:totalSent.toLocaleString(), color:T.purple, icon:Mail },
            { label:"Donor List", value:donorCount, color:"#f59e0b", icon:Users },
            { label:"Drafts", value:campaigns.filter((c:any)=>c.status==="draft").length, color:"#a78bfa", icon:Clock },
          ].map((s,i)=>(
            <div key={s.label} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:"18px 20px",display:"flex",alignItems:"center",gap:14,animation:`fadeUp 0.5s ease ${i*80}ms both` }}>
              <div style={{ width:40,height:40,borderRadius:12,background:`${s.color}22`,border:`1px solid ${s.color}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <s.icon size={18} style={{color:s.color}}/>
              </div>
              <div>
                <p style={{ fontSize:20,fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>{s.value}</p>
                <p style={{ fontSize:11,color:T.muted,margin:0 }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Campaigns list */}
        <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:24,animation:"fadeUp 0.5s ease 300ms both" }}>
          <h2 style={{ fontSize:15,fontWeight:700,color:T.white,margin:"0 0 20px" }}>Campaign History</h2>
          {campaigns.length === 0 ? (
            <div style={{ textAlign:"center",padding:"48px 0",color:T.muted }}>
              <Mail size={36} style={{ opacity:0.3,marginBottom:12 }}/>
              <p>No campaigns yet — create your first one above</p>
            </div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%",borderCollapse:"collapse",minWidth:540 }}>
                <thead>
                  <tr>
                    {["Name","Type","Subject","Scheduled","Sent","Status",""].map(h=>(
                      <th key={h} style={{ textAlign:"left",fontSize:10,fontWeight:600,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",padding:"0 12px 12px 0",borderBottom:`1px solid ${T.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c: any, i: number) => (
                    <tr key={c.id??i}>
                      <td style={{ padding:"12px 12px 12px 0",borderBottom:`1px solid ${T.border}` }}>
                        <p style={{ fontSize:13,fontWeight:600,color:T.white,margin:0 }}>{c.name}</p>
                      </td>
                      <td style={{ padding:"12px 12px 12px 0",borderBottom:`1px solid ${T.border}` }}>
                        <span style={{ fontSize:11,padding:"2px 8px",borderRadius:999,background:"rgba(99,91,255,0.12)",color:"#a78bfa",fontWeight:600,textTransform:"uppercase" }}>{c.type??"email"}</span>
                      </td>
                      <td style={{ padding:"12px 12px 12px 0",fontSize:12,color:T.muted,borderBottom:`1px solid ${T.border}`,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{c.subject??"—"}</td>
                      <td style={{ padding:"12px 12px 12px 0",fontSize:12,color:T.muted,borderBottom:`1px solid ${T.border}` }}>
                        {c.scheduledAt ? new Date(c.scheduledAt).toLocaleDateString("en-GB") : "—"}
                      </td>
                      <td style={{ padding:"12px 12px 12px 0",fontSize:13,fontWeight:600,color:T.mint,borderBottom:`1px solid ${T.border}` }}>{c.sentCount??0}</td>
                      <td style={{ padding:"12px 12px 12px 0",borderBottom:`1px solid ${T.border}` }}><StatusBadge status={c.status??"draft"}/></td>
                      <td style={{ padding:"12px 0",borderBottom:`1px solid ${T.border}` }}>
                        <div style={{ display:"flex",gap:6 }}>
                          <button onClick={()=>{ setPreviewCampaign(c); setPreviewOpen(true); }}
                            style={{ padding:"4px 10px",borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5 }}>
                            <Eye size={11}/> View
                          </button>
                          {c.status==="draft" && (
                            <button onClick={()=>sendMutation.mutate({ id:c.id })}
                              style={{ padding:"4px 10px",borderRadius:8,background:"rgba(0,255,194,0.1)",border:"1px solid rgba(0,255,194,0.2)",color:T.mint,fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5 }}>
                              <Send size={11}/> Send
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Compose dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:560,maxHeight:"90vh",overflowY:"auto" }}>
            <DialogHeader>
              <DialogTitle style={{ color:T.white,fontSize:18,fontWeight:800 }}>New Campaign</DialogTitle>
            </DialogHeader>

            {/* Templates */}
            <div style={{ marginBottom:16 }}>
              <p style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10 }}>Quick Templates</p>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                {TEMPLATES.map(tpl => (
                  <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                    style={{ padding:"6px 14px",borderRadius:999,fontSize:12,fontWeight:600,border:`1px solid ${selectedTemplate===tpl.id?T.mint:T.border}`,background:selectedTemplate===tpl.id?"rgba(0,255,194,0.1)":T.glass,color:selectedTemplate===tpl.id?T.mint:T.muted,cursor:"pointer",transition:"all 0.2s" }}>
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit(d => createMutation.mutate(d))} style={{ display:"flex",flexDirection:"column",gap:14 }}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Campaign Name</Label>
                  <Input {...register("name",{required:true})} placeholder="e.g. Ramadan Appeal"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Type</Label>
                  <select {...register("type")}
                    style={{ marginTop:6,width:"100%",background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44,padding:"0 12px",fontSize:14 }}>
                    {CAMPAIGN_TYPES.map(t=><option key={t} value={t} style={{background:"#0D2240",textTransform:"capitalize"}}>{t.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Subject Line</Label>
                <Input {...register("subject",{required:true})} placeholder="Email subject"
                  style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
              </div>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Message Body</Label>
                <textarea {...register("body",{required:true})} rows={8} placeholder="Write your message…"
                  style={{ marginTop:6,width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,padding:"12px 14px",fontSize:13,resize:"vertical",boxSizing:"border-box",lineHeight:1.6 }}/>
                <p style={{ fontSize:11,color:T.muted,marginTop:4 }}>{watchBody.length} characters · {donorCount} donors in list</p>
              </div>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Schedule (optional)</Label>
                <Input {...register("scheduledAt")} type="datetime-local"
                  style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44,colorScheme:"dark" }}/>
              </div>
              <div style={{ display:"flex",gap:10 }}>
                <Button type="submit" name="action" value="draft" disabled={createMutation.isPending}
                  style={{ flex:1,background:"rgba(99,91,255,0.15)",border:"1px solid rgba(99,91,255,0.3)",color:T.purple,fontWeight:700,height:46,borderRadius:12,fontSize:14 }}>
                  Save Draft
                </Button>
                <Button type="submit" disabled={createMutation.isPending}
                  style={{ flex:1,background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",fontWeight:700,height:46,borderRadius:12,border:"none",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:7 }}>
                  <Send size={14}/>{createMutation.isPending?"Sending…":"Send Now"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Preview dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:500 }}>
            <DialogHeader>
              <DialogTitle style={{ color:T.white,fontSize:16,fontWeight:800 }}>{previewCampaign?.name}</DialogTitle>
            </DialogHeader>
            {previewCampaign && (
              <div style={{ marginTop:8 }}>
                <div style={{ background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 14px",marginBottom:14 }}>
                  <p style={{ fontSize:11,color:T.muted,margin:"0 0 4px" }}>Subject</p>
                  <p style={{ fontSize:14,color:T.white,margin:0,fontWeight:600 }}>{previewCampaign.subject}</p>
                </div>
                <div style={{ background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"14px" }}>
                  <p style={{ fontSize:11,color:T.muted,margin:"0 0 10px" }}>Message</p>
                  <p style={{ fontSize:13,color:"rgba(255,255,255,0.8)",margin:0,whiteSpace:"pre-line",lineHeight:1.7 }}>{previewCampaign.body}</p>
                </div>
                <div style={{ display:"flex",gap:10,marginTop:16 }}>
                  <div style={{ flex:1,background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 14px",textAlign:"center" }}>
                    <p style={{ fontSize:18,fontWeight:800,color:T.mint,margin:0 }}>{previewCampaign.sentCount??0}</p>
                    <p style={{ fontSize:11,color:T.muted,margin:0 }}>Sent</p>
                  </div>
                  <div style={{ flex:1,background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 14px",textAlign:"center" }}>
                    <p style={{ fontSize:14,fontWeight:700,color:T.white,margin:0,textTransform:"capitalize" }}>{previewCampaign.status}</p>
                    <p style={{ fontSize:11,color:T.muted,margin:0 }}>Status</p>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
