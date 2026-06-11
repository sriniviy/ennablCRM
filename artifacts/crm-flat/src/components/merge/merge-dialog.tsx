import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { type MergeConfig, resolveField } from "./merge-resolution";

interface MergeDialogProps<R extends { id: string }> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: R[];
  config: MergeConfig<R>;
  /** Pre-selected primary id (e.g. when launched from a record detail page). */
  defaultPrimaryId?: string;
  isMerging?: boolean;
  onConfirm: (primaryId: string, mergeIds: string[]) => void;
}

export function MergeDialog<R extends { id: string }>({
  open,
  onOpenChange,
  records,
  config,
  defaultPrimaryId,
  isMerging,
  onConfirm,
}: MergeDialogProps<R>) {
  const [primaryId, setPrimaryId] = useState<string>("");

  useEffect(() => {
    if (open) {
      const fallback = records[0]?.id ?? "";
      const wanted = defaultPrimaryId && records.some((r) => r.id === defaultPrimaryId) ? defaultPrimaryId : fallback;
      setPrimaryId(wanted);
    }
  }, [open, defaultPrimaryId, records]);

  const primary = records.find((r) => r.id === primaryId);
  const losers = useMemo(() => records.filter((r) => r.id !== primaryId), [records, primaryId]);

  const resolved = useMemo(() => {
    if (!primary) return {};
    const out: Record<string, string> = {};
    for (const f of config.fields) {
      out[f.key] = f.format(resolveField(f, primary, losers));
    }
    return out;
  }, [primary, losers, config]);

  if (records.length < 2) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Merge {records.length} {config.noun}s</DialogTitle>
          <DialogDescription>
            Pick the record to keep. Empty fields are back-filled from the others, lists are combined, and
            all related records move to the kept {config.noun}. The other {losers.length === 1 ? `${config.noun} is` : `${config.noun}s are`} deleted.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={primaryId} onValueChange={setPrimaryId} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${records.length}, minmax(0, 1fr))` }}>
          {records.map((r) => {
            const selected = r.id === primaryId;
            return (
              <label
                key={r.id}
                htmlFor={`primary-${r.id}`}
                className={cn(
                  "cursor-pointer rounded-lg border p-3 transition-colors",
                  selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
                )}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value={r.id} id={`primary-${r.id}`} />
                  <span className="truncate font-medium">{config.title(r)}</span>
                  {selected && <Badge className="ml-auto shrink-0">Keep</Badge>}
                </div>
                {config.subtitle(r) && (
                  <p className="mt-1 truncate pl-6 text-xs text-muted-foreground">{config.subtitle(r)}</p>
                )}
                {config.meta.length > 0 && (
                  <p className="mt-1 pl-6 text-xs text-muted-foreground">
                    {config.meta.map((m) => `${m.value(r)} ${m.label.toLowerCase()}`).join(" · ")}
                  </p>
                )}
              </label>
            );
          })}
        </RadioGroup>

        <ScrollArea className="max-h-[40vh] rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Field</th>
                {records.map((r) => (
                  <th key={r.id} className="px-3 py-2 text-left font-medium">
                    <span className="truncate">{config.title(r)}</span>
                    {r.id === primaryId && <span className="ml-1 text-xs text-primary">(kept)</span>}
                  </th>
                ))}
                <th className="px-3 py-2 text-left font-medium text-primary">Result</th>
              </tr>
            </thead>
            <tbody>
              {config.fields.map((f) => (
                <tr key={f.key} className="border-b last:border-0">
                  <td className="px-3 py-2 align-top text-muted-foreground">{f.label}</td>
                  {records.map((r) => {
                    const display = f.format(f.value(r));
                    return (
                      <td key={r.id} className={cn("px-3 py-2 align-top", r.id === primaryId && "bg-primary/5")}>
                        {display}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 align-top font-medium">{resolved[f.key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>

        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>This cannot be undone. The merge is recorded in the audit log.</span>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isMerging || !primary}
            onClick={() => primary && onConfirm(primary.id, losers.map((l) => l.id))}
          >
            {isMerging ? "Merging…" : `Merge into "${primary ? config.title(primary) : ""}"`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
