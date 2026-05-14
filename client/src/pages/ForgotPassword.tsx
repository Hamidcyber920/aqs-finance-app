import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Receipt, Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function ForgotPasswordPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const forgotMutation = trpc.localAuth.forgotPassword.useMutation({
    onSuccess: () => setSent(true),
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    forgotMutation.mutate({ email });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground mb-4">
            <Receipt className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="text-muted-foreground text-sm mt-1">Abdullah Quilliam Society</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Forgot password?</CardTitle>
            <CardDescription>
              Enter your email address and the administrator will receive a reset link to share with you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="text-center py-4 space-y-3">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                <p className="font-medium">Request submitted</p>
                <p className="text-sm text-muted-foreground">
                  The administrator has been notified. They will send you a password reset link shortly.
                </p>
                <Button variant="outline" className="w-full mt-4" onClick={() => setLocation("/login")}>
                  Back to sign in
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="text" inputMode="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={forgotMutation.isPending}>
                  {forgotMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending request...</>
                  ) : (
                    "Send reset request"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          <button
            onClick={() => setLocation("/login")}
            className="text-primary hover:underline font-medium inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Back to sign in
          </button>
        </p>
      </div>
    </div>
  );
}
