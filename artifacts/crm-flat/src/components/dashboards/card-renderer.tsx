import { useQuery } from "@tanstack/react-query";
import { useSessionToken } from "@/hooks/use-session-token";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line, Cell, LabelList,
} from "recharts";
import { BASE, type DashboardCard, type QueryResult } from "./types";

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(v: number, format?: string): string {
  if (format === "currency") return formatCurrency(v);
  if (format === "days") return v >= 30 ? `${(v / 30.44).toFixed(1)} mo` : `${Math.round(v)} d`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function fmtShort(v: number, format?: string): string {
  if (format === "currency") {
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
    return `$${Math.round(v)}`;
  }
  if (format === "days") return v >= 30 ? `${(v / 30.44).toFixed(1)}mo` : `${Math.round(v)}d`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function fmtDate(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Colors ────────────────────────────────────────────────────────────────────

const PALETTE = [
  "#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444",
  "#8b5cf6","#06b6d4","#84cc16","#f97316","#ec4899",
];

// ── Tooltip ───────────────────────────────────────────────────────────────────

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  color: "hsl(var(--foreground))",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  padding: "8px 12px",
};

// ── Query hook ────────────────────────────────────────────────────────────────

export function useCardQuery(card: Pick<DashboardCard, "vizType" | "dataset" | "config">) {
  const getToken = useSessionToken();
  return useQuery<QueryResult>({
    queryKey: ["dashboard-card-query", card.vizType, card.dataset, card.config],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${BASE}/api/dashboards/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vizType: card.vizType, dataset: card.dataset, config: card.config }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ label = "No data for this period." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60px] text-muted-foreground/40 text-xs gap-2">
      <div className="w-9 h-9 rounded-full border-2 border-dashed border-muted-foreground/20 flex items-center justify-center text-base text-muted-foreground/20">—</div>
      {label}
    </div>
  );
}

// ── Series pivot ──────────────────────────────────────────────────────────────

function toRows(result: QueryResult): Record<string, number | string>[] {
  return (result.categories ?? []).map((c, i) => {
    const row: Record<string, number | string> = { __cat: c };
    for (const s of result.series ?? []) row[s.name] = s.data[i] ?? 0;
    return row;
  });
}

// ── Gauge (fully responsive SVG) ──────────────────────────────────────────────

function GaugeCard({ value, max, format, height }: { value: number; max: number; format: string; height: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  // Fixed viewBox — SVG scales to fill the container
  const VW = 220, VH = 140;
  const cx = 110, cy = 110, r = 88, sw = 14;
  const halfCirc = Math.PI * r;
  const offset = halfCirc * (1 - pct / 100);

  // Tick marks at 0%, 25%, 50%, 75%, 100%
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const angle = Math.PI * f; // 0 = left, PI = right
    const x1 = cx - r * Math.cos(angle);
    const y1 = cy - r * Math.sin(angle);
    const x2 = cx - (r + 8) * Math.cos(angle);
    const y2 = cy - (r + 8) * Math.sin(angle);
    return { x1, y1, x2, y2 };
  });

  // Needle angle
  const needleAngle = Math.PI * (1 - pct / 100);
  const nx = cx - (r - 10) * Math.cos(needleAngle);
  const ny = cy - (r - 10) * Math.sin(needleAngle);

  return (
    <div className="flex items-center justify-center w-full h-full">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: "100%", maxHeight: height, overflow: "visible" }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="gaugeTrack" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--muted))" />
            <stop offset="100%" stopColor="hsl(var(--muted))" />
          </linearGradient>
          <linearGradient id="gaugeFill" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.5" />
            <stop offset="100%" stopColor="hsl(var(--primary))" />
          </linearGradient>
        </defs>

        {/* Track arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="hsl(var(--muted))" strokeWidth={sw} strokeLinecap="round"
        />

        {/* Value arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="url(#gaugeFill)" strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={halfCirc}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }}
        />

        {/* Tick marks */}
        {ticks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeOpacity={0.4} />
        ))}

        {/* End dots */}
        <circle cx={cx - r} cy={cy} r={5} fill="hsl(var(--muted-foreground))" opacity={0.3} />
        <circle cx={cx + r} cy={cy} r={5} fill="hsl(var(--muted-foreground))" opacity={0.3} />

        {/* Needle dot */}
        <circle cx={cx} cy={cy} r={6} fill="hsl(var(--primary))" opacity={0.2} />
        <line
          x1={cx} y1={cy} x2={nx} y2={ny}
          stroke="hsl(var(--primary))" strokeWidth={2.5} strokeLinecap="round"
          style={{ transition: "x2 0.8s cubic-bezier(0.4,0,0.2,1), y2 0.8s cubic-bezier(0.4,0,0.2,1)" }}
        />
        <circle cx={cx} cy={cy} r={4} fill="hsl(var(--primary))" />

        {/* Main value */}
        <text x={cx} y={cy - 14} textAnchor="middle"
          style={{ fontSize: 24, fontWeight: 800, fill: "hsl(var(--foreground))", fontFamily: "inherit" }}>
          {fmtShort(value, format)}
        </text>

        {/* Pct and max */}
        <text x={cx} y={cy + 8} textAnchor="middle"
          style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "inherit" }}>
          {pct.toFixed(0)}% of {fmtShort(max, format)} weighted target
        </text>

        {/* 0% / 100% labels */}
        <text x={cx - r - 4} y={cy + 16} textAnchor="middle"
          style={{ fontSize: 8, fill: "hsl(var(--muted-foreground))", fontFamily: "inherit" }}>0</text>
        <text x={cx + r + 4} y={cy + 16} textAnchor="middle"
          style={{ fontSize: 8, fill: "hsl(var(--muted-foreground))", fontFamily: "inherit" }}>100%</text>
      </svg>
    </div>
  );
}

