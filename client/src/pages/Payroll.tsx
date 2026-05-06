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
import { Plus, Wallet, Users, TrendingDown, FileText, Upload, Sparkles, Loader2, Check, ChevronDown, ChevronUp, User } from "lucide-react";
import { SmartUpload, type SmartUploadResult } from "@/components/SmartUpload";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type ExtractedEmployee = {
  employeeName: string | null;
  employeeId: string | null;
  taxCode: string | null;
  niNumber: string | null;
  period: string | null;
  month: number | null;
  year: number | null;
  grossPay: number | null;
  incomeTax: number | null;
  nationalInsurance: number | null;
  pensionContribution: number | null;
  otherDeductions: number | null;
  netPay: number | null;
  paymentMethod: string | null;
};

type ReviewCard = ExtractedEmployee & {
  // editable overrides
  editName: string;
  editMonth: string;
  editYear: string;
  editGross: string;
  editTax: string;
  editNI: string;
  editPension: string;
  editOther: string;
  editNet: string;
  editMethod: string;
  editNotes: string;
  // link to existing user (optional)
  linkedUserId: string;
  useUserLink: boolean;
  saved: boolean;
  expanded: boolean;
};

function makeReviewCard(e: ExtractedEmployee): ReviewCard {
  const gross = e.grossPay ?? 0;
  const tax = e.incomeTax ?? 0;
  const ni = e.nationalInsurance ?? 0;
  const pension = e.pensionContribution ?? 0;
  const other = e.otherDeductions ?? 0;
  const net = e.netPay ?? (gross - tax - ni - pension - other);
  return {
    ...e,
    editName: e.employeeName ?? "",
    editMonth: (e.month ?? new Date().getMonth() + 1).toString(),
    editYear: (e.year ?? new Date().getFullYear()).toString(),
    editGross: gross.toFixed(2),
    editTax: tax.toFixed(2),
    editNI: ni.toFixed(2),
    editPension: pension.toFixed(2),
    editOther: other.toFixed(2),
    editNet: net.toFixed(2),
    editMethod: e.paymentMethod ?? "bank_transfer",
    editNotes: [e.taxCode ? `Tax Code: ${e.taxCode}` : "", e.niNumber ? `NI: ${e.niNumber}` : ""].filter(Boolean).join(" | "),
    linkedUserId: "",
    useUserLink: false,
    saved: false,
    expanded: true,
  };
}

