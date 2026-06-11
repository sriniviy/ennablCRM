import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, X, CheckSquare, Mail, Phone, Calendar, MessageSquare, RefreshCw } from "lucide-react";
import { useSessionToken } from "@/hooks/use-session-token";
import { useToast } from "@/hooks/use-toast";
import { useCreateTask } from "@workspace/api-client-react";
import { getListTasksQueryKey } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Suggestion {
  id: string;
  text: string;
  action: "task" | "email" | "call" | "follow_up" | "meeting" | "other";
}

interface AiSuggestionsProps {
  objectType: "contact" | "deal";
  recordId: string;
  contactId?: string;
  dealId?: string;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  task: <CheckSquare className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  call: <Phone className="h-3.5 w-3.5" />,
  follow_up: <MessageSquare className="h-3.5 w-3.5" />,
  meeting: <Calendar className="h-3.5 w-3.5" />,
  other: <Sparkles className="h-3.5 w-3.5" />,
};

const ACTION_LABELS: Record<string, string> = {
  task: "Task",
  email: "Email",
  call: "Call",
  follow_up: "Follow-up",
  meeting: "Meeting",
  other: "Action",
};

export function AiSuggestions({ objectType, recordId, contactId, dealId }: AiSuggestionsProps) {
  const getToken = useSessionToken();
  const { toast } = useToast();
  const qc = useQueryClient();
  const createTask = useCreateTask();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["ai-suggestions", objectType, recordId],
    queryFn: async () => {
      const token = await getToken();
      const params = new URLSearchParams({ objectType, recordId });
      const res = await fetch(`/api/ai/suggestions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      return res.json() as Promise<{ suggestions: Suggestion[] }>;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const visible = (data?.suggestions ?? []).filter(s => !dismissed.has(s.id));

  const handleCreateTask = (suggestion: Suggestion) => {
    createTask.mutate(
      {
        data: {
          title: suggestion.text,
          contactId: contactId ?? undefined,
          dealId: dealId ?? undefined,
          priority: "MEDIUM",
          type: suggestion.action === "call" ? "CALL" : suggestion.action === "email" ? "EMAIL" : "TODO",
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Task created", description: suggestion.text });
          qc.invalidateQueries({ queryKey: getListTasksQueryKey() });
          setDismissed(prev => new Set(prev).add(suggestion.id));
        },
        onError: () => toast({ title: "Failed to create task", variant: "destructive" }),
      },
    );
  };

  if (isError) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Suggestions
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh suggestions"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
          </>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">
            {dismissed.size > 0 ? "All suggestions dismissed." : "No suggestions at this time."}
          </p>
        ) : (
          visible.map(s => (
            <div
              key={s.id}
              className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Badge variant="secondary" className="text-xs gap-1 px-1.5 py-0">
                    {ACTION_ICONS[s.action] ?? ACTION_ICONS.other}
                    {ACTION_LABELS[s.action] ?? "Action"}
                  </Badge>
                </div>
                <p className="text-sm leading-snug">{s.text}</p>
              </div>
              <div className="flex gap-1 shrink-0 mt-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-primary hover:text-primary"
                  title="Create as task"
                  onClick={() => handleCreateTask(s)}
                  disabled={createTask.isPending}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground"
                  title="Dismiss"
                  onClick={() => setDismissed(prev => new Set(prev).add(s.id))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
