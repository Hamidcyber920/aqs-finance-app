import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import {
  ShieldCheck, Users, UserPlus, Check, X, Settings,
  Eye, EyeOff, Lock, Unlock, Badge as BadgeIcon
} from "lucide-react";
import { SmartUpload } from "@/components/SmartUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useVoiceContext } from "@/contexts/VoiceContext";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

const ROLES = ["superadmin","trustee","manager","deputy","assistant","volunteer"];
const ROLE_COLORS: Record<string,string> = {
  superadmin:"#f87171", trustee:"#fbbf24", manager:T.purple,
  deputy:"#a78bfa", assistant:T.mint, volunteer:"#94a3b8",
};

function RoleBadge({ role }: { role: string }) {
  const color = ROLE_COLORS[role] ?? T.muted;
  return <span style={{ padding:"2px 10px",borderRadius:999,fontSize:11,fontWeight:700,background:`${color}18`,color,border:`1px solid ${color}30`,textTransform:"capitalize" }}>{role}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string,{bg:string;color:string}> = {
    active:{bg:"rgba(0,255,194,0.1)",color:T.mint},
    pending:{bg:"rgba(251,191,36,0.1)",color:"#fbbf24"},
    suspended:{bg:"rgba(255,80,80,0.1)",color:"#ff5050"},
  };
  const s = map[status] ?? {bg:T.glass,color:T.muted};
  return <span style={{ padding:"2px 10px",borderRadius:999,fontSize:11,fontWeight:600,background:s.bg,color:s.color,textTransform:"capitalize" }}>{status}</span>;
}

