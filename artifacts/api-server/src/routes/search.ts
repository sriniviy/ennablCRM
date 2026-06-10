import { Router, type Request, type Response } from "express";
import {
  db,
  contactsTable,
  companiesTable,
  dealsTable,
  tasksTable,
  activitiesTable,
  customFieldValuesTable,
} from "@workspace/db";
import { ilike, or, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

const LIMIT = 5;

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const q = ((req.query.q as string) || "").trim();
    if (!q) {
      return res.json({
        contacts: [],
        companies: [],
        deals: [],
        activities: [],
        tasks: [],
      });
    }

    const pattern = `%${q}%`;

    const cfMatch = (objectType: string, idColumn: unknown) =>
      sql`exists (select 1 from ${customFieldValuesTable} where ${customFieldValuesTable.recordId} = ${idColumn} and ${customFieldValuesTable.objectType} = ${objectType} and ${customFieldValuesTable.value} ilike ${pattern})`;

    const [contacts, companies, deals, activities, tasks] = await Promise.all([
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
            cfMatch("contact", contactsTable.id),
          ),
        )
        .limit(LIMIT),

      db
        .select({
          id: companiesTable.id,
          name: companiesTable.name,
          domain: companiesTable.domain,
          domains: companiesTable.domains,
        })
        .from(companiesTable)
        .where(
          or(
            ilike(companiesTable.name, pattern),
            ilike(companiesTable.domain, pattern),
            sql`array_to_string(${companiesTable.domains}, ' ') ilike ${pattern}`,
            cfMatch("company", companiesTable.id),
          ),
        )
        .limit(LIMIT),

      db
        .select({ id: dealsTable.id, title: dealsTable.title, value: dealsTable.value })
        .from(dealsTable)
        .where(or(ilike(dealsTable.title, pattern), cfMatch("deal", dealsTable.id)))
        .limit(LIMIT),

      db
        .select({
          id: activitiesTable.id,
          type: activitiesTable.type,
          title: activitiesTable.title,
          emailSubject: activitiesTable.emailSubject,
          contactId: activitiesTable.contactId,
          companyId: activitiesTable.companyId,
          dealId: activitiesTable.dealId,
        })
        .from(activitiesTable)
        .where(
          or(
            ilike(activitiesTable.title, pattern),
            ilike(activitiesTable.emailSubject, pattern),
            ilike(activitiesTable.emailBody, pattern),
            cfMatch("activity", activitiesTable.id),
          ),
        )
        .limit(LIMIT),

      db
        .select({ id: tasksTable.id, title: tasksTable.title, completed: tasksTable.completed })
        .from(tasksTable)
        .where(ilike(tasksTable.title, pattern))
        .limit(LIMIT),
    ]);

    return res.json({ contacts, companies, deals, activities, tasks });
  } catch {
    return res.status(500).json({ error: "Search failed" });
  }
});

export default router;
