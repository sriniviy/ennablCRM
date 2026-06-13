import { useState, useRef } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useSessionToken } from "@/hooks/use-session-token";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@workspace/api-client-react";
import {
  Users, UserPlus, Search, MoreHorizontal, Pencil, Trash2, Shield,
  ShieldOff, Archive, UserCheck, X, Lock,
} from "lucide-react";
import { format } from "date-fns";

/* ─── constants ─────────────────────────────────────────────── */

const INSURANCE_GROUP_SUGGESTIONS = [
  "NAHU",
  "NAIFA",
  "LIMRA",
  "GAMA International",
  "Million Dollar Round Table (MDRT)",
  "Top of the Table",
  "Court of the Table",
  "PIA National",
  "IIABA (Big I)",
  "IUL Alliance",
  "NAILBA",
  "NAPIA",
  "AHIP",
  "National Alliance",
  "Society of FSP",
  "AALU",
  "ACLI",
];

const STATUS_TABS = ["ALL", "ACTIVE", "INACTIVE", "ARCHIVED"] as const;
type StatusFilter = (typeof STATUS_TABS)[number];

/* ─── types ─────────────────────────────────────────────────── */

interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "ADMIN" | "MEMBER";
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  tags: string[];
  insuranceGroups: string[];
  title: string | null;
  phone: string | null;
  createdAt: string;
}

interface TeamData {
  members: TeamMember[];
  pending: unknown[];
}

interface MemberForm {
  name: string;
  email: string;
  password: string;
  title: string;
  phone: string;
  role: "ADMIN" | "MEMBER";
  tags: string[];
  insuranceGroups: string[];
}

const EMPTY_FORM: MemberForm = {
  name: "", email: "", password: "", title: "", phone: "",
  role: "MEMBER", tags: [], insuranceGroups: [],
};

/* ─── ChipInput ─────────────────────────────────────────────── */

function ChipInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
  disabled,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (tag: string) => {
    const t = tag.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput("");
    setOpen(false);
  };

  const remove = (tag: string) => onChange(value.filter((v) => v !== tag));

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(input.toLowerCase()) && !value.includes(s),
  );

  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 text-xs pr-1">
              {tag}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(tag)}
                  className="ml-0.5 rounded hover:bg-muted-foreground/20"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      {!disabled && (
        <div className="relative">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); setOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") { e.preventDefault(); if (input.trim()) add(input); }
              if (e.key === "Backspace" && !input && value.length) remove(value[value.length - 1]);
              if (e.key === "Escape") setOpen(false);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={placeholder}
            className="h-8 text-sm"
          />
          {open && (filtered.length > 0 || input.trim()) && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border rounded-md shadow-md max-h-44 overflow-y-auto">
              {input.trim() && !suggestions.includes(input.trim()) && (
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2"
                  onMouseDown={(e) => { e.preventDefault(); add(input); }}
                >
                  <span className="text-muted-foreground">Add</span> &ldquo;{input.trim()}&rdquo;
                </button>
              )}
              {filtered.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                  onMouseDown={(e) => { e.preventDefault(); add(s); }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── StatusBadge ───────────────────────────────────────────── */

function StatusBadge({ status }: { status: "ACTIVE" | "INACTIVE" | "ARCHIVED" }) {
  const map = {
    ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    INACTIVE: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    ARCHIVED: "bg-muted text-muted-foreground",
  };
  const label = { ACTIVE: "Active", INACTIVE: "Inactive", ARCHIVED: "Archived" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status]}`}>
      {label[status]}
    </span>
  );
}

/* ─── Access Denied ─────────────────────────────────────────── */

function AccessDenied() {
  return (
    <SidebarLayout>
      <div className="max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">Manage team members and their roles.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">Admin access required</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Only administrators can view and manage team members. Contact an admin to request access.
            </p>
          </CardContent>
        </Card>
      </div>
    </SidebarLayout>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */

export function SettingsTeamPage() {
  const getToken = useSessionToken();
  const { data: me, isLoading: meLoading } = useGetMe();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TeamMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);
  const [form, setForm] = useState<MemberForm>(EMPTY_FORM);

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
      const b = await res.json().catch(() => ({}));
      throw new Error((b as { error?: string }).error ?? `Error ${res.status}`);
    }
    return res.json();
  };

  const { data, isLoading } = useQuery<TeamData>({
    queryKey: ["team"],
    queryFn: () => authFetch(""),
    staleTime: 30_000,
  });

  /* ── mutations ── */

  const addMutation = useMutation({
    mutationFn: (f: MemberForm) =>
      authFetch("/add-user", {
        method: "POST",
        body: JSON.stringify({
          email: f.email, name: f.name, password: f.password,
          title: f.title, phone: f.phone,
          tags: f.tags, insuranceGroups: f.insuranceGroups,
        }),
      }),
    onSuccess: (_, f) => {
      qc.invalidateQueries({ queryKey: ["team"] });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      toast({ title: "Team member added", description: `Account created for ${f.email}` });
    },
    onError: (err: Error) => toast({ title: "Failed to add member", description: err.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, f }: { id: string; f: MemberForm }) =>
      Promise.all([
        authFetch(`/${id}/profile`, {
          method: "PATCH",
          body: JSON.stringify({
            name: f.name, title: f.title, phone: f.phone,
            tags: f.tags, insuranceGroups: f.insuranceGroups,
          }),
        }),
        authFetch(`/${id}/role`, { method: "PATCH", body: JSON.stringify({ role: f.role }) }),
      ]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      setDialogOpen(false);
      setEditTarget(null);
      toast({ title: "Member updated" });
    },
    onError: (err: Error) => toast({ title: "Failed to update", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "INACTIVE" | "ARCHIVED" }) =>
      authFetch(`/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ["team"] });
      const label = status === "ACTIVE" ? "activated" : status === "INACTIVE" ? "deactivated" : "archived";
      toast({ title: `Member ${label}` });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      setDeleteTarget(null);
      toast({ title: "Team member removed" });
    },
    onError: (err: Error) => toast({ title: "Failed to remove", description: err.message, variant: "destructive" }),
  });

  const bootstrapMutation = useMutation({
    mutationFn: () => authFetch("/bootstrap-admin", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast({ title: "You are now an Admin!" });
    },
    onError: (err: Error) => toast({ title: "Could not promote", description: err.message, variant: "destructive" }),
  });

  /* ── helpers ── */

  const openAdd = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (member: TeamMember) => {
    setEditTarget(member);
    setForm({
      name: member.name ?? "",
      email: member.email,
      password: "",
      title: member.title ?? "",
      phone: member.phone ?? "",
      role: member.role,
      tags: member.tags ?? [],
      insuranceGroups: member.insuranceGroups ?? [],
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editTarget) {
      editMutation.mutate({ id: editTarget.id, f: form });
    } else {
      if (!form.email.trim() || !form.password.trim()) return;
      addMutation.mutate(form);
    }
  };

  /* ── derived state ── */

  const isAdmin = me?.role === "ADMIN";
  const members = data?.members ?? [];
  const hasNoAdmins = !isLoading && members.filter((m) => m.role === "ADMIN").length === 0;

  const filtered = members.filter((m) => {
    if (statusFilter !== "ALL" && m.status !== statusFilter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (m.name ?? "").toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      (m.title ?? "").toLowerCase().includes(q) ||
      (m.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
      (m.insuranceGroups ?? []).some((g) => g.toLowerCase().includes(q))
    );
  });

  const counts: Record<string, number> = {
    ALL: members.length,
    ACTIVE: members.filter((m) => m.status === "ACTIVE").length,
    INACTIVE: members.filter((m) => m.status === "INACTIVE").length,
    ARCHIVED: members.filter((m) => m.status === "ARCHIVED").length,
  };

  const isBusy = addMutation.isPending || editMutation.isPending;

  /* ── access gate ── */

  if (!meLoading && !isAdmin) {
    const noAdmins = !isLoading && members.filter((m) => m.role === "ADMIN").length === 0;
    if (noAdmins) {
      return (
        <SidebarLayout>
          <div className="max-w-3xl space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Team</h1>
              <p className="text-sm text-muted-foreground">Manage team members and their roles.</p>
            </div>
            <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
              <CardContent className="pt-6">
                <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
                  No admin exists yet. Since you're the first here, you can claim admin access to start managing the team.
                </p>
                <Button onClick={() => bootstrapMutation.mutate()} disabled={bootstrapMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white">
                  {bootstrapMutation.isPending ? "Claiming…" : "Claim Admin Access"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </SidebarLayout>
      );
    }
    return <AccessDenied />;
  }

  /* ─────────────────────────────────── render ─────────────────────────────── */

  return (
    <SidebarLayout>
      <div className="space-y-5 max-w-5xl">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Team</h1>
            <p className="text-sm text-muted-foreground">Manage team members, roles, and affiliations.</p>
          </div>
          <Button onClick={openAdd} size="sm">
            <UserPlus className="h-4 w-4 mr-1.5" />
            Add Team Member
          </Button>
        </div>

        {/* Search + status tabs */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, tag…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-1 border rounded-md p-0.5 bg-muted/40 self-start">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  statusFilter === tab
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "ALL" ? "All" : tab.charAt(0) + tab.slice(1).toLowerCase()}
                <span className="ml-1.5 tabular-nums opacity-60">{counts[tab]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Member list */}
        <div className="border rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-2.5 bg-muted/40 border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <div className="w-8" />
            <div>Member</div>
            <div className="w-28 text-center">Role</div>
            <div className="w-24 text-center">Status</div>
            <div className="w-8" />
          </div>

          {isLoading ? (
            <div className="divide-y">
              {[1, 2, 3].map((i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-4 py-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-6 w-6 rounded" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <Users className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {search || statusFilter !== "ALL" ? "No members match your filters." : "No team members yet."}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((member) => {
                const isSelf = member.id === me?.id;
                const initials = (member.name?.[0] ?? member.email[0]).toUpperCase();
                return (
                  <div
                    key={member.id}
                    className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-start px-4 py-3 ${
                      member.status === "ARCHIVED" ? "opacity-50" : ""
                    }`}
                  >
                    {/* Avatar */}
                    <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                      <AvatarImage src={member.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>

                    {/* Name / email / title / tags */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm">
                          {member.name ?? member.email}
                        </span>
                        {isSelf && (
                          <span className="text-[10px] text-muted-foreground bg-muted rounded px-1 py-0.5">
                            you
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {member.email}
                        {member.title && <span className="ml-1.5 before:content-['·'] before:mr-1.5">{member.title}</span>}
                        {member.phone && <span className="ml-1.5 before:content-['·'] before:mr-1.5">{member.phone}</span>}
                      </div>
                      {/* Tags */}
                      {(member.tags?.length > 0 || member.insuranceGroups?.length > 0) && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(member.tags ?? []).map((t) => (
                            <Badge key={t} variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                              {t}
                            </Badge>
                          ))}
                          {(member.insuranceGroups ?? []).map((g) => (
                            <Badge key={g} className="text-[10px] py-0 px-1.5 h-4 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-0">
                              {g}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Role */}
                    <div className="w-28 flex justify-center items-start pt-0.5">
                      <Badge
                        variant={member.role === "ADMIN" ? "default" : "secondary"}
                        className="flex items-center gap-1 text-[11px] h-5"
                      >
                        {member.role === "ADMIN" && <Shield className="h-2.5 w-2.5" />}
                        {member.role === "ADMIN" ? "Admin" : "Member"}
                      </Badge>
                    </div>

                    {/* Status */}
                    <div className="w-24 flex justify-center items-start pt-0.5">
                      <StatusBadge status={member.status} />
                    </div>

                    {/* Actions */}
                    <div className="w-8 flex justify-center items-start pt-0.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => openEdit(member)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          {!isSelf && (
                            <>
                              <DropdownMenuSeparator />
                              {member.status !== "ACTIVE" && (
                                <DropdownMenuItem
                                  onClick={() => statusMutation.mutate({ id: member.id, status: "ACTIVE" })}
                                >
                                  <UserCheck className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                                  Activate
                                </DropdownMenuItem>
                              )}
                              {member.status === "ACTIVE" && (
                                <DropdownMenuItem
                                  onClick={() => statusMutation.mutate({ id: member.id, status: "INACTIVE" })}
                                >
                                  <ShieldOff className="h-3.5 w-3.5 mr-2 text-amber-600" />
                                  Deactivate
                                </DropdownMenuItem>
                              )}
                              {member.status !== "ARCHIVED" && (
                                <DropdownMenuItem
                                  onClick={() => statusMutation.mutate({ id: member.id, status: "ARCHIVED" })}
                                >
                                  <Archive className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                                  Archive
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(member)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer count */}
        {!isLoading && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setEditTarget(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editTarget ? (
                <>
                  <Pencil className="h-4 w-4" />
                  Edit {editTarget.name ?? editTarget.email}
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Add Team Member
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {/* Name + Email row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tm-name">Full name</Label>
                <Input
                  id="tm-name"
                  placeholder="Jane Smith"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={isBusy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tm-email">Email <span className="text-destructive">*</span></Label>
                <Input
                  id="tm-email"
                  type="email"
                  placeholder="jane@example.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                  disabled={isBusy || !!editTarget}
                />
              </div>
            </div>

            {/* Password (add only) */}
            {!editTarget && (
              <div className="space-y-1.5">
                <Label htmlFor="tm-pw">Temporary password <span className="text-destructive">*</span></Label>
                <Input
                  id="tm-pw"
                  type="text"
                  placeholder="Min. 8 characters — share securely"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required
                  minLength={8}
                  disabled={isBusy}
                />
              </div>
            )}

            {/* Title + Phone row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tm-title">Job title</Label>
                <Input
                  id="tm-title"
                  placeholder="Licensed Agent"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  disabled={isBusy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tm-phone">Phone</Label>
                <Input
                  id="tm-phone"
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  disabled={isBusy}
                />
              </div>
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as "ADMIN" | "MEMBER" }))}
                disabled={isBusy || (!!editTarget && editTarget.id === me?.id)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member — standard access</SelectItem>
                  <SelectItem value="ADMIN">Admin — full access</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <ChipInput
                value={form.tags}
                onChange={(tags) => setForm((f) => ({ ...f, tags }))}
                placeholder="Type a tag and press Enter…"
                disabled={isBusy}
              />
              <p className="text-[11px] text-muted-foreground">Custom labels for filtering and organization.</p>
            </div>

            {/* Insurance Groups */}
            <div className="space-y-1.5">
              <Label>Insurance Group Affiliations</Label>
              <ChipInput
                value={form.insuranceGroups}
                onChange={(insuranceGroups) => setForm((f) => ({ ...f, insuranceGroups }))}
                placeholder="Type or select an affiliation…"
                suggestions={INSURANCE_GROUP_SUGGESTIONS}
                disabled={isBusy}
              />
              <p className="text-[11px] text-muted-foreground">
                Industry groups: NAHU, NAIFA, MDRT, IUL Alliance, etc.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isBusy}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isBusy || (!editTarget && (!form.email.trim() || !form.password.trim()))}
              >
                {isBusy ? (editTarget ? "Saving…" : "Adding…") : (editTarget ? "Save changes" : "Add team member")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{deleteTarget?.name ?? deleteTarget?.email}</strong> from
              MyCRM and deletes their login. This cannot be undone.
              <br /><br />
              To preserve their history, consider <strong>archiving</strong> instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Removing…" : "Remove permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarLayout>
  );
}
