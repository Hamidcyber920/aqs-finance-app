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

// Public routes that don't need the dashboard shell
const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

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
        <Route path="/admin" component={AdminPanelPage} />
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
