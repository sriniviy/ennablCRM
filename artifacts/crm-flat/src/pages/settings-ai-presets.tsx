import { useState } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import {
  Sparkles, Pencil, Globe, Lock, Trash2, Plus, Mail, FileText,
  BarChart2, Check, X, ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useSessionToken } from "@/hooks/use-session-token";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

/* ── Types ──────────────────────────────────────────────────── */

interface AiPreset {
  id: string;
  userId: string;
  name: string;
  category: string | null;
  goal: string;
  tone: string;
  improveFields: string;
  context: string[];
  shared: boolean;
  createdAt: string;
  creatorName: string | null;
  creatorEmail: string | null;
}

interface PresetForm {
  name: string;
  category: string;
  goal: string;
  tone: string;
  improveFields: string;
  context: string[];
  shared: boolean;
}

/* ── Constants ──────────────────────────────────────────────── */

const CONTEXT_OPTIONS = [
  { value: "email", label: "Email", icon: Mail, color: "text-blue-600" },
  { value: "note", label: "Notes", icon: FileText, color: "text-amber-600" },
  { value: "summary", label: "Summary", icon: BarChart2, color: "text-purple-600" },
] as const;

type ContextValue = "email" | "note" | "summary";

const TONE_OPTIONS = [
  "Professional", "Friendly", "Concise", "Empathetic", "Persuasive", "Formal",
];

const IMPROVE_OPTIONS = [
  { value: "subject", label: "Subject line only" },
  { value: "body", label: "Email body only" },
  { value: "both", label: "Subject + body" },
];

const IMPROVE_LABELS: Record<string, string> = {
  subject: "Subject",
  body: "Body",
  both: "Subject + body",
};

const EMPTY_FORM: PresetForm = {
  name: "", category: "", goal: "", tone: "Professional",
  improveFields: "both", context: ["email"], shared: true,
};

/* ── Context badge ──────────────────────────────────────────── */

