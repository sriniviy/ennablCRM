import { useSessionToken } from "@/hooks/use-session-token";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useState, useEffect } from "react";

import { useListContacts, ContactStatus, ReviewStatus, useGetMe, type ContactWithRelations } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Upload, Download, CopyCheck, Mail, Zap, Share2 } from "lucide-react";
import { useSharedTags } from "@/hooks/use-shared-tags";
import { useDebounce } from "@/hooks/use-debounce";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useTeamMembers } from "@/hooks/use-team-members";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import { CsvImportDialog } from "@/components/contacts/csv-import-dialog";
import { ContactDuplicatesDialog } from "@/components/merge/contact-duplicates";
import { useToast } from "@/hooks/use-toast";
import { ExportColumnsDialog, type ColumnDef } from "@/components/export-columns-dialog";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { RecordCardGrid, type CardField } from "@/components/record-card-grid";
import { ShareDialog } from "@/components/contacts/share-dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const STATUSES = ["ALL", ...Object.values(ContactStatus)];
const REVIEW_STATUSES = ["ALL", ...Object.values(ReviewStatus)];

const STATUS_COLORS: Record<string, string> = {
  CUSTOMER: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  PROSPECT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  LEAD: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  CHURNED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  UNQUALIFIED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
};

const CONTACT_COLUMNS: ColumnDef[] = [
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "company", label: "Company" },
  { key: "tags", label: "Tags" },
  { key: "notes", label: "Notes" },
  { key: "linkedIn", label: "LinkedIn" },
  { key: "createdAt", label: "Created At" },
  { key: "campaignEngagement", label: "Campaign Engagement" },
];

const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

type EngagementLevel = "High" | "Medium" | "Low";

function getEngagementLevel(opens?: number, clicks?: number): EngagementLevel | null {
  if ((clicks ?? 0) > 0) return "High";
  if ((opens ?? 0) > 0) return "Medium";
  return null;
}

const ENGAGEMENT_STYLES: Record<EngagementLevel, string> = {
  High: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  Medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  Low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function EngagementBadge({ opens, clicks }: { opens?: number; clicks?: number }) {
  const level = getEngagementLevel(opens, clicks);
  if (!level) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <Badge
      variant="outline"
      className={`font-normal border-0 text-xs ${ENGAGEMENT_STYLES[level]}`}
      title={`${opens ?? 0} open${(opens ?? 0) !== 1 ? "s" : ""}, ${clicks ?? 0} click${(clicks ?? 0) !== 1 ? "s" : ""}`}
    >
      {level}
    </Badge>
  );
}

const CARD_FIELDS: CardField<ContactWithRelations>[] = [
  { label: "Email", render: c => dash(c.email) },
  { label: "Phone", render: c => dash(c.phone) },
  { label: "Title", render: c => dash(c.title) },
  { label: "Status", render: c => dash(c.status) },
  { label: "Engagement", render: c => <EngagementBadge opens={c.engagementOpens} clicks={c.engagementClicks} /> },
  { label: "Review status", render: c => (c.reviewStatus ? c.reviewStatus.replace(/_/g, " ") : "—") },
  { label: "Company", render: c => dash(c.company?.name) },
  { label: "Owner", render: c => dash(c.assignee?.name) },
  { label: "Ennabl user", render: c => (c.ennablUser ? "Yes" : "No") },
  { label: "Marketing contact", render: c => (c.emailMarketingContact ? "Yes" : "No") },
  { label: "Tags", render: c => (c.tags && c.tags.length ? c.tags.join(", ") : "—") },
  { label: "LinkedIn", render: c => dash(c.linkedIn) },
  { label: "Notes", render: c => dash(c.notes) },
  { label: "Deals", render: c => dash(c.dealCount) },
  { label: "Tasks", render: c => dash(c.taskCount) },
  { label: "Campaign engagement", render: c => (c.campaignEngagementCount ?? 0) > 0 ? `${c.campaignEngagementCount} campaign${c.campaignEngagementCount === 1 ? "" : "s"}` : "—" },
  { label: "Company ID", render: c => dash(c.companyId) },
  { label: "Owner ID", render: c => dash(c.assigneeId) },
  { label: "Created", render: c => (c.createdAt ? new Date(c.createdAt).toLocaleString() : "—") },
  { label: "Updated", render: c => (c.updatedAt ? new Date(c.updatedAt).toLocaleString() : "—") },
  { label: "ID", render: c => dash(c.id) },
];

