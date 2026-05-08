import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useState, useRef } from "react";
import {
  ArrowLeft, CheckCircle2, Clock, XCircle, Download,
  Upload, MessageCircle, Mail, Calendar, DollarSign, User, FileText
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

function RepaymentRow({ repayment, isAdmin, isTrustee, onConfirm, onApproveTrustee, onApproveAdmin }: any) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ padding:"14px 0",borderBottom:`1px solid ${T.border}` }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10 }}>
        <div>
          <p style={{ fontSize:13,fontWeight:600,color:T.white,margin:0 }}>
            Instalment {repayment.instalment ?? "#"} — £{Number(repayment.amount??0).toLocaleString("en-GB",{minimumFractionDigits:2})}
          </p>
          <p style={{ fontSize:11,color:T.muted,margin:"2px 0 0" }}>
            Due: {repayment.dueDate ? new Date(repayment.dueDate).toLocaleDateString("en-GB") : "—"}
          </p>
          {repayment.adminApprovedAt && (
            <p style={{ fontSize:11,color:T.mint,margin:"2px 0 0" }}>✓ Admin · {repayment.trusteeApprovedAt ? "✓ Trustee · Fully confirmed" : "Awaiting trustee"}</p>
          )}
        </div>
        <div style={{ display:"flex",gap:8,alignItems:"center" }}>
          <span style={{ padding:"3px 10px",borderRadius:999,fontSize:11,fontWeight:600,textTransform:"capitalize",
            background:repayment.trusteeApprovedAt?"rgba(0,255,194,0.1)":repayment.adminApprovedAt?"rgba(251,191,36,0.1)":"rgba(255,255,255,0.06)",
            color:repayment.trusteeApprovedAt?T.mint:repayment.adminApprovedAt?"#fbbf24":T.muted }}>
            {repayment.trusteeApprovedAt?"Confirmed":repayment.adminApprovedAt?"Partial":"Pending"}
          </span>
          {isAdmin && !repayment.adminApprovedAt && (
            <button onClick={()=>onConfirm(repayment)}
              style={{ padding:"5px 12px",borderRadius:8,background:"rgba(99,91,255,0.12)",border:"1px solid rgba(99,91,255,0.25)",color:T.purple,fontSize:12,fontWeight:600,cursor:"pointer" }}>
              Confirm Received
            </button>
          )}
          {isAdmin && repayment.adminApprovedAt && !repayment.trusteeApprovedAt && (
            <button onClick={()=>onApproveAdmin(repayment)}
              style={{ padding:"5px 12px",borderRadius:8,background:"rgba(0,255,194,0.1)",border:"1px solid rgba(0,255,194,0.2)",color:T.mint,fontSize:12,fontWeight:600,cursor:"pointer" }}>
              Admin Sign
            </button>
          )}
          {isTrustee && repayment.adminApprovedAt && !repayment.trusteeApprovedAt && (
            <button onClick={()=>onApproveTrustee(repayment)}
              style={{ padding:"5px 12px",borderRadius:8,background:"rgba(251,191,36,0.1)",border:"1px solid rgba(251,191,36,0.2)",color:"#fbbf24",fontSize:12,fontWeight:600,cursor:"pointer" }}>
              Trustee Sign
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoanDetailPage({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = ["superadmin","trustee","manager"].includes(user?.role ?? "");
  const isTrustee = user?.role === "trustee" || user?.role === "superadmin";

  const { data, refetch } = trpc.loans.get.useQuery({ id });
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

  const [repaymentAmount, setRepaymentAmount] = useState("");

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
  const fullyApproved = loan.adminApprovedAt && loan.trusteeApprovedAt;

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
                  {loan.borrowerName}
                </h1>
                <p style={{ fontSize:13,color:T.muted,margin:"4px 0 0" }}>{loan.borrowerEmail}</p>
              </div>
              <span style={{ padding:"5px 14px",borderRadius:999,fontSize:12,fontWeight:700,textTransform:"capitalize",
                background:fullyApproved?"rgba(0,255,194,0.1)":!fullyApproved?"rgba(251,191,36,0.1)":"rgba(99,91,255,0.12)",
                color:fullyApproved?T.mint:!fullyApproved?"#fbbf24":"#a78bfa" }}>
                {fullyApproved?"Fully Approved":loan.status}
              </span>
            </div>
          </div>

          {/* Loan details */}
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:14,marginBottom:24,animation:"fadeUp 0.5s ease 100ms both" }}>
            {[
              { label:"Loan Amount", value:`£${Number(loan.amount).toLocaleString()}`, color:T.mint, icon:DollarSign },
              { label:"Term", value:`${loan.termValue} ${loan.termUnit??"months"}`, color:T.purple, icon:Calendar },
              { label:"Monthly", value:`£${monthly}`, color:"#a78bfa", icon:Calendar },
              { label:"Purpose", value:loan.purpose??"—", color:"#f59e0b", icon:User },
            ].map((s,i)=>(
              <div key={s.label} style={{ background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px 16px",animation:`fadeUp 0.5s ease ${i*60}ms both` }}>
                <div style={{ width:32,height:32,borderRadius:9,background:`${s.color}22`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10 }}>
                  <s.icon size={14} style={{color:s.color}}/>
                </div>
                <p style={{ fontSize:16,fontWeight:800,color:T.white,margin:0,letterSpacing:"-0.02em" }}>{s.value}</p>
                <p style={{ fontSize:11,color:T.muted,margin:0 }}>{s.label}</p>
              </div>
            ))}
          </div>

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
                <p style={{ fontSize:13,color:T.mint,margin:0,fontWeight:600 }}>Loan fully approved — borrower notified via email &amp; WhatsApp</p>
              </div>
            )}
          </div>

          {/* Actions */}
          {fullyApproved && (
            <div style={{ display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",animation:"fadeUp 0.5s ease 280ms both" }}>
              {(loan as any).agreementPdfUrl ? (
                <Button onClick={() => window.open((loan as any).agreementPdfUrl, "_blank")}
                  style={{ background:"rgba(99,91,255,0.15)",border:"1px solid rgba(99,91,255,0.3)",color:T.purple,borderRadius:12,padding:"10px 18px",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:7 }}>
                  <FileText size={14}/> View PDF
                </Button>
              ) : (
                <Button disabled
                  style={{ background:"rgba(99,91,255,0.06)",border:"1px solid rgba(99,91,255,0.15)",color:"rgba(99,91,255,0.4)",borderRadius:12,padding:"10px 18px",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:7,cursor:"not-allowed" }}>
                  <FileText size={14}/> PDF Generating…
                </Button>
              )}
              <Button onClick={() => {
                  const phone = loan.borrowerPhone?.replace(/\D/g,"") ?? "";
                  if (phone) { window.open(`https://wa.me/${phone}`, "_blank"); }
                  else { toast.error("No phone number on file for this borrower"); }
                }}
                style={{ background:"rgba(0,255,194,0.1)",border:"1px solid rgba(0,255,194,0.2)",color:T.mint,borderRadius:12,padding:"10px 18px",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:7 }}>
                <MessageCircle size={14}/> WhatsApp
              </Button>
              {loan.borrowerEmail ? (
                <Button
                  onClick={() => sendEmailMutation?.mutate?.({ id, type: "approved" })}
                  disabled={sendEmailMutation?.isPending}
                  style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,color:T.white,borderRadius:12,padding:"10px 18px",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:7 }}>
                  <Mail size={14}/> {sendEmailMutation?.isPending ? "Sending…" : "Email Borrower"}
                </Button>
              ) : null}
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
            <h2 style={{ fontSize:15,fontWeight:700,color:T.white,margin:"0 0 4px" }}>Repayment Schedule</h2>
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
                repayment={{ ...rep, instalment: i+1 }}
                isAdmin={isAdmin}
                isTrustee={isTrustee}
                onConfirm={(r: any) => confirmRepMutation?.mutate?.({ repaymentId:r.id })}
                onApproveAdmin={(r: any) => approveAdminMutation?.mutate?.({ id:r.id } as any)}
                onApproveTrustee={(r: any) => approveTrusteeMutation?.mutate?.({ id:r.id, trusteeId: r.trusteeId ?? 0 } as any)}
              />
            ))}

            {/* Add repayment */}
            {isAdmin && fullyApproved && (
              <div style={{ marginTop:16,padding:"14px 16px",borderRadius:12,background:"rgba(255,255,255,0.03)",border:`1px solid ${T.border}` }}>
                <p style={{ fontSize:12,color:T.muted,marginBottom:10,fontWeight:600 }}>RECORD REPAYMENT</p>
                <div style={{ display:"flex",gap:10,alignItems:"flex-end" }}>
                  <div style={{ flex:1 }}>
                    <Input
                      type="number" step="0.01" placeholder={`£${monthly}`}
                      value={repaymentAmount}
                      onChange={e => setRepaymentAmount(e.target.value)}
                      style={{ background:"rgba(255,255,255,0.06)",border:`1px solid ${T.border}`,borderRadius:10,color:T.white,height:42 }}/>
                  </div>
                  <Button
                    disabled={!repaymentAmount || recordRepaymentMutation?.isPending}
                    onClick={() => {
                      if (!repaymentAmount) return;
                      recordRepaymentMutation?.mutate?.({
                        loanId: id,
                        amount: repaymentAmount,
                        paymentMethod: "bank_transfer",
                      });
                    }}
                    style={{ background: repaymentAmount ? `linear-gradient(135deg,${T.purple},#4f46e5)` : "rgba(99,91,255,0.2)",color:T.white,border:"none",borderRadius:10,height:42,padding:"0 18px",fontWeight:700,fontSize:13,cursor:repaymentAmount?"pointer":"not-allowed" }}>
                    {recordRepaymentMutation?.isPending ? "Saving…" : "+ Add"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
