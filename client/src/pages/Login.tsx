import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

const LOGO_URL = "/api/storage-proxy/manus-storage/aqs-logo-centred_9cea3e02.png";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = trpc.localAuth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      setLocation("/");
    },
    onError: (err) => {
      toast.error("Login failed", { description: err.message });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen flex flex-col" style={{background: "linear-gradient(160deg, oklch(0.18 0.10 12) 0%, oklch(0.25 0.09 12) 50%, oklch(0.30 0.08 15) 100%)"}}>      
      {/* Top accent bar */}
      <div className="h-1 w-full flex-shrink-0" style={{background: "linear-gradient(90deg, oklch(0.62 0.24 350), oklch(0.72 0.20 30), oklch(0.62 0.24 350))"}} />
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10 sm:py-16">
      {/* Logo + title */}
        <div className="text-center mb-8 w-full max-w-sm sm:max-w-md">
          <div className="inline-flex items-center justify-center mb-5 rounded-full shadow-2xl bg-white" style={{padding: 6, width: 100, height: 100}}>
            <img src={LOGO_URL} alt="Abdullah Quilliam Society" className="w-full h-full object-contain rounded-full" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">AQS HR &amp; Finance</h1>
          <p className="text-white/60 text-sm mt-2 tracking-wide">Abdullah Quilliam Society &middot; Est. 1887</p>
        </div>

        {/* Card */}
        <div className="w-full max-w-sm sm:max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Sign in to your account</h2>
              <p className="text-sm text-gray-500 mt-0.5">Enter your credentials to continue.</p>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="h-12 text-base rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
                  <button type="button" onClick={() => setLocation("/forgot-password")} className="text-xs font-medium text-primary hover:underline">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="h-12 text-base rounded-xl pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-lg"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full h-12 text-base font-semibold rounded-xl mt-2" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing in…</>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </div>

          <p className="text-center text-sm text-white/60 mt-5">
            Don&apos;t have an account?{" "}
            <button onClick={() => setLocation("/register")} className="text-pink-300 hover:text-pink-200 font-semibold hover:underline">
              Create one
            </button>
          </p>
        </div>
      </div>
      <p className="text-center text-xs text-white/25 pb-6">&copy; {new Date().getFullYear()} Abdullah Quilliam Society</p>
    </div>
  );
}
