import { useState } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useSessionToken } from "@/hooks/use-session-token";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@workspace/api-client-react";
import { Users, UserPlus, Trash2, Shield } from "lucide-react";
import { format } from "date-fns";

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

export function SettingsTeamPage() {
  const getToken = useSessionToken();
  const { data: me } = useGetMe();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addPassword, setAddPassword] = useState("");

  const authFetch = async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`/api/team${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
    });
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as { error?: string }).error ?? `Error ${res.status}`); }
    return res.json();
  };

  const { data, isLoading } = useQuery<TeamData>({
    queryKey: ["team"],
    queryFn: () => authFetch(""),
    staleTime: 30_000,
  });

  const addUserMutation = useMutation({
    mutationFn: ({ email, name, password }: { email: string; name: string; password: string }) =>
      authFetch("/add-user", { method: "POST", body: JSON.stringify({ email, name, password }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      setAddEmail(""); setAddName(""); setAddPassword("");
      toast({ title: "Team member added", description: `Account created for ${addEmail}` });
    },
    onError: (err: Error) => toast({ title: "Failed to add member", description: err.message, variant: "destructive" }),
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      authFetch(`/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); toast({ title: "Role updated" }); },
    onError: (err: Error) => toast({ title: "Failed to update role", description: err.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => authFetch(`/${userId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); toast({ title: "Team member removed" }); },
    onError: (err: Error) => toast({ title: "Failed to remove member", description: err.message, variant: "destructive" }),
  });

  const bootstrapAdminMutation = useMutation({
    mutationFn: () => authFetch("/bootstrap-admin", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast({ title: "You are now an Admin!", description: "Refresh the page to see full admin controls." });
    },
    onError: (err: Error) => toast({ title: "Could not promote", description: err.message, variant: "destructive" }),
  });

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addEmail.trim() || !addPassword.trim()) return;
    addUserMutation.mutate({ email: addEmail.trim(), name: addName.trim(), password: addPassword });
  };

  const isAdmin = me?.role === "ADMIN";
  const hasNoAdmins = !isLoading && (data?.members ?? []).filter((m) => m.role === "ADMIN").length === 0;

  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">Manage team members and their roles.</p>
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
                    <Input id="add-name" type="text" placeholder="Jane Smith" value={addName}
                      onChange={(e) => setAddName(e.target.value)} disabled={addUserMutation.isPending} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="add-email">Email</Label>
                    <Input id="add-email" type="email" placeholder="jane@example.com" value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)} required disabled={addUserMutation.isPending} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="add-password">Temporary password</Label>
                  <Input id="add-password" type="text" placeholder="Min. 8 characters" value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)} required disabled={addUserMutation.isPending} />
                </div>
                <Button type="submit" disabled={addUserMutation.isPending || !addEmail.trim() || !addPassword.trim()}>
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
              {isLoading ? "Loading…" : `${data?.members.length ?? 0} member${(data?.members.length ?? 0) !== 1 ? "s" : ""}`}
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
                    <div key={member.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarImage src={member.avatarUrl ?? undefined} />
                        <AvatarFallback>{(member.name?.[0] ?? member.email[0]).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{member.name ?? member.email}</span>
                          {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {member.email} · Joined {format(new Date(member.createdAt), "MMM d, yyyy")}
                        </div>
                      </div>
                      {isAdmin && !isSelf ? (
                        <Select value={member.role} onValueChange={(role) => changeRoleMutation.mutate({ userId: member.id, role })}
                          disabled={changeRoleMutation.isPending}>
                          <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                            <SelectItem value="MEMBER">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={member.role === "ADMIN" ? "default" : "secondary"} className="flex items-center gap-1 text-xs">
                          {member.role === "ADMIN" && <Shield className="h-3 w-3" />}
                          {member.role === "ADMIN" ? "Admin" : "Member"}
                        </Badge>
                      )}
                      {isAdmin && !isSelf && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove team member?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove <strong>{member.name ?? member.email}</strong> from MyCRM. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => removeMutation.mutate(member.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
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

        {/* Non-admin: bootstrap prompt when no admin exists yet */}
        {!isAdmin && hasNoAdmins && (
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <Shield className="h-4 w-4" /> No admin yet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
                This workspace has no admin. Since you're the first here, you can claim admin access to start managing the team.
              </p>
              <Button onClick={() => bootstrapAdminMutation.mutate()} disabled={bootstrapAdminMutation.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white">
                {bootstrapAdminMutation.isPending ? "Claiming…" : "Claim Admin Access"}
              </Button>
            </CardContent>
          </Card>
        )}

        {!isAdmin && !hasNoAdmins && !isLoading && (
          <p className="text-sm text-muted-foreground">
            Only admins can add or remove team members. Contact an admin to make changes.
          </p>
        )}
      </div>
    </SidebarLayout>
  );
}
