import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, Plus, CheckCircle, DollarSign, Users, FileText, AlertCircle, ChevronRight, Download, Calendar } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    approved: "bg-blue-100 text-blue-800",
    paid: "bg-green-100 text-green-800",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-700"}`}>{status}</span>;
}

const EMPTY_FORM = {
  employeeName: "", niNumber: "", taxCode: "",
  month: new Date().getMonth() + 1, year: CURRENT_YEAR,
  grossPay: 0, incomeTax: 0, nationalInsurance: 0,
  pensionEmployee: 0, pensionEmployer: 0, otherDeductions: 0,
  paymentMethod: "bank_transfer" as const, notes: "",
};

export default function PayrollV3Page() {
  const { user } = useAuth();
  useEffect(() => {
  }, [month, year, tab]);

  const utils = trpc.useUtils();
  const isAdmin = ["superadmin", "trustee", "manager", "admin"].includes(user?.role ?? "");

  const [tab, setTab] = useState("payroll");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showOcrDialog, setShowOcrDialog] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [ocrFields, setOcrFields] = useState<any>(null);
  const [ocrConfirmed, setOcrConfirmed] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const dashboard = trpc.payrollV3.getDashboardStats.useQuery({ month, year });
  const records = trpc.payrollV3.list.useQuery({ month, year, limit: 100 });

  // Filter records by date range (uses createdAt or constructs date from month/year)
  const filteredPayroll = (records.data ?? []).filter((r: any) => {
    if (!dateFrom && !dateTo) return true;
    const recDate = r.createdAt ? new Date(r.createdAt) : new Date(r.year ?? year, (r.month ?? month) - 1, 1);
    if (dateFrom && recDate < new Date(dateFrom)) return false;
    if (dateTo && recDate > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  const employeeSummary = trpc.payrollV3.getEmployeeSummary.useQuery(
    { employeeId: selectedEmployee!, year },
    { enabled: selectedEmployee !== null }
  );

  const createRecord = trpc.payrollV3.create.useMutation({
    onSuccess: () => { toast.success("Payroll record created"); setShowAddDialog(false); setForm({ ...EMPTY_FORM }); utils.payrollV3.list.invalidate(); utils.payrollV3.getDashboardStats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const approve = trpc.payrollV3.approve.useMutation({
    onSuccess: () => { toast.success("Approved"); utils.payrollV3.list.invalidate(); utils.payrollV3.getDashboardStats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const markPaid = trpc.payrollV3.markPaid.useMutation({
    onSuccess: () => { toast.success("Marked as paid"); utils.payrollV3.list.invalidate(); utils.payrollV3.getDashboardStats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const bulkApprove = trpc.payrollV3.bulkApprove.useMutation({
    onSuccess: () => { toast.success("All draft records approved"); utils.payrollV3.list.invalidate(); utils.payrollV3.getDashboardStats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const emailPayslip = trpc.payrollV3.emailPayslip.useMutation({
    onSuccess: (d) => toast.success(`Payslip emailed to ${d.recipientName} (${d.recipient})`),
    onError: (e) => toast.error(e.message),
  });

  const generateP60 = trpc.payrollV3.generateP60.useMutation({
    onSuccess: (d) => toast.success(`P60 generated for ${d.employeeName}`),
    onError: (e) => toast.error(e.message),
  });

  const generateP32 = trpc.payrollV3.generateP32.useMutation({
    onSuccess: (d) => toast.success(`P32 generated for ${d.taxYear}`),
    onError: (e) => toast.error(e.message),
  });

  const extractFromPayslip = trpc.payrollV3.extractFromPayslip.useMutation({
    onSuccess: (d) => { setOcrFields(d.fields); setOcrConfirmed(false); },
    onError: (e) => toast.error(e.message),
  });

  const handleOcrFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) extractFromPayslip.mutate({ fileUrl: data.url, mimeType: file.type });
    } catch { toast.error("Upload failed"); }
  };

  const handleOcrConfirm = () => {
    if (!ocrFields) return;
    setForm({
      employeeName: ocrFields.employeeName ?? "",
      niNumber: ocrFields.niNumber ?? "",
      taxCode: ocrFields.taxCode ?? "",
      month: ocrFields.month ?? new Date().getMonth() + 1,
      year: ocrFields.year ?? CURRENT_YEAR,
      grossPay: ocrFields.grossPay ?? 0,
      incomeTax: ocrFields.incomeTax ?? 0,
      nationalInsurance: ocrFields.nationalInsurance ?? 0,
      pensionEmployee: ocrFields.pensionEmployee ?? 0,
      pensionEmployer: ocrFields.pensionEmployer ?? 0,
      otherDeductions: ocrFields.otherDeductions ?? 0,
      paymentMethod: (ocrFields.paymentMethod as any) ?? "bank_transfer",
      notes: ocrFields.notes ?? "",
    });
    setOcrConfirmed(true);
    setShowOcrDialog(false);
    setShowAddDialog(true);
  };

  const netPay = form.grossPay - form.incomeTax - form.nationalInsurance - form.pensionEmployee - form.otherDeductions;

  const d = dashboard.data;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll Module</h1>
          <p className="text-sm text-gray-500 mt-1">AI payslip OCR, manual entry, approval workflow</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowOcrDialog(true)}>
            <Upload className="h-4 w-4 mr-1" />Scan Payslip
          </Button>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />Add Record
          </Button>
        </div>
      </div>

      {/* Month/Year filter */}
      <div className="flex gap-3 items-end">
        <div>
          <p className="text-xs text-gray-500 mb-1">Month</p>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Year</p>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {isAdmin && d && d.draft > 0 && (
          <Button variant="outline" size="sm" onClick={() => bulkApprove.mutate({ month, year })} disabled={bulkApprove.isPending}>
            <CheckCircle className="h-4 w-4 mr-1" />{bulkApprove.isPending ? "Approving..." : `Bulk Approve ${d.draft} Drafts`}
          </Button>
        )}
      </div>

      {/* Dashboard stats */}
      {d && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: "Employees", value: d.count, icon: Users },
            { label: "Total Gross", value: `£${d.totalGross.toLocaleString()}`, icon: DollarSign },
            { label: "Total Net", value: `£${d.totalNet.toLocaleString()}`, icon: DollarSign },
            { label: "Income Tax", value: `£${d.totalTax.toLocaleString()}`, icon: FileText },
            { label: "NI", value: `£${d.totalNI.toLocaleString()}`, icon: FileText },
            { label: `Draft/Approved/Paid`, value: `${d.draft}/${d.approved}/${d.paid}`, icon: AlertCircle },
          ].map(s => (
            <Card key={s.label} className="p-3">
              <div className="flex items-center gap-2">
                <s.icon className="h-4 w-4 text-indigo-500" />
                <div>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className="text-base font-bold">{s.value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Date range filter + Export */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-2 flex-wrap">
          <Calendar className="h-4 w-4 text-gray-400" />
          <span className="text-xs text-gray-500 font-medium">From:</span>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="bg-transparent border-none text-sm outline-none" />
          <span className="text-xs text-gray-500 font-medium ml-2">To:</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="bg-transparent border-none text-sm outline-none" />
        </div>
        {(dateFrom || dateTo) && (
          <Button variant="outline" size="sm" onClick={()=>{setDateFrom("");setDateTo("");}} className="text-red-500 border-red-200">Clear</Button>
        )}
        <Button variant="outline" size="sm" onClick={()=>{
          const recs = filteredPayroll;
          const headers = ["Employee","NI Number","Tax Code","Gross Pay","Income Tax","NI","Net Pay","Method","Status"];
          const rows = recs.map((r:any) => [r.employeeName,r.niNumber??"",r.taxCode??"",Number(r.grossPay).toFixed(2),Number(r.incomeTax).toFixed(2),Number(r.nationalInsurance).toFixed(2),Number(r.netPay).toFixed(2),r.paymentMethod,r.status]);
          if (dateFrom||dateTo) rows.push([`Date Range: ${dateFrom||'start'} to ${dateTo||'end'}`,"","","","","","","",""]);
          rows.push(["TOTAL","","",recs.reduce((s:number,r:any)=>s+Number(r.grossPay),0).toFixed(2),recs.reduce((s:number,r:any)=>s+Number(r.incomeTax),0).toFixed(2),recs.reduce((s:number,r:any)=>s+Number(r.nationalInsurance),0).toFixed(2),recs.reduce((s:number,r:any)=>s+Number(r.netPay),0).toFixed(2),"",""]);
          const csv = [headers,...rows].map(row=>row.map(v=>`"${v}"`).join(",")).join("\n");
          const blob = new Blob([csv],{type:"text/csv"});
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href=url;
          a.download=`payroll-${MONTHS[month-1]}-${year}${dateFrom||dateTo?`-${dateFrom||'start'}-to-${dateTo||'end'}`:''}.csv`;
          a.click(); URL.revokeObjectURL(url);
        }}><Download className="h-3 w-3 mr-1" />CSV</Button>
        <Button variant="outline" size="sm" onClick={()=>{
          const recs = filteredPayroll;
          const totalGross = recs.reduce((s:number,r:any)=>s+Number(r.grossPay),0);
          const totalTax = recs.reduce((s:number,r:any)=>s+Number(r.incomeTax),0);
          const totalNI = recs.reduce((s:number,r:any)=>s+Number(r.nationalInsurance),0);
          const totalNet = recs.reduce((s:number,r:any)=>s+Number(r.netPay),0);
          const dateLabel = dateFrom||dateTo ? ` (${dateFrom||'start'} to ${dateTo||'end'})` : '';
          const win = window.open("","_blank");
          if (!win) { toast.error("Pop-up blocked"); return; }
          win.document.write(`<!DOCTYPE html><html><head><title>Payroll Report</title><style>body{font-family:system-ui,sans-serif;padding:40px;max-width:900px;margin:0 auto}table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}th,td{padding:8px 12px;border-bottom:1px solid #eee;text-align:left}th{background:#f5f5f5;font-weight:600;font-size:12px;text-transform:uppercase}h1{font-size:22px}.total{font-weight:700;border-top:2px solid #333}@media print{body{padding:0}}</style></head><body><h1>Payroll Report</h1><p style="color:#666">${MONTHS[month-1]} ${year}${dateLabel}</p><p><strong>Employees:</strong> ${recs.length} | <strong>Total Gross:</strong> \u00a3${totalGross.toLocaleString("en-GB",{minimumFractionDigits:2})} | <strong>Total Net:</strong> \u00a3${totalNet.toLocaleString("en-GB",{minimumFractionDigits:2})}</p><table><thead><tr><th>Employee</th><th>NI / Tax Code</th><th style="text-align:right">Gross</th><th style="text-align:right">Tax</th><th style="text-align:right">NI</th><th style="text-align:right">Net Pay</th><th>Method</th><th>Status</th></tr></thead><tbody>${recs.map((r:any)=>`<tr><td>${r.employeeName}</td><td>${r.niNumber??'\u2014'} / ${r.taxCode??'\u2014'}</td><td style="text-align:right">\u00a3${Number(r.grossPay).toFixed(2)}</td><td style="text-align:right">\u00a3${Number(r.incomeTax).toFixed(2)}</td><td style="text-align:right">\u00a3${Number(r.nationalInsurance).toFixed(2)}</td><td style="text-align:right">\u00a3${Number(r.netPay).toFixed(2)}</td><td style="text-transform:capitalize">${r.paymentMethod.replace("_"," ")}</td><td style="text-transform:capitalize">${r.status}</td></tr>`).join("")}<tr class="total"><td colspan="2">TOTAL</td><td style="text-align:right">\u00a3${totalGross.toFixed(2)}</td><td style="text-align:right">\u00a3${totalTax.toFixed(2)}</td><td style="text-align:right">\u00a3${totalNI.toFixed(2)}</td><td style="text-align:right">\u00a3${totalNet.toFixed(2)}</td><td></td><td></td></tr></tbody></table><p style="margin-top:32px;font-size:11px;color:#999">Generated ${new Date().toLocaleString("en-GB")} | Use browser "Save as PDF"</p></body></html>`);
          win.document.close();
          setTimeout(()=>win.print(),500);
        }}><FileText className="h-3 w-3 mr-1" />PDF</Button>
      </div>
      {/* Records table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Payroll Records — {MONTHS[month - 1]} {year}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-3 text-left">Employee</th>
                  <th className="p-3 text-left">NI / Tax Code</th>
                  <th className="p-3 text-right">Gross</th>
                  <th className="p-3 text-right">Tax</th>
                  <th className="p-3 text-right">NI</th>
                  <th className="p-3 text-right">Net Pay</th>
                  <th className="p-3 text-left">Method</th>
                  <th className="p-3 text-left">Status</th>
                  {isAdmin && <th className="p-3 text-left">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {records.isLoading ? (
                  <tr><td colSpan={9} className="p-6 text-center text-gray-400">Loading...</td></tr>
                ) : filteredPayroll.length === 0 ? (
                  <tr><td colSpan={9} className="p-6 text-center text-gray-400">No records for {MONTHS[month - 1]} {year}{(dateFrom||dateTo)?' in selected date range':''}.</td></tr>
                ) : filteredPayroll.map(r => (
                  <tr key={r.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedEmployee(r.employeeId ?? null)}>
                    <td className="p-3 font-medium">{r.employeeName}</td>
                    <td className="p-3 text-gray-500 text-xs">{r.niNumber ?? "—"} / {r.taxCode ?? "—"}</td>
                    <td className="p-3 text-right font-mono">£{Number(r.grossPay).toFixed(2)}</td>
                    <td className="p-3 text-right font-mono text-red-600">£{Number(r.incomeTax).toFixed(2)}</td>
                    <td className="p-3 text-right font-mono text-orange-600">£{Number(r.nationalInsurance).toFixed(2)}</td>
                    <td className="p-3 text-right font-mono font-semibold text-green-700">£{Number(r.netPay).toFixed(2)}</td>
                    <td className="p-3 capitalize text-xs">{r.paymentMethod.replace("_", " ")}</td>
                    <td className="p-3"><StatusBadge status={r.status} /></td>
                    {isAdmin && (
                      <td className="p-3">
                        <div className="flex gap-1">
                          {r.status === "draft" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); approve.mutate({ id: r.id }); }}>
                              Approve
                            </Button>
                          )}
                          {r.status === "approved" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); markPaid.mutate({ id: r.id }); }}>
                              Mark Paid
                            </Button>
                          )}
                          {(r.status === "approved" || r.status === "paid") && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); emailPayslip.mutate({ id: r.id }); }} disabled={emailPayslip.isPending} title="Email payslip to employee">
                              ✉️ Email
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Per-employee YTD panel */}
      {selectedEmployee !== null && employeeSummary.data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">YTD Summary — {year}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 mb-4">
              {[
                { label: "YTD Gross", value: `£${employeeSummary.data.ytdGross.toFixed(2)}` },
                { label: "YTD Tax", value: `£${employeeSummary.data.ytdTax.toFixed(2)}` },
                { label: "YTD NI", value: `£${employeeSummary.data.ytdNI.toFixed(2)}` },
                { label: "YTD Net", value: `£${employeeSummary.data.ytdNet.toFixed(2)}` },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded p-3">
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className="text-lg font-bold">{s.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* OCR Dialog */}
      <Dialog open={showOcrDialog} onOpenChange={setShowOcrDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Scan Payslip with AI OCR</DialogTitle></DialogHeader>
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
            <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-500 mb-3">Upload payslip image or PDF for AI extraction</p>
            <input type="file" accept="image/*,application/pdf" onChange={handleOcrFileUpload} className="hidden" id="payslip-upload" />
            <label htmlFor="payslip-upload">
              <Button variant="outline" size="sm" asChild><span className="cursor-pointer">Choose File</span></Button>
            </label>
          </div>
          {extractFromPayslip.isPending && <p className="text-sm text-gray-500 text-center">Extracting data from payslip...</p>}
          {ocrFields && !ocrConfirmed && (
            <div className="space-y-2 mt-3">
              <p className="text-sm font-medium text-gray-700">Extracted Data — please verify:</p>
              <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
                {Object.entries(ocrFields).filter(([, v]) => v !== null).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-gray-500 capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                    <span className="font-medium">{String(v)}</span>
                  </div>
                ))}
              </div>
              <Button onClick={handleOcrConfirm} className="w-full">
                <CheckCircle className="h-4 w-4 mr-1" />Confirm & Fill Form
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOcrDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Record Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{ocrConfirmed ? "Confirm OCR-Extracted Record" : "Add Payroll Record"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Employee Name *</Label>
              <Input value={form.employeeName} onChange={e => setForm(f => ({ ...f, employeeName: e.target.value }))} />
            </div>
            <div>
              <Label>NI Number</Label>
              <Input value={form.niNumber} onChange={e => setForm(f => ({ ...f, niNumber: e.target.value }))} placeholder="AB123456C" />
            </div>
            <div>
              <Label>Tax Code</Label>
              <Input value={form.taxCode} onChange={e => setForm(f => ({ ...f, taxCode: e.target.value }))} placeholder="1257L" />
            </div>
            <div>
              <Label>Month</Label>
              <Select value={String(form.month)} onValueChange={(v) => setForm(f => ({ ...f, month: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year</Label>
              <Select value={String(form.year)} onValueChange={(v) => setForm(f => ({ ...f, year: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {[
              { key: "grossPay", label: "Gross Pay (£)" },
              { key: "incomeTax", label: "Income Tax (£)" },
              { key: "nationalInsurance", label: "National Insurance (£)" },
              { key: "pensionEmployee", label: "Pension Employee (£)" },
              { key: "pensionEmployer", label: "Pension Employer (£)" },
              { key: "otherDeductions", label: "Other Deductions (£)" },
            ].map(({ key, label }) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input type="number" min={0} step={0.01} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))} />
              </div>
            ))}
            <div className="col-span-2 bg-green-50 rounded p-3">
              <p className="text-sm text-gray-600">Calculated Net Pay: <span className="text-xl font-bold text-green-700">£{netPay.toFixed(2)}</span></p>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={form.paymentMethod} onValueChange={(v) => setForm(f => ({ ...f, paymentMethod: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setShowAddDialog(false); setOcrConfirmed(false); }}>Cancel</Button>
            <Button onClick={() => createRecord.mutate(form)} disabled={createRecord.isPending || !form.employeeName}>
              {createRecord.isPending ? "Saving..." : "Save Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Year-End Documents: P60 and P32 */}
      <div className="mt-8 border-t pt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Year-End Documents</h2>
        <p className="text-sm text-gray-500 mb-4">Generate P60 (per employee) and P32 (employer payment record) for HMRC compliance.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* P60 */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <h3 className="font-medium text-gray-800 mb-2">P60 - Employee Year-End Certificate</h3>
            <p className="text-xs text-gray-500 mb-3">Generates a P60 for a single employee showing total pay, tax and NI for the selected tax year.</p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Employee ID</Label>
                <Input type="number" placeholder="e.g. 1" className="h-8 text-sm" id="p60-emp-id" />
              </div>
              <div>
                <Label className="text-xs">Employee Name</Label>
                <Input placeholder="e.g. Ahmed Khan" className="h-8 text-sm" id="p60-emp-name" />
              </div>
              <div>
                <Label className="text-xs">Tax Year</Label>
                <Input
                  placeholder="e.g. 2024-25"
                  className="h-8 text-sm"
                  id="p60-tax-year"
                  defaultValue={`${new Date().getFullYear() - 1}-${String(new Date().getFullYear()).slice(2)}`}
                />
              </div>
              <Button
                size="sm" className="w-full mt-1"
                onClick={() => {
                  const empId = parseInt((document.getElementById('p60-emp-id') as HTMLInputElement)?.value ?? '0');
                  const empName = (document.getElementById('p60-emp-name') as HTMLInputElement)?.value ?? '';
                  const taxYear = (document.getElementById('p60-tax-year') as HTMLInputElement)?.value ?? '';
                  if (!empId || !empName || !taxYear) { toast.error('Please fill in all fields'); return; }
                  generateP60.mutate({ employeeId: empId, employeeName: empName, taxYear });
                }}
                disabled={generateP60.isPending}
              >
                {generateP60.isPending ? 'Generating...' : 'Generate P60'}
              </Button>
              {generateP60.data && (
                <a href={generateP60.data.url} target="_blank" rel="noreferrer" className="block text-center text-xs text-blue-600 underline mt-1">
                  Download P60 for {generateP60.data.employeeName} ({generateP60.data.taxYear})
                </a>
              )}
            </div>
          </div>

          {/* P32 */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <h3 className="font-medium text-gray-800 mb-2">P32 - Employer Payment Record</h3>
            <p className="text-xs text-gray-500 mb-3">Generates a P32 showing monthly totals of tax and NI due to HMRC across all employees.</p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Tax Year</Label>
                <Input
                  placeholder="e.g. 2024-25"
                  className="h-8 text-sm"
                  id="p32-tax-year"
                  defaultValue={`${new Date().getFullYear() - 1}-${String(new Date().getFullYear()).slice(2)}`}
                />
              </div>
              <Button
                size="sm" className="w-full mt-1"
                onClick={() => {
                  const taxYear = (document.getElementById('p32-tax-year') as HTMLInputElement)?.value ?? '';
                  if (!taxYear) { toast.error('Please enter a tax year'); return; }
                  generateP32.mutate({ taxYear });
                }}
                disabled={generateP32.isPending}
              >
                {generateP32.isPending ? 'Generating...' : 'Generate P32'}
              </Button>
              {generateP32.data && (
                <a href={generateP32.data.url} target="_blank" rel="noreferrer" className="block text-center text-xs text-blue-600 underline mt-1">
                  Download P32 ({generateP32.data.taxYear}) - {generateP32.data.months} months
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
