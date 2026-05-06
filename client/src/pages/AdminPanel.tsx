import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Users, Receipt, ShieldCheck, ShieldOff, Crown, UserX, UserCheck,
  TrendingUp, CheckCircle, Clock, AlertCircle, Pencil, Check, X,
  UserPlus, Building2, ChevronDown, Key, Eye, EyeOff, Home,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

// ─── Role config ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Super Admin",
  trustee: "Trustee",
  manager: "Manager",
  deputy: "Deputy",
  property_manager: "Property Manager",
  assistant: "Assistant",
  volunteer: "Volunteer",
  user: "User",
};

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-purple-100 text-purple-800 border-purple-200",
  admin: "bg-purple-100 text-purple-800 border-purple-200",
  trustee: "bg-blue-100 text-blue-800 border-blue-200",
  manager: "bg-green-100 text-green-800 border-green-200",
  deputy: "bg-teal-100 text-teal-800 border-teal-200",
  property_manager: "bg-orange-100 text-orange-800 border-orange-200",
  assistant: "bg-gray-100 text-gray-700 border-gray-200",
  volunteer: "bg-yellow-100 text-yellow-800 border-yellow-200",
  user: "bg-gray-100 text-gray-600 border-gray-200",
};

const ASSIGNABLE_ROLES = [
  { value: "manager", label: "Manager" },
  { value: "deputy", label: "Deputy" },
  { value: "assistant", label: "Assistant" },
  { value: "volunteer", label: "Volunteer" },
  { value: "trustee", label: "Trustee" },
  { value: "property_manager", label: "Property Manager" },
];

const ALL_ROLES_FOR_UPDATE = [
  { value: "superadmin", label: "Super Admin" },
  { value: "trustee", label: "Trustee" },
  { value: "manager", label: "Manager" },
  { value: "deputy", label: "Deputy" },
  { value: "property_manager", label: "Property Manager" },
  { value: "assistant", label: "Assistant" },
  { value: "volunteer", label: "Volunteer" },
  { value: "user", label: "User" },
];

// ─── Permission labels ────────────────────────────────────────────────────────

const PERMISSION_GROUPS: { group: string; items: { key: string; label: string; description: string }[] }[] = [
  {
    group: "General Access",
    items: [
      { key: "canViewDashboard", label: "View Dashboard", description: "Access the main dashboard and statistics" },
      { key: "canViewOwnPayslip", label: "View Own Payslip", description: "Access their own payslip information" },
    ],
  },
  {
    group: "Finance Reporting & Tracking",
    items: [
      { key: "canViewFinanceReports", label: "View Finance Reports", description: "Access monthly and annual financial reports" },
      { key: "canExportFinanceReports", label: "Export Finance Reports", description: "Download and export financial reports as PDF/CSV" },
      { key: "canExportReports", label: "Export All Reports", description: "Export any report or data from the system" },
      { key: "canTrackFinance", label: "Finance Tracking", description: "View live income, expense, and balance tracking across all modules" },
      { key: "canViewAllIncome", label: "View All Income", description: "See all income records across every category" },
      { key: "canViewAllExpenses", label: "View All Expenses", description: "See expenses submitted by all staff" },
    ],
  },
  {
    group: "Cash & Collections",
    items: [
      { key: "canManageCashCollection", label: "Manage Cash Collection", description: "Record and manage cash collection entries" },
      { key: "canManageFridayCollection", label: "Manage Friday Collection", description: "Enter and manage Friday prayer cash and card collections" },
      { key: "canReconcileFriday", label: "Reconcile Friday Collection", description: "Reconcile and sign off Friday collection totals" },
    ],
  },
  {
    group: "Reconciliation",
    items: [
      { key: "canViewReconciliation", label: "View Reconciliation", description: "Access the monthly reconciliation module" },
      { key: "canManageReconciliation", label: "Manage Reconciliation", description: "Create, edit, and finalise monthly reconciliation sessions" },
    ],
  },
  {
    group: "Expenses & Invoices",
    items: [
      { key: "canManageExpenses", label: "Manage Own Expenses", description: "Submit and manage their own receipts and expenses" },
      { key: "canApproveExpenses", label: "Approve Expenses", description: "Authorise and approve expense submissions from other staff" },
      { key: "canManageInvoices", label: "Manage Invoices", description: "Create, edit, and authorise invoices in Monthly Expenses" },
    ],
  },
  {
    group: "Income & Fundraising",
    items: [
      { key: "canManageIncome", label: "Manage Income", description: "Record and manage income entries across all categories" },
      { key: "canManageFundraising", label: "Manage Fundraising", description: "Create campaigns and record donations" },
      { key: "canManageDonors", label: "Manage Donors", description: "Add and manage donor records" },
      { key: "canSendCampaigns", label: "Send Email Campaigns", description: "Send fundraising email campaigns to donors" },
    ],
  },
  {
    group: "Payroll & Loans",
    items: [
      { key: "canManagePayroll", label: "Manage Payroll", description: "Create and manage payroll records" },
      { key: "canManageLoans", label: "Manage Qarde Hasan", description: "Create and manage loan applications" },
      { key: "canSignLoans", label: "Sign Loan Documents", description: "Approve and sign loan agreements as trustee" },
    ],
  },
  {
    group: "Staff & Administration",
    items: [
      { key: "canManageStaff", label: "Manage Staff", description: "Manage staff profiles and information" },
      { key: "canManageUsers", label: "Manage Users", description: "Approve, suspend, and manage user accounts" },
    ],
  },
];

