import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useState } from "react";
import { useListActivities, ActivityType, type ActivityWithRelations } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ChevronDown } from "lucide-react";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useDebounce } from "@/hooks/use-debounce";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { RecordCardGrid, type CardField } from "@/components/record-card-grid";

const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const fmtType = (t: string) => t.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());

const PAGE_TITLES: Record<string, string> = {
  CALL: "Calls",
  EMAIL_SENT: "Emails",
  NOTE: "Notes",
  MEETING: "Meetings",
};

const contactName = (a: ActivityWithRelations) =>
  a.contact ? `${a.contact.firstName ?? ""} ${a.contact.lastName ?? ""}`.trim() || "—" : "—";

const CARD_FIELDS: CardField<ActivityWithRelations>[] = [
  { label: "Type", render: a => fmtType(a.type) },
  { label: "Description", render: a => dash(a.description) },
  { label: "Date", render: a => (a.createdAt ? new Date(a.createdAt).toLocaleString() : "—") },
  { label: "End date", render: a => (a.endDate ? new Date(a.endDate).toLocaleString() : "—") },
  { label: "Email subject", render: a => dash(a.emailSubject) },
  { label: "Email body", render: a => dash(a.emailBody) },
  { label: "AI summary", render: a => dash(a.aiSummary) },
  { label: "User", render: a => dash(a.user?.name) },
  { label: "Contact", render: a => contactName(a) },
  { label: "Deal", render: a => dash(a.deal?.title) },
  { label: "Metadata", render: a => (a.metadata ? JSON.stringify(a.metadata) : "—") },
  { label: "User ID", render: a => dash(a.userId) },
  { label: "Contact ID", render: a => dash(a.contactId) },
  { label: "Deal ID", render: a => dash(a.dealId) },
  { label: "ID", render: a => dash(a.id) },
];

const PAGE_SIZE = 200;

export function ActivitiesPage() {
  const { get, set } = useUrlFilters();

  const typeFilter = get("type") || "ALL";
  const search = get("search");
  const dateFrom = get("dateFrom");
  const dateTo = get("dateTo");
  const view: ViewMode = get("view") === "cards" ? "cards" : "table";

  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, isFetching } = useListActivities({
    type: typeFilter !== "ALL" ? typeFilter as typeof ActivityType[keyof typeof ActivityType] : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page: 1,
    pageSize,
  });

  const allActivities = data?.data ?? [];
  const total = data?.total ?? 0;
  const hasMore = data?.hasMore ?? false;

  const activities = debouncedSearch
    ? allActivities.filter(a =>
        [a.title, a.description, a.emailSubject, a.emailBody]
          .some(f => f?.toLowerCase().includes(debouncedSearch.toLowerCase()))
      )
    : allActivities;

  const pageTitle = PAGE_TITLES[typeFilter] ?? "Activities";

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{pageTitle}</h1>
            <p className="text-muted-foreground">
              {total > 0
                ? `Showing ${allActivities.length.toLocaleString()} of ${total.toLocaleString()} ${pageTitle.toLowerCase()}`
                : "A timeline of everything happening across your CRM."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${pageTitle.toLowerCase()}…`}
              className="pl-8"
              value={search}
              onChange={e => set({ search: e.target.value })}
              data-testid="input-search-activities"
            />
          </div>
          <Input
            type="date"
            className="w-40"
            value={dateFrom}
            onChange={e => set({ dateFrom: e.target.value })}
            data-testid="input-activity-from"
          />
          <Input
            type="date"
            className="w-40"
            value={dateTo}
            onChange={e => set({ dateTo: e.target.value })}
            data-testid="input-activity-to"
          />
          <div className="ml-auto">
            <ViewToggle value={view} onChange={v => set({ view: v === "cards" ? "cards" : undefined })} />
          </div>
        </div>

        {view === "cards" ? (
          isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-64 w-full" />)}
            </div>
          ) : (
            <RecordCardGrid
              items={activities}
              getKey={a => a.id}
              getTitle={a => a.title}
              fields={CARD_FIELDS}
              emptyMessage="No activities found."
            />
          )
        ) : (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Deal</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(6)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>)}
                    </TableRow>
                  ))
                ) : activities.length > 0 ? (
                  activities.map(activity => (
                    <TableRow key={activity.id}>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">{fmtType(activity.type)}</Badge>
                      </TableCell>
                      <TableCell className="font-medium max-w-xs truncate">{activity.title}</TableCell>
                      <TableCell>
                        {activity.contact ? (
                          <Link href={`/contacts/${activity.contact.id}`} className="hover:underline text-primary">
                            {contactName(activity)}
                          </Link>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{activity.deal?.title ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{activity.user?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {activity.createdAt ? new Date(activity.createdAt).toLocaleString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No activities found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              onClick={() => setPageSize(ps => ps + PAGE_SIZE)}
              disabled={isFetching}
            >
              <ChevronDown className="mr-2 h-4 w-4" />
              {isFetching ? "Loading…" : `Load more (${(total - allActivities.length).toLocaleString()} remaining)`}
            </Button>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
