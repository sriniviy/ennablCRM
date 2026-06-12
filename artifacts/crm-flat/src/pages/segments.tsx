import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useState, useCallback, useEffect } from "react";
import { useListCompanies } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/auth-client";
import { Users, Pencil, Trash2, Plus, Filter, Tag, Building2, UserCheck, Mail, ChevronRight } from "lucide-react";

interface SegmentFilter {
  status?: string;
  tags?: string[];
  ennablUser?: boolean;
  emailMarketingContact?: boolean;
  companyId?: string;
}

interface Segment {
  id: string;
  name: string;
  filterJson: string;
  createdAt: string;
  updatedAt: string;
}

interface MatchedContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  status: string;
  title: string | null;
  companyName: string | null;
}

const CONTACT_STATUSES = ["LEAD", "PROSPECT", "CUSTOMER", "CHURNED", "UNQUALIFIED"];

function filterFromJson(json: string): SegmentFilter {
  try { return JSON.parse(json); } catch { return {}; }
}

function FilterSummary({ filter }: { filter: SegmentFilter }) {
  const chips: { label: string; icon: React.ReactNode }[] = [];

  if (filter.status) {
    chips.push({ label: filter.status, icon: <UserCheck className="h-3 w-3" /> });
  }
  if (filter.tags && filter.tags.length > 0) {
    chips.push({ label: filter.tags.join(", "), icon: <Tag className="h-3 w-3" /> });
  }
  if (filter.companyId) {
    chips.push({ label: "Specific company", icon: <Building2 className="h-3 w-3" /> });
  }
  if (filter.emailMarketingContact) {
    chips.push({ label: "Email marketing", icon: <Mail className="h-3 w-3" /> });
  }
  if (filter.ennablUser) {
    chips.push({ label: "Ennabl users", icon: <Users className="h-3 w-3" /> });
  }

  if (chips.length === 0) {
    return <span className="text-xs text-muted-foreground italic">No filters — all contacts</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c, i) => (
        <Badge key={i} variant="secondary" className="text-xs font-normal gap-1 py-0.5">
          {c.icon} {c.label}
        </Badge>
      ))}
    </div>
  );
}

