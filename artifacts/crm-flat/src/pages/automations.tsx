import { useState, useEffect } from "react";
import { Link } from "wouter";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionToken } from "@/hooks/use-session-token";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ContactDuplicatesDialog } from "@/components/merge/contact-duplicates";
import { CompanyDuplicatesDialog } from "@/components/merge/company-duplicates";
import { cn } from "@/lib/utils";
import {
  Bot, Sparkles, Mail, Merge, FileUp, Clock, CheckCircle2,
  XCircle, Loader2, ChevronDown, ChevronUp, ArrowRight, Play,
  AlertCircle, Building2, Users, Plus, X, Save, Globe,
  RefreshCw, TrendingUp, Shield, Cpu, BarChart2, Swords, Star,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type JobStatus = "pending" | "running" | "completed" | "failed";
type Job = {
  id: string; type: string; label: string | null; status: JobStatus;
  progress: number; result: unknown; error: string | null;
  createdBy: string | null; creatorName: string | null;
  createdAt: string; startedAt: string | null; completedAt: string | null;
};
type SequenceDraftResult = {
  name: string;
  steps: { subject: string; body: string; delayDays: number }[];
};
type EmailAnalysisConfig = {
  enabled: boolean; analysisDepth: "short" | "mid" | "deep";
  focusTopics: string[]; insightTypes: string[];
};
type IntelConfig = {
  enabled: boolean; activeTopics: string[]; competitors: string[];
  highPriorityCompetitors: string[];
  customTopics: string[]; surfaceTypes: string[]; schedule: string[];
};
type IntelItem = { section: string; headline: string; summary: string; tag: string; date: string };
type IntelResults = { generatedAt: string; jobId: string; items: IntelItem[] };
type IntelStatus = {
  results: IntelResults | null; runsToday: number;
  runsRemaining: number; maxRunsPerDay: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: JobStatus }) {
  if (status === "completed") return <Badge className="bg-green-500/10 text-green-600 border-green-200 gap-1"><CheckCircle2 className="h-3 w-3" />Completed</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Failed</Badge>;
  if (status === "running") return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200 gap-1"><Loader2 className="h-3 w-3 animate-spin" />Running</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
}
function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
const JOB_TYPE_LABELS: Record<string, string> = {
  ai_sequence_draft: "AI Sequence Draft", data_hygiene: "Data Hygiene",
  ai_email_summary: "AI Email Summarization", csv_import: "CSV Import",
  industry_intel_refresh: "Industry Intelligence Refresh",
};

// ── Email analysis config options ─────────────────────────────────────────────
const INSIGHT_TYPE_OPTIONS = [
  { id: "key_themes", label: "Key themes", desc: "Main topics discussed across emails" },
  { id: "sentiment", label: "Sentiment", desc: "Tone: positive, neutral, or at-risk" },
  { id: "action_items", label: "Action items", desc: "Open tasks or commitments mentioned" },
  { id: "next_steps", label: "Next steps", desc: "What the contact is expecting from you" },
  { id: "deal_signals", label: "Deal signals", desc: "Budget, timeline, or intent clues" },
  { id: "follow_up_urgency", label: "Follow-up urgency", desc: "How soon a response is needed" },
];
const DEPTH_OPTIONS: { value: EmailAnalysisConfig["analysisDepth"]; label: string; desc: string }[] = [
  { value: "short", label: "Short", desc: "1–2 sentence summary per contact" },
  { value: "mid", label: "Mid", desc: "Key points + sentiment + action items" },
  { value: "deep", label: "Deep", desc: "Full narrative analysis with deal signals" },
];

