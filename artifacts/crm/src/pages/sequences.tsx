import { useState } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { Link } from "wouter";
import { useAuth } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, ListOrdered, Users, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SequenceSummary {
  id: string;
  name: string;
  stepCount: number;
  activeEnrollments: number;
  totalEnrollments: number;
  createdAt: string;
}

function useSequenceApi() {
  const { getToken } = useAuth();
  return async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`${BASE}/api/sequences${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { error?: string }).error ?? `Request failed (${res.status})`,
      );
    }
    if (res.status === 204) return null;
    return res.json();
  };
}

export function SequencesPage() {
  const apiFetch = useSequenceApi();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: sequences, isLoading } = useQuery<SequenceSummary[]>({
    queryKey: ["sequences"],
    queryFn: () => apiFetch(""),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch("", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sequences"] });
      setShowCreate(false);
      setNewName("");
      toast({ title: "Sequence created" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Sequences</h1>
            <p className="text-muted-foreground">
              Automated drip campaigns — enroll contacts and send timed email steps.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campaigns">Campaigns</Link>
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Sequence
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-24 mt-1" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : sequences && sequences.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sequences.map((seq) => (
              <Link key={seq.id} href={`/sequences/${seq.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      {seq.name}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </CardTitle>
                    <CardDescription className="flex items-center gap-4 mt-1">
                      <span className="flex items-center gap-1">
                        <ListOrdered className="h-3.5 w-3.5" />
                        {seq.stepCount} step{seq.stepCount !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {seq.activeEnrollments} active
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      {seq.totalEnrollments} total enrollment
                      {seq.totalEnrollments !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="flex flex-col items-center justify-center py-16">
            <ListOrdered className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
            <p className="text-muted-foreground text-sm mb-4">No sequences yet.</p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create your first sequence
            </Button>
          </Card>
        )}

        {/* Create dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Sequence</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <Input
                placeholder="Sequence name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim())
                    createMutation.mutate(newName.trim());
                }}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate(newName.trim())}
                disabled={!newName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SidebarLayout>
  );
}
