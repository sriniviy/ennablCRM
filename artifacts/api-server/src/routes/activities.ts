import { Router, type Request, type Response } from "express";
import { db, activitiesTable, usersTable, contactsTable, companiesTable, dealsTable } from "@workspace/db";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";

const router = Router();

const parseValidDate = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

router.get("/export", requireAuth, async (req: Request, res: Response) => {
  try {
    const { contactId, dealId, companyId, type, assigneeId, dateFrom, dateTo } = req.query as Record<string, string>;

    const conditions = [];
    if (contactId) conditions.push(eq(activitiesTable.contactId, contactId));
    if (dealId) conditions.push(eq(activitiesTable.dealId, dealId));
    if (companyId) conditions.push(eq(activitiesTable.companyId, companyId));
    if (type) conditions.push(eq(activitiesTable.type, type as typeof activitiesTable.$inferSelect["type"]));
    if (assigneeId) conditions.push(eq(activitiesTable.userId, assigneeId));
    if (dateFrom) {
      const from = parseValidDate(dateFrom);
      if (!from) { res.status(400).json({ error: "Invalid dateFrom" }); return; }
      conditions.push(gte(activitiesTable.createdAt, from));
    }
    if (dateTo) {
      const end = parseValidDate(dateTo);
      if (!end) { res.status(400).json({ error: "Invalid dateTo" }); return; }
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(activitiesTable.createdAt, end));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        activity: activitiesTable,
        user: { name: usersTable.name },
        contact: { firstName: contactsTable.firstName, lastName: contactsTable.lastName },
        company: { name: companiesTable.name },
        deal: { title: dealsTable.title },
      })
      .from(activitiesTable)
      .leftJoin(usersTable, eq(activitiesTable.userId, usersTable.id))
      .leftJoin(contactsTable, eq(activitiesTable.contactId, contactsTable.id))
      .leftJoin(companiesTable, eq(activitiesTable.companyId, companiesTable.id))
      .leftJoin(dealsTable, eq(activitiesTable.dealId, dealsTable.id))
      .where(where)
      .orderBy(desc(activitiesTable.createdAt));

    const escape = (v: string | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = ["Type", "Title", "Description", "Contact", "Company", "Deal", "User", "Date"];
    const csvRows = rows.map(({ activity: a, user, contact, company, deal }) => [
      a.type,
      a.title,
      a.description,
      contact?.firstName ? `${contact.firstName} ${contact.lastName}`.trim() : "",
      company?.name ?? "",
      deal?.title ?? "",
      user?.name ?? "",
      a.createdAt ? new Date(a.createdAt).toISOString() : "",
    ].map(escape).join(","));

    const csv = [headers.map(escape).join(","), ...csvRows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"activities.csv\"");
    res.send(csv);
  } catch {
    res.status(500).json({ error: "Failed to export activities" });
  }
});

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { contactId, dealId, companyId, type, dateFrom, dateTo, page = "1", pageSize = "50" } = req.query as Record<string, string>;
    const ps = parseInt(pageSize);
    const pg = parseInt(page);
    const offset = (pg - 1) * ps;

    const conditions = [];
    if (contactId) conditions.push(eq(activitiesTable.contactId, contactId));
    if (dealId) conditions.push(eq(activitiesTable.dealId, dealId));
    if (companyId) conditions.push(eq(activitiesTable.companyId, companyId));
    if (type) conditions.push(eq(activitiesTable.type, type as typeof activitiesTable.$inferSelect["type"]));
    if (dateFrom) {
      const from = parseValidDate(dateFrom);
      if (!from) { res.status(400).json({ error: "Invalid dateFrom" }); return; }
      conditions.push(gte(activitiesTable.createdAt, from));
    }
    if (dateTo) {
      const end = parseValidDate(dateTo);
      if (!end) { res.status(400).json({ error: "Invalid dateTo" }); return; }
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(activitiesTable.createdAt, end));
    }

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
        .limit(ps)
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
      page: pg,
      pageSize: ps,
      hasMore: count > pg * ps,
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

    let endDate: Date | null = null;
    if (body.endDate) {
      endDate = new Date(body.endDate);
      if (isNaN(endDate.getTime())) {
        res.status(400).json({ error: "endDate is not a valid date" });
        return;
      }
    }

    const [activity] = await db.insert(activitiesTable).values({
      type: body.type,
      title: body.title,
      description: body.description ?? null,
      endDate,
      emailSubject: body.emailSubject ?? null,
      emailBody: body.emailBody ?? null,
      aiSummary: body.aiSummary ?? null,
      userId: dbUser.id,
      contactId: body.contactId ?? null,
      companyId: body.companyId ?? null,
      dealId: body.dealId ?? null,
      taskId: body.taskId ?? null,
      metadata: body.metadata ?? null,
    }).returning();

    await logAudit({
      action: "CREATE",
      objectType: "activity",
      objectId: activity.id,
      objectLabel: activity.title,
      actorId: dbUser.id,
      actorName: dbUser.name,
      after: activity,
    });

    res.status(201).json(activity);
  } catch {
    res.status(500).json({ error: "Failed to create activity" });
  }
});

export default router;
