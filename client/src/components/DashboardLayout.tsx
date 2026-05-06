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
  PanelLeft,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  GitBranch,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { trpc } from "@/lib/trpc";

// ─── Role helpers ──────────────────────────────────────────────────────────────
type Role = "superadmin" | "trustee" | "manager" | "assistant" | "volunteer" | "admin" | "user";

function isAdmin(role?: string | null): boolean {
  return role === "superadmin" || role === "trustee" || role === "manager" || role === "admin";
}
function isSuperOrTrustee(role?: string | null): boolean {
  return role === "superadmin" || role === "trustee";
}

// ─── Nav structure ─────────────────────────────────────────────────────────────
const coreItems = [
  { icon: Camera, label: "Scan Receipt", path: "/" },
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Receipt, label: "My Expenses", path: "/receipts" },
];

// INCOME sub-section
const incomeItems = [
  { icon: HandHeart, label: "Fundraising", path: "/fundraising" },
  { icon: BookOpen, label: "Qarde Hasan Loans", path: "/loans" },
  { icon: DollarSign, label: "Income & Rentals", path: "/income" },
];

// EXPENSES sub-section
const expenseItems = [
  { icon: Wallet, label: "Payroll", path: "/payroll" },
  { icon: ClipboardList, label: "Monthly Expenses", path: "/monthly-expenses" },
];

