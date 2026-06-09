import { useState } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import {
  useGetMe,
  useListAudit,
  getListAuditQueryKey,
  type AuditAction,
} from "@workspace/api-client-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { ScrollText, ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import {
  ACTION_COLORS,
  OBJECT_TYPE_LABELS,
  changeSummary,
} from "@/components/audit/audit-utils";
import { useTeamMembers } from "@/hooks/use-team-members";

const PAGE_SIZE = 50;
const ALL = "__all__";

export function AuditLogPage() {
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "ADMIN";
  const { data: teamMembers = [] } = useTeamMembers();

  const [objectType, setObjectType] = useState<string>(ALL);
  const [action, setAction] = useState<string>(ALL);
  const [actorId, setActorId] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [page, setPage] = useState(1);

  const params = {
    objectType: objectType === ALL ? undefined : objectType,
    action: action === ALL ? undefined : (action as AuditAction),
    actorId: actorId === ALL ? undefined : actorId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const { data, isLoading, isError } = useListAudit(params, {
    query: { enabled: isAdmin, queryKey: getListAuditQueryKey(params) },
  });

  const resetPage = () => setPage(1);
  const hasFilters = objectType !== ALL || action !== ALL || actorId !== ALL || !!dateFrom || !!dateTo;

  if (me && !isAdmin) {
    return (
      <SidebarLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">Admin access required</h2>
          <p className="text-muted-foreground mt-1">
            You don't have permission to view the audit log.
          </p>
        </div>
      </SidebarLayout>
    );
  }

  const entries = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ScrollText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Audit Log</h1>
            <p className="text-muted-foreground text-sm">
              Immutable record of every change across your CRM.
            </p>
          </div>
        </div>

        <Card className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Object type</label>
              <Select
                value={objectType}
                onValueChange={(v) => {
                  setObjectType(v);
                  resetPage();
                }}
              >
                <SelectTrigger className="w-40" data-testid="filter-object-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="contact">Contact</SelectItem>
                  <SelectItem value="deal">Deal</SelectItem>
                  <SelectItem value="activity">Activity</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Action</label>
              <Select
                value={action}
                onValueChange={(v) => {
                  setAction(v);
                  resetPage();
                }}
              >
                <SelectTrigger className="w-36" data-testid="filter-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All actions</SelectItem>
                  <SelectItem value="CREATE">Create</SelectItem>
                  <SelectItem value="UPDATE">Update</SelectItem>
                  <SelectItem value="DELETE">Delete</SelectItem>
                  <SelectItem value="MERGE">Merge</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">User</label>
              <Select
                value={actorId}
                onValueChange={(v) => {
                  setActorId(v);
                  resetPage();
                }}
              >
                <SelectTrigger className="w-44" data-testid="filter-actor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All users</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name ?? m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  resetPage();
                }}
                className="w-40"
                data-testid="filter-date-from"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  resetPage();
                }}
                className="w-40"
                data-testid="filter-date-to"
              />
            </div>

            {hasFilters && (
              <Button
                variant="ghost"
                onClick={() => {
                  setObjectType(ALL);
                  setAction(ALL);
                  setActorId(ALL);
                  setDateFrom("");
                  setDateTo("");
                  resetPage();
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead className="w-28">Action</TableHead>
                <TableHead className="w-28">Type</TableHead>
                <TableHead>Object</TableHead>
                <TableHead>Changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [0, 1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {!isLoading && isError && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-destructive py-10">
                    Failed to load audit log.
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !isError && entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    No audit entries match your filters.
                  </TableCell>
                </TableRow>
              )}

              {!isLoading &&
                entries.map((entry) => (
                  <TableRow key={entry.id} data-testid={`audit-row-${entry.id}`}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(entry.createdAt), "MMM d, yyyy h:mm a")}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {entry.actor?.name ?? entry.actorName ?? "Unknown"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`font-normal border-0 ${ACTION_COLORS[entry.action] ?? ""}`}
                      >
                        {entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {OBJECT_TYPE_LABELS[entry.objectType] ?? entry.objectType}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {entry.objectLabel ?? entry.objectId}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">
                      {changeSummary(entry.action, entry.changes)}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>

          {!isLoading && total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                {total} {total === 1 ? "entry" : "entries"} · Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data?.hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </SidebarLayout>
  );
}
