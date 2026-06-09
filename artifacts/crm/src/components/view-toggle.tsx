import { List, LayoutGrid } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type ViewMode = "table" | "cards";

export function ViewToggle({
  value,
  onChange,
  tableLabel = "Table view",
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  tableLabel?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as ViewMode)}
      variant="outline"
      className="border rounded-md"
    >
      <ToggleGroupItem value="table" aria-label={tableLabel} data-testid="view-table">
        <List className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="cards" aria-label="Card view" data-testid="view-cards">
        <LayoutGrid className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