// ─── Create Staff Dialog ──────────────────────────────────────────────────────

function CreateStaffDialog({ open, onClose, allUsers }: {
  open: boolean;
  onClose: () => void;
  allUsers: { id: number; name: string | null; email: string | null; role: string }[];
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    name: "", email: "", role: "assistant", supervisedById: "",
    isPropertyManager: false, jobTitle: "", department: "", phone: "", tempPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);

  const createStaff = trpc.users.createStaff.useMutation({
    onSuccess: () => {
      toast.success("Staff account created and welcome email sent");
      utils.admin.listUsers.invalidate();
      onClose();
      setForm({ name: "", email: "", role: "assistant", supervisedById: "", isPropertyManager: false, jobTitle: "", department: "", phone: "", tempPassword: "" });
    },
    onError: (e) => toast.error("Failed to create staff", { description: e.message }),
  });

  const handleSubmit = () => {
    if (!form.name || !form.email || !form.tempPassword) {
      toast.error("Name, email, and temporary password are required");
      return;
    }
    createStaff.mutate({
      name: form.name,
      email: form.email,
      role: form.role as any,
      supervisedById: form.supervisedById ? parseInt(form.supervisedById) : undefined,
      isPropertyManager: form.isPropertyManager,
      jobTitle: form.jobTitle || undefined,
      department: form.department || undefined,
      phone: form.phone || undefined,
      tempPassword: form.tempPassword,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Create Staff Account
          </DialogTitle>
          <DialogDescription>
            Create a new staff account directly. The user will receive a welcome email with their temporary password.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Full Name *</Label>
              <Input placeholder="e.g. Mumin Khan" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Email Address *</Label>
              <Input type="email" placeholder="mumin@aqs.org.uk" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Supervised By</Label>
              <Select value={form.supervisedById} onValueChange={v => setForm(f => ({ ...f, supervisedById: v }))}>
                <SelectTrigger><SelectValue placeholder="Select supervisor…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {allUsers.filter(u => ["superadmin", "admin", "trustee", "manager"].includes(u.role)).map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name ?? u.email} ({ROLE_LABELS[u.role] ?? u.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Job Title</Label>
              <Input placeholder="e.g. Property Manager" value={form.jobTitle} onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Department</Label>
              <Input placeholder="e.g. Operations" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input placeholder="+44 7700 000000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Temporary Password *</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={form.tempPassword}
                  onChange={e => setForm(f => ({ ...f, tempPassword: e.target.value }))}
                  className="pr-9"
                />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword(s => !s)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
            <Switch
              checked={form.isPropertyManager}
              onCheckedChange={v => setForm(f => ({ ...f, isPropertyManager: v }))}
              id="is-pm"
            />
            <div>
              <Label htmlFor="is-pm" className="cursor-pointer flex items-center gap-1.5">
                <Home className="h-3.5 w-3.5 text-orange-600" />
                Property Manager
              </Label>
              <p className="text-xs text-muted-foreground">Grant property management responsibilities</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createStaff.isPending}>
            {createStaff.isPending ? "Creating…" : "Create Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Permissions Dialog ───────────────────────────────────────────────────────

function PermissionsDialog({ userId, userName, open, onClose, canEdit }: {
  userId: number; userName: string; open: boolean; onClose: () => void; canEdit: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: perms, isLoading } = trpc.users.getPermissions.useQuery({ userId }, { enabled: open });
  const updatePerms = trpc.users.updatePermissions.useMutation({
    onSuccess: () => { toast.success("Permissions updated"); utils.users.getPermissions.invalidate({ userId }); },
    onError: (e) => toast.error("Failed to update permissions", { description: e.message }),
  });

  const toggle = (key: string, current: boolean) => {
    if (!canEdit) { toast.error("Only superadmin or trustee can change permissions"); return; }
    updatePerms.mutate({ userId, [key]: !current } as any);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Permissions — {userName}
          </DialogTitle>
          <DialogDescription>
            {canEdit ? "Toggle permissions for this user. Changes take effect immediately." : "View-only. Only superadmin or trustee can change permissions."}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-3 py-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <div className="space-y-5 py-2">
            {PERMISSION_GROUPS.map(({ group, items }) => (
              <div key={group}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">{group}</p>
                <div className="space-y-1.5">
                  {items.map(({ key, label, description }) => {
                    const val = (perms as any)?.[key] ?? false;
                    return (
                      <div key={key} className={`flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/20 transition-colors ${val ? 'border-primary/30 bg-primary/5' : ''}`}>
                        <div>
                          <p className="text-sm font-medium">{label}</p>
                          <p className="text-xs text-muted-foreground">{description}</p>
                        </div>
                        <Switch
                          checked={val}
                          onCheckedChange={() => toggle(key, val)}
                          disabled={!canEdit || updatePerms.isPending}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main AdminPanel ──────────────────────────────────────────────────────────

export default function AdminPanelPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const isSuperAdmin = user?.role === "superadmin" || user?.role === "admin";
  const isTrusteeOrAbove = isSuperAdmin || user?.role === "trustee";

  const [confirmAction, setConfirmAction] = useState<{
    type: "role" | "suspend";
    userId: number;
    userName: string;
    newRole?: string;
    suspend?: boolean;
  } | null>(null);

  const [editingFullName, setEditingFullName] = useState<{ userId: number; value: string } | null>(null);
  const [showCreateStaff, setShowCreateStaff] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<{ id: number; name: string } | null>(null);
  const [roleEditUser, setRoleEditUser] = useState<{ id: number; name: string; currentRole: string } | null>(null);
  const [newRoleValue, setNewRoleValue] = useState("");

  const { data: stats, isLoading: statsLoading } = trpc.admin.stats.useQuery();
  const { data: usersData, isLoading: usersLoading } = trpc.admin.listUsers.useQuery({ limit: 200, offset: 0 });
  const { data: receiptsData, isLoading: receiptsLoading } = trpc.admin.allReceipts.useQuery({ limit: 50, offset: 0 });

  const upsertStaffProfile = trpc.staffProfile.upsert.useMutation({
    onSuccess: () => { toast.success("Full name saved"); utils.admin.listUsers.invalidate(); setEditingFullName(null); },
    onError: (e) => toast.error(e.message),
  });

  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => { toast.success("Role updated"); utils.admin.listUsers.invalidate(); setRoleEditUser(null); },
    onError: (err) => toast.error("Failed to update role", { description: err.message }),
  });

  const suspendMutation = trpc.admin.suspendUser.useMutation({
    onSuccess: () => { toast.success("User status updated"); utils.admin.listUsers.invalidate(); setConfirmAction(null); },
    onError: (err) => toast.error("Failed to update user", { description: err.message }),
  });

  const allUsers = usersData?.rows ?? [];

  // Build supervisor name map
  const userMap = Object.fromEntries(allUsers.map(u => [u.id, u.name ?? u.email ?? `#${u.id}`]));

  if (!isTrusteeOrAbove && user?.role !== "manager") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldOff className="h-14 w-14 text-muted-foreground mb-4 opacity-40" />
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground mt-2 text-sm">You do not have permission to view this page.</p>
        <Button className="mt-6" onClick={() => setLocation("/")}>Go to Home</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Admin Panel
          </h1>
          <p className="text-muted-foreground mt-1">Manage users, roles, permissions, and view all receipts across the organisation.</p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setShowCreateStaff(true)} className="gap-2 shrink-0">
            <UserPlus className="h-4 w-4" />
            Create Staff
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-14 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-3">
                  <Receipt className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Receipts</p>
                    <p className="text-xl font-bold">{Number(stats?.total ?? 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Spend</p>
                    <p className="text-xl font-bold">£{Number(stats?.totalAmount ?? 0).toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Users</p>
                    <p className="text-xl font-bold">{usersData?.total ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Pending</p>
                    <p className="text-xl font-bold">{Number(stats?.pending ?? 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Users ({usersData?.total ?? 0})
          </TabsTrigger>
          <TabsTrigger value="receipts" className="gap-2">
            <Receipt className="h-4 w-4" />
            All Receipts
          </TabsTrigger>
        </TabsList>

        {/* Users tab */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">User Management</CardTitle>
              <CardDescription>
                Manage staff roles, supervision, permissions, and account status.
                {!isSuperAdmin && " Role changes and permission edits require superadmin or trustee access."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {usersLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : !allUsers.length ? (
                <div className="py-12 text-center text-muted-foreground text-sm">No users found.</div>
              ) : (
                <>
                  <div className="hidden lg:grid grid-cols-[1fr_180px_140px_80px_180px] gap-4 px-4 py-3 border-b bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <span>User</span>
                    <span>Joined</span>
                    <span>Role</span>
                    <span>Status</span>
                    <span className="text-right">Actions</span>
                  </div>
                  {allUsers.map((u) => {
                    const isSelf = u.id === user?.id;
                    const isEditingThis = editingFullName?.userId === u.id;
                    const supervisorName = (u as any).supervisedById ? userMap[(u as any).supervisedById] : null;
                    const isPropMgr = (u as any).isPropertyManager;
                    return (
                      <div key={u.id} className="grid grid-cols-1 lg:grid-cols-[1fr_180px_140px_80px_180px] gap-2 lg:gap-4 px-4 py-3 border-b last:border-0 items-start lg:items-center hover:bg-muted/10">
                        {/* User info */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            {isEditingThis ? (
                              <>
                                <Input
                                  className="h-6 text-sm py-0 px-1 w-36"
                                  value={editingFullName.value}
                                  onChange={e => setEditingFullName({ userId: u.id, value: e.target.value })}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") upsertStaffProfile.mutate({ userId: u.id, fullName: editingFullName.value });
                                    if (e.key === "Escape") setEditingFullName(null);
                                  }}
                                  autoFocus
                                  placeholder="Full name…"
                                />
                                <button className="text-green-600 hover:text-green-700" onClick={() => upsertStaffProfile.mutate({ userId: u.id, fullName: editingFullName.value })}><Check className="h-3.5 w-3.5" /></button>
                                <button className="text-muted-foreground hover:text-foreground" onClick={() => setEditingFullName(null)}><X className="h-3.5 w-3.5" /></button>
                              </>
                            ) : (
                              <>
                                <p className="font-medium text-sm truncate">{(u as any).fullName ?? u.name ?? "—"}</p>
                                {(u as any).fullName && <span className="text-xs text-muted-foreground">(username: {u.name})</span>}
                                {isSuperAdmin && (
                                  <button className="text-muted-foreground hover:text-primary ml-1 opacity-50 hover:opacity-100" title="Set full name" onClick={() => setEditingFullName({ userId: u.id, value: (u as any).fullName ?? u.name ?? "" })}><Pencil className="h-3 w-3" /></button>
                                )}
                              </>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          {/* Supervision + property manager badges */}
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {supervisorName && (
                              <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                                Supervised by: {supervisorName}
                              </span>
                            )}
                            {isPropMgr && (
                              <span className="text-xs bg-orange-100 text-orange-700 rounded px-1.5 py-0.5 flex items-center gap-1">
                                <Home className="h-3 w-3" /> Property Manager
                              </span>
                            )}
                            {(u as any).jobTitle && (
                              <span className="text-xs text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">{(u as any).jobTitle}</span>
                            )}
                          </div>
                        </div>

                        {/* Joined */}
                        <span className="text-xs text-muted-foreground hidden lg:block">
                          {u.createdAt ? format(new Date(u.createdAt), "d MMM yyyy") : "—"}
                        </span>

                        {/* Role badge */}
                        <div>
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                            {(u.role === "superadmin" || u.role === "admin") && <Crown className="h-3 w-3" />}
                            {ROLE_LABELS[u.role] ?? u.role}
                          </span>
                        </div>

                        {/* Status */}
                        <Badge variant={u.isActive ? "outline" : "destructive"} className="text-xs w-fit">
                          {u.isActive ? "Active" : "Suspended"}
                        </Badge>

                        {/* Actions */}
                        <div className="flex gap-1 justify-start lg:justify-end flex-wrap">
                          {!isSelf && (
                            <>
                              {/* Permissions button — visible to all admins, editable only by superadmin/trustee */}
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 px-2"
                                onClick={() => setPermissionsUser({ id: u.id, name: (u as any).fullName ?? u.name ?? u.email ?? "" })}
                              >
                                <Key className="h-3 w-3 mr-1" />
                                Permissions
                              </Button>

                              {/* Role change — superadmin/trustee only */}
                              {isTrusteeOrAbove && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7 px-2"
                                  onClick={() => { setRoleEditUser({ id: u.id, name: (u as any).fullName ?? u.name ?? "", currentRole: u.role }); setNewRoleValue(u.role); }}
                                >
                                  <ShieldCheck className="h-3 w-3 mr-1" />
                                  Role
                                </Button>
                              )}

                              {/* Suspend/restore — superadmin/trustee only */}
                              {isTrusteeOrAbove && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={`text-xs h-7 px-2 ${!u.isActive ? "text-green-600" : "text-destructive"}`}
                                  onClick={() => setConfirmAction({ type: "suspend", userId: u.id, userName: (u as any).fullName ?? u.name ?? u.email ?? "", suspend: u.isActive })}
                                >
                                  {u.isActive ? <><UserX className="h-3 w-3 mr-1" />Suspend</> : <><UserCheck className="h-3 w-3 mr-1" />Restore</>}
                                </Button>
                              )}
                            </>
                          )}
                          {isSelf && <span className="text-xs text-muted-foreground px-2 py-1">You</span>}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* All receipts tab */}
        <TabsContent value="receipts" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Receipts</CardTitle>
              <CardDescription>View all receipts submitted by the entire team.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {receiptsLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !receiptsData?.rows.length ? (
                <div className="py-12 text-center text-muted-foreground text-sm">No receipts yet.</div>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_120px_100px_120px_80px] gap-4 px-4 py-3 border-b bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <span>Vendor</span>
                    <span>Date</span>
                    <span>Amount</span>
                    <span>Category</span>
                    <span>Status</span>
                  </div>
                  {receiptsData.rows.map((r) => (
                    <div
                      key={r.id}
                      className="grid grid-cols-[1fr_120px_100px_120px_80px] gap-4 px-4 py-3 border-b last:border-0 items-center hover:bg-muted/20 cursor-pointer"
                      onClick={() => setLocation(`/receipts/${r.id}`)}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{r.vendor ?? "Unknown"}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.originalFilename ?? ""}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {r.receiptDate ? format(new Date(r.receiptDate), "d MMM yyyy") : "—"}
                      </span>
                      <span className="text-sm font-medium">
                        {r.amount ? `£${parseFloat(String(r.amount)).toFixed(2)}` : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">{r.categoryName ?? "—"}</span>
                      <Badge
                        variant={r.status === "processed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}
                        className="text-xs w-fit"
                      >
                        {r.status}
                      </Badge>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Staff Dialog — superadmin only */}
      <CreateStaffDialog
        open={showCreateStaff}
        onClose={() => setShowCreateStaff(false)}
        allUsers={allUsers}
      />

      {/* Permissions Dialog */}
      {permissionsUser && (
        <PermissionsDialog
          userId={permissionsUser.id}
          userName={permissionsUser.name}
          open={!!permissionsUser}
          onClose={() => setPermissionsUser(null)}
          canEdit={isTrusteeOrAbove}
        />
      )}

      {/* Role change dialog */}
      <Dialog open={!!roleEditUser} onOpenChange={(v) => { if (!v) setRoleEditUser(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Role — {roleEditUser?.name}</DialogTitle>
            <DialogDescription>Select the new role for this user. This takes effect immediately.</DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <Select value={newRoleValue} onValueChange={setNewRoleValue}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_ROLES_FOR_UPDATE.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleEditUser(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!roleEditUser) return;
                updateRoleMutation.mutate({ userId: roleEditUser.id, role: newRoleValue });
              }}
              disabled={updateRoleMutation.isPending || newRoleValue === roleEditUser?.currentRole}
            >
              {updateRoleMutation.isPending ? "Saving…" : "Save Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend/restore confirm */}
      <DeleteConfirmDialog
        open={confirmAction !== null && confirmAction.type === "suspend"}
        onOpenChange={(v) => { if (!v) setConfirmAction(null); }}
        itemLabel={`${confirmAction?.userName ?? "this user"}'s account access (${confirmAction?.suspend ? "suspend" : "restore"})`}
        onConfirm={() => {
          if (!confirmAction) return;
          suspendMutation.mutate({ userId: confirmAction.userId, suspend: confirmAction.suspend! });
          setConfirmAction(null);
        }}
        loading={suspendMutation.isPending}
      />
    </div>
  );
}
