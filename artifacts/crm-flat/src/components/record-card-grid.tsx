import type { ReactNode } from "react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Share2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  onShare?: (item: T) => void;
  emptyMessage?: string;
  previewCount?: number;
}

function RecordCard<T>({
  item,
  getTitle,
  fields,
  onItemClick,
  onShare,
  previewCount,
}: {
  item: T;
  getTitle: (item: T) => ReactNode;
  fields: CardField<T>[];
  onItemClick?: (item: T) => void;
  onShare?: (item: T) => void;
  previewCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = fields.length > previewCount;
  const visible = expanded ? fields : fields.slice(0, previewCount);
  const hiddenCount = fields.length - previewCount;

  return (
    <Card
      className={`group relative ${onItemClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
      onClick={onItemClick ? () => onItemClick(item) : undefined}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base min-w-0 flex-1">{getTitle(item)}</CardTitle>
          {onShare && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onShare(item);
                    }}
                    className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    aria-label="Share"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Share</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm pb-0">
        {visible.map((f) => (
          <div key={f.label} className="flex justify-between gap-3">
            <span className="text-muted-foreground shrink-0">{f.label}</span>
            <span className="text-right break-words min-w-0">{f.render(item)}</span>
          </div>
        ))}
      </CardContent>
      {hasMore && (
        <button
          className="w-full flex items-center justify-center gap-1 px-4 py-2 mt-2 text-xs text-muted-foreground hover:text-foreground border-t transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" /> Show less</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> {hiddenCount} more fields</>
          )}
        </button>
      )}
    </Card>
  );
}

export function RecordCardGrid<T>({
  items,
  getKey,
  getTitle,
  fields,
  onItemClick,
  onShare,
  emptyMessage = "No records found.",
  previewCount = 5,
}: RecordCardGridProps<T>) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border bg-card p-12 text-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
      {items.map((item) => (
        <RecordCard
          key={getKey(item)}
          item={item}
          getTitle={getTitle}
          fields={fields}
          onItemClick={onItemClick}
          onShare={onShare}
          previewCount={previewCount}
        />
      ))}
    </div>
  );
}
