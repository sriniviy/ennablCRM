import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/*
 * Generic analytics engine for dashboard cards.
 *
 * A card is described by { vizType, dataset, config }. This module resolves it
 * into a normalized, chart-ready response so the frontend renderer stays simple.
 *
 * Datasets:
 *   - deals       : the deals table (joined to stages + owners)
 *   - activities  : the activities table (joined to users)
 *   - dealMoves   : DEAL_MOVED activities joined to deals (stage-transition history)
 *
 * Stage-transition note: DEAL_MOVED activity metadata may carry { toStageName }.
 * When absent we fall back to the deal's current stage. "Time in stage" is
 * approximated by now() - deals.updated_at (a stage change touches updated_at),
 * falling back to created_at.
 */

const CHART_COLORS = [
  "#0ea5e9",
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#84cc16",
];

type Period =
  | "thisMonth"
  | "thisQuarter"
  | "thisYear"
  | "lastQuarter"
  | "last30d"
  | "last6months"
  | "last12weeks"
  | "allTime";

interface Filters {
  status?: "open" | "won" | "lost" | "any";
  stages?: string[];
  dateField?: "created" | "close" | "updated";
  period?: Period;
  dateFrom?: string;
  dateTo?: string;
  timeInStageMinDays?: number;
  closingWithinDays?: number;
  toStage?: string;
  types?: string[];
  owners?: string[];
}

interface CardConfig {
  metric?: string;
  metrics?: string[];
  dimension?: string;
  breakdown?: string;
  filters?: Filters;
  columns?: string[];
  sort?: { by?: string; dir?: "asc" | "desc" };
  [k: string]: unknown;
}

interface CardQuery {
  vizType: string;
  dataset: string;
  config: CardConfig;
}

interface NormalizedResult {
  kind: "series" | "kpi" | "gauge" | "table" | "empty";
  valueFormat?: "currency" | "number" | "days";
  categories?: string[];
  series?: { key: string; name: string; color: string; data: number[] }[];
  kpi?: { value: number; format: string };
  gauge?: { value: number; max: number; format: string };
  table?: {
    columns: { key: string; label: string; format?: string }[];
    rows: Record<string, unknown>[];
    totalRow?: Record<string, unknown>;
  };
}

function periodStart(period: Period | undefined): Date | null {
  const now = new Date();
  switch (period) {
    case "thisMonth":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "thisQuarter":
      return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    case "thisYear":
      return new Date(now.getFullYear(), 0, 1);
    case "lastQuarter": {
      const q = Math.floor(now.getMonth() / 3);
      return new Date(now.getFullYear(), (q - 1) * 3, 1);
    }
    case "last30d":
      return new Date(now.getTime() - 30 * 86400_000);
    case "last6months":
      return new Date(now.getFullYear(), now.getMonth() - 5, 1);
    case "last12weeks":
      return new Date(now.getTime() - 12 * 7 * 86400_000);
    default:
      return null;
  }
}

const DEAL_DATE_COL: Record<string, string> = {
  created: "d.created_at",
  close: "d.close_date",
  updated: "d.updated_at",
};

function metricFormat(metric: string | undefined): "currency" | "number" | "days" {
  if (metric === "sumValue" || metric === "avgValue" || metric === "weightedForecast")
    return "currency";
  if (metric === "avgTimeInStage") return "days";
  return "number";
}

/* Build the SQL aggregate expression for a metric over the deals alias `d`. */
function dealMetricExpr(metric: string): ReturnType<typeof sql> {
  switch (metric) {
    case "sumValue":
      return sql`coalesce(sum(d.value), 0)::float`;
    case "avgValue":
      return sql`coalesce(avg(d.value), 0)::float`;
    case "weightedForecast":
      return sql`coalesce(sum(d.value * d.probability / 100.0), 0)::float`;
    case "avgTimeInStage":
      return sql`coalesce(avg(extract(epoch from (now() - coalesce(d.updated_at, d.created_at))) / 86400), 0)::float`;
    case "count":
    default:
      return sql`count(d.id)::int`;
  }
}

/* Dimension/breakdown SQL fragment (plain strings) for deals.
 * `dateCol` is the chosen deal date column for time-based dimensions. */
