import { useEffect, useRef } from "react";
import { ThemeProvider } from "@/hooks/use-theme";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth, RedirectToSignIn } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter } from "@workspace/api-client-react";

import { DashboardPage } from "./pages/dashboard";
import { ContactsPage } from "./pages/contacts";
import { ContactDetailPage } from "./pages/contact-detail";
import { CompaniesPage } from "./pages/companies";
import { CompanyDetailPage } from "./pages/company-detail";
import { DealsPage } from "./pages/deals";
import { TasksPage } from "./pages/tasks";
import { CampaignsPage } from "./pages/campaigns";
import { CampaignNewPage } from "./pages/campaign-new";
import { CampaignDetailPage } from "./pages/campaign-detail";
import { LandingPage } from "./pages/landing";
import { ReportsPage } from "./pages/reports";

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

// REQUIRED — copy verbatim
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — copy verbatim. Empty in dev (intentional), auto-set in prod.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

// Build clerkAppearance using the shadcn theme — fill in all "..." with real values matching your palette
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(221 83% 53%)",
    colorForeground: "hsl(222 47% 11%)",
    colorMutedForeground: "hsl(215.4 16.3% 46.9%)",
    colorDanger: "hsl(0 84.2% 60.2%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(214.3 31.8% 91.4%)",
    colorInputForeground: "hsl(222 47% 11%)",
    colorNeutral: "hsl(214 32% 91%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-card rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground font-semibold",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground",
    formFieldLabel: "text-foreground",
    footerActionLink: "text-primary",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-green-600",
    alertText: "text-foreground",
    logoBox: "flex justify-center",
    logoImage: "h-8 w-auto",
    socialButtonsBlockButton: "border border-border bg-card hover:bg-muted",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
    formFieldInput: "bg-input text-foreground border-border",
    footerAction: "bg-muted/50",
    dividerLine: "bg-border",
    alert: "bg-muted",
    otpCodeFieldInput: "bg-input text-foreground border-border",
    formFieldRow: "",
    main: "",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkApiAuth() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

// HomeRedirect: signed-in → /dashboard, signed-out → landing page
function HomeRedirect() {
  const [, setLocation] = useLocation();
  
  return (
    <>
      <Show when="signed-in">
        {(() => {
          setTimeout(() => setLocation('/dashboard'), 0);
          return null;
        })()}
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <Show when="signed-in" fallback={<RedirectToSignIn />}>
      <Component />
    </Show>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Welcome back", subtitle: "Sign in to MyCRM" } },
        signUp: { start: { title: "Create your account", subtitle: "Get started with MyCRM" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkApiAuth />
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            {/* REQUIRED — these exact patterns, character-for-character */}
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/dashboard" component={() => <ProtectedRoute component={DashboardPage} />} />
            <Route path="/contacts" component={() => <ProtectedRoute component={ContactsPage} />} />
            <Route path="/contacts/:id" component={() => <ProtectedRoute component={ContactDetailPage} />} />
            <Route path="/companies" component={() => <ProtectedRoute component={CompaniesPage} />} />
            <Route path="/companies/:id" component={() => <ProtectedRoute component={CompanyDetailPage} />} />
            <Route path="/deals" component={() => <ProtectedRoute component={DealsPage} />} />
            <Route path="/tasks" component={() => <ProtectedRoute component={TasksPage} />} />
            <Route path="/campaigns" component={() => <ProtectedRoute component={CampaignsPage} />} />
            <Route path="/campaigns/new" component={() => <ProtectedRoute component={CampaignNewPage} />} />
            <Route path="/campaigns/:id" component={() => <ProtectedRoute component={CampaignDetailPage} />} />
            <Route path="/reports" component={() => <ProtectedRoute component={ReportsPage} />} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
    </ThemeProvider>
  );
}

export default App;
