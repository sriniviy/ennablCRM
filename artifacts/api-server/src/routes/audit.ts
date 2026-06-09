import { Router, type Request, type Response } from "express";
import { db, auditLogTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const {
      objectType,
      objectId,
      actorId,
      action,
      dateFrom,
      dateTo,
      page = "1",
      pageSize = "50",
    } = req.query as Record<string, string>;

    // Browsing the global audit log (no specific record) is admin-only.
    // Per-record history (objectId provided) is available to any authed user.
    if (!objectId && dbUser.role !== "ADMIN") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const ps = parseInt(pageSize);
    const pg = parseInt(page);
    const offset = (pg - 1) * ps;

    const conditions = [];
    if (objectType) conditions.push(eq(auditLogTable.objectType, objectType));
    if (objectId) conditions.push(eq(auditLogTable.objectId, objectId));
    if (actorId) conditions.push(eq(auditLogTable.actorId, actorId));
    if (action) {
      conditions.push(eq(auditLogTable.action, action as typeof auditLogTable.$inferSelect["action"]));
    }
    if (dateFrom) conditions.push(gte(auditLogTable.createdAt, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(auditLogTable.createdAt, end));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [entries, [{ count }]] = await Promise.all([
      db
        .select({
          entry: auditLogTable,
          actor: {
            id: usersTable.id,
            name: usersTable.name,
            avatarUrl: usersTable.avatarUrl,
          },
        })
        .from(auditLogTable)
        .leftJoin(usersTable, eq(auditLogTable.actorId, usersTable.id))
        .where(where)
        .orderBy(desc(auditLogTable.createdAt))
        .limit(ps)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(auditLogTable).where(where),
    ]);

    res.json({
      data: entries.map(({ entry, actor }) => ({
        ...entry,
        actor: actor?.id ? actor : null,
      })),
      total: count,
      page: pg,
      pageSize: ps,
      hasMore: count > pg * ps,
    });
  } catch {
    res.status(500).json({ error: "Failed to list audit log" });
  }
});

export default router;
