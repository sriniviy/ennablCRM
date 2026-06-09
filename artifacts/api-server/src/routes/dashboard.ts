import { Router, type Request, type Response } from "express";
import {
  db,
  contactsTable,
  companiesTable,
  dealsTable,
  dealStagesTable,
  tasksTable,
  activitiesTable,
  usersTable,
  emailCampaignsTable,
} from "@workspace/db";
import { eq, and, gte, lte, lt, isNull, isNotNull, sql, desc, not } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/stats", requireAuth, async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const [
      [{ totalContacts }],
      [{ newContactsThisMonth }],
      [{ totalCompanies }],
      [{ openDeals, pipelineValue }],
      [{ dealsWonThisMonth, dealsWonValue }],
      [{ overdueTasks }],
      [{ tasksDueToday }],
      [{ openTasks }],
      [{ totalCampaigns, sentCampaigns }],
    ] = await Promise.all([
      db.select({ totalContacts: sql<number>`count(*)::int` }).from(contactsTable),
      db
        .select({ newContactsThisMonth: sql<number>`count(*)::int` })
        .from(contactsTable)
        .where(gte(contactsTable.createdAt, startOfMonth)),
      db.select({ totalCompanies: sql<number>`count(*)::int` }).from(companiesTable),
      db
        .select({
          openDeals: sql<number>`count(*)::int`,
          pipelineValue: sql<number>`coalesce(sum(${dealsTable.value}), 0)::float`,
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
          dealsWonThisMonth: sql<number>`count(*)::int`,
          dealsWonValue: sql<number>`coalesce(sum(${dealsTable.value}), 0)::float`,
        })
        .from(dealsTable)
        .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(
          and(
            eq(dealStagesTable.name, "Won"),
            gte(dealsTable.updatedAt, startOfMonth),
          ),
        ),
      db
        .select({ overdueTasks: sql<number>`count(*)::int` })
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.completed, false),
            lt(tasksTable.dueDate, now),
            isNotNull(tasksTable.dueDate),
          ),
        ),
      db
        .select({ tasksDueToday: sql<number>`count(*)::int` })
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.completed, false),
            gte(tasksTable.dueDate, todayStart),
            lte(tasksTable.dueDate, todayEnd),
          ),
        ),
      db
        .select({ openTasks: sql<number>`count(*)::int` })
        .from(tasksTable)
        .where(eq(tasksTable.completed, false)),
      db
        .select({
          totalCampaigns: sql<number>`count(*)::int`,
          sentCampaigns: sql<number>`count(case when ${emailCampaignsTable.status} = 'SENT' then 1 end)::int`,
        })
        .from(emailCampaignsTable),
    ]);

    res.json({
      totalContacts,
      newContactsThisMonth,
      totalCompanies,
      openDeals,
      pipelineValue,
      dealsWonThisMonth,
      dealsWonValue,
      overdueTasks,
      tasksDueToday,
      openTasks,
      campaigns: {
        total: totalCampaigns,
        sent: sentCampaigns,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get dashboard stats" });
  }
});

router.get("/activity-feed", requireAuth, async (req: Request, res: Response) => {
  try {
    const { limit = "20" } = req.query as Record<string, string>;

    const activities = await db
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
      .orderBy(desc(activitiesTable.createdAt))
      .limit(parseInt(limit));

    res.json(
      activities.map(({ activity, user, contact, deal }) => ({
        ...activity,
        user: user?.id ? user : null,
        contact: contact?.id ? contact : null,
        deal: deal?.id ? deal : null,
      })),
    );
  } catch {
    res.status(500).json({ error: "Failed to get activity feed" });
  }
});

export default router;
