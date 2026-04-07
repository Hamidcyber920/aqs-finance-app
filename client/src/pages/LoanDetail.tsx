import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle, XCircle, DollarSign, FileText, Mail, Download, Send } from "lucide-react";
import { useLocation } from "wouter";

export default function LoanDetail({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const [repaymentOpen, setRepaymentOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailType, setEmailType] = useState<"application_received" | "approved" | "reminder" | "custom">("reminder");
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");

  const { data, refetch, isLoading } = trpc.loans.get.useQuery({ id });

  const approveLoan = trpc.loans.approve.useMutation({
    onSuccess: () => { toast.success("Loan approved — confirmation email sent to borrower"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const rejectLoan = trpc.loans.reject.useMutation({
    onSuccess: () => { toast.success("Loan rejected"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const recordRepayment = trpc.loans.recordRepayment.useMutation({
    onSuccess: () => { toast.success("Repayment recorded"); setRepaymentOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const generatePdf = trpc.loans.generatePdf.useMutation({
    onSuccess: (result) => {
      toast.success("PDF agreement generated — opening download");
      // Trigger browser download
      const a = document.createElement("a");
      a.href = result.url;
      a.download = result.filename;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/loans")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="page-title">Loan: {loan.borrowerName}</h1>
          <p className="page-subtitle">Application #{String(loan.id).padStart(4, "0")} &mdash; Qarde Hasan</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Borrower Details */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Borrower Details</CardTitle></CardHeader>
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
            <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold text-primary">£{amount.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Term</span><span>{loan.termMonths} months</span></div>
            {loan.monthlyRepayment && <div className="flex justify-between"><span className="text-muted-foreground">Monthly</span><span>£{parseFloat(loan.monthlyRepayment.toString()).toFixed(2)}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Total Repaid</span><span className="text-green-700 font-medium">£{totalRepaid.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Remaining</span><span className="font-bold">£{remaining.toFixed(2)}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${loan.status === "approved" || loan.status === "active" ? "badge-approved" : loan.status === "rejected" ? "badge-rejected" : "badge-pending"}`}>
                {loan.status?.replace(/_/g, " ")}
              </span>
            </div>
            {/* Repayment progress bar */}
            {amount > 0 && (
              <div className="pt-1">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Repayment progress</span><span>{progressPct.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Purpose */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Purpose</CardTitle></CardHeader>
        <CardContent><p className="text-sm">{loan.purpose}</p></CardContent>
      </Card>

      {/* Review Actions */}
      {(loan.status === "pending_review" || loan.status === "draft") && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Review Actions</CardTitle></CardHeader>
          <CardContent className="flex gap-3 flex-wrap">
            <Button onClick={() => approveLoan.mutate({ id: loan.id })} disabled={approveLoan.isPending} className="flex-1">
              <CheckCircle className="h-4 w-4 mr-2" />
              {approveLoan.isPending ? "Approving..." : "Approve Loan"}
            </Button>
            <Button variant="destructive" onClick={() => rejectLoan.mutate({ id: loan.id })} disabled={rejectLoan.isPending} className="flex-1">
              <XCircle className="h-4 w-4 mr-2" />
              {rejectLoan.isPending ? "Rejecting..." : "Reject"}
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
                <><span className="animate-spin mr-2">⏳</span> Generating PDF...</>
              ) : (
                <><Download className="h-4 w-4 mr-2" /> Download PDF Agreement</>
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

      {/* PDF also available for any status */}
      {loan.status !== "approved" && loan.status !== "active" && (
        <div className="flex gap-3 flex-wrap">
          <Button
            variant="outline"
            onClick={() => generatePdf.mutate({ id: loan.id })}
            disabled={generatePdf.isPending}
          >
            {generatePdf.isPending ? (
              <><span className="animate-spin mr-2">⏳</span> Generating PDF...</>
            ) : (
              <><FileText className="h-4 w-4 mr-2" /> Download PDF Agreement</>
            )}
          </Button>
          {loan.borrowerEmail && (
            <Button variant="outline" onClick={() => setEmailOpen(true)}>
              <Mail className="h-4 w-4 mr-2" /> Send Email to Borrower
            </Button>
          )}
        </div>
      )}

      {/* Repayments */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Repayment History</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full data-table">
            <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Notes</th></tr></thead>
            <tbody>
              {repayments.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-muted-foreground py-6">No repayments recorded yet</td></tr>
              ) : repayments.map(r => (
                <tr key={r.id}>
                  <td>{new Date(r.paidAt).toLocaleDateString("en-GB")}</td>
                  <td className="font-medium">£{parseFloat(r.amount.toString()).toFixed(2)}</td>
                  <td className="capitalize">{r.paymentMethod.replace(/_/g, " ")}</td>
                  <td className="text-muted-foreground text-xs">{r.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Repayment Dialog */}
      <Dialog open={repaymentOpen} onOpenChange={setRepaymentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Repayment</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            recordRepayment.mutate({
              loanId: id,
              amount: fd.get("amount") as string,
              paymentMethod: fd.get("paymentMethod") as string,
              notes: fd.get("notes") as string || undefined,
            });
          }} className="space-y-4">
            <div><Label>Amount (£) *</Label><Input name="amount" type="number" step="0.01" min="0.01" max={remaining} required /></div>
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
            <div><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
            <Button type="submit" className="w-full" disabled={recordRepayment.isPending}>
              {recordRepayment.isPending ? "Saving..." : "Record Repayment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Send Email to Borrower</DialogTitle></DialogHeader>
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
                {emailType === "approved" && "Sends an approval notification with loan details and instructions to collect funds."}
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
