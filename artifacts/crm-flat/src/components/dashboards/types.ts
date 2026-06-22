export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  order: number;
  builtin: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type VizType =
  | "kpi"
  | "gauge"
  | "bar"
  | "horizontalBar"
  | "groupedBar"
  | "stackedBar"
  | "line"
  | "table";

export type Dataset = "deals" | "activities" | "dealMoves";

export interface CardFilters {
  status?: "open" | "won" | "lost" | "any";
  stages?: string[];
  dateField?: "created" | "close" | "updated";
  period?: string;
  timeInStageMinDays?: number;
  closingWithinDays?: number;
  toStage?: string;
  types?: string[];
}

export interface CardConfig {
  metric?: string;
  metrics?: string[];
  dimension?: string;
  breakdown?: string;
  filters?: CardFilters;
  columns?: string[];
  sort?: { by?: string; dir?: "asc" | "desc" };
  info?: string;
  [k: string]: unknown;
}

export interface DashboardCard {
  id: string;
  dashboardId: string;
  title: string;
  vizType: VizType;
  dataset: Dataset;
  config: CardConfig;
  order: number;
  size: "sm" | "md" | "lg";
  cardHeight: number;
  createdAt: string;
  updatedAt: string;
}

export interface QueryResult {
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

export const VIZ_LABELS: Record<VizType, string> = {
  kpi: "KPI (single number)",
  gauge: "Gauge",
  bar: "Bar chart",
  horizontalBar: "Horizontal bar",
  groupedBar: "Grouped bar",
  stackedBar: "Stacked bar",
  line: "Line chart",
  table: "Table",
};

export const DATASET_LABELS: Record<Dataset, string> = {
  deals: "Deals",
  activities: "Activities",
  dealMoves: "Stage changes",
};

export const PERIOD_LABELS: Record<string, string> = {
  allTime: "All time",
  thisMonth: "This month",
  thisQuarter: "This quarter",
  thisYear: "This year",
  lastQuarter: "Last quarter",
  last30d: "Last 30 days",
  last6months: "Last 6 months",
  last12weeks: "Last 12 weeks",
};

export const METRIC_LABELS: Record<string, string> = {
  count: "Count",
  sumValue: "Total value",
  avgValue: "Average value",
  weightedForecast: "Weighted forecast",
  avgTimeInStage: "Avg time in stage",
};

export const DIMENSION_LABELS: Record<string, string> = {
  owner: "Owner",
  stage: "Stage",
  month: "Month",
  quarter: "Quarter",
  week: "Week",
  assignee: "Teammate",
  type: "Activity type",
  day: "Day",
  none: "None",
};
