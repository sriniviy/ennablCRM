import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useState } from "react";
import { useListContacts, ContactStatus, type ContactWithRelations } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Upload } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import { CsvImportDialog } from "@/components/contacts/csv-import-dialog";

const STATUSES = ["ALL", ...Object.values(ContactStatus)];

const STATUS_COLORS: Record<string, string> = {
  CUSTOMER: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  PROSPECT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  LEAD: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  CHURNED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  UNQUALIFIED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
};

export function ContactsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [tagFilter, setTagFilter] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const debouncedTag = useDebounce(tagFilter, 400);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editContact, setEditContact] = useState<ContactWithRelations | undefined>();
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading } = useListContacts({
    search: debouncedSearch || undefined,
    status: statusFilter !== "ALL" ? statusFilter as typeof ContactStatus[keyof typeof ContactStatus] : undefined,
    tag: debouncedTag || undefined,
    page: 1,
    pageSize: 50,
  });

  const openNew = () => { setEditContact(undefined); setDialogOpen(true); };
  const openEdit = (c: ContactWithRelations) => { setEditContact(c); setDialogOpen(true); };

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
            <p className="text-muted-foreground">Manage your people and leads.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Import CSV
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
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s === "ALL" ? "All statuses" : s}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Input
              placeholder="Filter by tag…"
              className="w-36"
              value={tagFilter}
              onChange={e => setTagFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(5)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>)}
                  </TableRow>
                ))
              ) : data?.data && data.data.length > 0 ? (
                data.data.map(contact => (
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
                      <div className="flex flex-wrap gap-1">
                        {(contact.tags ?? []).slice(0, 3).map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No contacts found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ContactDialog open={dialogOpen} onOpenChange={setDialogOpen} contact={editContact} />
      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </SidebarLayout>
  );
}
