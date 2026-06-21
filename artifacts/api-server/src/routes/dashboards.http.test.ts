import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/*
 * HTTP-level (request/response) tests for the dashboard permission rules.
 *
 * The shared decision function `authorizeMutation` is unit-tested in
 * `dashboards.authz.test.ts`. Those tests prove the *rules* are correct but do
 * not prove every route is actually *wired* to them — a handler could forget to
 * call the check, or read the wrong field off the request. These tests drive the
 * real Express router over HTTP so a wiring mistake surfaces as a wrong status
 * code.
 *
 * Isolation follows the pattern in `lib/dashboard-query.test.ts`: a dedicated
 * Postgres schema is created and the shared db pool is pointed at it via the
 * connection-string `search_path` before the route module is imported (the pool
 * reads DATABASE_URL at import time). Better Auth is mocked so we can inject a
 * member / admin / owner identity per request without real sessions.
 */

const TEST_SCHEMA = "dashboards_authz_test";

// Hoisted so the vi.mock factory below can close over it.
const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

// Replace Better Auth entirely: requireAuth only needs `auth.api.getSession`,
// and mocking the module avoids pulling the real auth/db wiring into the test.
vi.mock("../lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));

type TestUser = { id: string; authId: string; email: string };

const owner: TestUser = {
  id: "u_owner",
  authId: "auth_owner",
  email: "owner@example.com",
};
const stranger: TestUser = {
  id: "u_stranger",
  authId: "auth_stranger",
  email: "stranger@example.com",
};
const adminUser: TestUser = {
  id: "u_admin",
  authId: "auth_admin",
  email: "admin@example.com",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any;
let server: Server;
let baseUrl: string;
let originalUrl: string | undefined;

async function createSchema() {
  await pool.query(`drop schema if exists ${TEST_SCHEMA} cascade`);
  await pool.query(`create schema ${TEST_SCHEMA}`);
  await pool.query(`
    create table users (
      id text primary key,
      auth_id text unique,
      clerk_id text unique,
      email text not null unique,
      name text,
      avatar_url text,
      role text not null default 'MEMBER',
      status text not null default 'ACTIVE',
      tags text[] not null default '{}',
      insurance_groups text[] not null default '{}',
      title text,
      phone text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await pool.query(`
    create table dashboards (
      id text primary key,
      name text not null,
      description text,
      "order" integer not null default 0,
      builtin boolean not null default false,
      created_by text references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await pool.query(`
    create table dashboard_cards (
      id text primary key,
      dashboard_id text not null references dashboards(id) on delete cascade,
      title text not null,
      viz_type text not null,
      dataset text not null,
      config jsonb not null default '{}',
      "order" integer not null default 0,
      size text not null default 'md',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
}

async function seedUsers() {
  await pool.query(
    `insert into users (id, auth_id, email, name, role) values
       ($1,$2,$3,'Owner','MEMBER'),
       ($4,$5,$6,'Stranger','MEMBER'),
       ($7,$8,$9,'Admin','ADMIN')`,
    [
      owner.id,
      owner.authId,
      owner.email,
      stranger.id,
      stranger.authId,
      stranger.email,
      adminUser.id,
      adminUser.authId,
      adminUser.email,
    ],
  );
}

async function resetDashboards() {
  await pool.query(`delete from dashboard_cards`);
  await pool.query(`delete from dashboards`);
}

async function insertDashboard(opts: {
  id: string;
  createdBy: string | null;
  builtin?: boolean;
  order?: number;
}) {
  await pool.query(
    `insert into dashboards (id, name, created_by, builtin, "order")
       values ($1, $2, $3, $4, $5)`,
    [opts.id, `Dashboard ${opts.id}`, opts.createdBy, opts.builtin ?? false, opts.order ?? 0],
  );
}

async function insertCard(opts: {
  id: string;
  dashboardId: string;
  order?: number;
}) {
  await pool.query(
    `insert into dashboard_cards (id, dashboard_id, title, viz_type, dataset, "order")
       values ($1, $2, $3, 'kpi', 'deals', $4)`,
    [opts.id, opts.dashboardId, `Card ${opts.id}`, opts.order ?? 0],
  );
}

type ReqOpts = { as?: TestUser; body?: unknown };

async function call(method: string, path: string, opts: ReqOpts = {}) {
  getSessionMock.mockResolvedValue(
    opts.as ? { user: { id: opts.as.authId, email: opts.as.email } } : null,
  );
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json as Record<string, unknown> | null };
}

beforeAll(async () => {
  originalUrl = process.env.DATABASE_URL;
  if (!originalUrl) throw new Error("DATABASE_URL must be set for these tests");
  const url = new URL(originalUrl);
  url.searchParams.set("options", `-c search_path=${TEST_SCHEMA}`);
  process.env.DATABASE_URL = url.toString();

  // Import after rewriting DATABASE_URL so the pool binds to the test schema.
  const dbMod = await import("@workspace/db");
  pool = dbMod.pool;
  await createSchema();
  await seedUsers();

  const express = (await import("express")).default;
  const dashboardsRouter = (await import("./dashboards")).default;
  const app = express();
  app.use(express.json());
  // Mounted to mirror the real app (router.use("/dashboards", ...) under /api).
  app.use("/api/dashboards", dashboardsRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (pool) {
    await pool.query(`drop schema if exists ${TEST_SCHEMA} cascade`);
    await pool.end();
  }
  process.env.DATABASE_URL = originalUrl;
});

beforeEach(async () => {
  await resetDashboards();
  // d_owned: owned by `owner`; d_seeded: createdBy null (admin-only);
  // d_builtin: built-in (read-only for everyone).
  await insertDashboard({ id: "d_owned", createdBy: owner.id, order: 0 });
  await insertDashboard({ id: "d_seeded", createdBy: null, order: 1 });
  await insertDashboard({ id: "d_builtin", createdBy: null, builtin: true, order: 2 });
  await insertCard({ id: "c_owned_a", dashboardId: "d_owned", order: 0 });
  await insertCard({ id: "c_owned_b", dashboardId: "d_owned", order: 1 });
  await insertCard({ id: "c_seeded", dashboardId: "d_seeded", order: 0 });
});

describe("PATCH /dashboards/:id", () => {
  it("404 when the dashboard does not exist", async () => {
    const res = await call("PATCH", "/api/dashboards/nope", {
      as: adminUser,
      body: { name: "x" },
    });
    expect(res.status).toBe(404);
  });

  it("403 for a non-owner member", async () => {
    const res = await call("PATCH", "/api/dashboards/d_owned", {
      as: stranger,
      body: { name: "Hijacked" },
    });
    expect(res.status).toBe(403);
  });

  it("200 for the owner", async () => {
    const res = await call("PATCH", "/api/dashboards/d_owned", {
      as: owner,
      body: { name: "Renamed by owner" },
    });
    expect(res.status).toBe(200);
    expect(res.body?.name).toBe("Renamed by owner");
  });

  it("200 for an admin on a seeded dashboard", async () => {
    const res = await call("PATCH", "/api/dashboards/d_seeded", {
      as: adminUser,
      body: { name: "Renamed by admin" },
    });
    expect(res.status).toBe(200);
    expect(res.body?.name).toBe("Renamed by admin");
  });

  it("403 on a built-in dashboard, even for an admin", async () => {
    const res = await call("PATCH", "/api/dashboards/d_builtin", {
      as: adminUser,
      body: { name: "nope" },
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /dashboards/:id", () => {
  it("404 when the dashboard does not exist", async () => {
    const res = await call("DELETE", "/api/dashboards/nope", { as: adminUser });
    expect(res.status).toBe(404);
  });

  it("403 for a member on a seeded (admin-only) dashboard", async () => {
    const res = await call("DELETE", "/api/dashboards/d_seeded", {
      as: stranger,
    });
    expect(res.status).toBe(403);
    const { rows } = await pool.query(
      `select 1 from dashboards where id = 'd_seeded'`,
    );
    expect(rows).toHaveLength(1);
  });

  it("200 for the owner, and the row is gone", async () => {
    const res = await call("DELETE", "/api/dashboards/d_owned", { as: owner });
    expect(res.status).toBe(200);
    const { rows } = await pool.query(
      `select 1 from dashboards where id = 'd_owned'`,
    );
    expect(rows).toHaveLength(0);
  });

  it("200 for an admin on a seeded dashboard", async () => {
    const res = await call("DELETE", "/api/dashboards/d_seeded", {
      as: adminUser,
    });
    expect(res.status).toBe(200);
  });
});

describe("POST /dashboards/:id/cards", () => {
  const body = { title: "New card", vizType: "kpi", dataset: "deals" };

  it("404 when the parent dashboard does not exist", async () => {
    const res = await call("POST", "/api/dashboards/nope/cards", {
      as: adminUser,
      body,
    });
    expect(res.status).toBe(404);
  });

  it("403 for a non-owner member", async () => {
    const res = await call("POST", "/api/dashboards/d_owned/cards", {
      as: stranger,
      body,
    });
    expect(res.status).toBe(403);
  });

  it("201 for the owner", async () => {
    const res = await call("POST", "/api/dashboards/d_owned/cards", {
      as: owner,
      body,
    });
    expect(res.status).toBe(201);
    expect(res.body?.dashboardId).toBe("d_owned");
  });

  it("201 for an admin on a seeded dashboard", async () => {
    const res = await call("POST", "/api/dashboards/d_seeded/cards", {
      as: adminUser,
      body,
    });
    expect(res.status).toBe(201);
  });

  it("403 on a built-in dashboard", async () => {
    const res = await call("POST", "/api/dashboards/d_builtin/cards", {
      as: adminUser,
      body,
    });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /dashboards/cards/:cardId", () => {
  it("404 when the card does not exist", async () => {
    const res = await call("PATCH", "/api/dashboards/cards/nope", {
      as: adminUser,
      body: { title: "x" },
    });
    expect(res.status).toBe(404);
  });

  it("403 for a non-owner member (authorized via owning dashboard)", async () => {
    const res = await call("PATCH", "/api/dashboards/cards/c_owned_a", {
      as: stranger,
      body: { title: "Hijacked" },
    });
    expect(res.status).toBe(403);
  });

  it("200 for the owner", async () => {
    const res = await call("PATCH", "/api/dashboards/cards/c_owned_a", {
      as: owner,
      body: { title: "Owner edit" },
    });
    expect(res.status).toBe(200);
    expect(res.body?.title).toBe("Owner edit");
  });

  it("200 for an admin on a seeded dashboard's card", async () => {
    const res = await call("PATCH", "/api/dashboards/cards/c_seeded", {
      as: adminUser,
      body: { title: "Admin edit" },
    });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /dashboards/cards/:cardId", () => {
  it("404 when the card does not exist", async () => {
    const res = await call("DELETE", "/api/dashboards/cards/nope", {
      as: adminUser,
    });
    expect(res.status).toBe(404);
  });

  it("403 for a non-owner member", async () => {
    const res = await call("DELETE", "/api/dashboards/cards/c_owned_a", {
      as: stranger,
    });
    expect(res.status).toBe(403);
    const { rows } = await pool.query(
      `select 1 from dashboard_cards where id = 'c_owned_a'`,
    );
    expect(rows).toHaveLength(1);
  });

  it("200 for the owner, and the card is gone", async () => {
    const res = await call("DELETE", "/api/dashboards/cards/c_owned_a", {
      as: owner,
    });
    expect(res.status).toBe(200);
    const { rows } = await pool.query(
      `select 1 from dashboard_cards where id = 'c_owned_a'`,
    );
    expect(rows).toHaveLength(0);
  });
});

describe("POST /dashboards/cards/reorder", () => {
  it("403 when any owning dashboard is not permitted", async () => {
    // c_owned_a belongs to owner, c_seeded is admin-only — a member touching
    // both must be denied.
    const res = await call("POST", "/api/dashboards/cards/reorder", {
      as: stranger,
      body: { order: ["c_owned_a", "c_seeded"] },
    });
    expect(res.status).toBe(403);
  });

  it("200 for the owner reordering their own cards", async () => {
    const res = await call("POST", "/api/dashboards/cards/reorder", {
      as: owner,
      body: { order: ["c_owned_b", "c_owned_a"] },
    });
    expect(res.status).toBe(200);
    const { rows } = await pool.query(
      `select id, "order" from dashboard_cards
         where id in ('c_owned_a','c_owned_b') order by "order"`,
    );
    expect(rows.map((r: { id: string }) => r.id)).toEqual([
      "c_owned_b",
      "c_owned_a",
    ]);
  });

  it("200 for an admin reordering cards across dashboards", async () => {
    const res = await call("POST", "/api/dashboards/cards/reorder", {
      as: adminUser,
      body: { order: ["c_seeded", "c_owned_a", "c_owned_b"] },
    });
    expect(res.status).toBe(200);
  });
});
