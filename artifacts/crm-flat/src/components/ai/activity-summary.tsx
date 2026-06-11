import { useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionToken } from "@/hooks/use-session-token";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ActivitySummaryProps {
  activityId: string;
  type: string;
  summary: string | null | undefined;
  onUpdated: (summary: string) => void;
}

const SUMMARIZABLE = new Set(["EMAIL_SENT", "EMAIL_OPENED", "EMAIL_CLICKED", "MEETING"]);

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
        <p className="mt-1 whitespace-pre-wrap text-sm leading-snug">{summary}</p>
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