// ── Industry Intel config options ─────────────────────────────────────────────
const PRESET_TOPICS = [
  { id: "competitors", label: "Insurtech Competitors vs Ennabl", icon: Swords, desc: "CRM/AMS tools competing with Ennabl for broker accounts" },
  { id: "pc_market", label: "P&C Market Conditions", icon: BarChart2, desc: "Rates, capacity, underwriting trends across commercial lines" },
  { id: "benefits_market", label: "Group Benefits Landscape", icon: Shield, desc: "ACA, self-insurance, plan design, carrier moves" },
  { id: "regulatory", label: "Regulatory & Compliance", icon: Shield, desc: "DOL, IRS, state rules — P&C & group benefits only" },
  { id: "agency_tech", label: "Agency Technology", icon: Cpu, desc: "AMS, APIs, AI tools for independent brokers" },
  { id: "ma_activity", label: "M&A & Consolidation", icon: TrendingUp, desc: "Agency acquisitions, PE rollups, carrier mergers" },
];
const SURFACE_OPTIONS = [
  { id: "competitor_intel", label: "Competitor Intel" },
  { id: "market_conditions", label: "Market Conditions" },
  { id: "regulatory_updates", label: "Regulatory Updates" },
  { id: "technology_trends", label: "Technology Trends" },
  { id: "ma_news", label: "M&A News" },
  { id: "carrier_updates", label: "Carrier Appetite" },
];
const TIME_SLOTS = [
  "06:00","07:00","08:00","09:00","10:00","11:00",
  "12:00","13:00","14:00","15:00","16:00","17:00",
  "18:00","19:00","20:00",
];
const TAG_COLORS: Record<string, string> = {
  Competitors: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  Market: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  Regulatory: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  Technology: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  M: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  Benefits: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  Compliance: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  Cyber: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
};
function tagColor(tag: string) {
  for (const [k, v] of Object.entries(TAG_COLORS)) {
    if (tag.startsWith(k)) return v;
  }
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
}

// ── Main page ─────────────────────────────────────────────────────────────────
function getInitialCollapsedSections(): Record<string, boolean> {
  const defaults: Record<string, boolean> = { intel: true, hygiene: true, sequence: true, email: true };
  try {
    const stored = localStorage.getItem("crm-automation-collapsed-sections");
    if (stored) return JSON.parse(stored) as Record<string, boolean>;
  } catch {}
  return defaults;
}

function getInitialIntelTab(): "configure" | "results" {
  try {
    const stored = localStorage.getItem("crm-automation-intel-tab");
    if (stored === "configure" || stored === "results") return stored;
  } catch {}
  return "configure";
}

