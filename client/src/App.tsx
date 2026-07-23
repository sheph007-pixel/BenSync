import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";
import RegisterPage from "@/pages/register";
import LoginPage from "@/pages/login";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import AuthVerifyPage from "@/pages/auth-verify";
import DashboardPage from "@/pages/dashboard";
import GroupsPage from "@/pages/groups";
import PlanDetailsPage from "@/pages/plan-details";
import ReplaceCensusPage from "@/pages/proposal/replace-census";
import AdminHome from "@/pages/admin";
import AdminGroupViewPage from "@/pages/admin/group-view";
import AdminTemplatesPage from "@/pages/admin/templates";
import AdminQuotesPage from "@/pages/admin/quotes/index";
import AdminQuoteWizardPage from "@/pages/admin/quotes/new";
import AdminQuotesBulkPage from "@/pages/admin/quotes/bulk";
import PublicQuotePage from "@/pages/quote/[token]";
import PublicPlanDetailsPage from "@/pages/quote/plan-details";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";
import { Redirect } from "wouter";

function ProtectedRoute({ component: Component, adminOnly }: { component: React.ComponentType; adminOnly?: boolean }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/broker-log-in" />;
  }

  if (adminOnly && user.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Redirect to={user.role === "admin" ? "/admin" : "/dashboard"} />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      {/* The marketing site owns "/" and "/login" on full page loads
          (served by Express from /marketing). These SPA routes only fire
          on client-side navigation; send both to the broker sign-in. */}
      <Route path="/">
        <Redirect to="/broker-log-in" />
      </Route>
      <Route path="/login">
        <Redirect to="/broker-log-in" />
      </Route>
      {/* Broker sign-in for admins and broker accounts. */}
      <Route path="/broker-log-in">
        <PublicRoute component={LoginPage} />
      </Route>
      {/* Broker sign-up. */}
      <Route path="/broker-sign-up">
        <PublicRoute component={RegisterPage} />
      </Route>
      {/* Backward-compat redirects for the old auth URLs. */}
      <Route path="/portal">
        <Redirect to="/broker-log-in" />
      </Route>
      <Route path="/register">
        <Redirect to="/broker-sign-up" />
      </Route>
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/auth/verify" component={AuthVerifyPage} />
      <Route path="/dashboard">
        <ProtectedRoute component={DashboardPage} />
      </Route>
      <Route path="/dashboard/new">
        <ProtectedRoute component={DashboardPage} />
      </Route>
      <Route path="/dashboard/groups">
        <ProtectedRoute component={GroupsPage} />
      </Route>
      <Route path="/dashboard/:groupId/plan-details">
        <ProtectedRoute component={PlanDetailsPage} />
      </Route>
      <Route path="/dashboard/:groupId/replace-census">
        <ProtectedRoute component={ReplaceCensusPage} />
      </Route>
      <Route path="/dashboard/:groupId">
        <ProtectedRoute component={DashboardPage} />
      </Route>
      {/* Legacy customer routes fold into /dashboard. */}
      <Route path="/proposals">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/report/:id">
        <Redirect to="/dashboard" />
      </Route>
      {/* Admin is now a single unified list + customer-view-as-admin. */}
      <Route path="/admin">
        <ProtectedRoute component={AdminHome} adminOnly />
      </Route>
      <Route path="/admin/groups/:groupId/plan-details">
        <ProtectedRoute component={PlanDetailsPage} adminOnly />
      </Route>
      <Route path="/admin/groups/:groupId">
        <ProtectedRoute component={AdminGroupViewPage} adminOnly />
      </Route>
      <Route path="/admin/templates">
        <ProtectedRoute component={AdminTemplatesPage} adminOnly />
      </Route>
      <Route path="/admin/quotes/new">
        <ProtectedRoute component={AdminQuoteWizardPage} adminOnly />
      </Route>
      <Route path="/admin/quotes/bulk">
        <ProtectedRoute component={AdminQuotesBulkPage} adminOnly />
      </Route>
      <Route path="/admin/quotes">
        <ProtectedRoute component={AdminQuotesPage} adminOnly />
      </Route>
      {/* Public share link, logged out, token-gated, no PHI. */}
      <Route path="/q/:token/plan-details" component={PublicPlanDetailsPage} />
      <Route path="/q/:token" component={PublicQuotePage} />
      {/* Legacy admin deep links redirect to the unified admin home. */}
      <Route path="/admin/dashboard">
        <Redirect to="/admin" />
      </Route>
      <Route path="/admin/groups">
        <Redirect to="/admin" />
      </Route>
      <Route path="/admin/users">
        <Redirect to="/admin" />
      </Route>
      <Route path="/admin/generator">
        <Redirect to="/admin" />
      </Route>
      <Route path="/admin/settings">
        <Redirect to="/admin" />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <Router />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
