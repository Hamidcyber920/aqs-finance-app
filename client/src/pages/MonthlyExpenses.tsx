import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import {
  Calendar, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock,
  TrendingDown, PoundSterling, AlertTriangle, Plus, RefreshCw,
  Check, Pause, RotateCcw, StickyNote, FileText, Building2, Download
} from "lucide-react";
import { SmartUpload } from "@/components/SmartUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate } from "@/lib/dateUtils";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

const SECTION_COLORS: Record<string,string> = {
  payroll:"#635BFF", invoices:"#00FFC2", volunteers:"#f59e0b", loans:"#f43f5e",
};

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string,{bg:string;color:string}> = {
    approved:{bg:"rgba(0,255,194,0.12)",color:"#00FFC2"}, pending:{bg:"rgba(251,191,36,0.12)",color:"#fbbf24"},
    rejected:{bg:"rgba(244,63,94,0.12)",color:"#f43f5e"}, paid:{bg:"rgba(99,91,255,0.12)",color:"#635BFF"},
  };
  const s = (status ? map[status.toLowerCase()] : undefined) ?? {bg:T.glass,color:T.muted};
  return <span style={{ padding:"3px 10px",borderRadius:999,fontSize:11,fontWeight:600,background:s.bg,color:s.color,textTransform:"capitalize" }}>{status}</span>;
}

