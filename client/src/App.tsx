import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { TargetAudienceProvider } from "@/lib/target-audience";
import Layout from "@/components/layout";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import ContactsPage from "@/pages/contacts";
import ContactDetailPage from "@/pages/contact-detail";
import OrganizationsPage from "@/pages/organizations";
import OrgDetailPage from "@/pages/org-detail";
import TagsPage from "@/pages/tags";
import MergePage from "@/pages/merge";
import NotFound from "@/pages/not-found";

function AuthenticatedApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <TargetAudienceProvider>
      <Layout>
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/contacts" component={ContactsPage} />
          <Route path="/contacts/:id" component={ContactDetailPage} />
          <Route path="/organizations" component={OrganizationsPage} />
          <Route path="/organizations/:id" component={OrgDetailPage} />
          <Route path="/tags" component={TagsPage} />
          <Route path="/merge" component={MergePage} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </TargetAudienceProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthProvider>
          <Router hook={useHashLocation}>
            <AuthenticatedApp />
          </Router>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
