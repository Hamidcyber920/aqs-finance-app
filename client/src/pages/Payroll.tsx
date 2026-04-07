import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Wallet, Users, TrendingDown, FileText } from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function Payroll() {
  const { user } = useAuth();
  const [newOpen, setNewOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>();
  const isAdmin = user?.role === "admin" || user?.role === "manager" || user?.role === "superadmin" || user?.role === "trustee";

  const { data: allRecords = [], refetch } = trpc.payroll.list.useQuery(
    { year: selectedYear, month: selectedMonth },
    { enabled: isAdmin }
  );
  const { data: myPayslips = [] } = trpc.payroll.myPayslips.useQuery(undefined, { enabled: !isAdmin });

  const records = isAdmin ? allRecords : myPayslips;

  const createRecord = trpc.payroll.create.useMutation({
    onSuccess: () => { toast.success("Payroll record created"); setNewOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const totalGross = records.reduce((s, r) => s + parseFloat(r.grossPay?.toString() ?? "0"), 0);
  const totalNet = records.reduce((s, r) => s + parseFloat(r.netPay?.toString() ?? "0"), 0);
  const totalDeductions = records.reduce((s, r) => s + parseFloat(r.totalDeductions?.toString() ?? "0"), 0);

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2];
  }, []);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll</h1>
          <p className="page-subtitle">{isAdmin ? "Staff payslips and salary management" : "Your payslips"}</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Payroll Record
          </Button>
        )}
      </div>

      {/* Stats (admin only) */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Gross Pay</p>
                <p className="text-xl font-bold">£{totalGross.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-green-700" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Net Pay</p>
                <p className="text-xl font-bold">£{totalNet.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-red-700" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Deductions</p>
                <p className="text-xl font-bold">£{totalDeductions.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {isAdmin && (
        <div className="flex gap-3 flex-wrap items-center">
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={selectedMonth?.toString() ?? "all"} onValueChange={(v) => setSelectedMonth(v === "all" ? undefined : parseInt(v))}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All months" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTHS.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full data-table">
            <thead>
              <tr>
                {isAdmin && <th>Employee</th>}
                <th>Period</th>
                <th>Gross Pay</th>
                <th>Deductions</th>
                <th>Net Pay</th>
                <th>Status</th>
                <th>Payslip</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={isAdmin ? 7 : 6} className="text-center text-muted-foreground py-10">No payroll records found</td></tr>
              ) : records.map(r => (
                <tr key={r.id}>
                  {isAdmin && <td className="font-medium">{(r as any).userName ?? `User #${r.userId}`}</td>}
                  <td>{MONTHS[(r.month ?? 1) - 1]} {r.year}</td>
                  <td>£{parseFloat(r.grossPay?.toString() ?? "0").toFixed(2)}</td>
                  <td className="text-red-600">£{parseFloat(r.totalDeductions?.toString() ?? "0").toFixed(2)}</td>
                  <td className="font-semibold text-primary">£{parseFloat(r.netPay?.toString() ?? "0").toFixed(2)}</td>
                  <td>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${r.paymentStatus === "paid" ? "badge-approved" : "badge-pending"}`}>
                      {r.paymentStatus ?? "pending"}
                    </span>
                  </td>
                  <td>
                    {r.payslipUrl ? (
                      <a href={r.payslipUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline flex items-center gap-1">
                        <FileText className="h-3 w-3" /> View
                      </a>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Add Payroll Dialog */}
      {isAdmin && (
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Payroll Record</DialogTitle></DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const gross = parseFloat(fd.get("grossPay") as string);
              const tax = parseFloat(fd.get("incomeTax") as string || "0");
              const ni = parseFloat(fd.get("nationalInsurance") as string || "0");
              const pension = parseFloat(fd.get("pensionContribution") as string || "0");
              const other = parseFloat(fd.get("otherDeductions") as string || "0");
              const net = (gross - tax - ni - pension - other).toFixed(2);
              createRecord.mutate({
                userId: parseInt(fd.get("userId") as string),
                month: parseInt(fd.get("month") as string),
                year: parseInt(fd.get("year") as string),
                grossPay: gross.toFixed(2),
                incomeTax: tax.toFixed(2),
                nationalInsurance: ni.toFixed(2),
                pensionContribution: pension.toFixed(2),
                otherDeductions: other.toFixed(2),
                netPay: net,
                paymentMethod: fd.get("paymentMethod") as string,
                notes: fd.get("notes") as string || undefined,
              });
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Employee ID *</Label>
                  <Input name="userId" type="number" required placeholder="User ID" />
                </div>
                <div>
                  <Label>Month *</Label>
                  <Select name="month" defaultValue={(new Date().getMonth() + 1).toString()}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Year *</Label>
                  <Select name="year" defaultValue={new Date().getFullYear().toString()}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-2"><Label>Gross Pay (£) *</Label><Input name="grossPay" type="number" step="0.01" required /></div>
                <div><Label>Income Tax (£)</Label><Input name="incomeTax" type="number" step="0.01" defaultValue="0" /></div>
                <div><Label>National Insurance (£)</Label><Input name="nationalInsurance" type="number" step="0.01" defaultValue="0" /></div>
                <div><Label>Pension (£)</Label><Input name="pensionContribution" type="number" step="0.01" defaultValue="0" /></div>
                <div><Label>Other Deductions (£)</Label><Input name="otherDeductions" type="number" step="0.01" defaultValue="0" /></div>
                <div className="col-span-2">
                  <Label>Payment Method</Label>
                  <Select name="paymentMethod" defaultValue="cheque">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2"><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
              </div>
              <Button type="submit" className="w-full" disabled={createRecord.isPending}>
                {createRecord.isPending ? "Saving..." : "Create Payroll Record"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
