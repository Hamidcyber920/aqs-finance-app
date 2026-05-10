import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Home, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const [ref, setRef] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRef(params.get("ref"));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <Card className="max-w-md w-full shadow-xl border-0">
        <CardContent className="pt-10 pb-8 text-center space-y-5">
          {/* Animated check */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">JazakAllah Khayran!</h1>
            <p className="text-gray-600 text-sm leading-relaxed">
              Your payment has been received. May Allah accept your donation and reward you abundantly.
            </p>
          </div>

          {ref && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <p className="text-xs text-green-700 font-medium uppercase tracking-wide mb-1">
                Payment Reference
              </p>
              <p className="text-lg font-mono font-bold text-green-800">{ref}</p>
              <p className="text-xs text-green-600 mt-1">
                Please keep this reference for your records
              </p>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-left">
            <p className="text-xs text-blue-700 leading-relaxed">
              <strong>Gift Aid:</strong> If you ticked the Gift Aid declaration, AQ Society can claim
              an extra 25p for every £1 you donated at no cost to you.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setLocation("/fintech")}
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              Make Another Donation
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation("/dashboard")}
            >
              <Home className="w-4 h-4 mr-2" />
              Go to Dashboard
            </Button>
          </div>

          <p className="text-xs text-gray-400">
            A confirmation email will be sent to your registered email address.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
