import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Mail, Phone, Pencil, ChevronDown, ChevronUp, Check, X } from "lucide-react";
import { toast } from "sonner";

const T = {
  navy:"#0A192F", purple:"#635BFF", mint:"#00FFC2", white:"#FFFFFF",
  muted:"rgba(255,255,255,0.5)", border:"rgba(255,255,255,0.08)",
  card:"rgba(13,34,64,0.8)",
};

function getRoleColor(role: string) {
  const r = (role ?? "").toLowerCase();
  if (r.includes("chair")) return { bg:"rgba(251,191,36,0.18)", color:"#fbbf24" };
  if (r.includes("trustee")) return { bg:"rgba(251,191,36,0.12)", color:"#fbbf24" };
  if (r.includes("senior")) return { bg:"rgba(99,91,255,0.18)", color:"#a78bfa" };
  if (r.includes("manager")) return { bg:"rgba(99,91,255,0.15)", color:"#a78bfa" };
  if (r.includes("deputy")) return { bg:"rgba(167,139,250,0.12)", color:"#c4b5fd" };
  if (r.includes("superadmin") || r.includes("admin")) return { bg:"rgba(248,113,113,0.12)", color:"#f87171" };
  return { bg:"rgba(255,255,255,0.06)", color:T.muted };
}

function getInitials(name: string) {
  if (!name) return "?";
  const skip = ["mr","dr","mrs","ms","prof","sheikh","imam"];
  const parts = name.trim().split(" ").filter(p => !skip.includes(p.toLowerCase()));
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function formatPhone(phone: string) {
  if (!phone) return "";
  // Format as 07xxx xxx xxx for display
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("07")) {
    return `${digits.slice(0,5)} ${digits.slice(5,8)} ${digits.slice(8)}`;
  }
  return phone;
}

