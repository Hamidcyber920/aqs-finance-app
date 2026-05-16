import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { User, Lock, Bell, Shield, Eye, EyeOff, Save, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

const TABS = [
  { id:"profile", label:"Profile", icon:User },
  { id:"security", label:"Security", icon:Lock },
  { id:"notifications", label:"Notifications", icon:Bell },
];

export default function ProfileSettingsPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState("profile");

  useEffect(() => {
  }, [tab]);
  const briefingPrefs: any = null;
  const saveBriefingPrefsMut = { mutate: () => {}, isPending: false };
  const [localPrefs, setLocalPrefs] = useState({
    enabled: true, includeLoans: true, includeDonations: true,
    includePayroll: true, includePledges: true, includeTenants: true, includeCompliance: true,
  });
  // Sync localPrefs when briefingPrefs loads
  useEffect(() => {
    if (briefingPrefs) setLocalPrefs({
      enabled: briefingPrefs.enabled ?? true,
      includeLoans: briefingPrefs.includeLoans ?? true,
      includeDonations: briefingPrefs.includeDonations ?? true,
      includePayroll: briefingPrefs.includePayroll ?? true,
      includePledges: briefingPrefs.includePledges ?? true,
      includeTenants: briefingPrefs.includeTenants ?? true,
      includeCompliance: briefingPrefs.includeCompliance ?? true,
    });
  }, [briefingPrefs]);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const updateMutation = (trpc.users as any).updateProfile?.useMutation?.({
    onSuccess: () => toast.success("Profile updated"),
    onError: (e: any) => toast.error(e.message),
  });
  const passwordMutation = trpc.localAuth.changePassword?.useMutation?.({
    onSuccess: () => { toast.success("Password changed"); resetPwd(); },
    onError: (e: any) => toast.error(e.message),
  });

  const { register: regP, handleSubmit: handleP } = useForm<any>({
    defaultValues: { name: user?.name, email: user?.email },
  });
  const { register: regPwd, handleSubmit: handlePwd, reset: resetPwd } = useForm<any>();

  const role = user?.role ?? "user";
  const ROLE_COLORS: Record<string,string> = { superadmin:"#f87171",trustee:"#fbbf24",manager:T.purple,deputy:"#a78bfa",assistant:T.mint,volunteer:"#94a3b8" };

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:24,fontFamily:"'DM Sans',sans-serif" }}>

        <div style={{ maxWidth:680,margin:"0 auto" }}>

          {/* Header */}
          <div style={{ marginBottom:28,animation:"fadeUp 0.4s ease both" }}>
            <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
              Profile <span style={{ color:T.mint }}>&amp; Settings</span>
            </h1>
            <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>Manage your account, security and preferences</p>
          </div>

          {/* Profile card */}
          <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:20,padding:24,marginBottom:20,display:"flex",alignItems:"center",gap:20,flexWrap:"wrap",animation:"fadeUp 0.5s ease 100ms both" }}>
            <div style={{ width:72,height:72,borderRadius:"50%",background:`linear-gradient(135deg,${T.purple},#4f46e5)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:800,color:T.white,flexShrink:0 }}>
              {(user?.name??"?")[0].toUpperCase()}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:20,fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.02em" }}>{user?.name}</p>
              <p style={{ fontSize:13,color:T.muted,margin:"3px 0 6px" }}>{user?.email}</p>
              <span style={{ fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:999,background:`${ROLE_COLORS[role]??T.muted}18`,color:ROLE_COLORS[role]??T.muted,border:`1px solid ${ROLE_COLORS[role]??T.muted}30`,textTransform:"capitalize" }}>
                {role}
              </span>
            </div>
            <button onClick={logout}
              style={{ display:"flex",alignItems:"center",gap:7,padding:"9px 16px",borderRadius:10,background:"rgba(255,80,80,0.1)",border:"1px solid rgba(255,80,80,0.2)",color:"#ff5050",fontSize:13,fontWeight:600,cursor:"pointer" }}>
              <LogOut size={14}/> Sign Out
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display:"flex",gap:4,marginBottom:20,background:"rgba(255,255,255,0.04)",borderRadius:12,padding:4,width:"fit-content" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ padding:"8px 18px",borderRadius:10,fontSize:13,fontWeight:600,border:"none",cursor:"pointer",transition:"all 0.2s",display:"flex",alignItems:"center",gap:7,
                  background:tab===t.id?"rgba(99,91,255,0.3)":"transparent",
                  color:tab===t.id?T.white:T.muted }}>
                <t.icon size={14}/>{t.label}
              </button>
            ))}
          </div>

          {/* Profile tab */}
          {tab === "profile" && (
            <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:20,padding:28,animation:"fadeUp 0.4s ease both" }}>
              <h2 style={{ fontSize:16,fontWeight:700,color:T.white,margin:"0 0 20px" }}>Personal Information</h2>
              <form onSubmit={handleP(d => updateMutation?.mutate?.(d))} style={{ display:"flex",flexDirection:"column",gap:16 }}>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
                  <div>
                    <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Full Name</Label>
                    <Input {...regP("name")} style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                  </div>
                  <div>
                    <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Email</Label>
                    <Input {...regP("email")} type="email" style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                  </div>
                </div>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Role</Label>
                  <div style={{ marginTop:6,height:44,background:"rgba(255,255,255,0.03)",border:`1px solid ${T.border}`,borderRadius:10,display:"flex",alignItems:"center",paddingLeft:14 }}>
                    <span style={{ fontSize:14,color:T.muted,textTransform:"capitalize" }}>{role} — read only</span>
                  </div>
                </div>
                <Button type="submit" disabled={updateMutation?.isPending}
                  style={{ background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",fontWeight:700,height:46,borderRadius:12,border:"none",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:4 }}>
                  <Save size={16}/>{updateMutation?.isPending?"Saving…":"Save Changes"}
                </Button>
              </form>
            </div>
          )}

          {/* Security tab */}
          {tab === "security" && (
            <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:20,padding:28,animation:"fadeUp 0.4s ease both" }}>
              <h2 style={{ fontSize:16,fontWeight:700,color:T.white,margin:"0 0 20px" }}>Change Password</h2>
              <form onSubmit={handlePwd(d => passwordMutation?.mutate?.(d))} style={{ display:"flex",flexDirection:"column",gap:16 }}>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Current Password</Label>
                  <div style={{ position:"relative",marginTop:6 }}>
                    <Input {...regPwd("currentPassword",{required:true})} type={showOld?"text":"password"} placeholder="••••••••"
                      style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44,paddingRight:44 }}/>
                    <button type="button" onClick={()=>setShowOld(!showOld)}
                      style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:T.muted,cursor:"pointer",display:"flex" }}>
                      {showOld?<EyeOff size={16}/>:<Eye size={16}/>}
                    </button>
                  </div>
                </div>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>New Password</Label>
                  <div style={{ position:"relative",marginTop:6 }}>
                    <Input {...regPwd("newPassword",{required:true,minLength:8})} type={showNew?"text":"password"} placeholder="Min 8 characters"
                      style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44,paddingRight:44 }}/>
                    <button type="button" onClick={()=>setShowNew(!showNew)}
                      style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:T.muted,cursor:"pointer",display:"flex" }}>
                      {showNew?<EyeOff size={16}/>:<Eye size={16}/>}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={passwordMutation?.isPending}
                  style={{ background:`linear-gradient(135deg,${T.purple},#4f46e5)`,color:T.white,fontWeight:700,height:46,borderRadius:12,border:"none",fontSize:15,marginTop:4 }}>
                  {passwordMutation?.isPending?"Updating…":"Update Password"}
                </Button>
              </form>

              <div style={{ marginTop:24,padding:18,borderRadius:14,background:"rgba(0,255,194,0.06)",border:"1px solid rgba(0,255,194,0.15)" }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
                  <Shield size={14} style={{color:T.mint}}/>
                  <span style={{ fontSize:13,fontWeight:700,color:T.mint }}>Security Status</span>
                </div>
                <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                  {[
                    { label:"256-bit encryption", ok:true },
                    { label:"Secure session", ok:true },
                    { label:"GDPR compliant", ok:true },
                  ].map(item => (
                    <div key={item.label} style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ width:6,height:6,borderRadius:"50%",background:T.mint,flexShrink:0 }}/>
                      <span style={{ fontSize:12,color:T.muted }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Notifications tab */}
          {tab === "notifications" && (
            <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:20,padding:28,animation:"fadeUp 0.4s ease both" }}>
              <h2 style={{ fontSize:16,fontWeight:700,color:T.white,margin:"0 0 20px" }}>Notification Preferences</h2>
              <div style={{ display:"flex",flexDirection:"column",gap:0 }}>
                {[
                  { label:"Expense approved/rejected", sub:"Get notified when your receipts are reviewed", key:"expenses" },
                  { label:"Loan status updates", sub:"Updates on Qarde Hasan loan applications", key:"loans" },
                  { label:"Payroll processed", sub:"When monthly payslip is available", key:"payroll" },
                  { label:"New campaign donations", sub:"When a donation is recorded against a campaign", key:"donations" },
                  { label:"System announcements", sub:"Important platform updates", key:"system" },
                ].map((item, i) => (
                  <div key={item.key} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 0",borderBottom:i<4?`1px solid ${T.border}`:"none" }}>
                    <div>
                      <p style={{ fontSize:14,fontWeight:600,color:T.white,margin:0 }}>{item.label}</p>
                      <p style={{ fontSize:12,color:T.muted,margin:"2px 0 0" }}>{item.sub}</p>
                    </div>
                    <label style={{ position:"relative",width:44,height:24,cursor:"pointer",flexShrink:0 }}>
                      <input type="checkbox" defaultChecked style={{ opacity:0,width:0,height:0,position:"absolute" }}/>
                      <span style={{ position:"absolute",inset:0,borderRadius:999,background:T.mint,transition:"0.2s",display:"flex",alignItems:"center" }}>
                        <span style={{ position:"absolute",right:2,width:20,height:20,borderRadius:"50%",background:T.white,boxShadow:"0 1px 3px rgba(0,0,0,0.3)" }}/>
                      </span>
                    </label>
                  </div>
                ))}
              </div>

              {/* Hibba Morning Briefing Preferences */}
              <div style={{ marginTop:24,paddingTop:24,borderTop:`1px solid ${T.border}` }}>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
                  <div>
                    <p style={{ fontSize:14,fontWeight:700,color:T.white,margin:0 }}>Hibba Morning Briefing</p>
                    <p style={{ fontSize:12,color:T.muted,margin:"2px 0 0" }}>Choose which sections Hibba includes in your daily 7:30am email</p>
                  </div>
                  {briefingPrefs && (
                    <label style={{ position:"relative",width:44,height:24,cursor:"pointer",flexShrink:0 }}>
                      <input type="checkbox" checked={localPrefs.enabled} onChange={e => setLocalPrefs(p => ({...p, enabled: e.target.checked}))} style={{ opacity:0,width:0,height:0,position:"absolute" }}/>
                      <span style={{ position:"absolute",inset:0,borderRadius:999,background:localPrefs.enabled?T.mint:"rgba(255,255,255,0.15)",transition:"0.2s",display:"flex",alignItems:"center" }}>
                        <span style={{ position:"absolute",width:20,height:20,borderRadius:"50%",background:T.white,boxShadow:"0 1px 3px rgba(0,0,0,0.3)",transition:"0.2s",left:localPrefs.enabled?"calc(100% - 22px)":"2px" }}/>
                      </span>
                    </label>
                  )}
                </div>
                {briefingPrefs && localPrefs.enabled && (
                  <div style={{ display:"flex",flexDirection:"column",gap:0 }}>
                    {([
                      { key:"includeLoans", label:"Loans", sub:"Active loans and overdue repayments" },
                      { key:"includeDonations", label:"Donations", sub:"Recent donations and campaign totals" },
                      { key:"includePayroll", label:"Payroll", sub:"Upcoming payroll and pending approvals" },
                      { key:"includePledges", label:"Pledges", sub:"Pledge fulfilment progress" },
                      { key:"includeTenants", label:"Tenants", sub:"Accommodation and rent status" },
                      { key:"includeCompliance", label:"Compliance", sub:"Outstanding compliance items" },
                    ] as const).map((item, i, arr) => (
                      <div key={item.key} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none" }}>
                        <div>
                          <p style={{ fontSize:13,fontWeight:600,color:T.white,margin:0 }}>{item.label}</p>
                          <p style={{ fontSize:11,color:T.muted,margin:"2px 0 0" }}>{item.sub}</p>
                        </div>
                        <label style={{ position:"relative",width:40,height:22,cursor:"pointer",flexShrink:0 }}>
                          <input type="checkbox" checked={localPrefs[item.key]} onChange={e => setLocalPrefs(p => ({...p, [item.key]: e.target.checked}))} style={{ opacity:0,width:0,height:0,position:"absolute" }}/>
                          <span style={{ position:"absolute",inset:0,borderRadius:999,background:localPrefs[item.key]?T.mint:"rgba(255,255,255,0.15)",transition:"0.2s",display:"flex",alignItems:"center" }}>
                            <span style={{ position:"absolute",width:18,height:18,borderRadius:"50%",background:T.white,boxShadow:"0 1px 3px rgba(0,0,0,0.3)",transition:"0.2s",left:localPrefs[item.key]?"calc(100% - 20px)":"2px" }}/>
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                {briefingPrefs && (
                  <button
                    onClick={() => saveBriefingPrefsMut.mutate(localPrefs)}
                    disabled={saveBriefingPrefsMut.isPending}
                    style={{ marginTop:16,padding:"9px 20px",borderRadius:10,background:"linear-gradient(135deg,#635BFF,#4f46e5)",border:"none",color:T.white,fontSize:13,fontWeight:700,cursor:"pointer",opacity:saveBriefingPrefsMut.isPending?0.6:1 }}>
                    {saveBriefingPrefsMut.isPending ? "Saving..." : "Save Preferences"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
