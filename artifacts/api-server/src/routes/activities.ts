import { Router, type Request, type Response } from "express";
import { db, activitiesTable, usersTable, contactsTable, companiesTable, dealsTable, customFieldDefinitionsTable, customFieldValuesTable } from "@workspace/db";
import { eq, and, or, asc, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { isSummarizable, isThreadedEmail, refreshActivitySummary } from "../lib/activity-summary";

const router = Router();

const parseValidDate = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

// Activities on a company should roll up activities logged against that
// company's deals and contacts, not just those tagged with companyId directly.
const companyScopeCondition = (companyId: string) =>
  or(
    eq(activitiesTable.companyId, companyId),
    inArray(
      activitiesTable.dealId,
      db.select({ id: dealsTable.id }).from(dealsTable).where(eq(dealsTable.companyId, companyId)),
    ),
    inArray(
      activitiesTable.contactId,
      db.select({ id: contactsTable.id }).from(contactsTable).where(eq(contactsTable.companyId, companyId)),
    ),
  );

router.get("/export", requireAuth, async (req: Request, res: Response) => {
  try {
    const { contactId, dealId, companyId, type, assigneeId, dateFrom, dateTo } = req.query as Record<string, string>;

    const conditions = [];
    if (contactId) conditions.push(eq(activitiesTable.contactId, contactId));
    if (dealId) conditions.push(eq(activitiesTable.dealId, dealId));
    if (companyId) conditions.push(companyScopeCondition(companyId));
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

    const [cfDefs, cfValues] = await Promise.all([
      db.select().from(customFieldDefinitionsTable)
        .where(eq(customFieldDefinitionsTable.objectType, "activity"))
        .orderBy(asc(customFieldDefinitionsTable.displayOrder)),
      rows.length > 0
        ? db.select().from(customFieldValuesTable)
            .where(and(
              eq(customFieldValuesTable.objectType, "activity"),
              inArray(customFieldValuesTable.recordId, rows.map(r => r.activity.id)),
            ))
        : Promise.resolve([]),
    ]);

    const cfValueMap = new Map<string, Map<string, string | null>>();
    for (const v of cfValues) {
      if (!cfValueMap.has(v.recordId)) cfValueMap.set(v.recordId, new Map());
      cfValueMap.get(v.recordId)!.set(v.fieldId, v.value);
    }

    const headers = ["Type", "Title", "Description", "Contact", "Company", "Deal", "User", "Date", ...cfDefs.map((d) => d.label)];
    const csvRows = rows.map(({ activity: a, user, contact, company, deal }) => {
      const cfRow = cfValueMap.get(a.id) ?? new Map<string, string | null>();
      return [
        a.type,
        a.title,
        a.description,
        contact?.firstName ? `${contact.firstName} ${contact.lastName}`.trim() : "",
        company?.name ?? "",
        deal?.title ?? "",
        user?.name ?? "",
        a.createdAt ? new Date(a.createdAt).toISOString() : "",
        ...cfDefs.map((d) => cfRow.get(d.id) ?? null),
      ].map(escape).join(",");
    });

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
    if (companyId) conditions.push(companyScopeCondition(companyId));
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

    let result = activity;
    // Threaded emails always refresh so the whole thread's summary stays current
    // when a new message arrives. Other types respect a manually-supplied summary.
    if (isSummarizable(activity) && (!body.aiSummary || isThreadedEmail(activity))) {
      try {
        const summary = await refreshActivitySummary(activity.id);
        if (summary) result = { ...activity, aiSummary: summary };
      } catch (err) {
        console.error("Failed to auto-generate activity summary:", err);
      }
    }

    res.status(201).json(result);
  } catch {
    res.status(500).json({ error: "Failed to create activity" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { dbUser } = req as AuthRequest;
  const { title, description, type, endDate, status, closureComment } = req.body as {
    title?: string; description?: string; type?: string;
    endDate?: string | null; status?: string; closureComment?: string;
  };

  const [existing] = await db.select().from(activitiesTable).where(eq(activitiesTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Activity not found" }); return; }

  const updates: Partial<typeof activitiesTable.$inferInsert> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description ?? null;
  if (type !== undefined) updates.type = type as typeof activitiesTable.$inferSelect["type"];
  if (endDate !== undefined) updates.endDate = endDate ? new Date(endDate) : null;

  if (status !== undefined || closureComment !== undefined) {
    const meta = (existing.metadata as Record<string, unknown>) ?? {};
    updates.metadata = {
      ...meta,
      ...(status !== undefined ? { status } : {}),
      ...(closureComment !== undefined ? { closureComment } : {}),
      ...(status === "closed" ? { closedAt: new Date().toISOString() } : {}),
    };
  }

  const [updated] = await db.update(activitiesTable).set(updates).where(eq(activitiesTable.id, id)).returning();

  // Log to the activity itself
  await logAudit({
    action: "UPDATE", objectType: "activity", objectId: updated.id,
    objectLabel: updated.title, actorId: dbUser.id, actorName: dbUser.name,
    before: existing, after: updated,
  });

  // Also surface the event in the parent contact / company audit trail
  const parentEntries: Array<{ objectType: string; objectId: string }> = [];
  if (existing.contactId) parentEntries.push({ objectType: "contact", objectId: existing.contactId });
  if (existing.companyId) parentEntries.push({ objectType: "company", objectId: existing.companyId });

  for (const parent of parentEntries) {
    await logAudit({
      action: "UPDATE",
      objectType: parent.objectType,
      objectId: parent.objectId,
      objectLabel: `Activity: ${updated.title}`,
      actorId: dbUser.id,
      actorName: dbUser.name,
      before: {
        activityStatus: (existing.metadata as Record<string, unknown>)?.status ?? "open",
        activityTitle: existing.title,
        activityNotes: (existing.metadata as Record<string, unknown>)?.closureComment ?? null,
      },
      after: {
        activityStatus: (updated.metadata as Record<string, unknown>)?.status ?? "open",
        activityTitle: updated.title,
        activityNotes: (updated.metadata as Record<string, unknown>)?.closureComment ?? null,
      },
    });
  }

  res.json(updated);
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { dbUser } = req as AuthRequest;
    const [existing] = await db.select().from(activitiesTable).where(eq(activitiesTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Activity not found" }); return; }
    if (existing.userId !== dbUser.id && dbUser.role !== "ADMIN") {
      res.status(403).json({ error: "Not authorized" }); return;
    }
    await db.delete(activitiesTable).where(eq(activitiesTable.id, id));
    await logAudit({
      action: "DELETE",
      objectType: "activity",
      objectId: id,
      objectLabel: existing.title,
      actorId: dbUser.id,
      actorName: dbUser.name,
      before: existing,
    });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/summarize", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [activity] = await db
      .select()
      .from(activitiesTable)
      .where(eq(activitiesTable.id, id))
      .limit(1);

    if (!activity) {
      res.status(404).json({ error: "Activity not found" });
      return;
    }
    if (!isSummarizable(activity)) {
      res.status(400).json({ error: "This activity type cannot be summarized" });
      return;
    }

    const summary = await refreshActivitySummary(id);
    if (!summary) {
      res.status(422).json({ error: "Could not generate a summary for this activity" });
      return;
    }

    res.json({ id, aiSummary: summary });
  } catch {
    res.status(500).json({ error: "Failed to summarize activity" });
  }
});

export default router;
