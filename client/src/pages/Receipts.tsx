import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Search, Filter, Receipt, CheckCircle2, Clock, XCircle, Camera, ShieldAlert, ThumbsUp, CheckSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

const STATUSES = ["All","pending","approved","rejected"];
const DEPTS = ["All","Mosque","Restaurant/Bistro","Ramadan","Staff/Payroll"];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string,{bg:string;color:string;icon:any}> = {
    approved:{bg:"rgba(0,255,194,0.1)",color:T.mint,icon:CheckCircle2},
    pending:{bg:"rgba(251,191,36,0.1)",color:"#fbbf24",icon:Clock},
    rejected:{bg:"rgba(255,80,80,0.1)",color:"#ff5050",icon:XCircle},
  };
  const s = map[status?.toLowerCase()] ?? {bg:T.glass,color:T.muted,icon:Clock};
  return (
    <span style={{ display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:999,fontSize:11,fontWeight:600,background:s.bg,color:s.color,textTransform:"capitalize" }}>
      <s.icon size={10}/>{status}
    </span>
  );
}

export default function ReceiptsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [deptFilter, setDeptFilter] = useState("All");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);

  const { data, refetch } = trpc.receipts.list.useQuery({ limit: 100 });
  const deleteMutation = trpc.receipts.delete?.useMutation?.({
    onSuccess: () => { toast.success("Receipt deleted"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const receipts: any[] = data?.rows ?? [];
  const { data: pendingSecondApproval = [], refetch: refetchPending } = (trpc as any).receipts.listPendingSecondApproval?.useQuery?.() ?? { data: [] };
  const secondApproveMutation = (trpc as any).receipts.secondApprove?.useMutation?.({
    onSuccess: () => { toast.success("Second approval granted"); refetchPending(); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const isAdmin = user?.role === "superadmin" || user?.role === "trustee" || user?.role === "admin";

  const filtered = receipts.filter((r: any) => {
    const matchSearch = !search || (r.description??r.notes??"").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || r.status === statusFilter;
    const matchDept = deptFilter === "All" || r.department === deptFilter || r.departmentName === deptFilter;
    return matchSearch && matchStatus && matchDept;
  });

  const total = filtered.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const approved = receipts.filter((r: any) => r.status === "approved").length;
  const pending = receipts.filter((r: any) => r.status === "pending").length;

  // Approvable = not submitted by current user
  const approvableItems: any[] = Array.isArray(pendingSecondApproval)
    ? pendingSecondApproval.filter((r: any) => r.approvedById !== user?.id)
    : [];

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === approvableItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(approvableItems.map((r: any) => r.id)));
    }
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return;
    setBulkApproving(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          (secondApproveMutation as any)?.mutateAsync?.({ receiptId: id })
        )
      );
      toast.success(`${selectedIds.size} receipt${selectedIds.size !== 1 ? "s" : ""} approved`);
      setSelectedIds(new Set());
      refetchPending();
      refetch();
    } catch (e: any) {
      toast.error(`Bulk approve failed: ${e.message}`);
    } finally {
      setBulkApproving(false);
    }
  }

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}} tr:hover td{background:rgba(99,91,255,0.05)}`}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:24,fontFamily:"'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12,animation:"fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
              My <span style={{ color:T.mint }}>Expenses</span>
            </h1>
            <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>All your submitted receipts and expense claims</p>
          </div>
          <Button onClick={() => setLocation("/")}
            style={{ background:`linear-gradient(135deg,${T.purple},#4f46e5)`,color:T.white,border:"none",borderRadius:12,padding:"10px 20px",fontWeight:700,display:"flex",alignItems:"center",gap:8 }}>
            <Camera size={15}/> Scan Receipt
          </Button>
        </div>

        {/* Stats */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:16,marginBottom:24 }}>
          {[
            {label:"Total Spent",value:`£${total.toLocaleString("en-GB",{minimumFractionDigits:2})}`,color:T.purple},
            {label:"Receipts",value:receipts.length,color:T.mint},
            {label:"Approved",value:approved,color:"#6ee7b7"},
            {label:"Pending",value:pending,color:"#fbbf24"},
          ].map((s,i)=>(
            <div key={s.label} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:14,padding:"16px 18px",animation:`fadeUp 0.5s ease ${i*80}ms both` }}>
              <p style={{ fontSize:22,fontWeight:800,color:s.color,margin:0,letterSpacing:"-0.03em" }}>{s.value}</p>
              <p style={{ fontSize:12,color:T.muted,margin:"2px 0 0" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Second Approver Queue (admin only) ── */}
        {isAdmin && approvableItems.length > 0 && (
          <div style={{ background:"rgba(251,191,36,0.06)",border:"1px solid rgba(251,191,36,0.2)",borderRadius:16,padding:20,marginBottom:24,animation:"fadeUp 0.4s ease both" }}>
            {/* Queue header with bulk controls */}
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10 }}>
              <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                <ShieldAlert size={18} style={{ color:"#fbbf24" }}/>
                <span style={{ fontSize:14,fontWeight:700,color:"#fbbf24" }}>Pending Second Approval ({approvableItems.length})</span>
                <span style={{ fontSize:11,color:T.muted,marginLeft:4 }}>Receipts over £500 require a second approver</span>
              </div>
              <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                {/* Select all toggle */}
                <button
                  onClick={toggleSelectAll}
                  style={{ padding:"5px 12px",borderRadius:8,background:"rgba(251,191,36,0.1)",border:"1px solid rgba(251,191,36,0.25)",color:"#fbbf24",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5 }}>
                  <CheckSquare size={12}/>
                  {selectedIds.size === approvableItems.length ? "Deselect All" : "Select All"}
                </button>
                {/* Approve selected */}
                {selectedIds.size > 0 && (
                  <button
                    onClick={handleBulkApprove}
                    disabled={bulkApproving}
                    style={{ padding:"5px 16px",borderRadius:8,background:"rgba(0,255,194,0.15)",border:"1px solid rgba(0,255,194,0.3)",color:T.mint,fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5,opacity:bulkApproving?0.6:1 }}>
                    <ThumbsUp size={12}/>
                    {bulkApproving ? "Approving…" : `Approve ${selectedIds.size} Selected`}
                  </button>
                )}
              </div>
            </div>

            {/* Queue rows with checkboxes */}
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              {approvableItems.map((r: any) => (
                <div key={r.id}
                  style={{ display:"flex",alignItems:"center",justifyContent:"space-between",background:selectedIds.has(r.id)?"rgba(0,255,194,0.06)":"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 16px",gap:12,border:`1px solid ${selectedIds.has(r.id)?"rgba(0,255,194,0.2)":"transparent"}`,transition:"all 0.15s" }}>
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedIds.has(r.id)}
                    onChange={() => toggleSelect(r.id)}
                    style={{ width:16,height:16,accentColor:T.mint,flexShrink:0,cursor:"pointer" }}
                  />
                  <div style={{ flex:1,minWidth:0 }}>
                    <span style={{ fontSize:13,fontWeight:600,color:T.white }}>{r.description ?? r.notes ?? "Receipt"}</span>
                    <span style={{ fontSize:12,color:T.muted,marginLeft:12 }}>£{Number(r.amount ?? 0).toLocaleString("en-GB",{minimumFractionDigits:2})}</span>
                    <span style={{ fontSize:11,color:T.muted,marginLeft:12 }}>{r.date ? new Date(r.date).toLocaleDateString("en-GB") : ""}</span>
                  </div>
                  <div style={{ display:"flex",gap:8,flexShrink:0 }}>
                    <button onClick={() => setLocation(`/receipts/${r.id}`)}
                      style={{ padding:"5px 12px",borderRadius:8,background:"rgba(99,91,255,0.1)",border:"1px solid rgba(99,91,255,0.2)",color:T.purple,fontSize:11,fontWeight:600,cursor:"pointer" }}>
                      View
                    </button>
                    <button onClick={() => secondApproveMutation?.mutate?.({ receiptId: r.id })}
                      style={{ padding:"5px 12px",borderRadius:8,background:"rgba(0,255,194,0.1)",border:"1px solid rgba(0,255,194,0.2)",color:T.mint,fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5 }}>
                      <ThumbsUp size={11}/> Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display:"flex",gap:12,marginBottom:20,flexWrap:"wrap",alignItems:"center" }}>
          <div style={{ position:"relative",flex:1,minWidth:200 }}>
            <Search size={14} style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:T.muted,pointerEvents:"none" }}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search receipts…"
              style={{ width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:12,color:T.white,height:42,paddingLeft:36,paddingRight:14,fontSize:13,outline:"none",boxSizing:"border-box" }}/>
          </div>
          <div style={{ display:"flex",gap:8 }}>
            {STATUSES.map(s=>(
              <button key={s} onClick={()=>setStatusFilter(s)}
                style={{ padding:"7px 14px",borderRadius:999,fontSize:12,fontWeight:600,border:`1px solid ${statusFilter===s?T.purple:T.border}`,background:statusFilter===s?"rgba(99,91,255,0.2)":T.glass,color:statusFilter===s?T.white:T.muted,cursor:"pointer",transition:"all 0.2s",textTransform:"capitalize" }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,padding:24,animation:"fadeUp 0.5s ease 300ms both" }}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse",minWidth:520 }}>
              <thead>
                <tr>
                  {["Description","Department","Category","Amount","Status","Date",""].map(h=>(
                    <th key={h} style={{ textAlign:"left",fontSize:10,fontWeight:600,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",padding:"0 12px 12px 0",borderBottom:`1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length===0 ? (
                  <tr><td colSpan={7} style={{ textAlign:"center",padding:48,color:T.muted,fontSize:14 }}>
                    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:10 }}>
                      <Receipt size={32} style={{color:T.muted,opacity:0.4}}/>
                      <span>No receipts found</span>
                    </div>
                  </td></tr>
                ) : filtered.map((r:any,i:number)=>(
                  <tr key={r.id??i} style={{ cursor:"pointer",transition:"background 0.15s" }}
                    onClick={()=>setLocation(`/receipts/${r.id}`)}>
                    <td style={{ padding:"12px 12px 12px 0",borderBottom:`1px solid ${T.border}` }}>
                      <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                        {r.imageUrl && (
                          <img src={r.imageUrl} alt="" style={{ width:36,height:36,borderRadius:8,objectFit:"cover",flexShrink:0,border:`1px solid ${T.border}` }}/>
                        )}
                        <span style={{ fontSize:13,color:T.white,fontWeight:500 }}>{r.description??r.notes??"—"}</span>
                      </div>
                    </td>
                    <td style={{ padding:"12px 12px 12px 0",fontSize:12,color:T.muted,borderBottom:`1px solid ${T.border}` }}>{r.department??r.departmentName??"—"}</td>
                    <td style={{ padding:"12px 12px 12px 0",fontSize:12,color:T.muted,borderBottom:`1px solid ${T.border}` }}>{r.category??r.categoryName??"—"}</td>
                    <td style={{ padding:"12px 12px 12px 0",fontSize:14,fontWeight:700,color:T.mint,borderBottom:`1px solid ${T.border}` }}>£{Number(r.amount??0).toLocaleString("en-GB",{minimumFractionDigits:2})}</td>
                    <td style={{ padding:"12px 12px 12px 0",borderBottom:`1px solid ${T.border}` }}><StatusBadge status={r.status??"pending"}/></td>
                    <td style={{ padding:"12px 12px 12px 0",fontSize:12,color:T.muted,borderBottom:`1px solid ${T.border}` }}>{r.date?new Date(r.date).toLocaleDateString("en-GB"):r.createdAt?new Date(r.createdAt).toLocaleDateString("en-GB"):"—"}</td>
                    <td style={{ padding:"12px 0",borderBottom:`1px solid ${T.border}` }}>
                      <button onClick={e=>{e.stopPropagation();setLocation(`/receipts/${r.id}`);}}
                        style={{ padding:"4px 10px",borderRadius:8,background:"rgba(99,91,255,0.1)",border:"1px solid rgba(99,91,255,0.2)",color:T.purple,fontSize:11,fontWeight:600,cursor:"pointer" }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