function dealGroupSql(dim: string, dateCol: string): { label: string; order: string } {
  switch (dim) {
    case "owner":
      return {
        label: "coalesce(u.name, 'Unassigned')",
        order: "coalesce(u.name, 'Unassigned')",
      };
    case "stage":
      return { label: "s.name", order: `min(s."order")::text` };
    case "month":
      return {
        label: `to_char(date_trunc('month', ${dateCol}), 'Mon YYYY')`,
        order: `min(date_trunc('month', ${dateCol}))::text`,
      };
    case "quarter":
      return {
        label: `'Q' || extract(quarter from ${dateCol}) || ' ' || extract(year from ${dateCol})`,
        order: `min(date_trunc('quarter', ${dateCol}))::text`,
      };
    case "week":
      return {
        label: `to_char(date_trunc('week', ${dateCol}), 'Mon DD')`,
        order: `min(date_trunc('week', ${dateCol}))::text`,
      };
    default:
      return { label: "'All'", order: "'0'" };
  }
}

function buildDealWhere(filters: Filters): ReturnType<typeof sql>[] {
  const conds: ReturnType<typeof sql>[] = [];
  if (filters.status === "open") {
    conds.push(sql`s.name not in ('Closed Won','Closed Lost','No Decisions')`);
  } else if (filters.status === "won") {
    conds.push(sql`s.name = 'Closed Won'`);
  } else if (filters.status === "lost") {
    conds.push(sql`s.name = 'Closed Lost'`);
  }
  if (filters.stages && filters.stages.length > 0) {
    conds.push(inList(sql`s.name`, filters.stages));
  }
  const dateCol = DEAL_DATE_COL[filters.dateField ?? "created"];
  const start = periodStart(filters.period);
  if (start) conds.push(sql`${sql.raw(dateCol)} >= ${start.toISOString()}`);
  if (filters.dateFrom) conds.push(sql`${sql.raw(dateCol)} >= ${filters.dateFrom}`);
  if (filters.dateTo) conds.push(sql`${sql.raw(dateCol)} <= ${filters.dateTo}`);
  if (typeof filters.timeInStageMinDays === "number") {
    conds.push(
      sql`extract(epoch from (now() - coalesce(d.updated_at, d.created_at))) / 86400 >= ${filters.timeInStageMinDays}`,
    );
  }
  if (typeof filters.closingWithinDays === "number") {
    conds.push(sql`d.close_date is not null`);
    conds.push(sql`d.close_date >= now()`);
    conds.push(
      sql`d.close_date <= now() + (${filters.closingWithinDays} * interval '1 day')`,
    );
  }
  if (filters.owners && filters.owners.length > 0) {
    conds.push(inList(sql`d.assignee_id`, filters.owners));
  }
  return conds;
}

/* `expr IN (v1, v2, ...)` built safely from a JS array (parameterized). */
function inList(
  expr: ReturnType<typeof sql>,
  values: string[],
): ReturnType<typeof sql> {
  return sql`${expr} in (${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )})`;
}

function whereClause(conds: ReturnType<typeof sql>[]): ReturnType<typeof sql> {
  if (conds.length === 0) return sql``;
  let acc = sql`where ${conds[0]}`;
  for (let i = 1; i < conds.length; i++) acc = sql`${acc} and ${conds[i]}`;
  return acc;
}

function pivot(
  rows: { cat: string; series: string; value: number; catOrder: number; seriesOrder: number }[],
  hasBreakdown: boolean,
): { categories: string[]; series: NormalizedResult["series"] } {
  const catMap = new Map<string, number>();
  const seriesMap = new Map<string, number>();
  for (const r of rows) {
    if (!catMap.has(r.cat)) catMap.set(r.cat, r.catOrder);
    if (!seriesMap.has(r.series)) seriesMap.set(r.series, r.seriesOrder);
  }
  const categories = [...catMap.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([c]) => c);
  const seriesNames = [...seriesMap.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([s]) => s);

  const catIndex = new Map(categories.map((c, i) => [c, i]));
  const series = seriesNames.map((name, si) => {
    const data = new Array(categories.length).fill(0);
    for (const r of rows) {
      if (r.series === name) data[catIndex.get(r.cat) ?? 0] = r.value;
    }
    return {
      key: hasBreakdown ? name : "value",
      name: hasBreakdown ? name : "Value",
      color: CHART_COLORS[si % CHART_COLORS.length],
      data,
    };
  });
  return { categories, series };
}

/* ─────────────── Deals dataset ─────────────── */

