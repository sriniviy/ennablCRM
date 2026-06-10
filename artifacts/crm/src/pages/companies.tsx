import { useSessionToken } from "@/hooks/use-session-token";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useState, useEffect, useMemo } from "react";

import { useListCompanies, CompanyStatus, type Company } from "@workspace/api-client-react";
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
import { Search, Plus, Globe, Building2, Download } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { CompanyDialog } from "@/components/companies/company-dialog";
import { useToast } from "@/hooks/use-toast";
import { ExportColumnsDialog, type ColumnDef } from "@/components/export-columns-dialog";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { RecordCardGrid, type CardField } from "@/components/record-card-grid";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
      const res = await fetch(`${BASE}/api/companies/export?${params}`, {
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

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
            <p className="text-muted-foreground">Manage your accounts and organizations.</p>
          </div>
          <div className="flex gap-2">
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
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Contacts</TableHead>
                  <TableHead>Open Deals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(7)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}
                    </TableRow>
                  ))
                ) : companies.length > 0 ? (
                  companies.map(company => (
                    <TableRow key={company.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openEdit(company)}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          <Link
                            href={`/companies/${company.id}`}
                            className="hover:underline text-primary"
                            onClick={e => e.stopPropagation()}
                          >
                            {company.name}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>
                        {company.domain ? (
                          <a
                            href={`https://${company.domain}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-muted-foreground hover:text-primary"
                            onClick={e => e.stopPropagation()}
                          >
                            <Globe className="h-3 w-3" /> {company.domain}
                          </a>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {company.status ? (
                          <Badge variant="outline" className="font-normal">{company.status.replace(/_/g, " ")}</Badge>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{company.industry ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{company.size ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">—</TableCell>
                      <TableCell className="text-muted-foreground">—</TableCell>
                    </TableRow>
                  ))
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
      </div>

      <CompanyDialog open={dialogOpen} onOpenChange={setDialogOpen} company={editCompany} />
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