function SectionCard({ title, items, color, onAuthorise, onReject, onPay, onWithhold, canEdit }: any) {
  const [expanded, setExpanded] = useState(true);
  const total = items.reduce((s: number, i: any) => s + Number(i.amount ?? i.grossPay ?? i.netPay ?? 0), 0);
  return (
    <div style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:16,overflow:"hidden",marginBottom:16 }}>
      <div onClick={()=>setExpanded(e=>!e)} style={{ padding:"16px 20px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:expanded?`1px solid ${T.border}`:"none" }}>
        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
          <div style={{ width:10,height:10,borderRadius:"50%",background:color,boxShadow:`0 0 8px ${color}` }}/>
          <span style={{ fontSize:15,fontWeight:700,color:T.white }}>{title}</span>
          <span style={{ fontSize:12,color:T.muted }}>({items.length} items)</span>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:16 }}>
          <span style={{ fontSize:16,fontWeight:800,color }}>{`£${total.toLocaleString("en-GB",{minimumFractionDigits:2})}`}</span>
          {expanded ? <ChevronUp size={16} style={{color:T.muted}}/> : <ChevronDown size={16} style={{color:T.muted}}/>}
        </div>
      </div>
      {expanded && (
        <div>
          {items.length===0 && <div style={{ padding:"32px",textAlign:"center",color:T.muted,fontSize:13 }}>No items this month</div>}
          {items.map((item: any, i: number) => (
            <div key={item.id??i} style={{ padding:"14px 20px",borderBottom:i<items.length-1?`1px solid ${T.border}`:"none",
              background:item.expenseSource==="auto_bill"?"rgba(0,255,194,0.02)":item.expenseSource==="auto_lbmw"?"rgba(99,91,255,0.02)":"transparent" }}>
              <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap" }}>
                <div style={{ flex:1,minWidth:200 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
                    <span style={{ fontSize:14,fontWeight:600,color:T.white }}>{item.vendor||item.staffName||item.name||"—"}</span>
                    <StatusBadge status={item.status||item.paymentStatus}/>
                    {item.expenseSource==="auto_bill" && <span style={{fontSize:10,fontWeight:700,background:"rgba(0,255,194,0.15)",color:"#00FFC2",padding:"2px 7px",borderRadius:999}}>AUTO • BILL</span>}
                    {item.expenseSource==="auto_lbmw" && <span style={{fontSize:10,fontWeight:700,background:"rgba(99,91,255,0.15)",color:"#a78bfa",padding:"2px 7px",borderRadius:999}}>AUTO • LBMW</span>}
                    {(item.status==="pending"||item.status==="processing") && !item.authorisedAt && <span style={{fontSize:10,fontWeight:700,background:"rgba(251,191,36,0.15)",color:"#fbbf24",padding:"2px 7px",borderRadius:999,border:"1px solid rgba(251,191,36,0.3)"}}>⏳ AWAITING APPROVAL</span>}
                    {item.secondApproverRequired && !item.secondApprovedAt && item.authorisedAt && <span style={{fontSize:10,fontWeight:700,background:"rgba(251,191,36,0.15)",color:"#fbbf24",padding:"2px 7px",borderRadius:999,border:"1px solid rgba(251,191,36,0.3)"}}>⏳ 2ND APPROVAL NEEDED</span>}
                  </div>
                  <div style={{ display:"flex",gap:16,flexWrap:"wrap" }}>
                    {item.receiptDate && <span style={{ fontSize:12,color:T.muted }}>{fmtDate(new Date(item.receiptDate))}</span>}
                    {item.categoryName && <span style={{ fontSize:12,color:T.muted }}>{item.categoryName}</span>}
                    {item.departmentName && <span style={{ fontSize:12,color:T.muted }}>{item.departmentName}</span>}
                    {item.notes && <span style={{ fontSize:12,color:T.muted,fontStyle:"italic" }}>{item.notes.slice(0,80)}{item.notes.length>80?"…":""}</span>}
                  </div>
                  {item.authorisedAt && (
                    <div style={{ marginTop:5,fontSize:11,color:"#00FFC2" }}>
                      ✓ Authorised by <strong>{item.authorisedByName ?? "Admin"}</strong> · {new Date(item.authorisedAt).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}
                    </div>
                  )}
                  {item.rejectedAt && !item.authorisedAt && (
                    <div style={{ marginTop:5,fontSize:11,color:"#f43f5e" }}>
                      ✗ Deferred by <strong>{item.rejectedByName ?? "Admin"}</strong> · {new Date(item.rejectedAt).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}{item.rejectionComment ? ` — ${item.rejectionComment}` : ""}
                    </div>
                  )}
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
                  <span style={{ fontSize:16,fontWeight:800,color:T.white }}>{`£${Number(item.amount??item.grossPay??item.netPay??0).toLocaleString("en-GB",{minimumFractionDigits:2})}`}</span>
                  {canEdit && (
                    <div style={{ display:"flex",gap:6 }}>
                      {item.status!=="approved" && <button onClick={()=>onAuthorise(item)} title="Authorise" style={{ background:"rgba(0,255,194,0.12)",border:"1px solid rgba(0,255,194,0.2)",borderRadius:8,padding:"5px 10px",cursor:"pointer",color:"#00FFC2",fontSize:11,fontWeight:700 }}>✓ Auth</button>}
                      {item.status!=="rejected" && <button onClick={()=>onReject(item)} title="Defer" style={{ background:"rgba(244,63,94,0.12)",border:"1px solid rgba(244,63,94,0.2)",borderRadius:8,padding:"5px 10px",cursor:"pointer",color:"#f43f5e",fontSize:11,fontWeight:700 }}>Defer</button>}
                      {item.paymentStatus!=="paid" && <button onClick={()=>onPay(item)} title="Mark Paid" style={{ background:"rgba(99,91,255,0.12)",border:"1px solid rgba(99,91,255,0.2)",borderRadius:8,padding:"5px 10px",cursor:"pointer",color:"#635BFF",fontSize:11,fontWeight:700 }}>Paid</button>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Cash Flow Planner ────────────────────────────────────────────────────────
function CashFlowPlanner() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const now = new Date();
  const [fromDate, setFromDate] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10));
  const [toDate, setToDate] = useState(() => new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString().slice(0,10));
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [noteDialogId, setNoteDialogId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [heldDialogId, setHeldDialogId] = useState<number | null>(null);
  const [heldReason, setHeldReason] = useState("");
  const [addManualOpen, setAddManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ description: "", supplier: "", building: "", dueDate: "", amount: "", note: "" });
  const [openingBalance, setOpeningBalance] = useState<string>("");

  const { data: payments = [], isLoading, refetch } = trpc.bills.listScheduled.useQuery({
    from: fromDate, to: toDate, status: "all",
  });

  const generateMutation = trpc.bills.generateUpcoming.useMutation({
    onSuccess: (r) => { toast.success(r.message); utils.bills.listScheduled.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const markPaidMutation = trpc.bills.markScheduledPaid.useMutation({
    onSuccess: () => { toast.success("Marked as paid"); utils.bills.listScheduled.invalidate(); setSelectedIds(new Set()); },
    onError: (e) => toast.error(e.message),
  });

  const markHeldMutation = trpc.bills.markScheduledHeld.useMutation({
    onSuccess: () => { toast.success("Payment held"); utils.bills.listScheduled.invalidate(); setHeldDialogId(null); setHeldReason(""); setSelectedIds(new Set()); },
    onError: (e) => toast.error(e.message),
  });

  const resetMutation = trpc.bills.resetScheduled.useMutation({
    onSuccess: () => { toast.success("Reset to pending"); utils.bills.listScheduled.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const updateNoteMutation = trpc.bills.updateScheduledNote.useMutation({
    onSuccess: () => { toast.success("Note saved"); utils.bills.listScheduled.invalidate(); setNoteDialogId(null); setNoteText(""); },
    onError: (e) => toast.error(e.message),
  });

  const exportCSVMutation = trpc.trusteeFinance.exportScheduledCSV.useMutation({
    onSuccess: (res) => { window.open(res.url, "_blank"); toast.success("CSV downloaded"); },
    onError: (e) => toast.error(e.message),
  });
  const addManualMutation = trpc.bills.addManualScheduled.useMutation({
    onSuccess: () => { toast.success("Manual payment added"); utils.bills.listScheduled.invalidate(); setAddManualOpen(false); setManualForm({ description:"",supplier:"",building:"",dueDate:"",amount:"",note:"" }); },
    onError: (e) => toast.error(e.message),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === payments.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(payments.map(p => p.id)));
  };

  const pending = payments.filter(p => p.status === "pending");
  const paid = payments.filter(p => p.status === "paid");
  const held = payments.filter(p => p.status === "held");
  const totalPending = pending.reduce((s, p) => s + parseFloat(p.amount), 0);
  const totalPaid = paid.reduce((s, p) => s + parseFloat(p.amount), 0);
  const totalHeld = held.reduce((s, p) => s + parseFloat(p.amount), 0);

  const statusColor = (s: string) => s === "paid" ? "#00FFC2" : s === "held" ? "#fbbf24" : T.muted;
  const statusIcon = (s: string) => s === "paid" ? <CheckCircle2 size={14} color="#00FFC2"/> : s === "held" ? <Pause size={14} color="#fbbf24"/> : <Clock size={14} color={T.muted}/>;

  const groupedByMonth: Record<string, typeof payments> = {};
  for (const p of payments) {
    const key = new Date(p.dueDate).toLocaleString("en-GB", { month: "long", year: "numeric" });
    if (!groupedByMonth[key]) groupedByMonth[key] = [];
    groupedByMonth[key].push(p);
  }
  // Running balance: start from opening balance, subtract each payment in date order
  const openingBal = parseFloat(openingBalance) || 0;
  const sortedByDate = [...payments].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const runningBalanceMap: Record<number, number> = {};
  let runBal = openingBal;
  for (const p of sortedByDate) {
    runBal -= parseFloat(p.amount);
    runningBalanceMap[p.id] = runBal;
  }

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:20 }}>
        {[
          { label:"Pending", value:`£${totalPending.toFixed(2)}`, count:pending.length, color:"#fbbf24" },
          { label:"Paid", value:`£${totalPaid.toFixed(2)}`, count:paid.length, color:"#00FFC2" },
          { label:"Held", value:`£${totalHeld.toFixed(2)}`, count:held.length, color:"#f43f5e" },
          { label:"Total Upcoming", value:`£${(totalPending+totalHeld).toFixed(2)}`, count:pending.length+held.length, color:"#a78bfa" },
        ].map(s => (
          <div key={s.label} style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 16px" }}>
            <p style={{ fontSize:18,fontWeight:800,color:s.color,margin:0 }}>{s.value}</p>
            <p style={{ fontSize:11,color:T.muted,margin:"2px 0 0" }}>{s.count} {s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center" }}>
        <div style={{ display:"flex",gap:6,alignItems:"center",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,padding:"6px 12px" }}>
          <Calendar size={13} color={T.muted}/>
          <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}
            style={{ background:"transparent",border:"none",color:T.white,fontSize:12,outline:"none" }}/>
          <span style={{ color:T.muted,fontSize:12 }}>→</span>
          <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}
            style={{ background:"transparent",border:"none",color:T.white,fontSize:12,outline:"none" }}/>
        </div>
        <Button size="sm" variant="outline" onClick={() => generateMutation.mutate({ months: 3 })}
          disabled={generateMutation.isPending}
          style={{ background:"rgba(0,255,194,0.08)",border:"1px solid rgba(0,255,194,0.2)",color:"#00FFC2",fontSize:12 }}>
          <RefreshCw size={13} className="mr-1"/> {generateMutation.isPending ? "Generating…" : "Generate DD Payments"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAddManualOpen(true)}
          style={{ background:"rgba(99,91,255,0.08)",border:"1px solid rgba(99,91,255,0.2)",color:"#a78bfa",fontSize:12 }}>
          <Plus size={13} className="mr-1"/> Add Manual
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportCSVMutation.mutate({ from: fromDate, to: toDate, status: "all" })}
          disabled={exportCSVMutation.isPending}
          style={{ background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.7)",fontSize:12 }}>
          <Download size={13} className="mr-1"/> {exportCSVMutation.isPending ? "Exporting…" : "Export CSV"}
        </Button>
        {selectedIds.size > 0 && (
          <>
            <Button size="sm" onClick={() => { selectedIds.forEach(id => markPaidMutation.mutate({ id })); }}
              disabled={markPaidMutation.isPending}
              style={{ background:"rgba(0,255,194,0.15)",border:"1px solid rgba(0,255,194,0.3)",color:"#00FFC2",fontSize:12 }}>
              <Check size={13} className="mr-1"/> Mark {selectedIds.size} Paid
            </Button>
            <Button size="sm" onClick={() => { if (selectedIds.size === 1) { const [id] = Array.from(selectedIds); setHeldDialogId(id); } else toast.info("Select one at a time to hold with a reason"); }}
              style={{ background:"rgba(251,191,36,0.12)",border:"1px solid rgba(251,191,36,0.2)",color:"#fbbf24",fontSize:12 }}>
              <Pause size={13} className="mr-1"/> Hold
            </Button>
          </>
        )}
      </div>

      {/* Payments list grouped by month */}
      {isLoading && <div style={{ color:T.muted,textAlign:"center",padding:40 }}>Loading payments…</div>}
      {!isLoading && payments.length === 0 && (
        <div style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:40,textAlign:"center" }}>
          <TrendingDown size={32} color={T.muted} style={{ margin:"0 auto 12px" }}/>
          <p style={{ color:T.muted,fontSize:14 }}>No scheduled payments in this date range.</p>
          <p style={{ color:T.muted,fontSize:12,marginTop:4 }}>Click "Generate DD Payments" to pull upcoming direct debits from Bills & Utilities accounts.</p>
        </div>
      )}

      {/* Select all checkbox */}
      {payments.length > 0 && (
        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"0 4px" }}>
          <Checkbox checked={selectedIds.size === payments.length && payments.length > 0} onCheckedChange={toggleSelectAll}/>
          <span style={{ fontSize:12,color:T.muted }}>Select all ({payments.length})</span>
        </div>
      )}

      {Object.entries(groupedByMonth).map(([month, items]) => {
        const monthTotal = items.reduce((s, p) => s + parseFloat(p.amount), 0);
        const monthPending = items.filter(p => p.status === "pending").reduce((s, p) => s + parseFloat(p.amount), 0);
        return (
          <div key={month} style={{ marginBottom:20 }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
              <h3 style={{ fontSize:13,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",margin:0 }}>{month}</h3>
              <div style={{ display:"flex",gap:12,fontSize:12,color:T.muted }}>
                <span>Total: <strong style={{color:T.white}}>£{monthTotal.toFixed(2)}</strong></span>
                <span>Pending: <strong style={{color:"#fbbf24"}}>£{monthPending.toFixed(2)}</strong></span>
              </div>
            </div>
            <div style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden" }}>
              {items.map((p, i) => (
                <div key={p.id} style={{
                  padding:"13px 16px",
                  borderBottom: i < items.length - 1 ? `1px solid ${T.border}` : "none",
                  background: selectedIds.has(p.id) ? "rgba(99,91,255,0.06)" : "transparent",
                  opacity: p.status === "paid" ? 0.65 : 1,
                }}>
                  <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                    <Checkbox
                      checked={selectedIds.has(p.id)}
                      onCheckedChange={() => toggleSelect(p.id)}
                    />
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                        {statusIcon(p.status)}
                        <span style={{ fontSize:14,fontWeight:600,color:T.white,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                          {p.description}
                        </span>
                        <span style={{ fontSize:11,padding:"2px 8px",borderRadius:999,background:p.status==="paid"?"rgba(0,255,194,0.12)":p.status==="held"?"rgba(251,191,36,0.12)":"rgba(255,255,255,0.06)",color:statusColor(p.status),fontWeight:700,textTransform:"uppercase" }}>
                          {p.status}
                        </span>
                        {p.source === "dd" && <span style={{ fontSize:10,color:T.muted,background:"rgba(255,255,255,0.05)",padding:"2px 6px",borderRadius:999 }}>DD</span>}
                        {p.source === "manual" && <span style={{ fontSize:10,color:"#a78bfa",background:"rgba(99,91,255,0.1)",padding:"2px 6px",borderRadius:999 }}>Manual</span>}
                      </div>
                      <div style={{ display:"flex",gap:12,marginTop:4,flexWrap:"wrap" }}>
                        <span style={{ fontSize:12,color:T.muted }}>{new Date(p.dueDate).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</span>
                        {p.building && <span style={{ fontSize:12,color:T.muted }}><Building2 size={11} style={{display:"inline",marginRight:3}}/>{p.building}</span>}
                        {p.utilityType && <span style={{ fontSize:12,color:T.muted,textTransform:"capitalize" }}>{p.utilityType}</span>}
                        {p.note && <span style={{ fontSize:12,color:"#fbbf24",fontStyle:"italic" }}>📝 {p.note.slice(0,60)}{p.note.length>60?"…":""}</span>}
                      </div>
                      {/* Paid/Held stamp */}
                      {p.status === "paid" && p.paidByName && (
                        <div style={{ fontSize:11,color:T.muted,marginTop:3 }}>
                          Paid by {p.paidByName} on {p.paidAt ? new Date(p.paidAt).toLocaleString("en-GB") : "—"}
                        </div>
                      )}
                      {p.status === "held" && p.heldByName && (
                        <div style={{ fontSize:11,color:"#fbbf24",marginTop:3 }}>
                          Held by {p.heldByName} on {p.heldAt ? new Date(p.heldAt).toLocaleString("en-GB") : "—"}
                        </div>
                      )}
                    </div>
                    <div style={{ display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
                      <div style={{ textAlign:"right" }}>
                        <span style={{ fontSize:16,fontWeight:800,color:T.white }}>£{parseFloat(p.amount).toFixed(2)}</span>
                        {openingBalance !== "" && (
                          <div style={{ fontSize:10,color:runningBalanceMap[p.id] >= 0 ? "#00FFC2" : "#f43f5e",fontWeight:700,marginTop:1 }}>
                            Bal: £{runningBalanceMap[p.id]?.toFixed(2)}
                          </div>
                        )}
                      </div>
                      <div style={{ display:"flex",gap:4 }}>
                        {p.status !== "paid" && (
                          <button onClick={() => markPaidMutation.mutate({ id: p.id })} title="Mark Paid"
                            style={{ background:"rgba(0,255,194,0.1)",border:"1px solid rgba(0,255,194,0.2)",borderRadius:7,padding:"4px 9px",cursor:"pointer",color:"#00FFC2",fontSize:11,fontWeight:700 }}>
                            ✓ Paid
                          </button>
                        )}
                        {p.status === "pending" && (
                          <button onClick={() => { setHeldDialogId(p.id); setHeldReason(""); }} title="Hold payment"
                            style={{ background:"rgba(251,191,36,0.1)",border:"1px solid rgba(251,191,36,0.2)",borderRadius:7,padding:"4px 9px",cursor:"pointer",color:"#fbbf24",fontSize:11,fontWeight:700 }}>
                            ⏸ Hold
                          </button>
                        )}
                        {(p.status === "paid" || p.status === "held") && (
                          <button onClick={() => resetMutation.mutate({ id: p.id })} title="Reset to pending"
                            style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:7,padding:"4px 9px",cursor:"pointer",color:T.muted,fontSize:11 }}>
                            ↺
                          </button>
                        )}
                        <button onClick={() => { setNoteDialogId(p.id); setNoteText(p.note ?? ""); }} title="Add/edit note"
                          style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:7,padding:"4px 8px",cursor:"pointer",color:T.muted,fontSize:11 }}>
                          📝
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Hold reason dialog */}
      <Dialog open={heldDialogId !== null} onOpenChange={(o) => { if (!o) { setHeldDialogId(null); setHeldReason(""); } }}>
        <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:420 }}>
          <DialogHeader>
            <DialogTitle style={{ color:T.white,fontSize:18,fontWeight:800 }}>Hold Payment</DialogTitle>
          </DialogHeader>
          <div style={{ display:"flex",flexDirection:"column",gap:14,marginTop:8 }}>
            <p style={{ fontSize:13,color:T.muted }}>Please provide a reason why this payment is being held. This will be stamped with your name and the current date/time.</p>
            <div>
              <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Reason (required)</Label>
              <Textarea value={heldReason} onChange={e=>setHeldReason(e.target.value)} rows={3}
                placeholder="e.g. Insufficient funds this month — will pay on 15th"
                style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,padding:"10px 14px",fontSize:14,resize:"vertical",width:"100%",boxSizing:"border-box" }}/>
            </div>
            <Button onClick={() => heldDialogId !== null && markHeldMutation.mutate({ id: heldDialogId, note: heldReason })}
              disabled={!heldReason.trim() || markHeldMutation.isPending}
              style={{ background:"rgba(251,191,36,0.15)",border:"1px solid rgba(251,191,36,0.3)",color:"#fbbf24",fontWeight:700,height:46,borderRadius:12,fontSize:15 }}>
              {markHeldMutation.isPending ? "Holding…" : "Hold Payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Note dialog */}
      <Dialog open={noteDialogId !== null} onOpenChange={(o) => { if (!o) { setNoteDialogId(null); setNoteText(""); } }}>
        <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:420 }}>
          <DialogHeader>
            <DialogTitle style={{ color:T.white,fontSize:18,fontWeight:800 }}>Add / Edit Note</DialogTitle>
          </DialogHeader>
          <div style={{ display:"flex",flexDirection:"column",gap:14,marginTop:8 }}>
            <Textarea value={noteText} onChange={e=>setNoteText(e.target.value)} rows={4}
              placeholder="e.g. Agreed to pay in two instalments…"
              style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,padding:"10px 14px",fontSize:14,resize:"vertical",width:"100%",boxSizing:"border-box" }}/>
            <Button onClick={() => noteDialogId !== null && updateNoteMutation.mutate({ id: noteDialogId, note: noteText })}
              disabled={updateNoteMutation.isPending}
              style={{ background:"rgba(99,91,255,0.15)",border:"1px solid rgba(99,91,255,0.3)",color:"#a78bfa",fontWeight:700,height:46,borderRadius:12,fontSize:15 }}>
              {updateNoteMutation.isPending ? "Saving…" : "Save Note"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add manual payment dialog */}
      <Dialog open={addManualOpen} onOpenChange={setAddManualOpen}>
        <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:480 }}>
          <DialogHeader>
            <DialogTitle style={{ color:T.white,fontSize:18,fontWeight:800 }}>Add Manual Future Payment</DialogTitle>
          </DialogHeader>
          <div style={{ display:"flex",flexDirection:"column",gap:12,marginTop:8 }}>
            {[
              { key:"description", label:"Description *", placeholder:"e.g. Quarterly insurance premium" },
              { key:"supplier", label:"Supplier", placeholder:"e.g. Aviva" },
              { key:"building", label:"Building", placeholder:"e.g. QLH" },
              { key:"amount", label:"Amount (£) *", placeholder:"0.00" },
            ].map(f => (
              <div key={f.key}>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>{f.label}</Label>
                <Input value={(manualForm as any)[f.key]} onChange={e=>setManualForm(prev=>({...prev,[f.key]:e.target.value}))}
                  placeholder={f.placeholder}
                  style={{ marginTop:4,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.white,borderRadius:10 }}/>
              </div>
            ))}
            <div>
              <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Due Date *</Label>
              <Input type="date" value={manualForm.dueDate} onChange={e=>setManualForm(prev=>({...prev,dueDate:e.target.value}))}
                style={{ marginTop:4,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.white,borderRadius:10 }}/>
            </div>
            <div>
              <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Note</Label>
              <Textarea value={manualForm.note} onChange={e=>setManualForm(prev=>({...prev,note:e.target.value}))} rows={2}
                placeholder="Optional note"
                style={{ marginTop:4,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,padding:"10px 14px",fontSize:14,resize:"vertical",width:"100%",boxSizing:"border-box" }}/>
            </div>
            <Button onClick={() => addManualMutation.mutate(manualForm as any)}
              disabled={!manualForm.description || !manualForm.dueDate || !manualForm.amount || addManualMutation.isPending}
              style={{ background:"rgba(99,91,255,0.2)",border:"1px solid rgba(99,91,255,0.3)",color:"#a78bfa",fontWeight:700,height:46,borderRadius:12,fontSize:15 }}>
              {addManualMutation.isPending ? "Adding…" : "Add Payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MonthlyExpenses() {
  const { user } = useAuth();
  const { canEdit } = usePermissions();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectItem, setRejectItem] = useState<any>(null);
  const [rejectComment, setRejectComment] = useState("");
    const [activeTab, setActiveTab] = useState<"expenses" | "cashflow">("expenses");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  useEffect(() => {
  }, [month, year, activeTab]);
  const { data, refetch } = trpc.expenses.allItems.useQuery({ month, year });

  const authoriseMutation = trpc.expenses.authorise.useMutation({
    onSuccess: () => { toast.success("Payment authorised"); refetch(); },
  });
  const rejectMutation = trpc.expenses.reject.useMutation({
    onSuccess: () => { toast.success("Payment deferred"); setRejectOpen(false); refetch(); },
  });
  const markPaidMutation = trpc.expenses.nowPaid.useMutation({
    onSuccess: () => { toast.success("Marked as paid"); refetch(); },
  });

  // Date range filter helper
  const filterByDateRange = (items: any[]) => {
    if (!dateFrom && !dateTo) return items;
    return items.filter((item: any) => {
      const d = new Date(item.receiptDate || item.paidAt || item.createdAt || item.date || 0);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo) { const to = new Date(dateTo); to.setHours(23,59,59,999); if (d > to) return false; }
      return true;
    });
  };
  const payroll = filterByDateRange(data?.payroll ?? []);
  const invoices = filterByDateRange(data?.receipts ?? []);
  const volunteers = filterByDateRange(data?.volunteers ?? []);
  const loans = filterByDateRange(data?.loans ?? []);
  const allItemsFlat = [...payroll.map((i:any)=>({...i,_type:"payroll"})), ...invoices.map((i:any)=>({...i,_type:"receipt"})), ...volunteers.map((i:any)=>({...i,_type:"volunteer"})), ...loans.map((i:any)=>({...i,_type:"loan"}))];
  const dateRangeLabel = dateFrom || dateTo ? ` (${dateFrom || 'start'} to ${dateTo || 'end'})` : '';
  const dateRangeFile = dateFrom || dateTo ? `-${dateFrom || 'start'}-to-${dateTo || 'end'}` : '';

  const handleExpenseCSV = () => {
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ["Date","Payee","Type","Category","Amount","Status","Payment Method"];
    const csvRows = [header.join(",")];
    allItemsFlat.forEach((r: any) => {
      const rd = r.receiptDate || r.paidAt || r.createdAt || r.date;
      csvRows.push([
        escape(rd ? fmtDate(new Date(rd)) : ""),
        escape(r.vendor || r.staffName || r.name || ""),
        escape(r._type || ""),
        escape(r.categoryName || r.departmentName || ""),
        String(Number(r.amount ?? r.grossPay ?? r.netPay ?? 0).toFixed(2)),
        escape(r.status || r.paymentStatus || "pending"),
        escape(r.paymentMethod || ""),
      ].join(","));
    });
    csvRows.push("");
    if (dateFrom || dateTo) csvRows.push(`"Date Range","${dateFrom || 'start'} to ${dateTo || 'end'}"`);
    csvRows.push(`"Total",,,,,${totalAll.toFixed(2)}`);
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `expenses-${year}-${String(month).padStart(2,"0")}${dateRangeFile}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  };

  const handleExpensePDF = () => {
    const monthName = `${new Date(year, month-1).toLocaleString("en-GB",{month:"long"})} ${year}`;
    const win = window.open("","_blank");
    if (!win) { toast.error("Pop-up blocked"); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>Expenses ${monthName}</title>
    <style>body{font-family:system-ui,sans-serif;padding:40px;max-width:900px;margin:0 auto}
    table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}
    th,td{padding:8px 12px;border-bottom:1px solid #eee;text-align:left}
    th{background:#f5f5f5;font-weight:600;font-size:12px;text-transform:uppercase}
    h1{font-size:22px} h2{font-size:16px;margin-top:24px}
    .total{font-weight:700;border-top:2px solid #333}
    @media print{body{padding:0}}</style></head><body>
    <h1>Monthly Expenses Report</h1>
    <p style="color:#666">${monthName}${dateRangeLabel}</p>
    <p><strong>Total Outgoings:</strong> £${totalAll.toLocaleString("en-GB",{minimumFractionDigits:2})} | <strong>Authorised:</strong> £${authorisedTotal.toLocaleString("en-GB",{minimumFractionDigits:2})}</p>
    <table><thead><tr><th>Date</th><th>Payee</th><th>Type</th><th>Category</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead><tbody>
    ${allItemsFlat.map((r:any)=>{const rd=r.receiptDate||r.paidAt||r.createdAt||r.date;return`<tr><td>${rd?new Date(rd).toLocaleDateString('en-GB'):'—'}</td><td>${r.vendor||r.staffName||r.name||'—'}</td><td style="text-transform:capitalize">${r._type||'—'}</td><td>${r.categoryName||r.departmentName||'—'}</td><td style="text-align:right">£${Number(r.amount??r.grossPay??r.netPay??0).toLocaleString("en-GB",{minimumFractionDigits:2})}</td><td style="text-transform:capitalize">${r.status||r.paymentStatus||'pending'}</td></tr>`}).join("")}
    ${allItemsFlat.length===0?'<tr><td colspan="6" style="color:#999">No expense items</td></tr>':''}
    <tr class="total"><td colspan="4">Total</td><td style="text-align:right">£${totalAll.toLocaleString("en-GB",{minimumFractionDigits:2})}</td><td></td></tr>
    </tbody></table>
    <p style="margin-top:32px;font-size:11px;color:#999">Generated ${new Date().toLocaleString("en-GB")} | Use browser "Save as PDF"</p>
    </body></html>`);
    win.document.close();
    setTimeout(()=>win.print(),500);
  };

  const totalAll = [...payroll, ...invoices, ...volunteers, ...loans]
    .reduce((s: number, i: any) => s + Number(i.amount ?? i.grossPay ?? i.netPay ?? 0), 0);
  const authorisedTotal = [...payroll, ...invoices, ...volunteers, ...loans]
    .filter((i: any) => i.status === "approved" || i.paymentStatus === "paid")
    .reduce((s: number, i: any) => s + Number(i.amount ?? i.grossPay ?? i.netPay ?? 0), 0);

  const handleAuthorise = (item: any) => authoriseMutation.mutate({ id: item.id, type: item._type ?? "receipt" });
  const handleReject = (item: any) => { setRejectItem(item); setRejectOpen(true); };
  const handlePay = (item: any) => markPaidMutation.mutate({ id: item.id, type: item._type ?? "receipt" });

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:24,fontFamily:"'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12,animation:"fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
              Monthly <span style={{ color:T.mint }}>Expenses</span>
            </h1>
            <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>Authorise, defer and track all outgoing payments</p>
          </div>
          <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap" }}>
            {activeTab === "expenses" && (
              <>
                <SmartUpload
                  moduleType="invoice"
                  buttonLabel="Scan / Upload"
                  buttonVariant="outline"
                  onConfirm={(result) => {
                    const d = result.extractedData as any;
                    toast.info(`AI extracted: ${d.vendorName || "vendor"} — £${d.amount || d.totalAmount || "?"}. Please use the Invoices section to add this record.`);
                  }}
                />
                <div style={{ display:"flex",gap:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:12,padding:"6px 12px",alignItems:"center" }}>
                  <Calendar size={14} style={{ color:T.muted }}/>
                  <select value={month} onChange={e=>setMonth(Number(e.target.value))}
                    style={{ background:"transparent",border:"none",color:T.white,fontSize:13,outline:"none",cursor:"pointer" }}>
                    {Array.from({length:12},(_,i)=>i+1).map(m=>(
                      <option key={m} value={m} style={{background:"#0D2240"}}>{new Date(2000,m-1).toLocaleString("en-GB",{month:"long"})}</option>
                    ))}
                  </select>
                  <input type="number" value={year} onChange={e=>setYear(Number(e.target.value))}
                    style={{ background:"transparent",border:"none",color:T.white,fontSize:13,outline:"none",width:52 }}/>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display:"flex",gap:4,marginBottom:24,background:"rgba(255,255,255,0.04)",borderRadius:12,padding:4,width:"fit-content" }}>
          {([
            { id:"expenses", label:"Monthly Expenses", icon:<PoundSterling size={14}/> },
            { id:"cashflow", label:"Cash Flow Planner", icon:<TrendingDown size={14}/> },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,transition:"all 0.15s",
                background: activeTab === tab.id ? "rgba(99,91,255,0.25)" : "transparent",
                color: activeTab === tab.id ? "#a78bfa" : T.muted,
              }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "expenses" && (
          <>
            {/* Date range filter + export */}
            <div style={{ display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:20 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.04)",border:`1px solid ${T.border}`,borderRadius:12,padding:"8px 14px" }}>
                <Calendar size={14} style={{color:T.muted}}/>
                <span style={{ fontSize:12,color:T.muted,fontWeight:600 }}>From:</span>
                <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                  style={{ background:"transparent",border:"none",color:T.white,fontSize:13,outline:"none",cursor:"pointer" }}/>
                <span style={{ fontSize:12,color:T.muted,fontWeight:600,marginLeft:8 }}>To:</span>
                <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                  style={{ background:"transparent",border:"none",color:T.white,fontSize:13,outline:"none",cursor:"pointer" }}/>
              </div>
              {(dateFrom || dateTo) && (
                <Button onClick={()=>{setDateFrom("");setDateTo("");}}
                  style={{ background:"rgba(255,80,80,0.1)",border:"1px solid rgba(255,80,80,0.2)",color:"#ff5050",borderRadius:10,padding:"7px 12px",fontWeight:600,fontSize:11 }}>
                  Clear
                </Button>
              )}
              <Button onClick={handleExpenseCSV}
                style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,borderRadius:12,padding:"9px 14px",fontWeight:600,display:"flex",alignItems:"center",gap:6,fontSize:12 }}>
                <Download size={13}/> CSV
              </Button>
              <Button onClick={handleExpensePDF}
                style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,borderRadius:12,padding:"9px 14px",fontWeight:600,display:"flex",alignItems:"center",gap:6,fontSize:12 }}>
                <FileText size={13}/> PDF
              </Button>
              {(dateFrom || dateTo) && (
                <span style={{ fontSize:11,color:T.mint,fontWeight:600 }}>
                  Showing {allItemsFlat.length} items{dateRangeLabel}
                </span>
              )}
            </div>
            {/* Summary bar */}
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16,marginBottom:28 }}>
              {[
                { label:"Total Outgoings", value:`£${totalAll.toLocaleString("en-GB",{minimumFractionDigits:2})}`, color:T.purple },
                { label:"Authorised", value:`£${authorisedTotal.toLocaleString("en-GB",{minimumFractionDigits:2})}`, color:T.mint },
                { label:"Pending Auth", value:`£${(totalAll-authorisedTotal).toLocaleString("en-GB",{minimumFractionDigits:2})}`, color:"#fbbf24" },
                { label:"Items", value:payroll.length+invoices.length+volunteers.length+loans.length, color:"#a78bfa" },
              ].map((s,i) => (
                <div key={s.label} style={{ background:T.card,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:14,padding:"16px 18px",animation:`fadeUp 0.5s ease ${i*80}ms both` }}>
                  <p style={{ fontSize:22,fontWeight:800,color:s.color,margin:0,letterSpacing:"-0.03em" }}>{s.value}</p>
                  <p style={{ fontSize:12,color:T.muted,margin:"3px 0 0" }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Sections */}
            <SectionCard title="Payroll" items={payroll.map((i:any)=>({...i,_type:"payroll"}))} color={SECTION_COLORS.payroll} onAuthorise={handleAuthorise} onReject={handleReject} onPay={handlePay} onWithhold={()=>{}} canEdit={canEdit}/>
            <SectionCard title="Invoices & Receipts" items={invoices.map((i:any)=>({...i,_type:"receipt"}))} color={SECTION_COLORS.invoices} onAuthorise={handleAuthorise} onReject={handleReject} onPay={handlePay} onWithhold={()=>{}} canEdit={canEdit}/>
            <SectionCard title="Volunteer Payments" items={volunteers.map((i:any)=>({...i,_type:"volunteer"}))} color={SECTION_COLORS.volunteers} onAuthorise={handleAuthorise} onReject={handleReject} onPay={handlePay} onWithhold={()=>{}} canEdit={canEdit}/>
            <SectionCard title="Qarde Hasan Repayments" items={loans.map((i:any)=>({...i,_type:"loan"}))} color={SECTION_COLORS.loans} onAuthorise={handleAuthorise} onReject={handleReject} onPay={handlePay} onWithhold={()=>{}} canEdit={canEdit}/>
          </>
        )}

        {activeTab === "cashflow" && <CashFlowPlanner />}

        {/* Reject/defer dialog */}
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:420 }}>
            <DialogHeader>
              <DialogTitle style={{ color:T.white,fontSize:18,fontWeight:800 }}>Defer Payment</DialogTitle>
            </DialogHeader>
            <div style={{ display:"flex",flexDirection:"column",gap:14,marginTop:8 }}>
              <p style={{ fontSize:13,color:T.muted }}>This payment will be deferred to next month. Please provide a reason.</p>
              <div>
                <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Reason</Label>
                <textarea value={rejectComment} onChange={e=>setRejectComment(e.target.value)} rows={3} placeholder="e.g. Insufficient funds this month"
                  style={{ marginTop:6,width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,padding:"10px 14px",fontSize:14,resize:"vertical",boxSizing:"border-box" }}/>
              </div>
              <Button onClick={() => rejectMutation?.mutate?.({ id:rejectItem?.id, type:rejectItem?._type??"receipt", comment:rejectComment, month, year })}
                disabled={!rejectComment||rejectMutation?.isPending}
                style={{ background:"rgba(255,80,80,0.15)",border:"1px solid rgba(255,80,80,0.3)",color:"#ff5050",fontWeight:700,height:46,borderRadius:12,fontSize:15 }}>
                {rejectMutation?.isPending?"Deferring…":"Defer to Next Month"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
