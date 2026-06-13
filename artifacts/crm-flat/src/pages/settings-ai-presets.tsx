import { useState } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { Sparkles, Pencil, Check, X, Globe, Lock, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useSessionToken } from "@/hooks/use-session-token";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface AdminPreset {
  id: string;
  userId: string;
  name: string;
  category: string | null;
  goal: string;
  tone: string;
  improveFields: string;
  shared: boolean;
  createdAt: string;
  creatorName: string | null;
  creatorEmail: string | null;
}

const IMPROVE_LABELS: Record<string, string> = {
  subject: "Subject line",
  body: "Email body",
  both: "Subject + body",
};

export function SettingsAiPresetsPage() {
  const getToken = useSessionToken();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const authFetch = async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`/api/users${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
    });
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as { error?: string }).error ?? `Error ${res.status}`); }
    return res.json();
  };

  const { data: presets = [], isLoading } = useQuery<AdminPreset[]>({
    queryKey: ["admin-ai-presets"],
    queryFn: () => authFetch("/admin/ai-presets"),
    staleTime: 30_000,
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; name?: string; category?: string | null; shared?: boolean }) =>
      authFetch(`/me/ai-presets/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-ai-presets"] }),
    onError: (err: Error) => toast({ title: "Failed to update preset", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/me/ai-presets/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-ai-presets"] }); toast({ title: "Preset deleted" }); },
    onError: (err: Error) => toast({ title: "Failed to delete preset", description: err.message, variant: "destructive" }),
  });

  const startEdit = (p: AdminPreset) => { setEditingId(p.id); setEditName(p.name); setEditCategory(p.category ?? ""); };
  const cancelEdit = () => { setEditingId(null); setEditName(""); setEditCategory(""); };
  const commitEdit = (p: AdminPreset) => {
    const newName = editName.trim();
    const newCategory = editCategory.trim() || null;
    if (!newName) return;
    if (newName === p.name && newCategory === (p.category ?? null)) { cancelEdit(); return; }
    patchMutation.mutate({ id: p.id, name: newName, category: newCategory }, { onSuccess: cancelEdit });
  };

  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Presets</h1>
          <p className="text-sm text-muted-foreground">Shared AI writing presets available to all team members.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Presets</CardTitle>
            <CardDescription>Rename, re-categorize, share/unshare, or delete any preset.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3"><div className="space-y-1 flex-1"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-64" /></div></div>)}
              </div>
            ) : presets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No shared presets yet. Team members can share presets from inside a sequence.</p>
            ) : (
              <div className="divide-y">
                {presets.map((preset) => {
                  const isEditing = editingId === preset.id;
                  const creator = preset.creatorName ?? preset.creatorEmail ?? "Unknown";
                  return (
                    <div key={preset.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="space-y-2">
                            <Input className="h-7 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)}
                              placeholder="Preset name" autoFocus
                              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(preset); if (e.key === "Escape") cancelEdit(); }} />
                            <Input className="h-7 text-sm" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
                              placeholder="Category (optional)"
                              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(preset); if (e.key === "Escape") cancelEdit(); }} />
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{preset.name}</span>
                              {preset.category && <Badge variant="outline" className="text-xs px-1.5 py-0">{preset.category}</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 space-x-1">
                              <span>{preset.tone}</span><span>·</span>
                              <span>{IMPROVE_LABELS[preset.improveFields] ?? preset.improveFields}</span><span>·</span>
                              <span>By {creator}</span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        {isEditing ? (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700"
                              disabled={patchMutation.isPending} onClick={() => commitEdit(preset)}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={cancelEdit}>
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => startEdit(preset)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Rename / re-categorize</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  disabled={patchMutation.isPending}
                                  onClick={() => patchMutation.mutate({ id: preset.id, shared: !preset.shared })}>
                                  {preset.shared ? <Globe className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{preset.shared ? "Unshare (make private)" : "Share with team"}</TooltipContent>
                            </Tooltip>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete preset?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete <strong>{preset.name}</strong> and remove it from the team's AI writer.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteMutation.mutate(preset.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SidebarLayout>
  );
}