export function ContactsPage() {
  const getToken = useSessionToken();
  const { toast } = useToast();
  const { get, set } = useUrlFilters();
  const { data: members } = useTeamMembers();
  const sharedTags = useSharedTags();

  const [search, setSearch] = useState(() => get("search"));
  const [statusFilter, setStatusFilter] = useState(() => get("status") || "ALL");
  const [reviewFilter, setReviewFilter] = useState(() => get("reviewStatus") || "ALL");
  const [ownerFilter, setOwnerFilter] = useState(() => get("assigneeId") || "ALL");
  const [tagFilter, setTagFilter] = useState(() => get("tag"));
  const [view, setView] = useState<ViewMode>(() => (get("view") === "cards" ? "cards" : "table"));

  const debouncedSearch = useDebounce(search, 400);
  const debouncedTag = useDebounce(tagFilter, 400);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editContact, setEditContact] = useState<ContactWithRelations | undefined>();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [shareContact, setShareContact] = useState<ContactWithRelations | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    set({
      search: debouncedSearch,
      status: statusFilter,
      reviewStatus: reviewFilter,
      assigneeId: ownerFilter,
      tag: debouncedTag,
      view: view === "cards" ? "cards" : undefined,
    });
  }, [debouncedSearch, statusFilter, reviewFilter, ownerFilter, debouncedTag, view, set]);

  const handleExport = async (fields: string[]) => {
    setExporting(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (debouncedTag) params.set("tag", debouncedTag);
      params.set("fields", fields.join(","));
      const res = await fetch(`/api/contacts/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "contacts.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const { data: triggerEnrolledData } = useQuery<{ contactIds: string[] }>({
    queryKey: ["trigger-enrolled-contacts"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/sequences/trigger-enrolled-contacts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    staleTime: 60_000,
  });
  const triggerEnrolledSet = new Set(triggerEnrolledData?.contactIds ?? []);

  const { data, isLoading } = useListContacts({
    search: debouncedSearch || undefined,
    status: statusFilter !== "ALL" ? statusFilter as typeof ContactStatus[keyof typeof ContactStatus] : undefined,
    reviewStatus: reviewFilter !== "ALL" ? reviewFilter as typeof ReviewStatus[keyof typeof ReviewStatus] : undefined,
    assigneeId: ownerFilter !== "ALL" ? ownerFilter : undefined,
    tag: debouncedTag || undefined,
    page: 1,
    pageSize: 50,
  });

  const openNew = () => { setEditContact(undefined); setDialogOpen(true); };
  const openEdit = (c: ContactWithRelations) => { setEditContact(c); setDialogOpen(true); };

  const contacts = [...(data?.data ?? [])].sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
  );

  const { data: me } = useGetMe();
  const isAdmin = me?.role === "ADMIN";

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
            <p className="text-muted-foreground">Manage your people and leads.</p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => setDuplicatesOpen(true)}>
                <CopyCheck className="mr-2 h-4 w-4" /> Find duplicates
              </Button>
            )}
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Import CSV
            </Button>
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button data-testid="btn-new-contact" onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Add Contact
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts…"
              className="pl-8"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-contacts"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36" data-testid="select-contact-status"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s === "ALL" ? "All statuses" : s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={reviewFilter} onValueChange={setReviewFilter}>
            <SelectTrigger className="w-40" data-testid="select-contact-review"><SelectValue placeholder="Review" /></SelectTrigger>
            <SelectContent>
              {REVIEW_STATUSES.map(s => <SelectItem key={s} value={s}>{s === "ALL" ? "All reviews" : s.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-40" data-testid="select-contact-owner"><SelectValue placeholder="Owner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All owners</SelectItem>
              {(members ?? []).map(m => <SelectItem key={m.id} value={m.id}>{m.name ?? "Unknown"}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            placeholder="Filter by tag…"
            className="w-36"
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
          />
          <div className="ml-auto">
            <ViewToggle value={view} onChange={setView} />
          </div>
        </div>

        {view === "cards" ? (
          isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-64 w-full" />)}
            </div>
          ) : (
            <RecordCardGrid
              items={contacts}
              getKey={c => c.id}
              getTitle={c => (
                <Link href={`/contacts/${c.id}`} className="hover:underline text-primary" onClick={e => e.stopPropagation()}>
                  {c.firstName} {c.lastName}
                </Link>
              )}
              fields={CARD_FIELDS}
              onItemClick={openEdit}
              emptyMessage="No contacts found."
            />
          )
        ) : (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Engagement</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(7)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>)}
                    </TableRow>
                  ))
                ) : contacts.length > 0 ? (
                  contacts.map(contact => (
                    <TableRow
                      key={contact.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => openEdit(contact)}
                    >
                      <TableCell className="font-medium">
                        <Link
                          href={`/contacts/${contact.id}`}
                          className="hover:underline text-primary"
                          onClick={e => e.stopPropagation()}
                        >
                          {contact.firstName} {contact.lastName}
                        </Link>
                        {sharedTags.contact?.[contact.id] && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Shared by {sharedTags.contact[contact.id]}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{contact.email ?? "—"}</TableCell>
                      <TableCell>
                        {contact.company ? (
                          <Link href={`/companies/${contact.company.id}`} className="hover:underline" onClick={e => e.stopPropagation()}>
                            {contact.company.name}
                          </Link>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-normal border-0 ${STATUS_COLORS[contact.status] ?? ""}`}>
                          {contact.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <EngagementBadge opens={contact.engagementOpens} clicks={contact.engagementClicks} />
                      </TableCell>
                      <TableCell>
                        {contact.reviewStatus ? (
                          <Badge variant="outline" className="font-normal">{contact.reviewStatus.replace(/_/g, " ")}</Badge>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(contact.tags ?? []).slice(0, 3).map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="inline-flex items-center justify-center rounded h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                  onClick={e => { e.stopPropagation(); setShareContact(contact); setShareOpen(true); }}
                                >
                                  <Share2 className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left">Share contact</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {(contact.campaignEngagementCount ?? 0) > 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 h-6 w-6 cursor-default" onClick={e => e.stopPropagation()}>
                                    <Mail className="h-3.5 w-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                  Engaged with {contact.campaignEngagementCount} campaign{contact.campaignEngagementCount === 1 ? "" : "s"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {triggerEnrolledSet.has(contact.id) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 h-6 w-6 cursor-default" onClick={e => e.stopPropagation()}>
                                    <Zap className="h-3.5 w-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                  Auto-enrolled in a sequence via trigger
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No contacts found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <ContactDialog open={dialogOpen} onOpenChange={setDialogOpen} contact={editContact} />
      <ShareDialog
        record={shareContact ? {
          id: shareContact.id,
          name: `${shareContact.firstName} ${shareContact.lastName}`.trim() || shareContact.email || "Contact",
          subtitle: shareContact.email ?? undefined,
          type: "contact",
        } : null}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
      <ContactDuplicatesDialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen} />
      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ExportColumnsDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        columns={CONTACT_COLUMNS}
        storageKey="crm:export-columns:contacts"
        onExport={handleExport}
        exporting={exporting}
      />
    </SidebarLayout>
  );
}
