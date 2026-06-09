import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface CardField<T> {
  label: string;
  render: (item: T) => ReactNode;
}

interface RecordCardGridProps<T> {
  items: T[];
  getKey: (item: T) => string;
  getTitle: (item: T) => ReactNode;
  fields: CardField<T>[];
  onItemClick?: (item: T) => void;
  emptyMessage?: string;
}

export function RecordCardGrid<T>({
  items,
  getKey,
  getTitle,
  fields,
  onItemClick,
  emptyMessage = "No records found.",
}: RecordCardGridProps<T>) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border bg-card p-12 text-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Card
          key={getKey(item)}
          className={onItemClick ? "cursor-pointer hover:shadow-md transition-shadow" : undefined}
          onClick={onItemClick ? () => onItemClick(item) : undefined}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{getTitle(item)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {fields.map((f) => (
              <div key={f.label} className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">{f.label}</span>
                <span className="text-right break-words min-w-0">{f.render(item)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
