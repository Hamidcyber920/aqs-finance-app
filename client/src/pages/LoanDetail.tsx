import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, Clock, XCircle, Download,
  Upload, MessageCircle, Mail, Calendar, DollarSign, User, FileText, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const T = { navy:"#0A192F",purple:"#635BFF",mint:"#00FFC2",white:"#FFFFFF",muted:"rgba(255,255,255,0.5)",border:"rgba(255,255,255,0.08)",glass:"rgba(255,255,255,0.04)",card:"rgba(13,34,64,0.8)" };

const ADMIN_NAMES = ["Farid Ahmed", "Mumin Khan"];
const TRUSTEE_NAMES = ["Dr Abdul Hamid", "Galib Khan"];

function ApprovalBox({ label, approved, approvedBy, approvedAt, onApprove, canApprove, loading, names }: {
  label: string; approved: boolean; approvedBy?: string | null; approvedAt?: Date | null;
  onApprove: (name: string) => void; canApprove: boolean; loading?: boolean; names: string[];
}) {
  const [selectedName, setSelectedName] = useState("");

  return (
    <div style={{ background:approved?"rgba(0,255,194,0.06)":"rgba(255,255,255,0.04)",border:`1px solid ${approved?"rgba(0,255,194,0.2)":T.border}`,borderRadius:14,padding:"16px 18px" }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:approved?8:0,flexWrap:"wrap",gap:10 }}>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          {approved
            ? <CheckCircle2 size={18} style={{color:T.mint}}/>
            : <Clock size={18} style={{color:"#fbbf24"}}/> }
          <span style={{ fontSize:13,fontWeight:700,color:T.white }}>{label}</span>
        </div>
        {!approved && canApprove && (
          <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
            <select
              value={selectedName}
              onChange={e => setSelectedName(e.target.value)}
              style={{
                background:"rgba(255,255,255,0.08)",border:`1px solid ${T.border}`,borderRadius:8,
                color:selectedName?T.white:T.muted,fontSize:12,padding:"6px 10px",height:34,
                outline:"none",cursor:"pointer",minWidth:160,
              }}
            >
              <option value="" disabled style={{background:"#0A192F",color:T.muted}}>Select name…</option>
              {names.map(n => (
                <option key={n} value={n} style={{background:"#0A192F",color:T.white}}>{n}</option>
              ))}
            </select>
            <Button
              onClick={() => { if (selectedName) onApprove(selectedName); }}
              disabled={loading || !selectedName}
              style={{
                background: selectedName
                  ? `linear-gradient(135deg,${T.mint},#00DDB0)`
                  : "rgba(255,255,255,0.1)",
                color: selectedName ? "#081526" : T.muted,
                border:"none",borderRadius:9,height:34,padding:"0 14px",fontWeight:700,fontSize:12,
                cursor: selectedName ? "pointer" : "not-allowed",
                transition:"all 0.2s",
              }}
            >
              {loading?"Signing…":"Sign Off ✓"}
            </Button>
          </div>
        )}
        {!approved && !canApprove && (
          <span style={{ fontSize:11,color:"#fbbf24",background:"rgba(251,191,36,0.1)",padding:"3px 10px",borderRadius:999,fontWeight:600 }}>Pending</span>
        )}
      </div>
      {approved && (
        <p style={{ fontSize:12,color:T.mint,margin:0 }}>
          ✓ Signed by <strong>{approvedBy}</strong>{approvedAt ? ` · ${new Date(approvedAt).toLocaleString("en-GB")}` : ""}
        </p>
      )}
    </div>
  );
}

