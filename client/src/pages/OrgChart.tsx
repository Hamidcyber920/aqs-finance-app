import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Mail, Phone, Pencil, ChevronDown, ChevronUp, Check, X, MapPin, Heart, Cake } from "lucide-react";
import { SmartUpload } from "@/components/SmartUpload";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";

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
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("07")) {
    return `${digits.slice(0,5)} ${digits.slice(5,8)} ${digits.slice(8)}`;
  }
  return phone;
}

/** Returns age in years from a date string like "1970-05-15" */
function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

/** Returns days until next birthday (0 = today) */
function daysUntilBirthday(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (thisYear < now) thisYear.setFullYear(now.getFullYear() + 1);
  const diff = Math.round((thisYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function BirthdayBadge({ dob }: { dob: string | null | undefined }) {
  const days = daysUntilBirthday(dob);
  if (days === null) return null;
  if (days > 30) return null; // only show within 30 days

  const isToday = days === 0;
  const bg = isToday ? "rgba(251,191,36,0.25)" : "rgba(251,191,36,0.12)";
  const color = "#fbbf24";
  const text = isToday ? "🎂 Birthday Today!" : `🎂 Birthday in ${days} day${days === 1 ? "" : "s"}`;

  return (
    <div style={{ display:"flex",alignItems:"center",gap:6,background:bg,border:`1px solid rgba(251,191,36,0.3)`,borderRadius:8,padding:"5px 10px",marginTop:8 }}>
      <span style={{ fontSize:12,fontWeight:700,color }}>{text}</span>
    </div>
  );
}

function PersonCard({ person, isRoot = false, onSaved }: { person: any; isRoot?: boolean; onSaved: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    fullName: person.fullName ?? person.name ?? "",
    email: person.email ?? "",
    phone: person.phone ?? "",
    role: person.role ?? "",
    notes: person.notes ?? "",
    dateOfBirth: person.dateOfBirth ?? "",
    addressLine1: person.addressLine1 ?? "",
    addressLine2: person.addressLine2 ?? "",
    city: person.city ?? "",
    postcode: person.postcode ?? "",
    nokName: person.nokName ?? "",
    nokPhone: person.nokPhone ?? "",
    nokEmail: person.nokEmail ?? "",
    nokRelationship: person.nokRelationship ?? "",
  });

  const updateMutation = trpc.trustees.update.useMutation({
    onSuccess: () => { toast.success("Contact updated"); setEditing(false); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const rc = getRoleColor(person.role ?? "");
  const name = person.fullName ?? person.name ?? "Unknown";
  const email = person.email ?? "";
  const phone = person.phone ?? "";
  const role = person.role ?? "";
  const dob = person.dateOfBirth ?? null;
  const age = calcAge(dob);
  const isTrusteeRecord = !!person.fullName;
  const { canEdit } = usePermissions();

  const waLink = phone ? `https://wa.me/44${phone.replace(/^0/, "").replace(/\s/g, "")}` : null;
  const telLink = phone ? `tel:${phone.replace(/\s/g, "")}` : null;

  const hasAddress = person.addressLine1 || person.city || person.postcode;
  const hasNok = person.nokName;

  const inputStyle: React.CSSProperties = {
    width:"100%",
    background:"rgba(255,255,255,0.06)",
    border:`1px solid ${T.border}`,
    borderRadius:8,
    color:T.white,
    padding:"8px 10px",
    fontSize:13,
    boxSizing:"border-box",
  };

  return (
    <div style={{
      background: isRoot ? `linear-gradient(135deg,rgba(99,91,255,0.2),rgba(79,70,229,0.15))` : T.card,
      backdropFilter:"blur(20px)",
      border:`1px solid ${isRoot?"rgba(99,91,255,0.4)":T.border}`,
      borderRadius:16,
      padding:"18px 20px",
      width:"100%",
      boxShadow: isRoot ? "0 0 30px rgba(99,91,255,0.2)" : "0 4px 16px rgba(0,0,0,0.3)",
    }}>

      {/* ── Card header ── */}
      <div
        onClick={()=>setExpanded(v=>!v)}
        style={{ display:"flex",alignItems:"center",gap:12,marginBottom:10,cursor:"pointer",userSelect:"none" }}
      >
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
          <span style={{ fontSize:11,fontWeight:700,padding:"2px 9px",borderRadius:999,background:rc.bg,color:rc.color,display:"inline-block",marginTop:3 }}>
            {role || "Member"}
          </span>
          {dob && age !== null && (
            <p style={{ fontSize:11,color:T.muted,margin:"3px 0 0" }}>Age {age}</p>
          )}
        </div>
        <div style={{ display:"flex",gap:6,flexShrink:0 }}>
          {isTrusteeRecord && canEdit && (
            <button onClick={e=>{ e.stopPropagation(); setEditing(!editing); setExpanded(true); setForm({ fullName:name,email,phone,role,notes:person.notes??"",dateOfBirth:dob??"",addressLine1:person.addressLine1??"",addressLine2:person.addressLine2??"",city:person.city??"",postcode:person.postcode??"",nokName:person.nokName??"",nokPhone:person.nokPhone??"",nokEmail:person.nokEmail??"",nokRelationship:person.nokRelationship??"" }); }}
              style={{ width:30,height:30,borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }} title="Edit contact">
              <Pencil size={12}/>
            </button>
          )}
          <button onClick={e=>{ e.stopPropagation(); setExpanded(v=>!v); }}
            style={{ width:30,height:30,borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }} title={expanded?"Collapse":"Expand"}>
            {expanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
          </button>
        </div>
      </div>

      {/* ── Birthday badge (always visible if within 30 days) ── */}
      <BirthdayBadge dob={dob}/>

      {/* ── Collapsed: email + phone ── */}
      {!expanded && (
        <div style={{ display:"flex",flexDirection:"column",gap:6,marginTop:8 }}>
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
                  style={{ marginLeft:"auto",fontSize:10,padding:"2px 7px",borderRadius:6,background:"rgba(37,211,102,0.12)",color:"#25d366",fontWeight:600,textDecoration:"none",flexShrink:0 }}>WA</a>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Expanded: full details ── */}
      {expanded && !editing && (
        <div style={{ display:"flex",flexDirection:"column",gap:12,marginTop:10 }}>
          <div style={{ height:1,background:T.border }}/>

          {/* Contact */}
          <div>
            <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 6px" }}>Contact</p>
            {email && (
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:6 }}>
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
                    style={{ marginLeft:"auto",fontSize:11,padding:"3px 10px",borderRadius:6,background:"rgba(37,211,102,0.15)",color:"#25d366",fontWeight:700,textDecoration:"none",flexShrink:0 }}>WhatsApp</a>
                )}
              </div>
            )}
          </div>

          {/* Date of birth */}
          {dob && (
            <div>
              <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 6px" }}>Date of Birth</p>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <Cake size={13} style={{color:T.muted,flexShrink:0}}/>
                <span style={{ fontSize:13,color:T.white }}>
                  {new Date(dob).toLocaleDateString("en-GB", { day:"numeric",month:"long",year:"numeric" })}
                  {age !== null && <span style={{ color:T.muted,marginLeft:8 }}>({age} years old)</span>}
                </span>
              </div>
            </div>
          )}

          {/* Address */}
          {hasAddress && (
            <div>
              <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 6px" }}>Address</p>
              <div style={{ display:"flex",alignItems:"flex-start",gap:8 }}>
                <MapPin size={13} style={{color:T.muted,flexShrink:0,marginTop:2}}/>
                <div>
                  {person.addressLine1 && <p style={{ fontSize:13,color:T.white,margin:0 }}>{person.addressLine1}</p>}
                  {person.addressLine2 && <p style={{ fontSize:13,color:T.white,margin:0 }}>{person.addressLine2}</p>}
                  {(person.city || person.postcode) && (
                    <p style={{ fontSize:13,color:T.white,margin:0 }}>
                      {[person.city, person.postcode].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Next of kin */}
          {hasNok && (
            <div>
              <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 6px" }}>Next of Kin</p>
              <div style={{ background:"rgba(255,255,255,0.04)",border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 12px" }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
                  <Heart size={13} style={{color:"#f87171",flexShrink:0}}/>
                  <span style={{ fontSize:13,fontWeight:600,color:T.white }}>{person.nokName}</span>
                  {person.nokRelationship && <span style={{ fontSize:11,color:T.muted }}>({person.nokRelationship})</span>}
                </div>
                {person.nokPhone && (
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginTop:6 }}>
                    <Phone size={11} style={{color:T.muted,flexShrink:0}}/>
                    <a href={`tel:${person.nokPhone.replace(/\s/g,"")}`} style={{ fontSize:12,color:T.mint,textDecoration:"none" }}>{formatPhone(person.nokPhone)}</a>
                  </div>
                )}
                {person.nokEmail && (
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginTop:4 }}>
                    <Mail size={11} style={{color:T.muted,flexShrink:0}}/>
                    <a href={`mailto:${person.nokEmail}`} style={{ fontSize:12,color:"#60a5fa",textDecoration:"none" }}>{person.nokEmail}</a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {person.notes && person.notes !== "NULL" && (
            <p style={{ fontSize:12,color:T.muted,margin:0,fontStyle:"italic",paddingTop:8,borderTop:`1px solid ${T.border}` }}>{person.notes}</p>
          )}
        </div>
      )}

      {/* ── Edit form ── */}
      {expanded && editing && (
        <div style={{ display:"flex",flexDirection:"column",gap:10,marginTop:10 }}>
          <div style={{ height:1,background:T.border }}/>

          <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:0 }}>Personal Details</p>
          {[
            { label:"Full Name", key:"fullName", type:"text" },
            { label:"Title / Role", key:"role", type:"text" },
            { label:"Date of Birth", key:"dateOfBirth", type:"date" },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label style={{ fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:3 }}>{label}</label>
              <input type={type} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inputStyle}/>
            </div>
          ))}

          <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"6px 0 0" }}>Contact</p>
          {[
            { label:"Email", key:"email", type:"email" },
            { label:"Phone", key:"phone", type:"tel" },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label style={{ fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:3 }}>{label}</label>
              <input type={type} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inputStyle}/>
            </div>
          ))}

          <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"6px 0 0" }}>Address</p>
          {[
            { label:"Address Line 1", key:"addressLine1", type:"text" },
            { label:"Address Line 2", key:"addressLine2", type:"text" },
            { label:"City / Town", key:"city", type:"text" },
            { label:"Postcode", key:"postcode", type:"text" },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label style={{ fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:3 }}>{label}</label>
              <input type={type} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inputStyle}/>
            </div>
          ))}

          <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"6px 0 0" }}>Next of Kin</p>
          {[
            { label:"Full Name", key:"nokName", type:"text" },
            { label:"Relationship (e.g. Spouse, Son)", key:"nokRelationship", type:"text" },
            { label:"Phone", key:"nokPhone", type:"tel" },
            { label:"Email", key:"nokEmail", type:"email" },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label style={{ fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:3 }}>{label}</label>
              <input type={type} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inputStyle}/>
            </div>
          ))}

          <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"6px 0 0" }}>Notes</p>
          <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inputStyle}/>

          <div style={{ display:"flex",gap:8,marginTop:6 }}>
            <button
              onClick={() => updateMutation.mutate({ id: person.id, ...form, dateOfBirth: form.dateOfBirth || null })}
              disabled={updateMutation.isPending}
              style={{ flex:1,padding:"10px 0",borderRadius:10,background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",fontWeight:700,border:"none",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
              <Check size={13}/> {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </button>
            <button
              onClick={() => setEditing(false)}
              style={{ flex:1,padding:"10px 0",borderRadius:10,background:"rgba(255,255,255,0.06)",color:T.muted,fontWeight:700,border:`1px solid ${T.border}`,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
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
  return <div style={{ fontSize:10,fontWeight:700,color,textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:12,marginTop:2,textAlign:"center" }}>{label}</div>;
}

export default function OrgChartPage() {
  const { data: usersData } = trpc.users.list.useQuery({});
  const { data: trusteesData, refetch } = trpc.trustees.list.useQuery();
  const mergeMutation = trpc.trustees.mergeFromScan.useMutation({
    onSuccess: (res) => {
      refetch();
      toast.success(`Profile updated — ${res.updatedFields.length} field${res.updatedFields.length !== 1 ? 's' : ''} merged: ${res.updatedFields.join(', ')}`);
    },
    onError: (e) => toast.error(`Merge failed: ${e.message}`),
  });

  const users: any[] = usersData?.rows ?? [];
  const allTrustees: any[] = Array.isArray(trusteesData) ? trusteesData : [];

  const superadmins = users.filter((u: any) => u.role === "superadmin" || u.role === "admin");

  // DOB completeness check
  const activeTrustees = allTrustees.filter((t: any) => t.isActive !== false);
  const missingDob = activeTrustees.filter((t: any) => !t.dateOfBirth);

  const boardTrustees = allTrustees.filter((t: any) => {
    const r = (t.role ?? "").toLowerCase();
    return r.includes("trustee") || r.includes("chair");
  });

  const management = allTrustees.filter((t: any) => {
    const r = (t.role ?? "").toLowerCase();
    return r.includes("manager") && !r.includes("deputy");
  });

  const deputies = allTrustees.filter((t: any) => {
    const r = (t.role ?? "").toLowerCase();
    return r.includes("deputy");
  });

  return (
    <>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        input:focus{outline:none;border-color:rgba(99,91,255,0.6)!important;}
        input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(1);opacity:0.5;}
      `}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:"20px 16px",fontFamily:"'DM Sans',sans-serif" }}>

        <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12,animation:"fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
              Organisation <span style={{ color:T.mint }}>Chart</span>
            </h1>
            <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>Abdullah Quilliam Society — tap ▾ to expand, ✏️ to edit</p>
          </div>
          <SmartUpload
            moduleType="staff_profile"
            buttonLabel="Scan / Upload"
            buttonVariant="outline"
            onConfirm={(result) => {
              const d = result.extractedData as any;
              if (result.matchedProfile?.id) {
                mergeMutation.mutate({
                  id: result.matchedProfile.id,
                  fullName: d.fullName || d.name,
                  role: d.role,
                  email: d.email,
                  phone: d.phone,
                  dateOfBirth: d.dateOfBirth,
                  addressLine1: d.addressLine1,
                  addressLine2: d.addressLine2,
                  city: d.city,
                  postcode: d.postcode,
                  nokName: d.nokName,
                  nokPhone: d.nokPhone,
                  nokRelationship: d.nokRelationship,
                  notes: d.notes,
                });
              } else {
                toast.info(`AI extracted: ${d.name || d.fullName || 'staff member'}. Go to Trustees & Staff to add them.`);
              }
            }}
          />
        </div>

        {missingDob.length > 0 && (
          <div style={{ background:"rgba(251,191,36,0.08)",border:"1px solid rgba(251,191,36,0.3)",borderRadius:12,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"flex-start",gap:10 }}>
            <span style={{ fontSize:16,flexShrink:0 }}>⚠️</span>
            <div>
              <p style={{ fontSize:12,fontWeight:700,color:"#fbbf24",margin:"0 0 2px" }}>Birthday alerts missing for {missingDob.length} trustee{missingDob.length>1?"s":""}</p>
              <p style={{ fontSize:11,color:T.muted,margin:0 }}>
                {missingDob.map((t:any)=>t.fullName).join(", ")} — tap ✏️ on their card to add a date of birth.
              </p>
            </div>
          </div>
        )}

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

        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:0,width:"100%" }}>

          {superadmins.length > 0 && (
            <div style={{ width:"100%",maxWidth:360,animation:"fadeUp 0.5s ease 200ms both" }}>
              {superadmins.map((p: any) => <PersonCard key={p.id} person={p} isRoot onSaved={refetch}/>)}
            </div>
          )}

          {superadmins.length > 0 && <ConnectorLine/>}

          {boardTrustees.length > 0 && (
            <div style={{ width:"100%",animation:"fadeUp 0.5s ease 300ms both" }}>
              <SectionLabel label="Board of Trustees" color="#fbbf24"/>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12 }}>
                {boardTrustees.map((p: any) => <PersonCard key={p.id} person={p} onSaved={refetch}/>)}
              </div>
            </div>
          )}

          {boardTrustees.length > 0 && management.length > 0 && <ConnectorLine/>}

          {management.length > 0 && (
            <div style={{ width:"100%",animation:"fadeUp 0.5s ease 380ms both" }}>
              <SectionLabel label="Management" color="#a78bfa"/>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12 }}>
                {management.map((p: any) => <PersonCard key={p.id} person={p} onSaved={refetch}/>)}
              </div>
            </div>
          )}

          {management.length > 0 && deputies.length > 0 && <ConnectorLine/>}

          {deputies.length > 0 && (
            <div style={{ width:"100%",animation:"fadeUp 0.5s ease 460ms both" }}>
              <SectionLabel label="Deputies" color="#c4b5fd"/>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12 }}>
                {deputies.map((p: any) => <PersonCard key={p.id} person={p} onSaved={refetch}/>)}
              </div>
            </div>
          )}
        </div>

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
