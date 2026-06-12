import { useState } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useSessionToken } from "@/hooks/use-session-token";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@workspace/api-client-react";
import { Users, UserPlus, Trash2, Shield, CalendarClock, Pause, Play, Sparkles, Pencil, Check, X, Globe, Lock } from "lucide-react";
import { CustomFieldsSettings } from "@/components/custom-fields/custom-fields-settings";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "ADMIN" | "MEMBER";
  createdAt: string;
}

interface TeamData {
  members: TeamMember[];
  pending: unknown[];
}

interface ScheduledExport {
  id: string;
  frequency: "daily" | "weekly";
  dataType: "tasks" | "activities" | "notes" | "combined";
  deliveryEmail: string;
  paused: boolean;
  lastSentAt: string | null;
  nextSendAt: string;
  createdAt: string;
}

function usePresetsAdminApi() {
  const getToken = useSessionToken();

  const authFetch = async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`/api/users${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed (${res.status})`);
    }
    return res.json();
  };

  return { authFetch };
}

function useTeamApi() {
  const getToken = useSessionToken();

  const authFetch = async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`/api/team${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed (${res.status})`);
    }
    return res.json();
  };

  return { authFetch };
}

function useScheduledExportsApi() {
  const getToken = useSessionToken();

  const authFetch = async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`/api/scheduled-exports${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed (${res.status})`);
    }
    return res.json();
  };

  return { authFetch };
}

const DATA_TYPE_LABELS: Record<string, string> = {
  tasks: "Tasks",
  activities: "Activities",
  notes: "Notes",
  combined: "Combined Report",
};

