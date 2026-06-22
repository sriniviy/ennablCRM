import { useSessionToken } from "@/hooks/use-session-token";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { useListCompanies, useUpdateCompany, CompanyStatus, useGetMe, getListCompaniesQueryKey, type Company } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTeamMembers } from "@/hooks/use-team-members";
import { formatCurrency } from "@/lib/utils";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Globe, Building2, Download, CopyCheck, Share2, Pencil, Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useSharedTags } from "@/hooks/use-shared-tags";
import { useDebounce } from "@/hooks/use-debounce";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { CompanyDialog } from "@/components/companies/company-dialog";
import { CompanyDuplicatesDialog } from "@/components/merge/company-duplicates";
import { useToast } from "@/hooks/use-toast";
import { ExportColumnsDialog, type ColumnDef } from "@/components/export-columns-dialog";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { RecordCardGrid, type CardField } from "@/components/record-card-grid";
import { ShareDialog } from "@/components/contacts/share-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toLabel } from "@/lib/fmt";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const COL_STORAGE_KEY = "crm-flat:companies-col-widths";
const DEFAULT_WIDTHS = [20, 12, 10, 11, 11, 10, 10, 12, 4]; // 9 cols: name, owner, created, phone, website, memberof, dealvalue, lastactivity, action
const MIN_COL_PCT = 5;

function useResizableColumns() {
  const [widths, setWidths] = useState<number[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COL_STORAGE_KEY) ?? "null");
      if (Array.isArray(saved) && saved.length === DEFAULT_WIDTHS.length) return saved as number[];
    } catch {}
    return DEFAULT_WIDTHS;
  });

  const drag = useRef<{ col: number; startX: number; startWidths: number[] } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!drag.current || !tableRef.current) return;
    const tableW = tableRef.current.getBoundingClientRect().width;
    const deltaPx = e.clientX - drag.current.startX;
    const deltaPct = (deltaPx / tableW) * 100;
    const { col, startWidths } = drag.current;
    const next = col + 1;
    if (next >= startWidths.length) return;

    const newA = Math.max(MIN_COL_PCT, startWidths[col] + deltaPct);
    const newB = Math.max(MIN_COL_PCT, startWidths[next] - (newA - startWidths[col]));
    const adjA = startWidths[col] + startWidths[next] - newB;

    setWidths(prev => {
      const w = [...prev];
      w[col] = adjA;
      w[next] = newB;
      return w;
    });
  }, []);

  const onMouseUp = useCallback(() => {
    if (!drag.current) return;
    drag.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setWidths(prev => {
      try { localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(prev)); } catch {}
      return prev;
    });
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const startResize = useCallback((colIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    drag.current = { col: colIndex, startX: e.clientX, startWidths: widths.slice() };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [widths]);

  return { widths, tableRef, startResize };
}

const STATUSES = ["ALL", ...Object.values(CompanyStatus)];

const COMPANY_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name" },
  { key: "domain", label: "Domain" },
  { key: "industry", label: "Industry" },
  { key: "size", label: "Size" },
  { key: "website", label: "Website" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "createdAt", label: "Created At" },
];

const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const arr = (v: string[] | null | undefined) => (v && v.length ? v.join(", ") : "—");

