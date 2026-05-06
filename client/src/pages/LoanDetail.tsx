import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle, XCircle, DollarSign, FileText, Mail,
  Send, Upload, CalendarDays, AlertCircle, Paperclip, ShieldCheck, UserCheck,
} from "lucide-react";
import { useLocation } from "wouter";
import { SignaturePad } from "@/components/SignaturePad";

// ─── Repayment schedule ───────────────────────────────────────────────────────

function buildSchedule(amount: number, termMonths: number, startDate: Date) {
  const monthly = amount / termMonths;
  return Array.from({ length: termMonths }, (_, i) => {
    const due = new Date(startDate);
    due.setMonth(due.getMonth() + i + 1);
    return { month: i + 1, dueDate: due, amount: monthly };
  });
}

export default function LoanDetail({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const [repaymentOpen, setRepaymentOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailType, setEmailType] = useState<"application_received" | "approved" | "reminder" | "custom">("reminder");
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const evidenceInputRef = useRef<HTMLInputElement>(null);

  const [trusteeSelectId, setTrusteeSelectId] = useState<string>("");
  const [repaymentTrusteeId, setRepaymentTrusteeId] = useState<string>("");
  const [adminSigDataUrl, setAdminSigDataUrl] = useState<string | null>(null);
  const [trusteeSigDataUrl, setTrusteeSigDataUrl] = useState<string | null>(null);
  const [showAdminSigPad, setShowAdminSigPad] = useState(false);
  const [showTrusteeSigPad, setShowTrusteeSigPad] = useState(false);

  const { data, refetch, isLoading } = trpc.loans.get.useQuery({ id });
  const { data: trustees = [] } = trpc.trustees.listActive.useQuery();

  const uploadFile = trpc.upload.getUploadUrl.useMutation();

  const approveAdmin = trpc.loans.approveAdmin.useMutation({
    onSuccess: () => { toast.success("Admin approval recorded — waiting for trustee co-sign"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const approveTrustee = trpc.loans.approveTrustee.useMutation({
    onSuccess: () => { toast.success("Trustee approval recorded — loan fully approved, PDF & email sent"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const approveLoan = trpc.loans.approve.useMutation({
    onSuccess: () => { toast.success("Loan approved — confirmation email sent to lender"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const rejectLoan = trpc.loans.reject.useMutation({
    onSuccess: () => { toast.success("Loan rejected"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const confirmRepaymentReceived = trpc.loans.confirmRepaymentReceived.useMutation({
    onSuccess: () => { toast.success("Repayment marked as received in bank"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const approveRepaymentAdmin = trpc.loans.approveRepaymentAdmin.useMutation({
    onSuccess: () => { toast.success("Admin approval recorded for repayment"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const approveRepaymentTrustee = trpc.loans.approveRepaymentTrustee.useMutation({
    onSuccess: () => { toast.success("Repayment fully confirmed — receipt PDF & email sent"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const recordRepayment = trpc.loans.recordRepayment.useMutation({
    onSuccess: () => { toast.success("Repayment recorded"); setRepaymentOpen(false); setEvidenceFile(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const generatePdf = trpc.loans.generatePdf.useMutation({
    onSuccess: (result) => {
      toast.success("PDF agreement ready — opening in new tab");
      window.open(result.url, "_blank", "noopener,noreferrer");
    },
    onError: (e) => toast.error(`PDF generation failed: ${e.message}`),
  });
  const sendEmail = trpc.loans.sendEmail.useMutation({
    onSuccess: (result) => {
      toast.success(`Email sent to ${result.sentTo}`);
      setEmailOpen(false);
    },
    onError: (e) => toast.error(`Email failed: ${e.message}`),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  if (!data) return <div className="p-8 text-center text-muted-foreground">Loan not found</div>;

  const loan = data;
  const repayments = data.repayments ?? [];
  const totalRepaid = parseFloat(loan.totalRepaid?.toString() ?? "0");
  const amount = parseFloat(loan.amount?.toString() ?? "0");
  const remaining = Math.max(0, amount - totalRepaid);
  const progressPct = amount > 0 ? Math.min(100, (totalRepaid / amount) * 100) : 0;
  const termMonths = loan.termMonths ?? 6;
  const startDate = loan.startDate ? new Date(loan.startDate) : new Date(loan.createdAt);
  const schedule = buildSchedule(amount, termMonths, startDate);
  const now = new Date();
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + termMonths);
  const isOverdue = endDate < now && remaining > 0;

  // ─── Evidence upload helper ───────────────────────────────────────────────

  async function uploadEvidence(file: File): Promise<string | undefined> {
    setEvidenceUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const key = `loans/evidence-${id}-${Date.now()}-${file.name}`;
      formData.append("key", key);
      const res = await fetch("/api/upload-receipt", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const json = await res.json();
      return json.url as string;
    } catch (err) {
      toast.error("Evidence upload failed — you can still record the repayment without it");
      return undefined;
    } finally {
      setEvidenceUploading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/loans")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="page-title">Loan: {loan.borrowerName}</h1>
          <p className="page-subtitle">Application #{String(loan.id).padStart(4, "0")} — Qarde Hasan</p>
        </div>
      </div>

      {/* Overdue alert */}
      {isOverdue && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800 text-sm">Repayment overdue</p>
            <p className="text-xs text-red-700 mt-0.5">
              This loan was due by {endDate.toLocaleDateString("en-GB")}. Outstanding: £{remaining.toFixed(2)}.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Lender Details */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Lender (Worshipper) Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{loan.borrowerName}</span></div>
            {loan.borrowerEmail && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="text-xs">{loan.borrowerEmail}</span></div>}
            {loan.borrowerPhone && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{loan.borrowerPhone}</span></div>}
            {loan.borrowerAddress && <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span className="text-right max-w-[180px] text-xs">{loan.borrowerAddress}</span></div>}
          </CardContent>
        </Card>

        {/* Loan Details */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Loan Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Amount Lent</span><span className="font-bold text-primary">£{amount.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Term</span><span>{termMonths} months</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Monthly Repayment</span><span>£{(amount / termMonths).toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total Repaid</span><span className="text-green-700 font-medium">£{totalRepaid.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Remaining</span><span className={`font-bold ${isOverdue ? "text-red-600" : ""}`}>£{remaining.toFixed(2)}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                loan.status === "approved" || loan.status === "active" ? "badge-approved"
                : loan.status === "rejected" ? "badge-rejected"
                : loan.status === "completed" ? "badge-completed"
                : "badge-pending"
              }`}>
                {loan.status?.replace(/_/g, " ")}
              </span>
            </div>
            {amount > 0 && (
              <div className="pt-1">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Repayment progress</span><span>{progressPct.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${isOverdue ? "bg-red-500" : "bg-primary"}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Purpose */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Purpose of Loan</CardTitle></CardHeader>
        <CardContent><p className="text-sm">{loan.purpose}</p></CardContent>
      </Card>

      {/* 6-Month Repayment Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Repayment Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Due Date</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((s, i) => {
                const isPast = s.dueDate < now;
                const repaidSoFar = repayments
                  .filter(r => new Date(r.paidAt) <= s.dueDate)
                  .reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0);
                const expectedByThisMonth = s.amount * (i + 1);
                const isPaid = repaidSoFar >= expectedByThisMonth - 0.01;
                return (
                  <tr key={i}>
                    <td className="font-medium">Month {s.month}</td>
                    <td>{s.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td>£{s.amount.toFixed(2)}</td>
                    <td>
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                          <CheckCircle className="h-3 w-3" /> Paid
                        </span>
                      ) : isPast ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                          <AlertCircle className="h-3 w-3" /> Overdue
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Upcoming</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Dual Approval Workflow */}
      {(loan.status === "pending_review" || loan.status === "draft") && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-600" />
              Dual Approval Required
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Both Super Admin and a Trustee must approve before the loan agreement PDF is generated and sent.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Admin approval */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-white">
              <div className="flex items-center gap-2">
                {(loan as any).adminApprovedAt ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">Super Admin / Manager Approval</p>
                  {(loan as any).adminApprovedAt ? (
                    <p className="text-xs text-green-700">
                      Approved by {(loan as any).adminApprovedByName} on {new Date((loan as any).adminApprovedAt).toLocaleString("en-GB")}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Pending approval</p>
                  )}
                </div>
              </div>
              {!(loan as any).adminApprovedAt && (
                <div className="flex flex-col gap-2 w-full mt-2">
                  {!showAdminSigPad ? (
                    <Button
                      size="sm"
                      className="bg-[#1a4731] hover:bg-[#1a4731]/90 text-white self-end"
                      onClick={() => setShowAdminSigPad(true)}
                    >
                      <UserCheck className="h-4 w-4 mr-1" />
                      Approve &amp; Sign
                    </Button>
                  ) : (
                    <div className="w-full space-y-2">
                      <SignaturePad
                        label="Admin / Manager Signature"
                        onSave={(dataUrl) => setAdminSigDataUrl(dataUrl)}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => { setShowAdminSigPad(false); setAdminSigDataUrl(null); }}>Cancel</Button>
                        <Button
                          size="sm"
                          className="bg-[#1a4731] hover:bg-[#1a4731]/90 text-white"
                          onClick={() => approveAdmin.mutate({ id: loan.id, signatureDataUrl: adminSigDataUrl ?? undefined })}
                          disabled={approveAdmin.isPending}
                        >
                          <UserCheck className="h-4 w-4 mr-1" />
                          {approveAdmin.isPending ? "Saving..." : "Confirm Approval"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Trustee approval */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-white">
              <div className="flex items-center gap-2">
                {(loan as any).trusteeApprovedAt ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">Trustee Approval</p>
                  {(loan as any).trusteeApprovedAt ? (
                    <p className="text-xs text-green-700">
                      Approved by {(loan as any).trusteeName} on {new Date((loan as any).trusteeApprovedAt).toLocaleString("en-GB")}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Pending trustee sign-off</p>
                  )}
                </div>
              </div>
              {!(loan as any).trusteeApprovedAt && (
                <div className="w-full mt-2 space-y-2">
                  <Select value={trusteeSelectId} onValueChange={(v) => { setTrusteeSelectId(v); setShowTrusteeSigPad(false); setTrusteeSigDataUrl(null); }}>
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue placeholder="Select trustee" />
                    </SelectTrigger>
                    <SelectContent>
                      {trustees.map(t => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.fullName} ({t.role})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {trusteeSelectId && !showTrusteeSigPad && (
                    <Button
                      size="sm"
                      className="bg-[#1a4731] hover:bg-[#1a4731]/90 text-white w-full"
                      onClick={() => setShowTrusteeSigPad(true)}
                    >
                      <UserCheck className="h-4 w-4 mr-1" />
                      Co-Sign
                    </Button>
                  )}
                  {showTrusteeSigPad && (
                    <div className="space-y-2">
                      <SignaturePad
                        label="Trustee Signature"
                        onSave={(dataUrl) => setTrusteeSigDataUrl(dataUrl)}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => { setShowTrusteeSigPad(false); setTrusteeSigDataUrl(null); }}>Cancel</Button>
                        <Button
                          size="sm"
                          className="bg-[#1a4731] hover:bg-[#1a4731]/90 text-white"
                          onClick={() => approveTrustee.mutate({ id: loan.id, trusteeId: parseInt(trusteeSelectId), signatureDataUrl: trusteeSigDataUrl ?? undefined })}
                          disabled={!trusteeSelectId || approveTrustee.isPending}
                        >
                          <UserCheck className="h-4 w-4 mr-1" />
                          {approveTrustee.isPending ? "Saving..." : "Confirm Co-Sign"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Reject */}
            <Button variant="destructive" size="sm" onClick={() => rejectLoan.mutate({ id: loan.id })} disabled={rejectLoan.isPending}>
              <XCircle className="h-4 w-4 mr-2" />
              {rejectLoan.isPending ? "Rejecting..." : "Reject Application"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active loan actions */}
      {(loan.status === "approved" || loan.status === "active") && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Loan Actions</CardTitle></CardHeader>
          <CardContent className="flex gap-3 flex-wrap">
            <Button onClick={() => setRepaymentOpen(true)}>
              <DollarSign className="h-4 w-4 mr-2" /> Record Repayment
            </Button>
            <Button
              variant="outline"
              onClick={() => generatePdf.mutate({ id: loan.id })}
              disabled={generatePdf.isPending}
            >
              {generatePdf.isPending ? (
                <><span className="animate-spin mr-2">⏳</span> Generating...</>
              ) : (
                <><FileText className="h-4 w-4 mr-2" /> View PDF Agreement</>
              )}
            </Button>
            {loan.borrowerEmail && (
              <Button variant="outline" onClick={() => setEmailOpen(true)}>
                <Mail className="h-4 w-4 mr-2" /> Send Email
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* PDF for other statuses */}
      {loan.status !== "approved" && loan.status !== "active" && (
        <div className="flex gap-3 flex-wrap">
          <Button
            variant="outline"
            onClick={() => generatePdf.mutate({ id: loan.id })}
            disabled={generatePdf.isPending}
          >
            {generatePdf.isPending ? (
              <><span className="animate-spin mr-2">⏳</span> Generating...</>
            ) : (
              <><FileText className="h-4 w-4 mr-2" /> View PDF Agreement</>
            )}
          </Button>
          {loan.borrowerEmail && (
            <Button variant="outline" onClick={() => setEmailOpen(true)}>
              <Mail className="h-4 w-4 mr-2" /> Send Email to Lender
            </Button>
          )}
        </div>
      )}

      {/* Repayment History */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Repayment History</CardTitle></CardHeader>
        <CardContent className="p-0">
          {repayments.length === 0 ? (
            <div className="text-center text-muted-foreground py-6 text-sm">No repayments recorded yet</div>
          ) : (
            <div className="divide-y">
              {repayments.map(r => (
                <div key={r.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm">£{parseFloat(r.amount.toString()).toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground ml-2">{new Date(r.paidAt).toLocaleDateString("en-GB")} — {r.paymentMethod.replace(/_/g, " ")}</span>
                    </div>
                    {r.evidenceUrl && (
                      <a href={r.evidenceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <Paperclip className="h-3 w-3" /> Evidence
                      </a>
                    )}
                  </div>
                  {/* Repayment approval steps */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* Step 1: Bank confirmed */}
                    <div className="flex items-center gap-2 text-xs p-2 rounded border bg-muted/30">
                      {(r as any).receivedConfirmedAt ? (
                        <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">Received in Bank</p>
                        {(r as any).receivedConfirmedAt ? (
                          <p className="text-green-700 truncate">{new Date((r as any).receivedConfirmedAt).toLocaleString("en-GB")}</p>
                        ) : (
                          <Button size="sm" variant="outline" className="h-6 text-xs mt-1 px-2" onClick={() => confirmRepaymentReceived.mutate({ repaymentId: r.id })} disabled={confirmRepaymentReceived.isPending}>
                            Confirm
                          </Button>
                        )}
                      </div>
                    </div>
                    {/* Step 2: Admin approval */}
                    <div className="flex items-center gap-2 text-xs p-2 rounded border bg-muted/30">
                      {(r as any).adminApprovedAt ? (
                        <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">Admin Approved</p>
                        {(r as any).adminApprovedAt ? (
                          <p className="text-green-700 truncate">{(r as any).adminApprovedByName}</p>
                        ) : (
                          <Button size="sm" variant="outline" className="h-6 text-xs mt-1 px-2" onClick={() => approveRepaymentAdmin.mutate({ repaymentId: r.id })} disabled={approveRepaymentAdmin.isPending || !(r as any).receivedConfirmedAt}>
                            Approve
                          </Button>
                        )}
                      </div>
                    </div>
                    {/* Step 3: Trustee approval */}
                    <div className="flex items-center gap-2 text-xs p-2 rounded border bg-muted/30">
                      {(r as any).trusteeApprovedAt ? (
                        <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">Trustee Approved</p>
                        {(r as any).trusteeApprovedAt ? (
                          <p className="text-green-700 truncate">{(r as any).trusteeName}</p>
                        ) : (
                          <div className="flex items-center gap-1 mt-1">
                            <Select value={repaymentTrusteeId} onValueChange={setRepaymentTrusteeId}>
                              <SelectTrigger className="h-6 text-xs w-28"><SelectValue placeholder="Trustee" /></SelectTrigger>
                              <SelectContent>
                                {trustees.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.fullName}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => repaymentTrusteeId && approveRepaymentTrustee.mutate({ repaymentId: r.id, trusteeId: parseInt(repaymentTrusteeId) })} disabled={!repaymentTrusteeId || approveRepaymentTrustee.isPending || !(r as any).receivedConfirmedAt}>
                              Sign
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Receipt PDF link */}
                  {(r as any).confirmationPdfUrl && (
                    <a href={(r as any).confirmationPdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <FileText className="h-3 w-3" /> Download Repayment Receipt PDF
                    </a>
                  )}
                  {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Repayment Dialog ── */}
      <Dialog open={repaymentOpen} onOpenChange={(open) => { setRepaymentOpen(open); if (!open) setEvidenceFile(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Repayment</DialogTitle></DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              let evidenceUrl: string | undefined;
              if (evidenceFile) {
                evidenceUrl = await uploadEvidence(evidenceFile);
              }
              recordRepayment.mutate({
                loanId: id,
                amount: fd.get("amount") as string,
                paymentMethod: fd.get("paymentMethod") as string,
                evidenceUrl,
                notes: fd.get("notes") as string || undefined,
              });
            }}
            className="space-y-4"
          >
            <div>
              <Label>Amount (£) *</Label>
              <Input name="amount" type="number" step="0.01" min="0.01" max={remaining} required />
            </div>
            <div>
              <Label>Payment Method *</Label>
              <Select name="paymentMethod" defaultValue="bank_transfer">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Evidence upload */}
            <div>
              <Label>Payment Evidence (optional)</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Upload a screenshot, bank receipt, or photo as proof of payment
              </p>
              <div
                className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => evidenceInputRef.current?.click()}
              >
                {evidenceFile ? (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <Paperclip className="h-4 w-4 text-primary" />
                    <span className="font-medium">{evidenceFile.name}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEvidenceFile(null); }}
                      className="text-muted-foreground hover:text-destructive ml-2 text-xs"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    <Upload className="h-5 w-5 mx-auto mb-1 opacity-50" />
                    <span>Tap to upload image or PDF</span>
                  </div>
                )}
              </div>
              <input
                ref={evidenceInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
            <Button
              type="submit"
              className="w-full"
              disabled={recordRepayment.isPending || evidenceUploading}
            >
              {evidenceUploading ? "Uploading evidence..." : recordRepayment.isPending ? "Saving..." : "Record Repayment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Email Dialog ── */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Send Email to Lender</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Sending to: <strong>{loan.borrowerEmail}</strong>
            </div>
            <div>
              <Label>Email Type</Label>
              <Select value={emailType} onValueChange={(v) => setEmailType(v as typeof emailType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="application_received">Application Received Confirmation</SelectItem>
                  <SelectItem value="approved">Loan Approval Notification</SelectItem>
                  <SelectItem value="reminder">Repayment Reminder</SelectItem>
                  <SelectItem value="custom">Custom Message</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {emailType === "custom" && (
              <>
                <div><Label>Subject *</Label><Input value={customSubject} onChange={(e) => setCustomSubject(e.target.value)} placeholder="Email subject..." /></div>
                <div><Label>Message Body *</Label><Textarea value={customBody} onChange={(e) => setCustomBody(e.target.value)} rows={5} placeholder="Write your message here..." /></div>
              </>
            )}
            {emailType !== "custom" && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                {emailType === "application_received" && "Sends a confirmation that the loan application has been received and is under review."}
                {emailType === "approved" && "Sends an approval notification with loan details."}
                {emailType === "reminder" && `Sends a friendly repayment reminder showing the outstanding balance of £${remaining.toFixed(2)}.`}
              </div>
            )}
            <Button
              className="w-full"
              onClick={() => sendEmail.mutate({
                id: loan.id,
                type: emailType,
                customSubject: emailType === "custom" ? customSubject : undefined,
                customBody: emailType === "custom" ? customBody : undefined,
              })}
              disabled={sendEmail.isPending || (emailType === "custom" && (!customSubject || !customBody))}
            >
              {sendEmail.isPending ? (
                <><span className="animate-spin mr-2">⏳</span> Sending...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> Send Email</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
