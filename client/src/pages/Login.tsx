import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

/* ─── Hibba geometric gift SVG logo ─────────────────────────────────── */
function HibbaLogo({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Hibba logo">
      {/* Diamond / gift shape */}
      <rect x="8" y="18" width="32" height="22" rx="3" fill="#635BFF" />
      <rect x="6" y="14" width="36" height="7" rx="2" fill="#4f46e5" />
      {/* Ribbon vertical */}
      <rect x="21" y="14" width="6" height="26" rx="1.5" fill="#00FFC2" />
      {/* Ribbon horizontal */}
      <rect x="6" y="23" width="36" height="5" rx="1.5" fill="#00FFC2" />
      {/* Bow left loop */}
      <path d="M24 14 C18 8, 10 8, 12 14" stroke="#00FFC2" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      {/* Bow right loop */}
      <path d="M24 14 C30 8, 38 8, 36 14" stroke="#00FFC2" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

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
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ── Left panel: Navy hero ─────────────────────────────────── */}
      <div
        className="relative flex flex-col justify-between px-8 py-10 lg:px-14 lg:py-16 lg:w-[52%] overflow-hidden"
        style={{ background: "linear-gradient(145deg, #0A192F 0%, #112240 60%, #0d1f3c 100%)" }}
      >
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(rgba(99,91,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(99,91,255,0.8) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        {/* Glow orb top-right */}
        <div
          className="absolute -top-24 -right-24 w-80 h-80 rounded-full opacity-20 pointer-events-none"
          style={{ background: "radial-gradient(circle, #635BFF 0%, transparent 70%)" }}
        />
        {/* Glow orb bottom-left */}
        <div
          className="absolute -bottom-32 -left-16 w-96 h-96 rounded-full opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(circle, #00FFC2 0%, transparent 70%)" }}
        />

        {/* Logo wordmark */}
        <div className="relative z-10 flex items-center gap-3">
          <HibbaLogo size={40} />
          <span className="text-2xl font-bold tracking-tight text-white" style={{ letterSpacing: "-0.03em" }}>
            hibba
          </span>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 mt-16 lg:mt-0 lg:flex-1 lg:flex lg:flex-col lg:justify-center">
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 w-fit">
            <span className="w-2 h-2 rounded-full bg-[#00FFC2] animate-pulse" />
            <span className="text-xs font-medium text-white/70 tracking-wide uppercase">Islamic Society Finance & HR OS</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold text-white leading-[1.1] tracking-tight">
            Administration,<br />
            <span style={{ color: "#00FFC2" }}>simplified.</span>
          </h1>

          <p className="mt-5 text-lg text-white/60 leading-relaxed max-w-md">
            Hibba: A gift of clarity for your society&apos;s growth.
          </p>

          {/* Feature pills */}
          <div className="mt-10 flex flex-wrap gap-3">
            {["Finance Management", "HR & Payroll", "Qarde Hasan Loans", "AI Voice Agent", "Real-time Backups"].map((f) => (
              <span
                key={f}
                className="px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 bg-white/5 text-white/60"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 mt-10 lg:mt-0">
          <p className="text-xs text-white/25">
            Official Platform of the Abdullah Quilliam Society &middot; Securely managed via Hibba.io
          </p>
        </div>
      </div>

      {/* ── Right panel: Login card ───────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 lg:px-16 bg-[#F8F9FA]">
        {/* Mobile logo (hidden on lg) */}
        <div className="flex items-center gap-2 mb-8 lg:hidden">
          <HibbaLogo size={32} />
          <span className="text-xl font-bold text-[#0A192F]" style={{ letterSpacing: "-0.03em" }}>hibba</span>
        </div>

        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            {/* Card header */}
            <div className="px-8 pt-8 pb-6">
              <h2 className="text-2xl font-bold text-[#0A192F] tracking-tight">Enter Portal</h2>
              <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                Managing the Amanah of finance and people with excellence.
              </p>
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent mx-8" />

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-semibold text-gray-700">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="h-12 text-sm rounded-xl border-gray-200 focus:border-[#635BFF] focus:ring-[#635BFF]/20"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                    Password
                  </Label>
                  <button
                    type="button"
                    onClick={() => setLocation("/forgot-password")}
                    className="text-xs font-semibold hover:underline"
                    style={{ color: "#635BFF" }}
                  >
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
                    className="h-12 text-sm rounded-xl border-gray-200 pr-12 focus:border-[#635BFF] focus:ring-[#635BFF]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Enter Portal button */}
              <Button
                type="submit"
                className="w-full h-12 text-sm font-bold rounded-xl mt-1 shadow-md transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, #635BFF 0%, #4f46e5 100%)", color: "white" }}
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing in…</>
                ) : (
                  "Enter Portal"
                )}
              </Button>
            </form>

            {/* Card footer */}
            <div className="px-8 pb-6">
              <p className="text-center text-sm text-gray-500">
                Don&apos;t have an account?{" "}
                <button
                  onClick={() => setLocation("/register")}
                  className="font-semibold hover:underline"
                  style={{ color: "#635BFF" }}
                >
                  Create one
                </button>
              </p>
            </div>
          </div>

          {/* Trust badge */}
          <div className="mt-6 flex items-center justify-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-400">
              <path d="M7 1L8.8 5.2L13.5 5.7L10.1 8.8L11.1 13.5L7 11L2.9 13.5L3.9 8.8L0.5 5.7L5.2 5.2L7 1Z" fill="currentColor" />
            </svg>
            <span className="text-xs text-gray-400">Trusted by the Abdullah Quilliam Society since 2024</span>
          </div>
        </div>
      </div>
    </div>
  );
}
