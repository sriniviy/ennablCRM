import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionToken } from "@/hooks/use-session-token";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { MoreVertical, Plus, Pencil, Trash2, Info, LayoutGrid, GripHorizontal, GripVertical } from "lucide-react";
import { CardRenderer } from "./card-renderer";
import { CardBuilderDialog } from "./card-builder-dialog";
import { BASE, type DashboardCard, type VizType, type Dataset, type CardConfig } from "./types";

type CardSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<string, string> = {
  sm: "md:col-span-1",
  md: "md:col-span-2",
  lg: "md:col-span-4",
};

const MIN_H = 80;
const MAX_H = 850;

export function DashboardView({ dashboardId, canEdit = true }: { dashboardId: string; canEdit?: boolean }) {
  const getToken = useSessionToken();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<DashboardCard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DashboardCard | null>(null);
  const [liveH, setLiveH] = useState<Record<string, number>>({});
  const [liveSize, setLiveSize] = useState<Record<string, CardSize>>({});
  const gridRef = useRef<HTMLDivElement | null>(null);

  // ── Drag-to-reorder state ────────────────────────────────────────────────
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  // Refs keep values stable inside pointer-event closures (no stale capture)
  const cardsRef = useRef<DashboardCard[]>([]);
  const overIdxRef = useRef<number | null>(null);

  // ── Auth fetch ───────────────────────────────────────────────────────────

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

  // ── Data ─────────────────────────────────────────────────────────────────

  const cardsKey = ["dashboard-cards", dashboardId];
  const { data: cards, isLoading } = useQuery<DashboardCard[]>({
    queryKey: cardsKey,
    queryFn: () => authFetch(`${BASE}/api/dashboards/${dashboardId}/cards`),
  });

  // Keep ref in sync so pointer-event closures always see latest cards
  useEffect(() => { if (cards) cardsRef.current = cards; }, [cards]);

  const createCard = useMutation({
    mutationFn: (p: { title: string; vizType: VizType; dataset: Dataset; config: CardConfig; size: string }) =>
      authFetch(`${BASE}/api/dashboards/${dashboardId}/cards`, { method: "POST", body: JSON.stringify(p) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: cardsKey }); setBuilderOpen(false); toast({ title: "Card added" }); },
    onError: () => toast({ title: "Couldn't add card", variant: "destructive" }),
  });

  const updateCard = useMutation({
    mutationFn: ({ id, ...p }: { id: string } & Record<string, unknown>) =>
      authFetch(`${BASE}/api/dashboards/cards/${id}`, { method: "PATCH", body: JSON.stringify(p) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: cardsKey }); setBuilderOpen(false); setEditing(null); },
    onError: () => toast({ title: "Couldn't save card", variant: "destructive" }),
  });

  const deleteCard = useMutation({
    mutationFn: (id: string) => authFetch(`${BASE}/api/dashboards/cards/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: cardsKey }); setDeleteTarget(null); toast({ title: "Card removed" }); },
    onError: () => toast({ title: "Couldn't remove card", variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: (order: string[]) =>
      authFetch(`${BASE}/api/dashboards/cards/reorder`, { method: "POST", body: JSON.stringify({ order }) }),
    onMutate: async (order) => {
      await qc.cancelQueries({ queryKey: cardsKey });
      const prev = qc.getQueryData<DashboardCard[]>(cardsKey);
      if (prev) {
        const byId = new Map(prev.map((c) => [c.id, c]));
        qc.setQueryData<DashboardCard[]>(cardsKey, order.map((id) => byId.get(id)!).filter(Boolean));
      }
      return { previous: prev };
    },
    onError: (_e, _o, ctx) => { if (ctx?.previous) qc.setQueryData(cardsKey, ctx.previous); },
    onSettled: () => qc.invalidateQueries({ queryKey: cardsKey }),
  });

  const patchCard = useCallback(
    async (id: string, patch: { cardHeight?: number; size?: CardSize }) => {
      await qc.cancelQueries({ queryKey: cardsKey });
      const prev = qc.getQueryData<DashboardCard[]>(cardsKey);
      if (prev) qc.setQueryData<DashboardCard[]>(cardsKey, prev.map((c) => c.id === id ? { ...c, ...patch } : c));
      try {
        await authFetch(`${BASE}/api/dashboards/cards/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
        qc.invalidateQueries({ queryKey: cardsKey });
      } catch {
        if (prev) qc.setQueryData(cardsKey, prev);
        toast({ title: "Couldn't save", variant: "destructive" });
      }
    },
    [qc, cardsKey, authFetch, toast],
  );

  const reorderCards = useCallback((srcIdx: number, tgtIdx: number) => {
    const current = cardsRef.current;
    if (!current.length || srcIdx === tgtIdx) return;
    const next = [...current];
    const [moved] = next.splice(srcIdx, 1);
    next.splice(tgtIdx, 0, moved);
    reorderMutation.mutate(next.map((c) => c.id));
  }, [reorderMutation]);

  // ── Card drag (pointer-capture approach — same as height resize) ──────────

  const startCardDrag = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    card: DashboardCard,
    srcIdx: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    // Show grabbing cursor globally during drag
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    setDraggingId(card.id);

    const onMove = (ev: PointerEvent) => {
      // Find which card the pointer is currently over
      const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
      let found: number | null = null;
      for (const el of elements) {
        const dataId = (el as HTMLElement).getAttribute?.("data-card-id");
        if (dataId && dataId !== card.id) {
          const idx = cardsRef.current.findIndex((c) => c.id === dataId);
          if (idx !== -1) { found = idx; break; }
        }
      }
      if (found !== overIdxRef.current) {
        overIdxRef.current = found;
        setOverIdx(found);
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      const tgt = overIdxRef.current;
      overIdxRef.current = null;
      setDraggingId(null);
      setOverIdx(null);

      if (tgt !== null && tgt !== srcIdx) {
        reorderCards(srcIdx, tgt);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [reorderCards]);

  // ── Height resize ─────────────────────────────────────────────────────────

  const startResizeH = (e: React.PointerEvent<HTMLDivElement>, card: DashboardCard) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const origH = card.cardHeight ?? 260;
    const startY = e.clientY;
    let latest = origH;

    const onMove = (ev: PointerEvent) => {
      latest = Math.round(Math.max(MIN_H, Math.min(MAX_H, origH + (ev.clientY - startY))));
      setLiveH((p) => ({ ...p, [card.id]: latest }));
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.releasePointerCapture(e.pointerId);
      setLiveH((p) => { const n = { ...p }; delete n[card.id]; return n; });
      if (latest !== origH) patchCard(card.id, { cardHeight: latest });
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  // ── Width resize (snaps to 1 / 2 / 4 col grid) ───────────────────────────

  const startResizeW = (e: React.PointerEvent<HTMLDivElement>, card: DashboardCard) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const gridEl = gridRef.current;
    const outerEl = el.closest("[data-card-id]") as HTMLElement | null;
    if (!gridEl || !outerEl) return;

    // Gap between columns is gap-2 = 8px
    const gap = 8;
    const gridW = gridEl.getBoundingClientRect().width;
    const colW = (gridW - 3 * gap) / 4;

    const startX = e.clientX;
    const startCardW = outerEl.getBoundingClientRect().width;

    function nearestSize(cols: number): CardSize {
      if (cols < 1.5) return "sm";
      if (cols < 3) return "md";
      return "lg";
    }

    let latestSize: CardSize = card.size;

    const onMove = (ev: PointerEvent) => {
      const newW = startCardW + (ev.clientX - startX);
      const cols = newW / colW;
      const s = nearestSize(cols);
      if (s !== latestSize) {
        latestSize = s;
        setLiveSize((p) => ({ ...p, [card.id]: s }));
      }
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.releasePointerCapture(e.pointerId);
      setLiveSize((p) => { const n = { ...p }; delete n[card.id]; return n; });
      if (latestSize !== card.size) patchCard(card.id, { size: latestSize });
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex items-center justify-end">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => { setEditing(null); setBuilderOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add card
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-2 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-72 md:col-span-2" />)}
        </div>
      ) : !cards || cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 border border-dashed rounded-lg text-center">
          <LayoutGrid className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-medium">No cards yet</p>
            <p className="text-sm text-muted-foreground">
              {canEdit ? "Add your first card to start building this dashboard." : "This dashboard has no cards."}
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => { setEditing(null); setBuilderOpen(true); }}>
              <Plus className="h-4 w-4 mr-1.5" /> Add card
            </Button>
          )}
        </div>
      ) : (
        <div ref={gridRef} className="grid gap-2 md:grid-cols-4">
          {cards.map((card, i) => {
            const contentH = liveH[card.id] ?? card.cardHeight ?? 260;
            const effectiveSize = liveSize[card.id] ?? card.size;
            const isResizingH = card.id in liveH;
            const isResizingW = card.id in liveSize;
            const isDragging = draggingId === card.id;
            const isDropTarget = overIdx === i && !isDragging;

            return (
              <div
                key={card.id}
                data-card-id={card.id}
                className={`${SIZE_CLASS[effectiveSize] ?? SIZE_CLASS.md} min-w-0 transition-all duration-100 ${
                  isDragging ? "opacity-20" : "opacity-100"
                }`}
              >
                <div className={`relative flex flex-col border rounded-md bg-card text-card-foreground shadow-sm transition-all duration-100 ${
                  isDropTarget
                    ? "ring-2 ring-primary ring-offset-2 border-primary/60 shadow-lg shadow-primary/15 scale-[1.015]"
                    : isResizingH || isResizingW
                    ? "border-primary/40 ring-1 ring-primary/20"
                    : "border-border hover:shadow-sm"
                }`}>

                  {/* ── Header ────────────────────────────────────────────── */}
                  <div className="flex items-center gap-2 py-2.5 px-3 border-b shrink-0 min-w-0">

                    {/* Drag grip — pointer-down starts drag */}
                    {canEdit && (
                      <div
                        className="shrink-0 cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors select-none touch-none"
                        title="Drag to reorder"
                        onPointerDown={(e) => startCardDrag(e, card, i)}
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>
                    )}

                    {/* Bold title */}
                    <span className="text-sm font-bold truncate text-foreground flex-1 min-w-0 leading-tight">
                      {card.title}
                    </span>

                    {/* Info */}
                    {card.config.info && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 cursor-default" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">{String(card.config.info)}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    {/* 3-dot menu */}
                    {canEdit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="shrink-0 h-6 w-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs min-w-[160px]">
                          <DropdownMenuItem onClick={() => { setEditing(card); setBuilderOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Edit card
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem disabled={i === 0} onClick={() => reorderCards(i, i - 1)}>
                            Move left
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={i === cards.length - 1} onClick={() => reorderCards(i, i + 1)}>
                            Move right
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={i === 0} onClick={() => reorderCards(i, 0)}>
                            Move to first
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={i === cards.length - 1} onClick={() => reorderCards(i, cards.length - 1)}>
                            Move to last
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(card)}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove card
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {/* ── Chart content ────────────────────────────────────── */}
                  <div className="overflow-hidden" style={{ height: contentH }}>
                    <div className="p-2 h-full">
                      <CardRenderer card={card} height={contentH - 16} />
                    </div>
                  </div>

                  {/* ── Right edge: width resize handle ───────────────────── */}
                  {canEdit && (
                    <div
                      onPointerDown={(e) => startResizeW(e, card)}
                      title="Drag to resize width"
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize select-none touch-none z-10 group/rw flex items-center justify-center"
                    >
                      <div className="w-0.5 h-8 rounded-full bg-muted-foreground/0 group-hover/rw:bg-primary/50 transition-colors" />
                      {isResizingW && (
                        <span className="absolute -top-5 right-1 text-[9px] font-mono bg-primary text-primary-foreground px-1 py-0.5 rounded whitespace-nowrap">
                          {effectiveSize === "sm" ? "1 col" : effectiveSize === "md" ? "2 col" : "Full"}
                        </span>
                      )}
                    </div>
                  )}

                  {/* ── Bottom: height resize bar ─────────────────────────── */}
                  {canEdit && (
                    <div
                      onPointerDown={(e) => startResizeH(e, card)}
                      title="Drag to resize height"
                      className="flex items-center justify-center h-4 shrink-0 border-t border-dashed border-muted-foreground/15 cursor-row-resize select-none hover:bg-primary/5 hover:border-primary/40 transition-colors group/rb"
                    >
                      <GripHorizontal className="h-3 w-3 text-muted-foreground/20 group-hover/rb:text-primary/50 transition-colors" />
                      {isResizingH && <span className="ml-1.5 text-[9px] font-mono text-primary">{contentH}px</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
