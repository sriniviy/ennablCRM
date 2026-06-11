import { useSessionToken } from "@/hooks/use-session-token";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { useListCompanies, CompanyStatus, useGetMe, type Company } from "@workspace/api-client-react";
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
import { Search, Plus, Globe, Building2, Download, CopyCheck } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { CompanyDialog } from "@/components/companies/company-dialog";
import { CompanyDuplicatesDialog } from "@/components/merge/company-duplicates";
import { useToast } from "@/hooks/use-toast";
import { ExportColumnsDialog, type ColumnDef } from "@/components/export-columns-dialog";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { RecordCardGrid, type CardField } from "@/components/record-card-grid";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const COL_STORAGE_KEY = "crm-flat:companies-col-widths";
const DEFAULT_WIDTHS = [28, 18, 18, 16, 10, 10]; // percentages summing to 100
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
  { label: "Status", render: c => (c.status ? c.status.replace(/_/g, " ") : "—") },
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

export function CompaniesPage() {
  const getToken = useSessionToken();
  const { toast } = useToast();
  const { get, set } = useUrlFilters();
  const { data: members } = useTeamMembers();

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

  const { data, isLoading } = useListCompanies({
    search: debouncedSearch || undefined,
    status: statusFilter !== "ALL" ? (statusFilter as typeof CompanyStatus[keyof typeof CompanyStatus]) : undefined,
    memberOf: debouncedMemberOf || undefined,
    page: 1,
    pageSize: 50,
  });

  const openNew = () => { setEditCompany(undefined); setDialogOpen(true); };
  const openEdit = (c: Company) => { setEditCompany(c); setDialogOpen(true); };

  const companies = data?.data ?? [];

  const { data: me } = useGetMe();
  const isAdmin = me?.role === "ADMIN";
  const { widths, tableRef, startResize } = useResizableColumns();

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
            <p className="text-muted-foreground">Manage your accounts and organizations.</p>
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
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s === "ALL" ? "All statuses" : s.replace(/_/g, " ")}</SelectItem>)}
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
                  {(["Name", "Website", "Account Owner", "Member Of", "Open Deals", "Deal Value"] as const).map((label, i) => (
                    <TableHead
                      key={label}
                      className={`relative select-none overflow-hidden ${i >= 4 ? "text-right" : ""}`}
                    >
                      <span className="block truncate">{label}</span>
                      {i < 5 && (
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
                    const ownerName = company.assignedCsmId
                      ? (members ?? []).find(m => m.id === company.assignedCsmId)?.name ?? "—"
                      : "—";
                    const memberOfStr = company.memberOf?.length ? company.memberOf.join(", ") : "—";
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
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {company.website ? (
                            <a
                              href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 hover:text-primary truncate"
                              onClick={e => e.stopPropagation()}
                            >
                              <Globe className="h-3 w-3 shrink-0" />
                              <span className="truncate">{company.website.replace(/^https?:\/\//, "")}</span>
                            </a>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground truncate">{ownerName}</TableCell>
                        <TableCell className="text-muted-foreground truncate">{memberOfStr}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {company.openDeals != null && company.openDeals > 0 ? (
                            <span className="font-medium">{company.openDeals}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {company.totalDealsValue != null && company.totalDealsValue > 0 ? (
                            <span className="font-medium text-primary">{formatCurrency(company.totalDealsValue)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No companies found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CompanyDialog open={dialogOpen} onOpenChange={setDialogOpen} company={editCompany} />
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
