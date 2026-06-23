import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionToken } from "@/hooks/use-session-token";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, MoreHorizontal, Pencil, Trash2, LayoutDashboard, Download, Share2, Sparkles, RefreshCw, CheckSquare } from "lucide-react";
import { PipelineOverview } from "@/components/dashboards/pipeline-overview";
import { DashboardView } from "@/components/dashboards/dashboard-view";
import { BASE, type Dashboard } from "@/components/dashboards/types";
import { useGetMe } from "@workspace/api-client-react";
import { ShareDialog } from "@/components/contacts/share-dialog";

const BUILTIN_ID = "__pipeline_overview__";

const ACTION_DELIMITER = "\n\nAction Items:\n";
function parseSummary(raw: string): { text: string; items: string[] } {
  const idx = raw.indexOf(ACTION_DELIMITER);
  if (idx === -1) return { text: raw, items: [] };
  const text = raw.slice(0, idx);
  const items = raw
    .slice(idx + ACTION_DELIMITER.length)
    .split("\n")
    .map(l => l.replace(/^[•\-]\s*/, "").trim())
    .filter(Boolean);
  return { text, items };
}

export function ReportsPage() {
  const getToken = useSessionToken();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: me } = useGetMe();
  const [activeId, setActiveId] = useState<string>(BUILTIN_ID);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Dashboard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Dashboard | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summaryPending, setSummaryPending] = useState(false);

  const canMutate = (d: Dashboard | null) => {
    if (!d || d.builtin) return false;
    if (me?.role === "ADMIN") return true;
    return !!(d.createdBy && d.createdBy === me?.id);
  };

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    [getToken],
  );

  const { data: dashboards } = useQuery<Dashboard[]>({
    queryKey: ["dashboards"],
    queryFn: () => authFetch(`${BASE}/api/dashboards`),
  });

  const createDashboard = useMutation({
    mutationFn: (payload: { name: string; description: string }) =>
      authFetch(`${BASE}/api/dashboards`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (created: Dashboard) => {
      qc.invalidateQueries({ queryKey: ["dashboards"] });
      setCreateOpen(false);
      setDraftName("");
      setDraftDesc("");
      setActiveId(created.id);
      toast({ title: "Dashboard created" });
    },
    onError: () => toast({ title: "Couldn't create dashboard", variant: "destructive" }),
  });

  const renameDashboard = useMutation({
    mutationFn: ({ id, name, description }: { id: string; name: string; description: string }) =>
      authFetch(`${BASE}/api/dashboards/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboards"] });
      setRenameTarget(null);
      toast({ title: "Dashboard updated" });
    },
    onError: () => toast({ title: "Couldn't update dashboard", variant: "destructive" }),
  });

  const deleteDashboard = useMutation({
    mutationFn: (id: string) => authFetch(`${BASE}/api/dashboards/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["dashboards"] });
      setDeleteTarget(null);
      if (activeId === id) setActiveId(BUILTIN_ID);
      toast({ title: "Dashboard deleted" });
    },
    onError: () => toast({ title: "Couldn't delete dashboard", variant: "destructive" }),
  });

  const tabs = useMemo(
    () => [
      { id: BUILTIN_ID, name: "Pipeline Overview", builtin: true as const, dashboard: null as Dashboard | null },
      ...(dashboards ?? []).map((d) => ({ id: d.id, name: d.name, builtin: false as const, dashboard: d })),
    ],
    [dashboards],
  );

  // If the active dashboard disappears (deleted elsewhere), fall back to builtin.
  useEffect(() => {
    if (!tabs.some((t) => t.id === activeId)) setActiveId(BUILTIN_ID);
  }, [tabs, activeId]);

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
            <p className="text-muted-foreground">
              {active.builtin
                ? "Pipeline health, win rates, and revenue forecast."
                : active.dashboard?.description || "Custom analytics dashboard."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setSummaryPending(true);
                try {
                  const token = await getToken();
                  const res = await fetch(`${BASE}/api/reports/ai-summary`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  if (!res.ok) throw new Error("Failed");
                  const data = await res.json() as { summary: string };
                  setAiSummary(data.summary);
                  toast({ title: aiSummary ? "Summary refreshed" : "AI summary generated" });
                } catch {
                  toast({ title: "Could not generate summary", variant: "destructive" });
                } finally {
                  setSummaryPending(false);
                }
              }}
              disabled={summaryPending}
            >
              {summaryPending
                ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                : <Sparkles className="h-4 w-4 mr-1.5" />}
              {summaryPending ? "Generating…" : "AI Summary"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="h-4 w-4 mr-1.5" />
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Download PDF
            </Button>
          </div>
        </div>

        {/* Dashboard switcher */}
        <div className="flex items-center gap-2 border-b overflow-x-auto pb-px">
          {tabs.map((t) => (
            <div key={t.id} className="relative flex items-center shrink-0">
              <button
                onClick={() => setActiveId(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  t.id === activeId
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutDashboard className="h-4 w-4" />
                {t.name}
              </button>
              {!t.builtin && t.id === activeId && canMutate(t.dashboard) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 mr-1">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onClick={() => {
                        setRenameTarget(t.dashboard);
                        setDraftName(t.dashboard?.name ?? "");
                        setDraftDesc(t.dashboard?.description ?? "");
                      }}
                    >
                      <Pencil className="h-4 w-4 mr-2" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteTarget(t.dashboard)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete dashboard
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            onClick={() => { setDraftName(""); setDraftDesc(""); setCreateOpen(true); }}
          >
            <Plus className="h-4 w-4 mr-1" />
            New dashboard
          </Button>
        </div>

        {/* AI Summary card */}
        {aiSummary && (() => {
          const { text, items } = parseSummary(aiSummary);
          return (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-5 py-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                  <Sparkles className="h-4 w-4" />
                  AI summary
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground print:hidden"
                  title="Regenerate"
                  disabled={summaryPending}
                  onClick={async () => {
                    setSummaryPending(true);
                    try {
                      const token = await getToken();
                      const res = await fetch(`${BASE}/api/reports/ai-summary`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      if (!res.ok) throw new Error("Failed");
                      const data = await res.json() as { summary: string };
                      setAiSummary(data.summary);
                      toast({ title: "Summary refreshed" });
                    } catch {
                      toast({ title: "Could not regenerate summary", variant: "destructive" });
                    } finally {
                      setSummaryPending(false);
                    }
                  }}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${summaryPending ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <p className="text-sm leading-relaxed">{text}</p>
              {items.length > 0 && (
                <div className="mt-3 border-t border-primary/15 pt-3">
                  <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-primary">
                    <CheckSquare className="h-3.5 w-3.5" />
                    Action items
                  </p>
                  <ul className="space-y-2">
                    {items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm leading-snug">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-primary/30 bg-background text-[10px] font-bold text-primary">
                          {i + 1}
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}

        {/* Active dashboard content */}
        {active.builtin
          ? <PipelineOverview />
          : <DashboardView dashboardId={active.id} canEdit={canMutate(active.dashboard)} />
        }
      </div>

      {/* Share dialog */}
      <ShareDialog
        record={{ id: activeId, name: active.name, type: "report" }}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New dashboard</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="e.g. Activity Tracker" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} rows={2} placeholder="What this dashboard tracks" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!draftName.trim() || createDashboard.isPending}
              onClick={() => createDashboard.mutate({ name: draftName.trim(), description: draftDesc.trim() })}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename dashboard</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button
              disabled={!draftName.trim() || renameDashboard.isPending}
              onClick={() =>
                renameTarget &&
                renameDashboard.mutate({ id: renameTarget.id, name: draftName.trim(), description: draftDesc.trim() })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" and all its cards will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteDashboard.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarLayout>
  );
}