export default function Payroll() {
  const { user } = useAuth();
  const [newOpen, setNewOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>();
  const [payrollSmartPrefill, setPayrollSmartPrefill] = useState<Record<string, unknown> | undefined>(undefined);

  function handleSmartPayrollConfirm(result: SmartUploadResult) {
    setPayrollSmartPrefill(result.extractedData);
    setNewOpen(true);
  }
  // PDF upload state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [payslipUrl, setPayslipUrl] = useState("");
  const [reviewCards, setReviewCards] = useState<ReviewCard[]>([]);
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
    onError: (e) => toast.error(e.message),
  });

  const analyzePayslipBulk = trpc.payroll.analyzePayslipBulk.useMutation({
    onSuccess: (data) => {
      setAnalyzing(false);
      if (!data.employees || data.employees.length === 0) {
        toast.warning("No employee data found in this document. Please fill in manually.");
        setReviewCards([makeReviewCard({} as ExtractedEmployee)]);
        return;
      }
      setReviewCards(data.employees.map(makeReviewCard));
      toast.success(`Found ${data.employees.length} employee${data.employees.length > 1 ? "s" : ""} — review and save each below`);
    },
    onError: (e) => {
      setAnalyzing(false);
      toast.error(`Analysis failed: ${e.message}`);
      setReviewCards([makeReviewCard({} as ExtractedEmployee)]);
    },
  });

  const totalGross = records.reduce((s, r) => s + parseFloat(r.grossPay?.toString() ?? "0"), 0);
  const totalNet = records.reduce((s, r) => s + parseFloat(r.netPay?.toString() ?? "0"), 0);
  const totalDeductions = records.reduce((s, r) => s + parseFloat(r.totalDeductions?.toString() ?? "0"), 0);

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2];
  }, []);

  async function handlePdfUpload(file: File) {
    setPdfUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload-receipt", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const json = await res.json();
      const url = json.url as string;
      setPayslipUrl(url);
      setPdfUploading(false);
      setAnalyzing(true);
      analyzePayslipBulk.mutate({ fileUrl: url, mimeType: file.type });
    } catch {
      setPdfUploading(false);
      toast.error("PDF upload failed");
    }
  }

  function updateCard(idx: number, patch: Partial<ReviewCard>) {
    setReviewCards(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }

  async function saveCard(idx: number) {
    const c = reviewCards[idx];
    const gross = parseFloat(c.editGross || "0");
    const tax = parseFloat(c.editTax || "0");
    const ni = parseFloat(c.editNI || "0");
    const pension = parseFloat(c.editPension || "0");
    const other = parseFloat(c.editOther || "0");
    const net = gross - tax - ni - pension - other;

    const userId = c.useUserLink && c.linkedUserId ? parseInt(c.linkedUserId) : 0;
    const employeeName = c.editName.trim() || undefined;

    if (!employeeName && !c.useUserLink) {
      toast.error("Please enter an employee name");
      return;
    }

    await createRecord.mutateAsync({
      userId,
      employeeName,
      month: parseInt(c.editMonth),
      year: parseInt(c.editYear),
      grossPay: gross.toFixed(2),
      incomeTax: tax.toFixed(2),
      nationalInsurance: ni.toFixed(2),
      pensionContribution: pension.toFixed(2),
      otherDeductions: other.toFixed(2),
      netPay: net.toFixed(2),
      paymentMethod: c.editMethod,
      payslipUrl: payslipUrl || undefined,
      notes: c.editNotes || undefined,
    });

    updateCard(idx, { saved: true, expanded: false });
    toast.success(`Saved payroll for ${employeeName || "employee"}`);
    refetch();
  }

  function handleDialogClose() {
    setNewOpen(false);
    setPdfFile(null);
    setPayslipUrl("");
    setReviewCards([]);
    setAnalyzing(false);
  }

  const allSaved = reviewCards.length > 0 && reviewCards.every(c => c.saved);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll</h1>
          <p className="page-subtitle">{isAdmin ? "Staff payslips and salary management" : "Your payslips"}</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <SmartUpload
              moduleType="payroll"
              onConfirm={handleSmartPayrollConfirm}
              buttonLabel="Import Payslip"
              buttonVariant="outline"
            />
            <Button size="sm" onClick={() => { handleDialogClose(); setNewOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Add Payroll Record
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total Gross Pay", value: totalGross, icon: Wallet, color: "bg-primary/10 text-primary" },
            { label: "Total Net Pay", value: totalNet, icon: Users, color: "bg-green-100 text-green-700" },
            { label: "Total Deductions", value: totalDeductions, icon: TrendingDown, color: "bg-red-100 text-red-700" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="stat-card">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold">£{value.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>
          ))}
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
          <div className="overflow-x-auto">
          <table className="w-full data-table min-w-[540px]">
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
                  {isAdmin && (
                    <td className="font-medium">
                      {(r as any).employeeName ?? (r as any).userName ?? `User #${r.userId}`}
                    </td>
                  )}
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
          </div>
        </CardContent>
      </Card>

      {/* ── Add Payroll Dialog ── */}
      {isAdmin && (
        <Dialog open={newOpen} onOpenChange={(open) => { if (!open) handleDialogClose(); else setNewOpen(true); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Payroll Record</DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Upload a payslip PDF to auto-populate all employees, or add manually.
              </p>
            </DialogHeader>

            {/* PDF Upload */}
            <div className="space-y-2">
              <Label>Upload Payslip PDF (supports multi-employee)</Label>
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  pdfUploading || analyzing ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/50"
                }`}
                onClick={() => !pdfUploading && !analyzing && fileInputRef.current?.click()}
              >
                {pdfUploading ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" /> Uploading payslip...
                  </div>
                ) : analyzing ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-primary">
                    <Sparkles className="h-4 w-4 animate-pulse" /> AI analysing all employees...
                  </div>
                ) : pdfFile ? (
                  <div className="flex items-center justify-center gap-2 text-sm flex-wrap">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="font-medium">{pdfFile.name}</span>
                    {reviewCards.length > 0 && (
                      <span className="text-xs text-green-700">✓ {reviewCards.length} employee{reviewCards.length > 1 ? "s" : ""} found</span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPdfFile(null); setPayslipUrl(""); setReviewCards([]); }}
                      className="text-muted-foreground hover:text-destructive text-xs"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    <Upload className="h-5 w-5 mx-auto mb-1 opacity-50" />
                    <span>Tap to upload payslip PDF</span>
                    <p className="text-xs mt-0.5">AI extracts all employees from multi-page PDFs</p>
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
                  if (file) { setPdfFile(file); handlePdfUpload(file); }
                  e.target.value = "";
                }}
              />
            </div>

            {/* Add manual card button (when no PDF or as extra) */}
            {!analyzing && !pdfUploading && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setReviewCards(prev => [...prev, makeReviewCard({} as ExtractedEmployee)])}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Employee Manually
              </Button>
            )}

            {/* Review cards per employee */}
            {reviewCards.length > 0 && (
              <div className="space-y-3 mt-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {reviewCards.length} Employee{reviewCards.length > 1 ? "s" : ""} — Review & Save
                </p>
                {reviewCards.map((card, idx) => {
                  const computedNet = (() => {
                    const g = parseFloat(card.editGross || "0");
                    const t = parseFloat(card.editTax || "0");
                    const n = parseFloat(card.editNI || "0");
                    const p = parseFloat(card.editPension || "0");
                    const o = parseFloat(card.editOther || "0");
                    return (g - t - n - p - o).toFixed(2);
                  })();

                  return (
                    <Card key={idx} className={`border ${card.saved ? "border-green-300 bg-green-50/30" : "border-border"}`}>
                      <CardHeader className="p-3 pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {card.saved ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <User className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="font-medium text-sm">
                              {card.editName || `Employee ${idx + 1}`}
                            </span>
                            {card.period && (
                              <span className="text-xs text-muted-foreground">· {card.period}</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => updateCard(idx, { expanded: !card.expanded })}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {card.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </div>
                        {!card.expanded && !card.saved && (
                          <p className="text-xs text-muted-foreground ml-6">
                            Gross £{card.editGross} · Net £{computedNet} · {MONTHS[parseInt(card.editMonth) - 1]} {card.editYear}
                          </p>
                        )}
                        {card.saved && (
                          <p className="text-xs text-green-700 ml-6">Saved successfully</p>
                        )}
                      </CardHeader>

                      {card.expanded && !card.saved && (
                        <CardContent className="p-3 pt-0 space-y-3">
                          {/* Employee name field */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <Label className="text-xs">Employee Name *</Label>
                              {staffList.length > 0 && (
                                <button
                                  type="button"
                                  className="text-xs text-primary hover:underline"
                                  onClick={() => updateCard(idx, { useUserLink: !card.useUserLink })}
                                >
                                  {card.useUserLink ? "Use name instead" : "Link to user account"}
                                </button>
                              )}
                            </div>
                            {card.useUserLink && staffList.length > 0 ? (
                              <Select value={card.linkedUserId} onValueChange={(v) => updateCard(idx, { linkedUserId: v })}>
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Select registered employee..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {staffList.map((s: any) => (
                                    <SelectItem key={s.id} value={s.id.toString()}>
                                      {s.name ?? s.email}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                className="h-8 text-sm"
                                value={card.editName}
                                onChange={(e) => updateCard(idx, { editName: e.target.value })}
                                placeholder="e.g. Farid Ahmed"
                              />
                            )}
                          </div>

                          {/* Period */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Month *</Label>
                              <Select value={card.editMonth} onValueChange={(v) => updateCard(idx, { editMonth: v })}>
                                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs">Year *</Label>
                              <Select value={card.editYear} onValueChange={(v) => updateCard(idx, { editYear: v })}>
                                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Pay figures */}
                          <div>
                            <Label className="text-xs">Gross Pay (£) *</Label>
                            <Input className="h-8 text-sm" type="number" step="0.01" value={card.editGross} onChange={(e) => updateCard(idx, { editGross: e.target.value })} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Income Tax (£)</Label>
                              <Input className="h-8 text-sm" type="number" step="0.01" value={card.editTax} onChange={(e) => updateCard(idx, { editTax: e.target.value })} />
                            </div>
                            <div>
                              <Label className="text-xs">National Insurance (£)</Label>
                              <Input className="h-8 text-sm" type="number" step="0.01" value={card.editNI} onChange={(e) => updateCard(idx, { editNI: e.target.value })} />
                            </div>
                            <div>
                              <Label className="text-xs">Pension (£)</Label>
                              <Input className="h-8 text-sm" type="number" step="0.01" value={card.editPension} onChange={(e) => updateCard(idx, { editPension: e.target.value })} />
                            </div>
                            <div>
                              <Label className="text-xs">Other Deductions (£)</Label>
                              <Input className="h-8 text-sm" type="number" step="0.01" value={card.editOther} onChange={(e) => updateCard(idx, { editOther: e.target.value })} />
                            </div>
                          </div>

                          {/* Net pay computed */}
                          <div className="bg-primary/5 border border-primary/20 rounded-lg p-2 flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">Net Pay (calculated)</span>
                            <span className="font-bold text-primary">£{computedNet}</span>
                          </div>

                          {/* Payment method */}
                          <div>
                            <Label className="text-xs">Payment Method</Label>
                            <Select value={card.editMethod} onValueChange={(v) => updateCard(idx, { editMethod: v })}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                <SelectItem value="cheque">Cheque</SelectItem>
                                <SelectItem value="cash">Cash</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Notes */}
                          <div>
                            <Label className="text-xs">Notes (tax code, NI, etc.)</Label>
                            <Textarea className="text-sm" rows={2} value={card.editNotes} onChange={(e) => updateCard(idx, { editNotes: e.target.value })} />
                          </div>

                          <Button
                            type="button"
                            className="w-full"
                            size="sm"
                            disabled={createRecord.isPending}
                            onClick={() => saveCard(idx)}
                          >
                            {createRecord.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                            Save {card.editName || `Employee ${idx + 1}`}
                          </Button>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}

                {allSaved && (
                  <Button className="w-full" onClick={handleDialogClose}>
                    <Check className="h-4 w-4 mr-2" /> All saved — close
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
