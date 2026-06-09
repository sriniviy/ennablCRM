import { useState } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useAuth } from "@clerk/react";
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
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@workspace/api-client-react";
import { Users, UserPlus, Mail, Trash2, Shield, Clock, CalendarClock, Pause, Play } from "lucide-react";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface TeamMember {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "ADMIN" | "MEMBER";
  createdAt: string;
}

interface PendingInvite {
  id: string;
  emailAddress: string;
  createdAt: string;
}

interface TeamData {
  members: TeamMember[];
  pending: PendingInvite[];
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

function useTeamApi() {
  const { getToken } = useAuth();

  const authFetch = async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`${BASE}/api/team${path}`, {
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
  const { getToken } = useAuth();

  const authFetch = async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`${BASE}/api/scheduled-exports${path}`, {
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
    if (res.status === 204) return null;
    return res.json();
  };

  return { authFetch };
}

const DATA_TYPE_LABELS: Record<string, string> = {
  tasks: "Tasks",
  activities: "Activities",
  notes: "Notes",
  combined: "Combined (all)",
};

function ScheduledExportsSection() {
  const { authFetch } = useScheduledExportsApi();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [frequency, setFrequency] = useState<"daily" | "weekly">("weekly");
  const [dataType, setDataType] = useState<"tasks" | "activities" | "notes" | "combined">("combined");
  const [email, setEmail] = useState("");

  const { data: schedules = [], isLoading } = useQuery<ScheduledExport[]>({
    queryKey: ["scheduled-exports"],
    queryFn: () => authFetch(""),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      authFetch("", {
        method: "POST",
        body: JSON.stringify({ frequency, dataType, deliveryEmail: email }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-exports"] });
      setEmail("");
      toast({ title: "Scheduled export created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, paused }: { id: string; paused: boolean }) =>
      authFetch(`/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ paused }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-exports"] });
    },
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

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    createMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Scheduled Exports
        </CardTitle>
        <CardDescription>
          Automatically email a CSV snapshot on a recurring schedule.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create form */}
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>

            <Select value={dataType} onValueChange={(v) => setDataType(v as typeof dataType)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tasks">Tasks</SelectItem>
                <SelectItem value="activities">Activities</SelectItem>
                <SelectItem value="notes">Notes</SelectItem>
                <SelectItem value="combined">Combined (all)</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="email"
              placeholder="recipient@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 min-w-48"
              disabled={createMutation.isPending}
            />

            <Button type="submit" disabled={createMutation.isPending || !email.trim()}>
              {createMutation.isPending ? "Adding…" : "Add Schedule"}
            </Button>
          </div>
        </form>

        {/* Existing schedules */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
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

export function SettingsTeamPage() {
  const { data: me } = useGetMe();
  const { authFetch } = useTeamApi();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState("");

  const { data, isLoading } = useQuery<TeamData>({
    queryKey: ["team"],
    queryFn: () => authFetch(""),
    staleTime: 30_000,
  });

  const inviteMutation = useMutation({
    mutationFn: (email: string) =>
      authFetch("/invite", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      setInviteEmail("");
      toast({ title: "Invitation sent", description: `Invite sent to ${inviteEmail}` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send invite", description: err.message, variant: "destructive" });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId: string) =>
      authFetch(`/invite/${inviteId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      toast({ title: "Invitation revoked" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to revoke", description: err.message, variant: "destructive" });
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

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    inviteMutation.mutate(inviteEmail.trim());
  };

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your team and workspace.</p>
        </div>

        {/* Invite form — admins only */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Invite Team Member
              </CardTitle>
              <CardDescription>
                Send an invitation email to add someone to your workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInvite} className="flex gap-2 max-w-md">
                <Input
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={inviteMutation.isPending}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  disabled={inviteMutation.isPending || !inviteEmail.trim()}
                >
                  {inviteMutation.isPending ? "Sending…" : "Send Invite"}
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
                                MyCRM and revoke their account access. This cannot be
                                undone.
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

        {/* Pending invitations */}
        {(data?.pending?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Pending Invitations
              </CardTitle>
              <CardDescription>
                Invitations awaiting acceptance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {data?.pending.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {invite.emailAddress}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Invited {format(new Date(invite.createdAt), "MMM d, yyyy")}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 dark:border-amber-700 dark:text-amber-400">
                      Pending
                    </Badge>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => revokeInviteMutation.mutate(invite.id)}
                        disabled={revokeInviteMutation.isPending}
                        title="Revoke invitation"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scheduled Exports — admins only */}
        {isAdmin && <ScheduledExportsSection />}

        {/* Non-admin: read-only notice */}
        {!isAdmin && !isLoading && (
          <p className="text-sm text-muted-foreground">
            Only admins can invite or remove team members. Contact an admin to make changes.
          </p>
        )}
      </div>
    </SidebarLayout>
  );
}