function ScheduledExportsSection() {
  const { authFetch } = useScheduledExportsApi();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: schedules = [], isLoading } = useQuery<ScheduledExport[]>({
    queryKey: ["scheduled-exports"],
    queryFn: () => authFetch(""),
    staleTime: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, paused }: { id: string; paused: boolean }) =>
      authFetch(`/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ paused }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled-exports"] }),
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-exports"] });
      toast({ title: "Scheduled export deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Scheduled Exports
        </CardTitle>
        <CardDescription>
          Automated CSV exports delivered to your inbox.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
            ))}
          </div>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scheduled exports yet.</p>
        ) : (
          <div className="divide-y">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {DATA_TYPE_LABELS[s.dataType]} — {s.frequency === "daily" ? "Daily" : "Weekly (Mon)"}
                    </span>
                    {s.paused && (
                      <Badge variant="secondary" className="text-xs">Paused</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    To: {s.deliveryEmail}
                    {" · "}
                    Next: {format(new Date(s.nextSendAt), "MMM d, yyyy 'at' h:mm a")}
                    {s.lastSentAt && (
                      <> · Last sent: {format(new Date(s.lastSentAt), "MMM d, yyyy")}</>
                    )}
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                  title={s.paused ? "Resume" : "Pause"}
                  disabled={toggleMutation.isPending}
                  onClick={() => toggleMutation.mutate({ id: s.id, paused: !s.paused })}
                >
                  {s.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete scheduled export?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently stop the{" "}
                        <strong>{s.frequency}</strong> {DATA_TYPE_LABELS[s.dataType].toLowerCase()} export
                        to <strong>{s.deliveryEmail}</strong>. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(s.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AiPresetsSection() {
  const { authFetch } = usePresetsAdminApi();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const { data: presets = [], isLoading } = useQuery<AdminPreset[]>({
    queryKey: ["admin-ai-presets"],
    queryFn: () => authFetch("/admin/ai-presets"),
    staleTime: 30_000,
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; name?: string; category?: string | null; shared?: boolean }) =>
      authFetch(`/me/ai-presets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-ai-presets"] }),
    onError: (err: Error) => {
      toast({ title: "Failed to update preset", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      authFetch(`/me/ai-presets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ai-presets"] });
      toast({ title: "Preset deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete preset", description: err.message, variant: "destructive" });
    },
  });

  const startEdit = (preset: AdminPreset) => {
    setEditingId(preset.id);
    setEditName(preset.name);
    setEditCategory(preset.category ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditCategory("");
  };

  const commitEdit = (preset: AdminPreset) => {
    const newName = editName.trim();
    const newCategory = editCategory.trim() || null;
    if (!newName) return;
    if (newName === preset.name && newCategory === (preset.category ?? null)) {
      cancelEdit();
      return;
    }
    patchMutation.mutate(
      { id: preset.id, name: newName, category: newCategory },
      { onSuccess: cancelEdit },
    );
  };

  const IMPROVE_LABELS: Record<string, string> = {
    subject: "Subject line",
    body: "Email body",
    both: "Subject + body",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Presets
        </CardTitle>
        <CardDescription>
          Shared presets available to all team members. Rename, re-categorize, share/unshare, or delete any preset.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
            ))}
          </div>
        ) : presets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No shared presets yet. Team members can share their AI writer presets from inside a sequence.
          </p>
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
                        <Input
                          className="h-7 text-sm"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Preset name"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit(preset);
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                        <Input
                          className="h-7 text-sm"
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          placeholder="Category (optional)"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit(preset);
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{preset.name}</span>
                          {preset.category && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              {preset.category}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 space-x-1">
                          <span>{preset.tone}</span>
                          <span>·</span>
                          <span>{IMPROVE_LABELS[preset.improveFields] ?? preset.improveFields}</span>
                          <span>·</span>
                          <span>By {creator}</span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    {isEditing ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-green-600 hover:text-green-700"
                          disabled={patchMutation.isPending}
                          onClick={() => commitEdit(preset)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={cancelEdit}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => startEdit(preset)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Rename / re-categorize</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              disabled={patchMutation.isPending}
                              onClick={() =>
                                patchMutation.mutate({ id: preset.id, shared: !preset.shared })
                              }
                            >
                              {preset.shared ? (
                                <Globe className="h-4 w-4 text-primary" />
                              ) : (
                                <Lock className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{preset.shared ? "Unshare (make private)" : "Share with team"}</TooltipContent>
                        </Tooltip>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete preset?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete <strong>{preset.name}</strong> and remove
                                it from the team's AI writer. This cannot be undone.
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
  );
}

export function SettingsTeamPage() {
  const { data: me } = useGetMe();
  const { authFetch } = useTeamApi();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addPassword, setAddPassword] = useState("");

  const { data, isLoading } = useQuery<TeamData>({
    queryKey: ["team"],
    queryFn: () => authFetch(""),
    staleTime: 30_000,
  });

  const addUserMutation = useMutation({
    mutationFn: ({ email, name, password }: { email: string; name: string; password: string }) =>
      authFetch("/add-user", {
        method: "POST",
        body: JSON.stringify({ email, name, password }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      setAddEmail("");
      setAddName("");
      setAddPassword("");
      toast({ title: "Team member added", description: `Account created for ${addEmail}` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add member", description: err.message, variant: "destructive" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      authFetch(`/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      toast({ title: "Role updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update role", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      authFetch(`/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      toast({ title: "Team member removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove member", description: err.message, variant: "destructive" });
    },
  });

  const isAdmin = me?.role === "ADMIN";
  const hasNoAdmins = !isLoading && (data?.members ?? []).filter((m) => m.role === "ADMIN").length === 0;

  const bootstrapAdminMutation = useMutation({
    mutationFn: () =>
      authFetch("/bootstrap-admin", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast({ title: "You are now an Admin!", description: "Refresh the page to see full admin controls." });
    },
    onError: (err: Error) => {
      toast({ title: "Could not promote", description: err.message, variant: "destructive" });
    },
  });

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addEmail.trim() || !addPassword.trim()) return;
    addUserMutation.mutate({
      email: addEmail.trim(),
      name: addName.trim(),
      password: addPassword,
    });
  };

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your team and workspace.</p>
        </div>

        {/* Add team member — admins only */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Add Team Member
              </CardTitle>
              <CardDescription>
                Create a login for a new team member. Share their temporary password securely.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddUser} className="space-y-3 max-w-md">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="add-name">Name</Label>
                    <Input
                      id="add-name"
                      type="text"
                      placeholder="Jane Smith"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      disabled={addUserMutation.isPending}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="add-email">Email</Label>
                    <Input
                      id="add-email"
                      type="email"
                      placeholder="jane@example.com"
                      value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)}
                      required
                      disabled={addUserMutation.isPending}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="add-password">Temporary password</Label>
                  <Input
                    id="add-password"
                    type="text"
                    placeholder="Min. 8 characters"
                    value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)}
                    required
                    disabled={addUserMutation.isPending}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={addUserMutation.isPending || !addEmail.trim() || !addPassword.trim()}
                >
                  {addUserMutation.isPending ? "Adding…" : "Add team member"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Team members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
            </CardTitle>
            <CardDescription>
              {isLoading
                ? "Loading…"
                : `${data?.members.length ?? 0} member${(data?.members.length ?? 0) !== 1 ? "s" : ""}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y">
                {data?.members.map((member) => {
                  const isSelf = member.id === me?.id;
                  return (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarImage src={member.avatarUrl ?? undefined} />
                        <AvatarFallback>
                          {(member.name?.[0] ?? member.email[0]).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {member.name ?? member.email}
                          </span>
                          {isSelf && (
                            <span className="text-xs text-muted-foreground">(you)</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {member.email} · Joined{" "}
                          {format(new Date(member.createdAt), "MMM d, yyyy")}
                        </div>
                      </div>

                      {/* Role */}
                      {isAdmin && !isSelf ? (
                        <Select
                          value={member.role}
                          onValueChange={(role) =>
                            changeRoleMutation.mutate({ userId: member.id, role })
                          }
                          disabled={changeRoleMutation.isPending}
                        >
                          <SelectTrigger className="w-28 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                            <SelectItem value="MEMBER">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant={member.role === "ADMIN" ? "default" : "secondary"}
                          className="flex items-center gap-1 text-xs"
                        >
                          {member.role === "ADMIN" && (
                            <Shield className="h-3 w-3" />
                          )}
                          {member.role === "ADMIN" ? "Admin" : "Member"}
                        </Badge>
                      )}

                      {/* Remove button — admin only, not self */}
                      {isAdmin && !isSelf && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove team member?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove{" "}
                                <strong>{member.name ?? member.email}</strong> from
                                MyCRM. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeMutation.mutate(member.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scheduled Exports — admins only */}
        {isAdmin && <ScheduledExportsSection />}

        {/* AI Presets — admins only */}
        {isAdmin && <AiPresetsSection />}

        {/* Custom Fields — admins only */}
        {isAdmin && <CustomFieldsSettings />}

        {/* Non-admin: bootstrap prompt when no admin exists yet */}
        {!isAdmin && hasNoAdmins && (
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <Shield className="h-4 w-4" />
                No admin yet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
                This workspace has no admin. Since you're the first here, you can claim admin access to start managing the team.
              </p>
              <Button
                onClick={() => bootstrapAdminMutation.mutate()}
                disabled={bootstrapAdminMutation.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {bootstrapAdminMutation.isPending ? "Claiming…" : "Claim Admin Access"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Non-admin: read-only notice (when admins do exist) */}
        {!isAdmin && !hasNoAdmins && !isLoading && (
          <p className="text-sm text-muted-foreground">
            Only admins can add or remove team members. Contact an admin to make changes.
          </p>
        )}
      </div>
    </SidebarLayout>
  );
}
