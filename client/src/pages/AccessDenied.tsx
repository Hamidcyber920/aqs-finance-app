import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function AccessDenied() {
  const [, navigate] = useLocation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="rounded-full bg-red-500/10 p-4 mb-6">
        <ShieldX className="h-12 w-12 text-red-400" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">
        You don't have access to this page
      </h1>
      <p className="text-muted-foreground max-w-md mb-8">
        Your current role does not include permission to view this section.
        If you believe this is an error, please contact your administrator.
      </p>
      <Button
        onClick={() => navigate("/dashboard")}
        variant="outline"
        className="gap-2"
      >
        Go to Dashboard
      </Button>
    </div>
  );
}
