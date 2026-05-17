import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import { RouteGuard } from "./components/RouteGuard";

// ─── Lazy-loaded page components (code-split) ───────────────────────────────
const CapturePage = lazy(() => import("./pages/Capture"));
const DashboardPage = lazy(() => import("./pages/Dashboard"));
const ReceiptsPage = lazy(() => import("./pages/Receipts"));
const ReceiptDetailPage = lazy(() => import("./pages/ReceiptDetail"));
const ReportsPage = lazy(() => import("./pages/Reports"));
const LoginPage = lazy(() => import("./pages/Login"));
const RegisterPage = lazy(() => import("./pages/Register"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPassword"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPassword"));
const AdminPanelPage = lazy(() => import("./pages/AdminPanel"));
const FundraisingPage = lazy(() => import("./pages/Fundraising"));
const LoansPage = lazy(() => import("./pages/Loans"));
const LoanDetailPage = lazy(() => import("./pages/LoanDetail"));
const IncomePage = lazy(() => import("./pages/Income"));
const PayrollPage = lazy(() => import("./pages/Payroll"));
const DonorsPage = lazy(() => import("./pages/Donors"));
const OrgChartPage = lazy(() => import("./pages/OrgChart"));
const CommunicationsPage = lazy(() => import("./pages/Communications"));
const CampaignsPage = lazy(() => import("./pages/Campaigns"));
const ProfileSettingsPage = lazy(() => import("./pages/ProfileSettings"));
const PendingApprovalPage = lazy(() => import("./pages/PendingApproval"));
const MonthlyExpensesPage = lazy(() => import("./pages/MonthlyExpenses"));
const ReconciliationPage = lazy(() => import("./pages/Reconciliation"));
const TrusteesPage = lazy(() => import("./pages/Trustees"));
const BackupsPage = lazy(() => import("./pages/Backups"));
const StudentAccommodationPage = lazy(() => import("./pages/StudentAccommodation"));
const FintechPage = lazy(() => import("./pages/Fintech"));
const DonorCRMPage = lazy(() => import("./pages/DonorCRM"));
const PaymentSuccessPage = lazy(() => import("./pages/PaymentSuccess"));
const PaymentCancelledPage = lazy(() => import("./pages/PaymentCancelled"));
const PayPage = lazy(() => import("./pages/Pay"));
const CommHubPage = lazy(() => import("./pages/CommHub"));
const MergeHistoryPage = lazy(() => import("./pages/MergeHistory"));
const ComplianceCockpitPage = lazy(() => import("./pages/ComplianceCockpit"));
const DecisionsPage = lazy(() => import("./pages/Decisions"));
const GiftAidPage = lazy(() => import("./pages/GiftAid"));
const PayrollV3Page = lazy(() => import("./pages/PayrollV3"));
const CommsV3Page = lazy(() => import("./pages/CommsV3"));
const MeetingsV3Page = lazy(() => import("./pages/MeetingsV3"));
const CommsInboxPage = lazy(() => import("./pages/CommsInbox"));
const AuditTrailPage = lazy(() => import("./pages/AuditTrail"));
const SystemHealthPage = lazy(() => import("./pages/SystemHealth"));
const PledgesPage = lazy(() => import("./pages/Pledges"));
const DonorPipelinePage = lazy(() => import("./pages/DonorPipeline"));
const MajorDonorPage = lazy(() => import("./pages/MajorDonor"));
const BulkApprovalsPage = lazy(() => import("./pages/BulkApprovals"));
const ConflictsRegisterPage = lazy(() => import("./pages/ConflictsRegister"));
const RecognitionTiersPage = lazy(() => import("./pages/RecognitionTiers"));
const QRCodesPage = lazy(() => import("./pages/QRCodes"));
const DonorProfilePage = lazy(() => import("./pages/DonorProfile"));
const SavedViewsPage = lazy(() => import("./pages/SavedViews"));
const DonorPortalPage = lazy(() => import("./pages/DonorPortal"));
const DonorsWallPage = lazy(() => import("./pages/DonorsWall"));
const BillsUtilitiesPage = lazy(() => import("./pages/BillsUtilities"));
const TrainingTrackerPage = lazy(() => import("./pages/TrainingTracker"));
const LbmwCorrespondencePage = lazy(() => import("./pages/LbmwCorrespondence"));
const TrusteeDashboardPage = lazy(() => import("./pages/TrusteeDashboard"));
const FacilitiesPage = lazy(() => import("./pages/Facilities"));
const Bistro87Page = lazy(() => import("./pages/Bistro87"));
const DonatePage = lazy(() => import("./pages/DonatePage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/pending-approval", "/payment/success", "/payment/cancelled", "/pay", "/give", "/donors-wall", "/donate"];

// ─── Loading fallback ────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function Router() {
  const path = window.location.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (isPublic) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/login" component={LoginPage} />
          <Route path="/register" component={RegisterPage} />
          <Route path="/forgot-password" component={ForgotPasswordPage} />
          <Route path="/reset-password" component={ResetPasswordPage} />
          <Route path="/pay" component={PayPage} />
          <Route path="/give/:token" component={DonorPortalPage} />
          <Route path="/donors-wall" component={DonorsWallPage} />
          <Route path="/donate" component={DonatePage} />
          <Route path="/payment/success" component={PaymentSuccessPage} />
          <Route path="/payment/cancelled" component={PaymentCancelledPage} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    );
  }

  return (
    <DashboardLayout>
      <RouteGuard>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          {/* ── DAILY ── */}
          <Route path="/" component={CapturePage} />
          <Route path="/capture" component={CapturePage} />
          <Route path="/dashboard" component={DashboardPage} />

          {/* ── FINANCE ── */}
          <Route path="/receipts" component={ReceiptsPage} />
          <Route path="/receipts/:id" component={ReceiptDetailPage} />
          <Route path="/income" component={IncomePage} />
          <Route path="/monthly-expenses" component={MonthlyExpensesPage} />
          <Route path="/bills-utilities" component={BillsUtilitiesPage} />
          <Route path="/fintech" component={FintechPage} />
          <Route path="/reconciliation" component={ReconciliationPage} />
          <Route path="/loans" component={LoansPage} />
          <Route path="/loans/:id">{(params) => <LoanDetailPage id={parseInt((params as { id: string }).id)} />}</Route>
          <Route path="/payroll" component={PayrollPage} />
          <Route path="/payroll-v3" component={PayrollV3Page} />

          {/* ── DONORS & FUNDRAISING ── */}
          {/* Main Donors/CRM screen — tabs inside handle sub-views */}
          <Route path="/donor-crm" component={DonorCRMPage} />
          <Route path="/donors" component={DonorsPage} />
          <Route path="/donors/:id" component={DonorProfilePage} />
          <Route path="/campaigns" component={CampaignsPage} />
          <Route path="/gift-aid" component={GiftAidPage} />
          <Route path="/fundraising" component={FundraisingPage} />
          {/* Items that became tabs inside Donors — keep routes working */}
          <Route path="/pledges" component={PledgesPage} />
          <Route path="/donor-pipeline" component={DonorPipelinePage} />
          <Route path="/major-donor" component={MajorDonorPage} />
          <Route path="/saved-views" component={SavedViewsPage} />
          <Route path="/recognition-tiers" component={RecognitionTiersPage} />
          <Route path="/qr-codes" component={QRCodesPage} />

          {/* ── COMMUNICATIONS ── */}
          <Route path="/communications" component={CommunicationsPage} />
          <Route path="/comms-hub" component={CommHubPage} />
          <Route path="/comms-inbox" component={CommsInboxPage} />
          <Route path="/comms-v3" component={CommsV3Page} />
          <Route path="/meetings" component={MeetingsV3Page} />

          {/* ── REPORTS ── */}
          <Route path="/reports" component={ReportsPage} />

          {/* ── OPERATIONS ── */}
          <Route path="/bistro87" component={Bistro87Page} />
          <Route path="/accommodation" component={StudentAccommodationPage} />
          <Route path="/facilities" component={FacilitiesPage} />
          <Route path="/training-tracker" component={TrainingTrackerPage} />

          {/* ── GOVERNANCE ── */}
          <Route path="/trustee-dashboard" component={TrusteeDashboardPage} />
          <Route path="/compliance" component={ComplianceCockpitPage} />
          {/* Items that became tabs inside Compliance Cockpit — keep routes working */}
          <Route path="/conflicts-register" component={ConflictsRegisterPage} />
          <Route path="/decisions" component={DecisionsPage} />
          <Route path="/bulk-approvals" component={BulkApprovalsPage} />
          <Route path="/lbmw-correspondence" component={LbmwCorrespondencePage} />
          {/* People (merged Trustees + Org Chart) */}
          <Route path="/trustees" component={TrusteesPage} />
          <Route path="/org-chart" component={OrgChartPage} />

          {/* ── SYSTEM ── */}
          <Route path="/admin" component={AdminPanelPage} />
          {/* Items that moved under Settings — keep routes working */}
          <Route path="/merge-history" component={MergeHistoryPage} />
          <Route path="/backups" component={BackupsPage} />
          <Route path="/audit-trail" component={AuditTrailPage} />
          <Route path="/system-health" component={SystemHealthPage} />

          {/* ── Other ── */}
          <Route path="/donate" component={DonatePage} />
          <Route path="/payment/success" component={PaymentSuccessPage} />
          <Route path="/payment/cancelled" component={PaymentCancelledPage} />
          <Route path="/pending-approval" component={PendingApprovalPage} />
          <Route path="/profile" component={ProfileSettingsPage} />
          <Route path="/settings" component={ProfileSettingsPage} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
      </RouteGuard>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
