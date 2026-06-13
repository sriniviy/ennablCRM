import { useEffect, useRef } from "react";
import { ThemeProvider } from "@/hooks/use-theme";
import { Switch, Route, useLocation, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { authClient } from "@/lib/auth-client";

import { DashboardPage } from "./pages/dashboard";
import { ContactsPage } from "./pages/contacts";
import { ContactDetailPage } from "./pages/contact-detail";
import { CompaniesPage } from "./pages/companies";
import { CompanyDetailPage } from "./pages/company-detail";
import { DealsPage } from "./pages/deals";
import { ActivitiesPage } from "./pages/activities";
import { TasksPage } from "./pages/tasks";
import { CampaignsPage } from "./pages/campaigns";
import { CampaignNewPage } from "./pages/campaign-new";
import { CampaignDetailPage } from "./pages/campaign-detail";
import { LandingPage } from "./pages/landing";
import { ReportsPage } from "./pages/reports";
import { SettingsIndexPage } from "./pages/settings-index";
import { SettingsTeamPage } from "./pages/settings-team";
import { SettingsExportsPage } from "./pages/settings-exports";
import { SettingsAiPresetsPage } from "./pages/settings-ai-presets";
import { SettingsCustomFieldsPage } from "./pages/settings-custom-fields";
import { SequencesPage } from "./pages/sequences";
import { SequenceDetailPage } from "./pages/sequence-detail";
import { AuditLogPage } from "./pages/audit-log";
import { NeedsReviewPage } from "./pages/needs-review";
import { SegmentsPage } from "./pages/segments";
import { SignInPage } from "./pages/sign-in";
import { SignUpPage } from "./pages/sign-up";
import { MigratePage } from "./pages/migrate";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
    },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function BetterAuthApiTokenSetter() {
  useEffect(() => {
    setAuthTokenGetter(async () => {
      const { data } = await authClient.getSession();
      return data?.session?.token ?? null;
    });
    return () => setAuthTokenGetter(null);
  }, []);
  return null;
}

function BetterAuthCacheInvalidator() {
  const { data: session } = authClient.useSession();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const userId = session?.user?.id ?? null;
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
      qc.clear();
    }
    prevUserIdRef.current = userId;
  }, [session, qc]);

  return null;
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-background">
      <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: session, isPending } = authClient.useSession();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isPending && !session) {
      setLocation("/sign-in");
    }
  }, [isPending, session, setLocation]);

  if (isPending) return <LoadingScreen />;
  if (!session) return null;
  return <Component />;
}

function HomeRedirect() {
  const { data: session, isPending } = authClient.useSession();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isPending && session) {
      setLocation("/dashboard");
    }
  }, [isPending, session, setLocation]);

  if (isPending) return <LoadingScreen />;
  if (session) return null;
  return <LandingPage />;
}

function AppRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <BetterAuthApiTokenSetter />
      <BetterAuthCacheInvalidator />
      <TooltipProvider>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in" component={SignInPage} />
          <Route path="/sign-up" component={SignUpPage} />
          <Route path="/dashboard" component={() => <ProtectedRoute component={DashboardPage} />} />
          <Route path="/contacts" component={() => <ProtectedRoute component={ContactsPage} />} />
          <Route path="/contacts/:id" component={() => <ProtectedRoute component={ContactDetailPage} />} />
          <Route path="/needs-review" component={() => <ProtectedRoute component={NeedsReviewPage} />} />
          <Route path="/companies" component={() => <ProtectedRoute component={CompaniesPage} />} />
          <Route path="/companies/:id" component={() => <ProtectedRoute component={CompanyDetailPage} />} />
          <Route path="/deals" component={() => <ProtectedRoute component={DealsPage} />} />
          <Route path="/activities" component={() => <ProtectedRoute component={ActivitiesPage} />} />
          <Route path="/tasks" component={() => <ProtectedRoute component={TasksPage} />} />
          <Route path="/campaigns" component={() => <ProtectedRoute component={CampaignsPage} />} />
          <Route path="/campaigns/new" component={() => <ProtectedRoute component={CampaignNewPage} />} />
          <Route path="/campaigns/:id" component={() => <ProtectedRoute component={CampaignDetailPage} />} />
          <Route path="/reports" component={() => <ProtectedRoute component={ReportsPage} />} />
          <Route path="/settings" component={() => <ProtectedRoute component={SettingsIndexPage} />} />
          <Route path="/settings/team" component={() => <ProtectedRoute component={SettingsTeamPage} />} />
          <Route path="/settings/exports" component={() => <ProtectedRoute component={SettingsExportsPage} />} />
          <Route path="/settings/ai-presets" component={() => <ProtectedRoute component={SettingsAiPresetsPage} />} />
          <Route path="/settings/custom-fields" component={() => <ProtectedRoute component={SettingsCustomFieldsPage} />} />
          <Route path="/settings/audit-log" component={() => <ProtectedRoute component={AuditLogPage} />} />
          <Route path="/settings/import" component={() => <ProtectedRoute component={MigratePage} />} />
          <Route path="/sequences" component={() => <ProtectedRoute component={SequencesPage} />} />
          <Route path="/sequences/:id" component={() => <ProtectedRoute component={SequenceDetailPage} />} />
          <Route path="/segments" component={() => <ProtectedRoute component={SegmentsPage} />} />
          <Route path="/admin/audit-log" component={() => <ProtectedRoute component={AuditLogPage} />} />
          <Route path="/admin/migrate" component={() => <ProtectedRoute component={MigratePage} />} />
        </Switch>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <WouterRouter base={basePath}>
        <AppRoutes />
      </WouterRouter>
    </ThemeProvider>
  );
}

export default App;
