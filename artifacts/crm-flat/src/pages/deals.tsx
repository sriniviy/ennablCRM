import { useSessionToken } from "@/hooks/use-session-token";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useRef, useState, useEffect } from "react";

import { useListDeals, useMoveDeal, useListDealStages, getListDealsQueryKey, type PipelineColumn, type DealWithRelations } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Download, ChevronDown, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DealDialog } from "@/components/deals/deal-dialog";
import { ExportColumnsDialog, type ColumnDef } from "@/components/export-columns-dialog";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useTeamMembers } from "@/hooks/use-team-members";
import { RecordCardGrid, type CardField } from "@/components/record-card-grid";

const DEAL_COLUMNS: ColumnDef[] = [
  { key: "title", label: "Title" },
  { key: "stage", label: "Stage" },
  { key: "value", label: "Value" },
  { key: "currency", label: "Currency" },
  { key: "probability", label: "Probability (%)" },
  { key: "closeDate", label: "Close Date" },
  { key: "contact", label: "Contact" },
  { key: "company", label: "Company" },
  { key: "notes", label: "Notes" },
  { key: "createdAt", label: "Created At" },
];

const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

const CARD_FIELDS: CardField<DealWithRelations>[] = [
  { label: "Stage", render: d => dash(d.stage?.name) },
  { label: "Value", render: d => formatCurrency(d.value || 0) },
  { label: "Currency", render: d => dash(d.currency) },
  { label: "Probability", render: d => `${d.probability ?? 0}%` },
  { label: "Close date", render: d => (d.closeDate ? new Date(d.closeDate).toLocaleDateString() : "—") },
  { label: "Contact", render: d => (d.contact ? `${d.contact.firstName ?? ""} ${d.contact.lastName ?? ""}`.trim() || "—" : "—") },
  { label: "Company", render: d => dash(d.company?.name) },
  { label: "Owner", render: d => dash(d.assignee?.name) },
  { label: "Notes", render: d => dash(d.notes) },
  { label: "Created", render: d => (d.createdAt ? new Date(d.createdAt).toLocaleString() : "—") },
];

function probBadgeStyle(p: number | null | undefined) {
  const pct = p ?? 0;
  if (pct >= 80) return "bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
  if (pct >= 50) return "bg-yellow-100 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800";
  return "bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
}

