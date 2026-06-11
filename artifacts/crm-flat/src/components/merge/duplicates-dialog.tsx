import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Users } from "lucide-react";
import { MergeDialog } from "./merge-dialog";
import { type MergeConfig } from "./merge-resolution";

interface DuplicateGroup<R> {
  matchedOn: string[];
  records: R[];
}

interface DuplicatesDialogProps<R extends { id: string }> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: DuplicateGroup<R>[] | undefined;
  isLoading: boolean;
  isMerging: boolean;
  config: MergeConfig<R>;
  /** When set, only show groups containing this record id (record-detail context). */
  focusId?: string;
  onConfirm: (primaryId: string, mergeIds: string[]) => Promise<void> | void;
}

export function DuplicatesDialog<R extends { id: string }>({
  open,
  onOpenChange,
  groups,
  isLoading,
  isMerging,
  config,
  focusId,
  onConfirm,
}: DuplicatesDialogProps<R>) {
  const [activeGroup, setActiveGroup] = useState<R[] | null>(null);

  const visibleGroups = useMemo(() => {
    const list = groups ?? [];
    if (!focusId) return list;
    return list.filter((g) => g.records.some((r) => r.id === focusId));
  }, [groups, focusId]);

  const handleConfirm = async (primaryId: string, mergeIds: string[]) => {
    await onConfirm(primaryId, mergeIds);
    setActiveGroup(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Duplicate {config.noun}s</DialogTitle>
            <DialogDescription>
              {focusId
                ? `Possible duplicates of this ${config.noun}. Review a group to merge.`
                : `${config.noun[0].toUpperCase()}${config.noun.slice(1)}s that look like duplicates, grouped by matching ${config.entity === "company" ? "name or domain" : "email or name"}.`}
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="font-medium">No duplicates found</p>
              <p className="text-sm">
                {focusId ? `This ${config.noun} has no likely duplicates.` : `Every ${config.noun} looks unique.`}
              </p>
            </div>
          ) : (
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {visibleGroups.map((g, idx) => (
                <div key={idx} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{config.title(g.records[0])}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {g.records.length} records · matched on {g.matchedOn.join(", ")}
                    </p>
                  </div>
                  <div className="hidden gap-1 sm:flex">
                    {g.matchedOn.map((m) => <Badge key={m} variant="secondary">{m}</Badge>)}
                  </div>
                  <Button size="sm" onClick={() => setActiveGroup(g.records)}>Review &amp; merge</Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {activeGroup && (
        <MergeDialog
          open={!!activeGroup}
          onOpenChange={(o) => !o && setActiveGroup(null)}
          records={activeGroup}
          config={config}
          defaultPrimaryId={focusId}
          isMerging={isMerging}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
