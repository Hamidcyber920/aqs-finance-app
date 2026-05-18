import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  BarChart3, BookOpen, Building2, Camera, ClipboardList, Scale,
  DollarSign, HandHeart, LayoutDashboard, LogOut, Receipt,
  Settings, ShieldCheck, Users, Wallet, GitBranch, ClipboardCheck, Gavel,
  ChevronRight, PanelLeft, Menu, Database, MessageSquare, Home, CreditCard, UserCheck, Inbox, History,
  Gift, CalendarDays, Send, UserPlus, MailOpen, Shield, Activity, Mic,
  TrendingUp, Flag, Handshake, QrCode, Trophy, AlertTriangle, Bookmark, Zap, GraduationCap, MailSearch, UtensilsCrossed, Globe, Timer,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { HibbaVoice } from "./HibbaVoice";
import { trpc } from "@/lib/trpc";
import { getRoleCategory, type RoleCategory } from "@/lib/routePermissions";

// ─── Role types ─────────────────────────────────────────────────────────────
type Role = "superadmin" | "trustee" | "manager" | "assistant" | "volunteer" | "admin" | "user";

// ─── Navigation definition ──────────────────────────────────────────────────
type NavSection = {
  label: string;
  items: NavItemDef[];
};

type NavItemDef = {
  icon: React.ElementType;
  label: string;
  path: string;
  visibleTo: ("superadmin" | "trustee" | "staff")[];
  badgeKey?: string;
};

const NAVIGATION: NavSection[] = [
  {
    label: "DAILY",
    items: [
      { icon: Camera, label: "Scan Receipt", path: "/", visibleTo: ["superadmin", "staff"] },
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard", visibleTo: ["superadmin", "trustee", "staff"] },
      { icon: Receipt, label: "My Expenses", path: "/receipts", visibleTo: ["superadmin", "staff"] },
    ],
  },
  {
    label: "FINANCE",
    items: [
      { icon: DollarSign, label: "Income & Rentals", path: "/income", visibleTo: ["superadmin", "trustee", "staff"] },
      { icon: ClipboardList, label: "Monthly Expenses", path: "/monthly-expenses", visibleTo: ["superadmin", "staff"] },
      { icon: Zap, label: "Bills & Utilities", path: "/bills-utilities", visibleTo: ["superadmin"], badgeKey: "bills" },
      { icon: CreditCard, label: "Payment Hub", path: "/fintech", visibleTo: ["superadmin", "trustee"] },
      { icon: Scale, label: "Reconciliation", path: "/reconciliation", visibleTo: ["superadmin"] },
      { icon: BookOpen, label: "Qarde Hasan Loans", path: "/loans", visibleTo: ["superadmin", "trustee"] },
      { icon: Wallet, label: "Payroll", path: "/payroll", visibleTo: ["superadmin"] },
    ],
  },
  {
    label: "DONORS & FUNDRAISING",
    items: [
      { icon: Users, label: "Donors", path: "/donor-crm", visibleTo: ["superadmin", "trustee", "staff"] },
      { icon: Building2, label: "Campaigns", path: "/campaigns", visibleTo: ["superadmin", "trustee", "staff"] },
      { icon: Gift, label: "Gift Aid & CRM+", path: "/gift-aid", visibleTo: ["superadmin"] },
      { icon: HandHeart, label: "Fundraising", path: "/fundraising", visibleTo: ["superadmin"] },
    ],
  },
  {
    label: "COMMUNICATIONS",
    items: [
      { icon: MessageSquare, label: "Communications", path: "/communications", visibleTo: ["superadmin", "staff"], badgeKey: "inbox" },
      { icon: CalendarDays, label: "Meetings & Onboarding", path: "/meetings", visibleTo: ["superadmin", "staff"] },
    ],
  },
  {
    label: "REPORTS",
    items: [
      { icon: BarChart3, label: "Reports", path: "/reports", visibleTo: ["superadmin", "trustee"] },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      { icon: UtensilsCrossed, label: "Bistro 87", path: "/bistro87", visibleTo: ["superadmin"] },
      { icon: Home, label: "Student Accommodation", path: "/accommodation", visibleTo: ["superadmin"] },
      { icon: Building2, label: "Facilities & Bookings", path: "/facilities", visibleTo: ["superadmin"] },
      { icon: GraduationCap, label: "Training Tracker", path: "/training-tracker", visibleTo: ["superadmin"] },
    ],
  },
  {
    label: "GOVERNANCE",
    items: [
      { icon: ShieldCheck, label: "Trustee Dashboard", path: "/trustee-dashboard", visibleTo: ["superadmin", "trustee"] },
      { icon: ClipboardCheck, label: "Compliance Cockpit", path: "/compliance", visibleTo: ["superadmin", "trustee"] },
      { icon: Users, label: "People", path: "/trustees", visibleTo: ["superadmin", "trustee"] },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { icon: ShieldCheck, label: "Admin Panel", path: "/admin", visibleTo: ["superadmin"] },
      { icon: Settings, label: "Settings", path: "/settings", visibleTo: ["superadmin"] },
    ],
  },
];