const buildCompanyCardFields = (ownerName: (id: string | null | undefined) => string): CardField<Company>[] => [
  { label: "Domain", render: c => dash(c.domain) },
  { label: "All domains", render: c => arr(c.domains) },
  { label: "Status", render: c => (c.status ? toLabel(c.status) : "—") },
  { label: "Industry", render: c => dash(c.industry) },
  { label: "Size", render: c => dash(c.size) },
  { label: "Member of", render: c => arr(c.memberOf) },
  { label: "Products licensed", render: c => arr(c.productLicensed) },
  { label: "Est. annual revenue", render: c => (c.estimatedAnnualRevenue != null ? formatCurrency(c.estimatedAnnualRevenue) : "—") },
  { label: "Employees", render: c => dash(c.numberOfEmployees) },
  { label: "Website", render: c => dash(c.website) },
  { label: "Phone", render: c => dash(c.phone) },
  { label: "Address", render: c => dash(c.address) },
  { label: "City", render: c => dash(c.city) },
  { label: "Country", render: c => dash(c.country) },
  { label: "Assigned CSM", render: c => ownerName(c.assignedCsmId) },
  { label: "Assigned CSM ID", render: c => dash(c.assignedCsmId) },
  { label: "Created", render: c => (c.createdAt ? new Date(c.createdAt).toLocaleString() : "—") },
  { label: "Updated", render: c => (c.updatedAt ? new Date(c.updatedAt).toLocaleString() : "—") },
  { label: "ID", render: c => dash(c.id) },
];

const DEFAULT_MEMBER_OF = [
  "Acrisure","Afore","ALKEME","Alera","Alliant","Applied Reference Client",
  "Association of Risk Managers Northwest","Assurex","BIGN","BroadStreet","CIAB",
  "Fortified","Gallagher","HUB","HighStreet","InCite","Insurors Group","Intersure",
  "Iroquois Group","ISU","Keystone","Marsh/MMA","MarshBerry Connect",
  "New Demos Challenge 26","Outmarket Customer","PacWest","Patriot","Reagan Survey",
  "RiskProNet","Top 100 Target List","USI","Vertafore Reference Customer",
];

