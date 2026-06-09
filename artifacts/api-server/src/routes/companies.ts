import { Router, type Request, type Response } from "express";
import { db, companiesTable, contactsTable, dealsTable, dealStagesTable } from "@workspace/db";
import { eq, ilike, and, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, page = "1", limit = "50" } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = search ? ilike(companiesTable.name, `%${search}%`) : undefined;

    const [companies, [{ count }]] = await Promise.all([
      db
        .select({
          company: companiesTable,
          contactCount: sql<number>`count(distinct ${contactsTable.id})::int`,
          openDeals: sql<number>`count(distinct ${dealsTable.id})::int`,
        })
        .from(companiesTable)
        .leftJoin(contactsTable, eq(contactsTable.companyId, companiesTable.id))
        .leftJoin(
          dealsTable,
          and(
            eq(dealsTable.companyId, companiesTable.id),
          ),
        )
        .where(where)
        .groupBy(companiesTable.id)
        .orderBy(desc(companiesTable.createdAt))
        .limit(parseInt(limit))
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(companiesTable)
        .where(where),
    ]);

    res.json({
      data: companies.map(({ company, contactCount, openDeals }) => ({
        ...company,
        contactCount,
        openDeals,
      })),
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch {
    res.status(500).json({ error: "Failed to list companies" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, id))
      .limit(1);

    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const [contacts, deals, [{ pipelineValue }]] = await Promise.all([
      db
        .select({
          id: contactsTable.id,
          firstName: contactsTable.firstName,
          lastName: contactsTable.lastName,
          email: contactsTable.email,
          title: contactsTable.title,
          status: contactsTable.status,
        })
        .from(contactsTable)
        .where(eq(contactsTable.companyId, id))
        .orderBy(contactsTable.firstName),
      db
        .select({
          deal: dealsTable,
          stage: { id: dealStagesTable.id, name: dealStagesTable.name, color: dealStagesTable.color },
        })
        .from(dealsTable)
        .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(eq(dealsTable.companyId, id))
        .orderBy(desc(dealsTable.createdAt)),
      db
        .select({ pipelineValue: sql<number>`coalesce(sum(${dealsTable.value}), 0)::float` })
        .from(dealsTable)
        .where(eq(dealsTable.companyId, id)),
    ]);

    res.json({
      ...company,
      contacts,
      deals: deals.map(({ deal, stage }) => ({ ...deal, stage })),
      pipelineValue,
    });
  } catch {
    res.status(500).json({ error: "Failed to get company" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body.name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const [company] = await db.insert(companiesTable).values({
      name: body.name,
      domain: body.domain ?? null,
      industry: body.industry ?? null,
      size: body.size ?? null,
      website: body.website ?? null,
      phone: body.phone ?? null,
      address: body.address ?? null,
      city: body.city ?? null,
      country: body.country ?? null,
    }).returning();

    res.status(201).json(company);
  } catch {
    res.status(500).json({ error: "Failed to create company" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [existing] = await db.select().from(companiesTable).where(eq(companiesTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const [updated] = await db
      .update(companiesTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(companiesTable.id, id))
      .returning();

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update company" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [existing] = await db.select().from(companiesTable).where(eq(companiesTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    await db.delete(companiesTable).where(eq(companiesTable.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete company" });
  }
});

export default router;
