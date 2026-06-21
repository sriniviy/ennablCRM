import { useQuery } from "@tanstack/react-query";
import { useSessionToken } from "@/hooks/use-session-token";
import { useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
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
  borderRadius: "8px",
  color: "hsl(var(--foreground))",
  fontSize: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
};

function fmt(v: number, format?: string): string {
  if (format === "currency") return formatCurrency(v);
  if (format === "days") return `${v.toFixed(1)}d`;
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

function EmptyState({ label = "No data for this view." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[160px] text-muted-foreground text-sm">
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

export function CardRenderer({ card, height = 240 }: { card: DashboardCard; height?: number }) {
  const { data, isLoading, isError } = useCardQuery(card);

  if (isLoading) return <Skeleton className="w-full" style={{ height }} />;
  if (isError || !data) return <EmptyState label="Couldn't load data." />;

  const format = data.valueFormat;

  // KPI
  if (data.kind === "kpi" && data.kpi) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[120px] py-4">
        <span className="text-4xl font-bold tracking-tight">
          {fmt(data.kpi.value, data.kpi.format)}
        </span>
      </div>
    );
  }

  // Gauge — semicircle progress
  if (data.kind === "gauge" && data.gauge) {
    const pct = data.gauge.max > 0 ? Math.min(100, (data.gauge.value / data.gauge.max) * 100) : 0;
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[140px] gap-3 py-4">
        <div className="relative h-3 w-full max-w-[220px] rounded-full bg-muted overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold">{fmt(data.gauge.value, data.gauge.format)}</div>
          <div className="text-xs text-muted-foreground">
            {pct.toFixed(0)}% of {fmt(data.gauge.max, data.gauge.format)}
          </div>
        </div>
      </div>
    );
  }

  // Table
  if (data.kind === "table" && data.table) {
    const { columns, rows, totalRow } = data.table;
    if (rows.length === 0) return <EmptyState label="No matching records." />;
    return (
      <div className="overflow-auto max-h-[360px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b text-xs text-muted-foreground">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`py-2 px-2 font-medium ${c.format === "currency" ? "text-right" : "text-left"}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
                {columns.map((c) => {
                  const val = r[c.key];
                  let display: string;
                  if (c.format === "currency") display = formatCurrency(Number(val ?? 0));
                  else if (c.format === "date") display = fmtDate(val);
                  else display = val == null || val === "" ? "—" : String(val);
                  return (
                    <td
                      key={c.key}
                      className={`py-2 px-2 ${c.format === "currency" ? "text-right font-medium" : "text-left"} ${c.key === "title" || c.key === "owner" ? "font-medium" : ""}`}
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
              <tr className="border-t-2 font-semibold">
                {columns.map((c, i) => (
                  <td key={c.key} className={`py-2 px-2 ${c.format === "currency" ? "text-right" : ""}`}>
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

  // Series-based
  if (data.kind !== "series" || !data.series || data.series.length === 0 || (data.categories ?? []).length === 0) {
    return <EmptyState />;
  }

  const rows = toRows(data);
  const series = data.series;
  const multiSeries = series.length > 1;
  const yFmt = (v: number) =>
    format === "currency" ? `$${(v / 1000).toFixed(0)}k` : format === "days" ? `${Math.round(v)}d` : String(v);

  if (card.vizType === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="__cat" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFmt} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v, format)} />
          {multiSeries && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {series.map((s) => (
            <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const horizontal = card.vizType === "horizontalBar";
  const stacked = card.vizType === "stackedBar";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={rows}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 12, left: horizontal ? 8 : 8, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFmt} />
            <YAxis type="category" dataKey="__cat" width={110} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
          </>
        ) : (
          <>
            <XAxis dataKey="__cat" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval={0} angle={rows.length > 5 ? -20 : 0} textAnchor={rows.length > 5 ? "end" : "middle"} height={rows.length > 5 ? 50 : 30} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFmt} />
          </>
        )}
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v, format)} />
        {multiSeries && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s) => (
          <Bar
            key={s.name}
            dataKey={s.name}
            stackId={stacked ? "stack" : undefined}
            fill={s.color}
            radius={stacked ? [0, 0, 0, 0] : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          >
            {!multiSeries &&
              rows.map((_, i) => (
                <Cell key={i} fill={series[0].color} />
              ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
