import { useSessionToken } from "@/hooks/use-session-token";
import { useState } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { Link, useLocation } from "wouter";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  ListOrdered,
  Users,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Sparkles,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SEQUENCE_TEMPLATES, type SequenceTemplate } from "@/lib/sequence-templates";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SequenceSummary {
  id: string;
  name: string;
  stepCount: number;
  activeEnrollments: number;
  totalEnrollments: number;
  createdAt: string;
}

function useSequenceApi() {
  const getToken = useSessionToken();
  return async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`/api/sequences${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { error?: string }).error ?? `Request failed (${res.status})`,
      );
    }
    if (res.status === 204) return null;
    return res.json();
  };
}

type DialogStep = "gallery" | "name";

export function SequencesPage() {
  const apiFetch = useSequenceApi();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // ── Standard create dialog ────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [dialogStep, setDialogStep] = useState<DialogStep>("gallery");
  const [selectedTemplate, setSelectedTemplate] = useState<SequenceTemplate | null>(null);
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // ── AI-create dialog ──────────────────────────────────────────────────────
  const [showAiCreate, setShowAiCreate] = useState(false);
  const [aiName, setAiName] = useState("");
  const [aiGoal, setAiGoal] = useState("");
  const [aiNumSteps, setAiNumSteps] = useState(3);
  const [aiTone, setAiTone] = useState("Professional");
  const [aiContext, setAiContext] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPreview, setAiPreview] = useState<
    { subject: string; body: string; delayDays: number }[] | null
  >(null);
  const [aiSaving, setAiSaving] = useState(false);

  const { data: sequences, isLoading } = useQuery<SequenceSummary[]>({
    queryKey: ["sequences"],
    queryFn: () => apiFetch(""),
    staleTime: 30_000,
  });

  // ── Standard create handlers ──────────────────────────────────────────────
  function openCreate() {
    setDialogStep("gallery");
    setSelectedTemplate(null);
    setNewName("");
    setShowCreate(true);
  }

  function closeCreate() {
    if (isCreating) return;
    setShowCreate(false);
  }

  function selectTemplate(template: SequenceTemplate | null) {
    setSelectedTemplate(template);
    setNewName(template ? template.name : "");
    setDialogStep("name");
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      const seq = await apiFetch("", { method: "POST", body: JSON.stringify({ name }) });

      if (selectedTemplate) {
        for (const step of selectedTemplate.steps) {
          await apiFetch(`/${seq.id}/steps`, {
            method: "POST",
            body: JSON.stringify({
              subject: step.subject,
              body: step.body,
              delayDays: step.delayDays,
            }),
          });
        }
      }

      qc.invalidateQueries({ queryKey: ["sequences"] });
      setShowCreate(false);
      navigate(`/sequences/${seq.id}`);
    } catch (err) {
      toast({
        title: "Failed to create sequence",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  }

  // ── AI-create handlers ────────────────────────────────────────────────────
  function openAiCreate() {
    setAiName("");
    setAiGoal("");
    setAiNumSteps(3);
    setAiTone("Professional");
    setAiContext("");
    setAiPreview(null);
    setShowAiCreate(true);
  }

  function closeAiCreate() {
    if (aiGenerating || aiSaving) return;
    setShowAiCreate(false);
  }

  async function generateAiDraft() {
    if (!aiGoal.trim()) return;
    setAiGenerating(true);
    setAiPreview(null);
    try {
      const result = (await apiFetch("/ai-draft-sequence", {
        method: "POST",
        body: JSON.stringify({
          goal: aiGoal.trim(),
          numSteps: aiNumSteps,
          tone: aiTone,
          context: aiContext.trim() || undefined,
        }),
      })) as { steps: { subject: string; body: string; delayDays: number }[] };
      setAiPreview(result.steps);
    } catch (err) {
      toast({
        title: "AI generation failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setAiGenerating(false);
    }
  }

  async function acceptAiDraft() {
    if (!aiPreview) return;
    const name = aiName.trim() || "AI-drafted sequence";
    setAiSaving(true);
    try {
      const seq = await apiFetch("", { method: "POST", body: JSON.stringify({ name }) });
      for (const step of aiPreview) {
        await apiFetch(`/${seq.id}/steps`, {
          method: "POST",
          body: JSON.stringify(step),
        });
      }
      qc.invalidateQueries({ queryKey: ["sequences"] });
      setShowAiCreate(false);
      navigate(`/sequences/${seq.id}`);
      toast({ title: `Sequence created with ${aiPreview.length} steps` });
    } catch (err) {
      toast({
        title: "Failed to save sequence",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setAiSaving(false);
    }
  }

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Sequences</h1>
            <p className="text-muted-foreground">
              Automated drip campaigns — enroll contacts and send timed email steps.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campaigns">Campaigns</Link>
            </Button>
            <Button variant="outline" onClick={openAiCreate} className="gap-2">
              <Sparkles className="h-4 w-4" />
              New with AI
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> New Sequence
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-24 mt-1" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : sequences && sequences.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sequences.map((seq) => (
              <Link key={seq.id} href={`/sequences/${seq.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      {seq.name}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </CardTitle>
                    <CardDescription className="flex items-center gap-4 mt-1">
                      <span className="flex items-center gap-1">
                        <ListOrdered className="h-3.5 w-3.5" />
                        {seq.stepCount} step{seq.stepCount !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {seq.activeEnrollments} active
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      {seq.totalEnrollments} total enrollment
                      {seq.totalEnrollments !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="flex flex-col items-center justify-center py-16">
            <ListOrdered className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
            <p className="text-muted-foreground text-sm mb-4">No sequences yet.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={openAiCreate} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Draft with AI
              </Button>
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> Create from scratch
              </Button>
            </div>
          </Card>
        )}

        {/* Standard create dialog */}
        <Dialog open={showCreate} onOpenChange={closeCreate}>
          <DialogContent className="max-w-2xl">
            {dialogStep === "gallery" ? (
              <>
                <DialogHeader>
                  <DialogTitle>New Sequence</DialogTitle>
                  <p className="text-sm text-muted-foreground pt-1">
                    Pick a template to get started quickly, or build from scratch.
                  </p>
                </DialogHeader>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
                  {/* Start from scratch */}
                  <button
                    onClick={() => selectTemplate(null)}
                    className="text-left rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/40 transition-colors p-4 flex items-start gap-3"
                  >
                    <span className="text-2xl leading-none mt-0.5">✏️</span>
                    <div>
                      <p className="font-medium text-sm">Start from scratch</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Blank sequence — build your own steps
                      </p>
                    </div>
                  </button>

                  {/* Template cards */}
                  {SEQUENCE_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => selectTemplate(tpl)}
                      className="text-left rounded-lg border-2 border-border hover:border-primary/60 hover:bg-muted/40 transition-colors p-4 flex items-start gap-3"
                    >
                      <span className="text-2xl leading-none mt-0.5">{tpl.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{tpl.name}</p>
                          <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-2 py-0.5 shrink-0">
                            {tpl.steps.length} steps
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                          {tpl.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDialogStep("gallery")}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      disabled={isCreating}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <DialogTitle>
                      {selectedTemplate ? (
                        <span className="flex items-center gap-2">
                          <span>{selectedTemplate.icon}</span>
                          {selectedTemplate.name}
                        </span>
                      ) : (
                        "New Sequence"
                      )}
                    </DialogTitle>
                  </div>
                  {selectedTemplate && (
                    <p className="text-sm text-muted-foreground pt-1 pl-6">
                      {selectedTemplate.steps.length} pre-written steps included — you can edit everything after creation.
                    </p>
                  )}
                </DialogHeader>

                {selectedTemplate && (
                  <div className="space-y-2 max-h-40 overflow-y-auto bg-muted/40 rounded-lg p-3">
                    {selectedTemplate.steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium text-[10px]">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{step.subject}</p>
                          <p className="text-muted-foreground">
                            {step.delayDays === 0
                              ? "Sends immediately"
                              : `Sends after ${step.delayDays} day${step.delayDays !== 1 ? "s" : ""}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="py-1">
                  <label className="text-sm font-medium mb-1.5 block">Sequence name</label>
                  <Input
                    placeholder="e.g. Q3 Cold Outreach"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newName.trim() && !isCreating) handleCreate();
                    }}
                    autoFocus
                    disabled={isCreating}
                  />
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={closeCreate} disabled={isCreating}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!newName.trim() || isCreating}
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating…
                      </>
                    ) : selectedTemplate ? (
                      `Create with ${selectedTemplate.steps.length} steps`
                    ) : (
                      "Create"
                    )}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* AI-create dialog */}
        <Dialog
          open={showAiCreate}
          onOpenChange={(open) => {
            if (!open) closeAiCreate();
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                New sequence with AI
              </DialogTitle>
            </DialogHeader>

            {/* Form — hidden once preview is shown */}
            {!aiPreview && (
              <div className="space-y-4 py-2">
                <div>
                  <label className="text-sm font-medium">Sequence name</label>
                  <Input
                    placeholder="e.g. Q3 Cold Outreach"
                    value={aiName}
                    onChange={(e) => setAiName(e.target.value)}
                    className="mt-1.5"
                    disabled={aiGenerating}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Sequence goal</label>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    What should this email sequence accomplish?
                  </p>
                  <Textarea
                    placeholder="e.g. Warm up cold leads who downloaded our e-book and book a 15-min discovery call"
                    value={aiGoal}
                    onChange={(e) => setAiGoal(e.target.value)}
                    rows={3}
                    className="text-sm resize-none"
                    autoFocus
                    disabled={aiGenerating}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Number of steps</label>
                    <Select
                      value={String(aiNumSteps)}
                      onValueChange={(v) => setAiNumSteps(Number(v))}
                      disabled={aiGenerating}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[2, 3, 4, 5, 6, 7].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} emails
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Tone</label>
                    <Select
                      value={aiTone}
                      onValueChange={setAiTone}
                      disabled={aiGenerating}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Friendly", "Professional", "Direct", "Urgent"].map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Context{" "}
                    <span className="font-normal text-muted-foreground text-xs">(optional)</span>
                  </label>
                  <Textarea
                    placeholder="e.g. Our audience is mid-market CFOs. We offer a spend analytics platform."
                    value={aiContext}
                    onChange={(e) => setAiContext(e.target.value)}
                    rows={2}
                    className="mt-1.5 text-sm resize-none"
                    disabled={aiGenerating}
                  />
                </div>
              </div>
            )}

            {/* Preview */}
            {aiPreview && (
              <div className="space-y-3 py-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium flex-1">
                    {aiPreview.length} steps generated — review before saving
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setAiPreview(null)}
                    disabled={aiSaving}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Edit inputs
                  </Button>
                </div>
                {aiName.trim() && (
                  <p className="text-xs text-muted-foreground">
                    Will be saved as: <span className="font-medium text-foreground">{aiName.trim()}</span>
                  </p>
                )}
                <ol className="space-y-3">
                  {aiPreview.map((step, i) => (
                    <li key={i} className="border rounded-lg p-4 space-y-2 bg-muted/30">
                      <div className="flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {i === 0
                            ? "Send immediately"
                            : `Send ${step.delayDays} day${step.delayDays !== 1 ? "s" : ""} after step ${i}`}
                        </span>
                      </div>
                      <p className="text-sm font-semibold">{step.subject}</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {step.body}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              {!aiPreview ? (
                <>
                  <Button variant="outline" onClick={closeAiCreate} disabled={aiGenerating}>
                    Cancel
                  </Button>
                  <Button
                    onClick={generateAiDraft}
                    disabled={!aiGoal.trim() || aiGenerating}
                    className="gap-2"
                  >
                    {aiGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {aiGenerating ? "Generating…" : "Generate draft"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={closeAiCreate}
                    disabled={aiSaving}
                  >
                    Dismiss
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={generateAiDraft}
                    disabled={aiGenerating || aiSaving}
                    className="gap-1.5"
                  >
                    {aiGenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Regenerate
                  </Button>
                  <Button
                    onClick={acceptAiDraft}
                    disabled={aiSaving || aiGenerating}
                    className="gap-2"
                  >
                    {aiSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {aiSaving ? "Saving…" : `Create with ${aiPreview.length} steps`}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SidebarLayout>
  );
}
