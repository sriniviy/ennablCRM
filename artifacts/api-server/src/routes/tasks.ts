import { Router, type Request, type Response } from "express";
import { db, tasksTable, contactsTable, dealsTable, usersTable } from "@workspace/db";
import { eq, and, lte, gte, isNull, isNotNull, desc, asc, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { logActivity } from "../lib/activity";

const router = Router();

router.get("/export", requireAuth, async (req: Request, res: Response) => {
  try {
    const { filter, contactId, dealId, assigneeId, dateFrom, dateTo } = req.query as Record<string, string>;
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const conditions = [];
    if (filter === "overdue") {
      conditions.push(eq(tasksTable.completed, false));
      conditions.push(lte(tasksTable.dueDate, now));
    } else if (filter === "due_today") {
      conditions.push(eq(tasksTable.completed, false));
      conditions.push(gte(tasksTable.dueDate, todayStart));
      conditions.push(lte(tasksTable.dueDate, todayEnd));
    } else if (filter === "open") {
      conditions.push(eq(tasksTable.completed, false));
    } else if (filter === "completed") {
      conditions.push(eq(tasksTable.completed, true));
    }
    if (contactId) conditions.push(eq(tasksTable.contactId, contactId));
    if (dealId) conditions.push(eq(tasksTable.dealId, dealId));
    if (assigneeId) conditions.push(eq(tasksTable.assigneeId, assigneeId));
    if (dateFrom) conditions.push(gte(tasksTable.createdAt, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(tasksTable.createdAt, end));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        task: tasksTable,
        contact: { firstName: contactsTable.firstName, lastName: contactsTable.lastName },
        deal: { title: dealsTable.title },
        assignee: { name: usersTable.name },
      })
      .from(tasksTable)
      .leftJoin(contactsTable, eq(tasksTable.contactId, contactsTable.id))
      .leftJoin(dealsTable, eq(tasksTable.dealId, dealsTable.id))
      .leftJoin(usersTable, eq(tasksTable.assigneeId, usersTable.id))
      .where(where)
      .orderBy(asc(tasksTable.dueDate), desc(tasksTable.createdAt));

    const escape = (v: string | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = ["Title", "Description", "Type", "Priority", "Status", "Due Date", "Completed At", "Contact", "Deal", "Assignee", "Created At"];
    const csvRows = rows.map(({ task: t, contact, deal, assignee }) => [
      t.title,
      t.description,
      t.type,
      t.priority,
      t.completed ? "Completed" : "Open",
      t.dueDate ? new Date(t.dueDate).toISOString() : "",
      t.completedAt ? new Date(t.completedAt).toISOString() : "",
      contact?.firstName ? `${contact.firstName} ${contact.lastName}`.trim() : "",
      deal?.title ?? "",
      assignee?.name ?? "",
      t.createdAt ? new Date(t.createdAt).toISOString() : "",
    ].map(escape).join(","));

    const csv = [headers.map(escape).join(","), ...csvRows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"tasks.csv\"");
    res.send(csv);
  } catch {
    res.status(500).json({ error: "Failed to export tasks" });
  }
});

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { filter, contactId, dealId, assigneeId, page = "1", pageSize = "50" } = req.query as Record<string, string>;
    const ps = parseInt(pageSize);
    const pg = parseInt(page);
    const offset = (pg - 1) * ps;
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const conditions = [];

    if (filter === "overdue") {
      conditions.push(eq(tasksTable.completed, false));
      conditions.push(lte(tasksTable.dueDate, now));
    } else if (filter === "due_today") {
      conditions.push(eq(tasksTable.completed, false));
      conditions.push(gte(tasksTable.dueDate, todayStart));
      conditions.push(lte(tasksTable.dueDate, todayEnd));
    } else if (filter === "open") {
      conditions.push(eq(tasksTable.completed, false));
    } else if (filter === "completed") {
      conditions.push(eq(tasksTable.completed, true));
    }

    if (contactId) conditions.push(eq(tasksTable.contactId, contactId));
    if (dealId) conditions.push(eq(tasksTable.dealId, dealId));
    if (assigneeId) conditions.push(eq(tasksTable.assigneeId, assigneeId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [tasks, [{ count }]] = await Promise.all([
      db
        .select({
          task: tasksTable,
          contact: { id: contactsTable.id, firstName: contactsTable.firstName, lastName: contactsTable.lastName },
          deal: { id: dealsTable.id, title: dealsTable.title },
          assignee: { id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl },
        })
        .from(tasksTable)
        .leftJoin(contactsTable, eq(tasksTable.contactId, contactsTable.id))
        .leftJoin(dealsTable, eq(tasksTable.dealId, dealsTable.id))
        .leftJoin(usersTable, eq(tasksTable.assigneeId, usersTable.id))
        .where(where)
        .orderBy(asc(tasksTable.dueDate), desc(tasksTable.createdAt))
        .limit(ps)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(tasksTable).where(where),
    ]);

    res.json({
      data: tasks.map(({ task, contact, deal, assignee }) => ({
        ...task,
        contact: contact?.id ? contact : null,
        deal: deal?.id ? deal : null,
        assignee: assignee?.id ? assignee : null,
      })),
      total: count,
      page: pg,
      pageSize: ps,
      hasMore: count > pg * ps,
    });
  } catch {
    res.status(500).json({ error: "Failed to list tasks" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [row] = await db
      .select({
        task: tasksTable,
        contact: { id: contactsTable.id, firstName: contactsTable.firstName, lastName: contactsTable.lastName },
        deal: { id: dealsTable.id, title: dealsTable.title },
        assignee: { id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl },
      })
      .from(tasksTable)
      .leftJoin(contactsTable, eq(tasksTable.contactId, contactsTable.id))
      .leftJoin(dealsTable, eq(tasksTable.dealId, dealsTable.id))
      .leftJoin(usersTable, eq(tasksTable.assigneeId, usersTable.id))
      .where(eq(tasksTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    res.json({
      ...row.task,
      contact: row.contact?.id ? row.contact : null,
      deal: row.deal?.id ? row.deal : null,
      assignee: row.assignee?.id ? row.assignee : null,
    });
  } catch {
    res.status(500).json({ error: "Failed to get task" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const body = req.body;

    if (!body.title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    const [task] = await db.insert(tasksTable).values({
      title: body.title,
      description: body.description ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      priority: body.priority ?? "MEDIUM",
      type: body.type ?? "TODO",
      contactId: body.contactId ?? null,
      dealId: body.dealId ?? null,
      assigneeId: body.assigneeId ?? dbUser.id,
      creatorId: dbUser.id,
    }).returning();

    await logActivity({
      type: "TASK_CREATED",
      title: `Created task "${task.title}"`,
      userId: dbUser.id,
      contactId: task.contactId ?? undefined,
      dealId: task.dealId ?? undefined,
      taskId: task.id,
    });

    res.status(201).json(task);
  } catch {
    res.status(500).json({ error: "Failed to create task" });
  }
});

router.patch("/:id/complete", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { dbUser } = req as AuthRequest;
    const { completed } = req.body as { completed: boolean };

    const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const [updated] = await db
      .update(tasksTable)
      .set({
        completed,
        completedAt: completed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(tasksTable.id, id))
      .returning();

    if (completed) {
      await logActivity({
        type: "TASK_COMPLETED",
        title: `Completed task "${existing.title}"`,
        userId: dbUser.id,
        contactId: existing.contactId ?? undefined,
        dealId: existing.dealId ?? undefined,
        taskId: id,
      });
    }

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update task" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const body = { ...req.body };
    if (body.dueDate) body.dueDate = new Date(body.dueDate);

    const [updated] = await db
      .update(tasksTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(tasksTable.id, id))
      .returning();

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update task" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    await db.delete(tasksTable).where(eq(tasksTable.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete task" });
  }
});

export default router;
