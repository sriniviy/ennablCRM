import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleCardProps {
  title: string;
  children: React.ReactNode;
  previewHeight?: number;
  className?: string;
  contentClassName?: string;
  defaultExpanded?: boolean;
}

export function CollapsibleCard({
  title,
  children,
  previewHeight = 130,
  className,
  contentClassName,
  defaultExpanded = false,
}: CollapsibleCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded
              ? <ChevronUp className="h-4 w-4" />
              : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <div
        className="relative overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: expanded ? "9999px" : `${previewHeight}px` }}
      >
        <CardContent className={cn("space-y-3 text-sm pt-0 pb-3", contentClassName)}>
          {children}
        </CardContent>

        {!expanded && (
          <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-card to-transparent pointer-events-none" />
        )}
      </div>

      <button
        className="w-full flex items-center justify-center gap-1 px-6 py-2 text-xs text-muted-foreground hover:text-foreground border-t transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        {expanded
          ? <><ChevronUp className="h-3 w-3" /> Show less</>
          : <><ChevronDown className="h-3 w-3" /> Show more</>}
      </button>
    </Card>
  );
}
