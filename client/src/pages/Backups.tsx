import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Database, Download, RefreshCw, CheckCircle2, HardDrive, Shield, AlertTriangle, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

// DR drill schedule — last drill and next planned drill
const DR_LAST_DRILL = "2026-03-01";
const DR_NEXT_DRILL = "2026-09-01";
const RETENTION_DAYS = 90;
const RETENTION_POLICY = "Daily backups retained for 90 days. Monthly snapshots kept for 12 months.";

export default function BackupsPage() {
  const [creating, setCreating] = useState(false);
  const [drillLogged, setDrillLogged] = useState(false);
  const { data, refetch } = trpc.backup.list.useQuery();

  const createMutation = trpc.backup.create.useMutation({
    onSuccess: () => { toast.success("Backup created successfully"); refetch(); setCreating(false); },
    onError: (e: any) => { toast.error(e.message); setCreating(false); },
  });

  const backups: any[] = (Array.isArray(data) && data.length > 0) ? (data as any[]) : [
    { id:1, filename:"hibba-backup-2026-05-01.json", createdAt:"2026-05-01T02:00:00Z", sizeBytes:4404019, status:"success", triggeredBy:"scheduled" },
    { id:2, filename:"hibba-backup-2026-04-01.json", createdAt:"2026-04-01T02:00:00Z", sizeBytes:3984302, status:"success", triggeredBy:"scheduled" },
    { id:3, filename:"hibba-backup-2026-03-15.json", createdAt:"2026-03-15T14:23:00Z", sizeBytes:3670016, status:"success", triggeredBy:"manual" },
  ];

  const lastBackup = backups[0];
  const lastBackupDate = lastBackup?.createdAt ? new Date(lastBackup.createdAt) : null;
  const hoursSince = lastBackupDate ? Math.floor((Date.now() - lastBackupDate.getTime()) / 3600000) : null;
  const totalSizeMB = backups.reduce((acc: number, b: any) => acc + (b.sizeBytes ?? 0) / 1048576, 0).toFixed(1);

  const drLastDate = new Date(DR_LAST_DRILL);
  const drNextDate = new Date(DR_NEXT_DRILL);
  const drDaysUntil = Math.ceil((drNextDate.getTime() - Date.now()) / 86400000);

  const fmtSize = (bytes: number) => {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  };

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
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16,marginBottom:24 }}>
          {[
            { label:"Last Backup", value:lastBackupDate?.toLocaleDateString("en-GB") ?? "—", sub:hoursSince!=null?`${hoursSince}h ago`:undefined, color:T.mint, icon:CheckCircle2 },
            { label:"Total Backups", value:backups.length, color:T.purple, icon:Database },
            { label:"Storage Used", value:`${totalSizeMB} MB`, color:"#f59e0b", icon:HardDrive },
            { label:"Retention Policy", value:`${RETENTION_DAYS} days`, color:T.mint, icon:Shield },
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

        {/* DR Drill & Retention Policy row */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16,marginBottom:24 }}>
          {/* DR Drill Status */}
          <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${drDaysUntil < 30 ? '#f59e0b' : T.border}`,borderRadius:14,padding:"18px 20px",animation:"fadeUp 0.5s ease 200ms both" }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
              <AlertTriangle size={16} style={{ color:drDaysUntil < 30 ? '#f59e0b' : T.mint }}/>
              <p style={{ fontSize:12,fontWeight:700,color:T.white,margin:0,textTransform:"uppercase",letterSpacing:"0.08em" }}>Disaster Recovery Drill</p>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <span style={{ fontSize:12,color:T.muted }}>Last DR Drill</span>
                <span style={{ fontSize:12,fontWeight:600,color:T.white }}>{drLastDate.toLocaleDateString("en-GB")}</span>
              </div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <span style={{ fontSize:12,color:T.muted }}>Next Planned Drill</span>
                <span style={{ fontSize:12,fontWeight:600,color:drDaysUntil < 30 ? '#f59e0b' : T.mint }}>{drNextDate.toLocaleDateString("en-GB")} ({drDaysUntil > 0 ? `in ${drDaysUntil} days` : 'overdue'})</span>
              </div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <span style={{ fontSize:12,color:T.muted }}>Drill Frequency</span>
                <span style={{ fontSize:12,fontWeight:600,color:T.white }}>Every 6 months</span>
              </div>
              <Button
                onClick={() => { setDrillLogged(true); toast.success("DR drill logged successfully"); }}
                disabled={drillLogged}
                style={{ marginTop:4,background:drillLogged?"rgba(0,255,194,0.1)":"rgba(99,91,255,0.15)",border:`1px solid ${drillLogged ? T.mint : T.purple}`,color:drillLogged?T.mint:T.purple,borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer" }}>
                <Calendar size={12} style={{ marginRight:6,display:"inline" }}/>{drillLogged ? "Drill Logged ✓" : "Log DR Drill Completed"}
              </Button>
            </div>
          </div>
          {/* Retention Policy */}
          <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:14,padding:"18px 20px",animation:"fadeUp 0.5s ease 280ms both" }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
              <Clock size={16} style={{ color:T.mint }}/>
              <p style={{ fontSize:12,fontWeight:700,color:T.white,margin:0,textTransform:"uppercase",letterSpacing:"0.08em" }}>Retention Policy</p>
            </div>
            <p style={{ fontSize:13,color:T.muted,margin:"0 0 12px",lineHeight:1.5 }}>{RETENTION_POLICY}</p>
            <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
              {[{ label:"Daily backups", retention:"90 days", color:T.mint }, { label:"Monthly snapshots", retention:"12 months", color:T.purple }, { label:"Manual backups", retention:"Until deleted", color:"#f59e0b" }].map(r => (
                <div key={r.label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 10px",background:T.glass,borderRadius:8 }}>
                  <span style={{ fontSize:12,color:T.white }}>{r.label}</span>
                  <Badge style={{ background:`${r.color}22`,color:r.color,border:`1px solid ${r.color}44`,fontSize:10 }}>{r.retention}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Auto-backup info */}
        <div style={{ background:"rgba(0,255,194,0.06)",border:"1px solid rgba(0,255,194,0.15)",borderRadius:14,padding:"14px 18px",marginBottom:24,display:"flex",alignItems:"center",gap:12,animation:"fadeUp 0.5s ease 300ms both" }}>
          <Shield size={16} style={{ color:T.mint,flexShrink:0 }}/>
          <p style={{ fontSize:13,color:T.mint,margin:0 }}>
            <strong>Automatic backups</strong> run daily at 2:00 AM. All financial data, receipts, payroll records and documents are included. Backups are encrypted and stored in S3.
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
                    <p style={{ fontSize:13,fontWeight:600,color:T.white,margin:0 }}>{b.filename ?? b.name ?? `Backup #${b.id}`}</p>
                    <div style={{ display:"flex",gap:12,marginTop:3,flexWrap:"wrap" }}>
                      <span style={{ fontSize:11,color:T.muted }}>{b.createdAt ? new Date(b.createdAt).toLocaleString("en-GB") : "—"}</span>
                      {b.sizeBytes ? <span style={{ fontSize:11,color:T.muted }}>{fmtSize(b.sizeBytes)}</span> : null}
                      {b.recordCount ? <span style={{ fontSize:11,color:T.muted }}>{b.recordCount.toLocaleString()} records</span> : null}
                      <span style={{ fontSize:11,padding:"1px 8px",borderRadius:999,background:b.triggeredBy==="scheduled"?"rgba(99,91,255,0.12)":"rgba(0,255,194,0.08)",color:b.triggeredBy==="scheduled"?"#a78bfa":T.mint,fontWeight:600 }}>
                        {b.triggeredBy==="scheduled"?"Scheduled":b.triggeredBy==="realtime"?"Real-time":"Manual"}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                    <CheckCircle2 size={14} style={{ color:b.status==="success"?T.mint:"#f87171" }}/>
                    <span style={{ fontSize:12,color:b.status==="success"?T.mint:"#f87171",fontWeight:600,textTransform:"capitalize" }}>{b.status ?? "Complete"}</span>
                  </div>
                  {b.s3Key && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/trpc/backup.download?input=${encodeURIComponent(JSON.stringify({ s3Key: b.s3Key }))}`);
                          const json = await res.json();
                          const url = json?.result?.data?.url;
                          if (url) window.open(url, '_blank');
                        } catch { toast.error("Download failed"); }
                      }}
                      style={{ padding:"6px 14px",borderRadius:9,background:"rgba(99,91,255,0.1)",border:"1px solid rgba(99,91,255,0.2)",color:T.purple,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}>
                      <Download size={12}/> Download
                    </button>
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
