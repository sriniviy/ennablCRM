import { useState } from "react";
import { Sparkles, RefreshCw, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionToken } from "@/hooks/use-session-token";
import { useToast } from "@/hooks/use-toast";

interface ActivitySummaryProps {
  activityId: string;
  type: string;
  summary: string | null | undefined;
  onUpdated: (summary: string) => void;
}

const SUMMARIZABLE = new Set(["EMAIL_SENT", "EMAIL_OPENED", "EMAIL_CLICKED", "MEETING"]);

const ACTION_DELIMITER = "\n\nAction Items:\n";

function parseSummary(raw: string): { text: string; items: string[] } {
  const idx = raw.indexOf(ACTION_DELIMITER);
  if (idx === -1) return { text: raw, items: [] };
  const text = raw.slice(0, idx);
  const items = raw
    .slice(idx + ACTION_DELIMITER.length)
    .split("\n")
    .map(l => l.replace(/^[•\-]\s*/, "").trim())
    .filter(Boolean);
  return { text, items };
}

export function ActivitySummary({ activityId, type, summary, onUpdated }: ActivitySummaryProps) {
  const getToken = useSessionToken();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  const canSummarize = SUMMARIZABLE.has(type);

  const handleSummarize = async () => {
    setPending(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/activities/${activityId}/summarize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { aiSummary: string };
      onUpdated(data.aiSummary);
      toast({ title: summary ? "Summary regenerated" : "Summary generated" });
    } catch {
      toast({ title: "Could not generate summary", variant: "destructive" });
    } finally {
      setPending(false);
    }
  };

  if (summary) {
    const { text, items } = parseSummary(summary);
    return (
      <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            AI summary
          </span>
          {canSummarize && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground"
              onClick={handleSummarize}
              disabled={pending}
              title="Regenerate summary"
              data-testid={`button-regenerate-summary-${activityId}`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-snug">{text}</p>
        {items.length > 0 && (
          <div className="mt-3 border-t border-primary/15 pt-2">
            <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-primary">
              <CheckSquare className="h-3.5 w-3.5" />
              Action items
            </p>
            <ul className="space-y-1.5">
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-snug">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-primary/30 bg-background text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (!canSummarize) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="mt-2 h-7 gap-1.5 text-xs"
      onClick={handleSummarize}
      disabled={pending}
      data-testid={`button-generate-summary-${activityId}`}
    >
      {pending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {pending ? "Generating..." : "Generate AI summary"}
    </Button>
  );
}
