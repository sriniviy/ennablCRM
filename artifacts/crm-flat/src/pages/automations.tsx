import { useState } from "react";
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
  AlertCircle, Building2, Users, Plus, X, Save,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type JobStatus = "pending" | "running" | "completed" | "failed";
type Job = {
  id: string;
  type: string;
  label: string | null;
  status: JobStatus;
  progress: number;
  result: unknown;
  error: string | null;
  createdBy: string | null;
  creatorName: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

type SequenceDraftResult = {
  name: string;
  steps: { subject: string; body: string; delayDays: number }[];
};

type EmailAnalysisConfig = {
  enabled: boolean;
  analysisDepth: "short" | "mid" | "deep";
  focusTopics: string[];
  insightTypes: string[];
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
  ai_sequence_draft: "AI Sequence Draft",
  data_hygiene: "Data Hygiene",
  ai_email_summary: "AI Email Summarization",
  csv_import: "CSV Import",
};

// ── Insight type options ──────────────────────────────────────────────────────
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

// ── Main page ─────────────────────────────────────────────────────────────────
export function AutomationsPage() {
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
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error((body.error as string) || res.statusText);
    }
    return res.json();
  }

  // Jobs list — poll every 4s when any job is running
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-jobs"] }),
    onError: (err: Error) =>
      toast({ title: "Job failed", description: err.message, variant: "destructive" }),
  });

  // ── Data Hygiene state ────────────────────────────────────────────────────
  const [contactDupOpen, setContactDupOpen] = useState(false);
  const [companyDupOpen, setCompanyDupOpen] = useState(false);

  // ── AI Sequence Draft state ───────────────────────────────────────────────
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

  // ── Email analysis config ─────────────────────────────────────────────────
  const { data: emailConfig, isLoading: configLoading } = useQuery<EmailAnalysisConfig>({
    queryKey: ["email-analysis-config"],
    queryFn: () => apiFetch("/automations/email-analysis-config"),
  });

  const [localConfig, setLocalConfig] = useState<EmailAnalysisConfig | null>(null);
  const activeConfig = localConfig ?? emailConfig;

  const saveConfig = useMutation({
    mutationFn: (cfg: EmailAnalysisConfig) =>
      apiFetch("/automations/email-analysis-config", {
        method: "PATCH",
        body: JSON.stringify(cfg),
      }),
    onSuccess: (updated) => {
      qc.setQueryData(["email-analysis-config"], updated);
      setLocalConfig(null);
      toast({ title: "Configuration saved" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  function updateConfig(patch: Partial<EmailAnalysisConfig>) {
    setLocalConfig((prev) => ({ ...(prev ?? emailConfig!), ...patch }));
  }

  function toggleInsightType(id: string) {
    const current = activeConfig?.insightTypes ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    updateConfig({ insightTypes: next });
  }

  // Topic chip input
  const [topicInput, setTopicInput] = useState("");

  function addTopic() {
    const val = topicInput.trim();
    if (!val || activeConfig?.focusTopics.includes(val)) { setTopicInput(""); return; }
    updateConfig({ focusTopics: [...(activeConfig?.focusTopics ?? []), val] });
    setTopicInput("");
  }

  function removeTopic(t: string) {
    updateConfig({ focusTopics: (activeConfig?.focusTopics ?? []).filter((x) => x !== t) });
  }

  const configDirty = localConfig !== null;

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
            <p className="text-sm text-muted-foreground">
              Run background jobs, clean up data, and let AI do the heavy lifting.
            </p>
          </div>
        </div>

        {/* ── Cards grid ──────────────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-2">

          {/* Data Hygiene */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/30">
                  <Merge className="text-orange-500" style={{ height: "1.125rem", width: "1.125rem" }} />
                </div>
                <div>
                  <p className="text-sm font-semibold">Data Hygiene</p>
                  <p className="text-xs text-muted-foreground">Find and merge duplicate contacts & companies</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Scans for records with matching emails, names, or domains and lets you merge them — preserving all notes, deals, and activity history.
              </p>
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

          {/* Bulk CSV Import */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/30">
                  <FileUp className="text-blue-500" style={{ height: "1.125rem", width: "1.125rem" }} />
                </div>
                <div>
                  <p className="text-sm font-semibold">Bulk CSV Import</p>
                  <p className="text-xs text-muted-foreground">Import large contact & company datasets</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Import contacts and companies from HubSpot exports or custom CSV files. Field mapping, duplicate detection, and error reporting included.
              </p>
              <Link href="/settings/import">
                <Button size="sm" variant="outline" className="gap-2 text-xs">
                  <ArrowRight className="h-3.5 w-3.5" />Go to Import
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* AI Sequence Draft — full width */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950/30">
                  <Sparkles className="text-purple-500" style={{ height: "1.125rem", width: "1.125rem" }} />
                </div>
                <div>
                  <p className="text-sm font-semibold">AI Sequence Draft Generation</p>
                  <p className="text-xs text-muted-foreground">Let AI write a complete multi-step outreach sequence — review, tweak, and save it</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Sequence goal <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    placeholder="e.g. Warm up mid-market CFOs at independent agencies ahead of renewal season — goal is a 20-min discovery call"
                    value={draftGoal}
                    onChange={(e) => setDraftGoal(e.target.value)}
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Tone</label>
                  <select
                    value={draftTone}
                    onChange={(e) => setDraftTone(e.target.value)}
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    {["Professional", "Friendly", "Direct", "Consultative", "Urgent"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Number of steps</label>
                  <select
                    value={draftSteps}
                    onChange={(e) => setDraftSteps(Number(e.target.value))}
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    {[2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={n}>{n} emails</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Additional context <span className="text-muted-foreground/60">(optional)</span>
                  </label>
                  <Input
                    placeholder="e.g. Audience are insurance brokers at agencies with 50-200 employees. Focus on retention risk analytics."
                    value={draftContext}
                    onChange={(e) => setDraftContext(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button size="sm" onClick={generateDraft} disabled={!draftGoal.trim() || isRunning} className="gap-2">
                  {isRunning
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</>
                    : <><Play className="h-3.5 w-3.5" />Generate sequence</>}
                </Button>
                {lastDraftJob && (
                  <span className="text-xs text-muted-foreground">
                    Last run: {relativeTime(lastDraftJob.createdAt)} · <StatusBadge status={lastDraftJob.status} />
                  </span>
                )}
              </div>

              {/* Result preview */}
              {draftResult && (
                <div className="mt-2 border rounded-xl overflow-hidden">
                  <div className="bg-muted/40 px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold">{draftResult.name}</p>
                      <p className="text-[11px] text-muted-foreground">{draftResult.steps.length} steps · review and save to Sequences</p>
                    </div>
                    <Link href="/sequences">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                        Open Sequences <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                  <div className="divide-y">
                    {draftResult.steps.map((step, i) => (
                      <div key={i}>
                        <button
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                          onClick={() => setDraftExpanded(draftExpanded === i ? null : i)}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{step.subject}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {i === 0 ? "Send immediately" : `+${step.delayDays} day${step.delayDays !== 1 ? "s" : ""}`}
                            </p>
                          </div>
                          {draftExpanded === i
                            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
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

          {/* AI Email Summarization — full width, configurable */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/30">
                  <Mail className="text-red-500" style={{ height: "1.125rem", width: "1.125rem" }} />
                </div>
                <div className="flex-1 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">AI Email Summarization</p>
                    <p className="text-xs text-muted-foreground">Configure how the AI agent analyses your inbox</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">Gmail required</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Gmail notice */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 border">
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="text-[11px] text-muted-foreground">
                  Connect Gmail in{" "}
                  <Link href="/settings/integrations" className="underline hover:no-underline">Settings → Integrations</Link>{" "}
                  to enable live analysis. You can pre-configure what to analyse below.
                </p>
              </div>

              {configLoading ? (
                <div className="space-y-3">
                  <div className="h-8 bg-muted animate-pulse rounded-lg" />
                  <div className="h-20 bg-muted animate-pulse rounded-lg" />
                </div>
              ) : activeConfig && (
                <div className="space-y-5">

                  {/* Analysis depth */}
                  <div>
                    <p className="text-xs font-semibold mb-2">Analysis depth</p>
                    <div className="grid grid-cols-3 gap-2">
                      {DEPTH_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => updateConfig({ analysisDepth: opt.value })}
                          className={cn(
                            "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                            activeConfig.analysisDepth === opt.value
                              ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                              : "hover:bg-muted/50",
                          )}
                        >
                          <span className="text-xs font-semibold">{opt.label}</span>
                          <span className="text-[10px] text-muted-foreground leading-snug">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Insight types */}
                  <div>
                    <p className="text-xs font-semibold mb-2">What to surface</p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {INSIGHT_TYPE_OPTIONS.map((opt) => {
                        const active = activeConfig.insightTypes.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            onClick={() => toggleInsightType(opt.id)}
                            className={cn(
                              "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                              active
                                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                                : "hover:bg-muted/50",
                            )}
                          >
                            <div className={cn(
                              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                              active ? "bg-primary border-primary" : "border-muted-foreground/40",
                            )}>
                              {active && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
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

                  {/* Focus topics */}
                  <div>
                    <p className="text-xs font-semibold mb-1.5">Focus topics</p>
                    <p className="text-[11px] text-muted-foreground mb-2.5">
                      The AI will pay special attention to these subjects when it scans your emails.
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {activeConfig.focusTopics.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                        >
                          {t}
                          <button
                            onClick={() => removeTopic(t)}
                            className="flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-primary/20 transition-colors"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={topicInput}
                        onChange={(e) => setTopicInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addTopic()}
                        placeholder="Add a topic (e.g. renewal risk, budget objections)…"
                        className="text-xs h-8 flex-1"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={addTopic}
                        disabled={!topicInput.trim()}
                        className="h-8 gap-1 text-xs"
                      >
                        <Plus className="h-3 w-3" />Add
                      </Button>
                    </div>
                  </div>

                  {/* Save button */}
                  {configDirty && (
                    <div className="flex items-center gap-3 pt-1">
                      <Button
                        size="sm"
                        onClick={() => saveConfig.mutate(localConfig!)}
                        disabled={saveConfig.isPending}
                        className="gap-2"
                      >
                        {saveConfig.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save configuration
                      </Button>
                      <button
                        onClick={() => setLocalConfig(null)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Discard
                      </button>
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
                    const duration =
                      job.completedAt && job.startedAt
                        ? Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)
                        : null;
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

      {/* Merge dialogs */}
      <ContactDuplicatesDialog open={contactDupOpen} onOpenChange={setContactDupOpen} />
      <CompanyDuplicatesDialog open={companyDupOpen} onOpenChange={setCompanyDupOpen} />
    </SidebarLayout>
  );
}
