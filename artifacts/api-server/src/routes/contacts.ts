import { Router, type Request, type Response } from "express";
import { db, contactsTable, companiesTable, usersTable } from "@workspace/db";
import { eq, ilike, and, or, sql, asc, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { logActivity } from "../lib/activity";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, status, companyId, page = "1", limit = "50" } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

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
        .limit(parseInt(limit))
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
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to list contacts" });
  }
});

router.post("/import", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { csv } = req.body as { csv: string };
    if (!csv) {
      res.status(400).json({ error: "csv field is required" });
      return;
    }

    const lines = csv.trim().split("\n");
    if (lines.length < 2) {
      res.status(400).json({ error: "CSV must have a header row and at least one data row" });
      return;
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
    const rows = lines.slice(1);

    const contacts: Array<typeof contactsTable.$inferInsert> = [];
    for (const row of rows) {
      const cols = row.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });

      const firstName = obj["firstname"] || obj["first_name"] || "";
      const lastName = obj["lastname"] || obj["last_name"] || "";
      if (!firstName && !lastName) continue;

      contacts.push({
        firstName: firstName || "Unknown",
        lastName: lastName || "",
        email: obj["email"] || null,
        phone: obj["phone"] || null,
        title: obj["title"] || obj["jobtitle"] || null,
        status: "LEAD",
      });
    }

    if (contacts.length === 0) {
      res.status(400).json({ error: "No valid contacts found in CSV" });
      return;
    }

    const inserted = await db.insert(contactsTable).values(contacts).returning();

    await logActivity({
      type: "CONTACT_CREATED",
      title: `Imported ${inserted.length} contacts`,
      userId: dbUser.id,
    });

    res.status(201).json({ imported: inserted.length, contacts: inserted });
  } catch (err) {
    res.status(500).json({ error: "Failed to import contacts" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
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

    res.json({
      ...row.contact,
      company: row.company?.id ? row.company : null,
      assignee: row.assignee?.id ? row.assignee : null,
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
    const { id } = req.params;
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
    const { id } = req.params;
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
