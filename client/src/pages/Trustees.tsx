import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Mail, Phone, Pencil, ChevronDown, ChevronUp, MapPin, Heart,
  Plus, X, Check, Users, Shield, Briefcase,
} from "lucide-react";

const T = {
  navy:   "#0A192F",
  card:   "rgba(13,34,64,0.85)",
  border: "rgba(255,255,255,0.08)",
  white:  "#FFFFFF",
  muted:  "rgba(255,255,255,0.45)",
  mint:   "#00FFC2",
  purple: "#635BFF",
  gold:   "#F59E0B",
};

const ROLE_OPTIONS = [
  { value: "Chair / Trustee",   seniority: 1 },
  { value: "Trustee",           seniority: 2 },
  { value: "Senior Manager",    seniority: 3 },
  { value: "Manager",           seniority: 4 },
  { value: "Deputy Manager",    seniority: 5 },
  { value: "Staff",             seniority: 6 },
  { value: "Volunteer",         seniority: 7 },
];

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

function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function formatDob(dob: string | null | undefined): string {
  if (!dob) return "";
  const d = new Date(dob);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function getRoleColor(role: string) {
  const r = (role ?? "").toLowerCase();
  if (r.includes("chair")) return { bg:"rgba(251,191,36,0.18)", color:"#fbbf24" };
  if (r.includes("trustee")) return { bg:"rgba(251,191,36,0.12)", color:"#fbbf24" };
  if (r.includes("senior")) return { bg:"rgba(99,91,255,0.18)", color:"#a78bfa" };
  if (r.includes("manager")) return { bg:"rgba(99,91,255,0.15)", color:"#a78bfa" };
  if (r.includes("deputy")) return { bg:"rgba(167,139,250,0.12)", color:"#c4b5fd" };
  if (r.includes("staff")) return { bg:"rgba(0,255,194,0.1)", color:"#00FFC2" };
  return { bg:"rgba(255,255,255,0.06)", color:T.muted };
}

function ContactCard({ person, onSaved }: { person: any; onSaved: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});

  const updateMutation = trpc.trustees.update.useMutation({
    onSuccess: () => { toast.success("Contact updated"); setEditing(false); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const name = person.fullName ?? "Unknown";
  const role = person.role ?? "Member";
  const rc = getRoleColor(role);
  const age = calcAge(person.dateOfBirth);
  const waLink = person.phone
    ? `https://wa.me/${person.phone.replace(/\D/g,"").replace(/^0/,"44")}`
    : null;

  const startEdit = () => {
    setForm({
      fullName: person.fullName ?? "",
      email: person.email ?? "",
      phone: person.phone ?? "",
      role: person.role ?? "Trustee",
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
      seniorityOrder: person.seniorityOrder ?? 99,
    });
    setEditing(true);
    setExpanded(true);
  };

  const inp: React.CSSProperties = {
    background:"rgba(255,255,255,0.06)",
    border:`1px solid ${T.border}`,
    borderRadius:8,
    color:T.white,
    padding:"8px 10px",
    fontSize:13,
    width:"100%",
    boxSizing:"border-box",
  };
  const lbl: React.CSSProperties = {
    fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:4,
  };

  return (
    <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:"18px 20px",width:"100%" }}>
      <div style={{ display:"flex",alignItems:"flex-start",gap:14,marginBottom:12 }}>
        <div style={{ width:56,height:56,borderRadius:"50%",flexShrink:0,background:`linear-gradient(135deg,${T.purple},#4f46e5)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:T.white }}>
          {getInitials(name)}
        </div>
        <div style={{ flex:1,minWidth:0 }}>
          <p style={{ fontSize:16,fontWeight:800,color:T.white,margin:0,lineHeight:1.3 }}>{name}</p>
          <span style={{ fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:999,background:rc.bg,color:rc.color,display:"inline-block",marginTop:4 }}>{role}</span>
          {age !== null && <p style={{ fontSize:12,color:T.muted,margin:"4px 0 0" }}>Age {age}</p>}
        </div>
        <div style={{ display:"flex",gap:6,flexShrink:0 }}>
          <button onClick={startEdit} style={{ width:32,height:32,borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
            <Pencil size={13}/>
          </button>
          <button onClick={()=>setExpanded(!expanded)} style={{ width:32,height:32,borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
            {expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
          </button>
        </div>
      </div>

      <div style={{ borderTop:`1px solid ${T.border}`,paddingTop:12,marginTop:4 }}>
        <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 8px" }}>Contact</p>
        {person.email && (
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:6 }}>
            <Mail size={13} style={{ color:T.muted,flexShrink:0 }}/>
            <a href={`mailto:${person.email}`} style={{ fontSize:13,color:T.muted,textDecoration:"none" }}>{person.email}</a>
          </div>
        )}
        {person.phone && (
          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
            <Phone size={13} style={{ color:"#25d366",flexShrink:0 }}/>
            <a href={`tel:${person.phone}`} style={{ fontSize:14,fontWeight:600,color:"#25d366",textDecoration:"none" }}>{formatPhone(person.phone)}</a>
            {waLink && (
              <a href={waLink} target="_blank" rel="noreferrer"
                style={{ marginLeft:"auto",fontSize:12,padding:"4px 12px",borderRadius:8,background:"linear-gradient(135deg,#25d366,#128C7E)",color:T.white,fontWeight:700,textDecoration:"none",flexShrink:0 }}>
                WhatsApp
              </a>
            )}
          </div>
        )}
        {!person.email && !person.phone && <p style={{ fontSize:12,color:T.muted,fontStyle:"italic" }}>No contact details</p>}
      </div>

      {expanded && !editing && (
        <>
          {person.dateOfBirth && (
            <div style={{ borderTop:`1px solid ${T.border}`,paddingTop:12,marginTop:12 }}>
              <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 8px" }}>Date of Birth</p>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <span style={{ fontSize:16 }}>🎂</span>
                <span style={{ fontSize:14,color:T.white }}>
                  {formatDob(person.dateOfBirth)}
                  {age !== null && <span style={{ color:T.muted,marginLeft:8 }}>({age} years old)</span>}
                </span>
              </div>
            </div>
          )}
          {(person.addressLine1 || person.city) && (
            <div style={{ borderTop:`1px solid ${T.border}`,paddingTop:12,marginTop:12 }}>
              <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 8px" }}>Address</p>
              <div style={{ display:"flex",alignItems:"flex-start",gap:8 }}>
                <MapPin size={13} style={{ color:T.muted,flexShrink:0,marginTop:2 }}/>
                <div>
                  {person.addressLine1 && <p style={{ fontSize:14,color:T.white,margin:0 }}>{person.addressLine1}</p>}
                  {person.addressLine2 && <p style={{ fontSize:14,color:T.white,margin:0 }}>{person.addressLine2}</p>}
                  {(person.city || person.postcode) && <p style={{ fontSize:14,color:T.white,margin:0 }}>{[person.city,person.postcode].filter(Boolean).join(", ")}</p>}
                </div>
              </div>
            </div>
          )}
          {person.nokName && (
            <div style={{ borderTop:`1px solid ${T.border}`,paddingTop:12,marginTop:12 }}>
              <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"0 0 8px" }}>Next of Kin</p>
              <div style={{ background:"rgba(255,255,255,0.04)",border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px" }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:6 }}>
                  <Heart size={13} style={{ color:"#f87171",flexShrink:0 }}/>
                  <span style={{ fontSize:14,fontWeight:700,color:T.white }}>{person.nokName}</span>
                  {person.nokRelationship && <span style={{ fontSize:12,color:T.muted }}>({person.nokRelationship})</span>}
                </div>
                {person.nokPhone && (
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
                    <Phone size={12} style={{ color:"#25d366",flexShrink:0 }}/>
                    <a href={`tel:${person.nokPhone}`} style={{ fontSize:13,color:"#25d366",textDecoration:"none" }}>{formatPhone(person.nokPhone)}</a>
                  </div>
                )}
                {person.nokEmail && (
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <Mail size={12} style={{ color:T.muted,flexShrink:0 }}/>
                    <a href={`mailto:${person.nokEmail}`} style={{ fontSize:13,color:T.muted,textDecoration:"none" }}>{person.nokEmail}</a>
                  </div>
                )}
              </div>
            </div>
          )}
          {person.notes && (
            <div style={{ borderTop:`1px solid ${T.border}`,paddingTop:12,marginTop:12 }}>
              <p style={{ fontSize:12,color:T.muted,fontStyle:"italic",margin:0 }}>{person.notes}</p>
            </div>
          )}
        </>
      )}

      {editing && (
        <div style={{ borderTop:`1px solid ${T.border}`,paddingTop:14,marginTop:12 }}>
          <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",margin:"0 0 12px" }}>Edit Contact</p>
          <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              <div><label style={lbl}>Full Name</label><input value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})} style={inp}/></div>
              <div>
                <label style={lbl}>Role</label>
                <select value={form.role} onChange={e=>{const opt=ROLE_OPTIONS.find(o=>o.value===e.target.value);setForm({...form,role:e.target.value,seniorityOrder:opt?.seniority??99});}} style={{...inp,appearance:"none" as any,cursor:"pointer"}}>
                  {ROLE_OPTIONS.map(o=><option key={o.value} value={o.value} style={{background:"#0A192F"}}>{o.value}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              <div><label style={lbl}>Email</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} style={inp}/></div>
              <div><label style={lbl}>Phone</label><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} style={inp}/></div>
            </div>
            <div><label style={lbl}>Date of Birth</label><input type="date" value={form.dateOfBirth} onChange={e=>setForm({...form,dateOfBirth:e.target.value})} style={{...inp,colorScheme:"dark"}}/></div>
            <div><label style={lbl}>Address Line 1</label><input value={form.addressLine1} onChange={e=>setForm({...form,addressLine1:e.target.value})} style={inp}/></div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              <div><label style={lbl}>City</label><input value={form.city} onChange={e=>setForm({...form,city:e.target.value})} style={inp}/></div>
              <div><label style={lbl}>Postcode</label><input value={form.postcode} onChange={e=>setForm({...form,postcode:e.target.value})} style={inp}/></div>
            </div>
            <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",margin:"6px 0 0" }}>Next of Kin</p>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              <div><label style={lbl}>Name</label><input value={form.nokName} onChange={e=>setForm({...form,nokName:e.target.value})} style={inp}/></div>
              <div><label style={lbl}>Relationship</label><input value={form.nokRelationship} onChange={e=>setForm({...form,nokRelationship:e.target.value})} placeholder="e.g. Wife" style={inp}/></div>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              <div><label style={lbl}>NOK Phone</label><input value={form.nokPhone} onChange={e=>setForm({...form,nokPhone:e.target.value})} style={inp}/></div>
              <div><label style={lbl}>NOK Email</label><input type="email" value={form.nokEmail} onChange={e=>setForm({...form,nokEmail:e.target.value})} style={inp}/></div>
            </div>
            <div><label style={lbl}>Notes</label><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={2} style={{...inp,resize:"vertical" as any}}/></div>
            <div style={{ display:"flex",gap:8 }}>
              <button onClick={()=>updateMutation.mutate({id:person.id,...form,seniorityOrder:Number(form.seniorityOrder)||99})} disabled={updateMutation.isPending}
                style={{ flex:1,padding:"10px 0",borderRadius:10,background:T.mint,color:"#081526",fontWeight:700,border:"none",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
                <Check size={14}/>{updateMutation.isPending?"Saving...":"Save Changes"}
              </button>
              <button onClick={()=>setEditing(false)}
                style={{ flex:1,padding:"10px 0",borderRadius:10,background:"rgba(255,255,255,0.06)",color:T.muted,fontWeight:700,border:`1px solid ${T.border}`,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
                <X size={14}/>Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ icon, label, count, color }: { icon: React.ReactNode; label: string; count: number; color: string }) {
  return (
    <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:14,marginTop:8 }}>
      <span style={{ color,fontSize:16 }}>{icon}</span>
      <p style={{ fontSize:11,fontWeight:800,color,textTransform:"uppercase",letterSpacing:"0.12em",margin:0 }}>{label}</p>
      <span style={{ fontSize:11,fontWeight:700,color,background:`${color}22`,padding:"2px 8px",borderRadius:999,marginLeft:4 }}>{count}</span>
      <div style={{ flex:1,height:1,background:`${color}33`,marginLeft:4 }}/>
    </div>
  );
}

function AddMemberForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<any>({
    fullName:"",email:"",phone:"",role:"Trustee",notes:"",
    dateOfBirth:"",addressLine1:"",addressLine2:"",city:"",postcode:"",
    nokName:"",nokPhone:"",nokEmail:"",nokRelationship:"",seniorityOrder:2,
  });

  const createMutation = trpc.trustees.create.useMutation({
    onSuccess: () => { toast.success("Member added"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const inp: React.CSSProperties = {
    background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,
    color:"#fff",padding:"8px 10px",fontSize:13,width:"100%",boxSizing:"border-box",
  };
  const lbl: React.CSSProperties = {
    fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.45)",textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:4,
  };

  return (
    <div style={{ background:"rgba(13,34,64,0.95)",border:"1px solid rgba(99,91,255,0.3)",borderRadius:16,padding:20,marginBottom:20 }}>
      <p style={{ fontSize:13,fontWeight:800,color:"#fff",margin:"0 0 16px" }}>Add New Member</p>
      <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
          <div><label style={lbl}>Full Name *</label><input value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})} placeholder="e.g. Dr Abdul Hamid" style={inp}/></div>
          <div>
            <label style={lbl}>Role *</label>
            <select value={form.role} onChange={e=>{const opt=ROLE_OPTIONS.find(o=>o.value===e.target.value);setForm({...form,role:e.target.value,seniorityOrder:opt?.seniority??99});}} style={{...inp,appearance:"none" as any,cursor:"pointer"}}>
              {ROLE_OPTIONS.map(o=><option key={o.value} value={o.value} style={{background:"#0A192F"}}>{o.value}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
          <div><label style={lbl}>Email</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} style={inp}/></div>
          <div><label style={lbl}>Phone</label><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="07xxx xxx xxx" style={inp}/></div>
        </div>
        <div><label style={lbl}>Date of Birth</label><input type="date" value={form.dateOfBirth} onChange={e=>setForm({...form,dateOfBirth:e.target.value})} style={{...inp,colorScheme:"dark"}}/></div>
        <div><label style={lbl}>Address</label><input value={form.addressLine1} onChange={e=>setForm({...form,addressLine1:e.target.value})} placeholder="Street address" style={inp}/></div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
          <div><label style={lbl}>City</label><input value={form.city} onChange={e=>setForm({...form,city:e.target.value})} style={inp}/></div>
          <div><label style={lbl}>Postcode</label><input value={form.postcode} onChange={e=>setForm({...form,postcode:e.target.value})} style={inp}/></div>
        </div>
        <p style={{ fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.45)",textTransform:"uppercase",margin:"4px 0 0" }}>Next of Kin (optional)</p>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
          <div><label style={lbl}>Name</label><input value={form.nokName} onChange={e=>setForm({...form,nokName:e.target.value})} style={inp}/></div>
          <div><label style={lbl}>Relationship</label><input value={form.nokRelationship} onChange={e=>setForm({...form,nokRelationship:e.target.value})} placeholder="e.g. Wife" style={inp}/></div>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
          <div><label style={lbl}>NOK Phone</label><input value={form.nokPhone} onChange={e=>setForm({...form,nokPhone:e.target.value})} style={inp}/></div>
          <div><label style={lbl}>NOK Email</label><input type="email" value={form.nokEmail} onChange={e=>setForm({...form,nokEmail:e.target.value})} style={inp}/></div>
        </div>
        <div><label style={lbl}>Notes</label><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={2} placeholder="e.g. Chair of the Board of Trustees. Superadmin." style={{...inp,resize:"vertical" as any}}/></div>
        <div style={{ display:"flex",gap:8 }}>
          <button onClick={()=>{if(!form.fullName.trim()){toast.error("Full name required");return;}createMutation.mutate(form);}} disabled={createMutation.isPending}
            style={{ flex:1,padding:"11px 0",borderRadius:10,background:"linear-gradient(135deg,#00FFC2,#00DDB0)",color:"#081526",fontWeight:700,border:"none",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
            <Check size={14}/>{createMutation.isPending?"Adding...":"Add Member"}
          </button>
          <button onClick={onCancel}
            style={{ flex:1,padding:"11px 0",borderRadius:10,background:"rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.45)",fontWeight:700,border:"1px solid rgba(255,255,255,0.08)",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
            <X size={14}/>Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TrusteesPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const { data, refetch } = trpc.trustees.list.useQuery();
  const allMembers: any[] = Array.isArray(data) ? data : [];
  const active = allMembers.filter((t: any) => t.isActive !== false);

  const boardTrustees = active.filter((t: any) => {
    const r = (t.role ?? "").toLowerCase();
    return r.includes("trustee") || r.includes("chair");
  });
  const management = active.filter((t: any) => {
    const r = (t.role ?? "").toLowerCase();
    return (r.includes("manager") || r.includes("senior")) && !r.includes("trustee") && !r.includes("chair");
  });
  const staff = active.filter((t: any) => {
    const r = (t.role ?? "").toLowerCase();
    return !r.includes("trustee") && !r.includes("chair") && !r.includes("manager") && !r.includes("senior");
  });

  const handleSaved = () => { setShowAddForm(false); refetch(); };

  return (
    <>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        input:focus,textarea:focus,select:focus{outline:none;border-color:rgba(99,91,255,0.6)!important;}
        input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(1);opacity:0.5;}
        select option{background:#0A192F;color:#fff}
      `}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:"20px 16px",fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12,animation:"fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize:"clamp(20px,3vw,28px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
              Trustees &amp; <span style={{ color:T.mint }}>Staff Contacts</span>
            </h1>
            <p style={{ fontSize:12,color:T.muted,margin:"4px 0 0" }}>AQS trustees, managers and staff — contact directory &amp; emergency details</p>
          </div>
          <button onClick={()=>setShowAddForm(!showAddForm)}
            style={{ display:"flex",alignItems:"center",gap:8,padding:"10px 18px",borderRadius:12,background:showAddForm?"rgba(0,255,194,0.12)":`linear-gradient(135deg,${T.purple},#4f46e5)`,border:showAddForm?"1px solid rgba(0,255,194,0.4)":"none",color:showAddForm?T.mint:T.white,fontWeight:700,cursor:"pointer",fontSize:13 }}>
            {showAddForm ? <><X size={14}/>Cancel</> : <><Plus size={14}/>Add Member</>}
          </button>
        </div>

        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:12,marginBottom:24,animation:"fadeUp 0.5s ease 60ms both" }}>
          {[
            { label:"Total", value:active.length, color:T.purple, icon:<Users size={14}/> },
            { label:"Trustees", value:boardTrustees.length, color:T.gold, icon:<Shield size={14}/> },
            { label:"Management", value:management.length, color:"#a78bfa", icon:<Briefcase size={14}/> },
            { label:"Staff", value:staff.length, color:T.mint, icon:<Users size={14}/> },
          ].map((s,i)=>(
            <div key={s.label} style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 16px",animation:`fadeUp 0.5s ease ${i*60}ms both` }}>
              <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:4 }}>
                <span style={{ color:s.color }}>{s.icon}</span>
                <p style={{ fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",margin:0 }}>{s.label}</p>
              </div>
              <p style={{ fontSize:26,fontWeight:800,color:s.color,margin:0,letterSpacing:"-0.03em" }}>{s.value}</p>
            </div>
          ))}
        </div>

        {showAddForm && (
          <div style={{ animation:"fadeUp 0.3s ease both" }}>
            <AddMemberForm onSaved={handleSaved} onCancel={()=>setShowAddForm(false)}/>
          </div>
        )}

        {boardTrustees.length > 0 && (
          <div style={{ marginBottom:28,animation:"fadeUp 0.5s ease 200ms both" }}>
            <SectionHeader icon={<Shield size={14}/>} label="Board of Trustees" count={boardTrustees.length} color={T.gold}/>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14 }}>
              {boardTrustees.map((t:any)=><ContactCard key={t.id} person={t} onSaved={refetch}/>)}
            </div>
          </div>
        )}

        {management.length > 0 && (
          <div style={{ marginBottom:28,animation:"fadeUp 0.5s ease 300ms both" }}>
            <SectionHeader icon={<Briefcase size={14}/>} label="Management" count={management.length} color="#a78bfa"/>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14 }}>
              {management.map((t:any)=><ContactCard key={t.id} person={t} onSaved={refetch}/>)}
            </div>
          </div>
        )}

        {staff.length > 0 && (
          <div style={{ marginBottom:28,animation:"fadeUp 0.5s ease 400ms both" }}>
            <SectionHeader icon={<Users size={14}/>} label="Staff" count={staff.length} color={T.mint}/>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14 }}>
              {staff.map((t:any)=><ContactCard key={t.id} person={t} onSaved={refetch}/>)}
            </div>
          </div>
        )}

        {active.length === 0 && !showAddForm && (
          <div style={{ textAlign:"center",padding:60,color:T.muted,background:T.card,borderRadius:16,border:`1px solid ${T.border}` }}>
            <Users size={36} style={{ opacity:0.3,marginBottom:12 }}/>
            <p>No members yet — click Add Member above</p>
          </div>
        )}
      </div>
    </>
  );
}