export function DealsPage() {
  const getToken = useSessionToken();
  const { toast } = useToast();
  const { get, set } = useUrlFilters();
  const { data: members } = useTeamMembers();
  const { data: stages } = useListDealStages();

  const [stageFilter, setStageFilter] = useState(() => get("stageId") || "ALL");
  const [ownerFilter, setOwnerFilter] = useState(() => get("assigneeId") || "ALL");
  const [view, setView] = useState<"pipeline" | "cards">(() => (get("view") === "cards" ? "cards" : "pipeline"));

  const { data: columns, isLoading: dealsLoading } = useListDeals({
    stageId: stageFilter !== "ALL" ? stageFilter : undefined,
    assigneeId: ownerFilter !== "ALL" ? ownerFilter : undefined,
  });
  const moveDeal = useMoveDeal();
  const queryClient = useQueryClient();

  const { data: triggerEnrolledData } = useQuery<{ contactIds: string[] }>({
    queryKey: ["trigger-enrolled-contacts"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/sequences/trigger-enrolled-contacts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    staleTime: 60_000,
  });
  const triggerEnrolledSet = new Set(triggerEnrolledData?.contactIds ?? []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDeal, setEditDeal] = useState<DealWithRelations | undefined>();
  const [defaultStageId, setDefaultStageId] = useState<string | undefined>();
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    set({
      stageId: stageFilter,
      assigneeId: ownerFilter,
      view: view === "cards" ? "cards" : undefined,
    });
  }, [stageFilter, ownerFilter, view, set]);

  const handleExport = async (fields: string[]) => {
    setExporting(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      params.set("fields", fields.join(","));
      const res = await fetch(`/api/deals/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "deals.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const moveDealMutate = useRef(moveDeal.mutate);
  moveDealMutate.current = moveDeal.mutate;

  const queryKey = getListDealsQueryKey({
    stageId: stageFilter !== "ALL" ? stageFilter : undefined,
    assigneeId: ownerFilter !== "ALL" ? ownerFilter : undefined,
  });

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const destStageId = destination.droppableId;
    const destIndex = destination.index;

    queryClient.setQueryData(queryKey, (old: PipelineColumn[] | undefined) => {
      if (!old) return old;
      const deal = old.flatMap(c => c.deals).find(d => d.id === draggableId);
      if (!deal) return old;
      const updatedDeal = { ...deal, stageId: destStageId };
      return old.map(col => {
        const withoutDeal = col.deals.filter(d => d.id !== draggableId);
        if (col.stage.id === destStageId) {
          const inserted = [...withoutDeal];
          inserted.splice(destIndex, 0, updatedDeal);
          return { ...col, deals: inserted };
        }
        return { ...col, deals: withoutDeal };
      });
    });

    moveDealMutate.current({ id: draggableId, data: { stageId: destStageId, order: destIndex } });
    queryClient.invalidateQueries({ queryKey: ["ai-suggestions", "deal", draggableId] });
  };

  const openNew = (stageId?: string) => {
    setEditDeal(undefined);
    setDefaultStageId(stageId);
    setDialogOpen(true);
  };

  const openEdit = (deal: DealWithRelations) => {
    setEditDeal(deal);
    setDefaultStageId(undefined);
    setDialogOpen(true);
  };

  useEffect(() => {
    if (!columns) return;
    const params = new URLSearchParams(window.location.search);
    const openId = params.get("open");
    if (!openId) return;
    const deal = columns.flatMap((c) => c.deals).find((d) => d.id === openId);
    if (deal) openEdit(deal as DealWithRelations);
    params.delete("open");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [columns]);

  const allDeals = (columns ?? []).flatMap(c => c.deals) as DealWithRelations[];
  const totalDeals = allDeals.length;
  const totalValue = allDeals.reduce((sum, d) => sum + (d.value || 0), 0);

  const weightedValue = allDeals.reduce((sum, d) => sum + (d.value || 0) * ((d.probability ?? 0) / 100), 0);

  const openDeals = (columns ?? []).filter(c => !/^won$|^lost$/i.test(c.stage.name)).flatMap(c => c.deals);
  const closedDeals = (columns ?? []).filter(c => /^won$/i.test(c.stage.name)).flatMap(c => c.deals);
  const newDeals = (columns ?? []).filter(c => /^discovery$/i.test(c.stage.name)).flatMap(c => c.deals);

  const openValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const closedValue = closedDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const newValue = newDeals.reduce((sum, d) => sum + (d.value || 0), 0);

  const now = Date.now();
  const avgAgeMonths = totalDeals > 0
    ? allDeals.reduce((sum, d) => {
        const created = d.createdAt ? new Date(d.createdAt).getTime() : now;
        return sum + (now - created) / (1000 * 60 * 60 * 24 * 30.44);
      }, 0) / totalDeals
    : 0;

  return (
    <SidebarLayout>
      <div className="flex flex-col gap-4 h-full min-h-0">

        {/* Header row */}
        <div className="flex items-start justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-base font-bold tracking-tight">Deals Pipeline</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage and track your active opportunities.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setExportOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border bg-background text-foreground hover:bg-muted transition-colors"
            >
              <Download className="h-3 w-3" />
              Export CSV
            </button>
            <button
              data-testid="btn-new-deal"
              onClick={() => openNew()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-semibold"
            >
              <Plus className="h-3 w-3" />
              Add Deal
            </button>
          </div>
        </div>

        {/* Stats bar */}
        {!dealsLoading && columns && (
          <div className="grid grid-cols-6 border border-border shrink-0">
            {[
              { label: "Total Deal Amount", value: totalValue, count: totalDeals },
              { label: "Weighted Deal Amount", value: weightedValue, count: totalDeals },
              { label: "Open Deal Amount", value: openValue, count: openDeals.length },
              { label: "Closed Deal Amount", value: closedValue, count: closedDeals.length },
              { label: "Discovery Amount", value: newValue, count: newDeals.length },
            ].map((stat, i) => (
              <div key={stat.label} className={`px-3 py-2 ${i < 5 ? "border-r border-border" : ""}`}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                  {stat.label}
                </div>
                <div className="text-2xl font-bold text-primary leading-tight">
                  {formatCurrencyCompact(stat.value)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Average per deal{" "}
                  <span className="font-medium">
                    {stat.count > 0 ? formatCurrencyCompact(stat.value / stat.count) : "—"}
                  </span>
                </div>
              </div>
            ))}
            {/* Average Deal Age */}
            <div className="px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                Average Deal Age
              </div>
              <div className="text-2xl font-bold text-foreground leading-tight">
                {avgAgeMonths.toFixed(1)} <span className="text-sm font-semibold">months</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Across {totalDeals} deal{totalDeals !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex items-center gap-2 shrink-0">
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-7 text-xs rounded-none border-border w-36 gap-1" data-testid="select-deal-stage">
              <SelectValue placeholder="All stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All stages</SelectItem>
              {(stages ?? []).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-7 text-xs rounded-none border-border w-36 gap-1" data-testid="select-deal-owner">
              <SelectValue placeholder="All owners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All owners</SelectItem>
              {(members ?? []).map(m => <SelectItem key={m.id} value={m.id}>{m.name ?? "Unknown"}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Pipeline / Cards toggle */}
          <div className="ml-auto flex border border-border">
            <button
              onClick={() => setView("pipeline")}
              className={`px-3 py-1 text-xs font-medium transition-colors ${view === "pipeline" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              Pipeline
            </button>
            <button
              onClick={() => setView("cards")}
              className={`px-3 py-1 text-xs font-medium transition-colors border-l border-border ${view === "cards" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              Cards
            </button>
          </div>
        </div>

        {/* Board / Cards */}
        {view === "cards" ? (
          dealsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <RecordCardGrid
                items={allDeals}
                getKey={d => d.id}
                getTitle={d => d.title}
                fields={CARD_FIELDS}
                onItemClick={openEdit}
                emptyMessage="No deals found."
              />
            </div>
          )
        ) : dealsLoading ? (
          <div
            className="grid gap-3 pb-4"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
          >
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 pb-4 overflow-x-auto">
            <DragDropContext onDragEnd={handleDragEnd}>
              <div
                className="grid gap-2 items-start min-h-[400px]"
                style={{ gridTemplateColumns: `repeat(${(columns ?? []).length || 1}, minmax(160px, 1fr))` }}
              >
                {(columns ?? []).map(column => (
                  <div key={column.stage.id} className="min-w-0 flex flex-col">
                    {/* Column header — flat box with colored bottom border */}
                    <div
                      className="flex items-center justify-between px-2.5 py-2 mb-2 border border-border bg-card"
                      style={{ borderBottomWidth: 2, borderBottomColor: column.stage.color || "var(--color-primary)" }}
                    >
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0 inline-block"
                            style={{ backgroundColor: column.stage.color || "var(--color-primary)" }}
                          />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">
                            {column.stage.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground">({column.deals.length})</span>
                        </div>
                        <div
                          className="text-xs font-bold pl-3.5"
                          style={{ color: column.stage.color || "var(--color-primary)" }}
                        >
                          {formatCurrency(column.totalValue ?? 0)}
                        </div>
                      </div>
                      <button
                        className="w-5 h-5 flex items-center justify-center border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        onClick={() => openNew(column.stage.id)}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <Droppable droppableId={column.stage.id}>
                      {(provided, snapshot) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className={`flex flex-col gap-1.5 min-h-[120px] transition-colors ${snapshot.isDraggingOver ? "bg-muted/60" : ""}`}
                        >
                          {column.deals.map((deal, index) => (
                            <Draggable key={deal.id} draggableId={deal.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  style={{ ...provided.draggableProps.style }}
                                  onClick={() => openEdit(deal)}
                                  className={`border border-border bg-card p-2 cursor-pointer transition-colors group ${
                                    snapshot.isDragging ? "shadow-md border-primary/40" : "hover:border-primary/50"
                                  }`}
                                >
                                  {/* Title */}
                                  <div className="text-xs font-semibold leading-snug mb-1.5 text-foreground line-clamp-2">
                                    {deal.title}
                                  </div>
                                  {/* Auto-enroll trigger indicator */}
                                  {deal.contactId && triggerEnrolledSet.has(deal.contactId) && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 mb-1 cursor-default">
                                            <Zap className="h-3 w-3" />
                                            Auto-enrolled
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          Contact auto-enrolled in a sequence via trigger
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                  {/* Value */}
                                  <div
                                    className="text-sm font-bold mb-2"
                                    style={{ color: column.stage.color || "var(--color-primary)" }}
                                  >
                                    {formatCurrency(deal.value || 0)}
                                  </div>
                                  {/* Company + probability */}
                                  <div className="flex items-center justify-between gap-1 mb-1">
                                    <span className="text-[10px] text-muted-foreground truncate">
                                      {deal.company?.name || deal.contact?.firstName || "No account"}
                                    </span>
                                    <span className={`text-[10px] font-semibold px-1 py-0.5 shrink-0 ${probBadgeStyle(deal.probability)}`}>
                                      {deal.probability ?? 0}%
                                    </span>
                                  </div>
                                  {/* Owner */}
                                  {deal.assignee?.name && (
                                    <div className="border-t border-border/60 pt-1 mt-1">
                                      <span className="text-[10px] text-muted-foreground/80">{deal.assignee.name}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}

                          {/* Empty state */}
                          {column.deals.length === 0 && (
                            <div className="border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground/60">
                              No deals
                            </div>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </div>
                ))}
              </div>
            </DragDropContext>
          </div>
        )}
      </div>

      <DealDialog open={dialogOpen} onOpenChange={setDialogOpen} deal={editDeal} defaultStageId={defaultStageId} />
      <ExportColumnsDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        columns={DEAL_COLUMNS}
        storageKey="crm:export-columns:deals"
        onExport={handleExport}
        exporting={exporting}
      />
    </SidebarLayout>
  );
}