function PersonCard({ person, isRoot = false, onSaved }: { person: any; isRoot?: boolean; onSaved: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: person.fullName ?? person.name ?? "", email: person.email ?? "", phone: person.phone ?? "", role: person.role ?? "", notes: person.notes ?? "" });

  const updateMutation = trpc.trustees.update.useMutation({
    onSuccess: () => { toast.success("Contact updated"); setEditing(false); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const rc = getRoleColor(person.role ?? "");
  const name = person.fullName ?? person.name ?? "Unknown";
  const email = person.email ?? "";
  const phone = person.phone ?? "";
  const role = person.role ?? "";
  const notes = person.notes ?? "";
  const isTrusteeRecord = !!person.fullName; // trustees table has fullName; users table has name

  const waLink = phone
    ? `https://wa.me/44${phone.replace(/^0/, "").replace(/\s/g, "")}`
    : null;
  const telLink = phone
    ? `tel:${phone.replace(/\s/g, "")}`
    : null;

  return (
    <div style={{
      background: isRoot ? `linear-gradient(135deg,rgba(99,91,255,0.2),rgba(79,70,229,0.15))` : T.card,
      backdropFilter:"blur(20px)",
      border:`1px solid ${isRoot?"rgba(99,91,255,0.4)":T.border}`,
      borderRadius:16,
      padding:"18px 20px",
      width:"100%",
      maxWidth: isRoot ? 280 : "100%",
      boxShadow: isRoot ? "0 0 30px rgba(99,91,255,0.2)" : "0 4px 16px rgba(0,0,0,0.3)",
      transition:"box-shadow 0.2s",
    }}>
      {/* Header row */}
      <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:12 }}>
        <div style={{
          width:48,height:48,borderRadius:"50%",flexShrink:0,
          background:`linear-gradient(135deg,${T.purple},#4f46e5)`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:16,fontWeight:800,color:T.white,
          border:isRoot?`2px solid ${T.mint}`:"none",
        }}>
          {getInitials(name)}
        </div>
        <div style={{ flex:1,minWidth:0 }}>
          <p style={{ fontSize:14,fontWeight:700,color:T.white,margin:0,lineHeight:1.3 }}>{name}</p>
          <span style={{
            fontSize:11,fontWeight:700,padding:"2px 9px",borderRadius:999,
            background:rc.bg,color:rc.color,display:"inline-block",marginTop:3,
          }}>
            {role || "Member"}
          </span>
        </div>
        <div style={{ display:"flex",gap:6,flexShrink:0 }}>
          {isTrusteeRecord && (
            <button
              onClick={() => { setEditing(!editing); setExpanded(true); setForm({ fullName:name,email,phone,role,notes }); }}
              style={{ width:30,height:30,borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}
              title="Edit contact"
            >
              <Pencil size={12}/>
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ width:30,height:30,borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}
            title={expanded?"Collapse":"Expand"}
          >
            {expanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
          </button>
        </div>
      </div>

      {/* Collapsed: show email + phone inline */}
      {!expanded && (
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
              <a href={telLink!} style={{ fontSize:11,color:T.muted,textDecoration:"none" }}>{formatPhone(phone)}</a>
              {waLink && (
                <a href={waLink} target="_blank" rel="noreferrer"
                  style={{ marginLeft:"auto",fontSize:10,padding:"2px 7px",borderRadius:6,background:"rgba(37,211,102,0.12)",color:"#25d366",fontWeight:600,textDecoration:"none",flexShrink:0 }}>
                  WA
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Expanded view */}
      {expanded && !editing && (
        <div style={{ display:"flex",flexDirection:"column",gap:10,marginTop:4 }}>
          {email && (
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              <Mail size={13} style={{color:T.muted,flexShrink:0}}/>
              <a href={`mailto:${email}`} style={{ fontSize:13,color:"#60a5fa",textDecoration:"none" }}>{email}</a>
            </div>
          )}
          {phone && (
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              <Phone size={13} style={{color:T.muted,flexShrink:0}}/>
              <a href={telLink!} style={{ fontSize:13,color:T.mint,textDecoration:"none",fontWeight:600 }}>{formatPhone(phone)}</a>
              {waLink && (
                <a href={waLink} target="_blank" rel="noreferrer"
                  style={{ marginLeft:"auto",fontSize:11,padding:"3px 10px",borderRadius:6,background:"rgba(37,211,102,0.15)",color:"#25d366",fontWeight:700,textDecoration:"none",flexShrink:0 }}>
                  WhatsApp
                </a>
              )}
            </div>
          )}
          {notes && notes !== "NULL" && (
            <p style={{ fontSize:12,color:T.muted,margin:0,fontStyle:"italic",paddingTop:4,borderTop:`1px solid ${T.border}` }}>{notes}</p>
          )}
        </div>
      )}

      {/* Edit form */}
      {expanded && editing && (
        <div style={{ display:"flex",flexDirection:"column",gap:10,marginTop:8 }}>
          {[
            { label:"Full Name", key:"fullName", type:"text" },
            { label:"Role / Title", key:"role", type:"text" },
            { label:"Email", key:"email", type:"email" },
            { label:"Phone", key:"phone", type:"tel" },
            { label:"Notes", key:"notes", type:"text" },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label style={{ fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:3 }}>{label}</label>
              <input
                type={type}
                value={(form as any)[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={{ width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:8,color:T.white,padding:"8px 10px",fontSize:13,boxSizing:"border-box" }}
              />
            </div>
          ))}
          <div style={{ display:"flex",gap:8,marginTop:4 }}>
            <button
              onClick={() => updateMutation.mutate({ id: person.id, ...form })}
              disabled={updateMutation.isPending}
              style={{ flex:1,padding:"9px 0",borderRadius:10,background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",fontWeight:700,border:"none",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}
            >
              <Check size={13}/> {updateMutation.isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              style={{ flex:1,padding:"9px 0",borderRadius:10,background:"rgba(255,255,255,0.06)",color:T.muted,fontWeight:700,border:`1px solid ${T.border}`,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}
            >
              <X size={13}/> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectorLine() {
  return <div style={{ width:2,background:`linear-gradient(180deg,rgba(99,91,255,0.4),rgba(99,91,255,0.1))`,height:28,margin:"0 auto" }}/>;
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ fontSize:10,fontWeight:700,color,textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:12,marginTop:2,textAlign:"center" }}>
      {label}
    </div>
  );
}

export default function OrgChartPage() {
  const { data: usersData } = trpc.users.list.useQuery({});
  const { data: trusteesData, refetch } = trpc.trustees.list.useQuery();

  const users: any[] = usersData?.rows ?? [];
  const allTrustees: any[] = Array.isArray(trusteesData) ? trusteesData : [];

  // Superadmins from users table (system login accounts)
  const superadmins = users.filter((u: any) => u.role === "superadmin" || u.role === "admin");

  // Board of Trustees: from trustees table only
  const boardTrustees = allTrustees.filter((t: any) => {
    const r = (t.role ?? "").toLowerCase();
    return r.includes("trustee") || r.includes("chair");
  });

  // Management: Senior Managers from trustees table only
  const management = allTrustees.filter((t: any) => {
    const r = (t.role ?? "").toLowerCase();
    return r.includes("manager") && !r.includes("deputy");
  });

  // Deputies: from trustees table only
  const deputies = allTrustees.filter((t: any) => {
    const r = (t.role ?? "").toLowerCase();
    return r.includes("deputy");
  });

  return (
    <>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        input:focus{outline:none;border-color:rgba(99,91,255,0.6) !important;}
      `}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:"20px 16px",fontFamily:"'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ marginBottom:24,animation:"fadeUp 0.4s ease both" }}>
          <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
            Organisation <span style={{ color:T.mint }}>Chart</span>
          </h1>
          <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>Abdullah Quilliam Society — tap any card to expand, press ✏️ to edit</p>
        </div>

        {/* Stats */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:12,marginBottom:28 }}>
          {[
            { label:"Leadership", value:superadmins.length, color:"#f87171" },
            { label:"Trustees", value:boardTrustees.length, color:"#fbbf24" },
            { label:"Managers", value:management.length, color:T.purple },
            { label:"Deputies", value:deputies.length, color:"#a78bfa" },
          ].map((s,i)=>(
            <div key={s.label} style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px",animation:`fadeUp 0.5s ease ${i*60}ms both` }}>
              <p style={{ fontSize:20,fontWeight:800,color:s.color,margin:0 }}>{s.value}</p>
              <p style={{ fontSize:11,color:T.muted,margin:0 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Org tree — full width, vertical flow */}
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:0,width:"100%" }}>

          {/* Level 1: Superadmin */}
          {superadmins.length > 0 && (
            <div style={{ width:"100%",maxWidth:320,animation:"fadeUp 0.5s ease 200ms both" }}>
              {superadmins.map((p: any) => (
                <PersonCard key={p.id} person={p} isRoot onSaved={refetch}/>
              ))}
            </div>
          )}

          {superadmins.length > 0 && <ConnectorLine/>}

          {/* Level 2: Board of Trustees */}
          {boardTrustees.length > 0 && (
            <div style={{ width:"100%",animation:"fadeUp 0.5s ease 300ms both" }}>
              <SectionLabel label="Board of Trustees" color="#fbbf24"/>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12 }}>
                {boardTrustees.map((p: any) => (
                  <PersonCard key={p.id} person={p} onSaved={refetch}/>
                ))}
              </div>
            </div>
          )}

          {boardTrustees.length > 0 && management.length > 0 && <ConnectorLine/>}

          {/* Level 3: Management */}
          {management.length > 0 && (
            <div style={{ width:"100%",animation:"fadeUp 0.5s ease 380ms both" }}>
              <SectionLabel label="Management" color="#a78bfa"/>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12 }}>
                {management.map((p: any) => (
                  <PersonCard key={p.id} person={p} onSaved={refetch}/>
                ))}
              </div>
            </div>
          )}

          {management.length > 0 && deputies.length > 0 && <ConnectorLine/>}

          {/* Level 4: Deputies */}
          {deputies.length > 0 && (
            <div style={{ width:"100%",animation:"fadeUp 0.5s ease 460ms both" }}>
              <SectionLabel label="Deputies" color="#c4b5fd"/>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12 }}>
                {deputies.map((p: any) => (
                  <PersonCard key={p.id} person={p} onSaved={refetch}/>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ marginTop:32,background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px 18px",display:"flex",gap:14,flexWrap:"wrap",animation:"fadeUp 0.5s ease 560ms both" }}>
          <span style={{ fontSize:12,color:T.muted,fontWeight:600 }}>Role key:</span>
          {[
            { label:"Superadmin", color:"#f87171" },
            { label:"Chair / Trustee", color:"#fbbf24" },
            { label:"Senior Manager", color:"#a78bfa" },
            { label:"Deputy Manager", color:"#c4b5fd" },
          ].map(({label,color})=>(
            <div key={label} style={{ display:"flex",alignItems:"center",gap:6 }}>
              <span style={{ width:8,height:8,borderRadius:"50%",background:color,flexShrink:0 }}/>
              <span style={{ fontSize:12,color:T.muted }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
