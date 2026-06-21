import { sql } from "drizzle-orm";
import { db } from "./index";
import { dashboardsTable, dashboardCardsTable } from "./schema/dashboards";
import { eq } from "drizzle-orm";

const MASTER_NAME = "Sales Dashboard (Master)";

type SeedCard = {
  title: string;
  vizType: string;
  dataset: string;
  size: "sm" | "md" | "lg";
  config: Record<string, unknown>;
};

const MASTER_CARDS: SeedCard[] = [
  {
    title: "Closed Won — This Quarter",
    vizType: "kpi",
    dataset: "deals",
    size: "sm",
    config: {
      metric: "sumValue",
      filters: { status: "won", dateField: "updated", period: "thisQuarter" },
      info: "Total value of deals won this quarter.",
    },
  },
  {
    title: "Open Pipeline",
    vizType: "kpi",
    dataset: "deals",
    size: "sm",
    config: {
      metric: "sumValue",
      filters: { status: "open", period: "allTime" },
      info: "Total value of all open deals.",
    },
  },
  {
    title: "Weighted Forecast — This Quarter",
    vizType: "gauge",
    dataset: "deals",
    size: "sm",
    config: {
      metric: "weightedForecast",
      filters: { status: "open", period: "allTime" },
      info: "Open pipeline value weighted by each deal's probability.",
    },
  },
  {
    title: "Closed Won by Owner — QoQ",
    vizType: "horizontalBar",
    dataset: "deals",
    size: "md",
    config: {
      metric: "sumValue",
      dimension: "owner",
      breakdown: "quarter",
      filters: { status: "won", dateField: "updated", period: "thisYear" },
      info: "Closed-won value per owner, split by quarter.",
    },
  },
  {
    title: "Open Pipeline by Stage",
    vizType: "groupedBar",
    dataset: "deals",
    size: "md",
    config: {
      metric: "sumValue",
      dimension: "stage",
      breakdown: "owner",
      filters: { status: "open", period: "allTime" },
      info: "Open pipeline value by stage, broken down by owner.",
    },
  },
  {
    title: "Deals Moved to Discovery — MoM (#)",
    vizType: "stackedBar",
    dataset: "dealMoves",
    size: "md",
    config: {
      metric: "count",
      dimension: "month",
      breakdown: "owner",
      filters: { toStage: "Discovery", period: "last6months" },
      info: "Count of deals that entered Discovery each month, by owner.",
    },
  },
  {
    title: "Deals Moved to Discovery — MoM ($)",
    vizType: "stackedBar",
    dataset: "dealMoves",
    size: "md",
    config: {
      metric: "sumValue",
      dimension: "month",
      breakdown: "owner",
      filters: { toStage: "Discovery", period: "last6months" },
      info: "Value of deals that entered Discovery each month, by owner.",
    },
  },
  {
    title: "Total Activities by Assignee",
    vizType: "stackedBar",
    dataset: "activities",
    size: "md",
    config: {
      metric: "count",
      dimension: "assignee",
      breakdown: "type",
      filters: { period: "thisQuarter" },
      info: "Activities logged per teammate this quarter, by type.",
    },
  },
  {
    title: "Activities — Last 30 Days (WoW)",
    vizType: "stackedBar",
    dataset: "activities",
    size: "md",
    config: {
      metric: "count",
      dimension: "week",
      breakdown: "assignee",
      filters: { period: "last30d", types: ["EMAIL_SENT", "CALL", "MEETING"] },
      info: "Emails, calls and meetings per week over the last 30 days.",
    },
  },
  {
    title: "Open Deals & Avg Deal by Owner",
    vizType: "groupedBar",
    dataset: "deals",
    size: "md",
    config: {
      metric: "multi",
      metrics: ["count", "avgValue", "sumValue"],
      dimension: "owner",
      filters: { status: "open", period: "allTime" },
      info: "Open deal count, average deal size and total amount per owner.",
    },
  },
  {
    title: "Avg Time in Stage — Late Stages",
    vizType: "bar",
    dataset: "deals",
    size: "md",
    config: {
      metric: "avgTimeInStage",
      dimension: "stage",
      filters: {
        status: "open",
        stages: ["Validation", "Proposal", "Proof of Concept", "Out for Signature"],
      },
      info: "Average days open deals have spent in each late-stage step.",
    },
  },
  {
    title: "Reality Check — Early-Stage Deals Closing in 14d",
    vizType: "table",
    dataset: "deals",
    size: "lg",
    config: {
      columns: ["owner", "closeDate", "value", "title", "stage"],
      filters: {
        status: "open",
        stages: ["Discovery", "Validation"],
        closingWithinDays: 14,
      },
      sort: { by: "closeDate", dir: "asc" },
      info: "Open early-stage deals with a close date in the next 14 days.",
    },
  },
  {
    title: "Deals Stuck in Stage (180d+)",
    vizType: "stackedBar",
    dataset: "deals",
    size: "md",
    config: {
      metric: "count",
      dimension: "owner",
      breakdown: "stage",
      filters: { status: "open", timeInStageMinDays: 180 },
      info: "Open deals that have sat in the same stage for 180+ days, by owner.",
    },
  },
  {
    title: "Deals by Owner",
    vizType: "bar",
    dataset: "deals",
    size: "md",
    config: {
      metric: "count",
      dimension: "owner",
      filters: { status: "open", period: "allTime" },
      info: "Number of open deals owned by each teammate.",
    },
  },
];

export async function seedDashboards(): Promise<void> {
  const existing = await db
    .select({ id: dashboardsTable.id })
    .from(dashboardsTable)
    .where(eq(dashboardsTable.name, MASTER_NAME))
    .limit(1);

  if (existing.length > 0) return;

  const maxOrderRow = await db
    .select({ max: sql<number>`coalesce(max(${dashboardsTable.order}), -1)::int` })
    .from(dashboardsTable);
  const nextOrder = (maxOrderRow[0]?.max ?? -1) + 1;

  const [master] = await db
    .insert(dashboardsTable)
    .values({
      name: MASTER_NAME,
      description: "Pre-built sales analytics across pipeline, activity and forecast.",
      order: nextOrder,
      builtin: false,
    })
    .returning();

  await db.insert(dashboardCardsTable).values(
    MASTER_CARDS.map((c, i) => ({
      dashboardId: master.id,
      title: c.title,
      vizType: c.vizType,
      dataset: c.dataset,
      config: c.config,
      order: i,
      size: c.size,
    })),
  );
}
