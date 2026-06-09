import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useState } from "react";
import { useAuth } from "@clerk/react";
import { useListCompanies, type Company } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Globe, Building2, Download } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { CompanyDialog } from "@/components/companies/company-dialog";
import { useToast } from "@/hooks/use-toast";
import { ExportColumnsDialog, type ColumnDef } from "@/components/export-columns-dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

export function CompaniesPage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | undefined>();
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  const { data, isLoading } = useListCompanies({ search: debouncedSearch || undefined, page: 1, pageSize: 50 });

  const openNew = () => { setEditCompany(undefined); setDialogOpen(true); };
  const openEdit = (c: Company) => { setEditCompany(c); setDialogOpen(true); };

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

        <div className="flex items-center space-x-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search companies…"
              className="pl-8"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-companies"
            />
          </div>
        </div>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Domain</TableHead>
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
                    {[...Array(6)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}
                  </TableRow>
                ))
              ) : data?.data && data.data.length > 0 ? (
                data.data.map(company => (
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
                    <TableCell className="text-muted-foreground">{company.industry ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{company.size ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                  </TableRow>
                ))
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