async function queryDeals(q: CardQuery): Promise<NormalizedResult> {
  const cfg = q.config;
  const filters = cfg.filters ?? {};
  const dateCol = DEAL_DATE_COL[filters.dateField ?? "created"];
  const conds = buildDealWhere(filters);
  const where = whereClause(conds);

  // KPI / gauge — single aggregate, no grouping.
  if (q.vizType === "kpi" || q.vizType === "gauge") {
    const metric = cfg.metric ?? "count";
    const expr = dealMetricExpr(metric);
    const result = await db.execute(sql`
      select ${expr} as v
      from deals d
      left join deal_stages s on d.stage_id = s.id
      left join users u on d.assignee_id = u.id
      ${where}
    `);
    const v = Number((result.rows[0] as { v: number })?.v ?? 0);
    if (q.vizType === "gauge") {
      const totalRes = await db.execute(sql`
        select coalesce(sum(d.value), 0)::float as v
        from deals d
        left join deal_stages s on d.stage_id = s.id
        left join users u on d.assignee_id = u.id
        ${where}
      `);
      const total = Number((totalRes.rows[0] as { v: number })?.v ?? 0);
      return {
        kind: "gauge",
        gauge: { value: v, max: Math.max(total, v, 1), format: metricFormat(metric) },
      };
    }
    return { kind: "kpi", kpi: { value: v, format: metricFormat(metric) } };
  }

  // Table — Reality Check style.
  if (q.vizType === "table") {
    const columns = cfg.columns ?? ["owner", "closeDate", "value", "title", "stage"];
    const sortBy = cfg.sort?.by ?? "closeDate";
    const sortCol =
      sortBy === "value"
        ? sql`d.value`
        : sortBy === "closeDate"
          ? sql`d.close_date`
          : sql`d.created_at`;
    const sortDir = cfg.sort?.dir === "desc" ? sql`desc` : sql`asc`;
    const result = await db.execute(sql`
      select
        d.id as id,
        d.title as title,
        d.value as value,
        d.close_date as "closeDate",
        coalesce(u.name, 'Unassigned') as owner,
        s.name as stage
      from deals d
      left join deal_stages s on d.stage_id = s.id
      left join users u on d.assignee_id = u.id
      ${where}
      order by ${sortCol} ${sortDir} nulls last
      limit 200
    `);
    const rows = result.rows as Record<string, unknown>[];
    const colMeta: Record<string, { label: string; format?: string }> = {
      owner: { label: "Owner" },
      closeDate: { label: "Close Date", format: "date" },
      value: { label: "Amount", format: "currency" },
      title: { label: "Deal" },
      stage: { label: "Stage" },
    };
    const total = rows.reduce((acc, r) => acc + Number(r.value ?? 0), 0);
    return {
      kind: "table",
      table: {
        columns: columns.map((c) => ({
          key: c,
          label: colMeta[c]?.label ?? c,
          format: colMeta[c]?.format,
        })),
        rows,
        totalRow: { value: total },
      },
    };
  }

  // Multi-metric grouped bar (count + avg + sum by dimension).
  if (cfg.metric === "multi" && cfg.metrics) {
    const dim = cfg.dimension ?? "owner";
    const g = dealGroupSql(dim, dateCol);
    const labelExpr = sql.raw(g.label);
    const orderExpr = sql.raw(g.order);
    const result = await db.execute(sql`
      select
        ${labelExpr} as cat,
        ${orderExpr} as cat_order,
        count(d.id)::int as count,
        coalesce(avg(d.value), 0)::float as "avgValue",
        coalesce(sum(d.value), 0)::float as "sumValue"
      from deals d
      left join deal_stages s on d.stage_id = s.id
      left join users u on d.assignee_id = u.id
      ${where}
      group by 1
      order by 2
    `);
    const rows = result.rows as Record<string, number | string>[];
    const categories = rows.map((r) => String(r.cat));
    const metricLabels: Record<string, string> = {
      count: "Open Deals",
      avgValue: "Avg Deal",
      sumValue: "Total Amount",
    };
    const series = cfg.metrics.map((m, i) => ({
      key: m,
      name: metricLabels[m] ?? m,
      color: CHART_COLORS[i % CHART_COLORS.length],
      data: rows.map((r) => Number(r[m] ?? 0)),
    }));
    return { kind: "series", categories, series, valueFormat: "number" };
  }

  // Standard series: dimension (× breakdown) aggregated by metric.
  const metric = cfg.metric ?? "count";
  const dim = cfg.dimension ?? "owner";
  const breakdown = cfg.breakdown;
  const expr = dealMetricExpr(metric);
  const dimG = dealGroupSql(dim, dateCol);
  const dimLabel = sql.raw(dimG.label);
  const dimOrder = sql.raw(dimG.order);

  if (breakdown) {
    const brkG = dealGroupSql(breakdown, dateCol);
    const brkLabel = sql.raw(brkG.label);
    const result = await db.execute(sql`
      select
        ${dimLabel} as cat,
        ${dimOrder} as cat_order,
        ${brkLabel} as series,
        ${expr} as value
      from deals d
      left join deal_stages s on d.stage_id = s.id
      left join users u on d.assignee_id = u.id
      ${where}
      group by 1, 3
      order by 2
    `);
    // SQL already orders rows by cat_order; preserve that order by index
    // (cat_order can be a timestamp string for time dimensions, so Number() is unsafe).
    const seen: string[] = [];
    for (const r of result.rows as Record<string, unknown>[]) {
      const c = String(r.cat);
      if (!seen.includes(c)) seen.push(c);
    }
    const rows = (result.rows as Record<string, unknown>[]).map((r) => ({
      cat: String(r.cat),
      series: String(r.series),
      value: Number(r.value ?? 0),
      catOrder: seen.indexOf(String(r.cat)),
      seriesOrder: 0,
    }));
    const { categories, series } = pivot(rows, true);
    return { kind: "series", categories, series, valueFormat: metricFormat(metric) };
  }

  const result = await db.execute(sql`
    select
      ${dimLabel} as cat,
      ${dimOrder} as cat_order,
      ${expr} as value
    from deals d
    left join deal_stages s on d.stage_id = s.id
    left join users u on d.assignee_id = u.id
    ${where}
    group by 1
    order by 2
  `);
  const rows = (result.rows as Record<string, unknown>[]).map((r, i) => ({
    cat: String(r.cat),
    series: "Value",
    value: Number(r.value ?? 0),
    catOrder: i,
    seriesOrder: 0,
  }));
  const { categories, series } = pivot(rows, false);
  return { kind: "series", categories, series, valueFormat: metricFormat(metric) };
}

