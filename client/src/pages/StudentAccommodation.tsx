import { useState, useRef, useCallback, useEffect } from "react";
import { useHibbaFormFill } from "@/hooks/useHibbaFormFill";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import {
  Plus, Home, AlertCircle, Clock, CheckCircle2, Users,
  ChevronDown, ChevronRight, Mail, Phone, MessageCircle,
  Upload, FileText, X, Edit2, Check, Calendar,
  DollarSign, Building2, User, Shield, ExternalLink,
  RefreshCw, Search, Filter, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  navy: "#0A192F", navyLight: "#112240", purple: "#635BFF",
  mint: "#00FFC2", white: "#FFFFFF",
  muted: "rgba(255,255,255,0.5)", border: "rgba(255,255,255,0.08)",
  glass: "rgba(255,255,255,0.04)", card: "rgba(13,34,64,0.8)",
  gold: "#F59E0B", red: "#EF4444", green: "#10B981", orange: "#F97316",
};

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  active: { bg: "rgba(16,185,129,0.15)", color: "#10B981", label: "Active" },
  inactive: { bg: "rgba(156,163,175,0.15)", color: "#9CA3AF", label: "Inactive" },
  notice_given: { bg: "rgba(245,158,11,0.15)", color: "#F59E0B", label: "Notice Given" },
  vacated: { bg: "rgba(239,68,68,0.1)", color: "#EF4444", label: "Vacated" },
};
const PAYMENT_STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "rgba(245,158,11,0.15)", color: "#F59E0B", label: "Pending" },
  paid: { bg: "rgba(16,185,129,0.15)", color: "#10B981", label: "Paid" },
  partial: { bg: "rgba(99,91,255,0.15)", color: "#a78bfa", label: "Partial" },
  overdue: { bg: "rgba(239,68,68,0.15)", color: "#EF4444", label: "Overdue" },
  waived: { bg: "rgba(156,163,175,0.15)", color: "#9CA3AF", label: "Waived" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS[status] ?? { bg: T.glass, color: T.muted, label: status };
  return (
    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, textTransform: "capitalize", whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}
function PaymentBadge({ status }: { status: string }) {
  const s = PAYMENT_STATUS_COLORS[status] ?? { bg: T.glass, color: T.muted, label: status };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, textTransform: "capitalize", whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub }: any) {
  return (
    <div style={{ background: T.card, backdropFilter: "blur(20px)", border: `1px solid ${T.border}`, borderRadius: 16, padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}22`, border: `1px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p style={{ fontSize: 24, fontWeight: 800, color: T.white, margin: 0, letterSpacing: "-0.03em" }}>{value}</p>
        <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>{label}</p>
        {sub && <p style={{ fontSize: 11, color, margin: "2px 0 0", fontWeight: 600 }}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── File upload helper ───────────────────────────────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Add Tenant Dialog ────────────────────────────────────────────────────────
function AddTenantDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [extracting, setExtracting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [contractDocUrl, setContractDocUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contractInputRef = useRef<HTMLInputElement>(null);

  const extractMutation = trpc.accommodation.extractTenantDocument.useMutation();
  const uploadMutation = trpc.accommodation.uploadFile.useMutation();
  const createMutation = trpc.accommodation.createTenant.useMutation({
    onSuccess: () => { toast.success("Tenant added successfully"); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const { register, handleSubmit, setValue, reset, watch, formState: { errors } } = useForm<any>({
    defaultValues: {
      fullName: "", email: "", phone: "", whatsappPhone: "",
      roomNumber: "", propertyAddress: "",
      contractStartDate: "", contractEndDate: "",
      rentAmount: "", rentFrequency: "monthly", rentDueDay: 1,
      depositAmount: "", depositPaidDate: "", depositNotes: "",
      emergencyContactName: "", emergencyContactPhone: "", notes: "",
    },
  });
  // Listen for Hibba voice fill events forwarded from parent
  useEffect(() => {
    const handler = (e: Event) => {
      const fields = (e as CustomEvent).detail as Record<string, any>;
      if (fields.fullName || fields.name) setValue("fullName", fields.fullName || fields.name);
      if (fields.email) setValue("email", fields.email);
      if (fields.phone) setValue("phone", fields.phone);
      if (fields.roomNumber || fields.room) setValue("roomNumber", fields.roomNumber || fields.room);
      if (fields.contractStartDate || fields.startDate) setValue("contractStartDate", fields.contractStartDate || fields.startDate);
      if (fields.contractEndDate || fields.endDate) setValue("contractEndDate", fields.contractEndDate || fields.endDate);
      if (fields.rentAmount || fields.rent) setValue("rentAmount", String(fields.rentAmount || fields.rent));
      if (fields.rentFrequency) setValue("rentFrequency", fields.rentFrequency);
      if (fields.depositAmount || fields.deposit) setValue("depositAmount", String(fields.depositAmount || fields.deposit));
      if (fields.notes) setValue("notes", fields.notes);
    };
    window.addEventListener("hibba:fill_tenant_form", handler);
    return () => window.removeEventListener("hibba:fill_tenant_form", handler);
  }, [setValue]);


  const handleExtractFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      // Upload first to get URL
      const base64 = await fileToBase64(file);
      const { url } = await uploadMutation.mutateAsync({ base64, mimeType: file.type, filename: file.name });
      // Extract data from document
      const extracted = await extractMutation.mutateAsync({ fileUrl: url });
      if (extracted.fullName) setValue("fullName", extracted.fullName);
      if (extracted.email) setValue("email", extracted.email);
      if (extracted.phone) setValue("phone", extracted.phone);
      if (extracted.roomNumber) setValue("roomNumber", extracted.roomNumber);
      if (extracted.contractStartDate) setValue("contractStartDate", extracted.contractStartDate);
      if (extracted.contractEndDate) setValue("contractEndDate", extracted.contractEndDate);
      if (extracted.rentAmount) setValue("rentAmount", extracted.rentAmount);
      if (extracted.rentFrequency) setValue("rentFrequency", extracted.rentFrequency);
      if (extracted.depositAmount) setValue("depositAmount", extracted.depositAmount);
      if (extracted.notes) setValue("notes", extracted.notes);
      setContractDocUrl(url);
      toast.success("Document scanned — please review and confirm the extracted data");
    } catch (err: any) {
      toast.error("Failed to extract document: " + err.message);
    } finally {
      setExtracting(false);
    }
  };

  const handleContractUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const { url } = await uploadMutation.mutateAsync({ base64, mimeType: file.type, filename: file.name });
      setContractDocUrl(url);
      toast.success("Contract uploaded");
    } catch (err: any) {
      toast.error("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = (data: any) => {
    createMutation.mutate({
      ...data,
      rentDueDay: parseInt(data.rentDueDay) || 1,
      contractDocUrl: contractDocUrl ?? undefined,
    });
  };

  const rentFreq = watch("rentFrequency");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); setContractDocUrl(null); onClose(); } }}>
      <DialogContent style={{ background: T.navyLight, border: `1px solid ${T.border}`, borderRadius: 20, maxWidth: 680, maxHeight: "90vh", overflowY: "auto", color: T.white }}>
        <DialogHeader>
          <DialogTitle style={{ color: T.white, fontSize: 20, fontWeight: 700 }}>Add New Tenant</DialogTitle>
        </DialogHeader>

        {/* AI Document Extraction */}
        <div style={{ background: `${T.purple}15`, border: `1px dashed ${T.purple}66`, borderRadius: 12, padding: 16, marginBottom: 8 }}>
          <p style={{ color: T.purple, fontWeight: 600, fontSize: 13, margin: "0 0 8px" }}>AI Document Extraction</p>
          <p style={{ color: T.muted, fontSize: 12, margin: "0 0 12px" }}>Upload a tenancy agreement, contract, or photo — AI will auto-fill the form fields below.</p>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={handleExtractFile} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={extracting}
            style={{ borderColor: `${T.purple}66`, color: T.purple, background: "transparent" }}
          >
            {extracting ? <><RefreshCw size={14} className="animate-spin mr-2" />Extracting...</> : <><Upload size={14} className="mr-2" />Upload & Auto-Fill</>}
          </Button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Personal Info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Full Name *</Label>
              <Input {...register("fullName", { required: true })} placeholder="e.g. Ahmed Ali" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
              {errors.fullName && <p style={{ color: T.red, fontSize: 11, marginTop: 2 }}>Required</p>}
            </div>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Email</Label>
              <Input {...register("email")} type="email" placeholder="tenant@email.com" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Phone</Label>
              <Input {...register("phone")} placeholder="+44 7..." style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>WhatsApp Number</Label>
              <Input {...register("whatsappPhone")} placeholder="+44 7... (if different)" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
          </div>

          {/* Room / Property */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Room Number</Label>
              <Input {...register("roomNumber")} placeholder="e.g. 3A" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Property Address</Label>
              <Input {...register("propertyAddress")} placeholder="Full address" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
          </div>

          {/* Contract Dates */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Contract Start Date</Label>
              <Input {...register("contractStartDate")} type="date" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Contract End Date</Label>
              <Input {...register("contractEndDate")} type="date" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
          </div>

          {/* Rent Details */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Rent Amount (£) *</Label>
              <Input {...register("rentAmount", { required: true })} placeholder="e.g. 450.00" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
              {errors.rentAmount && <p style={{ color: T.red, fontSize: 11, marginTop: 2 }}>Required</p>}
            </div>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Frequency</Label>
              <Select onValueChange={(v) => setValue("rentFrequency", v)} defaultValue="monthly">
                <SelectTrigger style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: T.navyLight, border: `1px solid ${T.border}` }}>
                  <SelectItem value="weekly" style={{ color: T.white }}>Weekly</SelectItem>
                  <SelectItem value="monthly" style={{ color: T.white }}>Monthly</SelectItem>
                  <SelectItem value="quarterly" style={{ color: T.white }}>Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>
                {rentFreq === "weekly" ? "Due Day of Week (1=Mon)" : "Due Day of Month"}
              </Label>
              <Input {...register("rentDueDay")} type="number" min={1} max={rentFreq === "weekly" ? 7 : 28} placeholder={rentFreq === "weekly" ? "1-7" : "1-28"} style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
          </div>

          {/* Deposit */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Deposit Amount (£)</Label>
              <Input {...register("depositAmount")} placeholder="e.g. 900.00" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Deposit Paid Date</Label>
              <Input {...register("depositPaidDate")} type="date" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
          </div>
          <div>
            <Label style={{ color: T.muted, fontSize: 12 }}>Deposit Notes</Label>
            <Input {...register("depositNotes")} placeholder="Any deposit notes..." style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
          </div>

          {/* Emergency Contact */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Emergency Contact Name</Label>
              <Input {...register("emergencyContactName")} placeholder="Full name" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Emergency Contact Phone</Label>
              <Input {...register("emergencyContactPhone")} placeholder="+44 7..." style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
          </div>

          {/* Contract Document */}
          <div>
            <Label style={{ color: T.muted, fontSize: 12 }}>Contract Document</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <input ref={contractInputRef} type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={handleContractUpload} />
              <Button type="button" variant="outline" size="sm" onClick={() => contractInputRef.current?.click()} disabled={uploading} style={{ borderColor: `${T.border}`, color: T.muted, background: "transparent" }}>
                {uploading ? <><RefreshCw size={14} className="animate-spin mr-2" />Uploading...</> : <><Upload size={14} className="mr-2" />Upload Contract</>}
              </Button>
              {contractDocUrl && (
                <a href={contractDocUrl} target="_blank" rel="noopener noreferrer" style={{ color: T.mint, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <FileText size={14} /> View Uploaded
                </a>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label style={{ color: T.muted, fontSize: 12 }}>Notes</Label>
            <textarea {...register("notes")} rows={2} placeholder="Any additional notes..." style={{ width: "100%", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, padding: "8px 12px", fontSize: 14, resize: "vertical", marginTop: 4 }} />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8 }}>
            <Button type="button" variant="outline" onClick={() => { reset(); setContractDocUrl(null); onClose(); }} style={{ borderColor: T.border, color: T.muted, background: "transparent" }}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending} style={{ background: T.purple, color: T.white, border: "none" }}>
              {createMutation.isPending ? "Saving..." : "Add Tenant"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Rent Payment Dialog ──────────────────────────────────────────────────
function AddRentPaymentDialog({ tenantId, rentAmount, rentFrequency, open, onClose, onSuccess }: {
  tenantId: number; rentAmount: string; rentFrequency: string;
  open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<any>({
    defaultValues: {
      periodLabel: "", dueDate: "", periodStart: "", periodEnd: "", amountDue: rentAmount,
    },
  });
  const createMutation = trpc.accommodation.createRentPayment.useMutation({
    onSuccess: () => { toast.success("Rent payment record added"); onSuccess(); onClose(); reset(); },
    onError: (e) => toast.error(e.message),
  });
  const onSubmit = (data: any) => {
    createMutation.mutate({ tenantId, ...data });
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent style={{ background: T.navyLight, border: `1px solid ${T.border}`, borderRadius: 20, maxWidth: 480, color: T.white }}>
        <DialogHeader>
          <DialogTitle style={{ color: T.white }}>Add Rent Payment Record</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <Label style={{ color: T.muted, fontSize: 12 }}>Period Label</Label>
            <Input {...register("periodLabel", { required: true })} placeholder={`e.g. ${rentFrequency === "weekly" ? "Week 20 2026" : "May 2026"}`} style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            {errors.periodLabel && <p style={{ color: T.red, fontSize: 11 }}>Required</p>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Period Start</Label>
              <Input {...register("periodStart", { required: true })} type="date" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Period End</Label>
              <Input {...register("periodEnd", { required: true })} type="date" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
          </div>
          <div>
            <Label style={{ color: T.muted, fontSize: 12 }}>Due Date</Label>
            <Input {...register("dueDate", { required: true })} type="date" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
          </div>
          <div>
            <Label style={{ color: T.muted, fontSize: 12 }}>Amount Due (£)</Label>
            <Input {...register("amountDue", { required: true })} placeholder="450.00" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }} style={{ borderColor: T.border, color: T.muted, background: "transparent" }}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending} style={{ background: T.purple, color: T.white, border: "none" }}>
              {createMutation.isPending ? "Saving..." : "Add Record"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Confirm Payment Dialog ───────────────────────────────────────────────────
function ConfirmPaymentDialog({ paymentId, amountDue, open, onClose, onSuccess }: {
  paymentId: number; amountDue: string;
  open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = trpc.accommodation.uploadFile.useMutation();
  const confirmMutation = trpc.accommodation.confirmPayment.useMutation({
    onSuccess: () => { toast.success("Payment confirmed"); onSuccess(); onClose(); reset(); setReceiptUrl(null); },
    onError: (e) => toast.error(e.message),
  });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<any>({
    defaultValues: { paidDate: new Date().toISOString().split("T")[0], amountPaid: amountDue, paymentMethod: "bank_transfer", notes: "" },
  });
  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const { url } = await uploadMutation.mutateAsync({ base64, mimeType: file.type, filename: file.name });
      setReceiptUrl(url);
      toast.success("Receipt uploaded");
    } catch (err: any) {
      toast.error("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };
  const onSubmit = (data: any) => {
    confirmMutation.mutate({ id: paymentId, ...data, receiptUrl });
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); setReceiptUrl(null); onClose(); } }}>
      <DialogContent style={{ background: T.navyLight, border: `1px solid ${T.border}`, borderRadius: 20, maxWidth: 440, color: T.white }}>
        <DialogHeader>
          <DialogTitle style={{ color: T.white }}>Confirm Rent Payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Paid Date *</Label>
              <Input {...register("paidDate", { required: true })} type="date" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
            <div>
              <Label style={{ color: T.muted, fontSize: 12 }}>Amount Paid (£)</Label>
              <Input {...register("amountPaid")} placeholder={amountDue} style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
            </div>
          </div>
          <div>
            <Label style={{ color: T.muted, fontSize: 12 }}>Payment Method</Label>
            <select {...register("paymentMethod")} style={{ width: "100%", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, padding: "8px 12px", fontSize: 14, marginTop: 4 }}>
              <option value="bank_transfer" style={{ background: T.navy }}>Bank Transfer</option>
              <option value="cash" style={{ background: T.navy }}>Cash</option>
              <option value="cheque" style={{ background: T.navy }}>Cheque</option>
              <option value="standing_order" style={{ background: T.navy }}>Standing Order</option>
              <option value="other" style={{ background: T.navy }}>Other</option>
            </select>
          </div>
          <div>
            <Label style={{ color: T.muted, fontSize: 12 }}>Notes</Label>
            <Input {...register("notes")} placeholder="Any notes..." style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} />
          </div>
          <div>
            <Label style={{ color: T.muted, fontSize: 12 }}>Receipt / Evidence</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <input ref={fileInputRef} type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={handleReceiptUpload} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ borderColor: T.border, color: T.muted, background: "transparent" }}>
                {uploading ? <><RefreshCw size={14} className="animate-spin mr-2" />Uploading...</> : <><Upload size={14} className="mr-2" />Upload Receipt</>}
              </Button>
              {receiptUrl && <a href={receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: T.mint, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><FileText size={14} /> View</a>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button type="button" variant="outline" onClick={() => { reset(); setReceiptUrl(null); onClose(); }} style={{ borderColor: T.border, color: T.muted, background: "transparent" }}>Cancel</Button>
            <Button type="submit" disabled={confirmMutation.isPending} style={{ background: T.green, color: T.white, border: "none" }}>
              {confirmMutation.isPending ? "Confirming..." : <><Check size={14} className="mr-2" />Confirm Payment</>}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Tenant Dialog ───────────────────────────────────────────────────────
function EditTenantDialog({ tenant, open, onClose, onSuccess }: { tenant: any; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const updateMutation = trpc.accommodation.updateTenant.useMutation({
    onSuccess: () => { toast.success("Tenant updated"); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const { register, handleSubmit, setValue, watch } = useForm<any>({
    defaultValues: {
      fullName: tenant?.fullName ?? "",
      email: tenant?.email ?? "",
      phone: tenant?.phone ?? "",
      whatsappPhone: tenant?.whatsappPhone ?? "",
      roomNumber: tenant?.roomNumber ?? "",
      propertyAddress: tenant?.propertyAddress ?? "",
      contractStartDate: tenant?.contractStartDate ? String(tenant.contractStartDate).split("T")[0] : "",
      contractEndDate: tenant?.contractEndDate ? String(tenant.contractEndDate).split("T")[0] : "",
      rentAmount: tenant?.rentAmount ?? "",
      rentFrequency: tenant?.rentFrequency ?? "monthly",
      rentDueDay: tenant?.rentDueDay ?? 1,
      depositAmount: tenant?.depositAmount ?? "",
      depositPaidDate: tenant?.depositPaidDate ? String(tenant.depositPaidDate).split("T")[0] : "",
      depositNotes: tenant?.depositNotes ?? "",
      emergencyContactName: tenant?.emergencyContactName ?? "",
      emergencyContactPhone: tenant?.emergencyContactPhone ?? "",
      notes: tenant?.notes ?? "",
      status: tenant?.status ?? "active",
    },
  });
  const onSubmit = (data: any) => {
    updateMutation.mutate({ id: tenant.id, ...data, rentDueDay: parseInt(data.rentDueDay) || 1 });
  };
  const rentFreq = watch("rentFrequency");
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent style={{ background: T.navyLight, border: `1px solid ${T.border}`, borderRadius: 20, maxWidth: 680, maxHeight: "90vh", overflowY: "auto", color: T.white }}>
        <DialogHeader>
          <DialogTitle style={{ color: T.white }}>Edit Tenant — {tenant?.fullName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><Label style={{ color: T.muted, fontSize: 12 }}>Full Name *</Label><Input {...register("fullName")} style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} /></div>
            <div><Label style={{ color: T.muted, fontSize: 12 }}>Email</Label><Input {...register("email")} type="email" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} /></div>
            <div><Label style={{ color: T.muted, fontSize: 12 }}>Phone</Label><Input {...register("phone")} style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} /></div>
            <div><Label style={{ color: T.muted, fontSize: 12 }}>WhatsApp</Label><Input {...register("whatsappPhone")} style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} /></div>
            <div><Label style={{ color: T.muted, fontSize: 12 }}>Room Number</Label><Input {...register("roomNumber")} style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} /></div>
            <div><Label style={{ color: T.muted, fontSize: 12 }}>Status</Label>
              <Select onValueChange={(v) => setValue("status", v)} defaultValue={tenant?.status ?? "active"}>
                <SelectTrigger style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }}><SelectValue /></SelectTrigger>
                <SelectContent style={{ background: T.navyLight, border: `1px solid ${T.border}` }}>
                  <SelectItem value="active" style={{ color: T.white }}>Active</SelectItem>
                  <SelectItem value="inactive" style={{ color: T.white }}>Inactive</SelectItem>
                  <SelectItem value="notice_given" style={{ color: T.white }}>Notice Given</SelectItem>
                  <SelectItem value="vacated" style={{ color: T.white }}>Vacated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label style={{ color: T.muted, fontSize: 12 }}>Property Address</Label><Input {...register("propertyAddress")} style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><Label style={{ color: T.muted, fontSize: 12 }}>Contract Start</Label><Input {...register("contractStartDate")} type="date" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} /></div>
            <div><Label style={{ color: T.muted, fontSize: 12 }}>Contract End</Label><Input {...register("contractEndDate")} type="date" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><Label style={{ color: T.muted, fontSize: 12 }}>Rent Amount (£)</Label><Input {...register("rentAmount")} style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} /></div>
            <div><Label style={{ color: T.muted, fontSize: 12 }}>Frequency</Label>
              <Select onValueChange={(v) => setValue("rentFrequency", v)} defaultValue={tenant?.rentFrequency ?? "monthly"}>
                <SelectTrigger style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }}><SelectValue /></SelectTrigger>
                <SelectContent style={{ background: T.navyLight, border: `1px solid ${T.border}` }}>
                  <SelectItem value="weekly" style={{ color: T.white }}>Weekly</SelectItem>
                  <SelectItem value="monthly" style={{ color: T.white }}>Monthly</SelectItem>
                  <SelectItem value="quarterly" style={{ color: T.white }}>Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label style={{ color: T.muted, fontSize: 12 }}>{rentFreq === "weekly" ? "Due Day (1=Mon)" : "Due Day of Month"}</Label><Input {...register("rentDueDay")} type="number" min={1} max={rentFreq === "weekly" ? 7 : 28} style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><Label style={{ color: T.muted, fontSize: 12 }}>Deposit Amount (£)</Label><Input {...register("depositAmount")} style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} /></div>
            <div><Label style={{ color: T.muted, fontSize: 12 }}>Deposit Paid Date</Label><Input {...register("depositPaidDate")} type="date" style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} /></div>
          </div>
          <div><Label style={{ color: T.muted, fontSize: 12 }}>Deposit Notes</Label><Input {...register("depositNotes")} style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><Label style={{ color: T.muted, fontSize: 12 }}>Emergency Contact Name</Label><Input {...register("emergencyContactName")} style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} /></div>
            <div><Label style={{ color: T.muted, fontSize: 12 }}>Emergency Contact Phone</Label><Input {...register("emergencyContactPhone")} style={{ background: T.glass, border: `1px solid ${T.border}`, color: T.white, marginTop: 4 }} /></div>
          </div>
          <div><Label style={{ color: T.muted, fontSize: 12 }}>Notes</Label><textarea {...register("notes")} rows={2} style={{ width: "100%", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, padding: "8px 12px", fontSize: 14, resize: "vertical", marginTop: 4 }} /></div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button type="button" variant="outline" onClick={onClose} style={{ borderColor: T.border, color: T.muted, background: "transparent" }}>Cancel</Button>
            <Button type="submit" disabled={updateMutation.isPending} style={{ background: T.purple, color: T.white, border: "none" }}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tenant Detail Panel ──────────────────────────────────────────────────────
function TenantDetailPanel({ tenant, onClose, onRefresh }: { tenant: any; onClose: () => void; onRefresh: () => void }) {
  const { canEdit, canDelete } = usePermissions();
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [confirmPaymentId, setConfirmPaymentId] = useState<number | null>(null);
  const [confirmAmountDue, setConfirmAmountDue] = useState<string>("");
  const [editOpen, setEditOpen] = useState(false);

  const { data: payments, refetch: refetchPayments } = trpc.accommodation.listRentPayments.useQuery({ tenantId: tenant.id });
  const markOverdueMutation = trpc.accommodation.markOverdue.useMutation({
    onSuccess: () => { toast.success("Marked as overdue"); refetchPayments(); },
    onError: (e) => toast.error(e.message),
  });
  const checkFaridMutation = trpc.accommodation.checkFarid.useMutation({ onSuccess: () => refetchPayments(), onError: (e) => toast.error(e.message) });
  const checkMuminMutation = trpc.accommodation.checkMumin.useMutation({ onSuccess: () => refetchPayments(), onError: (e) => toast.error(e.message) });
  const trusteeVerifyMutation = trpc.accommodation.trusteeVerify.useMutation({ onSuccess: () => refetchPayments(), onError: (e) => toast.error(e.message) });

  const formatDate = (d: any) => d ? new Date(d).toLocaleDateString("en-GB") : "—";
  const formatCurrency = (v: any) => v ? `£${parseFloat(v).toFixed(2)}` : "—";

  // WhatsApp message
  const sendWhatsApp = (phone: string, message: string) => {
    const clean = phone.replace(/\s+/g, "").replace(/^0/, "+44");
    window.location.href = `https://wa.me/${clean.replace("+", "")}?text=${encodeURIComponent(message)}`;
  };

  const sendEmail = (email: string, subject: string, body: string) => {
    window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank");
  };

  const rentReminderMsg = `Assalamu Alaikum ${tenant.fullName},\n\nThis is a friendly reminder that your rent payment of ${formatCurrency(tenant.rentAmount)} is due soon.\n\nPlease ensure payment is made on time.\n\nJazakAllahu Khayran,\nAbdullah Quilliam Society`;

  return (
    <div style={{ background: T.navyLight, border: `1px solid ${T.border}`, borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: `${T.purple}22`, border: `1px solid ${T.purple}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <User size={22} style={{ color: T.purple }} />
          </div>
          <div>
            <h3 style={{ color: T.white, fontWeight: 700, fontSize: 18, margin: 0 }}>{tenant.fullName}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <StatusBadge status={tenant.status} />
              {tenant.roomNumber && <span style={{ color: T.muted, fontSize: 12 }}>Room {tenant.roomNumber}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} style={{ borderColor: `${T.purple}66`, color: T.purple, background: "transparent" }}>
              <Edit2 size={14} className="mr-1" /> Edit
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onClose} style={{ borderColor: T.border, color: T.muted, background: "transparent" }}>
            <X size={14} />
          </Button>
        </div>
      </div>

      {/* Contact Info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: T.glass, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
          <p style={{ color: T.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>Contact</p>
          {tenant.email && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Mail size={14} style={{ color: T.muted }} />
              <span style={{ color: T.white, fontSize: 13 }}>{tenant.email}</span>
              <button onClick={() => sendEmail(tenant.email, "Rent Reminder — AQ Society", rentReminderMsg)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: T.mint, fontSize: 11 }}>Email</button>
            </div>
          )}
          {tenant.phone && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Phone size={14} style={{ color: T.muted }} />
              <span style={{ color: T.white, fontSize: 13 }}>{tenant.phone}</span>
            </div>
          )}
          {tenant.whatsappPhone && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MessageCircle size={14} style={{ color: "#25D366" }} />
              <span style={{ color: T.white, fontSize: 13 }}>{tenant.whatsappPhone}</span>
              <button onClick={() => sendWhatsApp(tenant.whatsappPhone, rentReminderMsg)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#25D366", fontSize: 11 }}>WhatsApp</button>
            </div>
          )}
          {tenant.emergencyContactName && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
              <p style={{ color: T.muted, fontSize: 11, margin: "0 0 4px" }}>Emergency Contact</p>
              <p style={{ color: T.white, fontSize: 13, margin: 0 }}>{tenant.emergencyContactName}</p>
              {tenant.emergencyContactPhone && <p style={{ color: T.muted, fontSize: 12, margin: 0 }}>{tenant.emergencyContactPhone}</p>}
            </div>
          )}
        </div>

        <div style={{ background: T.glass, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
          <p style={{ color: T.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>Contract & Rent</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: T.muted, fontSize: 12 }}>Rent Amount</span>
              <span style={{ color: T.mint, fontSize: 13, fontWeight: 700 }}>{formatCurrency(tenant.rentAmount)} / {tenant.rentFrequency}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: T.muted, fontSize: 12 }}>Due Day</span>
              <span style={{ color: T.white, fontSize: 12 }}>{tenant.rentFrequency === "weekly" ? `Day ${tenant.rentDueDay} of week` : `${tenant.rentDueDay}${["st","nd","rd"][tenant.rentDueDay-1] || "th"} of month`}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: T.muted, fontSize: 12 }}>Contract Start</span>
              <span style={{ color: T.white, fontSize: 12 }}>{formatDate(tenant.contractStartDate)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: T.muted, fontSize: 12 }}>Contract End</span>
              <span style={{ color: T.white, fontSize: 12 }}>{formatDate(tenant.contractEndDate)}</span>
            </div>
            {tenant.contractDocUrl && (
              <a href={tenant.contractDocUrl} target="_blank" rel="noopener noreferrer" style={{ color: T.mint, fontSize: 12, display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                <FileText size={13} /> View Contract
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Deposit Info */}
      {(tenant.depositAmount || tenant.depositNotes) && (
        <div style={{ background: T.glass, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
          <p style={{ color: T.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>Deposit</p>
          <div style={{ display: "flex", gap: 24 }}>
            {tenant.depositAmount && <div><p style={{ color: T.muted, fontSize: 11, margin: 0 }}>Amount</p><p style={{ color: T.gold, fontSize: 16, fontWeight: 700, margin: 0 }}>{formatCurrency(tenant.depositAmount)}</p></div>}
            {tenant.depositPaidDate && <div><p style={{ color: T.muted, fontSize: 11, margin: 0 }}>Paid Date</p><p style={{ color: T.white, fontSize: 13, margin: 0 }}>{formatDate(tenant.depositPaidDate)}</p></div>}
            {tenant.depositRefundedDate && <div><p style={{ color: T.muted, fontSize: 11, margin: 0 }}>Refunded</p><p style={{ color: T.green, fontSize: 13, margin: 0 }}>{formatDate(tenant.depositRefundedDate)}</p></div>}
          </div>
          {tenant.depositNotes && <p style={{ color: T.muted, fontSize: 12, marginTop: 8 }}>{tenant.depositNotes}</p>}
        </div>
      )}

      {/* Notes */}
      {tenant.notes && (
        <div style={{ background: T.glass, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
          <p style={{ color: T.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px" }}>Notes</p>
          <p style={{ color: T.white, fontSize: 13, margin: 0 }}>{tenant.notes}</p>
        </div>
      )}

      {/* Rent Payments */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h4 style={{ color: T.white, fontWeight: 700, fontSize: 15, margin: 0 }}>Rent Payment History</h4>
          {canEdit && (
            <Button size="sm" onClick={() => setAddPaymentOpen(true)} style={{ background: T.purple, color: T.white, border: "none", fontSize: 12 }}>
              <Plus size={13} className="mr-1" /> Add Record
            </Button>
          )}
        </div>
        {!payments || payments.length === 0 ? (
          <div style={{ background: T.glass, borderRadius: 12, padding: 20, textAlign: "center", border: `1px solid ${T.border}` }}>
            <p style={{ color: T.muted, fontSize: 13 }}>No rent payment records yet.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(payments as any[]).map((p: any) => (
              <div key={p.id} style={{ background: T.glass, borderRadius: 12, padding: "12px 16px", border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <p style={{ color: T.white, fontSize: 13, fontWeight: 600, margin: 0 }}>{p.periodLabel}</p>
                  <p style={{ color: T.muted, fontSize: 11, margin: 0 }}>Due: {formatDate(p.dueDate)}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ color: T.mint, fontSize: 14, fontWeight: 700, margin: 0 }}>{formatCurrency(p.amountDue)}</p>
                  {p.amountPaid && p.amountPaid !== p.amountDue && (
                    <p style={{ color: T.muted, fontSize: 11, margin: 0 }}>Paid: {formatCurrency(p.amountPaid)}</p>
                  )}
                </div>
                <PaymentBadge status={p.status} />
                {p.status === "paid" && p.confirmedByName && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Shield size={12} style={{ color: T.green }} />
                    <span style={{ color: T.muted, fontSize: 11 }}>
                      {p.confirmedByName} · {p.confirmedAt ? new Date(p.confirmedAt).toLocaleDateString("en-GB") : ""}
                    </span>
                    {p.receiptUrl && (
                      <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: T.mint, marginLeft: 4 }}>
                        <FileText size={12} />
                      </a>
                    )}
                  </div>
                )}
                {canEdit && (p.status === "pending" || p.status === "overdue") && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button size="sm" onClick={() => { setConfirmPaymentId(p.id); setConfirmAmountDue(p.amountDue); }} style={{ background: T.green, color: T.white, border: "none", fontSize: 11, padding: "4px 10px" }}>
                      <Check size={12} className="mr-1" /> Confirm
                    </Button>
                    {p.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => markOverdueMutation.mutate({ id: p.id })} style={{ borderColor: `${T.red}66`, color: T.red, background: "transparent", fontSize: 11, padding: "4px 10px" }}>
                        Mark Overdue
                      </Button>
                    )}
                  </div>
                )}
                {/* Authorisation tick boxes — full width row below payment info */}
                <div style={{ width: "100%", background: "rgba(99,91,255,0.06)", border: "1px solid rgba(99,91,255,0.2)", borderRadius: 8, padding: "8px 12px" }}>
                  <span style={{ fontSize: 10, color: "#a5b4fc", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Authorisation</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {/* Farid Ahmed */}
                    <div onClick={() => checkFaridMutation.mutate({ id: p.id, undo: !!p.checkedByFaridAt })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 6, background: p.checkedByFaridAt ? "rgba(0,255,194,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${p.checkedByFaridAt ? "rgba(0,255,194,0.4)" : "rgba(255,255,255,0.08)"}`, cursor: "pointer", userSelect: "none" }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${p.checkedByFaridAt ? T.mint : "rgba(255,255,255,0.25)"}`, background: p.checkedByFaridAt ? T.mint : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {p.checkedByFaridAt && <svg width="9" height="7" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="#081526" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div>
                        <span style={{ fontSize: 11, color: p.checkedByFaridAt ? T.white : "rgba(255,255,255,0.5)", fontWeight: p.checkedByFaridAt ? 600 : 400 }}>Farid Ahmed</span>
                        {p.checkedByFaridAt && <span style={{ display: "block", fontSize: 10, color: T.mint }}>{new Date(p.checkedByFaridAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                      </div>
                    </div>
                    {/* Mumin Khan */}
                    <div onClick={() => checkMuminMutation.mutate({ id: p.id, undo: !!p.checkedByMuminAt })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 6, background: p.checkedByMuminAt ? "rgba(0,255,194,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${p.checkedByMuminAt ? "rgba(0,255,194,0.4)" : "rgba(255,255,255,0.08)"}`, cursor: "pointer", userSelect: "none" }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${p.checkedByMuminAt ? T.mint : "rgba(255,255,255,0.25)"}`, background: p.checkedByMuminAt ? T.mint : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {p.checkedByMuminAt && <svg width="9" height="7" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="#081526" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div>
                        <span style={{ fontSize: 11, color: p.checkedByMuminAt ? T.white : "rgba(255,255,255,0.5)", fontWeight: p.checkedByMuminAt ? 600 : 400 }}>Mumin Khan</span>
                        {p.checkedByMuminAt && <span style={{ display: "block", fontSize: 10, color: T.mint }}>{new Date(p.checkedByMuminAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                      </div>
                    </div>
                    {/* Trustee: Dr Abdul Hamid / Galib Khan */}
                    {(["Dr Abdul Hamid", "Galib Khan"] as const).map(name => (
                      <div key={name} onClick={() => trusteeVerifyMutation.mutate({ id: p.id, trusteeName: p.trusteeVerifiedBy === name ? null : name })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 6, background: p.trusteeVerifiedBy === name ? "rgba(99,91,255,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${p.trusteeVerifiedBy === name ? "rgba(99,91,255,0.5)" : "rgba(255,255,255,0.08)"}`, cursor: "pointer", userSelect: "none" }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${p.trusteeVerifiedBy === name ? "#a5b4fc" : "rgba(255,255,255,0.25)"}`, background: p.trusteeVerifiedBy === name ? "#635BFF" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {p.trusteeVerifiedBy === name && <svg width="9" height="7" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <div>
                          <span style={{ fontSize: 11, color: p.trusteeVerifiedBy === name ? T.white : "rgba(255,255,255,0.5)", fontWeight: p.trusteeVerifiedBy === name ? 600 : 400 }}>{name}</span>
                          {p.trusteeVerifiedBy === name && p.trusteeVerifiedAt && <span style={{ display: "block", fontSize: 10, color: "#a5b4fc" }}>{new Date(p.trusteeVerifiedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Communication Buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
        <p style={{ color: T.muted, fontSize: 12, width: "100%", margin: "0 0 4px" }}>Quick Communication</p>
        {tenant.email && (
          <Button size="sm" variant="outline" onClick={() => sendEmail(tenant.email, "Rent Reminder — AQ Society", rentReminderMsg)} style={{ borderColor: `${T.purple}66`, color: T.purple, background: "transparent", fontSize: 12 }}>
            <Mail size={13} className="mr-1" /> Email Reminder
          </Button>
        )}
        {(tenant.whatsappPhone || tenant.phone) && (
          <Button size="sm" variant="outline" onClick={() => sendWhatsApp(tenant.whatsappPhone || tenant.phone, rentReminderMsg)} style={{ borderColor: "#25D36666", color: "#25D366", background: "transparent", fontSize: 12 }}>
            <MessageCircle size={13} className="mr-1" /> WhatsApp Reminder
          </Button>
        )}
        {tenant.email && (
          <Button size="sm" variant="outline" onClick={() => sendEmail(tenant.email, "Important Notice — AQ Society", `Assalamu Alaikum ${tenant.fullName},\n\nWe would like to bring to your attention...\n\nJazakAllahu Khayran,\nAbdullah Quilliam Society`)} style={{ borderColor: `${T.gold}66`, color: T.gold, background: "transparent", fontSize: 12 }}>
            <Mail size={13} className="mr-1" /> Custom Email
          </Button>
        )}
      </div>

      {addPaymentOpen && (
        <AddRentPaymentDialog
          tenantId={tenant.id}
          rentAmount={tenant.rentAmount}
          rentFrequency={tenant.rentFrequency}
          open={addPaymentOpen}
          onClose={() => setAddPaymentOpen(false)}
          onSuccess={() => { refetchPayments(); onRefresh(); }}
        />
      )}
      {confirmPaymentId !== null && (
        <ConfirmPaymentDialog
          paymentId={confirmPaymentId}
          amountDue={confirmAmountDue}
          open={confirmPaymentId !== null}
          onClose={() => { setConfirmPaymentId(null); setConfirmAmountDue(""); }}
          onSuccess={() => { refetchPayments(); onRefresh(); }}
        />
      )}
      {editOpen && (
        <EditTenantDialog
          tenant={tenant}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSuccess={() => { onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StudentAccommodationPage() {
  const { user } = useAuth();
  const { canEdit, canAdd } = usePermissions();
  const [addTenantOpen, setAddTenantOpen] = useState(false);
  // Listen for Hibba voice form-fill commands — opens the Add Tenant dialog
  useHibbaFormFill("/accommodation", useCallback((fields: Record<string, any>) => {
    setAddTenantOpen(true);
    // Dispatch a secondary event for the AddTenantDialog to pick up
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("hibba:fill_tenant_form", { detail: fields }));
    }, 300);
  }, []));

  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split("T")[0]; });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
  }, []);

  const { data: tenants, refetch: refetchTenants } = trpc.accommodation.listTenants.useQuery();
  const { data: upcomingRent } = trpc.accommodation.upcomingRent.useQuery({ daysAhead: 7 });
  const { data: overdueRent } = trpc.accommodation.overdueRent.useQuery();

  const selectedTenant = tenants?.find((t: any) => t.id === selectedTenantId) ?? null;

  // Summary stats
  const activeTenants = tenants?.filter((t: any) => t.status === "active") ?? [];
  const totalRentDue = overdueRent?.reduce((sum: number, r: any) => sum + parseFloat(r.payment?.amountDue ?? "0"), 0) ?? 0;
  const upcomingCount = upcomingRent?.length ?? 0;
  const overdueCount = overdueRent?.length ?? 0;

  // Filtered tenants
  const filteredTenants = (tenants ?? []).filter((t: any) => {
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || t.fullName?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q) || t.roomNumber?.toLowerCase().includes(q) || t.propertyAddress?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <div style={{ minHeight: "100vh", background: T.navy, padding: "24px", color: T.white }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: T.white, margin: 0, letterSpacing: "-0.03em" }}>Student Accommodation</h1>
          <p style={{ color: T.muted, fontSize: 14, margin: "4px 0 0" }}>Tenant management, rent tracking & automated reminders</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ height: 32, borderRadius: 8, border: `1px solid ${T.border}`, background: T.glass, color: T.white, padding: "0 8px", fontSize: 11 }} />
          <span style={{ color: T.muted, fontSize: 11 }}>to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ height: 32, borderRadius: 8, border: `1px solid ${T.border}`, background: T.glass, color: T.white, padding: "0 8px", fontSize: 11 }} />
          <button onClick={() => {
            const allTenants = tenants ?? [];
            const rows = allTenants.filter((t: any) => { const d = new Date(t.leaseStart || t.createdAt); return d >= new Date(dateFrom) && d <= new Date(dateTo + "T23:59:59"); }).map((t: any) => `${t.fullName},${t.roomNumber || ""},${t.propertyAddress || ""},${t.status},\u00a3${Number(t.monthlyRent ?? 0).toFixed(2)},${t.leaseStart ? new Date(t.leaseStart).toLocaleDateString() : ""},${t.leaseEnd ? new Date(t.leaseEnd).toLocaleDateString() : ""}`);
            if (!rows.length) { toast.info("No tenants in selected range"); return; }
            const csv = "Name,Room,Property,Status,Monthly Rent,Lease Start,Lease End\n" + rows.join("\n");
            const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `accommodation_${dateFrom}_to_${dateTo}.csv`; a.click(); URL.revokeObjectURL(url);
          }} style={{ height: 32, borderRadius: 8, border: `1px solid ${T.border}`, background: T.glass, color: T.white, padding: "0 10px", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <Download size={12} /> CSV
          </button>
          <button onClick={() => {
            const allTenants = tenants ?? [];
            const filtered = allTenants.filter((t: any) => { const d = new Date(t.leaseStart || t.createdAt); return d >= new Date(dateFrom) && d <= new Date(dateTo + "T23:59:59"); });
            if (!filtered.length) { toast.info("No tenants in selected range"); return; }
            const totalRent = filtered.reduce((s: number, t: any) => s + Number(t.monthlyRent ?? 0), 0);
            let html = `<html><head><title>Accommodation ${dateFrom} to ${dateTo}</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:15px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#f5f5f5;font-weight:600}.total{font-weight:bold;font-size:14px;margin-top:10px}</style></head><body>`;
            html += `<h2>Student Accommodation Report</h2><p>${dateFrom} to ${dateTo}</p><p class="total">Tenants: ${filtered.length} | Total Monthly Rent: \u00a3${totalRent.toFixed(2)}</p>`;
            html += `<table><tr><th>Name</th><th>Room</th><th>Property</th><th>Status</th><th>Monthly Rent</th><th>Lease Start</th><th>Lease End</th></tr>`;
            filtered.forEach((t: any) => { html += `<tr><td>${t.fullName}</td><td>${t.roomNumber || ""}</td><td>${t.propertyAddress || ""}</td><td>${t.status}</td><td>\u00a3${Number(t.monthlyRent ?? 0).toFixed(2)}</td><td>${t.leaseStart ? new Date(t.leaseStart).toLocaleDateString() : ""}</td><td>${t.leaseEnd ? new Date(t.leaseEnd).toLocaleDateString() : ""}</td></tr>`; });
            html += `</table></body></html>`;
            const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); w.print(); }
          }} style={{ height: 32, borderRadius: 8, border: `1px solid ${T.border}`, background: T.glass, color: T.white, padding: "0 10px", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <FileText size={12} /> PDF
          </button>
          {canAdd && (
            <Button onClick={() => setAddTenantOpen(true)} style={{ background: T.purple, color: T.white, border: "none", fontWeight: 600, gap: 8 }}>
              <Plus size={16} /> Add Tenant
            </Button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
        <StatCard label="Active Tenants" value={activeTenants.length} icon={Users} color={T.mint} />
        <StatCard label="Upcoming (7 days)" value={upcomingCount} icon={Clock} color={T.gold} sub={upcomingCount > 0 ? "Payments due soon" : undefined} />
        <StatCard label="Overdue Payments" value={overdueCount} icon={AlertCircle} color={T.red} sub={overdueCount > 0 ? `£${totalRentDue.toFixed(2)} outstanding` : undefined} />
        <StatCard label="Total Tenants" value={tenants?.length ?? 0} icon={Home} color={T.purple} />
      </div>

      {/* Upcoming Rent Due (7 days) */}
      {upcomingCount > 0 && (
        <div style={{ background: `${T.gold}10`, border: `1px solid ${T.gold}44`, borderRadius: 16, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Clock size={16} style={{ color: T.gold }} />
            <p style={{ color: T.gold, fontWeight: 700, fontSize: 14, margin: 0 }}>Rent Due Within 7 Days</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(upcomingRent as any[])?.map((r: any) => (
              <div key={r.payment?.id} style={{ display: "flex", alignItems: "center", gap: 12, background: T.glass, borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ color: T.white, fontSize: 13, fontWeight: 600, margin: 0 }}>{r.tenant?.fullName}</p>
                  <p style={{ color: T.muted, fontSize: 11, margin: 0 }}>{r.payment?.periodLabel} · Due {new Date(r.payment?.dueDate).toLocaleDateString("en-GB")}</p>
                </div>
                <span style={{ color: T.gold, fontWeight: 700, fontSize: 14 }}>£{parseFloat(r.payment?.amountDue ?? "0").toFixed(2)}</span>
                <Button size="sm" variant="outline" onClick={() => setSelectedTenantId(r.tenant?.id)} style={{ borderColor: `${T.gold}66`, color: T.gold, background: "transparent", fontSize: 11 }}>View</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overdue Payments */}
      {overdueCount > 0 && (
        <div style={{ background: `${T.red}10`, border: `1px solid ${T.red}44`, borderRadius: 16, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <AlertCircle size={16} style={{ color: T.red }} />
            <p style={{ color: T.red, fontWeight: 700, fontSize: 14, margin: 0 }}>Overdue Payments</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(overdueRent as any[])?.map((r: any) => (
              <div key={r.payment?.id} style={{ display: "flex", alignItems: "center", gap: 12, background: T.glass, borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ color: T.white, fontSize: 13, fontWeight: 600, margin: 0 }}>{r.tenant?.fullName}</p>
                  <p style={{ color: T.muted, fontSize: 11, margin: 0 }}>{r.payment?.periodLabel} · Was due {new Date(r.payment?.dueDate).toLocaleDateString("en-GB")}</p>
                </div>
                <span style={{ color: T.red, fontWeight: 700, fontSize: 14 }}>£{parseFloat(r.payment?.amountDue ?? "0").toFixed(2)}</span>
                <PaymentBadge status={r.payment?.status ?? "overdue"} />
                <Button size="sm" variant="outline" onClick={() => setSelectedTenantId(r.tenant?.id)} style={{ borderColor: `${T.red}66`, color: T.red, background: "transparent", fontSize: 11 }}>View</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tenant List + Detail Panel */}
      <div style={{ display: "grid", gridTemplateColumns: selectedTenant ? "1fr 1.5fr" : "1fr", gap: 20 }}>
        {/* Tenant List */}
        <div>
          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.muted }} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tenants..."
                style={{ width: "100%", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, padding: "8px 12px 8px 34px", fontSize: 13 }}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, padding: "8px 12px", fontSize: 13 }}
            >
              <option value="all" style={{ background: T.navy }}>All Statuses</option>
              <option value="active" style={{ background: T.navy }}>Active</option>
              <option value="inactive" style={{ background: T.navy }}>Inactive</option>
              <option value="notice_given" style={{ background: T.navy }}>Notice Given</option>
              <option value="vacated" style={{ background: T.navy }}>Vacated</option>
            </select>
          </div>

          {/* Tenant Cards */}
          {filteredTenants.length === 0 ? (
            <div style={{ background: T.card, borderRadius: 16, padding: 32, textAlign: "center", border: `1px solid ${T.border}` }}>
              <Home size={32} style={{ color: T.muted, marginBottom: 12 }} />
              <p style={{ color: T.muted, fontSize: 14 }}>
                {tenants?.length === 0 ? "No tenants yet. Click \"Add Tenant\" to get started." : "No tenants match your search."}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredTenants.map((t: any) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTenantId(selectedTenantId === t.id ? null : t.id)}
                  style={{
                    background: selectedTenantId === t.id ? `${T.purple}15` : T.card,
                    border: `1px solid ${selectedTenantId === t.id ? T.purple : T.border}`,
                    borderRadius: 14, padding: "14px 18px", cursor: "pointer",
                    transition: "all 0.15s", display: "flex", alignItems: "center", gap: 14,
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${T.purple}22`, border: `1px solid ${T.purple}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <User size={18} style={{ color: T.purple }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: T.white, fontWeight: 600, fontSize: 14, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.fullName}</p>
                    <p style={{ color: T.muted, fontSize: 12, margin: "2px 0 0" }}>
                      {t.roomNumber ? `Room ${t.roomNumber}` : t.propertyAddress ? t.propertyAddress.substring(0, 30) + "..." : "No room assigned"}
                      {t.rentAmount ? ` · £${parseFloat(t.rentAmount).toFixed(2)}/${t.rentFrequency}` : ""}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <StatusBadge status={t.status} />
                    <ChevronRight size={16} style={{ color: T.muted, transform: selectedTenantId === t.id ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedTenant && (
          <TenantDetailPanel
            tenant={selectedTenant}
            onClose={() => setSelectedTenantId(null)}
            onRefresh={refetchTenants}
          />
        )}
      </div>

      {/* Add Tenant Dialog */}
      <AddTenantDialog
        open={addTenantOpen}
        onClose={() => setAddTenantOpen(false)}
        onSuccess={refetchTenants}
      />
    </div>
  );
}
