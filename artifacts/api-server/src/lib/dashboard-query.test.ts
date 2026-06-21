import { describe, it, expect, beforeAll, afterAll } from "vitest";

/*
 * Integration tests for the analytics query engine (runCardQuery).
 *
 * The engine runs raw SQL against unqualified table names (deals, deal_stages,
 * users, activities). To get deterministic results without touching real data we
 * create a dedicated Postgres schema and point the shared db pool at it via the
 * connection-string `search_path` option. The schema is created before the
 * engine module is imported (the pool reads DATABASE_URL at import time) and
 * dropped afterwards.
 */

const TEST_SCHEMA = "analytics_test";

type RunCardQuery = typeof import("./dashboard-query").runCardQuery;

let runCardQuery: RunCardQuery;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any;
let originalUrl: string | undefined;

async function createSchema() {
  await pool.query(`drop schema if exists ${TEST_SCHEMA} cascade`);
  await pool.query(`create schema ${TEST_SCHEMA}`);
  await pool.query(`
    create table deal_stages (
      id text primary key,
      name text not null,
      "order" integer not null default 0
    )`);
  await pool.query(`
    create table users (
      id text primary key,
      name text
    )`);
  await pool.query(`
    create table deals (
      id text primary key,
      title text not null,
      value double precision,
      probability integer default 50,
      close_date timestamptz,
      stage_id text,
      assignee_id text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await pool.query(`
    create table activities (
      id text primary key,
      type text not null,
      created_at timestamptz not null default now(),
      user_id text,
      deal_id text,
      metadata jsonb
    )`);
}

async function seed() {
  await pool.query(`
    insert into deal_stages (id, name, "order") values
      ('s_lead', 'Lead', 0),
      ('s_won', 'Won', 1)`);
  await pool.query(`
    insert into users (id, name) values
      ('u_alice', 'Alice'),
      ('u_bob', 'Bob')`);
  // Deals are inserted out of chronological order on purpose so the tests can
  // prove the engine sorts time dimensions chronologically, not by insertion.
  await pool.query(`
    insert into deals (id, title, value, probability, stage_id, assignee_id, created_at) values
      ('d1', 'Deal 1', 100, 50, 's_lead', 'u_alice', '2025-01-15T12:00:00Z'),
      ('d2', 'Deal 2', 200, 50, 's_lead', 'u_bob',   '2025-03-10T12:00:00Z'),
      ('d3', 'Deal 3', 300, 50, 's_lead', 'u_alice', '2025-02-20T12:00:00Z'),
      ('d4', 'Deal 4', 400, 50, 's_won',  'u_bob',   '2025-01-25T12:00:00Z')`);
  await pool.query(`
    insert into activities (id, type, deal_id, user_id, created_at, metadata) values
      ('a1', 'DEAL_MOVED', 'd2', 'u_bob',   '2025-03-10T12:00:00Z', '{"toStageName":"Won"}'),
      ('a2', 'DEAL_MOVED', 'd4', 'u_bob',   '2025-01-25T12:00:00Z', null),
      ('a3', 'NOTE',       'd1', 'u_alice', '2025-02-01T12:00:00Z', null)`);
}

/* Convenience: run a deals KPI and return the kpi payload. */
async function dealKpi(config: Record<string, unknown>) {
  const res = await runCardQuery({ vizType: "kpi", dataset: "deals", config });
  return res.kpi;
}

/* Convenience: count deals matching a filter set. */
async function dealCount(filters: Record<string, unknown>) {
  const res = await runCardQuery({
    vizType: "kpi",
    dataset: "deals",
    config: { metric: "count", filters },
  });
  return res.kpi?.value;
}

beforeAll(async () => {
  originalUrl = process.env.DATABASE_URL;
  if (!originalUrl) throw new Error("DATABASE_URL must be set for analytics tests");
  const url = new URL(originalUrl);
  url.searchParams.set("options", `-c search_path=${TEST_SCHEMA}`);
  process.env.DATABASE_URL = url.toString();

  // Import after rewriting DATABASE_URL so the pool binds to the test schema.
  const dbMod = await import("@workspace/db");
  pool = dbMod.pool;
  await createSchema();
  await seed();
  ({ runCardQuery } = await import("./dashboard-query"));
});

afterAll(async () => {
  if (pool) {
    await pool.query(`drop schema if exists ${TEST_SCHEMA} cascade`);
    await pool.end();
  }
  process.env.DATABASE_URL = originalUrl;
});

describe("runCardQuery — deals dataset", () => {
  it("kpi: returns a single count value with number format", async () => {
    const res = await runCardQuery({
      vizType: "kpi",
      dataset: "deals",
      config: { metric: "count" },
    });
    expect(res.kind).toBe("kpi");
    expect(res.kpi).toEqual({ value: 4, format: "number" });
  });

  it("kpi: sums deal value with currency format", async () => {
    const res = await runCardQuery({
      vizType: "kpi",
      dataset: "deals",
      config: { metric: "sumValue" },
    });
    expect(res.kind).toBe("kpi");
    expect(res.kpi).toEqual({ value: 1000, format: "currency" });
  });

  it("gauge: returns value, max and format", async () => {
    const res = await runCardQuery({
      vizType: "gauge",
      dataset: "deals",
      config: { metric: "sumValue" },
    });
    expect(res.kind).toBe("gauge");
    expect(res.gauge).toEqual({ value: 1000, max: 1000, format: "currency" });
  });

  it("table: returns columns, all rows and a total row", async () => {
    const res = await runCardQuery({
      vizType: "table",
      dataset: "deals",
      config: {},
    });
    expect(res.kind).toBe("table");
    expect(res.table?.columns.map((c) => c.key)).toEqual([
      "owner",
      "closeDate",
      "value",
      "title",
      "stage",
    ]);
    expect(res.table?.rows).toHaveLength(4);
    expect(res.table?.totalRow).toEqual({ value: 1000 });
  });

  it("series: groups by a non-time dimension (owner)", async () => {
    const res = await runCardQuery({
      vizType: "bar",
      dataset: "deals",
      config: { metric: "count", dimension: "owner" },
    });
    expect(res.kind).toBe("series");
    expect(res.categories).toEqual(["Alice", "Bob"]);
    expect(res.series).toHaveLength(1);
    expect(res.series?.[0].data).toEqual([2, 2]);
    expect(res.valueFormat).toBe("number");
  });

  it("series: orders a time dimension chronologically, not by insertion", async () => {
    const res = await runCardQuery({
      vizType: "line",
      dataset: "deals",
      config: { metric: "count", dimension: "month" },
    });
    expect(res.kind).toBe("series");
    // Jan (d1,d4)=2, Feb (d3)=1, Mar (d2)=1 — chronological despite insert order.
    expect(res.categories).toEqual(["Jan 2025", "Feb 2025", "Mar 2025"]);
    expect(res.series?.[0].data).toEqual([2, 1, 1]);
  });

  it("series: time dimension × breakdown keeps chronological categories", async () => {
    const res = await runCardQuery({
      vizType: "bar",
      dataset: "deals",
      config: { metric: "count", dimension: "month", breakdown: "owner" },
    });
    expect(res.kind).toBe("series");
    expect(res.categories).toEqual(["Jan 2025", "Feb 2025", "Mar 2025"]);
    const byName = Object.fromEntries(
      (res.series ?? []).map((s) => [s.name, s.data]),
    );
    expect(byName["Alice"]).toEqual([1, 1, 0]);
    expect(byName["Bob"]).toEqual([1, 0, 1]);
  });
});

describe("runCardQuery — remaining deal metrics", () => {
  it("kpi: avgValue averages deal value with currency format", async () => {
    // (100 + 200 + 300 + 400) / 4 = 250
    expect(await dealKpi({ metric: "avgValue" })).toEqual({
      value: 250,
      format: "currency",
    });
  });

  it("kpi: weightedForecast sums value × probability/100 with currency format", async () => {
    // each deal: value × 50/100 → 50 + 100 + 150 + 200 = 500
    expect(await dealKpi({ metric: "weightedForecast" })).toEqual({
      value: 500,
      format: "currency",
    });
  });

  it("kpi: avgTimeInStage returns a positive day count with days format", async () => {
    const kpi = await dealKpi({ metric: "avgTimeInStage" });
    expect(kpi?.format).toBe("days");
    // updated_at defaults to now() at seed time, so this is small but > 0.
    expect(kpi?.value).toBeGreaterThan(0);
  });

  it("series: multi-metric grouped bar emits one series per metric by dimension", async () => {
    const res = await runCardQuery({
      vizType: "bar",
      dataset: "deals",
      config: {
        metric: "multi",
        metrics: ["count", "avgValue", "sumValue"],
        dimension: "owner",
      },
    });
    expect(res.kind).toBe("series");
    expect(res.categories).toEqual(["Alice", "Bob"]);
    const byKey = Object.fromEntries((res.series ?? []).map((s) => [s.key, s.data]));
    // Alice: d1(100), d3(300) → count 2, avg 200, sum 400
    // Bob:   d2(200), d4(400) → count 2, avg 300, sum 600
    expect(byKey["count"]).toEqual([2, 2]);
    expect(byKey["avgValue"]).toEqual([200, 300]);
    expect(byKey["sumValue"]).toEqual([400, 600]);
    expect(res.valueFormat).toBe("number");
  });
});

describe("buildDealWhere — deterministic filters", () => {
  it("status open excludes Won/Lost stages", async () => {
    // d1, d2, d3 are in Lead; d4 is Won.
    expect(await dealCount({ status: "open" })).toBe(3);
  });

  it("status won keeps only the Won stage", async () => {
    expect(await dealCount({ status: "won" })).toBe(1);
  });

  it("status lost matches nothing when no Lost deals exist", async () => {
    expect(await dealCount({ status: "lost" })).toBe(0);
  });

  it("stages filters by an explicit stage-name list", async () => {
    expect(await dealCount({ stages: ["Won"] })).toBe(1);
    expect(await dealCount({ stages: ["Lead"] })).toBe(3);
    expect(await dealCount({ stages: ["Lead", "Won"] })).toBe(4);
  });

  it("dateFrom keeps deals created on/after the bound (created field)", async () => {
    // d2 (Mar 10) and d3 (Feb 20) are on/after Feb 1; d1/d4 (Jan) are not.
    expect(await dealCount({ dateFrom: "2025-02-01T00:00:00Z" })).toBe(2);
  });

  it("dateTo keeps deals created on/before the bound", async () => {
    // d1 (Jan 15) and d4 (Jan 25) are on/before Feb 1.
    expect(await dealCount({ dateTo: "2025-02-01T00:00:00Z" })).toBe(2);
  });

  it("dateFrom + dateTo bound a window", async () => {
    // Only d3 (Feb 20) falls in [Feb 1, Mar 1).
    expect(
      await dealCount({
        dateFrom: "2025-02-01T00:00:00Z",
        dateTo: "2025-03-01T00:00:00Z",
      }),
    ).toBe(1);
  });

  it("owners filters by assignee id list", async () => {
    expect(await dealCount({ owners: ["u_alice"] })).toBe(2);
    expect(await dealCount({ owners: ["u_bob"] })).toBe(2);
    expect(await dealCount({ owners: ["u_alice", "u_bob"] })).toBe(4);
  });
});

describe("buildDealWhere — time-relative filters", () => {
  // These filters compare against now(), so seed rows with dates anchored to the
  // current clock. They are inserted only for this block and removed afterwards.
  beforeAll(async () => {
    // updated_at drives time-in-stage; set distinct ages so the horizon is clear.
    await pool.query(`
      insert into deals (id, title, value, probability, stage_id, assignee_id, created_at, updated_at, close_date) values
        ('d_recent', 'Recent', 100, 50, 's_lead', 'u_alice', now(), now() - interval '2 days', now() + interval '5 days'),
        ('d_old',    'Old',    100, 50, 's_lead', 'u_alice', now() - interval '400 days', now() - interval '20 days', now() + interval '100 days')`);
  });

  afterAll(async () => {
    await pool.query(`delete from deals where id in ('d_recent', 'd_old')`);
  });

  it("period allTime applies no date bound (all deals incl. seed)", async () => {
    // 4 seed deals + 2 inserted here = 6
    expect(await dealCount({ period: "allTime" })).toBe(6);
  });

  it("period last30d keeps only recently-created deals", async () => {
    // Seed deals (2025) and d_old (400d ago) fall outside the 30-day window.
    expect(await dealCount({ period: "last30d" })).toBe(1);
  });

  it("closingWithinDays keeps deals with a close_date inside the horizon", async () => {
    // d_recent closes in 5 days; d_old closes in 100 days; seed deals have none.
    expect(await dealCount({ closingWithinDays: 30 })).toBe(1);
    expect(await dealCount({ closingWithinDays: 200 })).toBe(2);
  });

  it("timeInStageMinDays keeps deals older than the threshold (by updated_at)", async () => {
    // d_recent updated 2d ago, d_old updated 20d ago; seed deals were updated
    // at seed time (~now), so they fall under any positive threshold.
    expect(await dealCount({ timeInStageMinDays: 10 })).toBe(1); // only d_old
    expect(await dealCount({ timeInStageMinDays: 1 })).toBe(2); // d_recent + d_old
  });
});

describe("runCardQuery — activities dataset", () => {
  it("kpi: counts all activities", async () => {
    const res = await runCardQuery({
      vizType: "kpi",
      dataset: "activities",
      config: {},
    });
    expect(res.kind).toBe("kpi");
    expect(res.kpi).toEqual({ value: 3, format: "number" });
  });
});

describe("runCardQuery — dealMoves dataset", () => {
  it("series: counts DEAL_MOVED activities by month, chronologically", async () => {
    const res = await runCardQuery({
      vizType: "line",
      dataset: "dealMoves",
      config: { metric: "count", dimension: "month" },
    });
    expect(res.kind).toBe("series");
    // Only the two DEAL_MOVED rows: Jan (a2)=1, Mar (a1)=1.
    expect(res.categories).toEqual(["Jan 2025", "Mar 2025"]);
    expect(res.series?.[0].data).toEqual([1, 1]);
  });
});
