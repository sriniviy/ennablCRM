import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CardRenderer } from "./card-renderer";
import {
  type DashboardCard,
  type VizType,
  type Dataset,
  type CardConfig,
  VIZ_LABELS,
  DATASET_LABELS,
  PERIOD_LABELS,
  METRIC_LABELS,
  DIMENSION_LABELS,
} from "./types";

const VIZ_BY_DATASET: Record<Dataset, VizType[]> = {
  deals: ["kpi", "gauge", "bar", "horizontalBar", "groupedBar", "stackedBar", "line", "table"],
  activities: ["kpi", "bar", "horizontalBar", "groupedBar", "stackedBar", "line"],
  dealMoves: ["bar", "horizontalBar", "stackedBar", "line"],
};

const METRICS_BY_DATASET: Record<Dataset, string[]> = {
  deals: ["count", "sumValue", "avgValue", "weightedForecast", "avgTimeInStage"],
  activities: ["count"],
  dealMoves: ["count", "sumValue"],
};

// Measures the multi-measure (comparison) flow can plot together. Only the
// deals dataset supports it server-side, and only these aggregates are
// computed in the multi branch of the query engine.
const MULTI_METRICS_BY_DATASET: Partial<Record<Dataset, string[]>> = {
  deals: ["count", "sumValue", "avgValue"],
};

const DIMS_BY_DATASET: Record<Dataset, string[]> = {
  deals: ["owner", "stage", "month", "quarter", "week"],
  activities: ["assignee", "type", "month", "week", "day"],
  dealMoves: ["month", "week"],
};

const BREAKDOWNS_BY_DATASET: Record<Dataset, string[]> = {
  deals: ["none", "owner", "stage", "quarter"],
  activities: ["none", "type", "assignee"],
  dealMoves: ["none", "owner"],
};

const STAGE_OPTIONS = [
  "Discovery",
  "Validation",
  "Proposal",
  "Proof of Concept",
  "Out for Signature",
  "Won",
  "Lost",
];

const TABLE_COLUMNS = ["owner", "title", "stage", "value", "closeDate"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dashboardId: string;
  editing?: DashboardCard | null;
  onSave: (payload: {
    title: string;
    vizType: VizType;
    dataset: Dataset;
    config: CardConfig;
    size: "sm" | "md" | "lg";
  }) => void;
  saving?: boolean;
}

