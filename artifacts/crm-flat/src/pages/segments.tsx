import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useState, useCallback, useEffect } from "react";
import {
  useListSegments,
  useCreateSegment,
  useUpdateSegment,
  useDeleteSegment,
  useCountSegment,
  useListSegmentContacts,
  countSegmentFilter,
  getListSegmentsQueryKey,
  useListCompanies,
} from "@workspace/api-client-react";
import type {
  Segment,
  SegmentFilter,
  SegmentContactResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/auth-client";
import { Users, Pencil, Trash2, Plus, Filter, Tag, Building2, UserCheck, Mail, ChevronRight, Megaphone, TriangleAlert } from "lucide-react";

interface SegmentCampaign {
  id: string;
  name: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
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

function SegmentCountBadge({ id }: { id: string }) {
  const { data, isLoading } = useCountSegment(id);
  if (isLoading) return <Skeleton className="h-5 w-16 inline-block" />;
  if (!data) return null;
  return (
    <Badge variant="outline" className="text-xs font-normal">
      {data.count.toLocaleString()} contact{data.count !== 1 ? "s" : ""}
    </Badge>
  );
}

export function SegmentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: companiesData } = useListCompanies({ page: 1, pageSize: 200 });
  const { data: segments, isLoading: loading } = useListSegments();

  const createSegmentMutation = useCreateSegment();
  const updateSegmentMutation = useUpdateSegment();
  const deleteSegmentMutation = useDeleteSegment();

  const [campaignCounts, setCampaignCounts] = useState<Record<string, number>>({});
  const [campaignsBySegment, setCampaignsBySegment] = useState<Record<string, SegmentCampaign[]>>({});
  const [campaignPopoverOpen, setCampaignPopoverOpen] = useState<Record<string, boolean>>({});
  const [campaignLoading, setCampaignLoading] = useState<Record<string, boolean>>({});

  const [detailTarget, setDetailTarget] = useState<Segment | null>(null);
  const { data: segmentContactsData, isLoading: detailLoading } = useListSegmentContacts(
    detailTarget?.id ?? ""
  );
  const detailContacts: SegmentContactResult[] = segmentContactsData?.data ?? [];
  const detailTotal = segmentContactsData?.total ?? 0;

  const [editTarget, setEditTarget] = useState<Segment | null>(null);
  const [editName, setEditName] = useState("");
  const [editFilter, setEditFilter] = useState<SegmentFilter>({});
  const [editCount, setEditCount] = useState<number | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editCountLoading, setEditCountLoading] = useState(false);
  const [editSentCampaignCount, setEditSentCampaignCount] = useState<number | null>(null);

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

  useEffect(() => {
    if (!segments || segments.length === 0) return;
    (async () => {
      const headers = await getHeaders();
      const entries = await Promise.all(
        segments.map(async (seg) => {
          const r = await fetch(`/api/segments/${seg.id}/campaigns`, { headers });
          if (r.ok) {
            const campaigns: SegmentCampaign[] = await r.json();
            return [seg.id, campaigns.length] as const;
          }
          return [seg.id, 0] as const;
        })
      );
      setCampaignCounts(Object.fromEntries(entries));
    })();
  }, [segments, getHeaders]);

  const openCampaignPopover = useCallback(async (segId: string) => {
    setCampaignPopoverOpen(p => ({ ...p, [segId]: true }));
    if (campaignsBySegment[segId]) return;
    setCampaignLoading(p => ({ ...p, [segId]: true }));
    try {
      const headers = await getHeaders();
      const r = await fetch(`/api/segments/${segId}/campaigns`, { headers });
      if (r.ok) {
        const campaigns: SegmentCampaign[] = await r.json();
        setCampaignsBySegment(p => ({ ...p, [segId]: campaigns }));
      }
    } finally {
      setCampaignLoading(p => ({ ...p, [segId]: false }));
    }
  }, [getHeaders, campaignsBySegment]);

  const refreshEditCount = useCallback(async (filter: SegmentFilter) => {
    setEditCountLoading(true);
    try {
      const result = await countSegmentFilter({ filter });
      setEditCount(result.count);
    } finally {
      setEditCountLoading(false);
    }
  }, []);

  const refreshNewCount = useCallback(async (filter: SegmentFilter) => {
    setNewCountLoading(true);
    try {
      const result = await countSegmentFilter({ filter });
      setNewCount(result.count);
    } finally {
      setNewCountLoading(false);
    }
  }, []);

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

  const openEdit = async (seg: Segment) => {
    setEditTarget(seg);
    setEditName(seg.name);
    setEditFilter(filterFromJson(seg.filterJson));
    setEditCount(null);
    setEditSentCampaignCount(null);
    try {
      const headers = await getHeaders();
      const r = await fetch(`/api/segments/${seg.id}/campaigns`, { headers });
      if (r.ok) {
        const campaigns: SegmentCampaign[] = await r.json();
        setEditSentCampaignCount(campaigns.filter(c => c.status === "SENT").length);
      }
    } catch {
      setEditSentCampaignCount(0);
    }
  };

  const handleSaveEdit = async () => {
    if (!editTarget || !editName.trim()) return;
    setEditLoading(true);
    try {
      await updateSegmentMutation.mutateAsync({
        id: editTarget.id,
        data: { name: editName.trim(), filter: editFilter },
      });
      await queryClient.invalidateQueries({ queryKey: getListSegmentsQueryKey() });
      setEditTarget(null);
      toast({ title: "Segment updated" });
    } catch {
      toast({ title: "Failed to update segment", variant: "destructive" });
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSegmentMutation.mutateAsync({ id: deleteTarget.id });
      await queryClient.invalidateQueries({ queryKey: getListSegmentsQueryKey() });
      setDeleteTarget(null);
      toast({ title: "Segment deleted" });
    } catch {
      toast({ title: "Failed to delete segment", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createSegmentMutation.mutateAsync({
        data: { name: newName.trim(), filter: newFilter },
      });
      await queryClient.invalidateQueries({ queryKey: getListSegmentsQueryKey() });
      setCreateOpen(false);
      setNewName("");
      setNewFilter({ emailMarketingContact: true });
      setNewCount(null);
      toast({ title: "Segment created" });
    } catch {
      toast({ title: "Failed to create segment", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const companies = companiesData?.data ?? [];
  const segmentList = segments ?? [];

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
        ) : segmentList.length === 0 ? (
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
            {segmentList.map(seg => {
              const filter = filterFromJson(seg.filterJson);
              return (
                <div
                  key={seg.id}
                  className="rounded-xl border bg-card flex items-start hover:shadow-sm transition-shadow"
                >
                  <button
                    className="flex items-start gap-4 p-4 flex-1 min-w-0 text-left group"
                    onClick={() => setDetailTarget(seg)}
                  >
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-sm group-hover:text-primary transition-colors">{seg.name}</span>
                        <SegmentCountBadge id={seg.id} />
                        {campaignCounts[seg.id] !== undefined && campaignCounts[seg.id] > 0 && (
                          <Popover
                            open={campaignPopoverOpen[seg.id] ?? false}
                            onOpenChange={(open) => {
                              if (open) openCampaignPopover(seg.id);
                              else setCampaignPopoverOpen(p => ({ ...p, [seg.id]: false }));
                            }}
                          >
                            <PopoverTrigger asChild>
                              <button
                                onClick={e => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-xs rounded-full border px-2 py-0.5 text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                              >
                                <Megaphone className="h-3 w-3" />
                                Used in {campaignCounts[seg.id]} campaign{campaignCounts[seg.id] !== 1 ? "s" : ""}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-72 p-0"
                              align="start"
                              onClick={e => e.stopPropagation()}
                            >
                              <div className="px-3 py-2 border-b">
                                <p className="text-sm font-semibold">Campaigns using this segment</p>
                              </div>
                              {campaignLoading[seg.id] ? (
                                <div className="p-3 space-y-2">
                                  {[...Array(2)].map((_, i) => (
                                    <Skeleton key={i} className="h-8 w-full" />
                                  ))}
                                </div>
                              ) : (campaignsBySegment[seg.id] ?? []).length === 0 ? (
                                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                                  No campaigns yet.
                                </div>
                              ) : (
                                <ul className="max-h-56 overflow-y-auto divide-y">
                                  {(campaignsBySegment[seg.id] ?? []).map(c => (
                                    <li key={c.id}>
                                      <Link
                                        href={`/campaigns/${c.id}`}
                                        onClick={() => setCampaignPopoverOpen(p => ({ ...p, [seg.id]: false }))}
                                        className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
                                      >
                                        <span className="text-sm font-medium truncate">{c.name}</span>
                                        <Badge
                                          variant={c.status === "SENT" ? "default" : "secondary"}
                                          className="text-xs font-normal shrink-0"
                                        >
                                          {c.status}
                                        </Badge>
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div className="border-t px-3 py-2">
                                <Link
                                  href="/campaigns"
                                  onClick={() => setCampaignPopoverOpen(p => ({ ...p, [seg.id]: false }))}
                                  className="text-xs text-primary hover:underline"
                                >
                                  View all campaigns →
                                </Link>
                              </div>
                            </PopoverContent>
                          </Popover>
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
          {editSentCampaignCount !== null && editSentCampaignCount > 0 && (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <p>
                This segment was used in{" "}
                <span className="font-semibold">{editSentCampaignCount} sent {editSentCampaignCount === 1 ? "campaign" : "campaigns"}</span>.
                {" "}Editing the filters won't change who received those past sends — only future campaigns using this segment will be affected.
              </p>
            </div>
          )}
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
