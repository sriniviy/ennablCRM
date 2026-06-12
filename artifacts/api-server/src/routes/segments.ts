import { Router, type Request, type Response } from "express";
import { db, segmentsTable, contactsTable } from "@workspace/db";
import { eq, desc, and, inArray, or, ilike, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

interface SegmentFilter {
  status?: string;
  tags?: string[];
  ennablUser?: boolean;
  emailMarketingContact?: boolean;
  companyId?: string;
}

export async function evaluateSegmentFilter(filter: SegmentFilter): Promise<string[]> {
  const conditions = [];

  if (filter.status) {
    conditions.push(eq(contactsTable.status, filter.status as typeof contactsTable.$inferSelect["status"]));
  }
  if (filter.ennablUser !== undefined) {
    conditions.push(eq(contactsTable.ennablUser, filter.ennablUser));
  }
  if (filter.emailMarketingContact !== undefined) {
    conditions.push(eq(contactsTable.emailMarketingContact, filter.emailMarketingContact));
  }
  if (filter.companyId) {
    conditions.push(eq(contactsTable.companyId, filter.companyId));
  }
  if (filter.tags && filter.tags.length > 0) {
    conditions.push(sql`${contactsTable.tags} && ARRAY[${sql.join(filter.tags.map(t => sql`${t}::text`), sql`, `)}]::text[]`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const contacts = await db
    .select({ id: contactsTable.id })
    .from(contactsTable)
    .where(where);

  return contacts.map(c => c.id);
}

export async function countSegmentFilter(filter: SegmentFilter): Promise<number> {
  const conditions = [];

  if (filter.status) {
    conditions.push(eq(contactsTable.status, filter.status as typeof contactsTable.$inferSelect["status"]));
  }
  if (filter.ennablUser !== undefined) {
    conditions.push(eq(contactsTable.ennablUser, filter.ennablUser));
  }
  if (filter.emailMarketingContact !== undefined) {
    conditions.push(eq(contactsTable.emailMarketingContact, filter.emailMarketingContact));
  }
  if (filter.companyId) {
    conditions.push(eq(contactsTable.companyId, filter.companyId));
  }
  if (filter.tags && filter.tags.length > 0) {
    conditions.push(sql`${contactsTable.tags} && ARRAY[${sql.join(filter.tags.map(t => sql`${t}::text`), sql`, `)}]::text[]`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactsTable)
    .where(where);

  return count;
}

router.get("/", requireAuth, async (_req: Request, res: Response) => {
  try {
    const segments = await db
      .select()
      .from(segmentsTable)
      .orderBy(desc(segmentsTable.createdAt));
    res.json(segments);
  } catch {
    res.status(500).json({ error: "Failed to list segments" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const [segment] = await db
      .select()
      .from(segmentsTable)
      .where(eq(segmentsTable.id, req.params.id as string))
      .limit(1);
    if (!segment) { res.status(404).json({ error: "Segment not found" }); return; }
    res.json(segment);
  } catch {
    res.status(500).json({ error: "Failed to get segment" });
  }
});

router.get("/:id/count", requireAuth, async (req: Request, res: Response) => {
  try {
    const [segment] = await db
      .select()
      .from(segmentsTable)
      .where(eq(segmentsTable.id, req.params.id as string))
      .limit(1);
    if (!segment) { res.status(404).json({ error: "Segment not found" }); return; }

    const filter: SegmentFilter = JSON.parse(segment.filterJson || "{}");
    const count = await countSegmentFilter(filter);
    res.json({ count });
  } catch {
    res.status(500).json({ error: "Failed to count segment" });
  }
});

router.post("/count", requireAuth, async (req: Request, res: Response) => {
  try {
    const filter: SegmentFilter = req.body.filter ?? {};
    const count = await countSegmentFilter(filter);
    res.json({ count });
  } catch {
    res.status(500).json({ error: "Failed to count" });
  }
});

router.post("/evaluate", requireAuth, async (req: Request, res: Response) => {
  try {
    const filter: SegmentFilter = req.body.filter ?? {};
    const ids = await evaluateSegmentFilter(filter);
    res.json({ ids });
  } catch {
    res.status(500).json({ error: "Failed to evaluate segment" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body as { name: string; filter: SegmentFilter };
    if (!body.name) { res.status(400).json({ error: "name is required" }); return; }
    const [segment] = await db
      .insert(segmentsTable)
      .values({
        name: body.name,
        filterJson: JSON.stringify(body.filter ?? {}),
        createdBy: (req as AuthRequest).user?.id ?? null,
      })
      .returning();
    res.status(201).json(segment);
  } catch {
    res.status(500).json({ error: "Failed to create segment" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const [existing] = await db.select().from(segmentsTable).where(eq(segmentsTable.id, req.params.id as string)).limit(1);
    if (!existing) { res.status(404).json({ error: "Segment not found" }); return; }

    const body = req.body as { name?: string; filter?: SegmentFilter };
    const [updated] = await db
      .update(segmentsTable)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.filter !== undefined ? { filterJson: JSON.stringify(body.filter) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(segmentsTable.id, req.params.id as string))
      .returning();
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update segment" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const [existing] = await db.select().from(segmentsTable).where(eq(segmentsTable.id, req.params.id as string)).limit(1);
    if (!existing) { res.status(404).json({ error: "Segment not found" }); return; }
    await db.delete(segmentsTable).where(eq(segmentsTable.id, req.params.id as string));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete segment" });
  }
});

export default router;
