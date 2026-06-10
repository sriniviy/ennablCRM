import { Router, type Request, type Response } from "express";
import {
  db,
  dealsTable,
  dealStagesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, gte, lte, not, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

function getRangeStart(range: string): Date | null {
  const now = new Date();
  if (range === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (range === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3, 1);
  }
  return null;
}

router.get("/pipeline", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo } = req.query as Record<string, string>;
    const dealConditions = [];
    if (dateFrom) dealConditions.push(gte(dealsTable.createdAt, new Date(dateFrom)));
    if (dateTo) dealConditions.push(lte(dealsTable.createdAt, new Date(dateTo)));
    const dealWhere = dealConditions.length > 0 ? and(...dealConditions) : undefined;

    const rows = await db
      .select({
        stageId: dealStagesTable.id,
        stageName: dealStagesTable.name,
        stageColor: dealStagesTable.color,
        stageOrder: dealStagesTable.order,
        dealCount: sql<number>`count(${dealsTable.id})::int`,
        totalValue: sql<number>`coalesce(sum(${dealsTable.value}), 0)::float`,
        avgValue: sql<number>`coalesce(avg(${dealsTable.value}), 0)::float`,
      })
      .from(dealStagesTable)
      .leftJoin(
        dealsTable,
        dealWhere
          ? and(eq(dealsTable.stageId, dealStagesTable.id), dealWhere)
          : eq(dealsTable.stageId, dealStagesTable.id),
      )
      .groupBy(
        dealStagesTable.id,
        dealStagesTable.name,
        dealStagesTable.color,
        dealStagesTable.order,
      )
      .orderBy(dealStagesTable.order);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to get pipeline report" });
  }
});

router.get("/win-loss", requireAuth, async (req: Request, res: Response) => {
  try {
    const { range = "month" } = req.query as Record<string, string>;
    const rangeStart = getRangeStart(range);

    const wonConditions = [eq(dealStagesTable.name, "Won")];
    const lostConditions = [eq(dealStagesTable.name, "Lost")];
    if (rangeStart) {
      wonConditions.push(gte(dealsTable.updatedAt, rangeStart));
      lostConditions.push(gte(dealsTable.updatedAt, rangeStart));
    }

    const [wonRows, lostRows] = await Promise.all([
      db
        .select({
          count: sql<number>`count(*)::int`,
          value: sql<number>`coalesce(sum(${dealsTable.value}), 0)::float`,
        })
        .from(dealsTable)
        .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(and(...wonConditions)),
      db
        .select({
          count: sql<number>`count(*)::int`,
          value: sql<number>`coalesce(sum(${dealsTable.value}), 0)::float`,
        })
        .from(dealsTable)
        .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(and(...lostConditions)),
    ]);

    const winRate =
      wonRows[0].count + lostRows[0].count > 0
        ? Math.round(
            (wonRows[0].count / (wonRows[0].count + lostRows[0].count)) * 100,
          )
        : 0;

    res.json({
      range,
      won: { count: wonRows[0].count, value: wonRows[0].value },
      lost: { count: lostRows[0].count, value: lostRows[0].value },
      winRate,
    });
  } catch {
    res.status(500).json({ error: "Failed to get win/loss report" });
  }
});

router.get("/forecast", requireAuth, async (_req: Request, res: Response) => {
  try {
    const [forecastRow, stageRows, assigneeRows] = await Promise.all([
      db
        .select({
          forecastValue: sql<number>`coalesce(sum(${dealsTable.value} * ${dealsTable.probability} / 100.0), 0)::float`,
          openDeals: sql<number>`count(*)::int`,
          totalPipelineValue: sql<number>`coalesce(sum(${dealsTable.value}), 0)::float`,
        })
        .from(dealsTable)
        .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(
          and(
            not(eq(dealStagesTable.name, "Won")),
            not(eq(dealStagesTable.name, "Lost")),
          ),
        ),
      db
        .select({
          stageName: dealStagesTable.name,
          stageOrder: dealStagesTable.order,
          dealCount: sql<number>`count(${dealsTable.id})::int`,
          weightedValue: sql<number>`coalesce(sum(${dealsTable.value} * ${dealsTable.probability} / 100.0), 0)::float`,
          rawValue: sql<number>`coalesce(sum(${dealsTable.value}), 0)::float`,
        })
        .from(dealStagesTable)
        .leftJoin(dealsTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(
          and(
            not(eq(dealStagesTable.name, "Won")),
            not(eq(dealStagesTable.name, "Lost")),
          ),
        )
        .groupBy(dealStagesTable.id, dealStagesTable.name, dealStagesTable.order)
        .orderBy(dealStagesTable.order),
      db
        .select({
          assigneeId: usersTable.id,
          assigneeName: usersTable.name,
          dealCount: sql<number>`count(${dealsTable.id})::int`,
          totalValue: sql<number>`coalesce(sum(${dealsTable.value}), 0)::float`,
          weightedValue: sql<number>`coalesce(sum(${dealsTable.value} * ${dealsTable.probability} / 100.0), 0)::float`,
        })
        .from(dealsTable)
        .innerJoin(usersTable, eq(dealsTable.assigneeId, usersTable.id))
        .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(
          and(
            not(eq(dealStagesTable.name, "Won")),
            not(eq(dealStagesTable.name, "Lost")),
          ),
        )
        .groupBy(usersTable.id, usersTable.name)
        .orderBy(desc(sql`sum(${dealsTable.value})`)),
    ]);

    res.json({
      forecastValue: forecastRow[0].forecastValue,
      openDeals: forecastRow[0].openDeals,
      totalPipelineValue: forecastRow[0].totalPipelineValue,
      stageBreakdown: stageRows,
      byAssignee: assigneeRows,
    });
  } catch {
    res.status(500).json({ error: "Failed to get forecast report" });
  }
});

router.get("/velocity", requireAuth, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        stageId: dealStagesTable.id,
        stageName: dealStagesTable.name,
        stageColor: dealStagesTable.color,
        stageOrder: dealStagesTable.order,
        dealCount: sql<number>`count(${dealsTable.id})::int`,
        avgDays: sql<number>`coalesce(avg(extract(epoch from (now() - ${dealsTable.createdAt})) / 86400), 0)::float`,
      })
      .from(dealStagesTable)
      .leftJoin(dealsTable, eq(dealsTable.stageId, dealStagesTable.id))
      .groupBy(
        dealStagesTable.id,
        dealStagesTable.name,
        dealStagesTable.color,
        dealStagesTable.order,
      )
      .orderBy(dealStagesTable.order);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to get velocity report" });
  }
});

router.get("/trend", requireAuth, async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        to_char(date_trunc('week', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS week,
        count(*)::int AS count,
        coalesce(sum(value), 0)::float AS total_value
      FROM deals
      WHERE created_at >= now() - interval '12 weeks'
      GROUP BY date_trunc('week', created_at AT TIME ZONE 'UTC')
      ORDER BY date_trunc('week', created_at AT TIME ZONE 'UTC')
    `);
    res.json(rows.rows);
  } catch {
    res.status(500).json({ error: "Failed to get trend report" });
  }
});

export default router;
