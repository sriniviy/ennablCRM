import { Router, type Request, type Response } from "express";
import { db, dealsTable, dealStagesTable, contactsTable, companiesTable, usersTable } from "@workspace/db";
import { eq, ilike, and, asc, desc, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { logActivity } from "../lib/activity";

const router = Router();

router.get("/stages", requireAuth, async (_req: Request, res: Response) => {
  try {
    const stages = await db
      .select()
      .from(dealStagesTable)
      .orderBy(asc(dealStagesTable.order));
    res.json(stages);
  } catch {
    res.status(500).json({ error: "Failed to list deal stages" });
  }
});

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { stageId, contactId, companyId, assigneeId, search, page = "1", limit = "100" } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    if (stageId) conditions.push(eq(dealsTable.stageId, stageId));
    if (contactId) conditions.push(eq(dealsTable.contactId, contactId));
    if (companyId) conditions.push(eq(dealsTable.companyId, companyId));
    if (assigneeId) conditions.push(eq(dealsTable.assigneeId, assigneeId));
    if (search) conditions.push(ilike(dealsTable.title, `%${search}%`));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [deals, [{ count }]] = await Promise.all([
      db
        .select({
          deal: dealsTable,
          stage: {
            id: dealStagesTable.id,
            name: dealStagesTable.name,
            color: dealStagesTable.color,
            order: dealStagesTable.order,
          },
          contact: {
            id: contactsTable.id,
            firstName: contactsTable.firstName,
            lastName: contactsTable.lastName,
            email: contactsTable.email,
          },
          company: {
            id: companiesTable.id,
            name: companiesTable.name,
          },
          assignee: {
            id: usersTable.id,
            name: usersTable.name,
            avatarUrl: usersTable.avatarUrl,
          },
        })
        .from(dealsTable)
        .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .leftJoin(contactsTable, eq(dealsTable.contactId, contactsTable.id))
        .leftJoin(companiesTable, eq(dealsTable.companyId, companiesTable.id))
        .leftJoin(usersTable, eq(dealsTable.assigneeId, usersTable.id))
        .where(where)
        .orderBy(asc(dealsTable.order), desc(dealsTable.createdAt))
        .limit(parseInt(limit))
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(dealsTable).where(where),
    ]);

    res.json({
      data: deals.map(({ deal, stage, contact, company, assignee }) => ({
        ...deal,
        stage: stage?.id ? stage : null,
        contact: contact?.id ? contact : null,
        company: company?.id ? company : null,
        assignee: assignee?.id ? assignee : null,
      })),
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch {
    res.status(500).json({ error: "Failed to list deals" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [row] = await db
      .select({
        deal: dealsTable,
        stage: { id: dealStagesTable.id, name: dealStagesTable.name, color: dealStagesTable.color, order: dealStagesTable.order },
        contact: { id: contactsTable.id, firstName: contactsTable.firstName, lastName: contactsTable.lastName, email: contactsTable.email },
        company: { id: companiesTable.id, name: companiesTable.name },
        assignee: { id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl },
      })
      .from(dealsTable)
      .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
      .leftJoin(contactsTable, eq(dealsTable.contactId, contactsTable.id))
      .leftJoin(companiesTable, eq(dealsTable.companyId, companiesTable.id))
      .leftJoin(usersTable, eq(dealsTable.assigneeId, usersTable.id))
      .where(eq(dealsTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }

    res.json({
      ...row.deal,
      stage: row.stage?.id ? row.stage : null,
      contact: row.contact?.id ? row.contact : null,
      company: row.company?.id ? row.company : null,
      assignee: row.assignee?.id ? row.assignee : null,
    });
  } catch {
    res.status(500).json({ error: "Failed to get deal" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const body = req.body;

    if (!body.title || !body.stageId) {
      res.status(400).json({ error: "title and stageId are required" });
      return;
    }

    const [deal] = await db.insert(dealsTable).values({
      title: body.title,
      stageId: body.stageId,
      value: body.value ?? null,
      currency: body.currency ?? "USD",
      probability: body.probability ?? 50,
      closeDate: body.closeDate ? new Date(body.closeDate) : null,
      contactId: body.contactId ?? null,
      companyId: body.companyId ?? null,
      assigneeId: body.assigneeId ?? null,
      notes: body.notes ?? null,
      order: 0,
    }).returning();

    await logActivity({
      type: "DEAL_CREATED",
      title: `Created deal "${deal.title}"`,
      userId: dbUser.id,
      dealId: deal.id,
      contactId: deal.contactId ?? undefined,
    });

    res.status(201).json(deal);
  } catch {
    res.status(500).json({ error: "Failed to create deal" });
  }
});

router.patch("/:id/move", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { dbUser } = req as AuthRequest;
    const { stageId, order } = req.body;

    const [existing] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }

    const oldStageId = existing.stageId;

    const [updated] = await db
      .update(dealsTable)
      .set({ stageId, order: order ?? 0, updatedAt: new Date() })
      .where(eq(dealsTable.id, id))
      .returning();

    if (oldStageId !== stageId) {
      const [newStage] = await db.select().from(dealStagesTable).where(eq(dealStagesTable.id, stageId)).limit(1);
      await logActivity({
        type: "DEAL_MOVED",
        title: `Moved deal "${existing.title}" to ${newStage?.name ?? stageId}`,
        userId: dbUser.id,
        dealId: id,
      });
    }

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to move deal" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [existing] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }

    const body = { ...req.body };
    if (body.closeDate) body.closeDate = new Date(body.closeDate);

    const [updated] = await db
      .update(dealsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(dealsTable.id, id))
      .returning();

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update deal" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [existing] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }

    await db.delete(dealsTable).where(eq(dealsTable.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete deal" });
  }
});

export default router;
