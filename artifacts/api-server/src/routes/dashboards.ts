import { Router, type Request, type Response } from "express";
import { db, dashboardsTable, dashboardCardsTable } from "@workspace/db";
import { eq, asc, sql, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { runCardQuery } from "../lib/dashboard-query";

const router = Router();

type DashboardRow = typeof dashboardsTable.$inferSelect;

async function getDashboard(id: string): Promise<DashboardRow | null> {
  const [d] = await db
    .select()
    .from(dashboardsTable)
    .where(eq(dashboardsTable.id, id))
    .limit(1);
  return d ?? null;
}

/**
 * A dashboard (and its cards) may be mutated by its creator or an admin.
 * Built-in dashboards are read-only. Seeded/curated dashboards have no
 * creator and are therefore admin-only.
 */
export function authorizeMutation(
  dashboard: DashboardRow,
  user: { id: string; role: string },
): { ok: true } | { ok: false; status: number; error: string } {
  if (dashboard.builtin) {
    return { ok: false, status: 403, error: "Built-in dashboards cannot be modified" };
  }
  if (user.role === "ADMIN") return { ok: true };
  if (dashboard.createdBy && dashboard.createdBy === user.id) return { ok: true };
  return { ok: false, status: 403, error: "You don't have permission to modify this dashboard" };
}

/* ─────────────── Dashboards CRUD ─────────────── */

router.get("/", requireAuth, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(dashboardsTable)
      .orderBy(asc(dashboardsTable.order), asc(dashboardsTable.createdAt));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to list dashboards" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthRequest;
    const { name, description } = req.body as {
      name?: string;
      description?: string;
    };
    if (!name || !name.trim()) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    const maxRow = await db
      .select({ max: sql<number>`coalesce(max(${dashboardsTable.order}), -1)::int` })
      .from(dashboardsTable);
    const nextOrder = (maxRow[0]?.max ?? -1) + 1;
    const [created] = await db
      .insert(dashboardsTable)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        order: nextOrder,
        createdBy: userId,
      })
      .returning();
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: "Failed to create dashboard" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { id } = req.params;
    const target = await getDashboard(id);
    if (!target) {
      res.status(404).json({ error: "Dashboard not found" });
      return;
    }
    const authz = authorizeMutation(target, dbUser);
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    const { name, description, order } = req.body as {
      name?: string;
      description?: string;
      order?: number;
    };
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof name === "string") updates.name = name.trim();
    if (typeof description === "string") updates.description = description.trim() || null;
    if (typeof order === "number") updates.order = order;
    const [updated] = await db
      .update(dashboardsTable)
      .set(updates)
      .where(eq(dashboardsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Dashboard not found" });
      return;
    }
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update dashboard" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { id } = req.params;
    const target = await getDashboard(id);
    if (!target) {
      res.status(404).json({ error: "Dashboard not found" });
      return;
    }
    const authz = authorizeMutation(target, dbUser);
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    await db.delete(dashboardsTable).where(eq(dashboardsTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete dashboard" });
  }
});

/* ─────────────── Cards CRUD ─────────────── */

router.get("/:id/cards", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rows = await db
      .select()
      .from(dashboardCardsTable)
      .where(eq(dashboardCardsTable.dashboardId, id))
      .orderBy(asc(dashboardCardsTable.order), asc(dashboardCardsTable.createdAt));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to list cards" });
  }
});

router.post("/:id/cards", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { id } = req.params;
    const parent = await getDashboard(id);
    if (!parent) {
      res.status(404).json({ error: "Dashboard not found" });
      return;
    }
    const authz = authorizeMutation(parent, dbUser);
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    const { title, vizType, dataset, config, size } = req.body as {
      title?: string;
      vizType?: string;
      dataset?: string;
      config?: Record<string, unknown>;
      size?: string;
    };
    if (!title || !vizType || !dataset) {
      res.status(400).json({ error: "title, vizType and dataset are required" });
      return;
    }
    const maxRow = await db
      .select({ max: sql<number>`coalesce(max(${dashboardCardsTable.order}), -1)::int` })
      .from(dashboardCardsTable)
      .where(eq(dashboardCardsTable.dashboardId, id));
    const nextOrder = (maxRow[0]?.max ?? -1) + 1;
    const [created] = await db
      .insert(dashboardCardsTable)
      .values({
        dashboardId: id,
        title: title.trim(),
        vizType,
        dataset,
        config: config ?? {},
        size: size ?? "md",
        order: nextOrder,
      })
      .returning();
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: "Failed to create card" });
  }
});