export default function AdminPanelPage() {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [tab, setTab] = useState<"users"|"pending"|"succession">("users");

  const { setEntityContext } = useVoiceContext();
  useEffect(() => {
    setEntityContext("Viewing Admin Panel — user management, approvals and permissions");
    return () => setEntityContext(null);
  }, [setEntityContext]);

  const { data, refetch } = trpc.users.list.useQuery({});
  const { data: pending, refetch: refetchPending } = (trpc.users as any).listPending?.useQuery?.() ?? { data: null, refetch: () => {} };

  const approveMutation = trpc.users.approve?.useMutation?.({
    onSuccess: () => { toast.success("User approved"); refetchPending(); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const rejectMutation = trpc.users.reject?.useMutation?.({
    onSuccess: () => { toast.success("User rejected"); refetchPending(); },
    onError: (e: any) => toast.error(e.message),
  });
  const createMutation = trpc.users.createStaff?.useMutation?.({
    onSuccess: () => { toast.success("Staff account created"); setCreateOpen(false); refetch(); resetC(); },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: permsData, refetch: refetchPerms } = trpc.users.getPermissions.useQuery(
    { userId: selectedUser?.id ?? 0 },
    { enabled: !!selectedUser?.id }
  );
  const grantMutation = trpc.users.updatePermissions?.useMutation?.({
    onSuccess: () => refetchPerms(),
    onError: (e: any) => toast.error(e.message),
  });
  const revokeMutation = trpc.users.updatePermissions?.useMutation?.({
    onSuccess: () => refetchPerms(),
    onError: (e: any) => toast.error(e.message),
  });
  // Succession data
  const { data: successionData, refetch: refetchSuccession } = (trpc.succession as any).getStatus?.useQuery?.() ?? { data: null, refetch: () => {} };
  const setDelegateMutation = (trpc.succession as any).setDelegate?.useMutation?.({
    onSuccess: () => { toast.success("Delegate assigned"); refetchSuccession(); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeDelegateMutation = (trpc.succession as any).removeDelegate?.useMutation?.({
    onSuccess: () => { toast.success("Delegate removed"); refetchSuccession(); },
    onError: (e: any) => toast.error(e.message),
  });
  const triggerSuccessionMutation = (trpc.succession as any).triggerManual?.useMutation?.({
    onSuccess: (d: any) => { toast.success(`Succession triggered — ${d.notifiedCount} trustees notified`); refetchSuccession(); },
    onError: (e: any) => toast.error(e.message),
  });
  const [successionReason, setSuccessionReason] = useState("");
  const [showTriggerConfirm, setShowTriggerConfirm] = useState(false);

  const { register: regC, handleSubmit: handleC, reset: resetC } = useForm<any>();

  const users = data?.rows ?? [];
  const pendingUsers = (pending as any)?.rows ?? [];
  const activeUsers = users.filter((u: any) => u.status === "active").length;

  const PERM_GROUPS = [
    { label:"Finance", perms:["canManageFundraising","canManageLoans","canManageIncome","canViewFinanceReports","canExportFinanceReports","canTrackFinance","canViewAllIncome","canViewAllExpenses"] },
    { label:"Cash & Collections", perms:["canManageCashCollection","canManageFridayCollection","canReconcileFriday","canApproveExpenses","canManageInvoices"] },
    { label:"Reconciliation", perms:["canViewReconciliation","canManageReconciliation"] },
    { label:"Staff & Admin", perms:["canManagePayroll","canViewOwnPayslip","canManageDonors","canSendCampaigns","canExportReports"] },
  ];

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:24,fontFamily:"'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12,animation:"fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
              Admin <span style={{ color:T.mint }}>Panel</span>
            </h1>
            <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>User management, approvals and permissions</p>
          </div>
          <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap" }}>
            <SmartUpload
              moduleType="staff_profile"
              buttonLabel="Scan / Upload"
              buttonVariant="outline"
              onConfirm={(result) => {
                const d = result.extractedData as any;
                toast.info(`AI extracted: ${d.fullName || "staff member"}. Use Create Staff to complete the account.`);
                setCreateOpen(true);
              }}
            />
            <Button onClick={() => setCreateOpen(true)}
              style={{ background:`linear-gradient(135deg,${T.purple},#4f46e5)`,color:T.white,border:"none",borderRadius:12,padding:"10px 20px",fontWeight:700,display:"flex",alignItems:"center",gap:8 }}>
              <UserPlus size={15}/> Create Staff
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:16,marginBottom:28 }}>
          {[
            { label:"Total Users", value:users.length, color:T.purple },
            { label:"Active", value:activeUsers, color:T.mint },
            { label:"Pending Approval", value:pendingUsers.length, color:"#fbbf24" },
            { label:"Suspended", value:users.filter((u:any)=>u.status==="suspended").length, color:"#f87171" },
          ].map((s,i) => (
            <div key={s.label} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:14,padding:"16px 18px",animation:`fadeUp 0.5s ease ${i*80}ms both` }}>
              <p style={{ fontSize:24,fontWeight:800,color:s.color,margin:0,letterSpacing:"-0.03em" }}>{s.value}</p>
              <p style={{ fontSize:12,color:T.muted,margin:"3px 0 0" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:"flex",gap:4,marginBottom:20,background:"rgba(255,255,255,0.04)",borderRadius:12,padding:4,width:"fit-content" }}>
          {(["users","pending","succession"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding:"8px 20px",borderRadius:10,fontSize:13,fontWeight:600,border:"none",cursor:"pointer",transition:"all 0.2s",
                background:tab===t?"rgba(99,91,255,0.3)":"transparent",
                color:tab===t?T.white:T.muted }}>
              {t==="users"?"All Users":t==="pending"?`Pending${pendingUsers.length>0?` (${pendingUsers.length})`:""}`:"Succession"}
            </button>
          ))}
        </div>

        {/* Pending approvals */}
        {tab === "pending" && (
          <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
            {pendingUsers.length === 0 ? (
              <div style={{ background:T.card,borderRadius:16,padding:48,textAlign:"center",color:T.muted,border:`1px solid ${T.border}` }}>
                <Check size={32} style={{ opacity:0.3,marginBottom:12 }}/>
                <p>No pending approvals</p>
              </div>
            ) : pendingUsers.map((u: any, i: number) => (
              <div key={u.id} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid rgba(251,191,36,0.2)`,borderRadius:16,padding:20,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,animation:`fadeUp 0.4s ease ${i*60}ms both` }}>
                <div style={{ display:"flex",alignItems:"center",gap:14 }}>
                  <div style={{ width:44,height:44,borderRadius:"50%",background:"rgba(251,191,36,0.15)",border:"1px solid rgba(251,191,36,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#fbbf24" }}>
                    {(u.name??"?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontSize:14,fontWeight:700,color:T.white,margin:0 }}>{u.name}</p>
                    <p style={{ fontSize:12,color:T.muted,margin:0 }}>{u.email}</p>
                  </div>
                </div>
                <div style={{ display:"flex",gap:8 }}>
                  <button onClick={() => approveMutation?.mutate?.({ userId: u.id })}
                    style={{ padding:"8px 18px",borderRadius:10,background:"rgba(0,255,194,0.1)",border:"1px solid rgba(0,255,194,0.25)",color:T.mint,fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}>
                    <Check size={14}/> Approve
                  </button>
                  <button onClick={() => rejectMutation?.mutate?.({ userId: u.id })}
                    style={{ padding:"8px 18px",borderRadius:10,background:"rgba(255,80,80,0.1)",border:"1px solid rgba(255,80,80,0.25)",color:"#ff5050",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}>
                    <X size={14}/> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* All users table */}
        {tab === "users" && (
          <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:24,animation:"fadeUp 0.5s ease 300ms both" }}>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%",borderCollapse:"collapse",minWidth:600 }}>
                <thead>
                  <tr>
                    {["User","Role","Status","Supervisor","Permissions","Actions"].map(h=>(
                      <th key={h} style={{ textAlign:"left",fontSize:10,fontWeight:600,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",padding:"0 12px 12px 0",borderBottom:`1px solid ${T.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u: any, i: number) => (
                    <tr key={u.id}>
                      <td style={{ padding:"12px 12px 12px 0",borderBottom:`1px solid ${T.border}` }}>
                        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                          <div style={{ width:34,height:34,borderRadius:"50%",background:`linear-gradient(135deg,${T.purple},#4f46e5)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:T.white,flexShrink:0 }}>
                            {(u.name??"?")[0].toUpperCase()}
                          </div>
                          <div>
                            <p style={{ fontSize:13,fontWeight:600,color:T.white,margin:0 }}>
                              {u.name}
                              {u.isPropertyManager && <span style={{ marginLeft:6,fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:999,background:"rgba(99,91,255,0.2)",color:T.purple }}>PROPERTY MGR</span>}
                            </p>
                            <p style={{ fontSize:11,color:T.muted,margin:0 }}>{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:"12px 12px 12px 0",borderBottom:`1px solid ${T.border}` }}><RoleBadge role={u.role??"-"}/></td>
                      <td style={{ padding:"12px 12px 12px 0",borderBottom:`1px solid ${T.border}` }}><StatusBadge status={u.status??"active"}/></td>
                      <td style={{ padding:"12px 12px 12px 0",fontSize:12,color:T.muted,borderBottom:`1px solid ${T.border}` }}>{u.supervisorName??u.supervisedByName??"—"}</td>
                      <td style={{ padding:"12px 12px 12px 0",borderBottom:`1px solid ${T.border}` }}>
                        <button onClick={() => { setSelectedUser(u); setPermOpen(true); }}
                          style={{ padding:"4px 10px",borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,fontSize:11,fontWeight:600,cursor:"pointer" }}>
                          <Settings size={11} style={{ display:"inline",marginRight:4 }}/>Manage
                        </button>
                      </td>
                      <td style={{ padding:"12px 0",borderBottom:`1px solid ${T.border}` }}>
                        <div style={{ display:"flex",gap:6 }}>
                          {u.status==="pending" && (
                            <button onClick={()=>approveMutation?.mutate?.({userId:u.id})}
                              style={{ padding:"4px 10px",borderRadius:8,background:"rgba(0,255,194,0.1)",border:"1px solid rgba(0,255,194,0.2)",color:T.mint,fontSize:11,fontWeight:600,cursor:"pointer" }}>
                              Approve
                            </button>
                          )}
                          {u.status==="active" && (
                            <button style={{ padding:"4px 10px",borderRadius:8,background:"rgba(255,80,80,0.08)",border:"1px solid rgba(255,80,80,0.18)",color:"#ff5050",fontSize:11,fontWeight:600,cursor:"pointer" }}>
                              Suspend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Succession & Delegation panel */}
        {tab === "succession" && (
          <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
            {/* Status card */}
            <div style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:"20px 24px" }}>
              <p style={{ fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",margin:"0 0 14px" }}>Succession Status</p>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12 }}>
                <div style={{ padding:"14px 16px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:`1px solid ${T.border}` }}>
                  <p style={{ fontSize:11,color:T.muted,margin:"0 0 4px" }}>Current Delegate</p>
                  <p style={{ fontSize:16,fontWeight:700,color:successionData?.currentDelegate?T.mint:T.muted,margin:0 }}>
                    {successionData?.currentDelegate?.fullName ?? "None assigned"}
                  </p>
                </div>
                <div style={{ padding:"14px 16px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:`1px solid ${T.border}` }}>
                  <p style={{ fontSize:11,color:T.muted,margin:"0 0 4px" }}>Owner Last Active</p>
                  <p style={{ fontSize:16,fontWeight:700,color:T.white,margin:0 }}>
                    {successionData?.inactivityDays != null ? `${successionData.inactivityDays}d ago` : "—"}
                  </p>
                </div>
                <div style={{ padding:"14px 16px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:`1px solid ${T.border}` }}>
                  <p style={{ fontSize:11,color:T.muted,margin:"0 0 4px" }}>Total Trustees</p>
                  <p style={{ fontSize:16,fontWeight:700,color:T.purple,margin:0 }}>
                    {successionData?.trustees?.length ?? 0}
                  </p>
                </div>
              </div>
            </div>
            {/* Assign delegate */}
            <div style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:"20px 24px" }}>
              <p style={{ fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",margin:"0 0 14px" }}>Assign Delegate Trustee</p>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {(successionData?.trustees ?? []).map((t: any) => (
                  <div key={t.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",borderRadius:10,background:"rgba(255,255,255,0.04)",border:`1px solid ${T.border}` }}>
                    <div>
                      <p style={{ fontSize:13,fontWeight:700,color:T.white,margin:0 }}>{t.name}</p>
                      <p style={{ fontSize:11,color:T.muted,margin:"2px 0 0" }}>{t.role} · {t.email}</p>
                    </div>
                    <button onClick={() => setDelegateMutation?.mutate?.({ trusteesId: t.id })}
                      style={{ padding:"6px 14px",borderRadius:8,background:`rgba(0,255,194,0.1)`,border:`1px solid rgba(0,255,194,0.3)`,color:T.mint,fontWeight:700,cursor:"pointer",fontSize:12 }}>
                      Assign
                    </button>
                  </div>
                ))}
                {successionData?.currentDelegate && (
                  <button onClick={() => removeDelegateMutation?.mutate?.()}
                    style={{ padding:"10px 0",borderRadius:10,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",color:"#f87171",fontWeight:700,cursor:"pointer",fontSize:13 }}>
                    Remove Current Delegate
                  </button>
                )}
              </div>
            </div>
            {/* Manual succession trigger */}
            <div style={{ background:T.card,border:`1px solid rgba(239,68,68,0.3)`,borderRadius:16,padding:"20px 24px" }}>
              <p style={{ fontSize:11,fontWeight:700,color:"#f87171",textTransform:"uppercase",letterSpacing:"0.08em",margin:"0 0 4px" }}>Manual Succession Trigger</p>
              <p style={{ fontSize:12,color:T.muted,margin:"0 0 14px" }}>Use this for planned absences or emergencies. All trustees and NOK will be notified by email.</p>
              <textarea value={successionReason} onChange={e=>setSuccessionReason(e.target.value)}
                placeholder="Reason for succession (e.g. planned leave, medical emergency)…"
                rows={3}
                style={{ width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,padding:"10px 12px",fontSize:13,resize:"vertical",boxSizing:"border-box",marginBottom:10 }}/>
              {!showTriggerConfirm ? (
                <button onClick={()=>setShowTriggerConfirm(true)} disabled={!successionReason.trim()}
                  style={{ padding:"10px 24px",borderRadius:10,background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.4)",color:"#f87171",fontWeight:700,cursor:"pointer",fontSize:13 }}>
                  Trigger Succession
                </button>
              ) : (
                <div style={{ display:"flex",gap:8 }}>
                  <button onClick={()=>{ triggerSuccessionMutation?.mutate?.({ reason: successionReason, notifyNok: true }); setShowTriggerConfirm(false); setSuccessionReason(""); }}
                    style={{ flex:1,padding:"10px 0",borderRadius:10,background:"#ef4444",border:"none",color:T.white,fontWeight:700,cursor:"pointer",fontSize:13 }}>
                    Confirm — Notify All Trustees
                  </button>
                  <button onClick={()=>setShowTriggerConfirm(false)}
                    style={{ padding:"10px 16px",borderRadius:10,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,fontWeight:700,cursor:"pointer",fontSize:13 }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
            {/* Succession event log */}
            {(successionData?.events ?? []).length > 0 && (
              <div style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:"20px 24px" }}>
                <p style={{ fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",margin:"0 0 14px" }}>Recent Succession Events</p>
                <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                  {(successionData.events as any[]).map((ev: any) => (
                    <div key={ev.id} style={{ padding:"10px 14px",borderRadius:10,background:"rgba(255,255,255,0.04)",border:`1px solid ${T.border}` }}>
                      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                        <span style={{ fontSize:12,fontWeight:700,color:T.white }}>{ev.eventType.replace(/_/g," ")}</span>
                        <span style={{ fontSize:10,color:T.muted }}>{new Date(ev.triggeredAt).toLocaleString()}</span>
                      </div>
                      {ev.notes && <p style={{ fontSize:11,color:T.muted,margin:"4px 0 0" }}>{ev.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {/* Create staff dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:460 }}>
            <DialogHeader>
              <DialogTitle style={{ color:T.white,fontSize:18,fontWeight:800 }}>Create Staff Account</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleC(d=>createMutation?.mutate?.(d))} style={{ display:"flex",flexDirection:"column",gap:14,marginTop:8 }}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Full Name</Label>
                  <Input {...regC("name",{required:true})} placeholder="Full name"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Email</Label>
                  <Input {...regC("email",{required:true})} type="email"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Role</Label>
                  <select {...regC("role")}
                    style={{ marginTop:6,width:"100%",background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44,padding:"0 12px",fontSize:14 }}>
                    {ROLES.map(r=><option key={r} value={r} style={{background:"#0D2240",textTransform:"capitalize"}}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Temp Password</Label>
                  <Input {...regC("tempPassword",{required:true})} type="password" placeholder="Temporary"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:44 }}/>
                </div>
              </div>
              <label style={{ display:"flex",alignItems:"center",gap:10,cursor:"pointer" }}>
                <input type="checkbox" {...regC("isPropertyManager")} style={{ width:16,height:16,accentColor:T.mint }}/>
                <span style={{ fontSize:13,color:T.muted }}>Property Manager</span>
              </label>
              <Button type="submit" disabled={createMutation?.isPending}
                style={{ background:`linear-gradient(135deg,${T.purple},#4f46e5)`,color:T.white,fontWeight:700,height:48,borderRadius:12,border:"none",fontSize:15 }}>
                {createMutation?.isPending?"Creating…":"Create Account"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Permissions dialog */}
        <Dialog open={permOpen} onOpenChange={setPermOpen}>
          <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:500,maxHeight:"85vh",overflowY:"auto" }}>
            <DialogHeader>
              <DialogTitle style={{ color:T.white,fontSize:18,fontWeight:800 }}>
                Permissions — {selectedUser?.name}
              </DialogTitle>
            </DialogHeader>
            <div style={{ display:"flex",flexDirection:"column",gap:20,marginTop:8 }}>
              {PERM_GROUPS.map(group => (
                <div key={group.label}>
                  <p style={{ fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10 }}>{group.label}</p>
                  <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                    {group.perms.map(perm => {
                      const enabled = permsData?.[perm as keyof typeof permsData] ?? false;
                      return (
                        <div key={perm} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:10,background:"rgba(255,255,255,0.04)",border:`1px solid ${T.border}` }}>
                          <span style={{ fontSize:13,color:T.muted }}>
                            {perm.replace(/^can/,"").replace(/([A-Z])/g," $1").trim()}
                          </span>
                          <button
                            onClick={() => grantMutation?.mutate?.({ userId:selectedUser?.id, [perm]: !enabled } as any)}
                            style={{ width:44,height:24,borderRadius:999,border:"none",cursor:"pointer",transition:"all 0.2s",
                              background:enabled?T.mint:"rgba(255,255,255,0.1)",
                              position:"relative",flexShrink:0 }}>
                            <span style={{ position:"absolute",top:2,width:20,height:20,borderRadius:"50%",background:T.white,transition:"all 0.2s",
                              left:enabled?"calc(100% - 22px)":"2px",boxShadow:"0 1px 3px rgba(0,0,0,0.3)" }}/>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
