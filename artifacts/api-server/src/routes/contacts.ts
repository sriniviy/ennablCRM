import { Router, type Request, type Response } from "express";
import { db, contactsTable, companiesTable, usersTable, dealsTable, dealStagesTable, tasksTable, activitiesTable } from "@workspace/db";
import { eq, ilike, and, or, sql, asc, desc, isNotNull } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { logActivity } from "../lib/activity";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, status, companyId, tag, page = "1", pageSize = "50" } = req.query as Record<string, string>;
    const ps = parseInt(pageSize);
    const pg = parseInt(page);
    const offset = (pg - 1) * ps;

    const conditions = [];
    if (search) {
      conditions.push(
        or(
          ilike(contactsTable.firstName, `%${search}%`),
          ilike(contactsTable.lastName, `%${search}%`),
          ilike(contactsTable.email, `%${search}%`),
        ),
      );
    }
    if (status) {
      conditions.push(eq(contactsTable.status, status as typeof contactsTable.$inferSelect["status"]));
    }
    if (companyId) {
      conditions.push(eq(contactsTable.companyId, companyId));
    }
    if (tag) {
      conditions.push(sql`${contactsTable.tags} @> ARRAY[${tag}]::text[]`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [contacts, [{ count }]] = await Promise.all([
      db
        .select({
          contact: contactsTable,
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
        .from(contactsTable)
        .leftJoin(companiesTable, eq(contactsTable.companyId, companiesTable.id))
        .leftJoin(usersTable, eq(contactsTable.assigneeId, usersTable.id))
        .where(where)
        .orderBy(desc(contactsTable.createdAt))
        .limit(ps)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(contactsTable)
        .where(where),
    ]);

    res.json({
      data: contacts.map(({ contact, company, assignee }) => ({
        ...contact,
        company: company?.id ? company : null,
        assignee: assignee?.id ? assignee : null,
      })),
      total: count,
      page: pg,
      pageSize: ps,
      hasMore: count > pg * ps,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to list contacts" });
  }
});

router.post("/import", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { rows, mapping } = req.body as {
      rows: Record<string, string>[];
      mapping: Record<string, string>;
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "rows array is required" });
      return;
    }
    if (!mapping || typeof mapping !== "object") {
      res.status(400).json({ error: "mapping object is required" });
      return;
    }

    const existingRows = await db
      .select({ email: contactsTable.email })
      .from(contactsTable)
      .where(isNotNull(contactsTable.email));
    const existingEmails = new Set(existingRows.map((c) => c.email?.toLowerCase()));

    const toInsert: Array<typeof contactsTable.$inferInsert> = [];
    const errors: string[] = [];
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mapped: Record<string, string> = {};
      for (const [col, field] of Object.entries(mapping)) {
        mapped[field] = row[col] ?? "";
      }

      const firstName = mapped["firstName"] || "";
      const lastName = mapped["lastName"] || "";
      if (!firstName && !lastName) {
        errors.push(`Row ${i + 1}: missing firstName and lastName`);
        continue;
      }

      const email = mapped["email"] ? mapped["email"].toLowerCase() : null;
      if (email && existingEmails.has(email)) {
        skipped++;
        continue;
      }

      toInsert.push({
        firstName: firstName || "Unknown",
        lastName: lastName || "",
        email: email || null,
        phone: mapped["phone"] || null,
        title: mapped["title"] || null,
        status: "LEAD",
      });

      if (email) existingEmails.add(email);
    }

    let created = 0;
    if (toInsert.length > 0) {
      const inserted = await db.insert(contactsTable).values(toInsert).returning();
      created = inserted.length;
      await logActivity({
        type: "CONTACT_CREATED",
        title: `Imported ${created} contacts`,
        userId: dbUser.id,
      });
    }

    res.status(200).json({ created, skipped, errors });
  } catch {
    res.status(500).json({ error: "Failed to import contacts" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [row] = await db
      .select({
        contact: contactsTable,
        company: {
          id: companiesTable.id,
          name: companiesTable.name,
          domain: companiesTable.domain,
          industry: companiesTable.industry,
        },
        assignee: {
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          avatarUrl: usersTable.avatarUrl,
        },
      })
      .from(contactsTable)
      .leftJoin(companiesTable, eq(contactsTable.companyId, companiesTable.id))
      .leftJoin(usersTable, eq(contactsTable.assigneeId, usersTable.id))
      .where(eq(contactsTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    const [deals, tasks, activities] = await Promise.all([
      db
        .select({
          deal: dealsTable,
          stage: { id: dealStagesTable.id, name: dealStagesTable.name, color: dealStagesTable.color },
        })
        .from(dealsTable)
        .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(eq(dealsTable.contactId, id))
        .orderBy(desc(dealsTable.createdAt))
        .limit(20),
      db
        .select()
        .from(tasksTable)
        .where(eq(tasksTable.contactId, id))
        .orderBy(asc(tasksTable.dueDate), desc(tasksTable.createdAt))
        .limit(20),
      db
        .select({
          activity: activitiesTable,
          user: { id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl },
        })
        .from(activitiesTable)
        .leftJoin(usersTable, eq(activitiesTable.userId, usersTable.id))
        .where(eq(activitiesTable.contactId, id))
        .orderBy(desc(activitiesTable.createdAt))
        .limit(50),
    ]);

    res.json({
      ...row.contact,
      company: row.company?.id ? row.company : null,
      assignee: row.assignee?.id ? row.assignee : null,
      deals: deals.map(({ deal, stage }) => ({ ...deal, stage })),
      tasks,
      activities: activities.map(({ activity, user }) => ({
        ...activity,
        user: user?.id ? user : null,
      })),
    });
  } catch {
    res.status(500).json({ error: "Failed to get contact" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const body = req.body;

    if (!body.firstName || !body.lastName) {
      res.status(400).json({ error: "firstName and lastName are required" });
      return;
    }

    const [contact] = await db.insert(contactsTable).values({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email ?? null,
      phone: body.phone ?? null,
      title: body.title ?? null,
      status: body.status ?? "LEAD",
      tags: body.tags ?? [],
      notes: body.notes ?? null,
      linkedIn: body.linkedIn ?? null,
      companyId: body.companyId ?? null,
      assigneeId: body.assigneeId ?? null,
    }).returning();

    await logActivity({
      type: "CONTACT_CREATED",
      title: `Created contact ${contact.firstName} ${contact.lastName}`,
      userId: dbUser.id,
      contactId: contact.id,
    });

    res.status(201).json(contact);
  } catch {
    res.status(500).json({ error: "Failed to create contact" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const body = req.body;

    const [existing] = await db.select().from(contactsTable).where(eq(contactsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    const [updated] = await db
      .update(contactsTable)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(contactsTable.id, id))
      .returning();

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update contact" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [existing] = await db.select().from(contactsTable).where(eq(contactsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    await db.delete(contactsTable).where(eq(contactsTable.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

export default router;
