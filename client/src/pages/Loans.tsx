import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, BookOpen, Clock, CheckCircle2, XCircle,
  ChevronRight, Download, Send, AlertCircle, Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const T = {
  navy: "#0A192F", navyLight: "#112240", purple: "#635BFF",
  mint: "#00FFC2", white: "#FFFFFF",
  muted: "rgba(255,255,255,0.5)", border: "rgba(255,255,255,0.08)",
  glass: "rgba(255,255,255,0.04)", card: "rgba(13,34,64,0.8)",
};

const loanSchema = z.object({
  applicantName: z.string().min(2),
  applicantEmail: z.string().email(),
  amount: z.string().min(1),
  termValue: z.coerce.number().min(1),
  termUnit: z.enum(["months", "years"]),
  purpose: z.string().min(2),
  termNotes: z.string().optional(),
});
type LoanForm = z.infer<typeof loanSchema>;

function Badge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    approved: { bg: "rgba(0,255,194,0.1)", color: T.mint },
    pending: { bg: "rgba(251,191,36,0.1)", color: "#fbbf24" },
    rejected: { bg: "rgba(255,80,80,0.1)", color: "#ff5050" },
    active: { bg: "rgba(99,91,255,0.15)", color: "#a78bfa" },
    repaid: { bg: "rgba(0,255,194,0.08)", color: "#6ee7b7" },
  };
  const s = map[status?.toLowerCase()] ?? { bg: T.glass, color: T.muted };
  return (
    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, textTransform: "capitalize" }}>
      {status}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color }: any) {
  return (
    <div style={{ background: T.card, backdropFilter: "blur(20px)", border: `1px solid ${T.border}`, borderRadius: 16, padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}22`, border: `1px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p style={{ fontSize: 24, fontWeight: 800, color: T.white, margin: 0, letterSpacing: "-0.03em" }}>{value}</p>
        <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>{label}</p>
      </div>
    </div>
  );
}

const PURPOSES = ["Rimmers Purchase", "Refurbishment", "Equipment", "Events", "Emergency", "Other"];

export default function LoansPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = ["superadmin", "trustee", "manager"].includes(user?.role ?? "");
  const [open, setOpen] = useState(false);
  const [termUnit, setTermUnit] = useState<"months" | "years">("months");

  const { data, refetch } = trpc.loans.list.useQuery({});
  const { data: trustees } = trpc.trustees.list.useQuery(undefined, { enabled: isAdmin });

  const createMutation = trpc.loans.create.useMutation({
    onSuccess: () => { toast.success("Loan application submitted"); setOpen(false); refetch(); reset(); },
    onError: (e) => toast.error(e.message),
  });

  const approveMutation = trpc.loans.approveAdmin.useMutation({
    onSuccess: () => { toast.success("Loan approved"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<any>({
    resolver: zodResolver(loanSchema),
    defaultValues: { termUnit: "months", termValue: 6 },
  });

  const watchAmount = watch("amount");
  const watchTermValue = watch("termValue");
  const monthlyPayment = watchAmount && watchTermValue
    ? (Number(watchAmount) / (termUnit === "years" ? watchTermValue * 12 : watchTermValue)).toFixed(2)
    : "0.00";

  const loans: any[] = Array.isArray(data) ? data : [];
  const totalLoaned = loans.reduce((s: number, l: any) => s + Number(l.amount ?? 0), 0);
  const activeLoans = loans.filter((l: any) => l.status === "active" || l.status === "approved").length;
  const pendingLoans = loans.filter((l: any) => l.status === "pending").length;

  return (
    <>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,#0E2244 0%,${T.navy} 50%,#070F1E 100%)`, padding: 24, fontFamily: "'DM Sans',sans-serif" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12, animation: "fadeUp 0.4s ease both" }}>
          <div>
            <h1 style={{ fontSize: "clamp(22px,3vw,30px)", fontWeight: 800, color: T.white, margin: 0, letterSpacing: "-0.03em" }}>
              Qarde Hasan <span style={{ color: T.mint }}>Loans</span>
            </h1>
            <p style={{ fontSize: 13, color: T.muted, margin: "4px 0 0" }}>Interest-free loans — Amanah of the community</p>
          </div>
          <Button onClick={() => setOpen(true)}
            style={{ background: `linear-gradient(135deg,${T.purple},#4f46e5)`, color: T.white, border: "none", borderRadius: 12, padding: "10px 20px", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <Plus size={16} /> New Application
          </Button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginBottom: 28 }}>
          <StatCard label="Total Loaned" value={`£${totalLoaned.toLocaleString()}`} icon={BookOpen} color={T.purple} />
          <StatCard label="Active Loans" value={activeLoans} icon={CheckCircle2} color={T.mint} />
          <StatCard label="Pending Review" value={pendingLoans} icon={Clock} color="#fbbf24" />
          <StatCard label="Trustees" value={trustees?.length ?? 0} icon={Users} color="#a78bfa" />
        </div>

        {/* Loans table */}
        <div style={{ background: T.card, backdropFilter: "blur(20px)", border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, animation: "fadeUp 0.5s ease 200ms both" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: T.white, margin: "0 0 20px", letterSpacing: "-0.01em" }}>Loan Register</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead>
                <tr>
                  {["Borrower", "Amount", "Term", "Monthly", "Purpose", "Status", "Actions"].map(h => (
                    <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", padding: "0 12px 12px 0", borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loans.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 14 }}>No loan applications yet</td></tr>
                ) : loans.map((l: any) => {
                  const termMonths = l.termUnit === "years" ? (l.termValue ?? 6) * 12 : (l.termValue ?? l.termMonths ?? 6);
                  const monthly = (Number(l.amount) / termMonths).toFixed(2);
                  return (
                    <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => setLocation(`/loans/${l.id}`)}>
                      <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${T.border}` }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: T.white, margin: 0 }}>{l.borrowerName}</p>
                          <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>{l.borrowerEmail}</p>
                        </div>
                      </td>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 14, fontWeight: 700, color: T.mint, borderBottom: `1px solid ${T.border}` }}>£{Number(l.amount).toLocaleString()}</td>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 13, color: T.muted, borderBottom: `1px solid ${T.border}` }}>
                        {l.termValue} {l.termUnit ?? "months"}
                      </td>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 13, color: T.purple, fontWeight: 600, borderBottom: `1px solid ${T.border}` }}>£{monthly}/mo</td>
                      <td style={{ padding: "12px 12px 12px 0", fontSize: 12, color: T.muted, borderBottom: `1px solid ${T.border}` }}>{l.purpose}</td>
                      <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${T.border}` }}><Badge status={l.status} /></td>
                      <td style={{ padding: "12px 0", borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          {isAdmin && l.status === "pending" && (
                            <button onClick={(e) => { e.stopPropagation(); approveMutation.mutate({ id: l.id }); }}
                              style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(0,255,194,0.1)", border: "1px solid rgba(0,255,194,0.2)", color: T.mint, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                              Approve
                            </button>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); setLocation(`/loans/${l.id}`); }}
                            style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(99,91,255,0.1)", border: "1px solid rgba(99,91,255,0.2)", color: T.purple, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* New loan dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent style={{ background: "#0D2240", border: `1px solid ${T.border}`, borderRadius: 20, maxWidth: 520 }}>
            <DialogHeader>
              <DialogTitle style={{ color: T.white, fontSize: 18, fontWeight: 800 }}>New Loan Application</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit((d: any) => createMutation.mutate({ ...d, termUnit }))} style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Borrower Name</Label>
                  <Input {...register("applicantName")} placeholder="Full name"
                    style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                </div>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Email</Label>
                  <Input {...register("applicantEmail")} type="email" placeholder="email@example.com"
                    style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Amount (£)</Label>
                  <Input {...register("amount")} type="number" placeholder="0.00"
                    style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                </div>
                <div>
                  <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Purpose</Label>
                  <select {...register("purpose")}
                    style={{ marginTop: 6, width: "100%", background: "#0D2240", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44, padding: "0 12px", fontSize: 14 }}>
                    {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {/* Term */}
              <div>
                <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Repayment Term</Label>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <Input {...register("termValue")} type="number" placeholder="6"
                    style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, height: 44 }} />
                  <div style={{ display: "flex", borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                    {(["months", "years"] as const).map(u => (
                      <button key={u} type="button" onClick={() => setTermUnit(u)}
                        style={{ padding: "0 16px", height: 44, background: termUnit === u ? T.purple : "rgba(255,255,255,0.06)", color: termUnit === u ? T.white : T.muted, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, transition: "all 0.2s" }}>
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
                {watchAmount && watchTermValue && (
                  <p style={{ fontSize: 12, color: T.mint, marginTop: 6 }}>
                    Monthly repayment: <strong>£{monthlyPayment}</strong>
                  </p>
                )}
              </div>

              <div>
                <Label style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Notes (optional)</Label>
                <textarea {...register("termNotes")} rows={2} placeholder="Additional context..."
                  style={{ marginTop: 6, width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, padding: "10px 14px", fontSize: 14, resize: "vertical", boxSizing: "border-box" }} />
              </div>

              <Button type="submit" disabled={createMutation.isPending}
                style={{ background: `linear-gradient(135deg,${T.mint},#00DDB0)`, color: "#081526", fontWeight: 700, height: 48, borderRadius: 12, border: "none", fontSize: 15, marginTop: 4 }}>
                {createMutation.isPending ? "Submitting…" : "Submit Application"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

      </div>
    </>
  );
}
