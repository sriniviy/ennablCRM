import { useSessionToken } from "@/hooks/use-session-token";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useRoute, useLocation, Link } from "wouter";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useListContacts } from "@workspace/api-client-react";
import {
  Plus,
  Trash2,
  Users,
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Mail,
  ChevronUp,
  ChevronDown,
  Braces,
  ShieldOff,
  Zap,
  Sparkles,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const TOKENS = [
  { token: "{{firstName}}", label: "First name", example: "Sarah" },
  { token: "{{lastName}}", label: "Last name", example: "Chen" },
  { token: "{{fullName}}", label: "Full name", example: "Sarah Chen" },
  { token: "{{companyName}}", label: "Company", example: "Acme Inc." },
  { token: "{{repName}}", label: "Your name", example: "Alex Smith" },
  { token: "{{repEmail}}", label: "Your email", example: "alex@company.com" },
] as const;

function highlightTokens(text: string): React.ReactNode {
  const parts = text.split(/({{[^}]+}})/g);
  return parts.map((part, i) =>
    /^\{\{[^}]+\}\}$/.test(part) ? (
      <span
        key={i}
        className="inline-flex items-center bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded px-0.5 font-mono text-[10px] leading-tight"
      >
        {part}
      </span>
    ) : (
      part
    ),
  );
}

interface Step {
  id: string;
  subject: string;
  body: string;
  delayDays: number;
  stepOrder: number;
}

interface Trigger {
  id: string;
  triggerType: string;
  triggerValue: string;
}

interface DealStage {
  id: string;
  name: string;
  color: string;
}

interface Enrollment {
  id: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  currentStep: number;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "UNENROLLED";
  enrolledAt: string;
  nextSendAt: string | null;
  exitReason: string | null;
  enrolledVia: "MANUAL" | "TRIGGER";
}

interface SequenceDetail {
  id: string;
  name: string;
  exitOnDealWon: boolean;
  exitOnDealLost: boolean;
  exitOnUnsubscribe: boolean;
  steps: Step[];
  triggers: Trigger[];
  enrollments: Enrollment[];
}

