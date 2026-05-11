import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import CapturePage from "./pages/Capture";
import DashboardPage from "./pages/Dashboard";
import ReceiptsPage from "./pages/Receipts";
import ReceiptDetailPage from "./pages/ReceiptDetail";
import ReportsPage from "./pages/Reports";
import LoginPage from "./pages/Login";
import RegisterPage from "./pages/Register";
import ForgotPasswordPage from "./pages/ForgotPassword";
import ResetPasswordPage from "./pages/ResetPassword";
import AdminPanelPage from "./pages/AdminPanel";
import FundraisingPage from "./pages/Fundraising";
import LoansPage from "./pages/Loans";
import LoanDetailPage from "./pages/LoanDetail";
import IncomePage from "./pages/Income";
import PayrollPage from "./pages/Payroll";
import DonorsPage from "./pages/Donors";
import OrgChartPage from "./pages/OrgChart";
import CommunicationsPage from "./pages/Communications";
import CampaignsPage from "./pages/Campaigns";
import ProfileSettingsPage from "./pages/ProfileSettings";
import PendingApprovalPage from "./pages/PendingApproval";
import MonthlyExpensesPage from "./pages/MonthlyExpenses";
import ReconciliationPage from "./pages/Reconciliation";
import TrusteesPage from "./pages/Trustees";
import BackupsPage from "./pages/Backups";
import StudentAccommodationPage from "./pages/StudentAccommodation";
import FintechPage from "./pages/Fintech";
import DonorCRMPage from "./pages/DonorCRM";
import PaymentSuccessPage from "./pages/PaymentSuccess";
import PaymentCancelledPage from "./pages/PaymentCancelled";
import PayPage from "./pages/Pay";
import CommHubPage from "./pages/CommHub";
import MergeHistoryPage from "./pages/MergeHistory";
import ComplianceCockpitPage from "./pages/ComplianceCockpit";
import DecisionsPage from "./pages/Decisions";
import GiftAidPage from "./pages/GiftAid";
import PayrollV3Page from "./pages/PayrollV3";
import CommsV3Page from "./pages/CommsV3";
import MeetingsV3Page from "./pages/MeetingsV3";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/pending-approval", "/payment/success", "/payment/cancelled", "/pay"];

function Router() {
  const path = window.location.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (isPublic) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/pay" component={PayPage} />
        <Route path="/payment/success" component={PaymentSuccessPage} />
        <Route path="/payment/cancelled" component={PaymentCancelledPage} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={CapturePage} />
        <Route path="/capture" component={CapturePage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/receipts" component={ReceiptsPage} />
        <Route path="/receipts/:id" component={ReceiptDetailPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/fundraising" component={FundraisingPage} />
        <Route path="/loans" component={LoansPage} />
        <Route path="/loans/:id">{(params) => <LoanDetailPage id={parseInt((params as { id: string }).id)} />}</Route>
        <Route path="/income" component={IncomePage} />
        <Route path="/payroll" component={PayrollPage} />
        <Route path="/monthly-expenses" component={MonthlyExpensesPage} />
        <Route path="/reconciliation" component={ReconciliationPage} />
        <Route path="/donors" component={DonorsPage} />
        <Route path="/campaigns" component={CampaignsPage} />
        <Route path="/org-chart" component={OrgChartPage} />
        <Route path="/communications" component={CommunicationsPage} />
        <Route path="/comms-hub" component={CommHubPage} />
        <Route path="/admin" component={AdminPanelPage} />
        <Route path="/trustees" component={TrusteesPage} />
        <Route path="/backups" component={BackupsPage} />
        <Route path="/accommodation" component={StudentAccommodationPage} />
        <Route path="/fintech" component={FintechPage} />
        <Route path="/donor-crm" component={DonorCRMPage} />
        <Route path="/merge-history" component={MergeHistoryPage} />
        <Route path="/compliance" component={ComplianceCockpitPage} />
        <Route path="/decisions" component={DecisionsPage} />
        <Route path="/gift-aid" component={GiftAidPage} />
        <Route path="/payroll-v3" component={PayrollV3Page} />
        <Route path="/comms-v3" component={CommsV3Page} />
        <Route path="/meetings" component={MeetingsV3Page} />
        <Route path="/payment/success" component={PaymentSuccessPage} />
        <Route path="/payment/cancelled" component={PaymentCancelledPage} />
        <Route path="/pending-approval" component={PendingApprovalPage} />
        <Route path="/profile" component={ProfileSettingsPage} />
        <Route path="/settings" component={ProfileSettingsPage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
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
