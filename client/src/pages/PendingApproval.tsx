import { Clock, Receipt, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

export default function PendingApprovalPage() {
  const [, setLocation] = useLocation();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => setLocation("/login"),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground mb-2">
          <Receipt className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Abdullah Quilliam Society</h1>
          <p className="text-muted-foreground text-sm mt-1">Finance Management System</p>
        </div>

        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 pb-6 space-y-4">
            <div className="flex justify-center">
              <div className="h-14 w-14 rounded-full bg-amber-100 flex items-center justify-center">
                <Clock className="h-7 w-7 text-amber-600" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-amber-900">Account Pending Approval</h2>
              <p className="text-sm text-amber-700 mt-2 leading-relaxed">
                Your registration has been submitted successfully. An administrator needs to approve
                your account before you can access the system.
              </p>
            </div>
            <div className="bg-amber-100 rounded-lg p-3 text-xs text-amber-800 space-y-1">
              <p className="font-medium">What happens next?</p>
              <p>The system administrator has been notified of your registration. Once approved, you will be able to log in with your email and password.</p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setLocation("/login")}
          >
            Back to Login
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => logoutMutation.mutate()}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          If you have not received approval within 24 hours, please contact your administrator directly.
        </p>
      </div>
    </div>
  );
}
