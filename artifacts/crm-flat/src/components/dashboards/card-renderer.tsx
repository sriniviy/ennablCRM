import { useQuery } from "@tanstack/react-query";
import { useSessionToken } from "@/hooks/use-session-token";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  Cell,
  LabelList,
} from "recharts";
import { BASE, type DashboardCard, type QueryResult } from "./types";

const tooltipStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--foreground))",
  fontSize: "12px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  padding: "8px 12px",
};

// Vivid palette — used when series color is not set or for single-series
const PALETTE = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#84cc16", "#f97316", "#ec4899",
];

function fmt(v: number, format?: string): string {
  if (format === "currency") return formatCurrency(v);
  if (format === "days") return v >= 30 ? `${(v / 30.44).toFixed(1)}mo` : `${Math.round(v)}d`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function fmtShort(v: number, format?: string): string {
  if (format === "currency") {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
    return `$${Math.round(v)}`;
  }
  if (format === "days") return v >= 30 ? `${(v / 30.44).toFixed(1)}mo` : `${Math.round(v)}d`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function fmtDate(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function useCardQuery(card: Pick<DashboardCard, "vizType" | "dataset" | "config">) {
  const getToken = useSessionToken();
  return useQuery<QueryResult>({
    queryKey: ["dashboard-card-query", card.vizType, card.dataset, card.config],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${BASE}/api/dashboards/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          vizType: card.vizType,
          dataset: card.dataset,
          config: card.config,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });
}

function EmptyState({ label = "No data for this period." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[80px] text-muted-foreground/50 text-xs gap-2">
      <div className="w-10 h-10 rounded-full border-2 border-dashed border-muted-foreground/20 flex items-center justify-center text-muted-foreground/20 text-xl">
        —
      </div>
      {label}
    </div>
  );
}

function toRows(result: QueryResult): Record<string, number | string>[] {
  const cats = result.categories ?? [];
  const series = result.series ?? [];
  return cats.map((c, i) => {
    const row: Record<string, number | string> = { __cat: c };
    for (const s of series) row[s.name] = s.data[i] ?? 0;
    return row;
  });
}

/** Responsive semicircle gauge — scales with available height */
function SemiGauge({ pct, value, max, format, height }: { pct: number; value: number; max: number; format: string; height: number }) {
  const scale = Math.min(1.4, Math.max(0.7, height / 200));
  const r = Math.round(60 * scale);
  const W = Math.round(r * 2 + 24);
  const H = Math.round(r + 32);
  const cx = W / 2;
  const cy = r + 4;
  const circ = Math.PI * r;
  const offset = circ * (1 - pct / 100);
  const sw = Math.round(10 * scale);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.7" />
            <stop offset="100%" stopColor="hsl(var(--primary))" />
          </linearGradient>
        </defs>
        {/* Track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="hsl(var(--muted))" strokeWidth={sw} strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="url(#gaugeGrad)" strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1)" }}
        />
        {/* Value text */}
        <text x={cx} y={cy - sw / 2 - 4} textAnchor="middle"
          fontSize={Math.round(18 * scale)} fontWeight="700" fill="hsl(var(--foreground))">
          {fmtShort(value, format)}
        </text>
        {/* Sub-label */}
        <text x={cx} y={cy + 14} textAnchor="middle"
          fontSize={Math.round(9 * scale)} fill="hsl(var(--muted-foreground))">
          {pct.toFixed(0)}% of {fmtShort(max, format)} target
        </text>
      </svg>
    </div>
  );
}

/** Sortable table with sticky header */
function SortableTable({ data, height }: { data: QueryResult; height: number }) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  if (!data.table) return <EmptyState />;
  const { columns, rows, totalRow } = data.table;
  if (rows.length === 0) return <EmptyState label="No matching records." />;

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...rows].sort((a, b) => {
    if (!sortKey) return 0;
    const an = Number(a[sortKey]), bn = Number(b[sortKey]);
    const cmp = !isNaN(an) && !isNaN(bn)
      ? an - bn
      : String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="overflow-auto" style={{ maxHeight: height }}>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card z-10 shadow-sm">
          <tr className="border-b">
            {columns.map(c => (
              <th
                key={c.key}
                onClick={() => handleSort(c.key)}
                className={`py-1.5 px-2.5 font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap ${c.format === "currency" ? "text-right" : "text-left"}`}
              >
                <span className="inline-flex items-center gap-0.5">
                  {c.label}
                  {sortKey === c.key
                    ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                    : <ChevronsUpDown className="h-3 w-3 opacity-25" />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
              {columns.map(c => {
                const val = r[c.key];
                const display = c.format === "currency"
                  ? formatCurrency(Number(val ?? 0))
                  : c.format === "date"
                    ? fmtDate(val)
                    : val == null || val === "" ? "—" : String(val);
                return (
                  <td
                    key={c.key}
                    className={`py-1.5 px-2.5 ${c.format === "currency" ? "text-right font-medium tabular-nums" : "text-left"} ${c.key === "title" || c.key === "owner" ? "font-medium" : "text-muted-foreground"}`}
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {totalRow && typeof totalRow.value === "number" && (
          <tfoot>
            <tr className="border-t-2 font-semibold bg-muted/20">
              {columns.map((c, ci) => (
                <td key={c.key} className={`py-1.5 px-2.5 text-xs ${c.format === "currency" ? "text-right" : ""}`}>
                  {ci === 0 ? "Total" : c.format === "currency" ? formatCurrency(Number(totalRow.value)) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** KPI card — shows large value, scales with height */
function KpiCard({ value, format, height }: { value: number; format: string; height: number }) {
  const large = height > 200;
  return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {format === "currency" ? "Total Value" : "Count"}
      </span>
      <span className={`font-bold tracking-tight text-primary tabular-nums ${large ? "text-5xl" : "text-3xl"}`}>
        {fmt(value, format)}
      </span>
    </div>
  );
}

export function CardRenderer({ card, height = 260 }: { card: DashboardCard; height?: number }) {
  const { data, isLoading, isError } = useCardQuery(card);

  if (isLoading) return <Skeleton className="w-full h-full rounded-sm" />;
  if (isError || !data) return <EmptyState label="Couldn't load data." />;

  const format = data.valueFormat;

  if (data.kind === "kpi" && data.kpi) {
    return <KpiCard value={data.kpi.value} format={data.kpi.format} height={height} />;
  }

  if (data.kind === "gauge" && data.gauge) {
    const pct = data.gauge.max > 0 ? Math.min(100, (data.gauge.value / data.gauge.max) * 100) : 0;
    return <SemiGauge pct={pct} value={data.gauge.value} max={data.gauge.max} format={data.gauge.format} height={height} />;
  }

  if (data.kind === "table") {
    return <SortableTable data={data} height={height} />;
  }

  if (data.kind !== "series" || !data.series || data.series.length === 0 || (data.categories ?? []).length === 0) {
    return <EmptyState />;
  }

  const rows = toRows(data);
  const series = data.series;
  const multiSeries = series.length > 1;
  const catCount = rows.length;
  const yFmt = (v: number) => fmtShort(v, format);

  // Show value labels only when not too crowded
  const showLabels = catCount <= 12 && series.length <= 6;

  const labelStyle = { fontSize: 9, fill: "hsl(var(--foreground) / 65%)" } as React.CSSProperties;

  if (card.vizType === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />
          <XAxis dataKey="__cat" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFmt} width={40} domain={[0, "auto"]} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v, format)} />
          {multiSeries && <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} iconSize={8} />}
          {series.map((s, si) => (
            <Line key={s.name} type="monotone" dataKey={s.name}
              stroke={s.color || PALETTE[si % PALETTE.length]} strokeWidth={2.5}
              dot={{ r: 3, fill: s.color || PALETTE[si % PALETTE.length] }}
              activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const horizontal = card.vizType === "horizontalBar";
  const stacked = card.vizType === "stackedBar";
  const tooManyH = !horizontal && catCount > 8;

  // For horizontal bars, need wider left axis to fit labels
  const yAxisW = horizontal
    ? Math.min(120, Math.max(60, Math.max(...rows.map(r => String(r.__cat).length)) * 6))
    : 44;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={rows}
        layout={horizontal ? "vertical" : "horizontal"}
        barCategoryGap={stacked ? "30%" : "25%"}
        barGap={3}
        margin={horizontal
          ? { top: 4, right: showLabels ? 40 : 12, left: 0, bottom: 4 }
          : { top: showLabels ? 20 : 8, right: 8, left: 0, bottom: tooManyH ? 52 : 8 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--border))"
          opacity={0.4}
          vertical={horizontal}
          horizontal={!horizontal}
        />

        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFmt} domain={[0, "auto"]} />
            <YAxis type="category" dataKey="__cat" width={yAxisW} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
          </>
        ) : (
          <>
            <XAxis
              dataKey="__cat"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false} tickLine={false}
              interval={0}
              angle={tooManyH ? -40 : 0}
              textAnchor={tooManyH ? "end" : "middle"}
              height={tooManyH ? 60 : 28}
            />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFmt} width={yAxisW} domain={[0, "auto"]} />
          </>
        )}

        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, name: string) => [fmt(v, format), name]}
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
        />
        {multiSeries && <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} iconSize={8} />}

        {series.map((s, si) => {
          const isLast = si === series.length - 1;
          const color = s.color || PALETTE[si % PALETTE.length];
          return (
            <Bar
              key={s.name}
              dataKey={s.name}
              stackId={stacked ? "stack" : undefined}
              fill={color}
              maxBarSize={stacked ? undefined : 36}
              radius={stacked
                ? isLast ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : [0, 0, 0, 0]
                : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            >
              {/* Single-series: color each bar from palette */}
              {!multiSeries && rows.map((_, ri) => (
                <Cell key={ri} fill={PALETTE[ri % PALETTE.length]} />
              ))}

              {/* Value labels */}
              {showLabels && (
                <LabelList
                  dataKey={s.name}
                  position={horizontal ? "right" : (stacked && !isLast ? "center" : "top")}
                  formatter={(v: number) => v === 0 ? "" : fmtShort(v, format)}
                  style={{
                    ...labelStyle,
                    ...(stacked && !isLast ? { fill: "rgba(255,255,255,0.85)", fontWeight: 600 } : {}),
                  }}
                />
              )}
            </Bar>
          );
        })}
      </BarChart>
    </ResponsiveContainer>
  );
}