export function AutomationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const getToken = useSessionToken();

  async function apiFetch(path: string, opts?: RequestInit) {
    const token = await getToken();
    const res = await fetch(`/api${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error((body.error as string) || res.statusText);
    }
    return res.json();
  }

  // ── Jobs list (poll when running) ─────────────────────────────────────────
  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ["automation-jobs"],
    queryFn: () => apiFetch("/automations/jobs"),
    refetchInterval: (q) => {
      const data = q.state.data ?? [];
      return data.some((j) => j.status === "running" || j.status === "pending") ? 4000 : 30000;
    },
  });

  const triggerJob = useMutation({
    mutationFn: (body: { type: string; payload?: Record<string, unknown> }) =>
      apiFetch("/automations/jobs", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation-jobs"] });
      qc.invalidateQueries({ queryKey: ["industry-intel-results"] });
    },
    onError: (err: Error) =>
      toast({ title: "Job failed", description: err.message, variant: "destructive" }),
  });

  // ── Data Hygiene ──────────────────────────────────────────────────────────
  const [contactDupOpen, setContactDupOpen] = useState(false);
  const [companyDupOpen, setCompanyDupOpen] = useState(false);

  // ── AI Sequence Draft ─────────────────────────────────────────────────────
  const [draftGoal, setDraftGoal] = useState("");
  const [draftTone, setDraftTone] = useState("Professional");
  const [draftSteps, setDraftSteps] = useState(3);
  const [draftContext, setDraftContext] = useState("");
  const [draftResult, setDraftResult] = useState<SequenceDraftResult | null>(null);
  const [draftExpanded, setDraftExpanded] = useState<number | null>(null);

  const lastDraftJob = jobs.find((j) => j.type === "ai_sequence_draft");
  const isRunning = triggerJob.isPending;

  async function generateDraft() {
    setDraftResult(null);
    const job = await triggerJob.mutateAsync({
      type: "ai_sequence_draft",
      payload: { goal: draftGoal, tone: draftTone, numSteps: draftSteps, context: draftContext },
    });
    if (job.result) setDraftResult(job.result as SequenceDraftResult);
  }

  // ── Email Analysis Config ─────────────────────────────────────────────────
  const { data: emailConfig } = useQuery<EmailAnalysisConfig>({
    queryKey: ["email-analysis-config"],
    queryFn: () => apiFetch("/automations/email-analysis-config"),
  });
  const [localEmailConfig, setLocalEmailConfig] = useState<EmailAnalysisConfig | null>(null);
  const activeEmailConfig = localEmailConfig ?? emailConfig;

  const saveEmailConfig = useMutation({
    mutationFn: (cfg: EmailAnalysisConfig) =>
      apiFetch("/automations/email-analysis-config", { method: "PATCH", body: JSON.stringify(cfg) }),
    onSuccess: (updated) => {
      qc.setQueryData(["email-analysis-config"], updated);
      setLocalEmailConfig(null);
      toast({ title: "Email analysis configuration saved" });
    },
    onError: (err: Error) => toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  function updateEmailConfig(patch: Partial<EmailAnalysisConfig>) {
    setLocalEmailConfig((prev) => ({ ...(prev ?? emailConfig!), ...patch }));
  }
  function toggleInsightType(id: string) {
    const current = activeEmailConfig?.insightTypes ?? [];
    updateEmailConfig({ insightTypes: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] });
  }
  const [emailTopicInput, setEmailTopicInput] = useState("");
  function addEmailTopic() {
    const val = emailTopicInput.trim();
    if (!val || activeEmailConfig?.focusTopics.includes(val)) { setEmailTopicInput(""); return; }
    updateEmailConfig({ focusTopics: [...(activeEmailConfig?.focusTopics ?? []), val] });
    setEmailTopicInput("");
  }

  // ── Industry Intelligence ─────────────────────────────────────────────────
  const [intelTab, setIntelTab] = useState<"configure" | "results">(getInitialIntelTab);

  useEffect(() => {
    try {
      localStorage.setItem("crm-automation-intel-tab", intelTab);
    } catch {}
  }, [intelTab]);

  const { data: intelConfig, isLoading: intelConfigLoading } = useQuery<IntelConfig>({
    queryKey: ["industry-intel-config"],
    queryFn: () => apiFetch("/automations/industry-intel-config"),
  });
  const [localIntelConfig, setLocalIntelConfig] = useState<IntelConfig | null>(null);
  const activeIntelConfig = localIntelConfig ?? intelConfig;
  const intelConfigDirty = localIntelConfig !== null;

  const saveIntelConfig = useMutation({
    mutationFn: (cfg: IntelConfig) =>
      apiFetch("/automations/industry-intel-config", { method: "PATCH", body: JSON.stringify(cfg) }),
    onSuccess: (updated) => {
      qc.setQueryData(["industry-intel-config"], updated);
      setLocalIntelConfig(null);
      toast({ title: "Intelligence configuration saved" });
    },
    onError: (err: Error) => toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  function updateIntelConfig(patch: Partial<IntelConfig>) {
    setLocalIntelConfig((prev) => ({ ...(prev ?? intelConfig!), ...patch }));
  }
  function toggleTopic(id: string) {
    const cur = activeIntelConfig?.activeTopics ?? [];
    updateIntelConfig({ activeTopics: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  }
  function toggleSurface(id: string) {
    const cur = activeIntelConfig?.surfaceTypes ?? [];
    updateIntelConfig({ surfaceTypes: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  }

  const [competitorInput, setCompetitorInput] = useState("");
  function addCompetitor() {
    const val = competitorInput.trim();
    if (!val || activeIntelConfig?.competitors.includes(val)) { setCompetitorInput(""); return; }
    updateIntelConfig({ competitors: [...(activeIntelConfig?.competitors ?? []), val] });
    setCompetitorInput("");
  }
  function removeCompetitor(c: string) {
    updateIntelConfig({
      competitors: (activeIntelConfig?.competitors ?? []).filter((x) => x !== c),
      highPriorityCompetitors: (activeIntelConfig?.highPriorityCompetitors ?? []).filter((x) => x !== c),
    });
  }
  function toggleHighPriority(c: string) {
    const cur = activeIntelConfig?.highPriorityCompetitors ?? [];
    updateIntelConfig({
      highPriorityCompetitors: cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c],
    });
  }

  const [customTopicInput, setCustomTopicInput] = useState("");
  function addCustomTopic() {
    const val = customTopicInput.trim();
    if (!val || activeIntelConfig?.customTopics.includes(val)) { setCustomTopicInput(""); return; }
    updateIntelConfig({ customTopics: [...(activeIntelConfig?.customTopics ?? []), val] });
    setCustomTopicInput("");
  }

  function toggleScheduleSlot(slot: string) {
    const cur = activeIntelConfig?.schedule ?? [];
    if (cur.includes(slot)) {
      updateIntelConfig({ schedule: cur.filter((s) => s !== slot) });
    } else if (cur.length < 3) {
      updateIntelConfig({ schedule: [...cur, slot].sort() });
    } else {
      toast({ title: "Max 3 run times per day", description: "Remove a time slot before adding another.", variant: "destructive" });
    }
  }

  const { data: intelStatus, isLoading: intelStatusLoading } = useQuery<IntelStatus>({
    queryKey: ["industry-intel-results"],
    queryFn: () => apiFetch("/automations/industry-intel-results"),
    refetchInterval: 60_000,
  });

  const lastIntelJob = jobs.find((j) => j.type === "industry_intel_refresh");
  const intelRunning = triggerJob.isPending && lastIntelJob?.status === "running";

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(getInitialCollapsedSections);
  const toggleSection = (id: string) => setCollapsedSections(p => ({ ...p, [id]: !p[id] }));

  useEffect(() => {
    try {
      localStorage.setItem("crm-automation-collapsed-sections", JSON.stringify(collapsedSections));
    } catch {}
  }, [collapsedSections]);

  async function runIntelNow() {
    // Save dirty config first
    if (intelConfigDirty && activeIntelConfig) {
      await saveIntelConfig.mutateAsync(activeIntelConfig);
    }
    try {
      await triggerJob.mutateAsync({ type: "industry_intel_refresh" });
      setIntelTab("results");
      toast({ title: "Intelligence refresh complete", description: "Results updated." });
    } catch {
      // error handled by triggerJob.onError
    }
  }

  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-4xl">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Automations</h1>
            <p className="text-sm text-muted-foreground">Run background jobs, clean up data, and let AI do the heavy lifting.</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">

          {/* ── Industry Intelligence ── full width ─────────────────────── */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-0">
              <div className="flex items-start gap-3 mb-3 cursor-pointer select-none" onClick={() => toggleSection('intel')}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/30">
                  <Globe className="text-indigo-500" style={{ height: "1.125rem", width: "1.125rem" }} />
                </div>
                <div className="flex-1 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Industry Intelligence</p>
                    <p className="text-xs text-muted-foreground">AI-researched P&C & group benefits intelligence — configurable topics, competitor tracking, and scheduled runs</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">AI-powered</Badge>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !collapsedSections['intel'] && "-rotate-180")} />
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className={cn("flex gap-1 border-b", collapsedSections['intel'] && "hidden")}>
                {(["configure", "results"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setIntelTab(tab)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors capitalize",
                      intelTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab === "configure" ? <Cpu className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                    {tab}
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent className={cn("pt-4 space-y-0", collapsedSections['intel'] && "hidden")}>
              {intelTab === "configure" && (
                <div className="space-y-5">
                  {intelConfigLoading ? (
                    <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}</div>
                  ) : activeIntelConfig && (
                    <>
                      {/* Research topics */}
                      <div>
                        <p className="text-xs font-semibold mb-2">Research topics</p>
                        <div className="grid sm:grid-cols-2 gap-2">
                          {PRESET_TOPICS.map((t) => {
                            const active = activeIntelConfig.activeTopics.includes(t.id);
                            return (
                              <button
                                key={t.id}
                                onClick={() => toggleTopic(t.id)}
                                className={cn(
                                  "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                                  active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/50",
                                )}
                              >
                                <div className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                                  active ? "bg-primary border-primary" : "border-muted-foreground/40",
                                )}>
                                  {active && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                </div>
                                <div>
                                  <p className="text-xs font-medium">{t.label}</p>
                                  <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Competitor tracking */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold">Insurtech competitors to track</p>
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                            <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                            High priority = deeper AI research
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mb-2">
                          The AI researches all competitors. Star <Star className="inline h-2.5 w-2.5 fill-amber-400 text-amber-400" /> a competitor to make the AI go deeper — dedicated items, product moves, and Ennabl win/loss analysis.
                        </p>
                        <div className="flex flex-wrap gap-1.5 mb-2.5">
                          {activeIntelConfig.competitors.map((c) => {
                            const isHigh = (activeIntelConfig.highPriorityCompetitors ?? []).includes(c);
                            return (
                              <span key={c} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                                isHigh
                                  ? "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-700"
                                  : "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300"
                              }`}>
                                <button
                                  onClick={() => toggleHighPriority(c)}
                                  title={isHigh ? "Remove high-priority" : "Mark as high-priority"}
                                  className="flex items-center justify-center rounded-full transition-colors hover:scale-110"
                                >
                                  <Star className={`h-2.5 w-2.5 ${isHigh ? "fill-amber-500 text-amber-500" : "text-red-300 dark:text-red-600 hover:text-amber-400"}`} />
                                </button>
                                {c}
                                <button
                                  onClick={() => removeCompetitor(c)}
                                  className={`flex h-3.5 w-3.5 items-center justify-center rounded-full transition-colors ${
                                    isHigh ? "hover:bg-amber-200 dark:hover:bg-amber-900/40" : "hover:bg-red-200 dark:hover:bg-red-900/40"
                                  }`}
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                        <div className="flex gap-2">
                          <Input value={competitorInput} onChange={(e) => setCompetitorInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addCompetitor()}
                            placeholder="Add competitor (e.g. Relay Platform)…" className="text-xs h-8 flex-1" />
                          <Button size="sm" variant="outline" onClick={addCompetitor} disabled={!competitorInput.trim()} className="h-8 gap-1 text-xs">
                            <Plus className="h-3 w-3" />Add
                          </Button>
                        </div>
                      </div>

                      {/* Custom topics */}
                      <div>
                        <p className="text-xs font-semibold mb-1">Custom research topics</p>
                        <p className="text-[11px] text-muted-foreground mb-2">Add any specific topic, company, or trend you want researched.</p>
                        {activeIntelConfig.customTopics.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2.5">
                            {activeIntelConfig.customTopics.map((t) => (
                              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                                {t}
                                <button onClick={() => updateIntelConfig({ customTopics: activeIntelConfig.customTopics.filter((x) => x !== t) })}
                                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-primary/20 transition-colors">
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Input value={customTopicInput} onChange={(e) => setCustomTopicInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addCustomTopic()}
                            placeholder="e.g. Workers' comp rate changes in California…" className="text-xs h-8 flex-1" />
                          <Button size="sm" variant="outline" onClick={addCustomTopic} disabled={!customTopicInput.trim()} className="h-8 gap-1 text-xs">
                            <Plus className="h-3 w-3" />Add
                          </Button>
                        </div>
                      </div>

                      {/* What to surface */}
                      <div>
                        <p className="text-xs font-semibold mb-2">What to surface</p>
                        <div className="flex flex-wrap gap-2">
                          {SURFACE_OPTIONS.map((opt) => {
                            const active = activeIntelConfig.surfaceTypes.includes(opt.id);
                            return (
                              <button
                                key={opt.id}
                                onClick={() => toggleSurface(opt.id)}
                                className={cn(
                                  "rounded-full border px-3 py-1 text-[11px] font-medium transition-all",
                                  active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50 text-muted-foreground",
                                )}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Schedule */}
                      <div>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-xs font-semibold">Run schedule</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Select up to 3 preferred run times per day. Use "Run now" on the Results tab to trigger manually.</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {(activeIntelConfig.schedule ?? []).length}/3 slots
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {TIME_SLOTS.map((slot) => {
                            const isSelected = (activeIntelConfig.schedule ?? []).includes(slot);
                            const h = parseInt(slot.split(":")[0], 10);
                            const label = h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
                            return (
                              <button
                                key={slot}
                                onClick={() => toggleScheduleSlot(slot)}
                                className={cn(
                                  "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all",
                                  isSelected ? "bg-primary text-primary-foreground border-primary ring-1 ring-primary/30" : "hover:bg-muted/50 text-muted-foreground",
                                )}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Save / Run now */}
                      <div className="flex items-center gap-3 pt-1 border-t">
                        <Button
                          size="sm"
                          onClick={() => saveIntelConfig.mutate(activeIntelConfig!)}
                          disabled={!intelConfigDirty || saveIntelConfig.isPending}
                          className="gap-2"
                        >
                          {saveIntelConfig.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Save configuration
                        </Button>
                        {intelConfigDirty && (
                          <button onClick={() => setLocalIntelConfig(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Discard</button>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={runIntelNow}
                            disabled={triggerJob.isPending || (intelStatus?.runsRemaining ?? 1) === 0}
                            className="gap-2"
                          >
                            {triggerJob.isPending
                              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Running…</>
                              : <><RefreshCw className="h-3.5 w-3.5" />Run now</>}
                          </Button>
                          {intelStatus && (
                            <span className="text-[10px] text-muted-foreground">
                              {intelStatus.runsRemaining}/{intelStatus.maxRunsPerDay} runs left today
                            </span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {intelTab === "results" && (
                <div className="space-y-4">
                  {/* Run controls */}
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      onClick={runIntelNow}
                      disabled={triggerJob.isPending || (intelStatus?.runsRemaining ?? 1) === 0}
                      className="gap-2"
                    >
                      {triggerJob.isPending
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Researching…</>
                        : <><RefreshCw className="h-3.5 w-3.5" />Run now</>}
                    </Button>
                    {intelStatusLoading ? (
                      <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    ) : intelStatus && (
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>
                          <span className={cn("font-semibold", intelStatus.runsRemaining === 0 ? "text-destructive" : "text-foreground")}>
                            {intelStatus.runsRemaining}
                          </span>/{intelStatus.maxRunsPerDay} runs remaining today
                        </span>
                        {intelStatus.results && (
                          <span>· Last run: {relativeTime(intelStatus.results.generatedAt)}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Results or empty state */}
                  {intelStatusLoading ? (
                    <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
                  ) : intelStatus?.results ? (
                    <div className="divide-y border rounded-xl overflow-hidden">
                      {(intelStatus.results.items ?? []).map((item, i) => (
                        <div key={i} className="px-4 py-3">
                          <div className="flex items-start gap-2 mb-1">
                            <p className="flex-1 text-xs font-semibold leading-snug">{item.headline}</p>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5", tagColor(item.tag))}>
                                {item.tag}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">{item.date}</span>
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">{item.summary}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-1">{item.section}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <Globe className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">No results yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Configure your topics, then click "Run now" to generate your first intelligence briefing.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Data Hygiene */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => toggleSection('hygiene')}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/30">
                  <Merge className="text-orange-500" style={{ height: "1.125rem", width: "1.125rem" }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Data Hygiene</p>
                  <p className="text-xs text-muted-foreground">Find and merge duplicate contacts & companies</p>
                </div>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", !collapsedSections['hygiene'] && "-rotate-180")} />
              </div>
            </CardHeader>
            <CardContent className={cn("space-y-3", collapsedSections['hygiene'] && "hidden")}>
              <p className="text-xs text-muted-foreground">Scans for records with matching emails, names, or domains and lets you merge them — preserving all notes, deals, and activity history.</p>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={() => setContactDupOpen(true)}>
                  <Users className="h-3.5 w-3.5" />Scan Contacts
                </Button>
                <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={() => setCompanyDupOpen(true)}>
                  <Building2 className="h-3.5 w-3.5" />Scan Companies
                </Button>
              </div>
            </CardContent>
          </Card>


          {/* AI Sequence Draft */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => toggleSection('sequence')}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950/30">
                  <Sparkles className="text-purple-500" style={{ height: "1.125rem", width: "1.125rem" }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">AI Sequence Draft Generation</p>
                  <p className="text-xs text-muted-foreground">Let AI write a complete multi-step outreach sequence — review, tweak, and save it</p>
                </div>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", !collapsedSections['sequence'] && "-rotate-180")} />
              </div>
            </CardHeader>
            <CardContent className={cn("space-y-4", collapsedSections['sequence'] && "hidden")}>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Sequence goal <span className="text-destructive">*</span></label>
                  <Textarea placeholder="e.g. Warm up mid-market CFOs at independent agencies ahead of renewal season — goal is a 20-min discovery call"
                    value={draftGoal} onChange={(e) => setDraftGoal(e.target.value)} rows={2} className="text-sm resize-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Tone</label>
                  <select value={draftTone} onChange={(e) => setDraftTone(e.target.value)} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                    {["Professional", "Friendly", "Direct", "Consultative", "Urgent"].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Number of steps</label>
                  <select value={draftSteps} onChange={(e) => setDraftSteps(Number(e.target.value))} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                    {[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} emails</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Additional context <span className="text-muted-foreground/60">(optional)</span></label>
                  <Input placeholder="e.g. Audience are insurance brokers at agencies with 50-200 employees." value={draftContext} onChange={(e) => setDraftContext(e.target.value)} className="text-sm" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={generateDraft} disabled={!draftGoal.trim() || isRunning} className="gap-2">
                  {isRunning ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</> : <><Play className="h-3.5 w-3.5" />Generate sequence</>}
                </Button>
                {lastDraftJob && (
                  <span className="text-xs text-muted-foreground">Last run: {relativeTime(lastDraftJob.createdAt)} · <StatusBadge status={lastDraftJob.status} /></span>
                )}
              </div>
              {draftResult && (
                <div className="mt-2 border rounded-xl overflow-hidden">
                  <div className="bg-muted/40 px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold">{draftResult.name}</p>
                      <p className="text-[11px] text-muted-foreground">{draftResult.steps.length} steps · review and save to Sequences</p>
                    </div>
                    <Link href="/sequences">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">Open Sequences <ArrowRight className="h-3 w-3" /></Button>
                    </Link>
                  </div>
                  <div className="divide-y">
                    {draftResult.steps.map((step, i) => (
                      <div key={i}>
                        <button className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                          onClick={() => setDraftExpanded(draftExpanded === i ? null : i)}>
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{step.subject}</p>
                            <p className="text-[11px] text-muted-foreground">{i === 0 ? "Send immediately" : `+${step.delayDays} day${step.delayDays !== 1 ? "s" : ""}`}</p>
                          </div>
                          {draftExpanded === i ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        </button>
                        {draftExpanded === i && (
                          <div className="px-12 pb-3 pt-1">
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{step.body}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Email Summarization */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3 cursor-pointer select-none" onClick={() => toggleSection('email')}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/30">
                  <Mail className="text-red-500" style={{ height: "1.125rem", width: "1.125rem" }} />
                </div>
                <div className="flex-1 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">AI Email Summarization</p>
                    <p className="text-xs text-muted-foreground">Configure how the AI agent analyses your inbox</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-[10px]">Gmail required</Badge>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !collapsedSections['email'] && "-rotate-180")} />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cn("space-y-5", collapsedSections['email'] && "hidden")}>
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 border">
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="text-[11px] text-muted-foreground">
                  Connect Gmail in{" "}
                  <Link href="/settings/integrations" className="underline hover:no-underline">Settings → Integrations</Link>{" "}
                  to enable live analysis. You can pre-configure what to analyse below.
                </p>
              </div>
              {activeEmailConfig && (
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-semibold mb-2">Analysis depth</p>
                    <div className="grid grid-cols-3 gap-2">
                      {DEPTH_OPTIONS.map((opt) => (
                        <button key={opt.value} onClick={() => updateEmailConfig({ analysisDepth: opt.value })}
                          className={cn("flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                            activeEmailConfig.analysisDepth === opt.value ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/50",
                          )}>
                          <span className="text-xs font-semibold">{opt.label}</span>
                          <span className="text-[10px] text-muted-foreground leading-snug">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-2">What to surface</p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {INSIGHT_TYPE_OPTIONS.map((opt) => {
                        const active = activeEmailConfig.insightTypes.includes(opt.id);
                        return (
                          <button key={opt.id} onClick={() => toggleInsightType(opt.id)}
                            className={cn("flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                              active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/50",
                            )}>
                            <div className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                              active ? "bg-primary border-primary" : "border-muted-foreground/40",
                            )}>
                              {active && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            </div>
                            <div>
                              <p className="text-xs font-medium">{opt.label}</p>
                              <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1.5">Focus topics</p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {activeEmailConfig.focusTopics.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                          {t}
                          <button onClick={() => updateEmailConfig({ focusTopics: activeEmailConfig.focusTopics.filter((x) => x !== t) })}
                            className="flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-primary/20 transition-colors">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input value={emailTopicInput} onChange={(e) => setEmailTopicInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addEmailTopic()}
                        placeholder="Add a topic (e.g. renewal risk, budget objections)…" className="text-xs h-8 flex-1" />
                      <Button size="sm" variant="outline" onClick={addEmailTopic} disabled={!emailTopicInput.trim()} className="h-8 gap-1 text-xs">
                        <Plus className="h-3 w-3" />Add
                      </Button>
                    </div>
                  </div>
                  {localEmailConfig !== null && (
                    <div className="flex items-center gap-3 pt-1">
                      <Button size="sm" onClick={() => saveEmailConfig.mutate(localEmailConfig!)} disabled={saveEmailConfig.isPending} className="gap-2">
                        {saveEmailConfig.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save configuration
                      </Button>
                      <button onClick={() => setLocalEmailConfig(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Discard</button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Job history ──────────────────────────────────────────────────── */}
        {jobs.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Recent Jobs</h2>
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 border-b">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Job</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Run by</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Started</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {jobs.map((job) => {
                    const duration = job.completedAt && job.startedAt
                      ? Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000) : null;
                    return (
                      <tr key={job.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{job.label ?? JOB_TYPE_LABELS[job.type] ?? job.type}</p>
                          {job.error && <p className="text-[11px] text-destructive mt-0.5 truncate max-w-xs">{job.error}</p>}
                        </td>
                        <td className="px-4 py-2.5"><StatusBadge status={job.status} /></td>
                        <td className="px-4 py-2.5 text-muted-foreground">{job.creatorName ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{relativeTime(job.createdAt)}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {duration != null ? `${duration}s` : job.status === "running" ? "…" : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ContactDuplicatesDialog open={contactDupOpen} onOpenChange={setContactDupOpen} />
      <CompanyDuplicatesDialog open={companyDupOpen} onOpenChange={setCompanyDupOpen} />
    </SidebarLayout>
  );
}