function RepaymentRow({ repayment, isAdmin, isTrustee, onConfirm, onApproveTrustee, onApproveAdmin, onSendReminder, onDownloadReceipt, onConfirmLender, onInterimWaqf, borrowerPhone }: any) {
  const [adminName, setAdminName] = useState("");
  const [trusteeName, setTrusteeName] = useState("");
  const [waqfDialogOpen, setWaqfDialogOpen] = useState(false);
  const [waqfAmt, setWaqfAmt] = useState("");
  const [waqfNote, setWaqfNote] = useState("");
  const existingWaqf = parseFloat(repayment.waqfAmount ?? "0");
  const isPending = !repayment.trusteeApprovedAt;
  const isOverdue = isPending && repayment.dueDate && new Date(repayment.dueDate) < new Date();
  const isDueSoon = isPending && !isOverdue && repayment.dueDate && (new Date(repayment.dueDate).getTime() - Date.now()) < 7 * 24 * 60 * 60 * 1000;
  const [rowEvidenceUrl, setRowEvidenceUrl] = useState(repayment.evidenceUrl ?? "");
  const [rowUploading, setRowUploading] = useState(false);
  const rowFileRef = useRef<HTMLInputElement>(null);

  const handleRowEvidence = async (file: File) => {
    setRowUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("key", `loan-repayment-evidence/${repayment.id}-${Date.now()}.${file.name.split('.').pop()}`);
      const res = await fetch("/api/upload", { method:"POST", body:fd });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setRowEvidenceUrl(data.url);
      toast.success("Evidence uploaded");
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setRowUploading(false);
      if (rowFileRef.current) rowFileRef.current.value = "";
    }
  };

  const openWhatsApp = () => {
    let phone = (borrowerPhone ?? "").replace(/\D/g,"");
    if (!phone) { toast.error("No phone number on file"); return; }
    if (phone.startsWith("0")) phone = "44" + phone.slice(1);
    else if (!phone.startsWith("44") && phone.length <= 10) phone = "44" + phone;
    const amount = Number(repayment.amount??0).toLocaleString("en-GB",{minimumFractionDigits:2});
    const borrowerName = (repayment.borrowerName ?? "").trim();
    const greeting = borrowerName ? `Assalamu Alaikum ${borrowerName.split(" ")[0]},` : "Assalamu Alaikum,";
    const msg = encodeURIComponent(`${greeting} this is a reminder that your Qarde Hasan loan repayment of £${amount} (Instalment ${repayment.instalment}) has been paid. Please confirm receipt of the payment at your earliest convenience. JazakAllahu Khayran — AQ Society Finance Team`);
    window.location.href = `https://wa.me/${phone}?text=${msg}`;
  };

  return (
    <div style={{ padding:"14px 0",borderBottom:`1px solid ${T.border}`,borderLeft:isOverdue?"3px solid #ef4444":isDueSoon?"3px solid #fbbf24":"3px solid transparent",paddingLeft:isOverdue||isDueSoon?"12px":"0" }}>
      <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:10 }}>
        <div style={{ flex:1,minWidth:0 }}>
          <p style={{ fontSize:13,fontWeight:600,color:T.white,margin:0 }}>
            Instalment {repayment.instalment ?? "#"} — £{Number(repayment.amount??0).toLocaleString("en-GB",{minimumFractionDigits:2})}
          </p>
          <p style={{ fontSize:11,color:isOverdue?"#ef4444":isDueSoon?"#fbbf24":T.muted,margin:"2px 0 0",fontWeight:isOverdue||isDueSoon?700:400 }}>
            {isOverdue && "⚠️ OVERDUE · "}{isDueSoon && "⏰ Due soon · "}Due: {repayment.dueDate ? new Date(repayment.dueDate).toLocaleDateString("en-GB") : "—"}
            {repayment.paidAt && <span style={{marginLeft:8,color:"rgba(255,255,255,0.4)"}}>Recorded: {new Date(repayment.paidAt).toLocaleString("en-GB")}</span>}
          </p>
          {repayment.paymentMethod && (
            <p style={{ fontSize:11,color:"rgba(255,255,255,0.4)",margin:"2px 0 0",textTransform:"capitalize" }}>
              {repayment.paymentMethod.replace(/_/g," ")}
              {repayment.notes && <span style={{marginLeft:8}}>· {repayment.notes}</span>}
            </p>
          )}
          {repayment.adminApprovedAt && (
            <p style={{ fontSize:11,color:T.mint,margin:"2px 0 0" }}>
              ✓ Admin: <strong>{repayment.adminApprovedByName ?? ""}</strong> · {new Date(repayment.adminApprovedAt).toLocaleString("en-GB")}
              {repayment.trusteeApprovedAt && <span> · ✓ Trustee: <strong>{repayment.trusteeName ?? ""}</strong> · {new Date(repayment.trusteeApprovedAt).toLocaleString("en-GB")}</span>}
            </p>
          )}
          {existingWaqf > 0 && (
            <p style={{ fontSize:11,color:"#c9a84c",margin:"4px 0 0",fontWeight:600 }}>
              🕌 Waqf Endowed: £{existingWaqf.toFixed(2)}{repayment.waqfNote ? ` · ${repayment.waqfNote}` : ""}
            </p>
          )}
          {/* Evidence */}
          <div style={{ marginTop:6,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
            <input ref={rowFileRef} type="file" accept="image/*,application/pdf" style={{ display:"none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleRowEvidence(f); }}/>
            <button
              onClick={() => rowFileRef.current?.click()}
              disabled={rowUploading}
              style={{ display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:8,background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,color:T.muted,fontSize:11,fontWeight:600,cursor:"pointer" }}>
              <Upload size={11}/> {rowUploading ? "Uploading…" : rowEvidenceUrl ? "📷 Replace Evidence" : "📷 Add Evidence"}
            </button>
            {rowEvidenceUrl && (
              <>
                <a href={rowEvidenceUrl} target="_blank" rel="noreferrer" style={{ display:"flex",alignItems:"center",gap:4,textDecoration:"none" }}>
                  {/\.(jpg|jpeg|png|gif|webp)$/i.test(rowEvidenceUrl) ? (
                    <img src={rowEvidenceUrl} alt="Evidence" style={{ width:36,height:36,objectFit:"cover",borderRadius:6,border:`1px solid ${T.border}` }}/>
                  ) : (
                    <span style={{ fontSize:11,color:T.mint }}>📎 View Evidence ↗</span>
                  )}
                </a>
              </>
            )}
          </div>
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:8,alignItems:"flex-end" }}>
          <span style={{ padding:"3px 10px",borderRadius:999,fontSize:11,fontWeight:600,textTransform:"capitalize",
            background:repayment.trusteeApprovedAt?"rgba(0,255,194,0.1)":repayment.adminApprovedAt?"rgba(251,191,36,0.1)":isOverdue?"rgba(239,68,68,0.1)":"rgba(255,255,255,0.06)",
            color:repayment.trusteeApprovedAt?T.mint:repayment.adminApprovedAt?"#fbbf24":isOverdue?"#ef4444":T.muted }}>
            {repayment.trusteeApprovedAt?"Confirmed":repayment.adminApprovedAt?"Partial":isOverdue?"Overdue":"Pending"}
          </span>
          {/* Admin authorisation — always show when not yet admin-approved */}
          {isAdmin && !repayment.adminApprovedAt && (
            <div style={{ display:"flex",flexDirection:"column",gap:8,alignItems:"flex-end" }}>
              <div style={{ display:"flex",gap:6,alignItems:"center" }}>
                <select value={adminName} onChange={e=>setAdminName(e.target.value)}
                  style={{ background:"rgba(255,255,255,0.08)",border:`1px solid ${T.border}`,borderRadius:8,color:adminName?T.white:T.muted,fontSize:11,padding:"4px 8px",height:30,outline:"none",cursor:"pointer",minWidth:130 }}>
                  <option value="" disabled style={{background:"#0A192F"}}>Admin authorised by…</option>
                  {ADMIN_NAMES.map(n=><option key={n} value={n} style={{background:"#0A192F",color:T.white}}>{n}</option>)}
                </select>
                <button onClick={()=>{ if(adminName) onApproveAdmin({...repayment, approvedByName: adminName}); }}
                  disabled={!adminName}
                  style={{ padding:"4px 10px",borderRadius:8,background:adminName?"rgba(0,255,194,0.15)":"rgba(255,255,255,0.04)",border:`1px solid ${adminName?"rgba(0,255,194,0.3)":T.border}`,color:adminName?T.mint:T.muted,fontSize:11,fontWeight:600,cursor:adminName?"pointer":"not-allowed" }}>
                  Admin Sign ✓
                </button>
              </div>
              <div style={{ display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end" }}>
                <button onClick={()=>onConfirm(repayment)}
                  style={{ padding:"5px 12px",borderRadius:8,background:"rgba(99,91,255,0.12)",border:"1px solid rgba(99,91,255,0.25)",color:T.purple,fontSize:12,fontWeight:600,cursor:"pointer" }}>
                  Confirm Received
                </button>
                {onSendReminder && (
                  <button onClick={()=>onSendReminder(repayment)}
                    style={{ padding:"5px 12px",borderRadius:8,background:"rgba(251,191,36,0.08)",border:"1px solid rgba(251,191,36,0.2)",color:"#fbbf24",fontSize:12,fontWeight:600,cursor:"pointer" }}>
                    ✉️ Email
                  </button>
                )}
                <button onClick={openWhatsApp}
                  style={{ padding:"5px 12px",borderRadius:8,background:"rgba(0,255,194,0.08)",border:"1px solid rgba(0,255,194,0.2)",color:T.mint,fontSize:12,fontWeight:600,cursor:"pointer" }}>
                  💬 WhatsApp
                </button>
              </div>
            </div>
          )}
          {/* Trustee authorisation — show after admin approved, before trustee approved */}
          {(isAdmin || isTrustee) && repayment.adminApprovedAt && !repayment.trusteeApprovedAt && (
            <div style={{ display:"flex",gap:6,alignItems:"center" }}>
              <select value={trusteeName} onChange={e=>setTrusteeName(e.target.value)}
                style={{ background:"rgba(255,255,255,0.08)",border:`1px solid ${T.border}`,borderRadius:8,color:trusteeName?T.white:T.muted,fontSize:11,padding:"4px 8px",height:30,outline:"none",cursor:"pointer",minWidth:140 }}>
                <option value="" disabled style={{background:"#0A192F"}}>Trustee authorised by…</option>
                {TRUSTEE_NAMES.map(n=><option key={n} value={n} style={{background:"#0A192F",color:T.white}}>{n}</option>)}
              </select>
              <button onClick={()=>{ if(trusteeName) onApproveTrustee({...repayment, trusteeName}); }}
                disabled={!trusteeName}
                style={{ padding:"4px 10px",borderRadius:8,background:trusteeName?"rgba(251,191,36,0.12)":"rgba(255,255,255,0.04)",border:`1px solid ${trusteeName?"rgba(251,191,36,0.3)":T.border}`,color:trusteeName?"#fbbf24":T.muted,fontSize:11,fontWeight:600,cursor:trusteeName?"pointer":"not-allowed" }}>
                Trustee Sign ✓
              </button>
            </div>
          )}
          {repayment.trusteeApprovedAt && onDownloadReceipt && (
            <button onClick={()=>onDownloadReceipt(repayment)}
              style={{ padding:"5px 12px",borderRadius:8,background:"rgba(0,255,194,0.08)",border:"1px solid rgba(0,255,194,0.2)",color:T.mint,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5 }}>
              <Download size={12}/> Receipt PDF
            </button>
          )}
          {repayment.trusteeApprovedAt && (
            <button
              onClick={() => onConfirmLender && onConfirmLender(repayment)}
              disabled={!!repayment.lenderConfirmedAt}
              style={{ padding:"5px 12px",borderRadius:8,
                background:repayment.lenderConfirmedAt?"rgba(0,255,194,0.04)":"rgba(255,255,255,0.06)",
                border:`1px solid ${repayment.lenderConfirmedAt?"rgba(0,255,194,0.2)":T.border}`,
                color:repayment.lenderConfirmedAt?T.mint:T.muted,
                fontSize:11,fontWeight:600,cursor:repayment.lenderConfirmedAt?"default":"pointer",
                display:"flex",alignItems:"center",gap:5 }}>
              {repayment.lenderConfirmedAt
                ? <><span style={{color:T.mint}}>✓</span> Lender Confirmed {new Date(repayment.lenderConfirmedAt).toLocaleDateString("en-GB")}</>
                : <>☐ Mark Lender Confirmed</>}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setWaqfDialogOpen(true)}
              style={{ padding:"5px 12px",borderRadius:8,background:existingWaqf>0?"rgba(201,168,76,0.12)":"rgba(255,255,255,0.05)",border:`1px solid ${existingWaqf>0?"rgba(201,168,76,0.35)":T.border}`,color:existingWaqf>0?"#c9a84c":T.muted,fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5 }}>
              🕌 {existingWaqf>0?`Waqf £${existingWaqf.toFixed(2)}`:"Interim Waqf"}
            </button>
          )}
        </div>
      </div>
      {/* Interim Waqf Dialog */}
      <Dialog open={waqfDialogOpen} onOpenChange={setWaqfDialogOpen}>
        <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:16,maxWidth:400 }}>
          <DialogHeader>
            <DialogTitle style={{ color:"#c9a84c",fontSize:16,fontWeight:800 }}>🕌 Interim Waqf — Instalment {repayment.instalment}</DialogTitle>
          </DialogHeader>
          <p style={{ fontSize:12,color:T.muted,margin:"0 0 14px" }}>
            Record a partial Waqf (endowment) on this £{Number(repayment.amount??0).toLocaleString("en-GB",{minimumFractionDigits:2})} repayment.
            The lender is gifting part or all of this instalment back as a permanent endowment.
          </p>
          {existingWaqf > 0 && (
            <p style={{ fontSize:12,color:"#c9a84c",margin:"0 0 10px",fontWeight:600 }}>
              Current Waqf on this instalment: £{existingWaqf.toFixed(2)}
            </p>
          )}
          <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
            <div>
              <Label style={{ color:T.muted,fontSize:11 }}>Waqf Amount (£)</Label>
              <Input
                type="number" min="0.01" max={Number(repayment.amount??0)} step="0.01"
                value={waqfAmt} onChange={e=>setWaqfAmt(e.target.value)}
                placeholder={`e.g. ${Number(repayment.amount??0).toFixed(2)}`}
                style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.white,marginTop:4 }}/>
            </div>
            <div>
              <Label style={{ color:T.muted,fontSize:11 }}>Note (optional)</Label>
              <Input
                value={waqfNote} onChange={e=>setWaqfNote(e.target.value)}
                placeholder="e.g. Gifted for Rimmers Building"
                style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.white,marginTop:4 }}/>
            </div>
            <div style={{ display:"flex",gap:8,justifyContent:"flex-end",marginTop:4 }}>
              <button onClick={()=>setWaqfDialogOpen(false)}
                style={{ padding:"8px 16px",borderRadius:10,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,fontSize:12,fontWeight:600,cursor:"pointer" }}>
                Cancel
              </button>
              <button
                onClick={() => {
                  const amt = parseFloat(waqfAmt);
                  if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
                  if (amt > parseFloat(repayment.amount??"0")) { toast.error(`Cannot exceed £${Number(repayment.amount??0).toFixed(2)}`); return; }
                  onInterimWaqf && onInterimWaqf(repayment, amt, waqfNote);
                  setWaqfDialogOpen(false);
                  setWaqfAmt(""); setWaqfNote("");
                }}
                style={{ padding:"8px 16px",borderRadius:10,background:"rgba(201,168,76,0.15)",border:"1px solid rgba(201,168,76,0.4)",color:"#c9a84c",fontSize:12,fontWeight:700,cursor:"pointer" }}>
                🕌 Confirm Waqf
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function LoanDetailPage({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = ["superadmin","trustee","manager"].includes(user?.role ?? "");
  const isTrustee = user?.role === "trustee" || user?.role === "superadmin";

  const { data, refetch } = trpc.loans.get.useQuery({ id });
  useEffect(() => {
    const loan = data;
    if (loan) {
    }
  }, [data, id]);
  const refetchRep = refetch;

  const approveAdminMutation = trpc.loans.approveAdmin?.useMutation?.({
    onSuccess: () => { toast.success("Admin approval recorded"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const approveTrusteeMutation = trpc.loans.approveTrustee?.useMutation?.({
    onSuccess: () => { toast.success("Trustee approval recorded"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const sendEmailMutation = trpc.loans.sendEmail?.useMutation?.({
    onSuccess: (res: any) => toast.success(`Email sent to ${res?.sentTo ?? loan?.borrowerEmail}`),
    onError: (e: any) => toast.error(e.message),
  });

  const recordRepaymentMutation = trpc.loans.recordRepayment?.useMutation?.({
    onSuccess: () => { toast.success("Repayment recorded"); refetch(); setRepaymentAmount(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const confirmRepMutation = trpc.loans.confirmRepaymentReceived?.useMutation?.({
    onSuccess: () => { toast.success("Repayment confirmed"); refetchRep(); },
    onError: (e: any) => toast.error(e.message),
  });

  const approveRepAdminMutation = trpc.loans.approveRepaymentAdmin?.useMutation?.({
    onSuccess: () => { toast.success("Repayment admin approval recorded"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const approveRepTrusteeMutation = trpc.loans.approveRepaymentTrustee?.useMutation?.({
    onSuccess: () => { toast.success("Repayment trustee approval recorded"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateBorrowerMutation = trpc.loans.updateBorrower?.useMutation?.({
    onSuccess: () => { toast.success("Lender details updated"); refetch(); setEditBorrowerOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const sendReminderMutation = trpc.loans.sendRepaymentReminder?.useMutation?.({
    onSuccess: (res: any) => toast.success(`Reminder sent to ${res?.sentTo}`),
    onError: (e: any) => toast.error(e.message),
  });

  const confirmLenderMutation = trpc.loans.confirmLenderReceipt?.useMutation?.({
    onSuccess: () => { toast.success("Lender receipt confirmed"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const generateStatementMutation = trpc.loans.generateLoanStatement?.useMutation?.({
    onSuccess: (res: any) => {
      if (res?.url) {
        toast.success("Statement ready — opening PDF");
        const opened = window.open(res.url, "_blank");
        if (!opened) { window.location.href = res.url; }
      } else {
        toast.error("Statement generated but no URL returned");
      }
    },
    onError: (e: any) => toast.error(`Statement error: ${e.message}`),
  });

  const emailStatementMutation = trpc.loans.emailLoanStatement?.useMutation?.({
    onSuccess: (res: any) => toast.success(`Statement emailed to ${res?.sentTo}`),
    onError: (e: any) => toast.error(e.message),
  });

  const remindAllOverdueMutation = trpc.loans.remindAllOverdue?.useMutation?.({
    onSuccess: (res: any) => {
      if (res?.count === 0) toast.info('No overdue repayments to remind');
      else toast.success(`Reminder sent for ${res?.count} overdue instalment(s) to ${res?.sentTo}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const genRepPdfMutation = trpc.loans.generateRepaymentPdf?.useMutation?.({
    onSuccess: (res: any) => { if (res?.url) window.open(res.url, "_blank"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const exportScheduleMutation = trpc.loans.exportSchedule?.useMutation?.({
    onSuccess: (res: any) => { if (res?.url) window.open(res.url, "_blank"); },
    onError: (e: any) => toast.error(e.message),
  });

  const interimWaqfMutation = trpc.loans.interimWaqf?.useMutation?.({
    onSuccess: () => { toast.success("🕌 Interim Waqf recorded successfully"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const convertToWaqfMutation = trpc.loans.convertToWaqf?.useMutation?.({
    onSuccess: (res: any) => {
      toast.success("Alhamdulillah! Loan converted to Waqf. Certificate generated and emailed to lender.");
      if (res?.certUrl) window.open(res.certUrl, "_blank");
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const regenerateWaqfCertMutation = trpc.loans.regenerateWaqfCertificate?.useMutation?.({
    onSuccess: (res: any) => {
      toast.success("Certificate regenerated with latest repayment figures");
      if (res?.certUrl) window.open(res.certUrl, "_blank");
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const utils = trpc.useUtils();
  const generatePdfMutation = trpc.loans.generatePdf?.useMutation?.({
    onSuccess: (res: any) => {
      toast.success("PDF regenerated — opening fresh document");
      // Invalidate so View PDF button picks up the new URL
      utils.loans.get.invalidate({ id });
      refetch();
      // Open the freshly generated URL (bypasses any browser cache of old URL)
      if (res?.url) {
        const freshUrl = res.url.includes('?') ? res.url + '&t=' + Date.now() : res.url + '?t=' + Date.now();
        window.open(freshUrl, "_blank");
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [repaymentAmount, setRepaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [repaymentNotes, setRepaymentNotes] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const evidenceFileRef = useRef<HTMLInputElement>(null);
  const [editBorrowerOpen, setEditBorrowerOpen] = useState(false);
  const [waqfConfirmOpen, setWaqfConfirmOpen] = useState(false);
  // Email preview dialog state
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [emailPreviewType, setEmailPreviewType] = useState<"lender"|"statement">("lender");
  const [emailPreviewSubject, setEmailPreviewSubject] = useState("");
  const [emailPreviewBody, setEmailPreviewBody] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editTitle, setEditTitle] = useState("none");

  const loan = data;
  const repayments = (data as any)?.repayments ?? [];

  if (!loan) {
    return (
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244,${T.navy})`,display:"flex",alignItems:"center",justifyContent:"center" }}>
        <div style={{ textAlign:"center",color:T.muted }}>
          <FileText size={40} style={{ opacity:0.3,marginBottom:12 }}/>
          <p>Loading loan details…</p>
        </div>
      </div>
    );
  }

  const termMonths = loan.termUnit==="years" ? (loan.termValue??6)*12 : (loan.termValue??loan.termMonths??6);
  const monthly = (Number(loan.amount)/termMonths).toFixed(2);
  const totalRepaid = repayments.filter((r: any) => r.paidAt).reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0);
  const totalWaqfAmount = repayments.reduce((sum: number, r: any) => sum + Number(r.waqfAmount ?? 0), 0);
  const balance = Math.max(0, Number(loan.amount) - totalRepaid - totalWaqfAmount);
  const fullyApproved = loan.adminApprovedAt && loan.trusteeApprovedAt;
  const waqfConverted = !!(loan as any).waqfConvertedAt;
  const waqfCertUrl = (loan as any).waqfCertificateUrl as string | null | undefined;

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight:"100vh",background:`linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`,padding:24,fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ maxWidth:720,margin:"0 auto" }}>

          {/* Back */}
          <button onClick={()=>setLocation("/loans")}
            style={{ display:"flex",alignItems:"center",gap:8,background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:13,marginBottom:24,padding:0 }}>
            <ArrowLeft size={16}/> Back to Loans
          </button>

          {/* Header */}
          <div style={{ marginBottom:24,animation:"fadeUp 0.4s ease both" }}>
            <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12 }}>
              <div>
                <h1 style={{ fontSize:"clamp(20px,3vw,28px)",fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.03em" }}>
                  {(loan as any).borrowerTitle && (loan as any).borrowerTitle !== 'none' ? `${(loan as any).borrowerTitle} ` : ''}{loan.borrowerName}
                </h1>
                <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>{loan.borrowerEmail}</p>
              </div>
              <div style={{ display:"flex",gap:8,alignItems:"center",flexWrap:"wrap" }}>
                <span style={{ padding:"5px 14px",borderRadius:999,fontSize:12,fontWeight:700,textTransform:"capitalize",
                  background:fullyApproved?"rgba(0,255,194,0.1)":!fullyApproved?"rgba(251,191,36,0.1)":"rgba(99,91,255,0.12)",
                  color:fullyApproved?T.mint:!fullyApproved?"#fbbf24":"#a78bfa" }}>
                  {fullyApproved?"Fully Approved":loan.status}
                </span>
                {waqfConverted && (
                  <span style={{ padding:"5px 14px",borderRadius:999,fontSize:12,fontWeight:700,background:"rgba(201,168,76,0.15)",color:"#c9a84c",display:"flex",alignItems:"center",gap:5 }}>
                    🕌 Waqf Endowment
                  </span>
                )}
                {isAdmin && (
                  <button onClick={() => { setEditName(loan.borrowerName??''); setEditEmail(loan.borrowerEmail??''); setEditPhone((loan as any).borrowerPhone??''); setEditAddress((loan as any).borrowerAddress??''); setEditTitle((loan as any).borrowerTitle??'none'); setEditBorrowerOpen(true); }} // label: Edit Lender Details
                    style={{ padding:"5px 12px",borderRadius:999,fontSize:11,fontWeight:600,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,cursor:"pointer" }}>
                    ✏️ Edit Details
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Loan details — 2×2 big cards */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:12,animation:"fadeUp 0.5s ease 100ms both" }}>
            {[
              { label:"Loan Amount", value:`£${Number(loan.amount).toLocaleString()}`, color:T.mint, icon:DollarSign },
              { label:"Balance", value:`£${balance.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`, color: balance === 0 ? "#22c55e" : "#f87171", icon:DollarSign },
              { label:"Term & Monthly", value:`${loan.termValue} ${loan.termUnit??"months"}`, sub:`£${monthly}/mo`, color:T.purple, icon:Calendar },
              { label:"Repaid", value:`£${totalRepaid.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`, sub: totalWaqfAmount > 0 ? `+£${totalWaqfAmount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} waqf` : undefined, color:"#22c55e", icon:Check },
            ].map((s: any,i: number)=>(
              <div key={s.label} style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:"20px 18px",animation:`fadeUp 0.5s ease ${i*60}ms both` }}>
                <div style={{ width:36,height:36,borderRadius:10,background:`${s.color}22`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:12 }}>
                  <s.icon size={16} style={{color:s.color}}/>
                </div>
                <p style={{ fontSize:20,fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.02em" }}>{s.value}</p>
                {s.sub && <p style={{ fontSize:12,color:s.color,margin:"3px 0 0",fontWeight:700 }}>{s.sub}</p>}
                <p style={{ fontSize:11,color:T.muted,margin:"4px 0 0" }}>{s.label}</p>
              </div>
            ))}
          </div>
          {/* Purpose — slim full-width bar */}
          {loan.purpose && (
            <div style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"10px 16px",marginBottom:24,display:"flex",alignItems:"center",gap:10,animation:"fadeUp 0.5s ease 240ms both" }}>
              <div style={{ width:28,height:28,borderRadius:8,background:"rgba(245,158,11,0.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <User size={13} style={{color:"#f59e0b"}}/>
              </div>
              <div style={{ minWidth:0 }}>
                <p style={{ margin:0,fontSize:12,color:T.white,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{loan.purpose}</p>
                <p style={{ margin:0,fontSize:10,color:T.muted }}>Purpose</p>
              </div>
            </div>
          )}

          {/* Dual approval */}
          <div style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:24,marginBottom:20,animation:"fadeUp 0.5s ease 200ms both" }}>
            <h2 style={{ fontSize:15,fontWeight:700,color:T.white,margin:"0 0 16px" }}>Dual Approval Required</h2>
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              <ApprovalBox
                label="Admin Approval"
                approved={!!loan.adminApprovedAt}
                approvedBy={loan.adminApprovedByName}
                approvedAt={loan.adminApprovedAt}
                canApprove={isAdmin && !loan.adminApprovedAt}
                onApprove={(name) => approveAdminMutation?.mutate?.({ id, approvedByName: name })}
                loading={approveAdminMutation?.isPending}
                names={ADMIN_NAMES}
              />
              <ApprovalBox
                label="Trustee Approval"
                approved={!!loan.trusteeApprovedAt}
                approvedBy={(loan as any).trusteeName}
                approvedAt={loan.trusteeApprovedAt}
                canApprove={isTrustee && !loan.trusteeApprovedAt}
                onApprove={(name) => approveTrusteeMutation?.mutate?.({ id, trusteeName: name })}
                loading={approveTrusteeMutation?.isPending}
                names={TRUSTEE_NAMES}
              />
            </div>
            {fullyApproved && (
              <div style={{ marginTop:14,padding:"12px 16px",borderRadius:12,background:"rgba(0,255,194,0.08)",border:"1px solid rgba(0,255,194,0.2)",display:"flex",alignItems:"center",gap:8 }}>
                <CheckCircle2 size={16} style={{color:T.mint}}/>
                <p style={{ fontSize:13,color:T.mint,margin:0,fontWeight:600 }}>Loan fully approved — lender notified via email &amp; WhatsApp</p>
              </div>
            )}
          </div>

          {/* Actions */}
          {fullyApproved && (
            <div style={{ display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",animation:"fadeUp 0.5s ease 280ms both" }}>
              {(loan as any).agreementPdfUrl && (
                <Button onClick={() => window.open((loan as any).agreementPdfUrl, "_blank")}
                  style={{ background:"rgba(99,91,255,0.15)",border:"1px solid rgba(99,91,255,0.3)",color:T.purple,borderRadius:12,padding:"10px 18px",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:7 }}>
                  <FileText size={14}/> View PDF
                </Button>
              )}
              {isAdmin && (
                <Button
                  onClick={() => generatePdfMutation?.mutate?.({ id })}
                  disabled={generatePdfMutation?.isPending}
                  style={{ background:"rgba(99,91,255,0.08)",border:"1px solid rgba(99,91,255,0.2)",color:T.purple,borderRadius:12,padding:"10px 18px",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:7 }}>
                  <FileText size={14}/> {generatePdfMutation?.isPending ? "Generating…" : (loan as any).agreementPdfUrl ? "Regenerate PDF" : "Generate PDF"}
                </Button>
              )}
              <Button onClick={() => {
                  let phone = (loan as any).borrowerPhone?.replace(/\D/g,"") ?? "";
                  if (!phone) { toast.error("No phone number on file for this lender"); return; }
                  if (phone.startsWith("0")) phone = "44" + phone.slice(1);
                  else if (!phone.startsWith("44") && phone.length <= 10) phone = "44" + phone;
                  const lenderName = (loan as any).borrowerName ?? "";
                  const firstName = lenderName.split(" ")[0] || "";
                  const amt = Number((loan as any).amount ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2 });
                  const waMsg = encodeURIComponent(
`Assalamu Alaikum ${firstName},

May Allah reward your immense generosity. This is to confirm that your interest-free loan (Qarde Hasan) of £${amt} has been safely registered towards the Rimmers building purchase.

By helping us secure this space for prayer and community, you are laying bricks for your own home in Jannah, Insha'Allah. Your funds are held as an Amanah (trust) and will be managed with the highest transparency.

BarakAllahu Feekum,
The AQS Team`);
                  window.location.href = `https://wa.me/${phone}?text=${waMsg}`;
                }}
                style={{ background:"rgba(0,255,194,0.1)",border:"1px solid rgba(0,255,194,0.2)",color:T.mint,borderRadius:12,padding:"10px 18px",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:7 }}>
                <MessageCircle size={14}/> WhatsApp
              </Button>
              {loan.borrowerEmail ? (
                <Button
                  onClick={() => {
                    const fn = (loan.borrowerName ?? "").split(" ")[0];
                    const lenderTitle = (loan as any).borrowerTitle && (loan as any).borrowerTitle !== "none" ? (loan as any).borrowerTitle : "";
                    const lenderSalutation = lenderTitle ? `Dear ${lenderTitle} ${fn},` : `Dear ${fn},`;
                    const remaining = Math.max(0, parseFloat(String(loan.amount ?? 0)) - parseFloat(String((loan as any).totalRepaid ?? 0)));
                    const pdfLink = (loan as any).agreementPdfUrl ? `\n\n📄 View Agreement: ${(loan as any).agreementPdfUrl}` : "";
                    setEmailPreviewType("lender");
                    const startDate = (loan as any).createdAt ? new Date((loan as any).createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : 'the date of your agreement';
                    setEmailPreviewSubject("An Update from the Abdullah Quilliam Society – Rimmers Building Project");
                    setEmailPreviewBody(`Assalamu Alaikum wa Rahmatullahi wa Barakatuh,\n\n${lenderSalutation}\n\nWe pray this message finds you and your family in the best of health and Iman.\n\nWe wanted to take a moment to update you on the progress of the AQS Rimmers Building Project — a project made possible through the generous Qarde Hasan (interest-free loans) of our community, including your own.\n\nYour Amanah with the Abdullah Quilliam Society began on ${startDate}, and since then, the project has continued to move forward, Alhamdulillah. The building is being prepared as a permanent House of Allah for the Muslim community of Liverpool and beyond.\n\nWe are deeply grateful for your trust, patience, and commitment to this cause. Every contribution — large or small — is a brick in the foundation of something that will benefit the Ummah for generations to come, in sha Allah.${pdfLink}\n\nThe Prophet (PBUH) said: \"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah.\"\n\nMay Allah (SWT) accept this from you as a Sadaqah Jariyah, reward you abundantly in this life and the next, and make it a source of ongoing blessings for you and your family.\n\nIf you have any questions or would like to discuss anything, please do not hesitate to get in touch.\n\nJazakAllahu Khayran. May Allah reward you with goodness.\n\nWith our sincere prayers and gratitude.\n\nWassalamu alaikum,\nDr Abdul Hamid (Chair)\nOn behalf of the Board of Trustees\nAbdullah Quilliam Society\n8-10 Brougham Terrace, Liverpool, L6 1AE\nadmin@abdullahquilliam.org`);
                    setEmailPreviewOpen(true);
                  }}
                  style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.white,borderRadius:12,padding:"10px 18px",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:7 }}>
                  <Mail size={14}/> Email Lender
                </Button>
              ) : null}
              {fullyApproved && (
                <Button
                  onClick={() => {
                    toast.info("Generating statement PDF…");
                    generateStatementMutation?.mutate?.({ id });
                  }}
                  disabled={generateStatementMutation?.isPending}
                  style={{ background:"rgba(251,191,36,0.08)",border:"1px solid rgba(251,191,36,0.2)",color:"#fbbf24",borderRadius:12,padding:"10px 18px",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:7 }}>
                  <FileText size={14}/> {generateStatementMutation?.isPending ? "Generating…" : "Loan Statement"}
                </Button>
              )}
              {fullyApproved && loan.borrowerEmail && (
                <Button
                  onClick={() => {
                    const fn = (loan.borrowerName ?? "").split(" ")[0];
                    const stmtTitle = (loan as any).borrowerTitle && (loan as any).borrowerTitle !== "none" ? (loan as any).borrowerTitle : "";
                    const stmtSalutation = stmtTitle ? `Dear ${stmtTitle} ${fn},` : `Dear ${fn},`;
                    const allReps = (loan as any).repayments ?? [];
                    const totalPaid = allReps.filter((r: any) => r.paidAt).reduce((s: number, r: any) => s + parseFloat(r.amount ?? "0"), 0);
                    const waqfEndowed = allReps.reduce((s: number, r: any) => s + parseFloat(r.waqfAmount ?? "0"), 0);
                    const isWaqf = !!(loan as any).waqfConvertedAt || waqfEndowed > 0;
                    const outstanding = Math.max(0, parseFloat(String(loan.amount ?? 0)) - totalPaid - (isWaqf ? waqfEndowed : 0));
                    const endowmentLine = isWaqf ? `\nEndowment (Waqf): £${waqfEndowed.toFixed(2)}` : "";
                    setEmailPreviewType("statement");
                    setEmailPreviewSubject(`Qarde Hasan Amanah Statement — ${new Date().toLocaleDateString("en-GB")} — AQ Society`);
                    setEmailPreviewBody(`Assalamu Alaikum wa Rahmatullahi wa Barakatuh,\n\n${stmtSalutation}\n\nMay Allah (SWT) bless you and your family abundantly. Please find below your Qarde Hasan Amanah Statement for the Rimmers Building Project as of ${new Date().toLocaleDateString("en-GB")}.\n\nLoan Amount: £${parseFloat(String(loan.amount ?? 0)).toFixed(2)}\nTotal Paid: £${totalPaid.toFixed(2)}${endowmentLine}\nOutstanding Balance: £${outstanding.toFixed(2)}\n\nYour generosity is a pillar of this House of Allah. JazakAllahu Khayran for your patience, generosity, and continued support of the AQ Society.\n\nJazakAllahu Khayran. May Allah reward you with goodness.\n\nWith our sincere prayers and gratitude.\n\nWassalamu alaikum,\nDr Abdul Hamid (Chair)\nOn behalf of the Board of Trustees\nAbdullah Quilliam Society\n8-10 Brougham Terrace, Liverpool, L6 1AE\nadmin@abdullahquilliam.org`);
                    setEmailPreviewOpen(true);
                  }}
                  style={{ background:"rgba(251,191,36,0.05)",border:"1px solid rgba(251,191,36,0.15)",color:"#fbbf24",borderRadius:12,padding:"10px 18px",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:7 }}>
                  <Mail size={14}/> Email Statement
                </Button>
              )}
              {fullyApproved && !waqfConverted && (
                <Button
                  onClick={() => setWaqfConfirmOpen(true)}
                  style={{ background:"rgba(201,168,76,0.1)",border:"1px solid rgba(201,168,76,0.3)",color:"#c9a84c",borderRadius:12,padding:"10px 18px",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:7 }}>
                  🕌 Convert to Waqf
                </Button>
              )}
              {waqfConverted && waqfCertUrl && (
                <Button
                  onClick={() => window.open(waqfCertUrl, "_blank")}
                  style={{ background:"rgba(201,168,76,0.15)",border:"1px solid rgba(201,168,76,0.4)",color:"#c9a84c",borderRadius:12,padding:"10px 18px",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:7 }}>
                  <FileText size={14}/> Certificate of Waqf
                </Button>
              )}
              {waqfConverted && isAdmin && (
                <Button
                  onClick={() => regenerateWaqfCertMutation?.mutate?.({ id })}
                  disabled={regenerateWaqfCertMutation?.isPending}
                  style={{ background:"rgba(201,168,76,0.07)",border:"1px solid rgba(201,168,76,0.25)",color:"rgba(201,168,76,0.7)",borderRadius:12,padding:"10px 18px",fontWeight:600,fontSize:12,display:"flex",alignItems:"center",gap:7 }}>
                  🔄 {regenerateWaqfCertMutation?.isPending ? "Regenerating…" : "Regenerate Certificate"}
                </Button>
              )}
            </div>
          )}

          {/* Edit Borrower Dialog */}
          <Dialog open={editBorrowerOpen} onOpenChange={setEditBorrowerOpen}>
            <DialogContent style={{ background:"#0D2240",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:480 }}>
              <DialogHeader>
                <DialogTitle style={{ color:T.white,fontSize:17,fontWeight:800 }}>Edit Lender Details</DialogTitle>
              </DialogHeader>
              <div style={{ display:"flex",flexDirection:"column",gap:14,marginTop:8 }}>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Title / Salutation</Label>
                  <select value={editTitle} onChange={e=>setEditTitle(e.target.value)}
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:42,width:"100%",padding:"0 12px",fontSize:14 }}>
                    {["none","Brother","Sister","Dr.","Hajji","Hajjah","Sheikh"].map(t => (
                      <option key={t} value={t} style={{ background:"#0D2240" }}>{t === "none" ? "— No title —" : t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Full Name</Label>
                  <Input value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Full name"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:42 }}/>
                </div>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Email</Label>
                  <Input value={editEmail} onChange={e=>setEditEmail(e.target.value)} type="email" placeholder="email@example.com"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:42 }}/>
                </div>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Phone Number</Label>
                  <Input value={editPhone} onChange={e=>setEditPhone(e.target.value)} type="tel" placeholder="+44 7700 000000"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:42 }}/>
                </div>
                <div>
                  <Label style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Address (optional)</Label>
                  <Input value={editAddress} onChange={e=>setEditAddress(e.target.value)} placeholder="Street, City"
                    style={{ marginTop:6,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:42 }}/>
                </div>
                <Button
                  disabled={updateBorrowerMutation?.isPending}
                  onClick={() => updateBorrowerMutation?.mutate?.({ id, borrowerName:editName||undefined, borrowerEmail:editEmail||undefined, borrowerPhone:editPhone||undefined, borrowerAddress:editAddress||undefined, borrowerTitle:(editTitle as any)||undefined })}
                  style={{ background:`linear-gradient(135deg,${T.mint},#00DDB0)`,color:"#081526",fontWeight:700,height:44,borderRadius:12,border:"none",fontSize:14,marginTop:4 }}>
                  {updateBorrowerMutation?.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Waqf Conversion Confirmation Dialog */}
          <Dialog open={waqfConfirmOpen} onOpenChange={setWaqfConfirmOpen}>
            <DialogContent style={{ background:"#0D2240",border:"1px solid rgba(201,168,76,0.3)",borderRadius:20,maxWidth:480 }}>
              <DialogHeader>
                <DialogTitle style={{ color:"#c9a84c",fontSize:17,fontWeight:800 }}>🕌 Convert Loan to Waqf (Endowment)</DialogTitle>
              </DialogHeader>
              <div style={{ display:"flex",flexDirection:"column",gap:16,marginTop:8 }}>
                <p style={{ fontSize:13,color:"rgba(255,255,255,0.8)",lineHeight:1.7,margin:0 }}>
                  You are about to permanently convert <strong style={{color:"#c9a84c"}}>{loan.borrowerName}</strong>'s
                  Qarde Hasan Amanah of <strong style={{color:"#c9a84c"}}>£{Number(loan.amount).toLocaleString("en-GB",{minimumFractionDigits:2})}</strong> to
                  a <strong style={{color:"#c9a84c"}}>Waqf (Permanent Endowment)</strong> for the Rimmers Building Project.
                </p>
                <div style={{ background:"rgba(201,168,76,0.08)",border:"1px solid rgba(201,168,76,0.2)",borderRadius:12,padding:"14px 16px" }}>
                  <p style={{ fontSize:12,color:"#c9a84c",margin:0,lineHeight:1.6 }}>
                    <em>"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah."</em>
                  </p>
                  <p style={{ fontSize:11,color:"rgba(255,255,255,0.5)",margin:"6px 0 0" }}>— Hadith</p>
                </div>
                <p style={{ fontSize:12,color:"rgba(255,255,255,0.5)",margin:0 }}>
                  This action is <strong style={{color:"#f87171"}}>irreversible</strong>. A Certificate of Waqf will be generated
                  and emailed to the lender. The balance will be moved to the AQS Endowment Register.
                </p>
                <div style={{ display:"flex",gap:10,marginTop:4 }}>
                  <Button
                    onClick={() => setWaqfConfirmOpen(false)}
                    style={{ flex:1,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.muted,borderRadius:10,height:42,fontWeight:600 }}>
                    Cancel
                  </Button>
                  <Button
                    disabled={convertToWaqfMutation?.isPending}
                    onClick={() => { convertToWaqfMutation?.mutate?.({ id }); setWaqfConfirmOpen(false); }}
                    style={{ flex:2,background:"linear-gradient(135deg,#c9a84c,#e8c56a)",color:"#1a1a1a",border:"none",borderRadius:10,height:42,fontWeight:700,fontSize:14 }}>
                    {convertToWaqfMutation?.isPending ? "Converting…" : "🕌 Confirm Waqf Conversion"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Waqf Banner (shown after conversion) */}
          {waqfConverted && (
            <div style={{ background:"rgba(201,168,76,0.08)",border:"1px solid rgba(201,168,76,0.25)",borderRadius:14,padding:"16px 20px",marginBottom:20,animation:"fadeUp 0.4s ease both" }}>
              <p style={{ fontSize:13,fontWeight:700,color:"#c9a84c",margin:"0 0 4px" }}>🕌 This Amanah has been converted to a Waqf (Permanent Endowment)</p>
              <p style={{ fontSize:12,color:"rgba(255,255,255,0.5)",margin:0 }}>
                Converted on {new Date((loan as any).waqfConvertedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}
                {waqfCertUrl && <> &middot; <a href={waqfCertUrl} target="_blank" rel="noreferrer" style={{color:"#c9a84c",textDecoration:"underline"}}>View Certificate of Waqf</a></>}
                {isAdmin && <> &middot; <button onClick={() => regenerateWaqfCertMutation?.mutate?.({ id })} disabled={regenerateWaqfCertMutation?.isPending} style={{background:"none",border:"none",color:"rgba(201,168,76,0.6)",fontSize:12,cursor:"pointer",textDecoration:"underline",padding:0}}>{regenerateWaqfCertMutation?.isPending ? "Regenerating…" : "Regenerate"}</button></>}
              </p>
            </div>
          )}

          {/* Notes */}
          {loan.termNotes && (
            <div style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:"16px 20px",marginBottom:20,animation:"fadeUp 0.5s ease 340ms both" }}>
              <p style={{ fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6 }}>Notes</p>
              <p style={{ fontSize:13,color:"rgba(255,255,255,0.75)",margin:0,lineHeight:1.6 }}>{loan.termNotes}</p>
            </div>
          )}

          {/* Repayment schedule */}
          <div style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:24,animation:"fadeUp 0.5s ease 400ms both" }}>
            <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:4 }}>
              <h2 style={{ fontSize:15,fontWeight:700,color:T.white,margin:0 }}>Repayment Schedule</h2>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                {isAdmin && (
                  <button
                    onClick={() => exportScheduleMutation?.mutate?.({ id })}
                    disabled={exportScheduleMutation?.isPending}
                    style={{ display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:9,background:"rgba(0,255,194,0.08)",border:"1px solid rgba(0,255,194,0.2)",color:T.mint,fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap" }}>
                    <Download size={12}/> {exportScheduleMutation?.isPending ? "Generating…" : "Export Schedule"}
                  </button>
                )}
                {isAdmin && fullyApproved && loan.borrowerEmail && (
                  <button
                    onClick={() => remindAllOverdueMutation?.mutate?.({ loanId: id })}
                    disabled={remindAllOverdueMutation?.isPending}
                    style={{ display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:9,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",color:"#f87171",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap" }}>
                    <Mail size={12}/> {remindAllOverdueMutation?.isPending ? "Sending…" : "Remind All Overdue"}
                  </button>
                )}
              </div>
            </div>
            <p style={{ fontSize:12,color:T.muted,margin:"0 0 16px" }}>
              {termMonths} monthly payments of £{monthly} · Started {loan.createdAt ? new Date(loan.createdAt).toLocaleDateString("en-GB") : "—"}
            </p>
            {repayments.length === 0 ? (
              <div style={{ textAlign:"center",padding:"32px 0",color:T.muted }}>
                <p style={{ fontSize:13 }}>No repayments recorded yet</p>
              </div>
            ) : repayments.map((rep: any, i: number) => (
              <RepaymentRow
                key={rep.id??i}
                repayment={{ ...rep, instalment: i+1, borrowerName: (loan as any).borrowerName }}
                isAdmin={isAdmin}
                isTrustee={isTrustee}
                borrowerPhone={(loan as any).borrowerPhone}
                onConfirm={(r: any) => confirmRepMutation?.mutate?.({ repaymentId:r.id })}
                onApproveAdmin={(r: any) => approveRepAdminMutation?.mutate?.({ repaymentId: r.id, approvedByName: r.approvedByName })}
                onApproveTrustee={(r: any) => approveRepTrusteeMutation?.mutate?.({ repaymentId: r.id, trusteeName: r.trusteeName })}
                onSendReminder={(r: any) => sendReminderMutation?.mutate?.({ repaymentId: r.id })}
                onDownloadReceipt={(r: any) => {
                  if (r.confirmationPdfUrl) { window.open(r.confirmationPdfUrl, "_blank"); }
                  else { genRepPdfMutation?.mutate?.({ repaymentId: r.id }); }
                }}
                onConfirmLender={(r: any) => confirmLenderMutation?.mutate?.({ repaymentId: r.id })}
                onInterimWaqf={(r: any, amt: number, note: string) => interimWaqfMutation?.mutate?.({ repaymentId: r.id, waqfAmount: amt, waqfNote: note || undefined })}
              />
            ))}

            {/* Add repayment */}
            {isAdmin && fullyApproved && (
              <div style={{ marginTop:16,padding:"14px 16px",borderRadius:12,background:"rgba(255,255,255,0.03)",border:`1px solid ${T.border}` }}>
                <p style={{ fontSize:12,color:T.muted,marginBottom:10,fontWeight:600 }}>RECORD REPAYMENT</p>
                <div style={{ display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap" }}>
                  <div style={{ flex:"1 1 120px",minWidth:100 }}>
                    <Input
                      type="number" step="0.01" placeholder={`£${monthly}`}
                      value={repaymentAmount}
                      onChange={e => setRepaymentAmount(e.target.value)}
                      style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:42 }}/>
                  </div>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    style={{ flex:"1 1 130px",minWidth:120,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:42,padding:"0 12px",fontSize:13,outline:"none",cursor:"pointer" }}>
                    <option value="bank_transfer" style={{background:"#0A192F"}}>Bank Transfer</option>
                    <option value="cash" style={{background:"#0A192F"}}>Cash</option>
                    <option value="cheque" style={{background:"#0A192F"}}>Cheque</option>
                  </select>
                </div>
                {/* Notes field */}
                <div style={{ marginTop:8 }}>
                  <textarea
                    placeholder="Notes (optional) — e.g. partial payment, reference number…"
                    value={repaymentNotes}
                    onChange={e => setRepaymentNotes(e.target.value)}
                    rows={2}
                    style={{ width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,padding:"8px 12px",fontSize:12,resize:"vertical",outline:"none",fontFamily:"inherit",boxSizing:"border-box" }}/>
                </div>
                <div style={{ display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap",marginTop:8 }}>
                  <Button
                    disabled={!repaymentAmount || recordRepaymentMutation?.isPending}
                    onClick={() => {
                      if (!repaymentAmount) return;
                      recordRepaymentMutation?.mutate?.({
                        loanId: id,
                        amount: repaymentAmount,
                        paymentMethod,
                        notes: repaymentNotes || undefined,
                        evidenceUrl: evidenceUrl || undefined,
                      });
                    }}
                    style={{ background: repaymentAmount ? `linear-gradient(135deg,${T.purple},#4f46e5)` : "rgba(99,91,255,0.2)",color:T.white,border:"none",borderRadius:10,height:42,padding:"0 18px",fontWeight:700,fontSize:13,cursor:repaymentAmount?"pointer":"not-allowed" }}>
                    {recordRepaymentMutation?.isPending ? "Saving…" : "+ Add"}
                  </Button>
                </div>
                {/* Evidence upload */}
                <div style={{ marginTop:10,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
                  <input ref={evidenceFileRef} type="file" accept="image/*,application/pdf" style={{ display:"none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setEvidenceUploading(true);
                      try {
                        const fd = new FormData();
                        fd.append("file", file);
                        fd.append("key", `loan-evidence/${id}-${Date.now()}.${file.name.split('.').pop()}`);
                        const res = await fetch("/api/upload", { method:"POST", body:fd });
                        if (!res.ok) throw new Error("Upload failed");
                        const data = await res.json();
                        setEvidenceUrl(data.url);
                        toast.success("Evidence uploaded");
                      } catch (err: any) {
                        toast.error(err.message ?? "Upload failed");
                      } finally {
                        setEvidenceUploading(false);
                        if (evidenceFileRef.current) evidenceFileRef.current.value = "";
                      }
                    }}/>
                  <button
                    onClick={() => evidenceFileRef.current?.click()}
                    disabled={evidenceUploading}
                    style={{ display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:9,background:"rgba(255,255,255,0.05)",border:`1px solid ${T.border}`,color:T.muted,fontSize:12,fontWeight:600,cursor:"pointer" }}>
                    <Upload size={13}/> {evidenceUploading ? "Uploading…" : "📷 Add Evidence"}
                  </button>
                  {evidenceUrl && (
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <a href={evidenceUrl} target="_blank" rel="noreferrer"
                        style={{ fontSize:11,color:T.mint,textDecoration:"none" }}>View evidence ↗</a>
                      <button onClick={() => setEvidenceUrl("")}
                        style={{ background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:13,padding:0 }}>✕</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Email Preview Dialog */}
      <Dialog open={emailPreviewOpen} onOpenChange={setEmailPreviewOpen}>
        <DialogContent style={{ background:"#1a2035",border:"1px solid rgba(255,255,255,0.1)",borderRadius:16,maxWidth:540,width:"calc(100vw - 32px)",padding:0,overflow:"hidden" }}>
          <DialogHeader style={{ padding:"20px 24px 0" }}>
            <DialogTitle style={{ color:"#fff",fontSize:16,fontWeight:700 }}>
              <Mail size={16} style={{ display:"inline",marginRight:8,verticalAlign:"middle" }}/>
              {emailPreviewType === "lender" ? "Email Lender" : "Email Statement"} — Preview
            </DialogTitle>
          </DialogHeader>
          <div style={{ padding:"16px 24px 24px",display:"flex",flexDirection:"column",gap:14 }}>
            <div>
              <label style={{ fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:"0.07em",display:"block",marginBottom:6 }}>Subject</label>
              <input
                value={emailPreviewSubject}
                onChange={e => setEmailPreviewSubject(e.target.value)}
                style={{ width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:9,padding:"9px 12px",color:"#fff",fontSize:13,outline:"none",boxSizing:"border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:"0.07em",display:"block",marginBottom:6 }}>Message Body</label>
              <textarea
                value={emailPreviewBody}
                onChange={e => setEmailPreviewBody(e.target.value)}
                rows={10}
                style={{ width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:9,padding:"9px 12px",color:"#fff",fontSize:12,outline:"none",resize:"vertical",lineHeight:1.6,fontFamily:"inherit",boxSizing:"border-box" }}
              />
            </div>
            <p style={{ fontSize:11,color:"rgba(255,255,255,0.35)",margin:0 }}>
              To: {loan.borrowerName} &lt;{loan.borrowerEmail}&gt;
            </p>
            <div style={{ display:"flex",gap:10 }}>
              <Button
                onClick={() => setEmailPreviewOpen(false)}
                style={{ flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.5)",borderRadius:10,height:42,fontWeight:600 }}>
                Cancel
              </Button>
              <Button
                disabled={sendEmailMutation?.isPending || emailStatementMutation?.isPending}
                onClick={() => {
                  if (emailPreviewType === "lender") {
                    sendEmailMutation?.mutate?.({ id, type: "custom", customSubject: emailPreviewSubject, customBody: emailPreviewBody.replace(/\n/g, "<br>") });
                  } else {
                    emailStatementMutation?.mutate?.({ id });
                  }
                  setEmailPreviewOpen(false);
                }}
                style={{ flex:2,background:"linear-gradient(135deg,#1a4731,#2d6a4f)",color:"#fff",border:"none",borderRadius:10,height:42,fontWeight:700,fontSize:14 }}>
                <Mail size={15} style={{ display:"inline",marginRight:6,verticalAlign:"middle" }}/>
                {sendEmailMutation?.isPending || emailStatementMutation?.isPending ? "Sending…" : "Send Email"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
