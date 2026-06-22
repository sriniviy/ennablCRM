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
import { MoreVertical, Plus, Pencil, Trash2, ArrowLeft, ArrowRight, Info, LayoutGrid, GripVertical } from "lucide-react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { CardRenderer } from "./card-renderer";
import { CardBuilderDialog } from "./card-builder-dialog";
import { BASE, type DashboardCard, type VizType, type Dataset, type CardConfig } from "./types";

const SIZE_CLASS: Record<string, string> = {
  sm: "md:col-span-1",
  md: "md:col-span-2",
  lg: "md:col-span-4",
};

type CardSize = "sm" | "md" | "lg";
const ALLOWED_SPANS: Array<{ span: number; size: CardSize }> = [
  { span: 1, size: "sm" },
  { span: 2, size: "md" },
  { span: 4, size: "lg" },
];
const GRID_GAP = 8;
const GRID_COLS = 4;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 800;

type ResizeState = { id: string; size: CardSize; height: number };

export function DashboardView({ dashboardId, canEdit = true }: { dashboardId: string; canEdit?: boolean }) {
  const getToken = useSessionToken();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<DashboardCard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DashboardCard | null>(null);
  const [resizing, setResizing] = useState<ResizeState | null>(null);

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
    onMutate: async (order: string[]) => {
      await qc.cancelQueries({ queryKey: cardsKey });
      const previous = qc.getQueryData<DashboardCard[]>(cardsKey);
      if (previous) {
        const byId = new Map(previous.map((c) => [c.id, c]));
        qc.setQueryData<DashboardCard[]>(cardsKey, order.map((id) => byId.get(id)).filter((c): c is DashboardCard => !!c));
      }
      return { previous };
    },
    onError: (_err, _order, ctx) => {
      if (ctx?.previous) qc.setQueryData(cardsKey, ctx.previous);
      toast({ title: "Couldn't reorder cards", variant: "destructive" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: cardsKey }),
  });

  // Unified resize mutation — handles size (cols), cardHeight (px), or both
  const resizeMutate = useCallback(
    async (id: string, patch: { size?: CardSize; cardHeight?: number }) => {
      await qc.cancelQueries({ queryKey: cardsKey });
      const previous = qc.getQueryData<DashboardCard[]>(cardsKey);
      if (previous) {
        qc.setQueryData<DashboardCard[]>(
          cardsKey,
          previous.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        );
      }
      try {
        await authFetch(`${BASE}/api/dashboards/cards/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        qc.invalidateQueries({ queryKey: cardsKey });
      } catch {
        if (previous) qc.setQueryData(cardsKey, previous);
        toast({ title: "Couldn't resize card", variant: "destructive" });
      }
    },
    [qc, cardsKey, authFetch, toast],
  );

  /** Right-edge drag → horizontal resize (col snap) */
  const startResizeH = (e: React.PointerEvent, card: DashboardCard) => {
    e.preventDefault();
    e.stopPropagation();
    const cardEl = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-card-id]");
    if (!cardEl) return;
    const gridWidth = cardEl.parentElement?.clientWidth ?? cardEl.offsetWidth;
    const colWidth = (gridWidth - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
    const startX = e.clientX;
    const startW = cardEl.offsetWidth;
    const origH = card.cardHeight ?? 260;
    let latestSize: CardSize = card.size;
    setResizing({ id: card.id, size: card.size, height: origH });

    const prevSel = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const onMove = (ev: PointerEvent) => {
      const rawSpan = (startW + (ev.clientX - startX) + GRID_GAP) / (colWidth + GRID_GAP);
      let best = ALLOWED_SPANS[0];
      for (const opt of ALLOWED_SPANS) if (Math.abs(opt.span - rawSpan) < Math.abs(best.span - rawSpan)) best = opt;
      latestSize = best.size;
      setResizing({ id: card.id, size: latestSize, height: origH });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = prevSel;
      document.body.style.cursor = "";
      setResizing(null);
      if (latestSize !== card.size) resizeMutate(card.id, { size: latestSize });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /** Bottom-edge drag → vertical resize (free px) */
  const startResizeV = (e: React.PointerEvent, card: DashboardCard) => {
    e.preventDefault();
    e.stopPropagation();
    const origH = card.cardHeight ?? 260;
    const origSize = card.size;
    const startY = e.clientY;
    let latestH = origH;
    setResizing({ id: card.id, size: origSize, height: origH });

    const prevSel = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";

    const onMove = (ev: PointerEvent) => {
      latestH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, origH + (ev.clientY - startY)));
      setResizing({ id: card.id, size: origSize, height: latestH });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = prevSel;
      document.body.style.cursor = "";
      setResizing(null);
      if (latestH !== origH) resizeMutate(card.id, { cardHeight: Math.round(latestH) });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /** Bottom-right corner drag → both width and height */
  const startResizeCorner = (e: React.PointerEvent, card: DashboardCard) => {
    e.preventDefault();
    e.stopPropagation();
    const cardEl = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-card-id]");
    if (!cardEl) return;
    const gridWidth = cardEl.parentElement?.clientWidth ?? cardEl.offsetWidth;
    const colWidth = (gridWidth - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = cardEl.offsetWidth;
    const origH = card.cardHeight ?? 260;
    let latestSize: CardSize = card.size;
    let latestH = origH;
    setResizing({ id: card.id, size: card.size, height: origH });

    const prevSel = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "se-resize";

    const onMove = (ev: PointerEvent) => {
      const rawSpan = (startW + (ev.clientX - startX) + GRID_GAP) / (colWidth + GRID_GAP);
      let best = ALLOWED_SPANS[0];
      for (const opt of ALLOWED_SPANS) if (Math.abs(opt.span - rawSpan) < Math.abs(best.span - rawSpan)) best = opt;
      latestSize = best.size;
      latestH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, origH + (ev.clientY - startY)));
      setResizing({ id: card.id, size: latestSize, height: latestH });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = prevSel;
      document.body.style.cursor = "";
      setResizing(null);
      const patch: { size?: CardSize; cardHeight?: number } = {};
      if (latestSize !== card.size) patch.size = latestSize;
      if (latestH !== origH) patch.cardHeight = Math.round(latestH);
      if (Object.keys(patch).length) resizeMutate(card.id, patch);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const move = (card: DashboardCard, dir: -1 | 1) => {
    if (!cards) return;
    const idx = cards.findIndex((c) => c.id === card.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= cards.length) return;
    const next = [...cards];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    reorder.mutate(next.map((c) => c.id));
  };

  const handleDragEnd = (result: DropResult) => {
    if (!cards) return;
    const { source, destination } = result;
    if (!destination || destination.index === source.index) return;
    const next = [...cards];
    const [moved] = next.splice(source.index, 1);
    next.splice(destination.index, 0, moved);
    reorder.mutate(next.map((c) => c.id));
  };

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex items-center justify-end">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditing(null); setBuilderOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add card
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-2 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-72 md:col-span-2" />)}
        </div>
      ) : !cards || cards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <LayoutGrid className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium">No cards yet</p>
              <p className="text-sm text-muted-foreground">
                {canEdit ? "Add your first card to start building this dashboard." : "This dashboard has no cards."}
              </p>
            </div>
            {canEdit && (
              <Button onClick={() => { setEditing(null); setBuilderOpen(true); }}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add card
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="dashboard-cards" direction="horizontal">
            {(dropProvided) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className="grid gap-2 md:grid-cols-4"
              >
                {cards.map((card, i) => {
                  const live = resizing?.id === card.id ? resizing : null;
                  const displaySize = live?.size ?? card.size;
                  const contentH = live?.height ?? card.cardHeight ?? 260;

                  return (
                    <Draggable key={card.id} draggableId={card.id} index={i}>
                      {(dragProvided, dragSnapshot) => (
                        <Card
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          style={dragProvided.draggableProps.style}
                          data-card-id={card.id}
                          className={`${SIZE_CLASS[displaySize] ?? SIZE_CLASS.md} group/card relative flex flex-col rounded-sm border overflow-visible transition-[box-shadow,border-color] duration-150 ${
                            dragSnapshot.isDragging
                              ? "shadow-xl border-primary/50 z-50"
                              : live
                                ? "border-primary/60 shadow-md"
                                : "hover:border-primary/30 hover:shadow-sm"
                          }`}
                        >
                          {/* Header */}
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-2 px-3 gap-1 border-b shrink-0">
                            <div className="flex items-center gap-1 min-w-0">
                              {canEdit ? (
                                <button
                                  {...dragProvided.dragHandleProps}
                                  className="shrink-0 cursor-grab text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors active:cursor-grabbing"
                                  aria-label="Drag to reorder"
                                >
                                  <GripVertical className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <span {...dragProvided.dragHandleProps} />
                              )}
                              <CardTitle className="text-xs font-semibold truncate text-foreground/80">{card.title}</CardTitle>
                              {card.config.info && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="h-3 w-3 text-muted-foreground/50 shrink-0 cursor-default" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[240px] text-xs">
                                      {String(card.config.info)}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            {canEdit && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" aria-label="Card options" className="h-5 w-5 shrink-0 text-muted-foreground/40 opacity-0 transition-all group-hover/card:opacity-100 hover:text-foreground">
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="text-xs">
                                  <DropdownMenuItem onClick={() => { setEditing(card); setBuilderOpen(true); }}>
                                    <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled={i === 0} onClick={() => move(card, -1)}>
                                    <ArrowLeft className="h-3.5 w-3.5 mr-2" /> Move left
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled={i === cards.length - 1} onClick={() => move(card, 1)}>
                                    <ArrowRight className="h-3.5 w-3.5 mr-2" /> Move right
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(card)}>
                                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </CardHeader>

                          {/* Chart area — fixed height drives the card height */}
                          <CardContent className="p-2 pt-2 overflow-hidden" style={{ height: contentH }}>
                            <CardRenderer card={card} height={contentH} />
                          </CardContent>

                          {canEdit && (
                            <>
                              {/* Right edge → horizontal resize */}
                              <div
                                onPointerDown={(e) => startResizeH(e, card)}
                                title="Drag to resize width"
                                className="group/rh absolute right-0 top-6 bottom-4 w-2 cursor-col-resize touch-none select-none z-10"
                              >
                                <div className="absolute inset-y-0 right-0 w-px bg-transparent group-hover/rh:bg-primary/50 transition-colors" />
                              </div>

                              {/* Bottom edge → vertical resize */}
                              <div
                                onPointerDown={(e) => startResizeV(e, card)}
                                title="Drag to resize height"
                                className="group/rv absolute bottom-0 left-4 right-4 h-2 cursor-row-resize touch-none select-none z-10"
                              >
                                <div className="absolute bottom-0 inset-x-0 h-px bg-transparent group-hover/rv:bg-primary/50 transition-colors" />
                              </div>

                              {/* Corner → both */}
                              <div
                                onPointerDown={(e) => startResizeCorner(e, card)}
                                title="Drag to resize"
                                className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize touch-none select-none z-20 flex items-end justify-end"
                              >
                                <svg width="8" height="8" viewBox="0 0 8 8" className="opacity-0 group-hover/card:opacity-40 transition-opacity">
                                  <path d="M2 8 L8 2 M5 8 L8 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                              </div>
                            </>
                          )}

                          {/* Live resize size badge */}
                          {live && (
                            <div className="absolute top-1 right-7 bg-primary text-primary-foreground text-[9px] font-mono px-1.5 py-0.5 rounded-sm pointer-events-none select-none z-30">
                              {displaySize === "sm" ? "1×" : displaySize === "md" ? "2×" : "4×"} · {contentH}px
                            </div>
                          )}
                        </Card>
                      )}
                    </Draggable>
                  );
                })}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
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