// ── KPI ───────────────────────────────────────────────────────────────────────

function KpiCard({ value, format, height }: { value: number; format: string; height: number }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        {format === "currency" ? "Total Value" : "Count"}
      </span>
      <span className={`font-extrabold tracking-tight text-primary tabular-nums ${height > 180 ? "text-5xl" : "text-3xl"}`}>
        {fmt(value, format)}
      </span>
    </div>
  );
}

// ── Sortable table ────────────────────────────────────────────────────────────

function SortableTable({ data, height }: { data: QueryResult; height: number }) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  if (!data.table) return <EmptyState />;
  const { columns, rows, totalRow } = data.table;
  if (rows.length === 0) return <EmptyState label="No matching records." />;

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...rows].sort((a, b) => {
    if (!sortKey) return 0;
    const an = Number(a[sortKey]), bn = Number(b[sortKey]);
    const cmp = !isNaN(an) && !isNaN(bn)
      ? an - bn : String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="overflow-auto" style={{ maxHeight: height }}>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b">
            {columns.map((c) => (
              <th key={c.key} onClick={() => handleSort(c.key)}
                className={`py-1.5 px-2.5 font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap ${c.format === "currency" ? "text-right" : "text-left"}`}>
                <span className="inline-flex items-center gap-0.5">
                  {c.label}
                  {sortKey === c.key
                    ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                    : <ChevronsUpDown className="h-3 w-3 opacity-20" />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
              {columns.map((c) => {
                const val = r[c.key];
                const display = c.format === "currency" ? formatCurrency(Number(val ?? 0))
                  : c.format === "date" ? fmtDate(val)
                  : val == null || val === "" ? "—" : String(val);
                return (
                  <td key={c.key}
                    className={`py-1.5 px-2.5 ${c.format === "currency" ? "text-right font-medium tabular-nums" : "text-left"} ${c.key === "title" || c.key === "owner" ? "font-medium" : "text-muted-foreground"}`}>
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {totalRow && typeof totalRow.value === "number" && (
          <tfoot>
            <tr className="border-t-2 font-semibold bg-muted/10">
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

// ── Main renderer ─────────────────────────────────────────────────────────────

export function CardRenderer({ card, height = 260 }: { card: DashboardCard; height?: number }) {
  const { data, isLoading, isError } = useCardQuery(card);

  if (isLoading) return <Skeleton className="w-full h-full rounded-sm" />;
  if (isError || !data) return <EmptyState label="Couldn't load data." />;

  const format = data.valueFormat;

  // KPI
  if (data.kind === "kpi" && data.kpi) {
    return <KpiCard value={data.kpi.value} format={data.kpi.format} height={height} />;
  }

  // Gauge
  if (data.kind === "gauge" && data.gauge) {
    return <GaugeCard value={data.gauge.value} max={data.gauge.max} format={data.gauge.format} height={height} />;
  }

  // Table
  if (data.kind === "table") return <SortableTable data={data} height={height} />;

  // Empty series
  if (data.kind !== "series" || !data.series?.length || !(data.categories ?? []).length) {
    return <EmptyState />;
  }

  const rows = toRows(data);
  const series = data.series;
  const multiSeries = series.length > 1;
  const catCount = rows.length;
  const yFmt = (v: number) => fmtShort(v, format);

  // Show value labels only when not too crowded
  const showLabels = !multiSeries && catCount <= 14;

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    fill: "hsl(var(--foreground) / 55%)",
    fontFamily: "inherit",
  };

  if (card.vizType === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />
          <XAxis dataKey="__cat" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFmt} width={44} domain={[0, "auto"]} />
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

  // For horizontal bars: compute Y-axis width from longest category label
  const maxLabelChars = horizontal
    ? Math.max(...rows.map((r) => String(r.__cat).length))
    : 0;
  const yAxisW = horizontal
    ? Math.min(140, Math.max(70, maxLabelChars * 7))
    : 44;

  // For vertical bars: rotate labels when many categories
  const tooManyBars = !horizontal && catCount > 8;

  // Right margin: need space for value labels on horizontal bars
  const rightMargin = horizontal && showLabels ? 52 : horizontal ? 12 : 10;
  const topMargin = !horizontal && showLabels ? 22 : 8;
  const bottomMargin = tooManyBars ? 60 : !horizontal ? 10 : 4;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={rows}
        layout={horizontal ? "vertical" : "horizontal"}
        barCategoryGap={stacked ? "28%" : "22%"}
        barGap={2}
        margin={{ top: topMargin, right: rightMargin, left: 0, bottom: bottomMargin }}
      >
        <CartesianGrid
          strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4}
          vertical={horizontal} horizontal={!horizontal}
        />

        {horizontal ? (
          <>
            <XAxis type="number"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false} tickLine={false} tickFormatter={yFmt} domain={[0, "auto"]} />
            <YAxis type="category" dataKey="__cat" width={yAxisW}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false} tickLine={false} />
          </>
        ) : (
          <>
            <XAxis dataKey="__cat"
              tick={{ fontSize: tooManyBars ? 9 : 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false} tickLine={false}
              interval={0}
              angle={tooManyBars ? -40 : 0}
              textAnchor={tooManyBars ? "end" : "middle"}
              height={tooManyBars ? 64 : 28} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false} tickLine={false} tickFormatter={yFmt} width={yAxisW} domain={[0, "auto"]} />
          </>
        )}

        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, name: string) => [fmt(v, format), name]}
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.35 }}
        />
        {multiSeries && (
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 6 }}
            iconSize={8}
            iconType="circle"
          />
        )}

        {series.map((s, si) => {
          const isLast = si === series.length - 1;
          const color = s.color || PALETTE[si % PALETTE.length];

          return (
            <Bar key={s.name} dataKey={s.name}
              stackId={stacked ? "stack" : undefined}
              fill={color}
              maxBarSize={horizontal ? 28 : 40}
              radius={
                stacked
                  ? isLast
                    ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0])
                    : [0, 0, 0, 0]
                  : horizontal
                    ? [0, 4, 4, 0]
                    : [4, 4, 0, 0]
              }
            >
              {/* Per-bar colors for single-series charts */}
              {!multiSeries && rows.map((_, ri) => (
                <Cell key={ri} fill={PALETTE[ri % PALETTE.length]} />
              ))}

              {/* Value labels */}
              {showLabels && (
                <LabelList
                  dataKey={s.name}
                  position={horizontal ? "right" : "top"}
                  formatter={(v: number) => (v === 0 ? "" : fmtShort(v, format))}
                  style={labelStyle}
                />
              )}

              {/* For stacked bar: show total on the top segment only */}
              {multiSeries && stacked && isLast && (
                <LabelList
                  dataKey={s.name}
                  position={horizontal ? "right" : "top"}
                  content={(props) => {
                    const { x = 0, y = 0, width = 0, value, index = 0 } = props as {
                      x?: number; y?: number; width?: number; value?: number; index?: number;
                    };
                    if (typeof index !== "number") return null;
                    const total = series.reduce((sum, sr) => sum + (Number(sr.data[index]) || 0), 0);
                    if (!total) return null;
                    return (
                      <text
                        x={horizontal ? Number(x) + Number(width) + 4 : Number(x) + Number(width) / 2}
                        y={horizontal ? Number(y) + 10 : Number(y) - 4}
                        textAnchor={horizontal ? "start" : "middle"}
                        style={{ ...labelStyle, fontSize: 9, fontWeight: 600 }}
                      >
                        {fmtShort(total, format)}
                      </text>
                    );
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
