import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { User, Lock, Bell, Shield, Building2, Calendar } from "lucide-react";

export default function ProfileSettings() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const { data: departments = [] } = trpc.departments.list.useQuery();
  const { data: incomeCategories = [] } = trpc.income.categories.useQuery();

  const changePasswordMutation = trpc.localAuth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setChangingPassword(false);
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to change password");
      setChangingPassword(false);
    },
  });

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    setChangingPassword(true);
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "superadmin": return "bg-red-100 text-red-800 border-red-200";
      case "trustee": return "bg-purple-100 text-purple-800 border-purple-200";
      case "manager": return "bg-blue-100 text-blue-800 border-blue-200";
      case "assistant": return "bg-green-100 text-green-800 border-green-200";
      case "volunteer": return "bg-gray-100 text-gray-800 border-gray-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "superadmin": return "Super Admin";
      case "trustee": return "Trustee";
      case "manager": return "Manager";
      case "assistant": return "Assistant";
      case "volunteer": return "Volunteer";
      default: return role;
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Profile & Settings</h1>
          <p className="page-subtitle">Manage your account details and preferences</p>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-white border border-gray-200 p-1">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="organisation" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Organisation
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-[#1B4332]" />
                Account Information
              </CardTitle>
              <CardDescription>Your personal account details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-[#1B4332] flex items-center justify-center text-white text-2xl font-bold">
                  {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-lg">{user?.name ?? "—"}</p>
                  <p className="text-gray-500 text-sm">{user?.email ?? "—"}</p>
                  <Badge className={`mt-1 text-xs border ${getRoleBadgeColor(user?.role ?? "")}`}>
                    <Shield className="w-3 h-3 mr-1" />
                    {getRoleLabel(user?.role ?? "")}
                  </Badge>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-600 text-sm">Full Name</Label>
                  <p className="mt-1 font-medium text-gray-900">{user?.name ?? "—"}</p>
                </div>
                <div>
                  <Label className="text-gray-600 text-sm">Email Address</Label>
                  <p className="mt-1 font-medium text-gray-900">{user?.email ?? "—"}</p>
                </div>
                <div>
                  <Label className="text-gray-600 text-sm">Role</Label>
                  <p className="mt-1 font-medium text-gray-900">{getRoleLabel(user?.role ?? "")}</p>
                </div>
                <div>
                  <Label className="text-gray-600 text-sm">Login Method</Label>
                  <p className="mt-1 font-medium text-gray-900 capitalize">{user?.loginMethod ?? "Email & Password"}</p>
                </div>
                <div>
                  <Label className="text-gray-600 text-sm">Account Status</Label>
                  <p className="mt-1">
                    <Badge className="bg-green-100 text-green-800 border-green-200 border text-xs">Active</Badge>
                  </p>
                </div>
                <div>
                  <Label className="text-gray-600 text-sm">Member Since</Label>
                  <p className="mt-1 font-medium text-gray-900 flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    {user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Permissions Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#1B4332]" />
                Access & Permissions
              </CardTitle>
              <CardDescription>Modules you have access to based on your role</CardDescription>
            </CardHeader>
            <CardContent>
              {user?.role === "superadmin" || user?.role === "trustee" ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {["Receipt Scanner", "Dashboard", "Fundraising", "Qarde Hasan Loans", "Income & Rentals", "Payroll", "Donors", "Email Campaigns", "Admin Panel", "Reports"].map((mod) => (
                    <div key={mod} className="flex items-center gap-2 p-2 rounded-lg bg-green-50 border border-green-200">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-xs text-green-800 font-medium">{mod}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Contact your administrator to view or update your module permissions.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-[#1B4332]" />
                Change Password
              </CardTitle>
              <CardDescription>Update your password to keep your account secure</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  placeholder="Enter your current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Repeat your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button
                onClick={handleChangePassword}
                disabled={changingPassword}
                className="bg-[#1B4332] hover:bg-[#2D6A4F] text-white"
              >
                {changingPassword ? "Updating..." : "Update Password"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-[#1B4332]" />
                Notifications
              </CardTitle>
              <CardDescription>Email notifications sent to {user?.email}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "New user registration requires approval", enabled: true },
                { label: "Receipt processed successfully", enabled: true },
                { label: "Monthly expense threshold exceeded", enabled: true },
                { label: "Loan application submitted", enabled: true },
                { label: "Payroll sync completed (25th of month)", enabled: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-700">{item.label}</span>
                  <Badge className={item.enabled ? "bg-green-100 text-green-800 border-green-200 border text-xs" : "bg-gray-100 text-gray-500 border text-xs"}>
                    {item.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organisation Tab */}
        <TabsContent value="organisation" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#1B4332]" />
                Organisation Details
              </CardTitle>
              <CardDescription>Abdullah Quilliam Society — system configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-600 text-sm">Organisation Name</Label>
                  <p className="mt-1 font-medium text-gray-900">Abdullah Quilliam Society</p>
                </div>
                <div>
                  <Label className="text-gray-600 text-sm">System</Label>
                  <p className="mt-1 font-medium text-gray-900">Financial Management System</p>
                </div>
                <div>
                  <Label className="text-gray-600 text-sm">Gmail Integration</Label>
                  <Badge className="mt-1 bg-green-100 text-green-800 border-green-200 border text-xs">Connected</Badge>
                </div>
                <div>
                  <Label className="text-gray-600 text-sm">Google Drive Sync</Label>
                  <Badge className="mt-1 bg-green-100 text-green-800 border-green-200 border text-xs">Connected — syncs on 25th</Badge>
                </div>
                <div>
                  <Label className="text-gray-600 text-sm">Monthly Expense Threshold</Label>
                  <p className="mt-1 font-medium text-gray-900">£5,000 (notification trigger)</p>
                </div>
                <div>
                  <Label className="text-gray-600 text-sm">Payroll Cycle</Label>
                  <p className="mt-1 font-medium text-gray-900">Monthly — 25th of each month</p>
                </div>
              </div>

              <Separator />

                <div>
                <Label className="text-gray-600 text-sm">Expense Departments</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {departments.map((dept) => (
                    <Badge key={dept.id} variant="outline" className="text-xs" style={{ borderColor: dept.color ?? '#1B4332', color: dept.color ?? '#1B4332' }}>
                      {dept.name}
                    </Badge>
                  ))}
                  {departments.length === 0 && <span className="text-xs text-muted-foreground">No departments yet</span>}
                </div>
              </div>

              <div>
                <Label className="text-gray-600 text-sm">Income Categories</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {incomeCategories.map((cat) => (
                    <Badge key={cat.id} variant="outline" className="text-xs" style={{ borderColor: cat.color ?? '#C9A84C', color: cat.color ?? '#C9A84C' }}>
                      {cat.name}
                    </Badge>
                  ))}
                  {incomeCategories.length === 0 && <span className="text-xs text-muted-foreground">No categories yet</span>}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