// ─── Mobile bottom nav ──────────────────────────────────────────────────────
const mobileBottomNav = [
  { icon: LayoutDashboard, label: "Home", path: "/dashboard" },
  { icon: DollarSign, label: "Income", path: "/income" },
  { icon: Camera, label: "Scan", path: "/", isCentral: true },
  { icon: ClipboardList, label: "Expenses", path: "/monthly-expenses" },
  { icon: Menu, label: "More", path: "/__more__" },
];

// ─── Sidebar sizing ─────────────────────────────────────────────────────────
const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 380;

/* ─── Refined corporate gift box — sidebar size ─────────────────────── */
function SidebarGiftIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 80 80" fill="none">
      <defs>
        <linearGradient id="sbBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7B75FF" />
          <stop offset="100%" stopColor="#4438CC" />
        </linearGradient>
        <linearGradient id="sbLid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9490FF" />
          <stop offset="100%" stopColor="#635BFF" />
        </linearGradient>
        <linearGradient id="sbRib" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00FFC2" />
          <stop offset="100%" stopColor="#00C99B" />
        </linearGradient>
      </defs>
      <rect x="9" y="37" width="57" height="32" rx="7" fill="url(#sbBody)" />
      <rect x="9" y="37" width="57" height="8" rx="7" fill="rgba(255,255,255,0.09)" />
      <rect x="6" y="26" width="63" height="14" rx="6" fill="url(#sbLid)" />
      <rect x="6" y="26" width="63" height="3" rx="6" fill="rgba(255,255,255,0.22)" />
      <rect x="6" y="36" width="63" height="6.5" rx="2" fill="url(#sbRib)" />
      <rect x="35" y="26" width="6.5" height="43" rx="2" fill="url(#sbRib)" />
      <path d="M38 25 C35 18 23 6 17 12 C14 16 18 23 31 25.5 Z" fill="#00FFC2" opacity="0.92" />
      <path d="M38 25 C41 18 53 6 59 12 C62 16 58 23 45 25.5 Z" fill="#00DDA8" opacity="0.92" />
      <ellipse cx="38" cy="25.5" rx="4.5" ry="3.5" fill="#00FFC2" />
      <ellipse cx="36.8" cy="24.2" rx="1.6" ry="1.1" fill="rgba(255,255,255,0.45)" />
    </svg>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
      return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  });
  const { loading, user } = useAuth();
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
    } catch {
      // Storage unavailable — ignore
    }
  }, [sidebarWidth]);
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) { window.location.href = "/login"; return <DashboardLayoutSkeleton />; }
  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent>
      <HibbaVoice />
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (w: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar, setOpenMobile, isMobile: sidebarIsMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const role = user?.role as Role | undefined;
  const roleCategory = getRoleCategory(role);

  useEffect(() => { if (isCollapsed) setIsResizing(false); }, [isCollapsed]);
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  // Fetch inbox unread count for sidebar badge
  const { data: inboxUnread } = trpc.commsInbox.getSectionUnreadCounts.useQuery(undefined, {
    refetchInterval: 30000,
    enabled: !!user,
  });
  // Fetch bills expiry count for sidebar badge
  const { data: billsSummary } = trpc.bills.summary.useQuery(undefined, {
    refetchInterval: 60000,
    enabled: !!user && roleCategory === "superadmin",
  });
  const billsExpiryBadge = (billsSummary?.expiringSoon ?? 0) + (billsSummary?.expired ?? 0);

  // Badge resolver
  function getBadge(badgeKey?: string): number | undefined {
    if (!badgeKey) return undefined;
    if (badgeKey === "inbox") return inboxUnread?.total ?? 0;
    if (badgeKey === "bills") return billsExpiryBadge > 0 ? billsExpiryBadge : undefined;
    return undefined;
  }

  // Filter navigation by role
  const visibleSections = NAVIGATION
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.visibleTo.includes(roleCategory)),
    }))
    .filter((section) => section.items.length > 0);

  const NavItem = ({ icon: Icon, label, path, badge }: { icon: React.ElementType; label: string; path: string; badge?: number }) => {
    const isActive = location === path || (path !== "/" && path !== "/dashboard" && location.startsWith(path));
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isActive}
          onClick={() => { setLocation(path); if (sidebarIsMobile) setOpenMobile(false); }}
          tooltip={label}
          className={`h-10 rounded-lg transition-all ${isActive ? "font-semibold" : ""}`}
          style={isActive ? { background: "rgba(0,184,148,0.15)", color: "#fff" } : {}}
        >
          <Icon className="h-4 w-4 shrink-0" style={isActive ? { color: "#00B894" } : {}} />
          <span className="text-sm tracking-tight flex-1">{label}</span>
          {badge && badge > 0 ? (
            <span className="ml-auto text-[10px] bg-indigo-500 text-white rounded-full px-1.5 py-0.5 font-bold min-w-[18px] text-center">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const sidebarBg = "linear-gradient(180deg, #0F1B2D 0%, #1A2740 60%, #0f1f38 100%)";
  const topBarBg = "linear-gradient(90deg, #0F1B2D 0%, #1A2740 100%)";
  const bottomBarBg = "linear-gradient(180deg, #0F1B2D 0%, #0f1f38 100%)";

  return (
    <>
      <div ref={sidebarRef} className="relative">
        <Sidebar collapsible="icon" style={{ background: sidebarBg }}>
          <SidebarHeader className="p-3 border-b border-sidebar-border/30">
            <div className="flex items-center gap-3 px-1 py-1">
              <div className="shrink-0 h-9 w-9 rounded-xl flex items-center justify-center overflow-visible"
                style={{ transform: "scaleX(0.82)", transformOrigin: "center" }}>
                <SidebarGiftIcon />
              </div>
              {!isCollapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-sidebar-foreground leading-tight truncate"
                      style={{ letterSpacing: "-0.03em", fontFamily: "'DM Sans', sans-serif" }}>
                      hibba
                    </p>
                    <p className="text-[10px] text-sidebar-foreground/40 truncate">
                      Finance &amp; HR OS
                    </p>
                  </div>
                  <button onClick={toggleSidebar}
                    className="h-7 w-7 rounded flex items-center justify-center text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors shrink-0">
                    <PanelLeft className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              {isCollapsed && (
                <button onClick={toggleSidebar}
                  className="h-7 w-7 rounded flex items-center justify-center text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors shrink-0">
                  <PanelLeft className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="overflow-y-auto">
            {visibleSections.map((section, idx) => (
              <div key={section.label} className={`px-3 pt-4 pb-1 ${idx > 0 ? "border-t border-white/5" : ""}`}>
                {!isCollapsed && (
                  <p className="font-semibold uppercase tracking-widest px-1 mb-2"
                    style={{ fontSize: "11px", color: "#6B7280", paddingTop: idx > 0 ? "0px" : "0px" }}>
                    {section.label}
                  </p>
                )}
                <ul className="flex flex-col gap-0.5">
                  {section.items.map((item) => (
                    <NavItem key={item.path} icon={item.icon} label={item.label} path={item.path} badge={getBadge(item.badgeKey)} />
                  ))}
                </ul>
              </div>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-sidebar-border/30">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors w-full text-left focus:outline-none min-h-[44px]">
                  <Avatar className="h-8 w-8 border border-sidebar-border shrink-0">
                    <AvatarFallback className="text-xs font-bold bg-sidebar-primary text-sidebar-primary-foreground">
                      {user?.name?.charAt(0).toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate text-sidebar-foreground leading-none">
                          {user?.name ?? "—"}
                        </p>
                        <p className="text-[10px] text-sidebar-foreground/50 truncate mt-0.5 capitalize">
                          {role ?? "user"}
                        </p>
                      </div>
                      <ChevronRight className="h-3 w-3 text-sidebar-foreground/40 shrink-0" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setLocation("/profile")}>
                  Profile &amp; Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {!isCollapsed && (
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors hidden md:block"
            onMouseDown={() => setIsResizing(true)}
            style={{ zIndex: 50 }}
          />
        )}
      </div>

      {/* ── Main content ── */}
      <SidebarInset className={`${isMobile ? "pb-[72px]" : ""} overflow-y-auto overflow-x-hidden`} style={{ WebkitOverflowScrolling: "touch", paddingBottom: isMobile ? "calc(72px + env(safe-area-inset-bottom, 0px))" : undefined } as React.CSSProperties}>
        {/* Mobile top bar */}
        {isMobile && (
          <div
            className="flex h-14 items-center justify-between px-3 sticky top-0 z-40 border-b border-white/10"
            style={{ background: topBarBg }}
          >
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-10 w-10 rounded-lg text-white/80 hover:bg-white/10 flex items-center justify-center" />
              <div className="flex items-center gap-2">
                <div style={{ transform: "scaleX(0.82)", transformOrigin: "center" }}>
                  <SidebarGiftIcon />
                </div>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", fontFamily: "'DM Sans', sans-serif" }}>
                  hibba<span style={{ color: "#00FFC2" }}>.io</span>
                </span>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
                  <Avatar className="h-8 w-8 border-2 border-white/30">
                    <AvatarFallback className="text-xs font-bold bg-sidebar-primary text-white">
                      {user?.name?.charAt(0).toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-3 py-2 border-b">
                  <p className="text-sm font-semibold truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{role ?? "user"}</p>
                </div>
                <DropdownMenuItem onClick={() => setLocation("/profile")}>Profile &amp; Settings</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <main className="flex-1 p-3 sm:p-4 md:p-6 page-enter" key={location}>{children}</main>

        {/* Mobile bottom nav — Hibba mint/purple theme */}
        {isMobile && (
          <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10" style={{ background: bottomBarBg, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            <div className="flex items-stretch">
              {mobileBottomNav.map(({ icon: Icon, label, path, isCentral }) => {
                const isActive = path !== "/__more__" && (location === path || (path !== "/" && location.startsWith(path)));
                return (
                  <button
                    key={path}
                    onClick={() => { if (path === "/__more__") setOpenMobile(true); else setLocation(path); }}
                    className="flex-1 flex flex-col items-center justify-end gap-0.5 pb-2 pt-1 relative transition-colors"
                    style={{ minHeight: 56 }}
                  >
                    {isCentral ? (
                      <>
                        <div className="absolute -top-5 h-12 w-12 rounded-full flex items-center justify-center shadow-lg border-2 border-white/20"
                          style={{ background: "linear-gradient(135deg, #635BFF, #4f46e5)" }}>
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-[10px] font-medium text-white/60 mt-8">{label}</span>
                      </>
                    ) : (
                      <>
                        {isActive && (
                          <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full" style={{ background: "#00FFC2" }} />
                        )}
                        <Icon className="h-5 w-5" style={{ color: isActive ? "#00FFC2" : "rgba(255,255,255,0.45)" }} />
                        <span className="text-[10px] font-medium leading-none" style={{ color: isActive ? "#00FFC2" : "rgba(255,255,255,0.45)" }}>
                          {label}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </SidebarInset>
    </>
  );
}
