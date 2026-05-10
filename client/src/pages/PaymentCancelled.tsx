import { useLocation } from "wouter";
import { XCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function PaymentCancelled() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-slate-100 p-4">
      <Card className="max-w-md w-full shadow-xl border-0">
        <CardContent className="pt-10 pb-8 text-center space-y-5">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center">
              <XCircle className="w-12 h-12 text-orange-500" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">Payment Cancelled</h1>
            <p className="text-gray-600 text-sm leading-relaxed">
              Your payment was not completed. No charge has been made to your account.
              You can try again whenever you are ready.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-left">
            <p className="text-xs text-amber-700 leading-relaxed">
              If you experienced a technical issue, please contact us at{" "}
              <strong>info@aqsociety.org.uk</strong> and we will be happy to assist.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setLocation("/fintech")}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation("/dashboard")}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
