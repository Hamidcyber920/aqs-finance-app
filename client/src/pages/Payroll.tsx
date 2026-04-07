import { useState, useMemo, useRef } from "react";
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
import { Plus, Wallet, Users, TrendingDown, FileText, Upload, Sparkles, Loader2 } from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type PayslipFields = {
  userId: string;
  month: string;
  year: string;
  grossPay: string;
  incomeTax: string;
  nationalInsurance: string;
  pensionContribution: string;
  otherDeductions: string;
  netPay: string;
  paymentMethod: string;
  notes: string;
  payslipUrl: string;
};

const EMPTY_FIELDS: PayslipFields = {
  userId: "",
  month: (new Date().getMonth() + 1).toString(),
  year: new Date().getFullYear().toString(),
  grossPay: "",
  incomeTax: "0",
  nationalInsurance: "0",
  pensionContribution: "0",
  otherDeductions: "0",
  netPay: "",
  paymentMethod: "cheque",
  notes: "",
  payslipUrl: "",
};

export default function Payroll() {
  const { user } = useAuth();
  const [newOpen, setNewOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>();
  const [fields, setFields] = useState<PayslipFields>(EMPTY_FIELDS);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzedName, setAnalyzedName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === "admin" || user?.role === "manager" || user?.role === "superadmin" || user?.role === "trustee";

  const { data: allRecords = [], refetch } = trpc.payroll.list.useQuery(
    { year: selectedYear, month: selectedMonth },
    { enabled: isAdmin }
  );
  const { data: myPayslips = [] } = trpc.payroll.myPayslips.useQuery(undefined, { enabled: !isAdmin });
  const { data: staffList = [] } = trpc.users.list.useQuery({ limit: 100 }, { enabled: isAdmin });

  const records = isAdmin ? allRecords : myPayslips;

  const createRecord = trpc.payroll.create.useMutation({
    onSuccess: () => {
      toast.success("Payroll record created");
      setNewOpen(false);
      setFields(EMPTY_FIELDS);
      setPdfFile(null);
      setAnalyzedName(null);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const analyzePayslip = trpc.payroll.analyzePayslip.useMutation({
    onSuccess: (data) => {
      setAnalyzing(false);
      const updates: Partial<PayslipFields> = {};
      if (data.grossPay != null) updates.grossPay = data.grossPay.toFixed(2);
      if (data.incomeTax != null) updates.incomeTax = data.incomeTax.toFixed(2);
      if (data.nationalInsurance != null) updates.nationalInsurance = data.nationalInsurance.toFixed(2);
      if (data.pensionContribution != null) updates.pensionContribution = data.pensionContribution.toFixed(2);
      if (data.otherDeductions != null) updates.otherDeductions = data.otherDeductions.toFixed(2);
      if (data.netPay != null) updates.netPay = data.netPay.toFixed(2);
      if (data.month != null) updates.month = data.month.toString();
      if (data.year != null) updates.year = data.year.toString();
      if (data.paymentMethod) updates.paymentMethod = data.paymentMethod;
      if (data.taxCode || data.niNumber) {
        updates.notes = [data.taxCode ? `Tax Code: ${data.taxCode}` : "", data.niNumber ? `NI: ${data.niNumber}` : ""].filter(Boolean).join(" | ");
      }
      setFields(prev => ({ ...prev, ...updates }));
      if (data.employeeName) setAnalyzedName(data.employeeName);
      toast.success(`Payslip analysed — fields auto-populated${data.employeeName ? ` for ${data.employeeName}` : ""}`);
    },
    onError: (e) => {
      setAnalyzing(false);
      toast.error(`Analysis failed: ${e.message}`);
    },
  });

  const totalGross = records.reduce((s, r) => s + parseFloat(r.grossPay?.toString() ?? "0"), 0);
  const totalNet = records.reduce((s, r) => s + parseFloat(r.netPay?.toString() ?? "0"), 0);
  const totalDeductions = records.reduce((s, r) => s + parseFloat(r.totalDeductions?.toString() ?? "0"), 0);

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2];
  }, []);

  // Compute net pay live
  const computedNet = useMemo(() => {
    const gross = parseFloat(fields.grossPay || "0");
    const tax = parseFloat(fields.incomeTax || "0");
    const ni = parseFloat(fields.nationalInsurance || "0");
    const pension = parseFloat(fields.pensionContribution || "0");
    const other = parseFloat(fields.otherDeductions || "0");
    const net = gross - tax - ni - pension - other;
    return isNaN(net) ? "" : net.toFixed(2);
  }, [fields.grossPay, fields.incomeTax, fields.nationalInsurance, fields.pensionContribution, fields.otherDeductions]);

  const setField = (key: keyof PayslipFields, value: string) => {
    setFields(prev => ({ ...prev, [key]: value }));
  };

  // Upload PDF and trigger AI analysis
  async function handlePdfUploadAndAnalyze(file: File) {
    setPdfUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const key = `payroll/payslip-${Date.now()}-${file.name}`;
      formData.append("key", key);
      const res = await fetch("/api/upload-receipt", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const json = await res.json();
      const url = json.url as string;
      setField("payslipUrl", url);
      setPdfUploading(false);
      // Now run AI analysis
      setAnalyzing(true);
      analyzePayslip.mutate({ fileUrl: url, mimeType: file.type });
    } catch (err) {
      setPdfUploading(false);
      toast.error("PDF upload failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll</h1>
          <p className="page-subtitle">{isAdmin ? "Staff payslips and salary management" : "Your payslips"}</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => { setFields(EMPTY_FIELDS); setPdfFile(null); setAnalyzedName(null); setNewOpen(true); }}>
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
                      <a
                        href={r.payslipUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-xs hover:underline flex items-center gap-1"
                      >
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

      {/* ── Add Payroll Dialog ── */}
      {isAdmin && (
        <Dialog open={newOpen} onOpenChange={(open) => { setNewOpen(open); if (!open) { setPdfFile(null); setAnalyzedName(null); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Payroll Record</DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Upload a payslip PDF to auto-populate fields, or fill in manually.
              </p>
            </DialogHeader>

            {/* PDF Upload + AI Analysis */}
            <div className="space-y-2">
              <Label>Upload Payslip (PDF or image)</Label>
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  pdfUploading || analyzing
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
                onClick={() => !pdfUploading && !analyzing && fileInputRef.current?.click()}
              >
                {pdfUploading ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Uploading payslip...</span>
                  </div>
                ) : analyzing ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-primary">
                    <Sparkles className="h-4 w-4 animate-pulse" />
                    <span>AI analysing payslip...</span>
                  </div>
                ) : pdfFile ? (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="font-medium">{pdfFile.name}</span>
                    {analyzedName && (
                      <span className="text-xs text-green-700 ml-2">✓ {analyzedName}</span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPdfFile(null); setField("payslipUrl", ""); setAnalyzedName(null); }}
                      className="text-muted-foreground hover:text-destructive ml-1 text-xs"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    <Upload className="h-5 w-5 mx-auto mb-1 opacity-50" />
                    <span>Tap to upload payslip PDF or image</span>
                    <p className="text-xs mt-0.5">AI will extract and fill in the fields automatically</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPdfFile(file);
                    handlePdfUploadAndAnalyze(file);
                  }
                }}
              />
            </div>

            {/* Manual fields */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createRecord.mutate({
                  userId: parseInt(fields.userId),
                  month: parseInt(fields.month),
                  year: parseInt(fields.year),
                  grossPay: parseFloat(fields.grossPay || "0").toFixed(2),
                  incomeTax: parseFloat(fields.incomeTax || "0").toFixed(2),
                  nationalInsurance: parseFloat(fields.nationalInsurance || "0").toFixed(2),
                  pensionContribution: parseFloat(fields.pensionContribution || "0").toFixed(2),
                  otherDeductions: parseFloat(fields.otherDeductions || "0").toFixed(2),
                  netPay: computedNet || "0",
                  paymentMethod: fields.paymentMethod,
                  payslipUrl: fields.payslipUrl || undefined,
                  notes: fields.notes || undefined,
                });
              }}
              className="space-y-4 mt-2"
            >
              <div className="grid grid-cols-2 gap-3">
                {/* Employee */}
                <div className="col-span-2">
                  <Label>Employee *</Label>
                  {staffList.length > 0 ? (
                    <Select value={fields.userId} onValueChange={(v) => setField("userId", v)} required>
                      <SelectTrigger>
                        <SelectValue placeholder={analyzedName ? `Detected: ${analyzedName}` : "Select employee..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {staffList.map((s: any) => (
                          <SelectItem key={s.id} value={s.id.toString()}>
                            {s.name ?? s.email} ({s.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type="number"
                      value={fields.userId}
                      onChange={(e) => setField("userId", e.target.value)}
                      required
                      placeholder="User ID"
                    />
                  )}
                  {analyzedName && (
                    <p className="text-xs text-muted-foreground mt-1">
                      AI detected: <strong>{analyzedName}</strong> — please select the matching employee above
                    </p>
                  )}
                </div>

                {/* Period */}
                <div>
                  <Label>Month *</Label>
                  <Select value={fields.month} onValueChange={(v) => setField("month", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Year *</Label>
                  <Select value={fields.year} onValueChange={(v) => setField("year", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                {/* Pay figures */}
                <div className="col-span-2">
                  <Label>Gross Pay (£) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={fields.grossPay}
                    onChange={(e) => setField("grossPay", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label>Income Tax (£)</Label>
                  <Input type="number" step="0.01" value={fields.incomeTax} onChange={(e) => setField("incomeTax", e.target.value)} />
                </div>
                <div>
                  <Label>National Insurance (£)</Label>
                  <Input type="number" step="0.01" value={fields.nationalInsurance} onChange={(e) => setField("nationalInsurance", e.target.value)} />
                </div>
                <div>
                  <Label>Pension (£)</Label>
                  <Input type="number" step="0.01" value={fields.pensionContribution} onChange={(e) => setField("pensionContribution", e.target.value)} />
                </div>
                <div>
                  <Label>Other Deductions (£)</Label>
                  <Input type="number" step="0.01" value={fields.otherDeductions} onChange={(e) => setField("otherDeductions", e.target.value)} />
                </div>

                {/* Net pay (computed) */}
                {computedNet && (
                  <div className="col-span-2 bg-primary/5 border border-primary/20 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Net Pay (calculated)</p>
                    <p className="text-lg font-bold text-primary">£{computedNet}</p>
                  </div>
                )}

                <div className="col-span-2">
                  <Label>Payment Method</Label>
                  <Select value={fields.paymentMethod} onValueChange={(v) => setField("paymentMethod", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <Textarea
                    rows={2}
                    value={fields.notes}
                    onChange={(e) => setField("notes", e.target.value)}
                    placeholder="Tax code, NI number, or other notes..."
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={createRecord.isPending || pdfUploading || analyzing || !fields.userId || !fields.grossPay}
              >
                {createRecord.isPending ? "Saving..." : "Create Payroll Record"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
