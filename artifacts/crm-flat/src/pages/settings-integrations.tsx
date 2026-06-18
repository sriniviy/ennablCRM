import { useState } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionToken } from "@/hooks/use-session-token";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Plug2, Sparkles, Mail, TrendingUp, ChevronDown, ChevronUp,
  Eye, EyeOff, Check, RefreshCw, Unplug,
} from "lucide-react";

// ── AI provider / model catalogue ─────────────────────────────────────────────
const AI_PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
      { id: "o1-mini", label: "o1 mini" },
      { id: "o3-mini", label: "o3 mini" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    models: [
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
      { id: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    ],
  },
  {
    id: "google",
    name: "Google AI",
    models: [
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    ],
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────
type ApolloConfig = { enabled: boolean; apiKey: string };
type GmailConfig = { enabled: boolean; emailLogging: boolean; campaignSending: boolean };
type GmailStatus = { connected: boolean; email?: string; connected_at?: string; last_sync?: string | null };
type AiProviderConfig = { id: string; name: string; apiKey: string; enabled: boolean };
type AiConfig = {
  enabled: boolean;
  providers: AiProviderConfig[];
  activeProvider: string | null;
  activeModel: string | null;
};
type EnnablGrowthConfig = { enabled: boolean };
type IntegrationsData = {
  apollo: ApolloConfig;
  gmail: GmailConfig;
  ai: AiConfig;
  ennabl_growth: EnnablGrowthConfig;
};

// ── Shared section shell ──────────────────────────────────────────────────────
function IntegrationCard({
  icon: Icon,
  iconColor,
  iconBg,
  name,
  tagline,
  description,
  enabled,
  onToggle,
  saving,
  children,
}: {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  name: string;
  tagline: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  saving: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-0">
        <div className="flex items-start gap-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-sm">{name}</p>
                <p className="text-xs text-muted-foreground">{tagline}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant={enabled ? "default" : "secondary"} className="text-[10px] px-2">
                  {enabled ? "Active" : "Disabled"}
                </Badge>
                <Switch
                  checked={enabled}
                  onCheckedChange={onToggle}
                  disabled={saving}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{description}</p>
          </div>
        </div>
        {children && (
          <button
            className="mt-3 -mx-6 px-6 py-2.5 flex items-center justify-between w-[calc(100%+3rem)] border-t text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="font-medium">Configure</span>
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </CardHeader>
      {children && open && (
        <CardContent className="pt-4 border-t">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

// ── Masked API key input ──────────────────────────────────────────────────────
function ApiKeyInput({
  value,
  onChange,
  placeholder = "Paste API key…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-xs pr-9 font-mono"
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onClick={() => setShow((v) => !v)}
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function SettingsIntegrationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const getToken = useSessionToken();

  async function apiFetch(path: string, opts?: RequestInit) {
    const token = await getToken();
    const res = await fetch(`/api${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  const { data, isLoading } = useQuery<IntegrationsData>({
    queryKey: ["integrations"],
    queryFn: () => apiFetch("/integrations"),
  });

  const patch = useMutation({
    mutationFn: ({ key, payload }: { key: string; payload: object }) =>
      apiFetch(`/integrations/${key}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
    onError: (err: Error) =>
      toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  // ── Apollo local state ─────────────────────────────────────────────────────
  const [apolloKey, setApolloKey] = useState("");
  const [apolloKeySaved, setApolloKeySaved] = useState(false);
  const apolloCfg = data?.apollo ?? { enabled: false, apiKey: "" };

  function saveApolloKey() {
    patch.mutate({ key: "apollo", payload: { apiKey: apolloKey } });
    setApolloKeySaved(true);
    setTimeout(() => setApolloKeySaved(false), 2500);
  }

  // ── Gmail status + sync ───────────────────────────────────────────────────
  const { data: gmailStatus, refetch: refetchGmailStatus } = useQuery<GmailStatus>({
    queryKey: ["gmail-status"],
    queryFn: () => apiFetch("/gmail/status"),
    refetchOnWindowFocus: true,
  });

  const [gmailSyncing, setGmailSyncing] = useState(false);
  const [gmailDisconnecting, setGmailDisconnecting] = useState(false);

  async function connectGmail() {
    // Pass auth token as query param so the server can identify the user
    const sessionToken = await getToken();
    const url = `/api/gmail/auth?token=${encodeURIComponent(sessionToken)}`;
    const win = window.open(url, "gmail_oauth", "width=600,height=700");
    const handler = (e: MessageEvent) => {
      if (e.data === "gmail_connected") {
        window.removeEventListener("message", handler);
        win?.close();
        refetchGmailStatus();
        qc.invalidateQueries({ queryKey: ["gmail-all-status"] });
        toast({ title: "Gmail connected — emails will sync every 5 minutes automatically" });
      }
    };
    window.addEventListener("message", handler);
  }

  async function syncGmail() {
    setGmailSyncing(true);
    try {
      const result = await apiFetch("/gmail/sync", { method: "POST", body: JSON.stringify({ maxMessages: 100 }) });
      refetchGmailStatus();
      toast({ title: `Sync complete — ${result.synced} emails imported, ${result.skipped} skipped` });
    } catch (err) {
      toast({ title: "Sync failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setGmailSyncing(false);
    }
  }

  async function disconnectGmail() {
    setGmailDisconnecting(true);
    try {
      await apiFetch("/gmail/disconnect", { method: "DELETE" });
      refetchGmailStatus();
      toast({ title: "Gmail disconnected" });
    } catch {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    } finally {
      setGmailDisconnecting(false);
    }
  }

  // ── Gmail all-team status (admin) ────────────────────────────────────────
  type TeamGmailStatus = { userId: string; email: string; connectedAt: string; lastSync: string | null };
  const { data: teamGmailStatus } = useQuery<TeamGmailStatus[]>({
    queryKey: ["gmail-all-status"],
    queryFn: () => apiFetch("/gmail/all-status"),
    retry: false, // fails silently for non-admins
  });

  // ── AI local state ─────────────────────────────────────────────────────────
  const aiCfg: AiConfig = data?.ai ?? {
    enabled: true,
    providers: AI_PROVIDERS.map((p) => ({ id: p.id, name: p.name, apiKey: "", enabled: false })),
    activeProvider: null,
    activeModel: null,
  };

  const [aiProviderKeys, setAiProviderKeys] = useState<Record<string, string>>({});
  const [aiKeySaved, setAiKeySaved] = useState<string | null>(null);

  function mergedProviders(): AiProviderConfig[] {
    return AI_PROVIDERS.map((def) => {
      const stored = aiCfg.providers.find((p) => p.id === def.id) ?? { id: def.id, name: def.name, apiKey: "", enabled: false };
      return stored;
    });
  }

  function updateProviderEnabled(providerId: string, enabled: boolean) {
    const providers = mergedProviders().map((p) =>
      p.id === providerId ? { ...p, enabled } : p,
    );
    patch.mutate({ key: "ai", payload: { providers } });
  }

  function saveProviderKey(providerId: string) {
    const apiKey = aiProviderKeys[providerId] ?? "";
    const providers = mergedProviders().map((p) =>
      p.id === providerId ? { ...p, apiKey } : p,
    );
    patch.mutate({ key: "ai", payload: { providers } });
    setAiKeySaved(providerId);
    setTimeout(() => setAiKeySaved(null), 2500);
  }

  function setActiveModel(provider: string, model: string) {
    patch.mutate({ key: "ai", payload: { activeProvider: provider, activeModel: model } });
  }

  const providers = mergedProviders();
  const enabledProviders = providers.filter((p) => p.enabled && p.apiKey);

  // All models across enabled providers
  const allEnabledModels = enabledProviders.flatMap((p) => {
    const def = AI_PROVIDERS.find((d) => d.id === p.id);
    return (def?.models ?? []).map((m) => ({ ...m, providerId: p.id, providerName: p.name }));
  });

  if (isLoading) {
    return (
      <SidebarLayout>
        <div className="space-y-4 max-w-3xl animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-muted" />
          ))}
        </div>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10">
            <Plug2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
            <p className="text-sm text-muted-foreground">Enable and configure third-party connections for your workspace.</p>
          </div>
        </div>

        {/* ── Apollo ──────────────────────────────────────────────────────── */}
        <IntegrationCard
          icon={Plug2}
          iconColor="text-orange-500"
          iconBg="bg-orange-50 dark:bg-orange-950/30"
          name="Apollo"
          tagline="Contact & company data enrichment"
          description="Cross-verify and auto-populate contact and company profiles with verified B2B data from Apollo's database — firmographics, emails, phone numbers, and more."
          enabled={apolloCfg.enabled}
          onToggle={(v) => patch.mutate({ key: "apollo", payload: { enabled: v } })}
          saving={patch.isPending}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">API Key</label>
              <p className="text-xs text-muted-foreground mb-2">
                Find your key in Apollo → Settings → Integrations → API Keys.
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <ApiKeyInput
                    value={apolloKey || (apolloCfg.apiKey ? "••••••••••••••••" : "")}
                    onChange={(v) => setApolloKey(v)}
                    placeholder="Paste Apollo API key…"
                  />
                </div>
                <Button
                  size="sm"
                  variant={apolloKeySaved ? "secondary" : "default"}
                  className="h-8 px-3 text-xs shrink-0 gap-1.5"
                  onClick={saveApolloKey}
                  disabled={!apolloKey.trim() || patch.isPending}
                >
                  {apolloKeySaved ? <><Check className="h-3 w-3" /> Saved</> : "Save key"}
                </Button>
              </div>
              {apolloCfg.apiKey && !apolloKey && (
                <p className="text-[11px] text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                  <Check className="h-3 w-3" /> API key is configured
                </p>
              )}
            </div>
          </div>
        </IntegrationCard>

        {/* ── Gmail ───────────────────────────────────────────────────────── */}
        <IntegrationCard
          icon={Mail}
          iconColor="text-red-500"
          iconBg="bg-red-50 dark:bg-red-950/30"
          name="Gmail"
          tagline="Email logging & outbound sending"
          description="Log inbound and outbound Gmail emails to contact timelines automatically, and optionally route campaign and sequence delivery through your connected Gmail account."
          enabled={data?.gmail.enabled ?? false}
          onToggle={(v) => patch.mutate({ key: "gmail", payload: { enabled: v } })}
          saving={patch.isPending}
        >
          <div className="space-y-4">
            {/* Your Gmail account */}
            <div>
              <p className="text-xs font-medium mb-2">Your Gmail account</p>
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div>
                  {gmailStatus?.connected ? (
                    <div>
                      <p className="text-xs font-medium flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                        {gmailStatus.email}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Connected · {gmailStatus.lastSync
                          ? `Last sync ${new Date(gmailStatus.lastSync).toLocaleString()}`
                          : "Not synced yet — emails sync automatically every 5 minutes"}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-medium">Not connected</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Connect your Gmail to automatically log emails with CRM contacts.
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {gmailStatus?.connected ? (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={syncGmail} disabled={gmailSyncing}>
                        <RefreshCw className={`h-3 w-3 ${gmailSyncing ? "animate-spin" : ""}`} />
                        {gmailSyncing ? "Syncing…" : "Sync now"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive" onClick={disconnectGmail} disabled={gmailDisconnecting}>
                        <Unplug className="h-3 w-3" />
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={connectGmail}>
                      <Mail className="h-3 w-3" />
                      Connect Gmail
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Team connections (admin only) */}
            {teamGmailStatus && teamGmailStatus.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2">Team connections</p>
                <div className="space-y-1.5">
                  {teamGmailStatus.map((u) => (
                    <div key={u.userId} className="flex items-center justify-between px-3 py-2 rounded-md border text-xs">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-green-500 shrink-0" />
                        <span className="font-medium">{u.email}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {u.lastSync ? `Synced ${new Date(u.lastSync).toLocaleString()}` : "No sync yet"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sub-toggles */}
            <div className="space-y-2.5 pt-1 border-t">
              {[
                { field: "emailLogging" as const, label: "Email logging", desc: "Automatically log inbound and outbound Gmail emails to contact timelines" },
                { field: "campaignSending" as const, label: "Campaign & sequence sending", desc: "Route campaign and sequence emails through Gmail instead of the default mailer" },
              ].map(({ field, label, desc }) => (
                <div key={field} className="flex items-start gap-3 py-2 border-b last:border-b-0">
                  <Switch
                    checked={data?.gmail[field] ?? true}
                    onCheckedChange={(v) => patch.mutate({ key: "gmail", payload: { [field]: v } })}
                    disabled={patch.isPending}
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <p className="text-xs font-medium">{label}</p>
                    <p className="text-[11px] text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </IntegrationCard>

        {/* ── AI Model Selection ───────────────────────────────────────────── */}
        <IntegrationCard
          icon={Sparkles}
          iconColor="text-purple-500"
          iconBg="bg-purple-50 dark:bg-purple-950/30"
          name="AI Features"
          tagline="Provider & model selection"
          description="Configure AI providers, add API keys, select models, and control which AI-powered writing and suggestion features are available across the CRM."
          enabled={aiCfg.enabled}
          onToggle={(v) => patch.mutate({ key: "ai", payload: { enabled: v } })}
          saving={patch.isPending}
        >
          <div className="space-y-5">
            {/* Active model picker */}
            {allEnabledModels.length > 0 && (
              <div>
                <label className="text-xs font-medium block mb-2">Active model</label>
                <div className="flex flex-wrap gap-1.5">
                  {allEnabledModels.map((m) => {
                    const isActive = aiCfg.activeProvider === m.providerId && aiCfg.activeModel === m.id;
                    return (
                      <button
                        key={`${m.providerId}:${m.id}`}
                        onClick={() => setActiveModel(m.providerId, m.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
                          isActive
                            ? "bg-primary text-primary-foreground border-primary font-medium"
                            : "bg-background hover:border-primary/50 hover:bg-accent"
                        }`}
                      >
                        {isActive && <Check className="h-2.5 w-2.5" />}
                        <span className="text-[10px] text-muted-foreground">{m.providerName}</span>
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {allEnabledModels.length === 0 && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5">
                Enable at least one provider below and add its API key to start selecting models.
              </p>
            )}

            {/* Provider cards */}
            <div className="space-y-3">
              <label className="text-xs font-medium block">Providers</label>
              {providers.map((provider) => {
                const def = AI_PROVIDERS.find((d) => d.id === provider.id)!;
                const localKey = aiProviderKeys[provider.id] ?? "";
                const isSaved = aiKeySaved === provider.id;

                return (
                  <div key={provider.id} className="rounded-lg border p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold">{def.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {def.models.length} models available
                        </p>
                      </div>
                      <Switch
                        checked={provider.enabled}
                        onCheckedChange={(v) => updateProviderEnabled(provider.id, v)}
                        disabled={patch.isPending}
                      />
                    </div>

                    {/* API key row */}
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <ApiKeyInput
                          value={localKey || (provider.apiKey ? "••••••••••••••••" : "")}
                          onChange={(v) => setAiProviderKeys((prev) => ({ ...prev, [provider.id]: v }))}
                          placeholder={`${def.name} API key…`}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant={isSaved ? "secondary" : "outline"}
                        className="h-8 px-2.5 text-xs shrink-0 gap-1"
                        onClick={() => saveProviderKey(provider.id)}
                        disabled={!localKey.trim() || patch.isPending}
                      >
                        {isSaved ? <><Check className="h-3 w-3" /> Saved</> : "Save"}
                      </Button>
                    </div>

                    {/* Model list */}
                    {provider.enabled && provider.apiKey && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {def.models.map((m) => {
                          const isActive = aiCfg.activeProvider === provider.id && aiCfg.activeModel === m.id;
                          return (
                            <button
                              key={m.id}
                              onClick={() => setActiveModel(provider.id, m.id)}
                              className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
                                isActive
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "hover:border-primary/40 hover:bg-accent"
                              }`}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </IntegrationCard>

        {/* ── Ennabl Growth ────────────────────────────────────────────────── */}
        <IntegrationCard
          icon={TrendingUp}
          iconColor="text-green-600"
          iconBg="bg-green-50 dark:bg-green-950/30"
          name="Ennabl Growth Data Capture"
          tagline="Multi-source data aggregation"
          description="Pull enrichment data from LinkedIn exposed datasets, industry databases, and other Ennabl Growth sources to automatically keep company and contact records complete and up to date."
          enabled={data?.ennabl_growth.enabled ?? false}
          onToggle={(v) => patch.mutate({ key: "ennabl_growth", payload: { enabled: v } })}
          saving={patch.isPending}
        >
          <div className="space-y-2.5">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium mb-1">Data sources included</p>
              <ul className="text-[11px] text-muted-foreground space-y-1">
                <li>• LinkedIn exposed company & people datasets</li>
                <li>• Public company registries and firmographic databases</li>
                <li>• Industry classification and revenue enrichment</li>
                <li>• Ennabl Growth proprietary insurance market data</li>
              </ul>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Ennabl Growth Data Capture is provisioned per workspace. Contact your Ennabl account manager to enable access.
            </p>
          </div>
        </IntegrationCard>
      </div>
    </SidebarLayout>
  );
}
