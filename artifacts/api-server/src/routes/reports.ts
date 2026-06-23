import { Router, type Request, type Response } from "express";
import {
  db,
  dealsTable,
  dealStagesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, gte, lte, not, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { openai } from "../lib/openai-client";

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

    const wonConditions = [eq(dealStagesTable.name, "Closed Won")];
    const lostConditions = [eq(dealStagesTable.name, "Closed Lost")];
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
            not(eq(dealStagesTable.name, "Closed Won")),
            not(eq(dealStagesTable.name, "Closed Lost")),
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
            not(eq(dealStagesTable.name, "Closed Won")),
            not(eq(dealStagesTable.name, "Closed Lost")),
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
            not(eq(dealStagesTable.name, "Closed Won")),
            not(eq(dealStagesTable.name, "Closed Lost")),
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

router.post("/ai-summary", requireAuth, async (_req: Request, res: Response) => {
  if (!openai) {
    res.status(503).json({ error: "AI not configured" });
    return;
  }
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

    const [pipelineRows, wonMonth, lostMonth, wonQtr, lostQtr, forecastRow, assigneeRows] = await Promise.all([
      db.select({
        stageName: dealStagesTable.name,
        stageOrder: dealStagesTable.order,
        dealCount: sql<number>`count(${dealsTable.id})::int`,
        totalValue: sql<number>`coalesce(sum(${dealsTable.value}), 0)::float`,
      })
        .from(dealStagesTable)
        .leftJoin(dealsTable, eq(dealsTable.stageId, dealStagesTable.id))
        .groupBy(dealStagesTable.id, dealStagesTable.name, dealStagesTable.order)
        .orderBy(dealStagesTable.order),

      db.select({ count: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${dealsTable.value}),0)::float` })
        .from(dealsTable).leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(and(eq(dealStagesTable.name, "Closed Won"), gte(dealsTable.updatedAt, monthStart))),

      db.select({ count: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${dealsTable.value}),0)::float` })
        .from(dealsTable).leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(and(eq(dealStagesTable.name, "Closed Lost"), gte(dealsTable.updatedAt, monthStart))),

      db.select({ count: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${dealsTable.value}),0)::float` })
        .from(dealsTable).leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(and(eq(dealStagesTable.name, "Closed Won"), gte(dealsTable.updatedAt, quarterStart))),

      db.select({ count: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${dealsTable.value}),0)::float` })
        .from(dealsTable).leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(and(eq(dealStagesTable.name, "Closed Lost"), gte(dealsTable.updatedAt, quarterStart))),

      db.select({
        forecastValue: sql<number>`coalesce(sum(${dealsTable.value} * ${dealsTable.probability} / 100.0),0)::float`,
        openDeals: sql<number>`count(*)::int`,
        totalPipelineValue: sql<number>`coalesce(sum(${dealsTable.value}),0)::float`,
      })
        .from(dealsTable).leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(and(not(eq(dealStagesTable.name, "Closed Won")), not(eq(dealStagesTable.name, "Closed Lost")))),

      db.select({
        name: usersTable.name,
        dealCount: sql<number>`count(${dealsTable.id})::int`,
        totalValue: sql<number>`coalesce(sum(${dealsTable.value}),0)::float`,
      })
        .from(dealsTable).innerJoin(usersTable, eq(dealsTable.assigneeId, usersTable.id))
        .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(and(not(eq(dealStagesTable.name, "Closed Won")), not(eq(dealStagesTable.name, "Closed Lost"))))
        .groupBy(usersTable.id, usersTable.name)
        .orderBy(desc(sql`sum(${dealsTable.value})`)),
    ]);

    const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;
    const pct = (w: number, l: number) => w + l > 0 ? `${Math.round(w / (w + l) * 100)}%` : "N/A";

    const lines = [
      `Today: ${now.toDateString()}`,
      "",
      "=== OPEN PIPELINE ===",
      ...pipelineRows
        .filter(r => !["Closed Won","Closed Lost","No Decisions"].includes(r.stageName))
        .map(r => `${r.stageName}: ${r.dealCount} deal${r.dealCount !== 1 ? "s" : ""}, ${fmt$(r.totalValue)}`),
      "",
      `Forecast revenue (probability-weighted): ${fmt$(forecastRow[0].forecastValue)}`,
      `Total open pipeline value: ${fmt$(forecastRow[0].totalPipelineValue)}`,
      `Open deals: ${forecastRow[0].openDeals}`,
      "",
      "=== CLOSED STAGES ===",
      ...pipelineRows
        .filter(r => ["Closed Won","Closed Lost","No Decisions"].includes(r.stageName))
        .map(r => `${r.stageName}: ${r.dealCount} deal${r.dealCount !== 1 ? "s" : ""}, ${fmt$(r.totalValue)}`),
      "",
      "=== WIN / LOSS (THIS MONTH) ===",
      `Won: ${wonMonth[0].count} deals, ${fmt$(wonMonth[0].value)}`,
      `Lost: ${lostMonth[0].count} deals, ${fmt$(lostMonth[0].value)}`,
      `Win rate this month: ${pct(wonMonth[0].count, lostMonth[0].count)}`,
      "",
      "=== WIN / LOSS (THIS QUARTER) ===",
      `Won: ${wonQtr[0].count} deals, ${fmt$(wonQtr[0].value)}`,
      `Lost: ${lostQtr[0].count} deals, ${fmt$(lostQtr[0].value)}`,
      `Win rate this quarter: ${pct(wonQtr[0].count, lostQtr[0].count)}`,
      "",
      "=== BY BROKER / ASSIGNEE ===",
      assigneeRows.length > 0
        ? assigneeRows.map(r => `${r.name}: ${r.dealCount} open deal${r.dealCount !== 1 ? "s" : ""}, ${fmt$(r.totalValue)}`).join("\n")
        : "No open deals assigned.",
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "You are a P&C and group-benefits insurance brokerage CRM analyst. " +
            "Given the pipeline metrics below, write a concise professional report summary for the broker principals. " +
            "First write 2-3 sentences covering overall pipeline health, revenue forecast, and win rate. " +
            "Then output exactly 3 specific, actionable items brokers should focus on to move deals forward or improve close rate. " +
            "Use this exact format with no markdown, no headings, no extra text:\n" +
            "<2-3 sentence summary>\n\nAction Items:\n• <action 1>\n• <action 2>\n• <action 3>",
        },
        { role: "user", content: lines.join("\n") },
      ],
    });

    const summary = completion.choices[0]?.message?.content?.trim();
    if (!summary) throw new Error("Empty response from AI");
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