export function CardBuilderDialog({ open, onOpenChange, editing, onSave, saving }: Props) {
  const [title, setTitle] = useState("");
  const [dataset, setDataset] = useState<Dataset>("deals");
  const [vizType, setVizType] = useState<VizType>("bar");
  const [size, setSize] = useState<"sm" | "md" | "lg">("md");
  const [metric, setMetric] = useState("count");
  const [isMulti, setIsMulti] = useState(false);
  const [metrics, setMetrics] = useState<string[]>(["count", "sumValue"]);
  const [dimension, setDimension] = useState("owner");
  const [breakdown, setBreakdown] = useState("none");
  const [status, setStatus] = useState("open");
  const [period, setPeriod] = useState("allTime");
  const [dateField, setDateField] = useState("created");
  const [toStage, setToStage] = useState("Discovery");
  const [timeInStageMinDays, setTimeInStageMinDays] = useState("");
  const [closingWithinDays, setClosingWithinDays] = useState("");
  // Config keys the builder UI doesn't expose but must preserve when editing
  // existing/seeded cards (e.g. multi-metric cards, hand-authored tables).
  const [preserved, setPreserved] = useState<{
    info?: string;
    stages?: string[];
    types?: string[];
    columns?: string[];
    sort?: { by?: string; dir?: "asc" | "desc" };
  }>({});

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDataset(editing.dataset);
      setVizType(editing.vizType);
      setSize(editing.size);
      const c = editing.config;
      const cMulti = c.metric === "multi" && Array.isArray(c.metrics);
      setIsMulti(cMulti);
      setMetrics(cMulti ? (c.metrics as string[]) : ["count", "sumValue"]);
      setMetric(c.metric && c.metric !== "multi" ? c.metric : "count");
      setDimension(c.dimension ?? "owner");
      setBreakdown(c.breakdown ?? "none");
      setStatus(c.filters?.status ?? "open");
      setPeriod(c.filters?.period ?? "allTime");
      setDateField(c.filters?.dateField ?? "created");
      setToStage(c.filters?.toStage ?? "Discovery");
      setTimeInStageMinDays(c.filters?.timeInStageMinDays ? String(c.filters.timeInStageMinDays) : "");
      setClosingWithinDays(c.filters?.closingWithinDays ? String(c.filters.closingWithinDays) : "");
      setPreserved({
        info: c.info,
        stages: Array.isArray(c.filters?.stages) ? c.filters?.stages : undefined,
        types: Array.isArray(c.filters?.types) ? c.filters?.types : undefined,
        columns: Array.isArray(c.columns) ? c.columns : undefined,
        sort: c.sort,
      });
    } else {
      setTitle("");
      setDataset("deals");
      setVizType("bar");
      setSize("md");
      setMetric("count");
      setIsMulti(false);
      setMetrics(["count", "sumValue"]);
      setDimension("owner");
      setBreakdown("none");
      setStatus("open");
      setPeriod("allTime");
      setDateField("created");
      setToStage("Discovery");
      setTimeInStageMinDays("");
      setClosingWithinDays("");
      setPreserved({});
    }
  }, [open, editing]);

  // Keep selections valid when dataset changes.
  useEffect(() => {
    if (!VIZ_BY_DATASET[dataset].includes(vizType)) setVizType(VIZ_BY_DATASET[dataset][0]);
    if (!METRICS_BY_DATASET[dataset].includes(metric)) setMetric(METRICS_BY_DATASET[dataset][0]);
    if (dimension !== "none" && !DIMS_BY_DATASET[dataset].includes(dimension)) setDimension(DIMS_BY_DATASET[dataset][0]);
    if (breakdown !== "none" && !BREAKDOWNS_BY_DATASET[dataset].includes(breakdown)) setBreakdown("none");
    if (!MULTI_METRICS_BY_DATASET[dataset]) setIsMulti(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset]);

  const isKpi = vizType === "kpi" || vizType === "gauge";
  const isTable = vizType === "table";
  // Multi-measure comparison is only available for series charts on datasets
  // the query engine can aggregate multiple measures for (deals only).
  const multiMetricOptions = MULTI_METRICS_BY_DATASET[dataset];
  const canMulti = !isKpi && !isTable && !!multiMetricOptions;
  const multiActive = canMulti && isMulti;
  const showBreakdown =
    !isKpi &&
    !isTable &&
    !multiActive &&
    ["groupedBar", "stackedBar", "horizontalBar", "bar", "line"].includes(vizType);

  const config: CardConfig = useMemo(() => {
    const filters: CardConfig["filters"] = {};
    if (dataset === "deals") {
      filters.status = status as "open" | "won" | "lost" | "any";
      if (period !== "allTime") filters.period = period;
      if (period !== "allTime") filters.dateField = dateField as "created" | "close" | "updated";
      if (timeInStageMinDays) filters.timeInStageMinDays = Number(timeInStageMinDays);
      if (isTable && closingWithinDays) filters.closingWithinDays = Number(closingWithinDays);
      // Preserve hand-authored stage filters the UI doesn't expose.
      if (preserved.stages) filters.stages = preserved.stages;
    } else if (dataset === "activities") {
      if (period !== "allTime") filters.period = period;
      if (preserved.types) filters.types = preserved.types;
    } else if (dataset === "dealMoves") {
      filters.toStage = toStage;
      if (period !== "allTime") filters.period = period;
    }

    const withInfo = (c: CardConfig): CardConfig =>
      preserved.info ? { ...c, info: preserved.info } : c;

    if (isTable) {
      return withInfo({
        columns: preserved.columns ?? TABLE_COLUMNS,
        filters,
        sort: preserved.sort ?? { by: "closeDate", dir: "asc" },
      });
    }
    if (isKpi) {
      return withInfo({ metric, filters });
    }
    // Multi-measure series cards plot several measures on one chart
    // (config.metric === "multi"). The query engine ignores breakdown here.
    if (multiActive) {
      return withInfo({
        metric: "multi",
        metrics,
        dimension,
        filters,
      });
    }
    return withInfo({
      metric,
      dimension,
      breakdown: showBreakdown && breakdown !== "none" ? breakdown : undefined,
      filters,
    });
  }, [dataset, vizType, metric, metrics, multiActive, dimension, breakdown, status, period, dateField, toStage, timeInStageMinDays, closingWithinDays, isKpi, isTable, showBreakdown, preserved]);

  const previewCard = useMemo(
    () =>
      ({
        id: "preview",
        dashboardId: "preview",
        title: title || "Preview",
        vizType,
        dataset,
        config,
        order: 0,
        size,
        createdAt: "",
        updatedAt: "",
      }) as DashboardCard,
    [title, vizType, dataset, config, size],
  );

  const multiInvalid = multiActive && metrics.length < 2;

  const handleSave = () => {
    if (multiInvalid) return;
    onSave({ title: title.trim() || "Untitled card", vizType, dataset, config, size });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit card" : "Add a card"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Controls */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Open pipeline by owner" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data source</Label>
                <Select value={dataset} onValueChange={(v) => setDataset(v as Dataset)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DATASET_LABELS) as Dataset[]).map((d) => (
                      <SelectItem key={d} value={d}>{DATASET_LABELS[d]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Chart type</Label>
                <Select value={vizType} onValueChange={(v) => setVizType(v as VizType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VIZ_BY_DATASET[dataset].map((v) => (
                      <SelectItem key={v} value={v}>{VIZ_LABELS[v]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!isTable && !isKpi && multiActive && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Measures to compare</Label>
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setIsMulti(false)}
                  >
                    Use a single measure
                  </button>
                </div>
                <div className="space-y-2 rounded-md border p-3">
                  {(multiMetricOptions ?? []).map((m) => (
                    <label key={m} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={metrics.includes(m)}
                        onCheckedChange={(checked) =>
                          setMetrics((prev) =>
                            checked === true
                              ? [...prev.filter((x) => x !== m), m]
                              : prev.filter((x) => x !== m),
                          )
                        }
                      />
                      {METRIC_LABELS[m] ?? m}
                    </label>
                  ))}
                </div>
                {metrics.length < 2 && (
                  <p className="text-[11px] text-destructive">
                    Pick at least two measures to compare.
                  </p>
                )}
              </div>
            )}

            {!isTable && !(multiActive && !isKpi) && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Measure</Label>
                  {canMulti && (
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => {
                        setMetrics((prev) => {
                          const valid = (multiMetricOptions ?? []).filter((m) =>
                            prev.includes(m),
                          );
                          if (valid.length >= 2) return valid;
                          const base = (multiMetricOptions ?? []).includes(metric)
                            ? [metric]
                            : [];
                          const filler = (multiMetricOptions ?? []).filter(
                            (m) => !base.includes(m),
                          );
                          return [...base, ...filler].slice(0, 2);
                        });
                        setIsMulti(true);
                      }}
                    >
                      Compare measures
                    </button>
                  )}
                </div>
                <Select value={metric} onValueChange={setMetric}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METRICS_BY_DATASET[dataset].map((m) => (
                      <SelectItem key={m} value={m}>{METRIC_LABELS[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!isKpi && !isTable && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Group by</Label>
                  <Select value={dimension} onValueChange={setDimension}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DIMS_BY_DATASET[dataset].map((d) => (
                        <SelectItem key={d} value={d}>{DIMENSION_LABELS[d]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {showBreakdown && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Split by</Label>
                    <Select value={breakdown} onValueChange={setBreakdown}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BREAKDOWNS_BY_DATASET[dataset].map((b) => (
                          <SelectItem key={b} value={b}>{DIMENSION_LABELS[b]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {dataset === "deals" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Deal status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="won">Won</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                    <SelectItem value="any">Any</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {dataset === "dealMoves" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Moved into stage</Label>
                <Select value={toStage} onValueChange={setToStage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGE_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Time period</Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(PERIOD_LABELS).map((p) => (
                      <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {dataset === "deals" && period !== "allTime" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Date field</Label>
                  <Select value={dateField} onValueChange={setDateField}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="created">Created date</SelectItem>
                      <SelectItem value="close">Close date</SelectItem>
                      <SelectItem value="updated">Last updated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {dataset === "deals" && !isTable && (
              <div className="space-y-1.5">
                <Label className="text-xs">Min days in stage (optional)</Label>
                <Input
                  type="number"
                  value={timeInStageMinDays}
                  onChange={(e) => setTimeInStageMinDays(e.target.value)}
                  placeholder="e.g. 180"
                />
              </div>
            )}

            {isTable && (
              <div className="space-y-1.5">
                <Label className="text-xs">Closing within N days (optional)</Label>
                <Input
                  type="number"
                  value={closingWithinDays}
                  onChange={(e) => setClosingWithinDays(e.target.value)}
                  placeholder="e.g. 14"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Card width</Label>
              <Select value={size} onValueChange={(v) => setSize(v as "sm" | "md" | "lg")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sm">Small (1 column)</SelectItem>
                  <SelectItem value="md">Medium (2 columns)</SelectItem>
                  <SelectItem value="lg">Large (full width)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Live preview */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Live preview</Label>
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{title || "Preview"}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardRenderer card={previewCard} height={220} />
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || multiInvalid}>
            {editing ? "Save changes" : "Add card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
