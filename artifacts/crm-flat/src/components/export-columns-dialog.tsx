import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download } from "lucide-react";

export interface ColumnDef {
  key: string;
  label: string;
}

interface ExportColumnsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ColumnDef[];
  storageKey: string;
  onExport: (selectedFields: string[]) => void;
  exporting?: boolean;
}

export function ExportColumnsDialog({
  open,
  onOpenChange,
  columns,
  storageKey,
  onExport,
  exporting = false,
}: ExportColumnsDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        const valid = parsed.filter((k) => columns.some((c) => c.key === k));
        if (valid.length > 0) return new Set(valid);
      }
    } catch {
    }
    return new Set(columns.map((c) => c.key));
  });

  useEffect(() => {
    if (!open) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        const valid = parsed.filter((k) => columns.some((c) => c.key === k));
        if (valid.length > 0) {
          setSelected(new Set(valid));
          return;
        }
      }
    } catch {
    }
    setSelected(new Set(columns.map((c) => c.key)));
  }, [open, storageKey, columns]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const allSelected = selected.size === columns.length;
  const noneSelected = selected.size === 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(columns.map((c) => c.key)));
    }
  };

  const handleExport = () => {
    const fields = columns.filter((c) => selected.has(c.key)).map((c) => c.key);
    try {
      localStorage.setItem(storageKey, JSON.stringify(fields));
    } catch {
    }
    onExport(fields);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Choose columns to export</DialogTitle>
          <DialogDescription>
            Select the fields you want included in the CSV file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-2">
          <div className="flex items-center gap-2 pb-2 border-b mb-2">
            <Checkbox
              id="select-all"
              checked={allSelected}
              onCheckedChange={toggleAll}
              aria-label="Select all columns"
            />
            <Label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
              {allSelected ? "Deselect all" : "Select all"}
            </Label>
          </div>
          {columns.map((col) => (
            <div key={col.key} className="flex items-center gap-2 py-1">
              <Checkbox
                id={`col-${col.key}`}
                checked={selected.has(col.key)}
                onCheckedChange={() => toggle(col.key)}
              />
              <Label htmlFor={`col-${col.key}`} className="text-sm cursor-pointer font-normal">
                {col.label}
              </Label>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={exporting || noneSelected}>
            <Download className="mr-2 h-4 w-4" />
            {exporting ? "Exporting…" : `Export ${selected.size} column${selected.size !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