function InlineOwnerCell({ company, members, onSaved }: {
  company: Company;
  members: Array<{ id: string; name?: string | null; email: string }>;
  onSaved: () => void;
}) {
  const update = useUpdateCompany();
  return (
    <div onClick={e => e.stopPropagation()}>
      <Select
        value={company.assignedCsmId ?? "none"}
        onValueChange={val =>
          update.mutate({ id: company.id, data: { assignedCsmId: val === "none" ? null : val } }, { onSuccess: onSaved })
        }
      >
        <SelectTrigger className="h-8 w-full border-transparent bg-transparent shadow-none text-sm text-muted-foreground hover:border-border hover:bg-muted/40 focus:ring-1 px-2">
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function InlineWebsiteCell({ company, onSaved }: { company: Company; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(company.website ?? "");
  const update = useUpdateCompany();

  const save = () => {
    const trimmed = value.trim();
    if (trimmed === (company.website ?? "")) { setEditing(false); return; }
    update.mutate(
      { id: company.id, data: { website: trimmed || undefined } },
      { onSuccess: () => { onSaved(); setEditing(false); } }
    );
  };

  if (editing) {
    return (
      <div onClick={e => e.stopPropagation()}>
        <Input
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setValue(company.website ?? ""); setEditing(false); } }}
          autoFocus
          className="h-7 text-sm px-2"
          placeholder="https://…"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 group/web" onClick={e => e.stopPropagation()}>
      {company.website ? (
        <a
          href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 hover:text-primary truncate min-w-0"
          onClick={e => e.stopPropagation()}
        >
          <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate text-muted-foreground">{company.website.replace(/^https?:\/\//, "")}</span>
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
      <button
        onClick={e => { e.stopPropagation(); setValue(company.website ?? ""); setEditing(true); }}
        className="opacity-0 group-hover/web:opacity-100 transition-opacity ml-1 text-muted-foreground hover:text-foreground shrink-0"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

function InlineMemberOfCell({ company, options, onSaved }: { company: Company; options: string[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string[] | null>(null);
  const update = useUpdateCompany();
  const current = company.memberOf ?? [];
  const displayed = editing ?? current;

  const handleOpenChange = (o: boolean) => {
    if (o) {
      setEditing([...current]);
    } else if (editing !== null) {
      if (JSON.stringify([...editing].sort()) !== JSON.stringify([...current].sort())) {
        update.mutate({ id: company.id, data: { memberOf: editing } }, { onSuccess: onSaved });
      }
      setEditing(null);
    }
    setOpen(o);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="text-sm text-muted-foreground hover:text-foreground text-left truncate w-full"
          onClick={e => e.stopPropagation()}
        >
          {current.length === 0 ? "—" : current.length === 1 ? current[0] : `${current.length} groups`}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" onClick={e => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Search networks…" />
          <CommandList className="max-h-52">
            <CommandEmpty className="py-2 px-3 text-sm text-muted-foreground">No matches.</CommandEmpty>
            <CommandGroup>
              {options.map(opt => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => setEditing(prev => {
                    const base = prev ?? current;
                    return base.includes(opt) ? base.filter(v => v !== opt) : [...base, opt];
                  })}
                >
                  <Check className={`mr-2 h-4 w-4 shrink-0 ${displayed.includes(opt) ? "opacity-100" : "opacity-0"}`} />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CompaniesPage() {
  const getToken = useSessionToken();
  const { toast } = useToast();
  const { get, set } = useUrlFilters();
  const { data: members } = useTeamMembers();
  const sharedTags = useSharedTags();

  const cardFields = useMemo(() => {
    const ownerName = (id: string | null | undefined) =>
      id ? (members ?? []).find(m => m.id === id)?.name ?? "—" : "—";
    return buildCompanyCardFields(ownerName);
  }, [members]);

  const [search, setSearch] = useState(() => get("search"));
  const [statusFilter, setStatusFilter] = useState(() => get("status") || "ALL");
  const [memberOf, setMemberOf] = useState(() => get("memberOf"));
  const [view, setView] = useState<ViewMode>(() => (get("view") === "cards" ? "cards" : "table"));

  const debouncedSearch = useDebounce(search, 400);
  const debouncedMemberOf = useDebounce(memberOf, 400);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | undefined>();
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [shareCompany, setShareCompany] = useState<Company | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const qc = useQueryClient();
  const { data: memberOfData } = useQuery<{ options: string[] }>({
    queryKey: ["settings", "member-of"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/settings/member-of", { headers: { Authorization: `Bearer ${token}` } });
      return res.json();
    },
    staleTime: 60_000,
  });
  const memberOfOptions = memberOfData?.options ?? DEFAULT_MEMBER_OF;
  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: getListCompaniesQueryKey() }), [qc]);

  useEffect(() => {
    set({
      search: debouncedSearch,
      status: statusFilter,
      memberOf: debouncedMemberOf,
      view: view === "cards" ? "cards" : undefined,
    });
  }, [debouncedSearch, statusFilter, debouncedMemberOf, view, set]);

  const handleExport = async (fields: string[]) => {
    setExporting(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("fields", fields.join(","));
      const res = await fetch(`/api/companies/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "companies.csv";
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

  const [pageSize, setPageSize] = useState(100);

  const { data, isLoading, isFetching } = useListCompanies({
    search: debouncedSearch || undefined,
    status: statusFilter !== "ALL" ? (statusFilter as typeof CompanyStatus[keyof typeof CompanyStatus]) : undefined,
    memberOf: debouncedMemberOf || undefined,
    page: 1,
    pageSize,
  });

  const openNew = () => { setEditCompany(undefined); setDialogOpen(true); };
  const openEdit = (c: Company) => { setEditCompany(c); setDialogOpen(true); };

  const companies = [...(data?.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  const { data: me } = useGetMe();
  const isAdmin = me?.role === "ADMIN";
  const { widths, tableRef, startResize } = useResizableColumns();

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
            <p className="text-muted-foreground">
              {data?.total ? `Showing ${data.data.length.toLocaleString()} of ${data.total.toLocaleString()} companies` : "Manage your accounts and organizations."}
            </p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => setDuplicatesOpen(true)}>
                <CopyCheck className="mr-2 h-4 w-4" />
                Find duplicates
              </Button>
            )}
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button data-testid="btn-new-company" onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Add Company
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search companies…"
              className="pl-8"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-companies"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44" data-testid="select-company-status"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s === "ALL" ? "All statuses" : toLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            placeholder="Filter by group…"
            className="w-44"
            value={memberOf}
            onChange={e => setMemberOf(e.target.value)}
            data-testid="input-company-memberof"
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
              items={companies}
              getKey={c => c.id}
              getTitle={c => (
                <Link href={`/companies/${c.id}`} className="hover:underline text-primary" onClick={e => e.stopPropagation()}>
                  {c.name}
                </Link>
              )}
              fields={cardFields}
              onItemClick={openEdit}
              emptyMessage="No companies found."
            />
          )
        ) : (
          <div className="rounded-md border bg-card overflow-hidden" ref={tableRef}>
            <Table className="table-fixed w-full">
              <colgroup>
                {widths.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}
              </colgroup>
              <TableHeader>
                <TableRow>
                  {(["Name", "Account Owner", "Created", "Phone", "Website", "Member Of", "Deal Value", "Last Activity", ""] as const).map((label, i) => (
                    <TableHead key={label} className="relative select-none overflow-hidden">
                      <span className="block truncate">{label}</span>
                      {i < 8 && label !== "" && (
                        <span
                          onMouseDown={e => startResize(i, e)}
                          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-10"
                          title="Drag to resize"
                        />
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(6)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}
                    </TableRow>
                  ))
                ) : companies.length > 0 ? (
                  companies.map(company => {
                    return (
                      <TableRow key={company.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openEdit(company)}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 min-w-0">
                            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Link
                              href={`/companies/${company.id}`}
                              className="hover:underline text-primary truncate"
                              onClick={e => e.stopPropagation()}
                            >
                              {company.name}
                            </Link>
                          </div>
                          {sharedTags.company?.[company.id] && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 pl-6">
                              Shared by {sharedTags.company[company.id]}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="truncate p-0 pl-4"><InlineOwnerCell company={company} members={members ?? []} onSaved={invalidate} /></TableCell>
                        <TableCell className="text-muted-foreground text-sm tabular-nums">
                          {company.createdAt ? new Date(company.createdAt).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground truncate text-sm">
                          {(company as any).phone ? (
                            <a href={`tel:${(company as any).phone}`} className="hover:text-primary" onClick={e => e.stopPropagation()}>
                              {(company as any).phone}
                            </a>
                          ) : "—"}
                        </TableCell>
                        <TableCell><InlineWebsiteCell company={company} onSaved={invalidate} /></TableCell>
                        <TableCell className="truncate"><InlineMemberOfCell company={company} options={memberOfOptions} onSaved={invalidate} /></TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {(company as any).totalDealsValue > 0 ? (
                            <span className="font-medium text-primary">{formatCurrency((company as any).totalDealsValue)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm tabular-nums">
                          {(company as any).lastActivityDate
                            ? new Date((company as any).lastActivityDate).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="w-10">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="inline-flex items-center justify-center rounded h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                  onClick={e => { e.stopPropagation(); setShareCompany(company); setShareOpen(true); }}
                                >
                                  <Share2 className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left">Share company</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No companies found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {data?.hasMore && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              onClick={() => setPageSize(ps => ps + 100)}
              disabled={isFetching}
            >
              <ChevronDown className="mr-2 h-4 w-4" />
              {isFetching ? "Loading…" : `Load more (${((data.total ?? 0) - (data.data?.length ?? 0)).toLocaleString()} remaining)`}
            </Button>
          </div>
        )}
      </div>

      <CompanyDialog open={dialogOpen} onOpenChange={setDialogOpen} company={editCompany} />
      <ShareDialog
        record={shareCompany ? { id: shareCompany.id, name: shareCompany.name, subtitle: shareCompany.website ?? undefined, type: "company" } : null}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
      <CompanyDuplicatesDialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen} />
      <ExportColumnsDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        columns={COMPANY_COLUMNS}
        storageKey="crm:export-columns:companies"
        onExport={handleExport}
        exporting={exporting}
      />
    </SidebarLayout>
  );
}
