import { useState, useCallback, useRef } from "react";
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
import {
  MoreVertical, Plus, Pencil, Trash2, ArrowLeft, ArrowRight,
  Info, LayoutGrid, GripVertical, GripHorizontal,
} from "lucide-react";
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
const ALLOWED_SPANS: Array<{ span: number; size: CardSize; label: string }> = [
  { span: 1, size: "sm", label: "1 col" },
  { span: 2, size: "md", label: "2 col" },
  { span: 4, size: "lg", label: "Full" },
];
const GRID_GAP = 8;
const GRID_COLS = 4;
const MIN_H = 80;
const MAX_H = 850;

export function DashboardView({ dashboardId, canEdit = true }: { dashboardId: string; canEdit?: boolean }) {
  const getToken = useSessionToken();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<DashboardCard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DashboardCard | null>(null);
  // Live dimensions while dragging
  const [liveH, setLiveH] = useState<Record<string, number>>({});
  const [liveSize, setLiveSize] = useState<Record<string, CardSize>>({});

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
    mutationFn: (payload: { title: string; vizType: VizType; dataset: Dataset; config: CardConfig; size: string }) =>
      authFetch(`${BASE}/api/dashboards/${dashboardId}/cards`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: cardsKey }); setBuilderOpen(false); toast({ title: "Card added" }); },
    onError: () => toast({ title: "Couldn't add card", variant: "destructive" }),
  });

  const updateCard = useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      authFetch(`${BASE}/api/dashboards/cards/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: cardsKey }); setBuilderOpen(false); setEditing(null); },
    onError: () => toast({ title: "Couldn't save card", variant: "destructive" }),
  });

  const deleteCard = useMutation({
    mutationFn: (id: string) => authFetch(`${BASE}/api/dashboards/cards/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: cardsKey }); setDeleteTarget(null); toast({ title: "Card removed" }); },
    onError: () => toast({ title: "Couldn't remove card", variant: "destructive" }),
  });

  const reorder = useMutation({
    mutationFn: (order: string[]) =>
      authFetch(`${BASE}/api/dashboards/cards/reorder`, { method: "POST", body: JSON.stringify({ order }) }),
    onMutate: async (order) => {
      await qc.cancelQueries({ queryKey: cardsKey });
      const previous = qc.getQueryData<DashboardCard[]>(cardsKey);
      if (previous) {
        const byId = new Map(previous.map((c) => [c.id, c]));
        qc.setQueryData<DashboardCard[]>(cardsKey, order.map((id) => byId.get(id)!).filter(Boolean));
      }
      return { previous };
    },
    onError: (_e, _o, ctx) => { if (ctx?.previous) qc.setQueryData(cardsKey, ctx.previous); },
    onSettled: () => qc.invalidateQueries({ queryKey: cardsKey }),
  });

  /** Save width or height (or both) for a card, with optimistic update */
  const patchCard = useCallback(
    async (id: string, patch: { size?: CardSize; cardHeight?: number }) => {
      await qc.cancelQueries({ queryKey: cardsKey });
      const prev = qc.getQueryData<DashboardCard[]>(cardsKey);
      if (prev) qc.setQueryData<DashboardCard[]>(cardsKey, prev.map((c) => c.id === id ? { ...c, ...patch } : c));
      try {
        await authFetch(`${BASE}/api/dashboards/cards/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
        qc.invalidateQueries({ queryKey: cardsKey });
      } catch {
        if (prev) qc.setQueryData(cardsKey, prev);
        toast({ title: "Couldn't save resize", variant: "destructive" });
      }
    },
    [qc, cardsKey, authFetch, toast],
  );

  /** Vertical drag (bottom bar) — adjusts card height */
  const startResizeH = (e: React.PointerEvent<HTMLDivElement>, card: DashboardCard) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const startY = e.clientY;
    const origH = card.cardHeight ?? 260;
    let latest = origH;

    const onMove = (ev: PointerEvent) => {
      latest = Math.round(Math.max(MIN_H, Math.min(MAX_H, origH + (ev.clientY - startY))));
      setLiveH((prev) => ({ ...prev, [card.id]: latest }));
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.releasePointerCapture(e.pointerId);
      setLiveH((prev) => { const n = { ...prev }; delete n[card.id]; return n; });
      if (latest !== origH) patchCard(card.id, { cardHeight: latest });
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  /** Horizontal drag (right-edge handle) — adjusts column span */
  const startResizeW = (e: React.PointerEvent<HTMLDivElement>, card: DashboardCard) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const cardEl = el.closest<HTMLElement>("[data-card-id]");
    const gridW = cardEl?.parentElement?.clientWidth ?? 800;
    const colW = (gridW - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
    const startX = e.clientX;
    const startW = cardEl?.offsetWidth ?? colW * 2;
    let latestSize: CardSize = card.size;

    const snap = (x: number) => {
      const raw = (startW + (x - startX) + GRID_GAP) / (colW + GRID_GAP);
      return ALLOWED_SPANS.reduce((best, opt) =>
        Math.abs(opt.span - raw) < Math.abs(best.span - raw) ? opt : best
      ).size;
    };

    const onMove = (ev: PointerEvent) => {
      latestSize = snap(ev.clientX);
      setLiveSize((prev) => ({ ...prev, [card.id]: latestSize }));
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.releasePointerCapture(e.pointerId);
      setLiveSize((prev) => { const n = { ...prev }; delete n[card.id]; return n; });
      if (latestSize !== card.size) patchCard(card.id, { size: latestSize });
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
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
              <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="grid gap-2 md:grid-cols-4">
                {cards.map((card, i) => {
                  const displaySize = liveSize[card.id] ?? card.size;
                  const contentH = liveH[card.id] ?? card.cardHeight ?? 260;
                  const isResizingH = card.id in liveH;
                  const isResizingW = card.id in liveSize;
                  const isResizing = isResizingH || isResizingW;

                  return (
                    <Draggable key={card.id} draggableId={card.id} index={i}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          style={dragProvided.draggableProps.style}
                          data-card-id={card.id}
                          className={`${SIZE_CLASS[displaySize] ?? SIZE_CLASS.md} flex flex-col`}
                        >
                          {/* ── Card ──────────────────────────────── */}
                          <div className={`relative flex flex-col border rounded-sm bg-card text-card-foreground shadow-sm transition-[border-color,box-shadow] ${
                            dragSnapshot.isDragging
                              ? "shadow-xl border-primary/50"
                              : isResizing
                                ? "border-primary/60 ring-1 ring-primary/20"
                                : "border-border hover:border-primary/30 hover:shadow"
                          }`}>

                            {/* Header */}
                            <div className="flex flex-row items-center justify-between py-2 px-3 gap-1 border-b shrink-0">
                              <div className="flex items-center gap-1 min-w-0">
                                {canEdit ? (
                                  <button
                                    {...dragProvided.dragHandleProps}
                                    className="shrink-0 cursor-grab text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors active:cursor-grabbing"
                                    aria-label="Drag to reorder"
                                  >
                                    <GripVertical className="h-3.5 w-3.5" />
                                  </button>
                                ) : (
                                  <span {...dragProvided.dragHandleProps} />
                                )}
                                <span className="text-xs font-semibold truncate text-foreground/80">{card.title}</span>
                                {card.config.info && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="h-3 w-3 text-muted-foreground/40 shrink-0 cursor-default" />
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">{String(card.config.info)}</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                              {canEdit && (
                                <div className="flex items-center gap-0.5 shrink-0">
                                  {/* Width buttons — always visible in edit mode */}
                                  <div className="flex items-center gap-px">
                                    {ALLOWED_SPANS.map(({ size: sz, label }) => (
                                      <button
                                        key={sz}
                                        onClick={() => { if (sz !== card.size) patchCard(card.id, { size: sz }); }}
                                        className={`px-1.5 py-0.5 text-[9px] font-medium rounded leading-none transition-colors ${
                                          displaySize === sz
                                            ? "bg-primary text-primary-foreground"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                        }`}
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                  {/* 3-dot menu */}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground/40 hover:text-foreground">
                                        <MoreVertical className="h-3.5 w-3.5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="text-xs">
                                      <DropdownMenuItem onClick={() => { setEditing(card); setBuilderOpen(true); }}>
                                        <Pencil className="h-3.5 w-3.5 mr-2" /> Edit card
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
                                </div>
                              )}
                            </div>

                            {/* Chart area */}
                            <div className="overflow-hidden" style={{ height: contentH }}>
                              <div className="p-2 h-full">
                                <CardRenderer card={card} height={contentH - 16} />
                              </div>
                            </div>

                            {/* ── Right-edge drag handle (horizontal resize) ── */}
                            {canEdit && (
                              <div
                                onPointerDown={(e) => startResizeW(e, card)}
                                className="absolute right-0 top-8 bottom-5 w-3 cursor-col-resize z-20 flex items-center justify-center group/rh"
                                title="Drag to resize width"
                              >
                                <div className="w-0.5 h-full rounded-full bg-muted-foreground/10 group-hover/rh:bg-primary/60 transition-colors" />
                              </div>
                            )}

                            {/* ── Bottom resize bar (height) ── */}
                            {canEdit && (
                              <div
                                onPointerDown={(e) => startResizeH(e, card)}
                                className="flex items-center justify-center h-5 shrink-0 border-t border-dashed border-muted-foreground/20 cursor-row-resize select-none hover:bg-primary/5 hover:border-primary/40 transition-colors group/rb"
                                title="Drag to resize height"
                              >
                                <GripHorizontal className="h-3 w-3 text-muted-foreground/30 group-hover/rb:text-primary/60 transition-colors" />
                                {isResizingH && (
                                  <span className="ml-1.5 text-[9px] font-mono text-primary">
                                    {contentH}px
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
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
            <AlertDialogDescription>"{deleteTarget?.title}" will be removed. This can't be undone.</AlertDialogDescription>
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
