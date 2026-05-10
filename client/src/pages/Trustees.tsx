import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { Plus, Shield, Phone, Mail, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

export default function TrusteesPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { data, refetch } = trpc.trustees.list.useQuery();
  const createMutation = trpc.trustees.create.useMutation({
    onSuccess: () => { toast.success("Trustee added"); setOpen(false); refetch(); reset(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.trustees.update.useMutation({
    onSuccess: () => { toast.success("Trustee updated"); setEditing(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.trustees.delete.useMutation({
    onSuccess: () => { toast.success("Trustee removed"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const { register, handleSubmit, reset, setValue } = useForm<any>();

  const trustees = data ?? [];
  const active = trustees.filter((t: any) => t.isActive !== false).length;

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:24,fontFamily:"'DM Sans',sans-serif" }}>

        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12,animation:"fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
              Organisation <span style={{ color:T.mint }}>Contacts</span>
            </h1>
            <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>Trustees, managers & staff — available for communications across the system</p>
          </div>
          <Button onClick={() => { reset(); setOpen(true); }}
            style={{ background:`linear-gradient(135deg,${T.purple},#4f46e5)`,color:T.white,border:"none",borderRadius:12,padding:"10px 20px",fontWeight:700,display:"flex",alignItems:"center",gap:8 }}>
            <Plus size={15}/> Add Trustee
          </Button>
        </div>

        {/* Stats */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:16,marginBottom:28 }}>
          {[
            { label:"Total Contacts", value:trustees.length, color:T.purple },
            { label:"Active", value:active, color:T.mint },
            { label:"Trustees", value:trustees.filter((t:any)=>t.role?.toLowerCase().includes('trustee')||t.role?.toLowerCase().includes('chair')).length, color:"#a78bfa" },
            { label:"Staff / Managers", value:trustees.filter((t:any)=>!t.role?.toLowerCase().includes('trustee')&&!t.role?.toLowerCase().includes('chair')).length, color:"#fbbf24" },
          ].map((s,i) => (
            <div key={s.label} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:14,padding:"18px 20px",animation:`fadeUp 0.5s ease ${i*80}ms both` }}>
              <p style={{ fontSize:28,fontWeight:800,color:s.color,margin:0,letterSpacing:"-0.03em" }}>{s.value}</p>
              <p style={{ fontSize:12,color:T.muted,margin:"3px 0 0" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Trustees grid */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16 }}>
          {trustees.length === 0 ? (
            <div style={{ gridColumn:"1/-1",textAlign:"center",padding:60,color:T.muted,background:T.card,borderRadius:16,border:`1px solid ${T.border}` }}>
              <Shield size={36} style={{ opacity:0.3,marginBottom:12 }}/>
              <p>No trustees yet — add one above</p>
            </div>
          ) : trustees.map((t: any, i: number) => (
            <div key={t.id} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:22,animation:`fadeUp 0.5s ease ${200+i*60}ms both` }}>
              <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16 }}>
                <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                  <div style={{ width:48,height:48,borderRadius:"50%",background:`linear-gradient(135deg,${T.purple},#4f46e5)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:T.white,flexShrink:0 }}>
                    {(t.fullName??"?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontSize:15,fontWeight:700,color:T.white,margin:0 }}>{t.fullName}</p>
                    <p style={{ fontSize:11,color:T.purple,margin:0,fontWeight:600 }}>{t.role??"Trustee"}</p>
                  </div>
                </div>
                <div style={{ display:"flex",gap:6 }}>
                  <button onClick={() => { setEditing(t); setValue("fullName",t.fullName); setValue("email",t.email); setValue("phone",t.phone); setValue("role",t.role); setOpen(true); }}
                    style={{ width:30,height:30,borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
                    <Pencil size={12}/>
                  </button>
                  <button onClick={() => { if(confirm("Remove this trustee?")) deleteMutation.mutate({ id:t.id }); }}
                    style={{ width:30,height:30,borderRadius:8,background:"rgba(255,80,80,0.08)",border:"1px solid rgba(255,80,80,0.15)",color:"#ff5050",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
                    <Trash2 size={12}/>
                  </button>
                </div>
              </div>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {t.email && (
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <Mail size={13} style={{ color:T.muted,flexShrink:0 }}/>
                    <a href={`mailto:${t.email}`} style={{ fontSize:13,color:T.muted,textDecoration:"none" }} onClick={e=>e.stopPropagation()}>{t.email}</a>
                  </div>
                )}
                {t.phone && (
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <Phone size={13} style={{ color:T.muted,flexShrink:0 }}/>
                    <span style={{ fontSize:13,color:T.muted }}>{t.phone}</span>
                    <a href={`https://wa.me/44${t.phone.replace(/^0/,'').replace(/\s/g,'')}`} target="_blank" rel="noreferrer"
                      style={{ marginLeft:"auto",fontSize:11,padding:"2px 8px",borderRadius:6,background:"rgba(37,211,102,0.12)",color:"#25d366",fontWeight:600,textDecoration:"none" }}
                      onClick={e=>e.stopPropagation()}>WhatsApp</a>
                  </div>
                )}
                {t.notes && <p style={{ fontSize:11,color:T.muted,margin:0,fontStyle:"italic" }}>{t.notes}</p>}
              </div>
              <div style={{ marginTop:14,display:"flex",alignItems:"center",gap:6 }}>
                <span style={{ width:8,height:8,borderRadius:"50%",background:t.isActive!==false?T.mint:"#ff5050",boxShadow:t.isActive!==false?`0 0 6px ${T.mint}`:undefined }}/>
                <span style={{ fontSize:12,color:t.isActive!==false?T.mint:"#ff5050",fontWeight:600 }}>
                  {t.isActive!==false?"Active":"Inactive"}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Add / Edit dialog */}
        <Dialog open={open} onOpenChange={v=>{ setOpen(v); if(!v) setEditing(null); }}>
          <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:420 }}>
            <DialogHeader>
              <DialogTitle style={{ color:T.white,fontSize:18,fontWeight:800 }}>{editing?"Edit Trustee":"Add Trustee"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(d => editing ? updateMutation.mutate({id:editing.id,...d}) : createMutation.mutate(d))} style={{ display:"flex",flexDirection:"column",gap:14,marginTop:8 }}>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Full Name</Label>
                <Input {...register("fullName",{required:true})} placeholder="Full name"
                  style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Email</Label>
                  <Input {...register("email")} type="email"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Phone</Label>
                  <Input {...register("phone")}
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
              </div>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Role / Title</Label>
                <Input {...register("role")} placeholder="e.g. Chair of Trustees"
                  style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
              </div>
              <Button type="submit" disabled={createMutation.isPending||updateMutation.isPending}
                style={{ background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",fontWeight:700,height:48,borderRadius:12,border:"none",fontSize:15 }}>
                {createMutation.isPending||updateMutation.isPending?"Saving…":editing?"Update Trustee":"Add Trustee"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