router.patch("/cards/:cardId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { cardId } = req.params;
    const [card] = await db
      .select()
      .from(dashboardCardsTable)
      .where(eq(dashboardCardsTable.id, cardId))
      .limit(1);
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    const parent = await getDashboard(card.dashboardId);
    if (!parent) {
      res.status(404).json({ error: "Dashboard not found" });
      return;
    }
    const authz = authorizeMutation(parent, dbUser);
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    const { title, vizType, dataset, config, size, order, cardHeight } = req.body as {
      title?: string;
      vizType?: string;
      dataset?: string;
      config?: Record<string, unknown>;
      size?: string;
      order?: number;
      cardHeight?: number;
    };
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof title === "string") updates.title = title.trim();
    if (typeof vizType === "string") updates.vizType = vizType;
    if (typeof dataset === "string") updates.dataset = dataset;
    if (config && typeof config === "object") updates.config = config;
    if (typeof size === "string") updates.size = size;
    if (typeof order === "number") updates.order = order;
    if (typeof cardHeight === "number" && cardHeight >= 80 && cardHeight <= 900) updates.cardHeight = cardHeight;
    const [updated] = await db
      .update(dashboardCardsTable)
      .set(updates)
      .where(eq(dashboardCardsTable.id, cardId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update card" });
  }
});

router.delete("/cards/:cardId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { cardId } = req.params;
    const [card] = await db
      .select()
      .from(dashboardCardsTable)
      .where(eq(dashboardCardsTable.id, cardId))
      .limit(1);
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    const parent = await getDashboard(card.dashboardId);
    if (!parent) {
      res.status(404).json({ error: "Dashboard not found" });
      return;
    }
    const authz = authorizeMutation(parent, dbUser);
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    await db.delete(dashboardCardsTable).where(eq(dashboardCardsTable.id, cardId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete card" });
  }
});

router.post("/cards/reorder", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { order } = req.body as { order?: string[] };
    if (!Array.isArray(order) || order.length === 0) {
      res.status(400).json({ error: "order array is required" });
      return;
    }
    // Verify the caller may mutate every dashboard the listed cards belong to.
    const cards = await db
      .select()
      .from(dashboardCardsTable)
      .where(inArray(dashboardCardsTable.id, order));
    const dashIds = [...new Set(cards.map((c) => c.dashboardId))];
    const dashes = await db
      .select()
      .from(dashboardsTable)
      .where(inArray(dashboardsTable.id, dashIds));
    for (const d of dashes) {
      const authz = authorizeMutation(d, dbUser);
      if (!authz.ok) {
        res.status(authz.status).json({ error: authz.error });
        return;
      }
    }
    await Promise.all(
      order.map((cardId, i) =>
        db
          .update(dashboardCardsTable)
          .set({ order: i, updatedAt: new Date() })
          .where(eq(dashboardCardsTable.id, cardId)),
      ),
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to reorder cards" });
  }
});

/* ─────────────── Analytics query ─────────────── */

router.post("/query", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vizType, dataset, config } = req.body as {
      vizType?: string;
      dataset?: string;
      config?: Record<string, unknown>;
    };
    if (!vizType || !dataset) {
      res.status(400).json({ error: "vizType and dataset are required" });
      return;
    }
    const result = await runCardQuery({
      vizType,
      dataset,
      config: config ?? {},
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to run query", detail: String(err) });
  }
});

export default router;