// RECONCILIATION sub-section
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
  { icon: Settings, label: "Settings", path: "/settings" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 380;

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
  const { data: perms } = trpc.users.getPermissions.useQuery({ userId: user?.id ?? 0 }, { enabled: !!user?.id });
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar, setOpenMobile, isMobile: sidebarIsMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const role = user?.role as Role | undefined;
  const showFinance = isAdmin(role) || perms?.canManageFundraising || perms?.canManageLoans || perms?.canManageIncome;
  const showOrg = isAdmin(role) || perms?.canManageDonors || perms?.canSendCampaigns || perms?.canExportReports;
  const showPayroll = isAdmin(role) || perms?.canManagePayroll || perms?.canViewOwnPayslip;
  const showAdmin = isAdmin(role);

  // Visible items per sub-section
  const visibleIncomeItems = incomeItems.filter(() => showFinance);
  const visibleExpenseItems = expenseItems.filter(item => {
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

  const NavItem = ({ icon: Icon, label, path }: { icon: React.ElementType; label: string; path: string }) => {
    const isActive = location === path || (path !== "/" && location.startsWith(path));
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isActive}
          onClick={() => {
            setLocation(path);
            // Auto-close sidebar on mobile after navigation
            if (sidebarIsMobile) setOpenMobile(false);
          }}
          tooltip={label}
          className="h-9 transition-all"
        >
          <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-sidebar-primary" : ""}`} />
          <span>{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}>
          {/* Header */}
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border/50">
            <div className="flex items-center gap-3 px-2 w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-sidebar-foreground/60" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src="https://d2xsxph8kpxj0f.cloudfront.net/310519663490667955/ExcMToduGVqDRtQnvUsVkJ/aqs-logo-white-gen-PTGRYCqd3BnJe8SJDQLiog.png"
                    alt="AQS Logo"
                    className="h-9 w-9 object-contain shrink-0"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold tracking-tight text-sidebar-foreground text-sm truncate">
                      Abdullah Quilliam
                    </span>
                    <span className="text-xs text-sidebar-primary truncate font-medium">
                      HR &amp; Finance
                    </span>
                  </div>
                </div>
              )}
            </div>
          </SidebarHeader>

          {/* Nav */}
          <SidebarContent className="gap-0 py-2">
            {/* Core */}
            <SidebarGroup>
              <SidebarMenu className="px-2">
                {coreItems.map(item => <NavItem key={item.path} {...item} />)}
              </SidebarMenu>
            </SidebarGroup>

            {/* INCOME sub-section */}
            {visibleIncomeItems.length > 0 && (
              <SidebarGroup>
                {!isCollapsed && (
                  <SidebarGroupLabel className="text-sidebar-foreground/40 text-xs px-4 py-1 uppercase tracking-wider">
                    Income
                  </SidebarGroupLabel>
                )}
                <SidebarMenu className="px-2">
                  {visibleIncomeItems.map(item => <NavItem key={item.path} {...item} />)}
                </SidebarMenu>
              </SidebarGroup>
            )}

            {/* EXPENSES sub-section */}
            {visibleExpenseItems.length > 0 && (
              <SidebarGroup>
                {!isCollapsed && (
                  <SidebarGroupLabel className="text-sidebar-foreground/40 text-xs px-4 py-1 uppercase tracking-wider">
                    Expenses
                  </SidebarGroupLabel>
                )}
                <SidebarMenu className="px-2">
                  {visibleExpenseItems.map(item => <NavItem key={item.path} {...item} />)}
                </SidebarMenu>
              </SidebarGroup>
            )}

            {/* RECONCILIATION sub-section */}
            {visibleReconciliationItems.length > 0 && (
              <SidebarGroup>
                {!isCollapsed && (
                  <SidebarGroupLabel className="text-sidebar-foreground/40 text-xs px-4 py-1 uppercase tracking-wider">
                    Reconciliation
                  </SidebarGroupLabel>
                )}
                <SidebarMenu className="px-2">
                  {visibleReconciliationItems.map(item => <NavItem key={item.path} {...item} />)}
                </SidebarMenu>
              </SidebarGroup>
            )}

            {/* Organisation */}
            {showOrg && (
              <SidebarGroup>
                {!isCollapsed && (
                  <SidebarGroupLabel className="text-sidebar-foreground/40 text-xs px-4 py-1 uppercase tracking-wider">
                    Organisation
                  </SidebarGroupLabel>
                )}
                <SidebarMenu className="px-2">
                  {orgItems.map(item => <NavItem key={item.path} {...item} />)}
                </SidebarMenu>
              </SidebarGroup>
            )}

            {/* Admin */}
            {showAdmin && (
              <SidebarGroup>
                {!isCollapsed && (
                  <SidebarGroupLabel className="text-sidebar-foreground/40 text-xs px-4 py-1 uppercase tracking-wider">
                    Administration
                  </SidebarGroupLabel>
                )}
                <SidebarMenu className="px-2">
                  {adminItems.map(item => <NavItem key={item.path} {...item} />)}
                </SidebarMenu>
              </SidebarGroup>
            )}
          </SidebarContent>

          {/* Footer */}
          <SidebarFooter className="p-3 border-t border-sidebar-border/50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-sidebar-accent transition-colors w-full text-left focus:outline-none">
                  <Avatar className="h-8 w-8 border border-sidebar-border shrink-0">
                    <AvatarFallback className="text-xs font-semibold bg-sidebar-primary text-sidebar-primary-foreground">
                      {user?.name?.charAt(0).toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate text-sidebar-foreground leading-none">
                        {user?.name ?? "—"}
                      </p>
                      <p className="text-xs text-sidebar-foreground/50 truncate mt-1 capitalize">
                        {role ?? "user"}
                      </p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setLocation("/profile")}>
                  Profile & Settings
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

        {/* Resize handle */}
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex h-14 items-center justify-between px-4 backdrop-blur sticky top-0 z-40 border-b" style={{background: 'linear-gradient(90deg, oklch(0.22 0.09 12) 0%, oklch(0.28 0.09 12) 100%)'}}>
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-9 w-9 rounded-lg text-white/80 hover:bg-white/10" />
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663490667955/ExcMToduGVqDRtQnvUsVkJ/aqs-logo-white-gen-PTGRYCqd3BnJe8SJDQLiog.png"
                alt="AQS"
                className="h-8 w-8 object-contain"
              />
              <span className="font-semibold text-sm text-white">Abdullah Quilliam Society</span>
            </div>
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </>
  );
}
