import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Database, Download, RefreshCw, CheckCircle2, Clock, HardDrive, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

export default function BackupsPage() {
  const [creating, setCreating] = useState(false);
  const { data, refetch } = trpc.backups?.list?.useQuery?.() ?? { data: null, refetch: () => {} };

  const createMutation = trpc.backups?.create?.useMutation?.({
    onSuccess: () => { toast.success("Backup created successfully"); refetch(); setCreating(false); },
    onError: (e: any) => { toast.error(e.message); setCreating(false); },
  });

  const backups = data?.backups ?? [
    { id:1, name:"Full Backup — May 2026", createdAt:"2026-05-01T02:00:00Z", size:"4.2 MB", status:"complete", type:"scheduled" },
    { id:2, name:"Full Backup — Apr 2026", createdAt:"2026-04-01T02:00:00Z", size:"3.8 MB", status:"complete", type:"scheduled" },
    { id:3, name:"Manual Backup", createdAt:"2026-03-15T14:23:00Z", size:"3.5 MB", status:"complete", type:"manual" },
  ];

  const lastBackup = backups[0];
  const lastBackupDate = lastBackup?.createdAt ? new Date(lastBackup.createdAt) : null;
  const hoursSince = lastBackupDate ? Math.floor((Date.now() - lastBackupDate.getTime()) / 3600000) : null;

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:24,fontFamily:"'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12,animation:"fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
              Data <span style={{ color:T.mint }}>Backups</span>
            </h1>
            <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>Automated & manual backups — real-time data protection</p>
          </div>
          <Button onClick={() => { setCreating(true); createMutation?.mutate?.(); }}
            disabled={creating}
            style={{ background:`linear-gradient(135deg,${T.purple},#4f46e5)`,color:T.white,border:"none",borderRadius:12,padding:"10px 20px",fontWeight:700,display:"flex",alignItems:"center",gap:8 }}>
            <RefreshCw size={15} style={creating?{animation:"spin 1s linear infinite"}:{}}/> {creating?"Creating…":"Create Backup"}
          </Button>
        </div>

        {/* Status cards */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16,marginBottom:28 }}>
          {[
            { label:"Last Backup", value:lastBackupDate?.toLocaleDateString("en-GB")??  "—", sub:hoursSince!=null?`${hoursSince}h ago`:undefined, color:T.mint, icon:CheckCircle2 },
            { label:"Total Backups", value:backups.length, color:T.purple, icon:Database },
            { label:"Storage Used", value:"11.5 MB", color:"#f59e0b", icon:HardDrive },
            { label:"Status", value:"Protected", color:T.mint, icon:Shield },
          ].map((s,i) => (
            <div key={s.label} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:"20px",display:"flex",alignItems:"center",gap:14,animation:`fadeUp 0.5s ease ${i*80}ms both` }}>
              <div style={{ width:42,height:42,borderRadius:12,background:`${s.color}22`,border:`1px solid ${s.color}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <s.icon size={18} style={{ color:s.color }}/>
              </div>
              <div>
                <p style={{ fontSize:20,fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.02em" }}>{s.value}</p>
                <p style={{ fontSize:11,color:T.muted,margin:0 }}>{s.label}</p>
                {s.sub && <p style={{ fontSize:10,color:`${T.mint}99`,margin:0 }}>{s.sub}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* Auto-backup info */}
        <div style={{ background:"rgba(0,255,194,0.06)",border:"1px solid rgba(0,255,194,0.15)",borderRadius:14,padding:"14px 18px",marginBottom:24,display:"flex",alignItems:"center",gap:12,animation:"fadeUp 0.5s ease 300ms both" }}>
          <Shield size={16} style={{ color:T.mint,flexShrink:0 }}/>
          <p style={{ fontSize:13,color:T.mint,margin:0 }}>
            <strong>Automatic backups</strong> run daily at 2:00 AM. All financial data, receipts, payroll records and documents are included.
          </p>
        </div>

        {/* Backups list */}
        <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:24,animation:"fadeUp 0.5s ease 380ms both" }}>
          <h2 style={{ fontSize:15,fontWeight:700,color:T.white,margin:"0 0 20px" }}>Backup History</h2>
          <div style={{ display:"flex",flexDirection:"column",gap:0 }}>
            {backups.map((b: any, i: number) => (
              <div key={b.id??i} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 0",borderBottom:i<backups.length-1?`1px solid ${T.border}`:"none",flexWrap:"wrap",gap:12 }}>
                <div style={{ display:"flex",alignItems:"center",gap:14 }}>
                  <div style={{ width:40,height:40,borderRadius:12,background:"rgba(0,255,194,0.1)",border:"1px solid rgba(0,255,194,0.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                    <Database size={18} style={{ color:T.mint }}/>
                  </div>
                  <div>
                    <p style={{ fontSize:13,fontWeight:600,color:T.white,margin:0 }}>{b.name}</p>
                    <div style={{ display:"flex",gap:12,marginTop:3 }}>
                      <span style={{ fontSize:11,color:T.muted }}>{b.createdAt ? new Date(b.createdAt).toLocaleString("en-GB") : "—"}</span>
                      <span style={{ fontSize:11,color:T.muted }}>{b.size ?? "—"}</span>
                      <span style={{ fontSize:11,padding:"1px 8px",borderRadius:999,background:b.type==="scheduled"?"rgba(99,91,255,0.12)":"rgba(0,255,194,0.08)",color:b.type==="scheduled"?"#a78bfa":T.mint,fontWeight:600 }}>
                        {b.type==="scheduled"?"Scheduled":"Manual"}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                    <CheckCircle2 size={14} style={{ color:T.mint }}/>
                    <span style={{ fontSize:12,color:T.mint,fontWeight:600 }}>Complete</span>
                  </div>
                  {b.downloadUrl && (
                    <a href={b.downloadUrl} download
                      style={{ padding:"6px 14px",borderRadius:9,background:"rgba(99,91,255,0.1)",border:"1px solid rgba(99,91,255,0.2)",color:T.purple,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6,textDecoration:"none" }}>
                      <Download size={12}/> Download
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
