import { useQuery } from "@tanstack/react-query";
import { useSessionToken } from "@/hooks/use-session-token";
import { useCallback, useState } from "react";
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
} from "recharts";
import { BASE, type DashboardCard, type QueryResult } from "./types";

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  color: "hsl(var(--foreground))",
  fontSize: "11px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  padding: "6px 10px",
};

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
    <div className="flex flex-col items-center justify-center h-full min-h-[100px] text-muted-foreground/60 text-xs gap-1">
      <div className="w-8 h-8 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
        <span className="text-lg leading-none text-muted-foreground/30">—</span>
      </div>
      {label}
    </div>
  );
}

/** Pivots normalized series into recharts row objects keyed by series name. */
function toRows(result: QueryResult): Record<string, number | string>[] {
  const cats = result.categories ?? [];
  const series = result.series ?? [];
  return cats.map((c, i) => {
    const row: Record<string, number | string> = { __cat: c };
    for (const s of series) row[s.name] = s.data[i] ?? 0;
    return row;
  });
}

/** Semicircle SVG gauge */
function SemiGauge({ pct, value, max, format }: { pct: number; value: number; max: number; format: string }) {
  const r = 54;
  const cx = 70;
  const cy = 64;
  const circumference = Math.PI * r;
  const strokeDashoffset = circumference * (1 - pct / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="140" height="80" viewBox="0 0 140 80">
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="hsl(var(--muted))" strokeWidth="10" strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="hsl(var(--primary))" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="15" fontWeight="700" fill="hsl(var(--foreground))">
          {fmtShort(value, format)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="8" fill="hsl(var(--muted-foreground))">
          {pct.toFixed(0)}% of {fmtShort(max, format)}
        </text>
      </svg>
    </div>
  );
}

/** Sortable table */
function SortableTable({ data, format }: { data: QueryResult; format?: string }) {
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
    const av = a[sortKey], bv = b[sortKey];
    const an = Number(av), bn = Number(bv);
    const cmp = !isNaN(an) && !isNaN(bn)
      ? an - bn
      : String(av ?? "").localeCompare(String(bv ?? ""));
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="overflow-auto max-h-[320px]">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b">
            {columns.map(c => (
              <th
                key={c.key}
                onClick={() => handleSort(c.key)}
                className={`py-1.5 px-2 font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap ${c.format === "currency" ? "text-right" : "text-left"}`}
              >
                <span className="inline-flex items-center gap-0.5">
                  {c.label}
                  {sortKey === c.key
                    ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                    : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
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
                let display: string;
                if (c.format === "currency") display = formatCurrency(Number(val ?? 0));
                else if (c.format === "date") display = fmtDate(val);
                else display = val == null || val === "" ? "—" : String(val);
                return (
                  <td
                    key={c.key}
                    className={`py-1.5 px-2 ${c.format === "currency" ? "text-right font-medium tabular-nums" : "text-left"} ${c.key === "title" || c.key === "owner" ? "font-medium" : "text-muted-foreground"}`}
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
            <tr className="border-t-2 font-semibold bg-card">
              {columns.map((c, i) => (
                <td key={c.key} className={`py-1.5 px-2 text-xs ${c.format === "currency" ? "text-right" : ""}`}>
                  {i === 0 ? "Total" : c.format === "currency" ? formatCurrency(Number(totalRow.value)) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function CardRenderer({ card, height = 200 }: { card: DashboardCard; height?: number }) {
  const { data, isLoading, isError } = useCardQuery(card);

  if (isLoading) return <Skeleton className="w-full rounded-none" style={{ height }} />;
  if (isError || !data) return <EmptyState label="Couldn't load data." />;

  const format = data.valueFormat;

  // KPI
  if (data.kind === "kpi" && data.kpi) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[80px] py-3 gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {data.kpi.format === "currency" ? "Total" : "Count"}
        </span>
        <span className="text-3xl font-bold tracking-tight text-primary">
          {fmt(data.kpi.value, data.kpi.format)}
        </span>
      </div>
    );
  }

  // Gauge
  if (data.kind === "gauge" && data.gauge) {
    const pct = data.gauge.max > 0 ? Math.min(100, (data.gauge.value / data.gauge.max) * 100) : 0;
    return (
      <div className="flex items-center justify-center h-full min-h-[100px]">
        <SemiGauge pct={pct} value={data.gauge.value} max={data.gauge.max} format={data.gauge.format} />
      </div>
    );
  }

  // Table
  if (data.kind === "table") {
    return <SortableTable data={data} format={format} />;
  }

  // Empty series
  if (data.kind !== "series" || !data.series || data.series.length === 0 || (data.categories ?? []).length === 0) {
    return <EmptyState />;
  }

  const rows = toRows(data);
  const series = data.series;
  const multiSeries = series.length > 1;
  const yFmt = (v: number) => fmtShort(v, format);

  if (card.vizType === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="__cat" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFmt} width={38} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v, format)} />
          {multiSeries && <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />}
          {series.map(s => (
            <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const horizontal = card.vizType === "horizontalBar";
  const stacked = card.vizType === "stackedBar";
  const tooManyBars = rows.length > 8;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={rows}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={horizontal
          ? { top: 2, right: 12, left: 0, bottom: 2 }
          : { top: 4, right: 8, left: 0, bottom: tooManyBars ? 36 : 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"
          vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFmt} />
            <YAxis type="category" dataKey="__cat" width={90} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
          </>
        ) : (
          <>
            <XAxis dataKey="__cat" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}
              interval={0}
              angle={tooManyBars ? -35 : 0}
              textAnchor={tooManyBars ? "end" : "middle"}
              height={tooManyBars ? 48 : 24} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFmt} width={40} />
          </>
        )}
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v, format)} />
        {multiSeries && <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconSize={8} />}
        {series.map((s, si) => (
          <Bar
            key={s.name}
            dataKey={s.name}
            stackId={stacked ? "stack" : undefined}
            fill={s.color}
            maxBarSize={stacked ? undefined : 32}
            radius={stacked
              ? si === series.length - 1 ? (horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]) : [0, 0, 0, 0]
              : horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}
          >
            {!multiSeries && rows.map((_, i) => <Cell key={i} fill={s.color} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
