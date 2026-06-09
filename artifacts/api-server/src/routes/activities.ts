import { Router, type Request, type Response } from "express";
import { db, activitiesTable, usersTable, contactsTable, dealsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { contactId, dealId, companyId, type, page = "1", limit = "50" } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    if (contactId) conditions.push(eq(activitiesTable.contactId, contactId));
    if (dealId) conditions.push(eq(activitiesTable.dealId, dealId));
    if (companyId) conditions.push(eq(activitiesTable.companyId, companyId));
    if (type) conditions.push(eq(activitiesTable.type, type as typeof activitiesTable.$inferSelect["type"]));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [activities, [{ count }]] = await Promise.all([
      db
        .select({
          activity: activitiesTable,
          user: { id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl },
          contact: { id: contactsTable.id, firstName: contactsTable.firstName, lastName: contactsTable.lastName },
          deal: { id: dealsTable.id, title: dealsTable.title },
        })
        .from(activitiesTable)
        .leftJoin(usersTable, eq(activitiesTable.userId, usersTable.id))
        .leftJoin(contactsTable, eq(activitiesTable.contactId, contactsTable.id))
        .leftJoin(dealsTable, eq(activitiesTable.dealId, dealsTable.id))
        .where(where)
        .orderBy(desc(activitiesTable.createdAt))
        .limit(parseInt(limit))
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(activitiesTable).where(where),
    ]);

    res.json({
      data: activities.map(({ activity, user, contact, deal }) => ({
        ...activity,
        user: user?.id ? user : null,
        contact: contact?.id ? contact : null,
        deal: deal?.id ? deal : null,
      })),
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch {
    res.status(500).json({ error: "Failed to list activities" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const body = req.body;

    if (!body.type || !body.title) {
      res.status(400).json({ error: "type and title are required" });
      return;
    }

    const [activity] = await db.insert(activitiesTable).values({
      type: body.type,
      title: body.title,
      description: body.description ?? null,
      userId: dbUser.id,
      contactId: body.contactId ?? null,
      companyId: body.companyId ?? null,
      dealId: body.dealId ?? null,
      taskId: body.taskId ?? null,
      metadata: body.metadata ?? null,
    }).returning();

    res.status(201).json(activity);
  } catch {
    res.status(500).json({ error: "Failed to create activity" });
  }
});

export default router;