function useApi() {
  const getToken = useSessionToken();
  return async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`/api${path}`, {
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

function StatusBadge({ status }: { status: Enrollment["status"] }) {
  const map: Record<Enrollment["status"], { label: string; className: string }> = {
    ACTIVE: {
      label: "Active",
      className:
        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0",
    },
    COMPLETED: {
      label: "Completed",
      className:
        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-0",
    },
    PAUSED: {
      label: "Paused",
      className:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-0",
    },
    UNENROLLED: {
      label: "Unenrolled",
      className:
        "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-0",
    },
  };
  const { label, className } = map[status] ?? map.UNENROLLED;
  return (
    <Badge variant="outline" className={`text-xs font-normal ${className}`}>
      {label}
    </Badge>
  );
}

export function SequenceDetailPage() {
  const [, params] = useRoute("/sequences/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ?? "";
  const apiFetch = useApi();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [addingStep, setAddingStep] = useState(false);
  const [stepForm, setStepForm] = useState({
    subject: "",
    body: "",
    delayDays: 1,
  });
  const [editingStep, setEditingStep] = useState<Step | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(
    new Set(),
  );
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  // AI writer state (shared between add and edit forms)
  const [aiPanelOpen, setAiPanelOpen] = useState<"add" | "edit" | null>(null);
  const [aiMode, setAiMode] = useState<"write" | "improve">("write");
  const [aiImproveFields, setAiImproveFields] = useState<"subject" | "body" | "both">("both");
  const [aiGoal, setAiGoal] = useState("");
  const [aiTone, setAiTone] = useState("Professional");
  const [aiContext, setAiContext] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGeneratedFor, setAiGeneratedFor] = useState<"add" | "edit" | null>(null);

  // AI draft sequence dialog state
  const [aiDraftOpen, setAiDraftOpen] = useState(false);
  const [aiDraftGoal, setAiDraftGoal] = useState("");
  const [aiDraftNumSteps, setAiDraftNumSteps] = useState(3);
  const [aiDraftTone, setAiDraftTone] = useState("Professional");
  const [aiDraftContext, setAiDraftContext] = useState("");
  const [aiDraftGenerating, setAiDraftGenerating] = useState(false);
  const [aiDraftPreview, setAiDraftPreview] = useState<
    { subject: string; body: string; delayDays: number }[] | null
  >(null);
  const [aiDraftSaving, setAiDraftSaving] = useState(false);

  // AI compare state — holds the pending AI draft until rep accepts or discards
  const [aiProposed, setAiProposed] = useState<{ subject: string; body: string } | null>(null);
  const [aiOriginalSnapshot, setAiOriginalSnapshot] = useState<{ subject: string; body: string } | null>(null);
  const [aiCompareFor, setAiCompareFor] = useState<"add" | "edit" | null>(null);

  // Refs for cursor-position-aware token insertion
  const addSubjectRef = useRef<HTMLInputElement>(null);
  const addBodyRef = useRef<HTMLTextAreaElement>(null);
  const editSubjectRef = useRef<HTMLInputElement>(null);
  const editBodyRef = useRef<HTMLTextAreaElement>(null);
  const lastSelRef = useRef<{
    form: "add" | "edit";
    field: "subject" | "body";
    start: number;
    end: number;
  } | null>(null);

  function trackSel(form: "add" | "edit", field: "subject" | "body") {
    return (
      e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      const el = e.currentTarget;
      lastSelRef.current = {
        form,
        field,
        start: el.selectionStart ?? 0,
        end: el.selectionEnd ?? 0,
      };
    };
  }

  function insertToken(token: string) {
    const sel = lastSelRef.current;
    if (!sel) {
      setStepForm((f) => ({ ...f, body: f.body + token }));
      return;
    }
    const { form, field, start, end } = sel;
    const splice = (str: string) =>
      str.slice(0, start) + token + str.slice(end);
    const newCursor = start + token.length;
    if (form === "add") {
      setStepForm((f) => ({ ...f, [field]: splice(f[field]) }));
      setTimeout(() => {
        const el =
          field === "subject" ? addSubjectRef.current : addBodyRef.current;
        el?.focus();
        el?.setSelectionRange(newCursor, newCursor);
      }, 0);
    } else {
      setEditingStep((s) =>
        s ? { ...s, [field]: splice(s[field]) } : null,
      );
      setTimeout(() => {
        const el =
          field === "subject" ? editSubjectRef.current : editBodyRef.current;
        el?.focus();
        el?.setSelectionRange(newCursor, newCursor);
      }, 0);
    }
  }

  function TokenPicker({ form }: { form: "add" | "edit" }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
            type="button"
          >
            <Braces className="h-3 w-3" />
            Insert token
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          {TOKENS.map(({ token, label }) => (
            <DropdownMenuItem
              key={token}
              onSelect={() => insertToken(token)}
              className="gap-3"
            >
              <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400 shrink-0">
                {token}
              </span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Generates all steps at once from a single goal
  async function generateAiDraftSequence() {
    if (!aiDraftGoal.trim()) return;
    setAiDraftGenerating(true);
    setAiDraftPreview(null);
    try {
      const result = (await apiFetch("/sequences/ai-draft-sequence", {
        method: "POST",
        body: JSON.stringify({
          goal: aiDraftGoal.trim(),
          numSteps: aiDraftNumSteps,
          tone: aiDraftTone,
          context: aiDraftContext.trim() || undefined,
        }),
      })) as { steps: { subject: string; body: string; delayDays: number }[] };
      setAiDraftPreview(result.steps);
    } catch (err) {
      toast({
        title: "AI generation failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setAiDraftGenerating(false);
    }
  }

  // Saves all preview steps in bulk via the existing single-step API
  async function acceptAiDraftSequence() {
    if (!aiDraftPreview) return;
    setAiDraftSaving(true);
    try {
      for (const step of aiDraftPreview) {
        await apiFetch(`/sequences/${id}/steps`, {
          method: "POST",
          body: JSON.stringify(step),
        });
      }
      invalidate();
      setAiDraftOpen(false);
      setAiDraftPreview(null);
      setAiDraftGoal("");
      setAiDraftContext("");
      toast({ title: `${aiDraftPreview.length} steps added` });
    } catch (err) {
      toast({
        title: "Failed to save steps",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setAiDraftSaving(false);
    }
  }

  // Calls the AI endpoint and shows a compare view — rep must Accept or Discard.
  async function generateAiDraft(targetForm: "add" | "edit", stepNumber: number, totalSteps: number) {
    if (!aiGoal.trim()) return;
    setAiGenerating(true);
    try {
      const isImprove = aiMode === "improve";
      const result = (await apiFetch("/sequences/ai-draft-step", {
        method: "POST",
        body: JSON.stringify({
          goal: aiGoal.trim(),
          tone: aiTone,
          context: aiContext.trim() || undefined,
          stepNumber,
          totalSteps,
          ...(isImprove && targetForm === "edit" && editingStep
            ? { existingSubject: editingStep.subject, existingBody: editingStep.body, improveFields: aiImproveFields }
            : isImprove && targetForm === "add"
              ? { existingSubject: stepForm.subject, existingBody: stepForm.body, improveFields: aiImproveFields }
              : {}),
        }),
      })) as { subject?: string; body?: string };

      // Snapshot the current content so the rep can compare before accepting
      const original =
        targetForm === "add"
          ? { subject: stepForm.subject, body: stepForm.body }
          : { subject: editingStep?.subject ?? "", body: editingStep?.body ?? "" };

      // For selective improve, fall back to original for any field not returned by AI
      const proposed = {
        subject: result.subject ?? original.subject,
        body: result.body ?? original.body,
      };

      setAiOriginalSnapshot(original);
      setAiProposed(proposed);
      setAiCompareFor(targetForm);
      setAiGeneratedFor(targetForm);
      setAiPanelOpen(null); // collapse the prompt panel to give room for the diff
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

  function acceptAiDraft() {
    if (!aiProposed || !aiCompareFor) return;
    if (aiCompareFor === "add") {
      setStepForm((f) => ({ ...f, subject: aiProposed.subject, body: aiProposed.body }));
    } else {
      setEditingStep((s) => (s ? { ...s, subject: aiProposed.subject, body: aiProposed.body } : null));
    }
    setAiProposed(null);
    setAiOriginalSnapshot(null);
    setAiCompareFor(null);
  }

  function discardAiDraft() {
    setAiProposed(null);
    setAiOriginalSnapshot(null);
    setAiCompareFor(null);
    setAiGeneratedFor(null);
  }

  const { data: sequence, isLoading } = useQuery<SequenceDetail>({
    queryKey: ["sequence", id],
    queryFn: () => apiFetch(`/sequences/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });

  const { data: contactsData } = useListContacts({ page: 1, pageSize: 200 });
  const allContacts = contactsData?.data ?? [];
  const filteredContacts = allContacts.filter((c) => {
    const q = contactSearch.toLowerCase();
    return (
      c.firstName?.toLowerCase().includes(q) ||
      c.lastName?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["sequence", id] });

  const updateNameMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch(`/sequences/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["sequences"] });
      setEditingName(false);
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const addStepMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/sequences/${id}/steps`, {
        method: "POST",
        body: JSON.stringify(stepForm),
      }),
    onSuccess: () => {
      invalidate();
      setAddingStep(false);
      setStepForm({ subject: "", body: "", delayDays: 1 });
      toast({ title: "Step added" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const updateStepMutation = useMutation({
    mutationFn: (step: Step) =>
      apiFetch(`/sequences/${id}/steps/${step.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          subject: step.subject,
          body: step.body,
          delayDays: step.delayDays,
        }),
      }),
    onSuccess: () => {
      invalidate();
      setEditingStep(null);
      toast({ title: "Step updated" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const deleteStepMutation = useMutation({
    mutationFn: (stepId: string) =>
      apiFetch(`/sequences/${id}/steps/${stepId}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Step removed" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      apiFetch(`/sequences/${id}/steps/reorder`, {
        method: "POST",
        body: JSON.stringify({ orderedIds }),
      }),
    onSuccess: () => invalidate(),
    onError: (err: Error) =>
      toast({ title: "Failed to reorder", description: err.message, variant: "destructive" }),
  });

  const moveStep = (index: number, direction: "up" | "down") => {
    const currentSteps = sequence?.steps ?? [];
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === currentSteps.length - 1) return;
    const newOrder = [...currentSteps];
    const swapWith = direction === "up" ? index - 1 : index + 1;
    [newOrder[index], newOrder[swapWith]] = [newOrder[swapWith], newOrder[index]];
    reorderMutation.mutate(newOrder.map((s) => s.id));
  };

  const enrollMutation = useMutation({
    mutationFn: (contactIds: string[]) =>
      apiFetch(`/sequences/${id}/enroll`, {
        method: "POST",
        body: JSON.stringify({ contactIds }),
      }),
    onSuccess: (data: { enrolled: number; skipped: number }) => {
      invalidate();
      setEnrollOpen(false);
      setSelectedContactIds(new Set());
      setContactSearch("");
      toast({
        title: `${data.enrolled} contact${data.enrolled !== 1 ? "s" : ""} enrolled`,
        description: data.skipped > 0 ? `${data.skipped} already active — skipped` : undefined,
      });
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const unenrollMutation = useMutation({
    mutationFn: (enrollmentId: string) =>
      apiFetch(`/sequences/${id}/enrollments/${enrollmentId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Contact unenrolled" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const deleteSequenceMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/sequences/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sequences"] });
      setLocation("/sequences");
      toast({ title: "Sequence deleted" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const { data: dealStages = [] } = useQuery<DealStage[]>({
    queryKey: ["deal-stages"],
    queryFn: () => apiFetch("/deal-stages"),
    staleTime: 60_000,
  });

  const [addingTrigger, setAddingTrigger] = useState(false);
  const [triggerStageValue, setTriggerStageValue] = useState("");

  const addTriggerMutation = useMutation({
    mutationFn: (triggerValue: string) =>
      apiFetch(`/sequences/${id}/triggers`, {
        method: "POST",
        body: JSON.stringify({ triggerValue }),
      }),
    onSuccess: () => {
      invalidate();
      setAddingTrigger(false);
      setTriggerStageValue("");
      toast({ title: "Trigger added" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const deleteTriggerMutation = useMutation({
    mutationFn: (triggerId: string) =>
      apiFetch(`/sequences/${id}/triggers/${triggerId}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Trigger removed" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const exitConditionMutation = useMutation({
    mutationFn: (patch: {
      exitOnDealWon?: boolean;
      exitOnDealLost?: boolean;
      exitOnUnsubscribe?: boolean;
    }) =>
      apiFetch(`/sequences/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => invalidate(),
    onError: (err: Error) =>
      toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <SidebarLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </SidebarLayout>
    );
  }

  if (!sequence) {
    return (
      <SidebarLayout>
        <div className="text-center py-16 text-muted-foreground">
          Sequence not found.
        </div>
      </SidebarLayout>
    );
  }

  const steps = sequence.steps;
  const enrollments = sequence.enrollments;
  const activeEnrollments = enrollments.filter((e) => e.status === "ACTIVE");

  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="mt-0.5 shrink-0">
            <Link href="/sequences">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="text-2xl font-bold h-auto py-0 border-0 border-b rounded-none focus-visible:ring-0 px-0"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nameValue.trim())
                      updateNameMutation.mutate(nameValue.trim());
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => updateNameMutation.mutate(nameValue.trim())}
                  disabled={!nameValue.trim()}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingName(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <h1
                className="text-2xl font-bold tracking-tight cursor-pointer hover:text-primary transition-colors"
                onClick={() => {
                  setNameValue(sequence.name);
                  setEditingName(true);
                }}
                title="Click to rename"
              >
                {sequence.name}
              </h1>
            )}
            <p className="text-sm text-muted-foreground mt-0.5">
              {steps.length} step{steps.length !== 1 ? "s" : ""} ·{" "}
              {activeEnrollments.length} active enrollment
              {activeEnrollments.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEnrollOpen(true)}
              disabled={steps.length === 0}
            >
              <Users className="mr-1.5 h-4 w-4" /> Enroll Contacts
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete sequence?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete <strong>{sequence.name}</strong> and all
                    its steps and enrollments. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteSequenceMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Steps */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Email Steps</CardTitle>
                <CardDescription>
                  Each step is sent after its delay from the previous step.
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setAddingStep(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Step
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {steps.length === 0 ? (
              <div className="text-center py-10 space-y-4">
                <div className="text-muted-foreground">
                  <Mail className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No steps yet. Draft the whole sequence with AI, or add steps one by one.</p>
                </div>
                <Button
                  onClick={() => setAiDraftOpen(true)}
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Draft sequence with AI
                </Button>
              </div>
            ) : (
              <ol className="space-y-3">
                {steps.map((step, i) => (
                  <li key={step.id}>
                    {editingStep?.id === step.id ? (
                      <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <span className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold">
                            {i + 1}
                          </span>
                          Editing step
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-muted-foreground">Subject</label>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11px] gap-1 text-primary/70 hover:text-primary"
                                type="button"
                                onClick={() => {
                                  setAiMode("write");
                                  setAiGoal("");
                                  setAiPanelOpen(aiPanelOpen === "edit" && aiMode === "write" ? null : "edit");
                                }}
                              >
                                <Sparkles className="h-3 w-3" />
                                Write with AI
                              </Button>
                              {(editingStep.subject.trim() || editingStep.body.trim()) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[11px] gap-1 text-violet-600/80 hover:text-violet-700 dark:text-violet-400/80 dark:hover:text-violet-300"
                                  type="button"
                                  onClick={() => {
                                    setAiMode("improve");
                                    setAiGoal("Improve the email below");
                                    setAiPanelOpen(aiPanelOpen === "edit" && aiMode === "improve" ? null : "edit");
                                  }}
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  Improve with AI
                                </Button>
                              )}
                              <TokenPicker form="edit" />
                            </div>
                          </div>
                          <Input
                            ref={editSubjectRef}
                            placeholder="Email subject"
                            value={editingStep.subject}
                            onChange={(e) =>
                              setEditingStep((s) =>
                                s ? { ...s, subject: e.target.value } : null,
                              )
                            }
                            onSelect={trackSel("edit", "subject")}
                            onKeyUp={trackSel("edit", "subject")}
                            onMouseUp={trackSel("edit", "subject")}
                            onFocus={trackSel("edit", "subject")}
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-muted-foreground">Body</label>
                            <TokenPicker form="edit" />
                          </div>
                          <Textarea
                            ref={editBodyRef}
                            placeholder="Email body"
                            value={editingStep.body}
                            rows={4}
                            onChange={(e) =>
                              setEditingStep((s) =>
                                s ? { ...s, body: e.target.value } : null,
                              )
                            }
                            onSelect={trackSel("edit", "body")}
                            onKeyUp={trackSel("edit", "body")}
                            onMouseUp={trackSel("edit", "body")}
                            onFocus={trackSel("edit", "body")}
                          />
                        </div>
                        {/* AI Writer Panel — edit form */}
                        {aiPanelOpen === "edit" && (
                          <div className="border border-dashed border-primary/40 rounded-lg p-3 space-y-2.5 bg-primary/5">
                            <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                              {aiMode === "improve" ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                              {aiMode === "improve" ? "Improve with AI" : "Write with AI"}
                            </p>
                            {aiMode === "improve" && (
                              <div>
                                <label className="text-xs text-muted-foreground">Improve</label>
                                <div className="mt-1 flex rounded-md border overflow-hidden text-[11px] font-medium">
                                  {(["subject", "body", "both"] as const).map((option, idx) => (
                                    <button
                                      key={option}
                                      type="button"
                                      onClick={() => setAiImproveFields(option)}
                                      className={cn(
                                        "flex-1 py-1.5 transition-colors",
                                        idx > 0 && "border-l",
                                        aiImproveFields === option
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-background hover:bg-muted text-muted-foreground",
                                      )}
                                    >
                                      {option === "both" ? "Subject + Body" : option.charAt(0).toUpperCase() + option.slice(1)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div>
                              <label className="text-xs text-muted-foreground">
                                {aiMode === "improve" ? "Goal — how should the email be improved?" : "Goal — what should this email accomplish?"}
                              </label>
                              <Input
                                placeholder={aiMode === "improve" ? "e.g. Make it shorter and more direct" : "e.g. Introduce ourselves and request a 15-min call"}
                                value={aiGoal}
                                onChange={(e) => setAiGoal(e.target.value)}
                                className="mt-1 text-sm"
                                onKeyDown={(e) => { if (e.key === "Enter") generateAiDraft("edit", i + 1, steps.length); }}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Tone</label>
                              <Select value={aiTone} onValueChange={setAiTone}>
                                <SelectTrigger className="mt-1 h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {["Friendly", "Professional", "Direct", "Urgent"].map((t) => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Context <span className="opacity-60">(optional — anything else the AI should know?)</span></label>
                              <Textarea
                                placeholder="e.g. They recently downloaded our whitepaper on risk management"
                                value={aiContext}
                                onChange={(e) => setAiContext(e.target.value)}
                                rows={2}
                                className="mt-1 text-sm resize-none"
                              />
                            </div>
                            <Button
                              size="sm"
                              type="button"
                              onClick={() => generateAiDraft("edit", i + 1, steps.length)}
                              disabled={!aiGoal.trim() || aiGenerating}
                              className="gap-1.5"
                            >
                              {aiGenerating ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : aiMode === "improve" ? (
                                <RefreshCw className="h-3.5 w-3.5" />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                              )}
                              {aiGenerating
                                ? "Generating…"
                                : aiGeneratedFor === "edit"
                                  ? "Regenerate"
                                  : aiMode === "improve"
                                    ? "Improve draft"
                                    : "Generate draft"}
                            </Button>
                          </div>
                        )}
                        {/* AI Compare View — shows after generation, before accept/discard */}
                        {aiCompareFor === "edit" && aiProposed && (
                          <div className="border border-primary/30 rounded-lg overflow-hidden">
                            <div className="bg-primary/5 border-b border-primary/20 px-3 py-2 flex items-center justify-between">
                              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5" />
                                Review AI rewrite — accept or discard
                              </p>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[11px] gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                                  type="button"
                                  onClick={discardAiDraft}
                                >
                                  Discard
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-6 px-2 text-[11px] gap-1"
                                  type="button"
                                  onClick={acceptAiDraft}
                                >
                                  Accept rewrite
                                </Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 divide-x divide-border">
                              <div className="p-3 space-y-2 min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Original</p>
                                <div className="space-y-1.5">
                                  <p className="text-[11px] font-medium text-muted-foreground leading-snug line-clamp-1">
                                    {aiOriginalSnapshot?.subject || <span className="italic opacity-50">No subject</span>}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed whitespace-pre-wrap line-clamp-6">
                                    {aiOriginalSnapshot?.body || <span className="italic opacity-50">No body</span>}
                                  </p>
                                </div>
                              </div>
                              <div className="p-3 space-y-2 min-w-0 bg-primary/[0.03]">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/70">AI Rewrite</p>
                                <div className="space-y-1.5">
                                  <p className="text-[11px] font-medium leading-snug line-clamp-1">{aiProposed.subject}</p>
                                  <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap line-clamp-6">{aiProposed.body}</p>
                                </div>
                              </div>
                            </div>
                            <div className="bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200/60 dark:border-amber-800/40 px-3 py-1.5">
                              <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                <Sparkles className="h-3 w-3 shrink-0" />
                                AI-generated — review before saving. You can also edit manually after accepting.
                              </p>
                            </div>
                          </div>
                        )}
                        {aiGeneratedFor === "edit" && aiPanelOpen !== "edit" && !aiCompareFor && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            AI-generated — review before saving.
                            <button type="button" onClick={() => setAiPanelOpen("edit")} className="underline hover:no-underline ml-0.5">
                              <RefreshCw className="h-2.5 w-2.5 inline mr-0.5" />Regenerate
                            </button>
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-muted-foreground whitespace-nowrap">
                            Send after
                          </label>
                          <Input
                            type="number"
                            min={0}
                            className="w-20"
                            value={editingStep.delayDays}
                            onChange={(e) =>
                              setEditingStep((s) =>
                                s
                                  ? {
                                      ...s,
                                      delayDays: parseInt(e.target.value) || 0,
                                    }
                                  : null,
                              )
                            }
                          />
                          <label className="text-sm text-muted-foreground">
                            day{editingStep.delayDays !== 1 ? "s" : ""}
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              editingStep && updateStepMutation.mutate(editingStep)
                            }
                            disabled={updateStepMutation.isPending}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setEditingStep(null); setAiPanelOpen(null); setAiGeneratedFor(null); setAiMode("write"); setAiGoal(""); setAiProposed(null); setAiOriginalSnapshot(null); setAiCompareFor(null); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="border rounded-lg p-4 flex items-start gap-3 group hover:border-primary/50 transition-colors cursor-pointer"
                        onClick={() => setEditingStep({ ...step })}
                      >
                        <div className="bg-primary text-primary-foreground rounded-full h-7 w-7 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {highlightTokens(step.subject)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {highlightTokens(step.body)}
                          </p>
                          <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {i === 0
                              ? `Send after ${step.delayDays} day${step.delayDays !== 1 ? "s" : ""} from enrollment`
                              : `Send ${step.delayDays} day${step.delayDays !== 1 ? "s" : ""} after step ${i}`}
                          </div>
                        </div>
                        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            disabled={i === 0 || reorderMutation.isPending}
                            onClick={(e) => { e.stopPropagation(); moveStep(i, "up"); }}
                            title="Move up"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            disabled={i === steps.length - 1 || reorderMutation.isPending}
                            onClick={(e) => { e.stopPropagation(); moveStep(i, "down"); }}
                            title="Move down"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteStepMutation.mutate(step.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {/* Add step inline form */}
            {addingStep && (
              <div className="border rounded-lg p-4 space-y-3 mt-3 bg-muted/30">
                <p className="text-sm font-medium text-muted-foreground">
                  New step {steps.length + 1}
                </p>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-muted-foreground">Subject</label>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] gap-1 text-primary/70 hover:text-primary"
                        type="button"
                        onClick={() => {
                          setAiMode("write");
                          setAiGoal("");
                          setAiPanelOpen(aiPanelOpen === "add" && aiMode === "write" ? null : "add");
                        }}
                      >
                        <Sparkles className="h-3 w-3" />
                        Write with AI
                      </Button>
                      {(stepForm.subject.trim() || stepForm.body.trim()) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px] gap-1 text-violet-600/80 hover:text-violet-700 dark:text-violet-400/80 dark:hover:text-violet-300"
                          type="button"
                          onClick={() => {
                            setAiMode("improve");
                            setAiGoal("Improve the email below");
                            setAiPanelOpen(aiPanelOpen === "add" && aiMode === "improve" ? null : "add");
                          }}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Improve with AI
                        </Button>
                      )}
                      <TokenPicker form="add" />
                    </div>
                  </div>
                  <Input
                    ref={addSubjectRef}
                    placeholder="Email subject"
                    value={stepForm.subject}
                    onChange={(e) =>
                      setStepForm((f) => ({ ...f, subject: e.target.value }))
                    }
                    autoFocus
                    onSelect={trackSel("add", "subject")}
                    onKeyUp={trackSel("add", "subject")}
                    onMouseUp={trackSel("add", "subject")}
                    onFocus={trackSel("add", "subject")}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-muted-foreground">Body</label>
                    <TokenPicker form="add" />
                  </div>
                  <Textarea
                    ref={addBodyRef}
                    placeholder="Email body"
                    value={stepForm.body}
                    rows={4}
                    onChange={(e) =>
                      setStepForm((f) => ({ ...f, body: e.target.value }))
                    }
                    onSelect={trackSel("add", "body")}
                    onKeyUp={trackSel("add", "body")}
                    onMouseUp={trackSel("add", "body")}
                    onFocus={trackSel("add", "body")}
                  />
                </div>
                {/* AI Writer Panel — add form */}
                {aiPanelOpen === "add" && (
                  <div className="border border-dashed border-primary/40 rounded-lg p-3 space-y-2.5 bg-primary/5">
                    <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                      {aiMode === "improve" ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {aiMode === "improve" ? "Improve with AI" : "Write with AI"}
                    </p>
                    {aiMode === "improve" && (
                      <div>
                        <label className="text-xs text-muted-foreground">Improve</label>
                        <div className="mt-1 flex rounded-md border overflow-hidden text-[11px] font-medium">
                          {(["subject", "body", "both"] as const).map((option, idx) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setAiImproveFields(option)}
                              className={cn(
                                "flex-1 py-1.5 transition-colors",
                                idx > 0 && "border-l",
                                aiImproveFields === option
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background hover:bg-muted text-muted-foreground",
                              )}
                            >
                              {option === "both" ? "Subject + Body" : option.charAt(0).toUpperCase() + option.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-muted-foreground">
                        {aiMode === "improve" ? "Goal — how should the email be improved?" : "Goal — what should this email accomplish?"}
                      </label>
                      <Input
                        placeholder={aiMode === "improve" ? "e.g. Make it shorter and more direct" : "e.g. Introduce ourselves and request a 15-min call"}
                        value={aiGoal}
                        onChange={(e) => setAiGoal(e.target.value)}
                        className="mt-1 text-sm"
                        onKeyDown={(e) => { if (e.key === "Enter") generateAiDraft("add", steps.length + 1, steps.length + 1); }}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Tone</label>
                      <Select value={aiTone} onValueChange={setAiTone}>
                        <SelectTrigger className="mt-1 h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["Friendly", "Professional", "Direct", "Urgent"].map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Context <span className="opacity-60">(optional — anything else the AI should know?)</span></label>
                      <Textarea
                        placeholder="e.g. They recently downloaded our whitepaper on risk management"
                        value={aiContext}
                        onChange={(e) => setAiContext(e.target.value)}
                        rows={2}
                        className="mt-1 text-sm resize-none"
                      />
                    </div>
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => generateAiDraft("add", steps.length + 1, steps.length + 1)}
                      disabled={!aiGoal.trim() || aiGenerating}
                      className="gap-1.5"
                    >
                      {aiGenerating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : aiMode === "improve" ? (
                        <RefreshCw className="h-3.5 w-3.5" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {aiGenerating
                        ? "Generating…"
                        : aiGeneratedFor === "add"
                          ? "Regenerate"
                          : aiMode === "improve"
                            ? "Improve draft"
                            : "Generate draft"}
                    </Button>
                  </div>
                )}
                {/* AI Compare View — shows after generation, before accept/discard */}
                {aiCompareFor === "add" && aiProposed && (
                  <div className="border border-primary/30 rounded-lg overflow-hidden">
                    <div className="bg-primary/5 border-b border-primary/20 px-3 py-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5" />
                        Review AI draft — accept or discard
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px] gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                          type="button"
                          onClick={discardAiDraft}
                        >
                          Discard
                        </Button>
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[11px] gap-1"
                          type="button"
                          onClick={acceptAiDraft}
                        >
                          Accept draft
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-border">
                      <div className="p-3 space-y-2 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Your draft</p>
                        <div className="space-y-1.5">
                          {aiOriginalSnapshot?.subject || aiOriginalSnapshot?.body ? (
                            <>
                              <p className="text-[11px] font-medium text-muted-foreground leading-snug line-clamp-1">
                                {aiOriginalSnapshot.subject || <span className="italic opacity-50">No subject</span>}
                              </p>
                              <p className="text-[11px] text-muted-foreground/80 leading-relaxed whitespace-pre-wrap line-clamp-6">
                                {aiOriginalSnapshot.body || <span className="italic opacity-50">No body</span>}
                              </p>
                            </>
                          ) : (
                            <p className="text-[11px] text-muted-foreground/50 italic">Empty — no existing draft</p>
                          )}
                        </div>
                      </div>
                      <div className="p-3 space-y-2 min-w-0 bg-primary/[0.03]">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/70">AI Draft</p>
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-medium leading-snug line-clamp-1">{aiProposed.subject}</p>
                          <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap line-clamp-6">{aiProposed.body}</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200/60 dark:border-amber-800/40 px-3 py-1.5">
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
                        <Sparkles className="h-3 w-3 shrink-0" />
                        AI-generated — review before saving. You can also edit manually after accepting.
                      </p>
                    </div>
                  </div>
                )}
                {aiGeneratedFor === "add" && aiPanelOpen !== "add" && !aiCompareFor && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    AI-generated — review before saving.
                    <button type="button" onClick={() => setAiPanelOpen("add")} className="underline hover:no-underline ml-0.5">
                      <RefreshCw className="h-2.5 w-2.5 inline mr-0.5" />Regenerate
                    </button>
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground whitespace-nowrap">
                    Send after
                  </label>
                  <Input
                    type="number"
                    min={0}
                    className="w-20"
                    value={stepForm.delayDays}
                    onChange={(e) =>
                      setStepForm((f) => ({
                        ...f,
                        delayDays: parseInt(e.target.value) || 0,
                      }))
                    }
                  />
                  <label className="text-sm text-muted-foreground">
                    day{stepForm.delayDays !== 1 ? "s" : ""}
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => addStepMutation.mutate()}
                    disabled={
                      !stepForm.subject.trim() ||
                      !stepForm.body.trim() ||
                      addStepMutation.isPending
                    }
                  >
                    {addStepMutation.isPending ? "Adding…" : "Add Step"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAddingStep(false);
                      setStepForm({ subject: "", body: "", delayDays: 1 });
                      setAiProposed(null);
                      setAiOriginalSnapshot(null);
                      setAiCompareFor(null);
                      setAiGeneratedFor(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Triggers */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Triggers
                </CardTitle>
                <CardDescription>
                  Automatically enroll contacts when a deal moves to a specific
                  stage.
                </CardDescription>
              </div>
              {!addingTrigger && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddingTrigger(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Trigger
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sequence.triggers.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                >
                  <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1">
                    When a deal moves to{" "}
                    <span className="font-medium">{t.triggerValue}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => deleteTriggerMutation.mutate(t.id)}
                    disabled={deleteTriggerMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {sequence.triggers.length === 0 && !addingTrigger && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No triggers yet. Add one to auto-enroll contacts.
                </p>
              )}
              {addingTrigger && (
                <div className="border rounded-md p-3 space-y-3 bg-muted/30 mt-2">
                  <p className="text-sm font-medium">When a deal moves to…</p>
                  <Select
                    value={triggerStageValue}
                    onValueChange={setTriggerStageValue}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pick a stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {dealStages.map((s) => (
                        <SelectItem key={s.id} value={s.name}>
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: s.color }}
                            />
                            {s.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!triggerStageValue || addTriggerMutation.isPending}
                      onClick={() => addTriggerMutation.mutate(triggerStageValue)}
                    >
                      {addTriggerMutation.isPending ? "Saving…" : "Save Trigger"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAddingTrigger(false);
                        setTriggerStageValue("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Exit conditions */}
        <Card>
          <CardHeader className="pb-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldOff className="h-5 w-5" />
                Exit Conditions
              </CardTitle>
              <CardDescription>
                Automatically stop the sequence for a contact when any of these
                conditions are met.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  key: "exitOnDealWon" as const,
                  label: "Stop when deal is marked Won",
                  description:
                    "Exits if the contact has any deal moved to a Won stage.",
                  value: sequence.exitOnDealWon,
                },
                {
                  key: "exitOnDealLost" as const,
                  label: "Stop when deal is marked Lost",
                  description:
                    "Exits if the contact has any deal moved to a Lost stage.",
                  value: sequence.exitOnDealLost,
                },
                {
                  key: "exitOnUnsubscribe" as const,
                  label: "Stop when contact unsubscribes",
                  description:
                    "Exits if the contact's marketing email opt-in is turned off.",
                  value: sequence.exitOnUnsubscribe,
                },
              ].map(({ key, label, description, value }) => (
                <div key={key} className="flex items-start gap-4">
                  <Switch
                    checked={value}
                    onCheckedChange={(checked) =>
                      exitConditionMutation.mutate({ [key]: checked })
                    }
                    disabled={exitConditionMutation.isPending}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Enrollments */}
        {enrollments.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Enrollments
              </CardTitle>
              <CardDescription>
                {activeEnrollments.length} active of {enrollments.length} total
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {enrollments.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{e.contactName}</span>
                        <StatusBadge status={e.status} />
                        {e.enrolledVia === "TRIGGER" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-normal gap-1 h-4 px-1.5 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
                          >
                            <Zap className="h-2.5 w-2.5" />
                            Auto
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {e.contactEmail && (
                          <span className="mr-3">{e.contactEmail}</span>
                        )}
                        {e.status === "ACTIVE" && e.nextSendAt && (
                          <span className="flex items-center gap-1 inline-flex">
                            <Clock className="h-3 w-3" />
                            Next: {format(new Date(e.nextSendAt), "MMM d, h:mm a")}
                          </span>
                        )}
                        {e.status === "COMPLETED" && e.exitReason && (
                          <span className="flex items-center gap-1 inline-flex text-amber-600 dark:text-amber-400">
                            <ShieldOff className="h-3 w-3" />
                            Exited: {e.exitReason}
                          </span>
                        )}
                        {e.status === "COMPLETED" && !e.exitReason && (
                          <span className="flex items-center gap-1 inline-flex text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Completed all {steps.length} steps
                          </span>
                        )}
                        {e.status === "UNENROLLED" && (
                          <span className="flex items-center gap-1 inline-flex">
                            <XCircle className="h-3 w-3" />
                            Unenrolled after step {e.currentStep + 1}
                          </span>
                        )}
                      </div>
                    </div>
                    {e.status === "ACTIVE" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Unenroll contact?</AlertDialogTitle>
                            <AlertDialogDescription>
                              <strong>{e.contactName}</strong> will stop
                              receiving emails from this sequence immediately.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => unenrollMutation.mutate(e.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Unenroll
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* AI draft sequence dialog */}
      <Dialog
        open={aiDraftOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAiDraftPreview(null);
          }
          setAiDraftOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Draft sequence with AI
            </DialogTitle>
          </DialogHeader>

          {/* Form — hidden once preview is shown */}
          {!aiDraftPreview && (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium">Sequence goal</label>
                <p className="text-xs text-muted-foreground mb-1.5">What should this email sequence accomplish?</p>
                <Textarea
                  placeholder="e.g. Warm up cold leads who downloaded our e-book and book a 15-min discovery call"
                  value={aiDraftGoal}
                  onChange={(e) => setAiDraftGoal(e.target.value)}
                  rows={3}
                  className="text-sm resize-none"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Number of steps</label>
                  <Select
                    value={String(aiDraftNumSteps)}
                    onValueChange={(v) => setAiDraftNumSteps(Number(v))}
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
                  <Select value={aiDraftTone} onValueChange={setAiDraftTone}>
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
                  value={aiDraftContext}
                  onChange={(e) => setAiDraftContext(e.target.value)}
                  rows={2}
                  className="mt-1.5 text-sm resize-none"
                />
              </div>
            </div>
          )}

          {/* Preview */}
          {aiDraftPreview && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium flex-1">
                  {aiDraftPreview.length > 0
                    ? `${aiDraftPreview.length} step${aiDraftPreview.length === 1 ? "" : "s"} generated — review before saving`
                    : <span className="text-destructive font-medium">Add at least one step to save</span>
                  }
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setAiDraftPreview(null)}
                >
                  <RefreshCw className="h-3 w-3" />
                  Edit inputs
                </Button>
              </div>
              <ol className="space-y-3">
                {aiDraftPreview.map((step, i) => (
                  <li key={i} className="border rounded-lg p-4 space-y-3 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <span className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        {i === 0 ? (
                          <span className="text-xs text-muted-foreground">Send immediately</span>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>Send</span>
                            <Input
                              type="number"
                              min={1}
                              value={step.delayDays}
                              onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value) || 1);
                                setAiDraftPreview((prev) =>
                                  prev
                                    ? prev.map((s, j) =>
                                        j === i ? { ...s, delayDays: val } : s,
                                      )
                                    : prev,
                                );
                              }}
                              className="h-6 w-14 text-xs text-center px-1 py-0"
                            />
                            <span>day{step.delayDays !== 1 ? "s" : ""} after step {i}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          disabled={i === 0}
                          onClick={() =>
                            setAiDraftPreview((prev) => {
                              if (!prev) return prev;
                              const next = [...prev];
                              [next[i - 1], next[i]] = [next[i], next[i - 1]];
                              return next;
                            })
                          }
                          title="Move up"
                          type="button"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          disabled={i === aiDraftPreview.length - 1}
                          onClick={() =>
                            setAiDraftPreview((prev) => {
                              if (!prev) return prev;
                              const next = [...prev];
                              [next[i], next[i + 1]] = [next[i + 1], next[i]];
                              return next;
                            })
                          }
                          title="Move down"
                          type="button"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() =>
                            setAiDraftPreview((prev) =>
                              prev ? prev.filter((_, j) => j !== i) : prev,
                            )
                          }
                          disabled={aiDraftPreview.length <= 1}
                          title="Remove step"
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="sr-only">Remove step {i + 1}</span>
                        </Button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Subject</label>
                      <Input
                        value={step.subject}
                        onChange={(e) =>
                          setAiDraftPreview((prev) =>
                            prev
                              ? prev.map((s, j) =>
                                  j === i ? { ...s, subject: e.target.value } : s,
                                )
                              : prev,
                          )
                        }
                        className="text-sm font-medium"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Body</label>
                      <Textarea
                        value={step.body}
                        rows={4}
                        onChange={(e) =>
                          setAiDraftPreview((prev) =>
                            prev
                              ? prev.map((s, j) =>
                                  j === i ? { ...s, body: e.target.value } : s,
                                )
                              : prev,
                          )
                        }
                        className="text-sm resize-none"
                      />
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {!aiDraftPreview ? (
              <>
                <Button variant="outline" onClick={() => setAiDraftOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={generateAiDraftSequence}
                  disabled={!aiDraftGoal.trim() || aiDraftGenerating}
                  className="gap-2"
                >
                  {aiDraftGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {aiDraftGenerating ? "Generating…" : "Generate draft"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setAiDraftOpen(false)}
                  disabled={aiDraftSaving}
                >
                  Dismiss
                </Button>
                <Button
                  variant="ghost"
                  onClick={generateAiDraftSequence}
                  disabled={aiDraftGenerating || aiDraftSaving}
                  className="gap-1.5"
                >
                  {aiDraftGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Regenerate
                </Button>
                <Button
                  onClick={acceptAiDraftSequence}
                  disabled={aiDraftSaving || aiDraftGenerating || aiDraftPreview.length === 0}
                  className="gap-2"
                >
                  {aiDraftSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {aiDraftSaving ? "Saving…" : `Accept all ${aiDraftPreview.length} steps`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enroll contacts dialog */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enroll Contacts</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Search contacts…"
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto divide-y border rounded-md">
              {filteredContacts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No contacts found
                </p>
              ) : (
                filteredContacts.map((c) => {
                  const label =
                    [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                    c.email;
                  const checked = selectedContactIds.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedContactIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(c.id);
                            else next.delete(c.id);
                            return next;
                          });
                        }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{label}</p>
                        {c.email && label !== c.email && (
                          <p className="text-xs text-muted-foreground truncate">
                            {c.email}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            {selectedContactIds.size > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedContactIds.size} contact
                {selectedContactIds.size !== 1 ? "s" : ""} selected
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEnrollOpen(false);
                setSelectedContactIds(new Set());
                setContactSearch("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={selectedContactIds.size === 0 || enrollMutation.isPending}
              onClick={() => enrollMutation.mutate([...selectedContactIds])}
            >
              {enrollMutation.isPending
                ? "Enrolling…"
                : `Enroll ${selectedContactIds.size || ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarLayout>
  );
}