/* ─────────────── Activities dataset ─────────────── */

function activityGroupSql(dim: string): { label: string; order: string } {
  switch (dim) {
    case "assignee":
      return { label: "coalesce(u.name, 'Unassigned')", order: "coalesce(u.name, 'Unassigned')" };
    case "type":
      return { label: "a.type::text", order: "a.type::text" };
    case "month":
      return {
        label: "to_char(date_trunc('month', a.created_at), 'Mon YYYY')",
        order: "min(date_trunc('month', a.created_at))::text",
      };
    case "week":
      return {
        label: "to_char(date_trunc('week', a.created_at), 'Mon DD')",
        order: "min(date_trunc('week', a.created_at))::text",
      };
    case "day":
      return {
        label: "to_char(date_trunc('day', a.created_at), 'Mon DD')",
        order: "min(date_trunc('day', a.created_at))::text",
      };
    default:
      return { label: "'All'", order: "'0'" };
  }
}

async function queryActivities(q: CardQuery): Promise<NormalizedResult> {
  const cfg = q.config;
  const filters = cfg.filters ?? {};
  const conds: ReturnType<typeof sql>[] = [];
  const start = periodStart(filters.period);
  if (start) conds.push(sql`a.created_at >= ${start.toISOString()}`);
  if (filters.dateFrom) conds.push(sql`a.created_at >= ${filters.dateFrom}`);
  if (filters.dateTo) conds.push(sql`a.created_at <= ${filters.dateTo}`);
  if (filters.types && filters.types.length > 0) {
    conds.push(inList(sql`a.type::text`, filters.types));
  }
  const where = whereClause(conds);

  if (q.vizType === "kpi") {
    const result = await db.execute(sql`
      select count(a.id)::int as v
      from activities a
      left join users u on a.user_id = u.id
      ${where}
    `);
    return {
      kind: "kpi",
      kpi: { value: Number((result.rows[0] as { v: number })?.v ?? 0), format: "number" },
    };
  }

  const dim = cfg.dimension ?? "assignee";
  const breakdown = cfg.breakdown;
  const dimG = activityGroupSql(dim);

  if (breakdown) {
    const brkG = activityGroupSql(breakdown);
    const result = await db.execute(sql`
      select
        ${sql.raw(dimG.label)} as cat,
        ${sql.raw(dimG.order)} as cat_order,
        ${sql.raw(brkG.label)} as series,
        count(a.id)::int as value
      from activities a
      left join users u on a.user_id = u.id
      ${where}
      group by 1, 3
      order by 2
    `);
    const rows = (result.rows as Record<string, unknown>[]).map((r) => ({
      cat: String(r.cat),
      series: String(r.series),
      value: Number(r.value ?? 0),
      catOrder: 0,
      seriesOrder: 0,
    }));
    // Preserve SQL order for categories.
    const seen: string[] = [];
    for (const r of result.rows as Record<string, unknown>[]) {
      const c = String(r.cat);
      if (!seen.includes(c)) seen.push(c);
    }
    rows.forEach((r) => (r.catOrder = seen.indexOf(r.cat)));
    const { categories, series } = pivot(rows, true);
    return { kind: "series", categories, series, valueFormat: "number" };
  }

  const result = await db.execute(sql`
    select
      ${sql.raw(dimG.label)} as cat,
      ${sql.raw(dimG.order)} as cat_order,
      count(a.id)::int as value
    from activities a
    left join users u on a.user_id = u.id
    ${where}
    group by 1
    order by 2
  `);
  const rows = (result.rows as Record<string, unknown>[]).map((r, i) => ({
    cat: String(r.cat),
    series: "Value",
    value: Number(r.value ?? 0),
    catOrder: i,
    seriesOrder: 0,
  }));
  const { categories, series } = pivot(rows, false);
  return { kind: "series", categories, series, valueFormat: "number" };
}