function FilterEditor({
  filter,
  onChange,
  companiesData,
}: {
  filter: SegmentFilter;
  onChange: (f: SegmentFilter) => void;
  companiesData: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-3 p-4 rounded-lg bg-muted/30 border">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Contact Status</Label>
          <select
            value={filter.status ?? ""}
            onChange={e => onChange({ ...filter, status: e.target.value || undefined })}
            className="w-full mt-1 h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Any status</option>
            {CONTACT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Tags (comma-separated)</Label>
          <Input
            value={(filter.tags ?? []).join(", ")}
            onChange={e => onChange({ ...filter, tags: e.target.value ? e.target.value.split(",").map(t => t.trim()).filter(Boolean) : [] })}
            placeholder="enterprise, vip"
            className="h-9 text-sm mt-1"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Company</Label>
          <select
            value={filter.companyId ?? ""}
            onChange={e => onChange({ ...filter, companyId: e.target.value || undefined })}
            className="w-full mt-1 h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Any company</option>
            {companiesData.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="seg-em-contact"
          checked={filter.emailMarketingContact ?? false}
          onChange={e => onChange({ ...filter, emailMarketingContact: e.target.checked || undefined })}
          className="h-4 w-4 rounded"
        />
        <Label htmlFor="seg-em-contact" className="text-sm cursor-pointer">Email marketing contacts only</Label>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="seg-ennabl-user"
          checked={filter.ennablUser ?? false}
          onChange={e => onChange({ ...filter, ennablUser: e.target.checked || undefined })}
          className="h-4 w-4 rounded"
        />
        <Label htmlFor="seg-ennabl-user" className="text-sm cursor-pointer">Ennabl users only</Label>
      </div>
    </div>
  );
}

export function SegmentsPage() {
  const { toast } = useToast();
  const { data: companiesData } = useListCompanies({ page: 1, pageSize: 200 });

  const [segments, setSegments] = useState<Segment[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [detailTarget, setDetailTarget] = useState<Segment | null>(null);
  const [detailContacts, setDetailContacts] = useState<MatchedContact[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editTarget, setEditTarget] = useState<Segment | null>(null);
  const [editName, setEditName] = useState("");
  const [editFilter, setEditFilter] = useState<SegmentFilter>({});
  const [editCount, setEditCount] = useState<number | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editCountLoading, setEditCountLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Segment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFilter, setNewFilter] = useState<SegmentFilter>({ emailMarketingContact: true });
  const [newCount, setNewCount] = useState<number | null>(null);
  const [newCountLoading, setNewCountLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const getHeaders = useCallback(async () => {
    const { data } = await authClient.getSession();
    return {
      "Authorization": `Bearer ${data?.session?.token ?? ""}`,
      "Content-Type": "application/json",
    };
  }, []);

  const loadSegments = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getHeaders();
      const res = await fetch("/api/segments", { headers });
      if (res.ok) {
        const data: Segment[] = await res.json();
        setSegments(data);
        const countEntries = await Promise.all(
          data.map(async (seg) => {
            const r = await fetch(`/api/segments/${seg.id}/count`, { headers });
            if (r.ok) {
              const { count } = await r.json();
              return [seg.id, count] as const;
            }
            return [seg.id, 0] as const;
          })
        );
        setCounts(Object.fromEntries(countEntries));
      }
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => { loadSegments(); }, [loadSegments]);

  const refreshEditCount = useCallback(async (filter: SegmentFilter) => {
    setEditCountLoading(true);
    try {
      const headers = await getHeaders();
      const res = await fetch("/api/segments/count", {
        method: "POST", headers,
        body: JSON.stringify({ filter }),
      });
      if (res.ok) {
        const { count } = await res.json();
        setEditCount(count);
      }
    } finally {
      setEditCountLoading(false);
    }
  }, [getHeaders]);

  const refreshNewCount = useCallback(async (filter: SegmentFilter) => {
    setNewCountLoading(true);
    try {
      const headers = await getHeaders();
      const res = await fetch("/api/segments/count", {
        method: "POST", headers,
        body: JSON.stringify({ filter }),
      });
      if (res.ok) {
        const { count } = await res.json();
        setNewCount(count);
      }
    } finally {
      setNewCountLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    if (!editTarget) return;
    const t = setTimeout(() => refreshEditCount(editFilter), 400);
    return () => clearTimeout(t);
  }, [editFilter, editTarget, refreshEditCount]);

  useEffect(() => {
    if (!createOpen) return;
    const t = setTimeout(() => refreshNewCount(newFilter), 400);
    return () => clearTimeout(t);
  }, [newFilter, createOpen, refreshNewCount]);

  const openDetail = useCallback(async (seg: Segment) => {
    setDetailTarget(seg);
    setDetailContacts([]);
    setDetailTotal(0);
    setDetailLoading(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/segments/${seg.id}/contacts`, { headers });
      if (res.ok) {
        const { data, total } = await res.json();
        setDetailContacts(data);
        setDetailTotal(total);
      }
    } finally {
      setDetailLoading(false);
    }
  }, [getHeaders]);

  const openEdit = (seg: Segment) => {
    setEditTarget(seg);
    setEditName(seg.name);
    setEditFilter(filterFromJson(seg.filterJson));
    setEditCount(counts[seg.id] ?? null);
  };

  const handleSaveEdit = async () => {
    if (!editTarget || !editName.trim()) return;
    setEditLoading(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/segments/${editTarget.id}`, {
        method: "PATCH", headers,
        body: JSON.stringify({ name: editName.trim(), filter: editFilter }),
      });
      if (res.ok) {
        const updated: Segment = await res.json();
        setSegments(p => p.map(s => s.id === updated.id ? updated : s));
        if (editCount !== null) setCounts(p => ({ ...p, [updated.id]: editCount }));
        setEditTarget(null);
        toast({ title: "Segment updated" });
      } else {
        toast({ title: "Failed to update segment", variant: "destructive" });
      }
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/segments/${deleteTarget.id}`, { method: "DELETE", headers });
      if (res.ok) {
        setSegments(p => p.filter(s => s.id !== deleteTarget.id));
        setDeleteTarget(null);
        toast({ title: "Segment deleted" });
      } else {
        toast({ title: "Failed to delete segment", variant: "destructive" });
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const headers = await getHeaders();
      const res = await fetch("/api/segments", {
        method: "POST", headers,
        body: JSON.stringify({ name: newName.trim(), filter: newFilter }),
      });
      if (res.ok) {
        const seg: Segment = await res.json();
        setSegments(p => [seg, ...p]);
        if (newCount !== null) setCounts(p => ({ ...p, [seg.id]: newCount }));
        setCreateOpen(false);
        setNewName("");
        setNewFilter({ emailMarketingContact: true });
        setNewCount(null);
        toast({ title: "Segment created" });
      } else {
        toast({ title: "Failed to create segment", variant: "destructive" });
      }
    } finally {
      setCreating(false);
    }
  };

  const companies = companiesData?.data ?? [];

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Segments</h1>
            <p className="text-muted-foreground">Save and reuse audience filters across campaigns.</p>
          </div>
          <Button onClick={() => { setCreateOpen(true); setNewName(""); setNewFilter({ emailMarketingContact: true }); setNewCount(null); }}>
            <Plus className="mr-2 h-4 w-4" /> New Segment
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border p-4 flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : segments.length === 0 ? (
          <div className="rounded-xl border bg-muted/30 flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Filter className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">No segments yet.</p>
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create your first segment
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {segments.map(seg => {
              const filter = filterFromJson(seg.filterJson);
              const count = counts[seg.id];
              return (
                <div
                  key={seg.id}
                  className="rounded-xl border bg-card flex items-start hover:shadow-sm transition-shadow"
                >
                  <button
                    className="flex items-start gap-4 p-4 flex-1 min-w-0 text-left group"
                    onClick={() => openDetail(seg)}
                  >
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm group-hover:text-primary transition-colors">{seg.name}</span>
                        {count !== undefined && (
                          <Badge variant="outline" className="text-xs font-normal">
                            {count.toLocaleString()} contact{count !== 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <FilterSummary filter={filter} />
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Updated {new Date(seg.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                  <div className="flex gap-1.5 shrink-0 p-3 pl-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(seg)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(seg)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Detail Dialog ── */}
      <Dialog open={!!detailTarget} onOpenChange={open => !open && setDetailTarget(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              {detailTarget?.name}
            </DialogTitle>
            {detailTarget && (
              <div className="flex flex-wrap gap-1 mt-1">
                <FilterSummary filter={filterFromJson(detailTarget.filterJson)} />
              </div>
            )}
          </DialogHeader>

          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">
              {detailLoading ? "Loading contacts…" : (
                <>
                  <span className="font-semibold text-foreground">{detailTotal.toLocaleString()}</span> contact{detailTotal !== 1 ? "s" : ""} match this segment
                  {detailTotal > 100 && <span className="ml-1">(showing first 100)</span>}
                </>
              )}
            </p>
            {detailTarget && (
              <Button size="sm" variant="outline" onClick={() => { setDetailTarget(null); openEdit(detailTarget); }}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Filter
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto rounded-md border">
            {detailLoading ? (
              <div className="space-y-0">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0">
                    <Skeleton className="h-7 w-7 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            ) : detailContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Users className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No contacts match this segment's filter.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailContacts.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <Link href={`/contacts/${c.id}`} className="hover:underline text-primary" onClick={() => setDetailTarget(null)}>
                          {c.firstName} {c.lastName}
                        </Link>
                        {c.title && <p className="text-xs text-muted-foreground">{c.title}</p>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.email ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.companyName ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs font-normal">{c.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={open => !open && setEditTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Segment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Segment Name</Label>
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="e.g. Enterprise Prospects"
                className="mt-1"
              />
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium mb-2">Audience Filters</p>
              <FilterEditor filter={editFilter} onChange={setEditFilter} companiesData={companies} />
            </div>
            {editCountLoading ? (
              <Skeleton className="h-5 w-40" />
            ) : editCount !== null ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{editCount.toLocaleString()}</span> contacts match this filter
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={!editName.trim() || editLoading}>
              {editLoading ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onOpenChange={open => { if (!open) setCreateOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Segment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Segment Name</Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Enterprise Prospects"
                className="mt-1"
                autoFocus
              />
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium mb-2">Audience Filters</p>
              <FilterEditor filter={newFilter} onChange={setNewFilter} companiesData={companies} />
            </div>
            {newCountLoading ? (
              <Skeleton className="h-5 w-40" />
            ) : newCount !== null ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{newCount.toLocaleString()}</span> contacts match this filter
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? "Creating…" : "Create Segment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete segment?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> will be permanently deleted. Campaigns that used this segment won't be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarLayout>
  );
}
