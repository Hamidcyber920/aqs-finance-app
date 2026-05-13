import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { Plus, HandHeart, Target, TrendingUp, Users } from "lucide-react";
import { SmartUpload } from "@/components/SmartUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useVoiceContext } from "@/contexts/VoiceContext";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

const PAYMENT_METHODS = ["Bank Transfer","Cash","Card","Cheque","Donorbox","Other"];

function ProgressBar({ current, target }: { current: number; target: number }) {
  const pct = Math.min(100, target > 0 ? (current / target) * 100 : 0);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
        <span style={{ fontSize:12,color:T.muted }}>£{current.toLocaleString()} raised</span>
        <span style={{ fontSize:12,color:T.muted }}>£{target.toLocaleString()} goal</span>
      </div>
      <div style={{ height:8,borderRadius:999,background:"rgba(255,255,255,0.08)",overflow:"hidden" }}>
        <div style={{ height:"100%",width:`${pct}%`,borderRadius:999,background:pct>=100?`linear-gradient(90deg,${T.mint},#00DDA8)`:`linear-gradient(90deg,${T.purple},#8b5cf6)`,transition:"width 0.8s ease" }}/>
      </div>
      <div style={{ textAlign:"right",marginTop:4 }}>
        <span style={{ fontSize:12,fontWeight:700,color:pct>=100?T.mint:T.purple }}>{pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

export default function FundraisingPage() {
  const { user } = useAuth();
  const isAdmin = ["superadmin","trustee","manager"].includes(user?.role ?? "");
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [donationOpen, setDonationOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);

  const { setEntityContext } = useVoiceContext();
  useEffect(() => {
    setEntityContext("Viewing Fundraising — donation campaigns, fundraising events and targets");
    return () => setEntityContext(null);
  }, [setEntityContext]);

  const { data, refetch } = trpc.fundraising.listCampaigns.useQuery();
  const createCampaignMutation = trpc.fundraising.createCampaign.useMutation({
    onSuccess: () => { toast.success("Campaign created"); setCampaignOpen(false); refetch(); resetC(); },
    onError: (e) => toast.error(e.message),
  });
  const addDonationMutation = trpc.fundraising.recordDonation.useMutation({
    onSuccess: () => { toast.success("Donation recorded"); setDonationOpen(false); refetch(); resetD(); },
    onError: (e) => toast.error(e.message),
  });

  const { register: regC, handleSubmit: handleC, reset: resetC } = useForm<any>();
  const { register: regD, handleSubmit: handleD, reset: resetD, setValue: setValueD } = useForm<any>();

  const campaigns = (data as any[]) ?? [];
  const totalRaised = campaigns.reduce((s: number, c: any) => s + Number(c.currentAmount ?? 0), 0);
  const totalTarget = campaigns.reduce((s: number, c: any) => s + Number(c.targetAmount ?? 0), 0);
  const activeCampaigns = campaigns.filter((c: any) => Number(c.currentAmount) < Number(c.targetAmount)).length;

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:24,fontFamily:"'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12,animation:"fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
              Fundraising <span style={{ color:T.mint }}>Campaigns</span>
            </h1>
            <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>Track campaigns, donations and progress</p>
          </div>
          <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap" }}>
            <SmartUpload
              moduleType="fundraising_donation"
              buttonLabel="Scan / Upload"
              buttonVariant="outline"
              onConfirm={(result) => {
                const d = result.extractedData as any;
                setDonationOpen(true);
                setTimeout(() => {
                  if (d.donorName) setValueD("donorName", d.donorName);
                  if (d.amount) setValueD("amount", String(d.amount));
                  if (d.paymentMethod) setValueD("paymentMethod", d.paymentMethod);
                }, 200);
              }}
            />
            {isAdmin && (
              <Button onClick={() => setCampaignOpen(true)}
                style={{ background:`linear-gradient(135deg,${T.purple},#4f46e5)`,color:T.white,border:"none",borderRadius:12,padding:"10px 20px",fontWeight:700,display:"flex",alignItems:"center",gap:8 }}>
                <Plus size={16}/> New Campaign
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16,marginBottom:28 }}>
          {[
            { label:"Total Raised", value:`£${totalRaised.toLocaleString()}`, color:T.mint, icon:TrendingUp },
            { label:"Total Target", value:`£${totalTarget.toLocaleString()}`, color:T.purple, icon:Target },
            { label:"Active Campaigns", value:activeCampaigns, color:"#f59e0b", icon:HandHeart },
            { label:"Completed", value:campaigns.length - activeCampaigns, color:"#6ee7b7", icon:Users },
          ].map((s,i) => (
            <div key={s.label} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:"18px 20px",display:"flex",alignItems:"center",gap:14,animation:`fadeUp 0.5s ease ${i*80}ms both` }}>
              <div style={{ width:40,height:40,borderRadius:12,background:`${s.color}22`,border:`1px solid ${s.color}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <s.icon size={18} style={{ color:s.color }}/>
              </div>
              <div>
                <p style={{ fontSize:20,fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>{s.value}</p>
                <p style={{ fontSize:11,color:T.muted,margin:0 }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Campaign cards */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:20 }}>
          {campaigns.length === 0 ? (
            <div style={{ gridColumn:"1/-1",textAlign:"center",padding:60,color:T.muted }}>
              <HandHeart size={40} style={{ opacity:0.3,marginBottom:12 }}/>
              <p>No campaigns yet. Create one to get started.</p>
            </div>
          ) : campaigns.map((c: any, i: number) => (
            <div key={c.id} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:18,padding:24,animation:`fadeUp 0.5s ease ${200+i*80}ms both` }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8 }}>
                <div style={{ width:44,height:44,borderRadius:14,background:"rgba(99,91,255,0.15)",border:"1px solid rgba(99,91,255,0.25)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                  <HandHeart size={20} style={{ color:T.purple }}/>
                </div>
                <span style={{ fontSize:11,fontWeight:600,padding:"4px 12px",borderRadius:999,background:Number(c.currentAmount)>=Number(c.targetAmount)?"rgba(0,255,194,0.1)":"rgba(99,91,255,0.12)",color:Number(c.currentAmount)>=Number(c.targetAmount)?T.mint:T.purple }}>
                  {Number(c.currentAmount)>=Number(c.targetAmount)?"Completed":"Active"}
                </span>
              </div>
              <h3 style={{ fontSize:16,fontWeight:700,color:T.white,margin:"12px 0 6px",letterSpacing:"-0.01em" }}>{c.name}</h3>
              <p style={{ fontSize:13,color:T.muted,margin:"0 0 4px",lineHeight:1.5 }}>{c.description ?? "No description"}</p>
              <ProgressBar current={Number(c.currentAmount??0)} target={Number(c.targetAmount??0)} />
              <div style={{ marginTop:16,display:"flex",gap:8 }}>
                <Button onClick={() => { setSelectedCampaign(c); setDonationOpen(true); }}
                  style={{ flex:1,background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",border:"none",borderRadius:10,height:38,fontWeight:700,fontSize:13 }}>
                  + Donation
                </Button>
                <button style={{ padding:"0 14px",borderRadius:10,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,fontSize:12,cursor:"pointer" }}>
                  Details
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* New campaign dialog */}
        <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
          <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:440 }}>
            <DialogHeader>
              <DialogTitle style={{ color:T.white,fontSize:18,fontWeight:800 }}>New Campaign</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleC(d => createCampaignMutation.mutate(d))} style={{ display:"flex",flexDirection:"column",gap:14,marginTop:8 }}>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Campaign Name</Label>
                <Input {...regC("name",{required:true})} placeholder="e.g. Ramadan Appeal 2026"
                  style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
              </div>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Target Amount (£)</Label>
                <Input {...regC("targetAmount",{required:true})} type="number" placeholder="0"
                  style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
              </div>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Description</Label>
                <textarea {...regC("description")} rows={3} placeholder="Campaign details..."
                  style={{ marginTop:6,width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,padding:"10px 14px",fontSize:14,resize:"vertical",boxSizing:"border-box" }}/>
              </div>
              <Button type="submit" disabled={createCampaignMutation.isPending}
                style={{ background:`linear-gradient(135deg,${T.purple},#4f46e5)`,color:T.white,fontWeight:700,height:48,borderRadius:12,border:"none",fontSize:15 }}>
                {createCampaignMutation.isPending?"Creating…":"Create Campaign"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Add donation dialog */}
        <Dialog open={donationOpen} onOpenChange={setDonationOpen}>
          <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:440 }}>
            <DialogHeader>
              <DialogTitle style={{ color:T.white,fontSize:18,fontWeight:800 }}>
                Record Donation{selectedCampaign ? ` — ${selectedCampaign.name}` : ""}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleD(d => addDonationMutation.mutate({ ...d, campaignId: selectedCampaign?.id }))} style={{ display:"flex",flexDirection:"column",gap:14,marginTop:8 }}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Donor Name</Label>
                  <Input {...regD("donorName",{required:true})} placeholder="Full name"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Amount (£)</Label>
                  <Input {...regD("amount",{required:true})} type="number" step="0.01"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
              </div>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Payment Method</Label>
                <select {...regD("paymentMethod")}
                  style={{ marginTop:6,width:"100%",background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44,padding:"0 12px",fontSize:14 }}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <Button type="submit" disabled={addDonationMutation.isPending}
                style={{ background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",fontWeight:700,height:48,borderRadius:12,border:"none",fontSize:15 }}>
                {addDonationMutation.isPending?"Saving…":"Record Donation"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
