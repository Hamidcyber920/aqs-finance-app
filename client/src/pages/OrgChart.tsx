import { trpc } from "@/lib/trpc";
import { Mail, Phone, Shield } from "lucide-react";

const T = {
  navy:"#0A192F", purple:"#635BFF", mint:"#00FFC2", white:"#FFFFFF",
  muted:"rgba(255,255,255,0.5)", border:"rgba(255,255,255,0.08)",
  card:"rgba(13,34,64,0.8)",
};

const ROLE_COLORS: Record<string,{bg:string;color:string}> = {
  superadmin:{ bg:"rgba(248,113,113,0.12)", color:"#f87171" },
  "chair / trustee":{ bg:"rgba(251,191,36,0.18)", color:"#fbbf24" },
  trustee:{ bg:"rgba(251,191,36,0.12)", color:"#fbbf24" },
  manager:{ bg:"rgba(99,91,255,0.15)", color:"#a78bfa" },
  "senior manager":{ bg:"rgba(99,91,255,0.18)", color:"#a78bfa" },
  deputy:{ bg:"rgba(167,139,250,0.12)", color:"#c4b5fd" },
  "deputy manager":{ bg:"rgba(167,139,250,0.12)", color:"#c4b5fd" },
  assistant:{ bg:"rgba(0,255,194,0.1)", color:"#00FFC2" },
  volunteer:{ bg:"rgba(148,163,184,0.1)", color:"#94a3b8" },
};

function getRoleColor(role: string) {
  const key = (role ?? "").toLowerCase();
  return ROLE_COLORS[key] ?? { bg:"rgba(255,255,255,0.06)", color:T.muted };
}

function getInitials(name: string) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0].toUpperCase();
  // Skip honorifics like Mr, Dr, Mrs
  const skip = ["mr","dr","mrs","ms","prof","sheikh","imam"];
  const meaningful = parts.filter(p => !skip.includes(p.toLowerCase()));
  if (meaningful.length >= 2) return (meaningful[0][0] + meaningful[1][0]).toUpperCase();
  return meaningful[0][0].toUpperCase();
}

