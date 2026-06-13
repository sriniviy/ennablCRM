import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { Link } from "wouter";
import { ChevronLeft, CalendarClock, Pause, Play, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useSessionToken } from "@/hooks/use-session-token";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

interface ScheduledExport {
  id: string;
  frequency: "daily" | "weekly";
  dataType: "tasks" | "activities" | "notes" | "combined";
  deliveryEmail: string;
  paused: boolean;
  lastSentAt: string | null;
  nextSendAt: string;
  createdAt: string;
}

const DATA_TYPE_LABELS: Record<string, string> = {
  tasks: "Tasks",
  activities: "Activities",
  notes: "Notes",
  combined: "Combined Report",
};

export function SettingsExportsPage() {
  const getToken = useSessionToken();
  const qc = useQueryClient();
  const { toast } = useToast();

  const authFetch = async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`/api/scheduled-exports${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
    });
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as { error?: string }).error ?? `Error ${res.status}`); }
    return res.json();
  };

  const { data: schedules = [], isLoading } = useQuery<ScheduledExport[]>({
    queryKey: ["scheduled-exports"],
    queryFn: () => authFetch(""),
    staleTime: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, paused }: { id: string; paused: boolean }) => authFetch(`/${id}`, { method: "PATCH", body: JSON.stringify({ paused }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled-exports"] }),
    onError: (err: Error) => toast({ title: "Failed to update", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scheduled-exports"] }); toast({ title: "Scheduled export deleted" }); },
    onError: (err: Error) => toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
  });

  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
            <Link href="/settings"><ChevronLeft className="h-4 w-4 mr-1" /> Settings</Link>
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scheduled Exports</h1>
          <p className="text-sm text-muted-foreground">Automated CSV exports delivered to your inbox.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Active Schedules
            </CardTitle>
            <CardDescription>Manage your recurring data exports.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                  </div>
                ))}
              </div>
            ) : schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scheduled exports yet. Set one up from the contacts or deals export dialog.</p>
            ) : (
              <div className="divide-y">
                {schedules.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {DATA_TYPE_LABELS[s.dataType]} — {s.frequency === "daily" ? "Daily" : "Weekly (Mon)"}
                        </span>
                        {s.paused && <Badge variant="secondary" className="text-xs">Paused</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        To: {s.deliveryEmail} · Next: {format(new Date(s.nextSendAt), "MMM d, yyyy 'at' h:mm a")}
                        {s.lastSentAt && <> · Last sent: {format(new Date(s.lastSentAt), "MMM d, yyyy")}</>}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                      title={s.paused ? "Resume" : "Pause"} disabled={toggleMutation.isPending}
                      onClick={() => toggleMutation.mutate({ id: s.id, paused: !s.paused })}>
                      {s.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete scheduled export?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently stop the <strong>{s.frequency}</strong> {DATA_TYPE_LABELS[s.dataType].toLowerCase()} export to <strong>{s.deliveryEmail}</strong>. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(s.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SidebarLayout>
  );
}
