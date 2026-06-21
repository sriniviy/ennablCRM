import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionToken } from "@/hooks/use-session-token";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { MoreVertical, Plus, Pencil, Trash2, ArrowLeft, ArrowRight, Info, LayoutGrid } from "lucide-react";
import { CardRenderer } from "./card-renderer";
import { CardBuilderDialog } from "./card-builder-dialog";
import { BASE, type DashboardCard, type VizType, type Dataset, type CardConfig } from "./types";

const SIZE_CLASS: Record<string, string> = {
  sm: "md:col-span-1",
  md: "md:col-span-2",
  lg: "md:col-span-4",
};

export function DashboardView({ dashboardId }: { dashboardId: string }) {
  const getToken = useSessionToken();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<DashboardCard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DashboardCard | null>(null);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    [getToken],
  );

  const cardsKey = ["dashboard-cards", dashboardId];
  const { data: cards, isLoading } = useQuery<DashboardCard[]>({
    queryKey: cardsKey,
    queryFn: () => authFetch(`${BASE}/api/dashboards/${dashboardId}/cards`),
  });

  const createCard = useMutation({
    mutationFn: (payload: {
      title: string;
      vizType: VizType;
      dataset: Dataset;
      config: CardConfig;
      size: string;
    }) =>
      authFetch(`${BASE}/api/dashboards/${dashboardId}/cards`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cardsKey });
      setBuilderOpen(false);
      toast({ title: "Card added" });
    },
    onError: () => toast({ title: "Couldn't add card", variant: "destructive" }),
  });

  const updateCard = useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      authFetch(`${BASE}/api/dashboards/cards/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cardsKey });
      setBuilderOpen(false);
      setEditing(null);
    },
    onError: () => toast({ title: "Couldn't save card", variant: "destructive" }),
  });

  const deleteCard = useMutation({
    mutationFn: (id: string) =>
      authFetch(`${BASE}/api/dashboards/cards/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cardsKey });
      setDeleteTarget(null);
      toast({ title: "Card removed" });
    },
    onError: () => toast({ title: "Couldn't remove card", variant: "destructive" }),
  });

  const reorder = useMutation({
    mutationFn: (order: string[]) =>
      authFetch(`${BASE}/api/dashboards/cards/reorder`, {
        method: "POST",
        body: JSON.stringify({ order }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: cardsKey }),
  });

  const move = (card: DashboardCard, dir: -1 | 1) => {
    if (!cards) return;
    const idx = cards.findIndex((c) => c.id === card.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= cards.length) return;
    const next = [...cards];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    reorder.mutate(next.map((c) => c.id));
  };

  const chartHeight = (size: string) => (size === "sm" ? 180 : 260);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => { setEditing(null); setBuilderOpen(true); }}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add card
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64 md:col-span-2" />)}
        </div>
      ) : !cards || cards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <LayoutGrid className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium">No cards yet</p>
              <p className="text-sm text-muted-foreground">Add your first card to start building this dashboard.</p>
            </div>
            <Button onClick={() => { setEditing(null); setBuilderOpen(true); }}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add card
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          {cards.map((card, i) => (
            <Card key={card.id} className={`${SIZE_CLASS[card.size] ?? SIZE_CLASS.md} flex flex-col`}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CardTitle className="text-sm font-medium truncate">{card.title}</CardTitle>
                  {card.config.info && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[240px] text-xs">
                          {card.config.info}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setEditing(card); setBuilderOpen(true); }}>
                      <Pencil className="h-4 w-4 mr-2" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={i === 0} onClick={() => move(card, -1)}>
                      <ArrowLeft className="h-4 w-4 mr-2" /> Move left
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={i === cards.length - 1} onClick={() => move(card, 1)}>
                      <ArrowRight className="h-4 w-4 mr-2" /> Move right
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(card)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="flex-1">
                <CardRenderer card={card} height={chartHeight(card.size)} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CardBuilderDialog
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        dashboardId={dashboardId}
        editing={editing}
        saving={createCard.isPending || updateCard.isPending}
        onSave={(payload) => {
          if (editing) updateCard.mutate({ id: editing.id, ...payload });
          else createCard.mutate(payload);
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this card?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" will be removed from this dashboard. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteCard.mutate(deleteTarget.id)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
