import { useSessionToken } from "@/hooks/use-session-token";
import { useState } from "react";
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
} from "lucide-react";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Step {
  id: string;
  subject: string;
  body: string;
  delayDays: number;
  stepOrder: number;
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
}

interface SequenceDetail {
  id: string;
  name: string;
  steps: Step[];
  enrollments: Enrollment[];
}

function useApi() {
  const getToken = useSessionToken();
  return async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`${BASE}/api${path}`, {
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
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No steps yet. Add one to get started.</p>
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
                        <Input
                          placeholder="Email subject"
                          value={editingStep.subject}
                          onChange={(e) =>
                            setEditingStep((s) =>
                              s ? { ...s, subject: e.target.value } : null,
                            )
                          }
                        />
                        <Textarea
                          placeholder="Email body"
                          value={editingStep.body}
                          rows={4}
                          onChange={(e) =>
                            setEditingStep((s) =>
                              s ? { ...s, body: e.target.value } : null,
                            )
                          }
                        />
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
                            onClick={() => setEditingStep(null)}
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
                            {step.subject}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {step.body}
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
                <Input
                  placeholder="Email subject"
                  value={stepForm.subject}
                  onChange={(e) =>
                    setStepForm((f) => ({ ...f, subject: e.target.value }))
                  }
                  autoFocus
                />
                <Textarea
                  placeholder="Email body"
                  value={stepForm.body}
                  rows={4}
                  onChange={(e) =>
                    setStepForm((f) => ({ ...f, body: e.target.value }))
                  }
                />
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
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
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
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{e.contactName}</span>
                        <StatusBadge status={e.status} />
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
                        {e.status === "COMPLETED" && (
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
