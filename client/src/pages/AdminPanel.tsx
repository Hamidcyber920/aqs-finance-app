import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Users, Receipt, ShieldCheck, ShieldOff, Crown, UserX, UserCheck,
  TrendingUp, CheckCircle, Clock, AlertCircle, Pencil, Check, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

export default function AdminPanelPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [confirmAction, setConfirmAction] = useState<{
    type: "role" | "suspend";
    userId: number;
    userName: string;
    newRole?: "user" | "admin";
    suspend?: boolean;
  } | null>(null);

  const [editingFullName, setEditingFullName] = useState<{ userId: number; value: string } | null>(null);
  const { data: stats, isLoading: statsLoading } = trpc.admin.stats.useQuery();
  const { data: usersData, isLoading: usersLoading } = trpc.admin.listUsers.useQuery({ limit: 100, offset: 0 });
  const { data: receiptsData, isLoading: receiptsLoading } = trpc.admin.allReceipts.useQuery({ limit: 50, offset: 0 });
  const upsertStaffProfile = trpc.staffProfile.upsert.useMutation({
    onSuccess: () => { toast.success("Full name saved"); utils.admin.listUsers.invalidate(); setEditingFullName(null); },
    onError: (e) => toast.error(e.message),
  });

  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      utils.admin.listUsers.invalidate();
      setConfirmAction(null);
    },
    onError: (err) => toast.error("Failed to update role", { description: err.message }),
  });

  const suspendMutation = trpc.admin.suspendUser.useMutation({
    onSuccess: () => {
      toast.success("User status updated");
      utils.admin.listUsers.invalidate();
      setConfirmAction(null);
    },
    onError: (err) => toast.error("Failed to update user", { description: err.message }),
  });

  if (user?.role !== "admin") {
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
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Admin Panel
        </h1>
        <p className="text-muted-foreground mt-1">Manage users, roles, and view all receipts across the organisation.</p>
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
                Promote users to admin, or suspend accounts. You cannot modify your own account here.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {usersLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : !usersData?.rows.length ? (
                <div className="py-12 text-center text-muted-foreground text-sm">No users found.</div>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_160px_100px_80px_140px] gap-4 px-4 py-3 border-b bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <span>User</span>
                    <span>Joined</span>
                    <span>Role</span>
                    <span>Status</span>
                    <span className="text-right">Actions</span>
                  </div>
                  {usersData.rows.map((u) => {
                    const isSelf = u.id === user?.id;
                    const isEditingThis = editingFullName?.userId === u.id;
                    return (
                      <div key={u.id} className="grid grid-cols-[1fr_160px_100px_80px_140px] gap-4 px-4 py-3 border-b last:border-0 items-center">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
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
                                <p className="font-medium text-sm truncate">{u.fullName ?? u.name ?? "—"}</p>
                                {u.fullName && <span className="text-xs text-muted-foreground">(username: {u.name})</span>}
                                <button className="text-muted-foreground hover:text-primary ml-1 opacity-50 hover:opacity-100" title="Set full name for emails" onClick={() => setEditingFullName({ userId: u.id, value: u.fullName ?? u.name ?? "" })}><Pencil className="h-3 w-3" /></button>
                              </>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {u.createdAt ? format(new Date(u.createdAt), "d MMM yyyy") : "—"}
                        </span>
                        <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs w-fit">
                          {u.role === "admin" ? <><Crown className="h-3 w-3 mr-1" />Admin</> : "User"}
                        </Badge>
                        <Badge variant={u.isActive ? "outline" : "destructive"} className="text-xs w-fit">
                          {u.isActive ? "Active" : "Suspended"}
                        </Badge>
                        <div className="flex gap-1 justify-end">
                          {!isSelf && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 px-2"
                                onClick={() => setConfirmAction({
                                  type: "role",
                                  userId: u.id,
                                  userName: u.name ?? u.email ?? "",
                                  newRole: u.role === "admin" ? "user" : "admin",
                                })}
                              >
                                {u.role === "admin" ? <><ShieldOff className="h-3 w-3 mr-1" />Demote</> : <><ShieldCheck className="h-3 w-3 mr-1" />Promote</>}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className={`text-xs h-7 px-2 ${!u.isActive ? "text-green-600" : "text-destructive"}`}
                                onClick={() => setConfirmAction({
                                  type: "suspend",
                                  userId: u.id,
                                  userName: u.name ?? u.email ?? "",
                                  suspend: u.isActive,
                                })}
                              >
                                {u.isActive ? <><UserX className="h-3 w-3 mr-1" />Suspend</> : <><UserCheck className="h-3 w-3 mr-1" />Restore</>}
                              </Button>
                            </>
                          )}
                          {isSelf && <span className="text-xs text-muted-foreground px-2">You</span>}
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

      {/* Role change confirm dialog (simple AlertDialog — not a delete) */}
      <AlertDialog
        open={confirmAction !== null && confirmAction.type === "role"}
        onOpenChange={() => setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.newRole === "admin" ? "Promote" : "Demote"} {confirmAction?.userName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.newRole === "admin"
                ? "This user will gain full admin access including user management."
                : "This user will lose admin access and return to a regular user role."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmAction) return;
                updateRoleMutation.mutate({ userId: confirmAction.userId, role: confirmAction.newRole! });
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Suspend/restore confirm — uses DeleteConfirmDialog for the warning flow */}
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
