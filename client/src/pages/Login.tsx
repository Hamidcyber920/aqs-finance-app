import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

/* ─── Refined corporate gift box icon ───────────────────────────────── */
function HibbaGiftIcon({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-label="Hibba logo">
      <defs>
        <linearGradient id="lgBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7B75FF" />
          <stop offset="100%" stopColor="#4438CC" />
        </linearGradient>
        <linearGradient id="lgLid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9490FF" />
          <stop offset="100%" stopColor="#635BFF" />
        </linearGradient>
        <linearGradient id="lgRib" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00FFC2" />
          <stop offset="100%" stopColor="#00C99B" />
        </linearGradient>
      </defs>
      <rect x="9" y="37" width="57" height="32" rx="7" fill="url(#lgBody)" />
      <rect x="9" y="37" width="57" height="8" rx="7" fill="rgba(255,255,255,0.09)" />
      <rect x="9" y="62" width="57" height="7" rx="7" fill="rgba(0,0,0,0.18)" />
      <rect x="6" y="26" width="63" height="14" rx="6" fill="url(#lgLid)" />
      <rect x="6" y="26" width="63" height="3" rx="6" fill="rgba(255,255,255,0.22)" />
      <rect x="6" y="36" width="63" height="4" rx="3" fill="rgba(0,0,0,0.1)" />
      <rect x="6" y="36" width="63" height="6.5" rx="2" fill="url(#lgRib)" />
      <rect x="35" y="26" width="6.5" height="43" rx="2" fill="url(#lgRib)" />
      <path d="M38 25 C35 18 23 6 17 12 C14 16 18 23 31 25.5 Z" fill="#00FFC2" opacity="0.92" />
      <path d="M38 25 C41 18 53 6 59 12 C62 16 58 23 45 25.5 Z" fill="#00DDA8" opacity="0.92" />
      <ellipse cx="38" cy="25.5" rx="4.5" ry="3.5" fill="#00FFC2" />
      <ellipse cx="36.8" cy="24.2" rx="1.6" ry="1.1" fill="rgba(255,255,255,0.45)" />
    </svg>
  );
}

