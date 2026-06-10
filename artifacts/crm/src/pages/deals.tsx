import { useSessionToken } from "@/hooks/use-session-token";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useRef, useState, useEffect } from "react";

import { useListDeals, useMoveDeal, useListDealStages, getListDealsQueryKey, type PipelineColumn, type DealWithRelations } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { formatCurrency } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { DealDialog } from "@/components/deals/deal-dialog";
import { ExportColumnsDialog, type ColumnDef } from "@/components/export-columns-dialog";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useTeamMembers } from "@/hooks/use-team-members";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { RecordCardGrid, type CardField } from "@/components/record-card-grid";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  { label: "Order", render: d => dash(d.order) },
  { label: "Stage ID", render: d => dash(d.stageId) },
  { label: "Contact ID", render: d => dash(d.contactId) },
  { label: "Company ID", render: d => dash(d.companyId) },
  { label: "Owner ID", render: d => dash(d.assigneeId) },
  { label: "Created", render: d => (d.createdAt ? new Date(d.createdAt).toLocaleString() : "—") },
  { label: "Updated", render: d => (d.updatedAt ? new Date(d.updatedAt).toLocaleString() : "—") },
  { label: "ID", render: d => dash(d.id) },
];

export function DealsPage() {
  const getToken = useSessionToken();
  const { toast } = useToast();
  const { get, set } = useUrlFilters();
  const { data: members } = useTeamMembers();
  const { data: stages } = useListDealStages();

  const [stageFilter, setStageFilter] = useState(() => get("stageId") || "ALL");
  const [ownerFilter, setOwnerFilter] = useState(() => get("assigneeId") || "ALL");
  const [view, setView] = useState<ViewMode>(() => (get("view") === "cards" ? "cards" : "table"));

  const { data: columns, isLoading: dealsLoading } = useListDeals({
    stageId: stageFilter !== "ALL" ? stageFilter : undefined,
    assigneeId: ownerFilter !== "ALL" ? ownerFilter : undefined,
  });
  const moveDeal = useMoveDeal();
  const queryClient = useQueryClient();

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
      const res = await fetch(`${BASE}/api/deals/export?${params}`, {
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

  return (
    <SidebarLayout>
      <div className="space-y-6 h-full flex flex-col min-h-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Deals Pipeline</h1>
            <p className="text-muted-foreground">Manage and track your active opportunities.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button data-testid="btn-new-deal" onClick={() => openNew()}>
              <Plus className="mr-2 h-4 w-4" /> Add Deal
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-44" data-testid="select-deal-stage"><SelectValue placeholder="Stage" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All stages</SelectItem>
              {(stages ?? []).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-44" data-testid="select-deal-owner"><SelectValue placeholder="Owner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All owners</SelectItem>
              {(members ?? []).map(m => <SelectItem key={m.id} value={m.id}>{m.name ?? "Unknown"}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto">
            <ViewToggle value={view} onChange={setView} tableLabel="Pipeline view" />
          </div>
        </div>

        {view === "cards" ? (
          dealsLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-64 w-full" />)}
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
          <div className="flex gap-6 overflow-x-auto pb-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="w-80 shrink-0 space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 overflow-x-auto pb-4">
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="flex gap-6 h-full min-h-[500px] items-start">
                {(columns ?? []).map(column => (
                  <div key={column.stage.id} className="w-80 shrink-0 flex flex-col h-full max-h-full">
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full inline-block"
                            style={{ backgroundColor: column.stage.color || "var(--primary)" }}
                          />
                          {column.stage.name}
                          <span className="text-muted-foreground font-normal ml-1">({column.deals.length})</span>
                        </h3>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => openNew(column.stage.id)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {formatCurrency(column.totalValue)}
                      </p>
                    </div>

                    <Droppable droppableId={column.stage.id}>
                      {(provided, snapshot) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className={`flex-1 rounded-xl p-2 min-h-[150px] transition-colors ${snapshot.isDraggingOver ? "bg-muted" : "bg-muted/30"}`}
                        >
                          <div className="space-y-3">
                            {column.deals.map((deal, index) => (
                              <Draggable key={deal.id} draggableId={deal.id} index={index}>
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    style={{ ...provided.draggableProps.style }}
                                    onClick={() => openEdit(deal)}
                                  >
                                    <Card className={`shadow-sm border border-border/50 cursor-pointer hover:shadow-md transition-shadow ${snapshot.isDragging ? "shadow-lg ring-1 ring-primary/20" : ""}`}>
                                      <CardContent className="p-4">
                                        <div className="font-medium mb-1 line-clamp-2">{deal.title}</div>
                                        <div className="text-lg font-bold text-primary mb-2">
                                          {formatCurrency(deal.value || 0)}
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                          <span>{deal.company?.name || deal.contact?.firstName || "No account"}</span>
                                          <span className="bg-muted px-2 py-0.5 rounded">{deal.probability}%</span>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
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
