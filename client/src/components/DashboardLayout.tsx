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
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import VoiceAgent from "@/components/VoiceAgent";
import { useVoiceContext } from "@/contexts/VoiceContext";
import {
  BarChart3, BookOpen, Building2, Camera, ClipboardList, Scale,
  DollarSign, HandHeart, LayoutDashboard, LogOut, Receipt,
  Settings, ShieldCheck, Users, Wallet, GitBranch, ClipboardCheck, Gavel,
  ChevronRight, PanelLeft, Menu, Database, MessageSquare, Home, CreditCard, UserCheck, Inbox, History,
  Gift, CalendarDays, Send, UserPlus, MailOpen, Shield, Activity, Mic,
  TrendingUp, Flag, Handshake, QrCode, Trophy, AlertTriangle, Bookmark, Zap, GraduationCap, MailSearch, UtensilsCrossed, Globe,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { trpc } from "@/lib/trpc";

type Role = "superadmin" | "trustee" | "manager" | "assistant" | "volunteer" | "admin" | "user";
function isAdmin(role?: string | null): boolean {
  return role === "superadmin" || role === "trustee" || role === "manager" || role === "admin";
}

const coreItems = [
  { icon: Camera, label: "Scan Receipt", path: "/" },
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Receipt, label: "My Expenses", path: "/receipts" },
];
const incomeItems = [
  { icon: HandHeart, label: "Fundraising", path: "/fundraising" },
  { icon: BookOpen, label: "Qarde Hasan Loans", path: "/loans" },
  { icon: DollarSign, label: "Income & Rentals", path: "/income" },
  { icon: Home, label: "Student Accommodation", path: "/accommodation" },
  { icon: CreditCard, label: "Payment Hub", path: "/fintech" },
  { icon: UserCheck, label: "Donor CRM", path: "/donor-crm" },
  { icon: Gift, label: "Gift Aid & CRM+", path: "/gift-aid" },
  { icon: TrendingUp, label: "Pledges", path: "/pledges" },
  { icon: Handshake, label: "Cultivation Pipeline", path: "/donor-pipeline" },
  { icon: Flag, label: "Major Donor DD", path: "/major-donor" },
  { icon: Bookmark, label: "Saved Views", path: "/saved-views" },
  { icon: QrCode, label: "QR Codes", path: "/qr-codes" },
  { icon: Trophy, label: "Recognition Tiers", path: "/recognition-tiers" },
  { icon: Globe, label: "Donors Wall", path: "/donors-wall" },
];
const expenseItems = [
  { icon: Wallet, label: "Payroll", path: "/payroll" },
  { icon: ClipboardList, label: "Monthly Expenses", path: "/monthly-expenses" },
];
const reconciliationItems = [{ icon: Scale, label: "Reconciliation", path: "/reconciliation" }];
const orgItems = [
  { icon: GitBranch, label: "Org Chart", path: "/org-chart" },
  { icon: MessageSquare, label: "Communications", path: "/communications" },
  { icon: Inbox, label: "Comms Hub", path: "/comms-hub" },
  { icon: MailOpen, label: "Master Inbox", path: "/comms-inbox" },
  { icon: CalendarDays, label: "Meetings & Onboarding", path: "/meetings" },
  { icon: Users, label: "Donors", path: "/donors" },
  { icon: Building2, label: "Campaigns", path: "/campaigns" },
  { icon: BarChart3, label: "Reports", path: "/reports" },
];
const adminItems = [
  { icon: ShieldCheck, label: "Admin Panel", path: "/admin" },
  { icon: Users, label: "Trustees & Staff Contacts", path: "/trustees" },
  { icon: ClipboardCheck, label: "Compliance Cockpit", path: "/compliance" },
  { icon: AlertTriangle, label: "Conflicts Register", path: "/conflicts-register" },
  { icon: Gavel, label: "Decisions Register", path: "/decisions" },
  { icon: AlertTriangle, label: "Bulk Approvals", path: "/bulk-approvals" },
  { icon: Zap, label: "Bills & Utilities", path: "/bills-utilities" },
  { icon: GraduationCap, label: "Training Tracker", path: "/training-tracker" },
  { icon: MailSearch, label: "LBMW Correspondence", path: "/lbmw-correspondence" },
  { icon: ShieldCheck, label: "Trustee Dashboard", path: "/trustee-dashboard" },
  { icon: Building2, label: "Facilities & Bookings", path: "/facilities" },
  { icon: UtensilsCrossed, label: "Bistro 87", path: "/bistro87" },
  { icon: History, label: "Merge History", path: "/merge-history" },
  { icon: Database, label: "Backups", path: "/backups" },
  { icon: Shield, label: "Audit Trail", path: "/audit-trail" },
  { icon: Mic, label: "Voice History", path: "/voice-history" },
  { icon: Activity, label: "System Health", path: "/system-health" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

const mobileBottomNav = [
  { icon: LayoutDashboard, label: "Home", path: "/dashboard" },
  { icon: DollarSign, label: "Income", path: "/income" },
  { icon: Camera, label: "Scan", path: "/", isCentral: true },
  { icon: ClipboardList, label: "Expenses", path: "/monthly-expenses" },
  { icon: Menu, label: "More", path: "/__more__" },
];

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
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) { window.location.href = "/login"; return <DashboardLayoutSkeleton />; }
  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent>
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
  const { data: perms } = trpc.users.getPermissions.useQuery(
    { userId: user?.id ?? 0 },
    { enabled: !!user?.id }
  );
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar, setOpenMobile, isMobile: sidebarIsMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const role = user?.role as Role | undefined;
  const { entityContext } = useVoiceContext();

  const showFinance = isAdmin(role) || perms?.canManageFundraising || perms?.canManageLoans || perms?.canManageIncome;
  const showOrg = isAdmin(role) || perms?.canManageDonors || perms?.canSendCampaigns || perms?.canExportReports;
  const showPayroll = isAdmin(role) || perms?.canManagePayroll || perms?.canViewOwnPayslip;
  const showAdmin = isAdmin(role);

  const visibleIncomeItems = incomeItems.filter(() => showFinance);
  const visibleExpenseItems = expenseItems.filter((item) => {
    if (item.path === "/payroll") return showPayroll;
    return showFinance || showPayroll;
  });
  const visibleReconciliationItems = reconciliationItems.filter(() => showAdmin);

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
    enabled: !!user && showAdmin,
  });
  const billsExpiryBadge = (billsSummary?.expiringSoon ?? 0) + (billsSummary?.expired ?? 0);

  const NavItem = ({ icon: Icon, label, path, badge }: { icon: React.ElementType; label: string; path: string; badge?: number }) => {
    const isActive = location === path || (path !== "/" && location.startsWith(path));
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
              {/* Refined corporate gift icon — squeezed */}
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
            {/* MAIN */}
            <div className="px-3 pt-4 pb-1">
              {!isCollapsed && (
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-1 mb-2">Main</p>
              )}
              <ul className="flex flex-col gap-0.5">
                {coreItems.map((item) => (
                  <NavItem key={item.path} {...item} />
                ))}
              </ul>
            </div>

            {/* FINANCE */}
            {(visibleIncomeItems.length > 0 || visibleExpenseItems.length > 0) && (
              <div className="px-3 pt-4 pb-1 border-t border-white/5">
                {!isCollapsed && (
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-1 mb-2">Finance</p>
                )}
                <ul className="flex flex-col gap-0.5">
                  {visibleIncomeItems.map((item) => (
                    <NavItem key={item.path} {...item} />
                  ))}
                  {visibleExpenseItems.map((item) => (
                    <NavItem key={item.path} {...item} />
                  ))}
                </ul>
              </div>
            )}

            {/* RECONCILIATION */}
            {visibleReconciliationItems.length > 0 && (
              <div className="px-3 pt-4 pb-1 border-t border-white/5">
                {!isCollapsed && (
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-1 mb-2">Reconciliation</p>
                )}
                <ul className="flex flex-col gap-0.5">
                  {visibleReconciliationItems.map((item) => (
                    <NavItem key={item.path} {...item} />
                  ))}
                </ul>
              </div>
            )}

            {/* ORGANISATION */}
            {showOrg && (
              <div className="px-3 pt-4 pb-1 border-t border-white/5">
                {!isCollapsed && (
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-1 mb-2">Organisation</p>
                )}
                <ul className="flex flex-col gap-0.5">
                  {orgItems.map((item) => (
                    <NavItem
                      key={item.path}
                      {...item}
                      badge={item.path === "/comms-inbox" ? (inboxUnread?.total ?? 0) : undefined}
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* ADMINISTRATION */}
            {showAdmin && (
              <div className="px-3 pt-4 pb-3 border-t border-white/5">
                {!isCollapsed && (
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-1 mb-2">Administration</p>
                )}
                <ul className="flex flex-col gap-0.5">
                  {adminItems.map((item) => (
                    <NavItem
                      key={item.path}
                      {...item}
                      badge={item.path === "/bills-utilities" && billsExpiryBadge > 0 ? billsExpiryBadge : undefined}
                    />
                  ))}
                </ul>
              </div>
            )}
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
      <SidebarInset className={`${isMobile ? "pb-[72px]" : ""} overflow-y-auto`} style={{ WebkitOverflowScrolling: "touch", paddingBottom: isMobile ? "calc(72px + env(safe-area-inset-bottom, 0px))" : undefined } as React.CSSProperties}>
        {/* Mobile top bar */}
        {isMobile && (
          <div
            className="flex h-14 items-center justify-between px-3 sticky top-0 z-40 border-b border-white/10"
            style={{ background: topBarBg }}
          >
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-10 w-10 rounded-lg text-white/80 hover:bg-white/10 flex items-center justify-center" />
              {/* Hibba wordmark in mobile bar */}
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
      <VoiceAgent screenContext={location.split("?")[0]} entityContext={entityContext ?? undefined} />
    </>
  );
}
