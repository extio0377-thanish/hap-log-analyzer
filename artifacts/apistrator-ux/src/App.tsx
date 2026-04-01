import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-context";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { LogStateProvider } from "@/contexts/log-state-context";
import { Spinner } from "@/components/Spinner";
import Home from "@/pages/Home";
import LoginPage from "@/pages/LoginPage";
import UserManagementPage from "@/pages/UserManagementPage";
import PasswordPolicyPage from "@/pages/PasswordPolicyPage";
import ProfilePage from "@/pages/ProfilePage";
import LogConfigPage from "@/pages/LogConfigPage";
import SecurityDashboard from "@/pages/SecurityDashboard";
import ServerMetricsDashboard from "@/pages/ServerMetricsDashboard";
import SecurityConfigPage from "@/pages/SecurityConfigPage";
import StorageHealthDashboard from "@/pages/StorageHealthDashboard";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function ProtectedRoute({ component: Component, permission }: { component: React.ComponentType; permission?: string }) {
  const { user, loading, hasPermission } = useAuth();
  if (loading) return <Spinner fullScreen />;
  if (!user) return <Redirect to="/login" />;
  if (permission && !hasPermission(permission)) return <Redirect to="/" />;
  return <Component />;
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner fullScreen />;
  if (user) return <Redirect to="/" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={() => <PublicRoute component={LoginPage} />} />
      <Route path="/users" component={() => <ProtectedRoute component={UserManagementPage} permission="manage_users" />} />
      <Route path="/password-policy" component={() => <ProtectedRoute component={PasswordPolicyPage} permission="manage_policy" />} />
      <Route path="/profile" component={() => <ProtectedRoute component={ProfilePage} />} />
      <Route path="/log-config" component={() => <ProtectedRoute component={LogConfigPage} />} />
      <Route path="/security" component={() => <ProtectedRoute component={SecurityDashboard} permission="view_security" />} />
      <Route path="/metrics" component={() => <ProtectedRoute component={ServerMetricsDashboard} permission="view_metrics" />} />
      <Route path="/security-config" component={() => <ProtectedRoute component={SecurityConfigPage} permission="manage_users" />} />
      <Route path="/storage" component={() => <ProtectedRoute component={StorageHealthDashboard} permission="view_storage" />} />
      <Route path="/" component={() => <ProtectedRoute component={Home} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <LogStateProvider>
                <Router />
              </LogStateProvider>
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
