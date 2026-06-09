import { Router, type Request, type Response } from "express";
import {
  db,
  scheduledExportsTable,
  tasksTable,
  contactsTable,
  dealsTable,
  usersTable,
  activitiesTable,
  companiesTable,
  notesTable,
} from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { Resend } from "resend";

const router = Router();

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function nextSendAt(frequency: "daily" | "weekly"): Date {
  const now = new Date();
  if (frequency === "daily") {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(7, 0, 0, 0);
    return next;
  }
  // weekly — next Monday at 07:00
  const next = new Date(now);
  const day = next.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  next.setDate(next.getDate() + daysUntilMonday);
  next.setHours(7, 0, 0, 0);
  return next;
}

function escape(v: string | null | undefined) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

async function buildTasksCsv(): Promise<string> {
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
    .leftJoin(usersTable, eq(tasksTable.assigneeId, usersTable.id));

  const headers = ["Title", "Description", "Type", "Priority", "Status", "Due Date", "Completed At", "Contact", "Deal", "Assignee", "Created At"];
  const csvRows = rows.map(({ task: t, contact, deal, assignee }) =>
    [
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
    ].map(escape).join(","),
  );
  return [headers.map(escape).join(","), ...csvRows].join("\n");
}

async function buildActivitiesCsv(): Promise<string> {
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
    .leftJoin(dealsTable, eq(activitiesTable.dealId, dealsTable.id));

  const headers = ["Type", "Title", "Description", "Contact", "Company", "Deal", "User", "Date"];
  const csvRows = rows.map(({ activity: a, user, contact, company, deal }) =>
    [
      a.type,
      a.title,
      a.description,
      contact?.firstName ? `${contact.firstName} ${contact.lastName}`.trim() : "",
      company?.name ?? "",
      deal?.title ?? "",
      user?.name ?? "",
      a.createdAt ? new Date(a.createdAt).toISOString() : "",
    ].map(escape).join(","),
  );
  return [headers.map(escape).join(","), ...csvRows].join("\n");
}

async function buildNotesCsv(): Promise<string> {
  const rows = await db
    .select({
      id: notesTable.id,
      body: notesTable.body,
      entityType: notesTable.entityType,
      entityId: notesTable.entityId,
      createdAt: notesTable.createdAt,
      authorName: usersTable.name,
    })
    .from(notesTable)
    .leftJoin(usersTable, eq(notesTable.authorId, usersTable.id));

  const headers = ["Body", "Entity Type", "Entity ID", "Author", "Created At"];
  const csvRows = rows.map((n) =>
    [
      n.body,
      n.entityType,
      n.entityId,
      n.authorName ?? "",
      n.createdAt ? new Date(n.createdAt).toISOString() : "",
    ].map(escape).join(","),
  );
  return [headers.map(escape).join(","), ...csvRows].join("\n");
}

async function buildCombinedCsv(): Promise<string> {
  const [tasks, activities, notes] = await Promise.all([
    buildTasksCsv(),
    buildActivitiesCsv(),
    buildNotesCsv(),
  ]);
  return `=== TASKS ===\n${tasks}\n\n=== ACTIVITIES ===\n${activities}\n\n=== NOTES ===\n${notes}`;
}

async function buildCsv(dataType: "tasks" | "activities" | "notes" | "combined"): Promise<{ csv: string; filename: string }> {
  switch (dataType) {
    case "tasks":
      return { csv: await buildTasksCsv(), filename: "tasks.csv" };
    case "activities":
      return { csv: await buildActivitiesCsv(), filename: "activities.csv" };
    case "notes":
      return { csv: await buildNotesCsv(), filename: "notes.csv" };
    case "combined":
      return { csv: await buildCombinedCsv(), filename: "crm-export.csv" };
  }
}

// ─── CRUD routes ────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    if (dbUser.role !== "ADMIN") {
      res.status(403).json({ error: "Admins only" });
      return;
    }
    const rows = await db
      .select()
      .from(scheduledExportsTable)
      .orderBy(scheduledExportsTable.createdAt);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to list scheduled exports" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    if (dbUser.role !== "ADMIN") {
      res.status(403).json({ error: "Admins only" });
      return;
    }
    const { frequency, dataType, deliveryEmail } = req.body as {
      frequency?: string;
      dataType?: string;
      deliveryEmail?: string;
    };
    if (!frequency || !["daily", "weekly"].includes(frequency)) {
      res.status(400).json({ error: "frequency must be daily or weekly" });
      return;
    }
    if (!dataType || !["tasks", "activities", "notes", "combined"].includes(dataType)) {
      res.status(400).json({ error: "dataType must be tasks, activities, notes, or combined" });
      return;
    }
    if (!deliveryEmail?.trim()) {
      res.status(400).json({ error: "deliveryEmail is required" });
      return;
    }

    const [row] = await db
      .insert(scheduledExportsTable)
      .values({
        createdById: dbUser.id,
        frequency: frequency as "daily" | "weekly",
        dataType: dataType as "tasks" | "activities" | "notes" | "combined",
        deliveryEmail: deliveryEmail.trim(),
        nextSendAt: nextSendAt(frequency as "daily" | "weekly"),
      })
      .returning();

    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Failed to create scheduled export" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    if (dbUser.role !== "ADMIN") {
      res.status(403).json({ error: "Admins only" });
      return;
    }
    const { paused } = req.body as { paused?: boolean };
    if (typeof paused !== "boolean") {
      res.status(400).json({ error: "paused (boolean) is required" });
      return;
    }
    const [row] = await db
      .update(scheduledExportsTable)
      .set({ paused, updatedAt: new Date() })
      .where(eq(scheduledExportsTable.id, req.params.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch {
    res.status(500).json({ error: "Failed to update scheduled export" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    if (dbUser.role !== "ADMIN") {
      res.status(403).json({ error: "Admins only" });
      return;
    }
    await db
      .delete(scheduledExportsTable)
      .where(eq(scheduledExportsTable.id, req.params.id));
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Failed to delete scheduled export" });
  }
});

// ─── Cron job ────────────────────────────────────────────────────────────────

async function runScheduledExports() {
  const resend = getResend();
  if (!resend) return;

  const now = new Date();
  const due = await db
    .select()
    .from(scheduledExportsTable)
    .where(
      and(
        eq(scheduledExportsTable.paused, false),
        lte(scheduledExportsTable.nextSendAt, now),
      ),
    );

  for (const schedule of due) {
    try {
      const { csv, filename } = await buildCsv(schedule.dataType);
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@resend.dev";
      const fromName = process.env.RESEND_FROM_NAME ?? "MyCRM";
      const label = schedule.dataType.charAt(0).toUpperCase() + schedule.dataType.slice(1);

      await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: schedule.deliveryEmail,
        subject: `Your ${label} Export — ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
        text: `Hi,\n\nPlease find your scheduled ${schedule.frequency} ${label.toLowerCase()} export attached.\n\n—${fromName}`,
        attachments: [
          {
            filename,
            content: Buffer.from(csv, "utf-8").toString("base64"),
          },
        ],
      });

      await db
        .update(scheduledExportsTable)
        .set({
          lastSentAt: now,
          nextSendAt: nextSendAt(schedule.frequency),
          updatedAt: now,
        })
        .where(eq(scheduledExportsTable.id, schedule.id));
    } catch {
      // Leave nextSendAt unchanged so it retries next tick.
    }
  }
}

setInterval(() => {
  runScheduledExports().catch(() => {});
}, 60_000);

export default router;