function ContextBadge({ ctx }: { ctx: string }) {
  const opt = CONTEXT_OPTIONS.find((o) => o.value === ctx);
  if (!opt) return null;
  const Icon = opt.icon;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded border ${opt.color} border-current/20 bg-current/5`}>
      <Icon className="h-2.5 w-2.5" />{opt.label}
    </span>
  );
}

/* ── Preset form dialog ─────────────────────────────────────── */

interface PresetDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: PresetForm;
  title: string;
  isPending: boolean;
  onSubmit: (f: PresetForm) => void;
}

function PresetDialog({ open, onOpenChange, initial, title, isPending, onSubmit }: PresetDialogProps) {
  const [form, setForm] = useState<PresetForm>(initial);
  const set = <K extends keyof PresetForm>(k: K, v: PresetForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleCtx = (val: string) => {
    setForm((f) => {
      const has = f.context.includes(val);
      const next = has ? f.context.filter((c) => c !== val) : [...f.context, val];
      return { ...f, context: next.length === 0 ? [val] : next };
    });
  };

  const hasEmail = form.context.includes("email");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setForm(initial); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />{title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Name + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ap-name">Name <span className="text-destructive">*</span></Label>
              <Input
                id="ap-name"
                placeholder="e.g. Warm renewal follow-up"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
                disabled={isPending}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-cat">Category</Label>
              <Input
                id="ap-cat"
                placeholder="e.g. Renewals, Prospecting"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Goal */}
          <div className="space-y-1.5">
            <Label htmlFor="ap-goal">Goal <span className="text-destructive">*</span></Label>
            <Textarea
              id="ap-goal"
              placeholder="Describe what the AI should accomplish — e.g. 'Re-engage a prospect who went cold after a quote call. Acknowledge the gap, restate value, and suggest a 15-minute check-in.'"
              value={form.goal}
              onChange={(e) => set("goal", e.target.value)}
              rows={3}
              disabled={isPending}
              className="resize-none text-sm"
            />
          </div>

          {/* Tone + Improve fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tone</Label>
              <Select value={form.tone} onValueChange={(v) => set("tone", v)} disabled={isPending}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasEmail && (
              <div className="space-y-1.5">
                <Label>Improve</Label>
                <Select value={form.improveFields} onValueChange={(v) => set("improveFields", v)} disabled={isPending}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPROVE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Context checkboxes */}
          <div className="space-y-2">
            <Label>Used in</Label>
            <div className="flex gap-2 flex-wrap">
              {CONTEXT_OPTIONS.map((opt) => {
                const active = form.context.includes(opt.value);
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleCtx(opt.value)}
                    disabled={isPending}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-muted-foreground/25 text-muted-foreground hover:border-muted-foreground/50"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                    {active && <Check className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Controls where this preset appears — email writers, note composers, or summary panels.
            </p>
          </div>

          {/* Shared toggle */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2">
              {form.shared ? <Globe className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
              <div>
                <p className="text-sm font-medium">
                  {form.shared ? "Shared with team" : "Private to you"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {form.shared ? "Visible to all team members in AI panels" : "Only you can see and use this preset"}
                </p>
              </div>
            </div>
            <Switch checked={form.shared} onCheckedChange={(v) => set("shared", v)} disabled={isPending} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            disabled={isPending || !form.name.trim() || !form.goal.trim()}
            onClick={() => onSubmit(form)}
          >
            {isPending ? "Saving…" : "Save preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main page ──────────────────────────────────────────────── */

export function SettingsAiPresetsPage() {
  const getToken = useSessionToken();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [contextFilter, setContextFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AiPreset | null>(null);

  const authFetch = async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`/api/users${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
    });
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as { error?: string }).error ?? `Error ${res.status}`); }
    return res.json();
  };

  /* ── Queries ── */

  const { data: presets = [], isLoading } = useQuery<AiPreset[]>({
    queryKey: ["admin-ai-presets"],
    queryFn: () => authFetch("/admin/ai-presets"),
    staleTime: 30_000,
  });

  /* ── Mutations ── */

  const createMutation = useMutation({
    mutationFn: (f: PresetForm) =>
      authFetch("/me/ai-presets", {
        method: "POST",
        body: JSON.stringify({
          name: f.name.trim(), category: f.category.trim() || null,
          goal: f.goal.trim(), tone: f.tone,
          improveFields: f.improveFields, context: f.context, shared: f.shared,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ai-presets"] });
      setAddOpen(false);
      toast({ title: "Preset created" });
    },
    onError: (err: Error) => toast({ title: "Failed to create preset", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...patch }: Partial<PresetForm> & { id: string }) =>
      authFetch(`/me/ai-presets/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ai-presets"] });
      setEditTarget(null);
      toast({ title: "Preset updated" });
    },
    onError: (err: Error) => toast({ title: "Failed to update preset", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/me/ai-presets/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-ai-presets"] }); toast({ title: "Preset deleted" }); },
    onError: (err: Error) => toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
  });

  /* ── Derived ── */

  const filtered = contextFilter === "all"
    ? presets
    : presets.filter((p) => p.context.includes(contextFilter));

  const sharedPresets = filtered.filter((p) => p.shared);
  const privatePresets = filtered.filter((p) => !p.shared);

  /* ── Preset row ── */

  function PresetRow({ preset }: { preset: AiPreset }) {
    const creator = preset.creatorName ?? preset.creatorEmail ?? "Unknown";
    return (
      <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{preset.name}</span>
            {preset.category && (
              <Badge variant="outline" className="text-xs px-1.5 py-0">{preset.category}</Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {preset.context.map((c) => <ContextBadge key={c} ctx={c} />)}
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{preset.goal}</p>
          <div className="text-[11px] text-muted-foreground mt-1 space-x-1">
            <span>{preset.tone}</span>
            {preset.context.includes("email") && (
              <><span>·</span><span>{IMPROVE_LABELS[preset.improveFields] ?? preset.improveFields}</span></>
            )}
            <span>·</span><span>By {creator}</span>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
          {/* Share toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ id: preset.id, shared: !preset.shared })}
              >
                {preset.shared ? <Globe className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{preset.shared ? "Unshare (make private)" : "Share with team"}</TooltipContent>
          </Tooltip>

          {/* Edit */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setEditTarget(preset)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit preset</TooltipContent>
          </Tooltip>

          {/* Delete */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{preset.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the preset from the team's AI panels. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate(preset.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  }

  /* ── Render ── */

  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI Presets</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Reusable AI writing configurations — shared across sequences, notes, and summaries.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-1.5" /> New Preset
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-0 pt-4 px-4">
            {/* Context filter tabs */}
            <div className="flex gap-0.5 bg-muted/50 rounded-lg p-0.5 w-fit">
              {[{ value: "all", label: "All" }, ...CONTEXT_OPTIONS].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setContextFilter(tab.value)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    contextFilter === tab.value
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  <span className="ml-1.5 tabular-nums text-xs opacity-60">
                    {tab.value === "all" ? presets.length : presets.filter((p) => p.context.includes(tab.value)).length}
                  </span>
                </button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="pt-4 px-4">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <Sparkles className="h-8 w-8 text-muted-foreground/30" />
                <div>
                  <p className="text-sm font-medium">No presets yet</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {contextFilter === "all"
                      ? "Create your first preset to give the team consistent AI writing guidance."
                      : `No presets tagged for "${contextFilter}". Try adding one.`}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> New Preset
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Shared presets */}
                {sharedPresets.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Globe className="h-3.5 w-3.5 text-primary" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Team Library
                      </p>
                    </div>
                    <div className="divide-y rounded-lg border px-3">
                      {sharedPresets.map((p) => <PresetRow key={p.id} preset={p} />)}
                    </div>
                  </div>
                )}

                {/* Private presets */}
                {privatePresets.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Private
                      </p>
                    </div>
                    <div className="divide-y rounded-lg border px-3">
                      {privatePresets.map((p) => <PresetRow key={p.id} preset={p} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add dialog */}
      <PresetDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initial={EMPTY_FORM}
        title="New AI Preset"
        isPending={createMutation.isPending}
        onSubmit={(f) => createMutation.mutate(f)}
      />

      {/* Edit dialog */}
      {editTarget && (
        <PresetDialog
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null); }}
          initial={{
            name: editTarget.name,
            category: editTarget.category ?? "",
            goal: editTarget.goal,
            tone: editTarget.tone,
            improveFields: editTarget.improveFields,
            context: editTarget.context,
            shared: editTarget.shared,
          }}
          title="Edit Preset"
          isPending={updateMutation.isPending}
          onSubmit={(f) => updateMutation.mutate({
            id: editTarget.id,
            name: f.name.trim(), category: f.category.trim() || null,
            goal: f.goal.trim(), tone: f.tone,
            improveFields: f.improveFields, context: f.context, shared: f.shared,
          })}
        />
      )}
    </SidebarLayout>
  );
}