/* ─────────────── Deal moves dataset (stage transitions) ─────────────── */

async function queryDealMoves(q: CardQuery): Promise<NormalizedResult> {
  const cfg = q.config;
  const filters = cfg.filters ?? {};
  const metric = cfg.metric ?? "count";
  const conds: ReturnType<typeof sql>[] = [sql`a.type = 'DEAL_MOVED'`];
  const start = periodStart(filters.period);
  if (start) conds.push(sql`a.created_at >= ${start.toISOString()}`);
  if (filters.toStage) {
    conds.push(
      sql`coalesce(a.metadata->>'toStageName', s.name) = ${filters.toStage}`,
    );
  }
  const where = whereClause(conds);
  const valueExpr =
    metric === "sumValue"
      ? sql`coalesce(sum(d.value), 0)::float`
      : sql`count(a.id)::int`;

  const dim = cfg.dimension ?? "month";
  const breakdown = cfg.breakdown;
  const dimLabel =
    dim === "week"
      ? "to_char(date_trunc('week', a.created_at), 'Mon DD')"
      : "to_char(date_trunc('month', a.created_at), 'Mon YYYY')";
  const dimOrder =
    dim === "week"
      ? "min(date_trunc('week', a.created_at))::text"
      : "min(date_trunc('month', a.created_at))::text";

  if (breakdown === "owner") {
    const result = await db.execute(sql`
      select
        ${sql.raw(dimLabel)} as cat,
        ${sql.raw(dimOrder)} as cat_order,
        coalesce(u.name, 'Unassigned') as series,
        ${valueExpr} as value
      from activities a
      left join deals d on a.deal_id = d.id
      left join deal_stages s on d.stage_id = s.id
      left join users u on coalesce(a.user_id, d.assignee_id) = u.id
      ${where}
      group by 1, 3
      order by 2
    `);
    const seen: string[] = [];
    for (const r of result.rows as Record<string, unknown>[]) {
      const c = String(r.cat);
      if (!seen.includes(c)) seen.push(c);
    }
    const rows = (result.rows as Record<string, unknown>[]).map((r) => ({
      cat: String(r.cat),
      series: String(r.series),
      value: Number(r.value ?? 0),
      catOrder: seen.indexOf(String(r.cat)),
      seriesOrder: 0,
    }));
    const { categories, series } = pivot(rows, true);
    return { kind: "series", categories, series, valueFormat: metricFormat(metric) };
  }

  const result = await db.execute(sql`
    select
      ${sql.raw(dimLabel)} as cat,
      ${sql.raw(dimOrder)} as cat_order,
      ${valueExpr} as value
    from activities a
    left join deals d on a.deal_id = d.id
    left join deal_stages s on d.stage_id = s.id
    ${where}
    group by 1
    order by 2
  `);
  const rows = (result.rows as Record<string, unknown>[]).map((r, i) => ({
    cat: String(r.cat),
    series: "Value",
    value: Number(r.value ?? 0),
    catOrder: i,
    seriesOrder: 0,
  }));
  const { categories, series } = pivot(rows, false);
  return { kind: "series", categories, series, valueFormat: metricFormat(metric) };
}

export async function runCardQuery(q: CardQuery): Promise<NormalizedResult> {
  if (q.dataset === "activities") return queryActivities(q);
  if (q.dataset === "dealMoves") return queryDealMoves(q);
  return queryDeals(q);
}