function PersonCard({ person, isRoot = false }: { person: any; isRoot?: boolean }) {
  const rc = getRoleColor(person.role ?? "");
  const name = person.fullName ?? person.name ?? "Unknown";
  const email = person.email ?? "";
  const phone = person.phone ?? "";
  const role = person.role ?? "";

  return (
    <div style={{
      background: isRoot ? `linear-gradient(135deg,rgba(99,91,255,0.2),rgba(79,70,229,0.15))` : T.card,
      backdropFilter:"blur(20px)",
      border:`1px solid ${isRoot?"rgba(99,91,255,0.4)":T.border}`,
      borderRadius:16,
      padding:"18px 20px",
      minWidth:200,
      maxWidth:250,
      boxShadow: isRoot ? "0 0 30px rgba(99,91,255,0.2)" : "0 4px 16px rgba(0,0,0,0.3)",
      transition:"transform 0.2s,box-shadow 0.2s",
    }}
      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(-3px)";(e.currentTarget as HTMLElement).style.boxShadow="0 12px 32px rgba(0,0,0,0.4)";}}
      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(0)";(e.currentTarget as HTMLElement).style.boxShadow=isRoot?"0 0 30px rgba(99,91,255,0.2)":"0 4px 16px rgba(0,0,0,0.3)";}}
    >
      <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:12 }}>
        <div style={{
          width:44,height:44,borderRadius:"50%",
          background:`linear-gradient(135deg,${T.purple},#4f46e5)`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:15,fontWeight:800,color:T.white,flexShrink:0,
          border:isRoot?`2px solid ${T.mint}`:"none",
        }}>
          {getInitials(name)}
        </div>
        <div style={{ minWidth:0 }}>
          <p style={{ fontSize:13,fontWeight:700,color:T.white,margin:0,lineHeight:1.3 }}>{name}</p>
        </div>
      </div>

      <span style={{
        fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:999,
        background:rc.bg,color:rc.color,display:"inline-block",marginBottom:10,
      }}>
        {role || "Member"}
      </span>

      <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
        {email && (
          <div style={{ display:"flex",alignItems:"center",gap:6 }}>
            <Mail size={11} style={{color:T.muted,flexShrink:0}}/>
            <a href={`mailto:${email}`} style={{ fontSize:11,color:T.muted,textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{email}</a>
          </div>
        )}
        {phone && (
          <div style={{ display:"flex",alignItems:"center",gap:6 }}>
            <Phone size={11} style={{color:T.muted,flexShrink:0}}/>
            <span style={{ fontSize:11,color:T.muted }}>{phone}</span>
            <a
              href={`https://wa.me/44${phone.replace(/^0/,"").replace(/\s/g,"")}`}
              target="_blank" rel="noreferrer"
              style={{ marginLeft:"auto",fontSize:10,padding:"2px 7px",borderRadius:6,background:"rgba(37,211,102,0.12)",color:"#25d366",fontWeight:600,textDecoration:"none",flexShrink:0 }}
            >WA</a>
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectorLine({ horizontal = false }: { horizontal?: boolean }) {
  return horizontal
    ? <div style={{ height:2,background:`linear-gradient(90deg,transparent,rgba(99,91,255,0.4),transparent)`,width:40,flexShrink:0 }}/>
    : <div style={{ width:2,background:`linear-gradient(180deg,rgba(99,91,255,0.4),rgba(99,91,255,0.1))`,height:32,margin:"0 auto" }}/>;
}

export default function OrgChartPage() {
  const { data: usersData } = trpc.users.list.useQuery({});
  const { data: trusteesData } = trpc.trustees.list.useQuery();

  const users: any[] = usersData?.rows ?? [];
  const allTrustees: any[] = Array.isArray(trusteesData) ? trusteesData : [];

  // Superadmins from users table
  const superadmins = users.filter((u: any) => u.role === "superadmin" || u.role === "admin");

  // Board of Trustees: Chair + Trustees from trustees table
  const boardTrustees = allTrustees.filter((t: any) => {
    const r = (t.role ?? "").toLowerCase();
    return r.includes("trustee") || r.includes("chair");
  });

  // Senior Managers from trustees table
  const seniorManagers = allTrustees.filter((t: any) => {
    const r = (t.role ?? "").toLowerCase();
    return r.includes("senior manager");
  });

  // Also pull managers from users table (system users)
  const userManagers = users.filter((u: any) => u.role === "manager");

  // Deputies from trustees table
  const deputies = allTrustees.filter((t: any) => {
    const r = (t.role ?? "").toLowerCase();
    return r.includes("deputy");
  });

  // Also pull deputies from users table
  const userDeputies = users.filter((u: any) => u.role === "deputy");

  const assistants = users.filter((u: any) => u.role === "assistant");
  const volunteers = users.filter((u: any) => u.role === "volunteer");

  // Combine and deduplicate managers/deputies (prefer trustees table entries which have phone)
  const allManagers = [
    ...seniorManagers,
    ...userManagers.filter((u: any) => !seniorManagers.some((m: any) => m.email === u.email)),
  ];
  const allDeputies = [
    ...deputies,
    ...userDeputies.filter((u: any) => !deputies.some((d: any) => d.email === u.email)),
  ];

  const totalContacts = boardTrustees.length + allManagers.length + allDeputies.length + assistants.length;

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:24,fontFamily:"'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ marginBottom:28,animation:"fadeUp 0.4s ease both" }}>
          <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
            Organisation <span style={{ color:T.mint }}>Chart</span>
          </h1>
          <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>Abdullah Quilliam Society — reporting structure</p>
        </div>

        {/* Stats */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:14,marginBottom:32 }}>
          {[
            { label:"Leadership", value:superadmins.length, color:"#f87171" },
            { label:"Trustees", value:boardTrustees.length, color:"#fbbf24" },
            { label:"Managers", value:allManagers.length, color:T.purple },
            { label:"Deputies", value:allDeputies.length, color:"#a78bfa" },
            { label:"Volunteers", value:volunteers.length, color:"#94a3b8" },
          ].map((s,i)=>(
            <div key={s.label} style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px 16px",animation:`fadeUp 0.5s ease ${i*60}ms both` }}>
              <p style={{ fontSize:22,fontWeight:800,color:s.color,margin:0 }}>{s.value}</p>
              <p style={{ fontSize:11,color:T.muted,margin:0 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Org tree */}
        <div style={{ overflowX:"auto",paddingBottom:20 }}>
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",minWidth:700 }}>

            {/* Level 1: Superadmin */}
            {superadmins.length > 0 && (
              <>
                <div style={{ display:"flex",gap:16,justifyContent:"center",animation:"fadeUp 0.5s ease 200ms both" }}>
                  {superadmins.map((p: any) => <PersonCard key={p.id} person={p} isRoot/>)}
                </div>
                <ConnectorLine/>
              </>
            )}

            {/* Level 2: Trustees + Managers side by side */}
            <div style={{ display:"flex",alignItems:"flex-start",gap:48,animation:"fadeUp 0.5s ease 300ms both",position:"relative" }}>
              <div style={{ position:"absolute",top:0,left:"15%",right:"15%",height:2,background:"linear-gradient(90deg,transparent,rgba(99,91,255,0.3),transparent)" }}/>

              {/* Board of Trustees */}
              {boardTrustees.length > 0 && (
                <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:0 }}>
                  <div style={{ fontSize:10,fontWeight:700,color:"#fbbf24",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12,marginTop:2 }}>Board of Trustees</div>
                  <div style={{ display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center" }}>
                    {boardTrustees.map((p: any) => <PersonCard key={p.id} person={p}/>)}
                  </div>
                </div>
              )}

              {/* Management */}
              {allManagers.length > 0 && (
                <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:0 }}>
                  <div style={{ fontSize:10,fontWeight:700,color:"#a78bfa",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12,marginTop:2 }}>Management</div>
                  <div style={{ display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center" }}>
                    {allManagers.map((p: any) => <PersonCard key={p.id} person={p}/>)}
                  </div>
                </div>
              )}
            </div>

            {allDeputies.length > 0 && (
              <>
                <ConnectorLine/>
                <div style={{ display:"flex",flexDirection:"column",alignItems:"center",animation:"fadeUp 0.5s ease 400ms both" }}>
                  <div style={{ fontSize:10,fontWeight:700,color:"#c4b5fd",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12 }}>Deputies</div>
                  <div style={{ display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center" }}>
                    {allDeputies.map((p: any) => <PersonCard key={p.id} person={p}/>)}
                  </div>
                </div>
              </>
            )}

            {assistants.length > 0 && (
              <>
                <ConnectorLine/>
                <div style={{ display:"flex",flexDirection:"column",alignItems:"center",animation:"fadeUp 0.5s ease 480ms both" }}>
                  <div style={{ fontSize:10,fontWeight:700,color:T.mint,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12 }}>Assistants</div>
                  <div style={{ display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center" }}>
                    {assistants.map((p: any) => <PersonCard key={p.id} person={p}/>)}
                  </div>
                </div>
              </>
            )}

            {volunteers.length > 0 && (
              <>
                <ConnectorLine/>
                <div style={{ display:"flex",flexDirection:"column",alignItems:"center",animation:"fadeUp 0.5s ease 560ms both" }}>
                  <div style={{ fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12 }}>Volunteers</div>
                  <div style={{ display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center" }}>
                    {volunteers.map((p: any) => <PersonCard key={p.id} person={p}/>)}
                  </div>
                </div>
              </>
            )}

            {totalContacts === 0 && superadmins.length === 0 && (
              <div style={{ textAlign:"center",padding:60,color:T.muted,background:T.card,borderRadius:16,border:`1px solid ${T.border}` }}>
                <Shield size={36} style={{ opacity:0.3,marginBottom:12 }}/>
                <p>No organisation data yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginTop:32,background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:"16px 20px",display:"flex",gap:16,flexWrap:"wrap",animation:"fadeUp 0.5s ease 640ms both" }}>
          <span style={{ fontSize:12,color:T.muted,fontWeight:600 }}>Role key:</span>
          {[
            { role:"Superadmin", color:"#f87171" },
            { role:"Chair / Trustee", color:"#fbbf24" },
            { role:"Trustee", color:"#fbbf24" },
            { role:"Senior Manager", color:"#a78bfa" },
            { role:"Deputy Manager", color:"#c4b5fd" },
            { role:"Assistant", color:"#00FFC2" },
            { role:"Volunteer", color:"#94a3b8" },
          ].map(({role,color})=>(
            <div key={role} style={{ display:"flex",alignItems:"center",gap:6 }}>
              <span style={{ width:8,height:8,borderRadius:"50%",background:color }}/>
              <span style={{ fontSize:12,color:T.muted }}>{role}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
