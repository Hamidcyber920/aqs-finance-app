import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { GitBranch, Mail, Phone, Shield, Users } from "lucide-react";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

const ROLE_COLORS: Record<string,{bg:string;color:string}> = {
  superadmin:{ bg:"rgba(248,113,113,0.12)", color:"#f87171" },
  trustee:{ bg:"rgba(251,191,36,0.12)", color:"#fbbf24" },
  manager:{ bg:"rgba(99,91,255,0.15)", color:"#a78bfa" },
  deputy:{ bg:"rgba(167,139,250,0.12)", color:"#c4b5fd" },
  assistant:{ bg:"rgba(0,255,194,0.1)", color:"#00FFC2" },
  volunteer:{ bg:"rgba(148,163,184,0.1)", color:"#94a3b8" },
};

function PersonCard({ person, isRoot = false }: { person: any; isRoot?: boolean }) {
  const rc = ROLE_COLORS[person.role] ?? { bg:"rgba(255,255,255,0.06)", color:T.muted };
  return (
    <div style={{
      background: isRoot ? `linear-gradient(135deg,rgba(99,91,255,0.2),rgba(79,70,229,0.15))` : T.card,
      backdropFilter:"blur(20px)",
      border:`1px solid ${isRoot?"rgba(99,91,255,0.4)":T.border}`,
      borderRadius:16,
      padding:"18px 20px",
      minWidth:200,
      maxWidth:240,
      boxShadow: isRoot ? "0 0 30px rgba(99,91,255,0.2)" : "0 4px 16px rgba(0,0,0,0.3)",
      transition:"transform 0.2s,box-shadow 0.2s",
      cursor:"default",
    }}
      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(-3px)";(e.currentTarget as HTMLElement).style.boxShadow="0 12px 32px rgba(0,0,0,0.4)";}}
      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(0)";(e.currentTarget as HTMLElement).style.boxShadow=isRoot?"0 0 30px rgba(99,91,255,0.2)":"0 4px 16px rgba(0,0,0,0.3)";}}
    >
      <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:12 }}>
        <div style={{ width:44,height:44,borderRadius:"50%",background:`linear-gradient(135deg,${T.purple},#4f46e5)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:800,color:T.white,flexShrink:0,border:isRoot?`2px solid ${T.mint}`:"none" }}>
          {(person.name??"?")[0].toUpperCase()}
        </div>
        <div style={{ minWidth:0 }}>
          <p style={{ fontSize:13,fontWeight:700,color:T.white,margin:0,lineHeight:1.2 }}>{person.name}</p>
          {person.isPropertyManager && (
            <span style={{ fontSize:9,fontWeight:700,color:T.mint,background:"rgba(0,255,194,0.1)",padding:"1px 6px",borderRadius:999,display:"inline-block",marginTop:2 }}>PROPERTY MGR</span>
          )}
        </div>
      </div>
      <span style={{ fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:999,background:rc.bg,color:rc.color,textTransform:"capitalize",display:"inline-block" }}>
        {person.role}
      </span>
      {person.email && (
        <div style={{ display:"flex",alignItems:"center",gap:6,marginTop:10 }}>
          <Mail size={11} style={{color:T.muted,flexShrink:0}}/>
          <span style={{ fontSize:11,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{person.email}</span>
        </div>
      )}
    </div>
  );
}

function ConnectorLine({ horizontal = false }: { horizontal?: boolean }) {
  return horizontal
    ? <div style={{ height:2,background:`linear-gradient(90deg,transparent,rgba(99,91,255,0.4),transparent)`,width:40,flexShrink:0 }}/>
    : <div style={{ width:2,background:`linear-gradient(180deg,rgba(99,91,255,0.4),rgba(99,91,255,0.1))`,height:32,margin:"0 auto" }}/>;
}

export default function OrgChartPage() {
  const { data } = trpc.users.list.useQuery({});
  const { data: trusteesData } = trpc.trustees.list.useQuery();

  const users: any[] = data?.rows ?? [];
  const trustees: any[] = Array.isArray(trusteesData) ? trusteesData : [];

  const superadmins = users.filter((u: any) => u.role === "superadmin" || u.role === "admin");
  const mgrs = users.filter((u: any) => u.role === "manager");
  const deputies = users.filter((u: any) => u.role === "deputy");
  const assistants = users.filter((u: any) => u.role === "assistant");
  const volunteers = users.filter((u: any) => u.role === "volunteer");

  // Mock fallback for empty data
  const mockOrg = {
    superadmins: superadmins.length > 0 ? superadmins : [{ id:1,name:"Hamid (Owner)",role:"superadmin",email:"ahamid4@gmail.com" }],
    trustees: trustees.length > 0 ? trustees.map((t:any)=>({...t,role:"trustee"})) : [{ id:2,name:"Trustee A",role:"trustee" },{ id:3,name:"Trustee B",role:"trustee" }],
    managers: mgrs.length > 0 ? mgrs : [{ id:4,name:"Mumin Khan",role:"manager",email:"mumin@aqs.org" }],
    deputies: deputies.length > 0 ? deputies : [{ id:5,name:"Farid Ahmed",role:"deputy",email:"farid@aqs.org",isPropertyManager:true }],
    assistants: assistants.length > 0 ? assistants : [],
    volunteers: volunteers.length > 0 ? volunteers : [],
  };

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
            { label:"Leadership", value:mockOrg.superadmins.length, color:"#f87171" },
            { label:"Trustees", value:mockOrg.trustees.length, color:"#fbbf24" },
            { label:"Managers", value:mockOrg.managers.length, color:T.purple },
            { label:"Deputies", value:mockOrg.deputies.length, color:"#a78bfa" },
            { label:"Volunteers", value:mockOrg.volunteers.length, color:"#94a3b8" },
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
            <div style={{ display:"flex",gap:16,justifyContent:"center",animation:"fadeUp 0.5s ease 200ms both" }}>
              {mockOrg.superadmins.map((p: any) => <PersonCard key={p.id} person={p} isRoot/>)}
            </div>

            <ConnectorLine/>

            {/* Level 2: Trustees + Managers side by side */}
            <div style={{ display:"flex",alignItems:"flex-start",gap:48,animation:"fadeUp 0.5s ease 300ms both",position:"relative" }}>
              {/* Horizontal line across */}
              <div style={{ position:"absolute",top:0,left:"15%",right:"15%",height:2,background:"linear-gradient(90deg,transparent,rgba(99,91,255,0.3),transparent)" }}/>

              {/* Trustees column */}
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:0 }}>
                <div style={{ fontSize:10,fontWeight:700,color:"#fbbf24",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12,marginTop:2 }}>Board of Trustees</div>
                <div style={{ display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center" }}>
                  {mockOrg.trustees.map((p: any) => <PersonCard key={p.id} person={p}/>)}
                </div>
              </div>

              {/* Managers column */}
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:0 }}>
                <div style={{ fontSize:10,fontWeight:700,color:"#a78bfa",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12,marginTop:2 }}>Management</div>
                <div style={{ display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center" }}>
                  {mockOrg.managers.map((p: any) => <PersonCard key={p.id} person={p}/>)}
                </div>
              </div>
            </div>

            {mockOrg.deputies.length > 0 && (
              <>
                <ConnectorLine/>
                <div style={{ display:"flex",flexDirection:"column",alignItems:"center",animation:"fadeUp 0.5s ease 400ms both" }}>
                  <div style={{ fontSize:10,fontWeight:700,color:"#c4b5fd",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12 }}>Deputies</div>
                  <div style={{ display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center" }}>
                    {mockOrg.deputies.map((p: any) => <PersonCard key={p.id} person={p}/>)}
                  </div>
                </div>
              </>
            )}

            {mockOrg.assistants.length > 0 && (
              <>
                <ConnectorLine/>
                <div style={{ display:"flex",flexDirection:"column",alignItems:"center",animation:"fadeUp 0.5s ease 480ms both" }}>
                  <div style={{ fontSize:10,fontWeight:700,color:T.mint,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12 }}>Assistants</div>
                  <div style={{ display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center" }}>
                    {mockOrg.assistants.map((p: any) => <PersonCard key={p.id} person={p}/>)}
                  </div>
                </div>
              </>
            )}

            {mockOrg.volunteers.length > 0 && (
              <>
                <ConnectorLine/>
                <div style={{ display:"flex",flexDirection:"column",alignItems:"center",animation:"fadeUp 0.5s ease 560ms both" }}>
                  <div style={{ fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12 }}>Volunteers</div>
                  <div style={{ display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center" }}>
                    {mockOrg.volunteers.map((p: any) => <PersonCard key={p.id} person={p}/>)}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginTop:32,background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:"16px 20px",display:"flex",gap:16,flexWrap:"wrap",animation:"fadeUp 0.5s ease 640ms both" }}>
          <span style={{ fontSize:12,color:T.muted,fontWeight:600 }}>Role key:</span>
          {Object.entries(ROLE_COLORS).map(([role,{color}])=>(
            <div key={role} style={{ display:"flex",alignItems:"center",gap:6 }}>
              <span style={{ width:8,height:8,borderRadius:"50%",background:color }}/>
              <span style={{ fontSize:12,color:T.muted,textTransform:"capitalize" }}>{role}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
