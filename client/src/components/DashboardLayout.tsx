import { useAuth } from "@/_core/hooks/useAuth";
import { VoiceAgent } from "@/components/VoiceAgent";
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
import {
  BarChart3,
  BookOpen,
  Building2,
  Camera,
  ClipboardList,
  Scale,
  DollarSign,
  HandHeart,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  GitBranch,
  ChevronRight,
  PanelLeft,
  Menu,
  Database,
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
];
const expenseItems = [
  { icon: Wallet, label: "Payroll", path: "/payroll" },
  { icon: ClipboardList, label: "Monthly Expenses", path: "/monthly-expenses" },
];
const reconciliationItems = [
  { icon: Scale, label: "Reconciliation", path: "/reconciliation" },
];
const orgItems = [
  { icon: GitBranch, label: "Org Chart", path: "/org-chart" },
  { icon: Users, label: "Donors", path: "/donors" },
  { icon: Building2, label: "Campaigns", path: "/campaigns" },
  { icon: BarChart3, label: "Reports", path: "/reports" },
];
const adminItems = [
  { icon: ShieldCheck, label: "Admin Panel", path: "/admin" },
  { icon: Users, label: "Trustees", path: "/trustees" },
  { icon: Database, label: "Backups", path: "/backups" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

// 5 key items for mobile bottom bar
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

const LOGO_URL = "/api/storage-proxy/manus-storage/aqs-logo-centred_9cea3e02.png";

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
  if (!user) {
    window.location.href = "/login";
    return <DashboardLayoutSkeleton />;
  }
  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
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

  const showFinance =
    isAdmin(role) ||
    perms?.canManageFundraising ||
    perms?.canManageLoans ||
    perms?.canManageIncome;
  const showOrg =
    isAdmin(role) ||
    perms?.canManageDonors ||
    perms?.canSendCampaigns ||
    perms?.canExportReports;
  const showPayroll = isAdmin(role) || perms?.canManagePayroll || perms?.canViewOwnPayslip;
  const showAdmin = isAdmin(role);

  const visibleIncomeItems = incomeItems.filter(() => showFinance);
  const visibleExpenseItems = expenseItems.filter((item) => {
    if (item.path === "/payroll") return showPayroll;
    return showFinance || showPayroll;
  });
  const visibleReconciliationItems = reconciliationItems.filter(() => showAdmin);

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

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

  const NavItem = ({
    icon: Icon,
    label,
    path,
  }: {
    icon: React.ElementType;
    label: string;
    path: string;
  }) => {
    const isActive =
      location === path || (path !== "/" && location.startsWith(path));
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isActive}
          onClick={() => {
            setLocation(path);
            if (sidebarIsMobile) setOpenMobile(false);
          }}
          tooltip={label}
          className={`h-10 rounded-lg transition-all ${isActive ? "font-semibold" : ""}`}
          style={isActive ? { background: "rgba(99,91,255,0.18)", color: "#fff" } : {}}
        >
          <Icon
            className="h-4 w-4 shrink-0"
            style={isActive ? { color: "#00FFC2" } : {}}
          />
          <span className="text-sm tracking-tight">{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const sidebarBg =
    "linear-gradient(180deg, #0A192F 0%, #112240 60%, #0d1f3c 100%)";  /* Hibba Midnight Navy */
  const topBarBg =
    "linear-gradient(90deg, #0A192F 0%, #112240 100%)";  /* Hibba Navy top bar */
  const bottomBarBg =
    "linear-gradient(180deg, #0A192F 0%, #0d1f3c 100%)";  /* Hibba Navy bottom bar */

  return (
    <>
      {/* ── Sidebar (desktop + mobile sheet) ── */}
      <div ref={sidebarRef} className="relative">
        <Sidebar collapsible="icon" style={{ background: sidebarBg }}>
          <SidebarHeader className="p-3 border-b border-sidebar-border/30">
            <div className="flex items-center gap-3 px-1 py-1">
              {/* Hibba geometric gift icon */}
              <div className="shrink-0 h-9 w-9 rounded-xl flex items-center justify-center overflow-hidden shadow-sm" style={{background: "linear-gradient(135deg, #635BFF 0%, #4f46e5 100%)", padding: 2}}>
                <svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="8" y="18" width="32" height="22" rx="3" fill="#635BFF" />
                  <rect x="6" y="14" width="36" height="7" rx="2" fill="#4f46e5" />
                  <rect x="21" y="14" width="6" height="26" rx="1.5" fill="#00FFC2" />
                  <rect x="6" y="23" width="36" height="5" rx="1.5" fill="#00FFC2" />
                  <path d="M24 14 C18 8, 10 8, 12 14" stroke="#00FFC2" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                  <path d="M24 14 C30 8, 38 8, 36 14" stroke="#00FFC2" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                </svg>
              </div>
              {!isCollapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-sidebar-foreground leading-tight truncate tracking-tight" style={{letterSpacing: "-0.02em"}}>
                      hibba
                    </p>
                    <p className="text-[10px] text-sidebar-foreground/40 truncate">
                      Finance &amp; HR OS
                    </p>
                  </div>
                  <button
                    onClick={toggleSidebar}
                    className="h-7 w-7 rounded flex items-center justify-center text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors shrink-0"
                  >
                    <PanelLeft className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              {isCollapsed && (
                <button
                  onClick={toggleSidebar}
                  className="h-7 w-7 rounded flex items-center justify-center text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors shrink-0"
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="py-2 overflow-y-auto">
            <SidebarGroup>
              {!isCollapsed && (
                <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] px-4 py-1 uppercase tracking-widest font-semibold">
                  Main
                </SidebarGroupLabel>
              )}
              <SidebarMenu className="px-2">
                {coreItems.map((item) => (
                  <NavItem key={item.path} {...item} />
                ))}
              </SidebarMenu>
            </SidebarGroup>

            {(visibleIncomeItems.length > 0 || visibleExpenseItems.length > 0) && (
              <SidebarGroup>
                {!isCollapsed && (
                  <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] px-4 py-1 uppercase tracking-widest font-semibold">
                    Finance
                  </SidebarGroupLabel>
                )}
                <SidebarMenu className="px-2">
                  {visibleIncomeItems.map((item) => (
                    <NavItem key={item.path} {...item} />
                  ))}
                  {visibleExpenseItems.map((item) => (
                    <NavItem key={item.path} {...item} />
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            )}

            {visibleReconciliationItems.length > 0 && (
              <SidebarGroup>
                {!isCollapsed && (
                  <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] px-4 py-1 uppercase tracking-widest font-semibold">
                    Reconciliation
                  </SidebarGroupLabel>
                )}
                <SidebarMenu className="px-2">
                  {visibleReconciliationItems.map((item) => (
                    <NavItem key={item.path} {...item} />
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            )}

            {showOrg && (
              <SidebarGroup>
                {!isCollapsed && (
                  <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] px-4 py-1 uppercase tracking-widest font-semibold">
                    Organisation
                  </SidebarGroupLabel>
                )}
                <SidebarMenu className="px-2">
                  {orgItems.map((item) => (
                    <NavItem key={item.path} {...item} />
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            )}

            {showAdmin && (
              <SidebarGroup>
                {!isCollapsed && (
                  <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] px-4 py-1 uppercase tracking-widest font-semibold">
                    Administration
                  </SidebarGroupLabel>
                )}
                <SidebarMenu className="px-2">
                  {adminItems.map((item) => (
                    <NavItem key={item.path} {...item} />
                  ))}
                </SidebarMenu>
              </SidebarGroup>
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
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle — desktop only */}
        {!isCollapsed && (
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors hidden md:block"
            onMouseDown={() => setIsResizing(true)}
            style={{ zIndex: 50 }}
          />
        )}
      </div>

      {/* ── Main content area ── */}
      <SidebarInset className={isMobile ? "pb-[72px]" : ""}>
        {/* Mobile top bar */}
        {isMobile && (
          <div
            className="flex h-14 items-center justify-between px-3 sticky top-0 z-40 border-b border-white/10"
            style={{ background: topBarBg }}
          >
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-10 w-10 rounded-lg text-white/80 hover:bg-white/10 flex items-center justify-center" />
              <div className="h-7 w-7 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
                <img
                  src={LOGO_URL}
                  alt="AQS"
                  className="h-6 w-6 object-contain"
                />
              </div>
              <span className="font-semibold text-sm text-white leading-tight">
                AQS HR &amp; Finance
              </span>
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
                  <p className="text-xs text-muted-foreground capitalize">
                    {role ?? "user"}
                  </p>
                </div>
                <DropdownMenuItem onClick={() => setLocation("/profile")}>
                  Profile &amp; Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 p-3 sm:p-4 md:p-6 min-h-0">{children}</main>

        {/* Mobile bottom navigation bar */}
        {isMobile && (
          <nav
            className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10"
            style={{ background: bottomBarBg }}
          >
            <div className="flex items-stretch" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
              {mobileBottomNav.map(({ icon: Icon, label, path, isCentral }) => {
                const isActive =
                  path !== "/__more__" &&
                  (location === path ||
                    (path !== "/" && location.startsWith(path)));
                return (
                  <button
                    key={path}
                    onClick={() => {
                      if (path === "/__more__") setOpenMobile(true);
                      else setLocation(path);
                    }}
                    className="flex-1 flex flex-col items-center justify-end gap-0.5 pb-2 pt-1 relative transition-colors"
                    style={{ minHeight: 56 }}
                  >
                    {isCentral ? (
                      <>
                        <div
                          className="absolute -top-5 h-12 w-12 rounded-full flex items-center justify-center shadow-lg border-2 border-white/20"
                          style={{ background: "oklch(0.62 0.24 350)" }}
                        >
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-[10px] font-medium text-white/60 mt-8">
                          {label}
                        </span>
                      </>
                    ) : (
                      <>
                        {isActive && (
                          <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-pink-400" />
                        )}
                        <Icon
                          className={`h-5 w-5 ${isActive ? "text-pink-400" : "text-white/50"}`}
                        />
                        <span
                          className={`text-[10px] font-medium leading-none ${isActive ? "text-pink-400" : "text-white/50"}`}
                        >
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
      {/* AI Voice Agent — available on every page */}
      <VoiceAgent />
    </>
  );
}
