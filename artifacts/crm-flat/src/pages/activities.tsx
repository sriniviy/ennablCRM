import { SidebarLayout } from "@/components/layout/sidebar-layout";

import { useListActivities, ActivityType, type ActivityWithRelations } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { RecordCardGrid, type CardField } from "@/components/record-card-grid";

const TYPES = ["ALL", ...Object.values(ActivityType)];

const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const fmtType = (t: string) => t.replace(/_/g, " ");

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

export function ActivitiesPage() {
  const { get, set } = useUrlFilters();

  const typeFilter = get("type") || "ALL";
  const dateFrom = get("dateFrom");
  const dateTo = get("dateTo");
  const view: ViewMode = get("view") === "cards" ? "cards" : "table";

  const { data, isLoading } = useListActivities({
    type: typeFilter !== "ALL" ? typeFilter as typeof ActivityType[keyof typeof ActivityType] : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page: 1,
    pageSize: 50,
  });

  const activities = data?.data ?? [];

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Notes</h1>
            <p className="text-muted-foreground">A timeline of everything happening across your CRM.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select value={typeFilter} onValueChange={val => set({ type: val })}>
              <SelectTrigger className="w-48" data-testid="select-activity-type"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                {TYPES.map(t => <SelectItem key={t} value={t}>{t === "ALL" ? "All types" : fmtType(t)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              className="w-40"
              value={dateFrom}
              onChange={e => set({ dateFrom: e.target.value })}
              data-testid="input-activity-from"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              className="w-40"
              value={dateTo}
              onChange={e => set({ dateTo: e.target.value })}
              data-testid="input-activity-to"
            />
          </div>
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
      </div>
    </SidebarLayout>
  );
}
