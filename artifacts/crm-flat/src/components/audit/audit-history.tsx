import { useListAudit, getListAuditQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { History, Plus, Pencil, Trash2, GitMerge, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  ACTION_COLORS,
  extractDiff,
  formatFieldName,
  formatValue,
} from "./audit-utils";

interface AuditHistoryProps {
  objectType: "company" | "contact" | "deal" | "activity";
  objectId: string;
}

function ActionIcon({ action }: { action: string }) {
  if (action === "CREATE") return <Plus className="h-4 w-4 text-green-500" />;
  if (action === "UPDATE") return <Pencil className="h-4 w-4 text-blue-500" />;
  if (action === "DELETE") return <Trash2 className="h-4 w-4 text-red-500" />;
  if (action === "MERGE") return <GitMerge className="h-4 w-4 text-purple-500" />;
  return <History className="h-4 w-4 text-muted-foreground" />;
}

export function AuditHistory({ objectType, objectId }: AuditHistoryProps) {
  const params = { objectType, objectId, pageSize: 100 };
  const { data, isLoading } = useListAudit(params, {
    query: { enabled: !!objectId, queryKey: getListAuditQueryKey(params) },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  const entries = data?.data ?? [];

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
        <History className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No history recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="audit-history">
      {entries.map((entry) => {
        const diff = extractDiff(entry.changes);
        return (
          <div key={entry.id} className="flex gap-3 p-4 border rounded-lg bg-card">
            <div className="shrink-0 mt-0.5">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                <ActionIcon action={entry.action} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <Badge
                  variant="outline"
                  className={`font-normal border-0 ${ACTION_COLORS[entry.action] ?? ""}`}
                >
                  {entry.action}
                </Badge>
                <span className="font-medium">
                  {entry.actor?.name ?? entry.actorName ?? "Unknown"}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                </span>
              </div>

              {entry.action === "UPDATE" && diff.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {diff.map((d) => (
                    <li key={d.field} className="text-sm flex items-start gap-2 flex-wrap">
                      <span className="font-medium text-muted-foreground min-w-[120px]">
                        {formatFieldName(d.field)}
                      </span>
                      <span className="line-through text-muted-foreground">
                        {formatValue(d.from)}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                      <span className="font-medium">{formatValue(d.to)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {entry.action === "UPDATE" && diff.length === 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  No tracked field changes.
                </p>
              )}

              {entry.action === "CREATE" && (
                <p className="text-sm text-muted-foreground mt-1">Record created.</p>
              )}
              {entry.action === "DELETE" && (
                <p className="text-sm text-muted-foreground mt-1">Record deleted.</p>
              )}
              {entry.action === "MERGE" && (
                <p className="text-sm text-muted-foreground mt-1">Records merged.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
