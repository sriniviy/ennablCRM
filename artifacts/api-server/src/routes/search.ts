import { Router, type Request, type Response } from "express";
import { db, contactsTable, companiesTable, dealsTable, tasksTable } from "@workspace/db";
import { ilike, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

const LIMIT = 5;

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const q = ((req.query.q as string) || "").trim();
    if (!q) {
      return res.json({ contacts: [], companies: [], deals: [], tasks: [] });
    }

    const pattern = `%${q}%`;

    const [contacts, companies, deals, tasks] = await Promise.all([
      db
        .select({
          id: contactsTable.id,
          firstName: contactsTable.firstName,
          lastName: contactsTable.lastName,
          email: contactsTable.email,
        })
        .from(contactsTable)
        .where(
          or(
            ilike(contactsTable.firstName, pattern),
            ilike(contactsTable.lastName, pattern),
            ilike(contactsTable.email, pattern),
          ),
        )
        .limit(LIMIT),

      db
        .select({ id: companiesTable.id, name: companiesTable.name })
        .from(companiesTable)
        .where(ilike(companiesTable.name, pattern))
        .limit(LIMIT),

      db
        .select({ id: dealsTable.id, title: dealsTable.title, value: dealsTable.value })
        .from(dealsTable)
        .where(ilike(dealsTable.title, pattern))
        .limit(LIMIT),

      db
        .select({ id: tasksTable.id, title: tasksTable.title, completed: tasksTable.completed })
        .from(tasksTable)
        .where(ilike(tasksTable.title, pattern))
        .limit(LIMIT),
    ]);

    return res.json({ contacts, companies, deals, tasks });
  } catch {
    return res.status(500).json({ error: "Search failed" });
  }
});

export default router;
