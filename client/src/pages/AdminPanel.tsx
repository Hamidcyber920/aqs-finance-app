import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import {
  ShieldCheck, Users, UserPlus, Check, X, Settings,
  Eye, EyeOff, Lock, Unlock, Badge as BadgeIcon, Mic, Trash2, Share2, Sun
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


const QUICK_ACTION_TEMPLATES = [
  {
    name: "Finance Pack",
    emoji: "💰",
    pages: [
      { pageKey: "/loans", actions: ["Show overdue loans", "Summarise active loans", "Any loans due this month?"] },
      { pageKey: "/income", actions: ["Show this month's income", "Compare to last month", "Any pending income entries?"] },
      { pageKey: "/monthly-expenses", actions: ["Show this month's expenses", "What's the biggest expense?", "Any unapproved expenses?"] },
      { pageKey: "/reconciliation", actions: ["Show unreconciled items", "Summarise this month's reconciliation", "Any discrepancies?"] },
    ],
  },
  {
    name: "Trustee Pack",
    emoji: "🏛️",
    pages: [
      { pageKey: "/trustee-dashboard", actions: ["Give me a trustee summary", "Any urgent items?", "Show pending approvals"] },
      { pageKey: "/compliance", actions: ["Show outstanding compliance items", "Any overdue actions?", "Summarise compliance status"] },
      { pageKey: "/decisions", actions: ["Show recent decisions", "Any pending decisions?", "Summarise the decisions register"] },
      { pageKey: "/audit-trail", actions: ["Show recent activity", "Any unusual actions?", "Who made changes today?"] },
    ],
  },
  {
    name: "Fundraising Pack",
    emoji: "🎗️",
    pages: [
      { pageKey: "/fundraising", actions: ["Show active campaigns", "Which campaign is performing best?", "Any campaigns ending soon?"] },
      { pageKey: "/donors", actions: ["Show top donors", "Any lapsed donors?", "Who donated this month?"] },
      { pageKey: "/gift-aid", actions: ["Show pending Gift Aid claims", "How much Gift Aid is outstanding?", "Any declarations expiring?"] },
      { pageKey: "/pledges", actions: ["Show active pledges", "Any overdue pledge payments?", "Summarise pledge totals"] },
    ],
  },
  {
    name: "Operations Pack",
    emoji: "⚙️",
    pages: [
      { pageKey: "/payroll", actions: ["Show this month's payroll", "Any pending approvals?", "Summarise staff costs"] },
      { pageKey: "/accommodation", actions: ["Show current tenants", "Any rent overdue?", "Upcoming tenancy renewals?"] },
      { pageKey: "/facilities", actions: ["Show today's bookings", "Any maintenance issues?", "What's booked this week?"] },
      { pageKey: "/bills-utilities", actions: ["Show outstanding bills", "Any overdue utilities?", "Summarise utility costs"] },
    ],
  },
];

export default function AdminPanelPage() {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [tab, setTab] = useState<"users"|"pending"|"succession"|"hibba"|"google">("users");
  const [googleStatus, setGoogleStatus] = useState<{connected:boolean;drive?:boolean;gmail?:boolean;email?:string|null;error?:string}|null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [qaPageKey, setQaPageKey] = useState("/loans");
  const [qaActions, setQaActions] = useState<string[]>(["Show overdue loans", "Summarise active loans", "Any loans due this month?"]);
  const [qaInput, setQaInput] = useState("");
  const { data: sharedActionsData, refetch: refetchSharedActions } = trpc.voiceAgent.listAdminSharedActions.useQuery();
  const shareActionsMut = trpc.voiceAgent.adminShareQuickActions.useMutation({ onSuccess: () => { toast.success("Quick actions pushed to all users"); refetchSharedActions(); }, onError: (e: any) => toast.error(e.message) });
  const deleteSharedMut = trpc.voiceAgent.deleteAdminSharedActions.useMutation({ onSuccess: () => { toast.success("Removed shared actions"); refetchSharedActions(); }, onError: (e: any) => toast.error(e.message) });
  const triggerBriefingMut = trpc.voiceAgent.triggerMorningBriefing.useMutation({ onSuccess: () => toast.success("Morning briefing triggered and sent!"), onError: (e: any) => toast.error(e.message) });
  const sharedActionsList = { data: sharedActionsData ?? [], refetch: refetchSharedActions };

  const { setEntityContext } = useVoiceContext();
  useEffect(() => {
    setEntityContext("Viewing Admin Panel — user management, approvals and permissions");
    return () => setEntityContext(null);
  }, [setEntityContext]);

  // Google re-auth helpers
  const checkGoogleStatus = async () => {
    try {
      const res = await fetch("/api/google/status");
      const data = await res.json();
      setGoogleStatus(data);
    } catch {
      setGoogleStatus({ connected: false, error: "Could not check status" });
    }
  };
  const handleGoogleReauth = async () => {
    setGoogleLoading(true);
    try {
      const res = await fetch("/api/google/auth-url", { headers: { Origin: window.location.origin } });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
        toast.success("Google authorization page opened in a new tab");
      } else {
        toast.error("Could not generate auth URL");
      }
    } catch (err: any) {
      toast.error("Failed to start re-authorization: " + err.message);
    } finally {
      setGoogleLoading(false);
    }
  };
  // Check for google_auth query param on mount (callback redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_auth") === "success") {
      toast.success("Google account connected successfully!");
      setTab("google");
      checkGoogleStatus();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("google_auth") === "error") {
      toast.error("Google authorization failed: " + (params.get("reason") || "Unknown error"));
      setTab("google");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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
          {(["users","pending","succession","hibba","google"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); if (t === "google" && !googleStatus) { checkGoogleStatus(); } }}
              style={{ padding:"8px 20px",borderRadius:10,fontSize:13,fontWeight:600,border:"none",cursor:"pointer",transition:"all 0.2s",
                background:tab===t?"rgba(99,91,255,0.3)":"transparent",
                color:tab===t?T.white:T.muted }}>
              {t==="users"?"All Users":t==="pending"?`Pending${pendingUsers.length>0?` (${pendingUsers.length})`:""}`:t==="succession"?"Succession":t==="hibba"?"Hibba AI":"Google"}
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

        {/* Hibba AI Management tab */}
        {tab === "hibba" && (
          <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
            {/* Morning Briefing Card */}
            <div style={{ background:"rgba(13,34,64,0.8)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"20px 24px" }}>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <Sun size={18} style={{ color:"#fbbf24" }}/>
                  <p style={{ fontSize:14,fontWeight:700,color:"#FFFFFF",margin:0 }}>Morning Briefing</p>
                </div>
                <button
                  onClick={() => triggerBriefingMut?.mutate?.({})}
                  disabled={triggerBriefingMut?.isPending}
                  style={{ padding:"8px 18px",borderRadius:10,background:"linear-gradient(135deg,#fbbf24,#f59e0b)",border:"none",color:"#0A192F",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,opacity:triggerBriefingMut?.isPending?0.6:1 }}>
                  <Sun size={13}/> {triggerBriefingMut?.isPending ? "Sending..." : "Send Now"}
                </button>
              </div>
              <p style={{ fontSize:13,color:"rgba(255,255,255,0.5)",margin:0 }}>
                Hibba sends a daily morning briefing email to all trustees and key staff at 7:30am. Click "Send Now" to trigger it immediately for testing.
              </p>
            </div>

            {/* Quick Actions Sharing Card */}
            <div style={{ background:"rgba(13,34,64,0.8)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"20px 24px" }}>
              <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
                <Share2 size={18} style={{ color:"#635BFF" }}/>
                <p style={{ fontSize:14,fontWeight:700,color:"#FFFFFF",margin:0 }}>Push Quick Actions to All Users</p>
              </div>
              <p style={{ fontSize:13,color:"rgba(255,255,255,0.5)",margin:"0 0 16px" }}>
                Set the default Hibba quick action chips for any page. These appear for all users who haven't customised their own actions.
              </p>
              <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                <div>
                  <label style={{ fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:"0.08em" }}>Page Path</label>
                  <input
                    value={qaPageKey}
                    onChange={e => setQaPageKey(e.target.value)}
                    placeholder="/loans"
                    style={{ marginTop:6,width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,color:"#FFFFFF",height:44,padding:"0 14px",fontSize:14,boxSizing:"border-box" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:"0.08em" }}>Actions (one per line, max 6)</label>
                  <textarea
                    value={qaActions.join("\n")}
                    onChange={e => setQaActions(e.target.value.split("\n").slice(0,6))}
                    rows={4}
                    style={{ marginTop:6,width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,color:"#FFFFFF",padding:"10px 14px",fontSize:13,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box" }}
                  />
                </div>
                <button
                  onClick={() => shareActionsMut?.mutate?.({ pageKey: qaPageKey, actions: qaActions.filter(a => a.trim()) })}
                  disabled={shareActionsMut?.isPending || !qaPageKey.trim() || qaActions.filter(a=>a.trim()).length === 0}
                  style={{ padding:"10px 20px",borderRadius:10,background:"linear-gradient(135deg,#635BFF,#4f46e5)",border:"none",color:"#FFFFFF",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,width:"fit-content",opacity:(shareActionsMut?.isPending || !qaPageKey.trim())?0.6:1 }}>
                  <Share2 size={13}/> {shareActionsMut?.isPending ? "Pushing..." : "Push to All Users"}
                </button>
              </div>
            </div>


            {/* Bulk Quick Action Templates */}
            <div style={{ background:"rgba(13,34,64,0.8)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"20px 24px" }}>
              <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
                <Settings size={18} style={{ color:"#fbbf24" }}/>
                <p style={{ fontSize:14,fontWeight:700,color:"#FFFFFF",margin:0 }}>Bulk Templates</p>
              </div>
              <p style={{ fontSize:13,color:"rgba(255,255,255,0.5)",margin:"0 0 16px" }}>
                Apply a pre-built pack to push curated quick actions to multiple pages at once.
              </p>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12 }}>
                {QUICK_ACTION_TEMPLATES.map(tmpl => (
                  <div key={tmpl.name} style={{ background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"14px 16px" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
                      <span style={{ fontSize:18 }}>{tmpl.emoji}</span>
                      <p style={{ fontSize:13,fontWeight:700,color:"#FFFFFF",margin:0 }}>{tmpl.name}</p>
                    </div>
                    <p style={{ fontSize:11,color:"rgba(255,255,255,0.4)",margin:"0 0 12px" }}>{tmpl.pages.length} pages</p>
                    <button
                      onClick={() => {
                        tmpl.pages.forEach(({ pageKey, actions }) => {
                          shareActionsMut?.mutate?.({ pageKey, actions });
                        });
                        toast.success(`"${tmpl.name}" template applied to ${tmpl.pages.length} pages`);
                      }}
                      disabled={shareActionsMut?.isPending}
                      style={{ width:"100%",padding:"8px 0",borderRadius:8,background:"linear-gradient(135deg,rgba(99,91,255,0.3),rgba(79,70,229,0.3))",border:"1px solid rgba(99,91,255,0.3)",color:"rgba(255,255,255,0.9)",fontSize:12,fontWeight:700,cursor:"pointer" }}>
                      Apply Pack
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {/* Currently Shared Actions */}
            <div style={{ background:"rgba(13,34,64,0.8)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"20px 24px" }}>
              <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
                <Mic size={18} style={{ color:"#00FFC2" }}/>
                <p style={{ fontSize:14,fontWeight:700,color:"#FFFFFF",margin:0 }}>Currently Shared Actions</p>
              </div>
              {(!sharedActionsList.data || sharedActionsList.data.length === 0) ? (
                <p style={{ fontSize:13,color:"rgba(255,255,255,0.4)",margin:0 }}>No shared actions configured yet.</p>
              ) : (
                <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                  {(sharedActionsList.data ?? []).map((row: any) => (
                    <div key={row.pageKey} style={{ background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"12px 16px" }}>
                      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
                        <span style={{ fontSize:13,fontWeight:700,color:"#00FFC2",fontFamily:"monospace" }}>{row.pageKey}</span>
                        <button
                          onClick={() => deleteSharedMut?.mutate?.({ pageKey: row.pageKey })}
                          style={{ padding:"4px 10px",borderRadius:8,background:"rgba(255,80,80,0.1)",border:"1px solid rgba(255,80,80,0.25)",color:"#ff5050",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:4 }}>
                          <Trash2 size={11}/> Remove
                        </button>
                      </div>
                      <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                        {row.actions.map((a: string, i: number) => (
                          <span key={i} style={{ padding:"4px 10px",borderRadius:8,background:"rgba(99,91,255,0.15)",border:"1px solid rgba(99,91,255,0.25)",color:"rgba(255,255,255,0.8)",fontSize:12 }}>{a}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Google Connection tab */}
        {tab === "google" && (
          <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
            {/* Status Card */}
            <div style={{ background:"rgba(13,34,64,0.8)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"24px" }}>
              <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:16 }}>
                <div style={{ width:40,height:40,borderRadius:12,background:googleStatus?.connected?"rgba(0,255,194,0.15)":"rgba(255,80,80,0.15)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                  <span style={{ fontSize:20 }}>{googleStatus?.connected ? "✓" : "✗"}</span>
                </div>
                <div>
                  <p style={{ fontSize:16,fontWeight:700,color:"#FFFFFF",margin:0 }}>Google Services Connection</p>
                  <p style={{ fontSize:12,color:"rgba(255,255,255,0.5)",margin:0,marginTop:2 }}>
                    {googleStatus?.connected ? "Connected and working" : googleStatus?.error || "Not connected — refresh tokens expired"}
                  </p>
                </div>
              </div>

              {/* Service Status */}
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20 }}>
                <div style={{ padding:"14px 16px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)" }}>
                  <p style={{ fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.5)",margin:0,textTransform:"uppercase",letterSpacing:"0.08em" }}>Google Drive</p>
                  <p style={{ fontSize:14,fontWeight:700,color:googleStatus?.drive?"#00FFC2":"#ff5050",margin:0,marginTop:4 }}>
                    {googleStatus === null ? "Checking..." : googleStatus.drive ? "Connected" : "Disconnected"}
                  </p>
                </div>
                <div style={{ padding:"14px 16px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)" }}>
                  <p style={{ fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.5)",margin:0,textTransform:"uppercase",letterSpacing:"0.08em" }}>Gmail</p>
                  <p style={{ fontSize:14,fontWeight:700,color:googleStatus?.gmail?"#00FFC2":"#ff5050",margin:0,marginTop:4 }}>
                    {googleStatus === null ? "Checking..." : googleStatus.gmail ? "Connected" : "Disconnected"}
                  </p>
                </div>
              </div>

              {/* Re-authorize Button */}
              <Button
                onClick={handleGoogleReauth}
                disabled={googleLoading}
                style={{ width:"100%",height:48,borderRadius:12,fontWeight:700,fontSize:15,border:"none",cursor:"pointer",
                  background:googleStatus?.connected?"rgba(255,255,255,0.08)":"linear-gradient(135deg,#4285F4,#34A853)",
                  color:"#FFFFFF" }}>
                {googleLoading ? "Redirecting..." : googleStatus?.connected ? "Re-connect Google Account" : "Connect Google Account"}
              </Button>
            </div>

            {/* Info Card */}
            <div style={{ background:"rgba(66,133,244,0.08)",border:"1px solid rgba(66,133,244,0.2)",borderRadius:12,padding:"16px 20px" }}>
              <p style={{ fontSize:13,color:"rgba(255,255,255,0.7)",margin:0,lineHeight:1.6 }}>
                <strong style={{ color:"#4285F4" }}>How it works:</strong> Clicking the button above will open Google's consent screen where you can authorize access to Drive, Gmail, Calendar, and Sheets. Once authorized, Hibba will be able to read emails, manage Drive files, and create spreadsheets.
              </p>
            </div>

            {/* Scopes Info */}
            <div style={{ background:"rgba(13,34,64,0.8)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"20px 24px" }}>
              <p style={{ fontSize:13,fontWeight:700,color:"#FFFFFF",margin:0,marginBottom:12 }}>Permissions requested:</p>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {["Google Drive — read, create, and manage files","Gmail — read, send, and manage emails","Google Calendar — read events","Google Sheets — create and edit spreadsheets"].map(scope => (
                  <div key={scope} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:8,background:"rgba(255,255,255,0.04)" }}>
                    <Check size={14} style={{ color:"#00FFC2",flexShrink:0 }}/>
                    <span style={{ fontSize:12,color:"rgba(255,255,255,0.6)" }}>{scope}</span>
                  </div>
                ))}
              </div>
            </div>
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