/* ─── HibbaPay wallet icon ───────────────────────────────────────────── */
function HibbaWalletIcon({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 0.78)} viewBox="0 0 84 64" fill="none" aria-label="HibbaPay logo">
      <defs>
        <linearGradient id="wCard" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,255,194,0.12)" />
          <stop offset="100%" stopColor="rgba(0,255,194,0.04)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="80" height="60" rx="11" fill="url(#wCard)" stroke="#00FFC2" strokeWidth="3" />
      <rect x="2" y="16" width="80" height="11" fill="#00FFC2" opacity="0.18" />
      <line x1="2" y1="16" x2="82" y2="16" stroke="#00FFC2" strokeWidth="3" />
      <line x1="2" y1="27" x2="82" y2="27" stroke="#00FFC2" strokeWidth="1.5" opacity="0.4" />
      <path d="M22 52 C14 52 9 46 9 39 C9 32 14 27 22 27 C17 30 15 34 15 39 C15 44 17 49 22 52 Z" fill="#00FFC2" />
      <rect x="56" y="42" width="10" height="7" rx="2" stroke="#00FFC2" strokeWidth="1.5" fill="none" opacity="0.5" />
      <line x1="61" y1="42" x2="61" y2="49" stroke="#00FFC2" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

const FEATURES = ["Finance Management", "HR & Payroll", "Qarde Hasan Loans", "AI Voice Agent", "Real-time Backups"];
const PAY_FEATURES = ["Halal Certified", "Donor Portals", "Payslip Access", "Secure Gateway"];

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = trpc.localAuth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      window.location.href = "/";
    },
    onError: (err) => {
      // Zod validation errors come as JSON array in message — extract readable text
      let msg = err.message;
      try {
        const issues = JSON.parse(msg);
        if (Array.isArray(issues)) msg = issues.map((i: any) => i.message).join(", ");
      } catch { /* not JSON, use as-is */ }
      toast.error("Login failed", { description: msg || "Please check your email and password" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      toast.error("Please enter both email and password");
      return;
    }
    loginMutation.mutate({ email: trimmedEmail, password });
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0B1D35", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,700;9..40,800&display=swap');`}</style>

      {/* ── Background effects ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ position:"absolute",inset:0, background:"linear-gradient(160deg,#0E2244 0%,#0B1D35 55%,#070F1E 100%)" }} />
        <svg style={{ position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.032 }}>
          <defs><pattern id="lgrid" width="64" height="64" patternUnits="userSpaceOnUse">
            <path d="M 64 0 L 0 0 0 64" fill="none" stroke="white" strokeWidth="0.6" />
          </pattern></defs>
          <rect width="100%" height="100%" fill="url(#lgrid)" />
        </svg>
        <div style={{ position:"absolute",top:"-20%",left:"-8%",width:700,height:700, background:"radial-gradient(ellipse,rgba(99,91,255,0.09) 0%,transparent 65%)" }} />
        <div style={{ position:"absolute",bottom:"-15%",right:"-5%",width:600,height:600, background:"radial-gradient(ellipse,rgba(0,255,194,0.055) 0%,transparent 65%)" }} />
      </div>

      {/* ── Main layout: split panels on lg, stacked on mobile ── */}
      <div className="relative z-10 flex-1 flex flex-col lg:flex-row">

        {/* ── LEFT: hibba.io panel ── */}
        <div className="flex flex-col gap-6 px-8 py-10 lg:px-14 lg:py-14 lg:w-[45%]" style={{ borderRight:"1px solid rgba(255,255,255,0.08)" }}>
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div style={{ transform:"scaleX(0.82)", transformOrigin:"center" }}>
              <HibbaGiftIcon size={48} />
            </div>
            <span style={{ fontSize:32,fontWeight:800,color:"#fff",letterSpacing:"-0.03em",fontFamily:"'DM Sans',sans-serif" }}>
              hibba<span style={{ color:"#00FFC2" }}>.io</span>
            </span>
          </div>

          {/* Status badge */}
          <div style={{ display:"inline-flex",alignItems:"center",gap:8,padding:"8px 18px",borderRadius:999,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.07)",width:"fit-content" }}>
            <span style={{ width:8,height:8,borderRadius:"50%",background:"#00FFC2",boxShadow:"0 0 8px #00FFC2",flexShrink:0,display:"inline-block" }} />
            <span style={{ fontSize:11,fontWeight:600,letterSpacing:"0.18em",color:"#fff",textTransform:"uppercase" }}>
              Islamic Society Finance &amp; HR OS
            </span>
          </div>

          {/* Headline */}
          <h1 style={{ fontSize:"clamp(36px,4vw,56px)",fontWeight:800,color:"#fff",lineHeight:1.05,letterSpacing:"-0.03em",margin:0 }}>
            Administration,<br />
            <span style={{ color:"#00FFC2",textShadow:"0 0 40px rgba(0,255,194,0.28)" }}>simplified.</span>
          </h1>

          <p style={{ fontSize:16,color:"rgba(255,255,255,0.55)",fontWeight:300,lineHeight:1.6,margin:0,maxWidth:380 }}>
            Hibba: A gift of clarity for your society's growth.
          </p>

          {/* Feature pills */}
          <div style={{ display:"flex",flexWrap:"wrap",gap:10 }}>
            {FEATURES.map((f) => (
              <span key={f} style={{ display:"inline-flex",alignItems:"center",padding:"9px 18px",borderRadius:999,border:"1px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.65)",fontSize:13,fontWeight:400,whiteSpace:"nowrap" }}>{f}</span>
            ))}
          </div>
        </div>

        {/* ── CENTRE: login form ── */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 lg:px-12">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div style={{ transform:"scaleX(0.82)",transformOrigin:"center" }}>
              <HibbaGiftIcon size={40} />
            </div>
            <span style={{ fontSize:26,fontWeight:800,color:"#fff",letterSpacing:"-0.03em" }}>hibba<span style={{ color:"#00FFC2" }}>.io</span></span>
          </div>

          <div className="w-full max-w-sm">
            {/* Glass card */}
            <div style={{ background:"rgba(13,34,64,0.7)",backdropFilter:"blur(24px)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,overflow:"hidden",boxShadow:"0 40px 80px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.06)" }}>
              <div style={{ padding:"32px 32px 24px" }}>
                <h2 style={{ fontSize:22,fontWeight:800,color:"#fff",letterSpacing:"-0.02em",margin:0 }}>Enter Portal</h2>
                <p style={{ fontSize:13,color:"rgba(255,255,255,0.45)",marginTop:6,lineHeight:1.5 }}>
                  Managing the Amanah of finance and people with excellence.
                </p>
              </div>

              <div style={{ height:1,background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)",margin:"0 32px" }} />

              <form onSubmit={handleSubmit} noValidate style={{ padding:"24px 32px 32px",display:"flex",flexDirection:"column",gap:18 }}>
                <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                  <Label htmlFor="email" style={{ fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.7)",letterSpacing:"0.05em",textTransform:"uppercase" }}>
                    Email address
                  </Label>
                  <Input
                    id="email" type="text" inputMode="email" placeholder="you@example.com"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email" required
                    style={{ height:48,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,color:"#fff",fontSize:14 }}
                    className="placeholder:text-white/30 focus:border-[#635BFF] focus:ring-[#635BFF]/20"
                  />
                </div>

                <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                    <Label htmlFor="password" style={{ fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.7)",letterSpacing:"0.05em",textTransform:"uppercase" }}>
                      Password
                    </Label>
                    <button type="button" onClick={() => setLocation("/forgot-password")}
                      style={{ fontSize:12,fontWeight:600,color:"#635BFF",background:"none",border:"none",cursor:"pointer" }}>
                      Forgot password?
                    </button>
                  </div>
                  <div style={{ position:"relative" }}>
                    <Input
                      id="password" type={showPassword ? "text" : "password"}
                      placeholder="••••••••" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password" required
                      style={{ height:48,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,color:"#fff",fontSize:14,paddingRight:48 }}
                      className="placeholder:text-white/30 focus:border-[#635BFF] focus:ring-[#635BFF]/20"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                      style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer",display:"flex",alignItems:"center" }}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" disabled={loginMutation.isPending}
                  style={{ height:48,borderRadius:12,background:"linear-gradient(135deg,#00FFC2,#00DDB0)",color:"#081526",fontWeight:700,fontSize:15,letterSpacing:"0.03em",border:"none",boxShadow:"0 8px 28px rgba(0,255,194,0.2)",marginTop:4 }}
                  className="hover:shadow-[0_16px_48px_rgba(0,255,194,0.35)] transition-all hover:-translate-y-0.5">
                  {loginMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing in…</>
                  ) : "Enter Portal →"}
                </Button>

                <p style={{ textAlign:"center",fontSize:13,color:"rgba(255,255,255,0.4)",margin:0 }}>
                  Don't have an account?{" "}
                  <button type="button" onClick={() => setLocation("/register")}
                    style={{ fontWeight:600,color:"#635BFF",background:"none",border:"none",cursor:"pointer" }}>
                    Create one
                  </button>
                </p>
              </form>
            </div>

            {/* Trust badge */}
            <div style={{ marginTop:24,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:0.5 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5L13 3.5V8C13 11 10.5 13.5 8 14C5.5 13.5 3 11 3 8V3.5L8 1.5Z" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" fill="none" />
                <path d="M5.5 8L7 9.5L10.5 6" stroke="#00FFC2" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize:11,color:"rgba(255,255,255,0.4)",letterSpacing:"0.05em" }}>
                256-BIT ENCRYPTED · GDPR COMPLIANT · CHARITY COMMISSION READY
              </span>
            </div>
          </div>
        </div>

        {/* ── RIGHT: hibbapay.com panel (desktop only) ── */}
        <div className="hidden lg:flex flex-col gap-6 px-14 py-14 lg:w-[30%]" style={{ borderLeft:"1px solid rgba(255,255,255,0.08)" }}>
          {/* Logo */}
          <div className="flex items-center gap-3">
            <HibbaWalletIcon size={48} />
            <span style={{ fontSize:32,fontWeight:800,color:"#fff",letterSpacing:"-0.03em",fontFamily:"'DM Sans',sans-serif" }}>
              hibba<span style={{ color:"#00FFC2" }}>pay</span><span style={{ color:"rgba(255,255,255,0.9)" }}>.com</span>
            </span>
          </div>

          {/* Status badge */}
          <div style={{ display:"inline-flex",alignItems:"center",gap:8,padding:"8px 18px",borderRadius:999,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.07)",width:"fit-content" }}>
            <span style={{ width:8,height:8,borderRadius:"50%",background:"#00FFC2",boxShadow:"0 0 8px #00FFC2",flexShrink:0,display:"inline-block" }} />
            <span style={{ fontSize:11,fontWeight:600,letterSpacing:"0.18em",color:"#fff",textTransform:"uppercase" }}>
              Trusted Halal Payment Gateway
            </span>
          </div>

          <h1 style={{ fontSize:"clamp(36px,4vw,56px)",fontWeight:800,color:"#fff",lineHeight:1.05,letterSpacing:"-0.03em",margin:0 }}>
            Payments,<br />
            <span style={{ color:"#00FFC2",textShadow:"0 0 40px rgba(0,255,194,0.28)" }}>simplified.</span>
          </h1>

          <p style={{ fontSize:17,color:"rgba(255,255,255,0.72)",fontWeight:300,margin:0 }}>
            Sadaqah · Zakat · Payroll · <span style={{ color:"#00FFC2" }}>Donations</span>
          </p>

          <div style={{ display:"flex",flexWrap:"wrap",gap:10 }}>
            {PAY_FEATURES.map((f) => (
              <span key={f} style={{ display:"inline-flex",alignItems:"center",padding:"9px 18px",borderRadius:999,border:"1px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.65)",fontSize:13,fontWeight:400,whiteSpace:"nowrap" }}>{f}</span>
            ))}
          </div>

          <p style={{ fontSize:13,color:"rgba(255,255,255,0.35)",marginTop:8 }}>
            Powered by <span style={{ color:"rgba(255,255,255,0.55)" }}>Hibba.io</span>
          </p>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{ position:"relative",zIndex:10,borderTop:"1px solid rgba(255,255,255,0.08)",padding:"16px 60px",display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:"rgba(8,21,38,0.75)",backdropFilter:"blur(20px)" }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M8 1.5L13 3.5V8C13 11 10.5 13.5 8 14C5.5 13.5 3 11 3 8V3.5L8 1.5Z" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" fill="none" />
          <path d="M5.5 8L7 9.5L10.5 6" stroke="#00FFC2" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize:11,color:"rgba(255,255,255,0.35)",letterSpacing:"0.03em",textAlign:"center" }}>
          Official Platform of the Abdullah Quilliam Society · Securely managed via{" "}
          <span style={{ color:"rgba(255,255,255,0.55)" }}>Hibba.io</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" style={{ marginLeft:6,opacity:0.4 }}>
          <path d="M9 1L10.2 7.8L17 9L10.2 10.2L9 17L7.8 10.2L1 9L7.8 7.8Z" fill="rgba(255,255,255,0.4)" />
        </svg>
      </footer>
    </div>
  );
}
