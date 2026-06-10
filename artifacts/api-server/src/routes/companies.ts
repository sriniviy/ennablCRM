import { Router, type Request, type Response } from "express";
import { db, companiesTable, contactsTable, dealsTable, dealStagesTable, activitiesTable, notesTable, customFieldDefinitionsTable, customFieldValuesTable } from "@workspace/db";
import { eq, ilike, and, or, inArray, sql, desc, asc } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import {
  computeDuplicateGroups,
  resolveScalar,
  unionArrays,
  parseMergeInput,
  type DuplicateKeyRow,
} from "../lib/merge";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, status, memberOf, page = "1", pageSize = "50" } = req.query as Record<string, string>;
    const ps = parseInt(pageSize);
    const pg = parseInt(page);
    const offset = (pg - 1) * ps;

    const conditions = [];
    if (search) conditions.push(ilike(companiesTable.name, `%${search}%`));
    if (status) conditions.push(eq(companiesTable.status, status as NonNullable<typeof companiesTable.$inferSelect["status"]>));
    if (memberOf) conditions.push(sql`${companiesTable.memberOf} @> ARRAY[${memberOf}]::text[]`);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [companies, [{ count }]] = await Promise.all([
      db
        .select({
          company: companiesTable,
          contactCount: sql<number>`count(distinct ${contactsTable.id})::int`,
          openDeals: sql<number>`count(distinct ${dealsTable.id})::int`,
        })
        .from(companiesTable)
        .leftJoin(contactsTable, eq(contactsTable.companyId, companiesTable.id))
        .leftJoin(dealsTable, and(eq(dealsTable.companyId, companiesTable.id)))
        .where(where)
        .groupBy(companiesTable.id)
        .orderBy(desc(companiesTable.createdAt))
        .limit(ps)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(companiesTable).where(where),
    ]);

    res.json({
      data: companies.map(({ company, contactCount, openDeals }) => ({
        ...company,
        contactCount,
        openDeals,
      })),
      total: count,
      page: pg,
      pageSize: ps,
      hasMore: count > pg * ps,
    });
  } catch {
    res.status(500).json({ error: "Failed to list companies" });
  }
});

router.get("/export", requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, fields } = req.query as Record<string, string>;
    const where = search ? ilike(companiesTable.name, `%${search}%`) : undefined;

    const rows = await db
      .select()
      .from(companiesTable)
      .where(where)
      .orderBy(desc(companiesTable.createdAt));

    const escape = (v: string | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    type CompanyColKey = "name" | "domain" | "industry" | "size" | "website" | "phone" | "address" | "city" | "country" | "createdAt";
    const ALL_COLS: { key: CompanyColKey; header: string }[] = [
      { key: "name", header: "Name" },
      { key: "domain", header: "Domain" },
      { key: "industry", header: "Industry" },
      { key: "size", header: "Size" },
      { key: "website", header: "Website" },
      { key: "phone", header: "Phone" },
      { key: "address", header: "Address" },
      { key: "city", header: "City" },
      { key: "country", header: "Country" },
      { key: "createdAt", header: "Created At" },
    ];

    const selectedKeys = fields
      ? new Set(fields.split(",").map((f) => f.trim()).filter(Boolean))
      : new Set(ALL_COLS.map((c) => c.key));
    const cols = ALL_COLS.filter((c) => selectedKeys.has(c.key));

    type CompanyRow = typeof rows[number];
    const getValue = (key: CompanyColKey, c: CompanyRow) => {
      switch (key) {
        case "name": return c.name;
        case "domain": return c.domain;
        case "industry": return c.industry;
        case "size": return c.size;
        case "website": return c.website;
        case "phone": return c.phone;
        case "address": return c.address;
        case "city": return c.city;
        case "country": return c.country;
        case "createdAt": return c.createdAt ? new Date(c.createdAt).toISOString() : "";
      }
    };

    const [cfDefs, cfValues] = await Promise.all([
      db.select().from(customFieldDefinitionsTable)
        .where(eq(customFieldDefinitionsTable.objectType, "company"))
        .orderBy(asc(customFieldDefinitionsTable.displayOrder)),
      rows.length > 0
        ? db.select().from(customFieldValuesTable)
            .where(and(
              eq(customFieldValuesTable.objectType, "company"),
              inArray(customFieldValuesTable.recordId, rows.map(r => r.id)),
            ))
        : Promise.resolve([]),
    ]);

    const cfValueMap = new Map<string, Map<string, string | null>>();
    for (const v of cfValues) {
      if (!cfValueMap.has(v.recordId)) cfValueMap.set(v.recordId, new Map());
      cfValueMap.get(v.recordId)!.set(v.fieldId, v.value);
    }

    const headers = [
      ...cols.map((c) => c.header),
      ...cfDefs.map((d) => d.label),
    ];
    const csvRows = rows.map((c) => {
      const cfRow = cfValueMap.get(c.id) ?? new Map<string, string | null>();
      return [
        ...cols.map((col) => escape(getValue(col.key, c))),
        ...cfDefs.map((d) => escape(cfRow.get(d.id) ?? null)),
      ].join(",");
    });

    const csv = [headers.map(escape).join(","), ...csvRows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"companies.csv\"");
    res.send(csv);
  } catch {
    res.status(500).json({ error: "Failed to export companies" });
  }
});

router.get("/duplicates", requireAuth, async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      select id, 'name:' || lower(trim(name)) as key
        from ${companiesTable}
        where trim(name) <> ''
      union all
      select id, 'domain:' || lower(trim(domain)) as key
        from ${companiesTable}
        where domain is not null and trim(domain) <> ''
      union all
      select c.id, 'domain:' || lower(trim(d)) as key
        from ${companiesTable} c, unnest(c.domains) as d
        where trim(d) <> ''
    `);
    const keyRows = (result.rows as { id: string; key: string }[]).map<DuplicateKeyRow>((r) => ({
      id: r.id,
      key: r.key,
    }));

    const groups = computeDuplicateGroups(keyRows);
    if (groups.length === 0) {
      res.json({ groups: [] });
      return;
    }

    const allIds = [...new Set(groups.flatMap((g) => g.ids))];
    const records = await db
      .select({
        company: companiesTable,
        contactCount: sql<number>`count(distinct ${contactsTable.id})::int`,
        dealCount: sql<number>`count(distinct ${dealsTable.id})::int`,
      })
      .from(companiesTable)
      .leftJoin(contactsTable, eq(contactsTable.companyId, companiesTable.id))
      .leftJoin(dealsTable, eq(dealsTable.companyId, companiesTable.id))
      .where(inArray(companiesTable.id, allIds))
      .groupBy(companiesTable.id);

    const byId = new Map(
      records.map(({ company, contactCount, dealCount }) => [
        company.id,
        { ...company, contactCount, dealCount },
      ]),
    );

    res.json({
      groups: groups
        .map((g) => ({
          matchedOn: g.matchedOn,
          records: g.ids.map((id) => byId.get(id)).filter(Boolean),
        }))
        .filter((g) => g.records.length > 1),
    });
  } catch {
    res.status(500).json({ error: "Failed to detect duplicate companies" });
  }
});

router.post("/merge", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    let primaryId: string;
    let loserIds: string[];
    try {
      ({ primaryId, loserIds } = parseMergeInput(req.body));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }

    const merged = await db.transaction(async (tx) => {
      const involved = await tx
        .select()
        .from(companiesTable)
        .where(inArray(companiesTable.id, [primaryId, ...loserIds]));

      const primary = involved.find((c) => c.id === primaryId);
      const losers = loserIds
        .map((id) => involved.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c));

      if (!primary) throw new Error("PRIMARY_NOT_FOUND");
      if (losers.length === 0) throw new Error("LOSERS_NOT_FOUND");

      const merge = {
        name: resolveScalar(primary.name, losers.map((l) => l.name)),
        domain: resolveScalar(primary.domain, losers.map((l) => l.domain)),
        domains: unionArrays(
          primary.domains,
          ...losers.map((l) => l.domains),
          primary.domain ? [primary.domain] : [],
          ...losers.map((l) => (l.domain ? [l.domain] : [])),
        ),
        status: resolveScalar(primary.status, losers.map((l) => l.status)),
        productLicensed: unionArrays(primary.productLicensed, ...losers.map((l) => l.productLicensed)),
        memberOf: unionArrays(primary.memberOf, ...losers.map((l) => l.memberOf)),
        assignedCsmId: resolveScalar(primary.assignedCsmId, losers.map((l) => l.assignedCsmId)),
        estimatedAnnualRevenue: resolveScalar(primary.estimatedAnnualRevenue, losers.map((l) => l.estimatedAnnualRevenue)),
        numberOfEmployees: resolveScalar(primary.numberOfEmployees, losers.map((l) => l.numberOfEmployees)),
        industry: resolveScalar(primary.industry, losers.map((l) => l.industry)),
        size: resolveScalar(primary.size, losers.map((l) => l.size)),
        website: resolveScalar(primary.website, losers.map((l) => l.website)),
        phone: resolveScalar(primary.phone, losers.map((l) => l.phone)),
        address: resolveScalar(primary.address, losers.map((l) => l.address)),
        city: resolveScalar(primary.city, losers.map((l) => l.city)),
        country: resolveScalar(primary.country, losers.map((l) => l.country)),
        updatedAt: new Date(),
      };

      const actualLoserIds = losers.map((l) => l.id);

      // Re-point all related records to the primary company.
      await tx.update(contactsTable).set({ companyId: primaryId }).where(inArray(contactsTable.companyId, actualLoserIds));
      await tx.update(dealsTable).set({ companyId: primaryId }).where(inArray(dealsTable.companyId, actualLoserIds));
      await tx.update(activitiesTable).set({ companyId: primaryId }).where(inArray(activitiesTable.companyId, actualLoserIds));
      await tx
        .update(notesTable)
        .set({ entityId: primaryId })
        .where(and(eq(notesTable.entityType, "company"), inArray(notesTable.entityId, actualLoserIds)));

      await tx.delete(companiesTable).where(inArray(companiesTable.id, actualLoserIds));

      // Update the primary last so back-filled unique fields (e.g. domain) do not
      // collide with loser rows that still exist during the transaction.
      const [updated] = await tx
        .update(companiesTable)
        .set(merge)
        .where(eq(companiesTable.id, primaryId))
        .returning();

      return { updated, primary, losers };
    });

    await logAudit({
      action: "MERGE",
      objectType: "company",
      objectId: merged.updated.id,
      objectLabel: merged.updated.name,
      actorId: dbUser.id,
      actorName: dbUser.name,
      before: { primary: merged.primary, merged: merged.losers },
      after: merged.updated,
    });

    res.json(merged.updated);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "PRIMARY_NOT_FOUND") {
      res.status(404).json({ error: "Primary company not found" });
      return;
    }
    if (msg === "LOSERS_NOT_FOUND") {
      res.status(404).json({ error: "No valid companies to merge were found" });
      return;
    }
    res.status(500).json({ error: "Failed to merge companies" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, id))
      .limit(1);

    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const [contacts, deals, [{ openPipelineValue }]] = await Promise.all([
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
          stage: {
            id: dealStagesTable.id,
            name: dealStagesTable.name,
            color: dealStagesTable.color,
          },
        })
        .from(dealsTable)
        .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(eq(dealsTable.companyId, id))
        .orderBy(desc(dealsTable.createdAt)),
      db
        .select({ openPipelineValue: sql<number>`coalesce(sum(${dealsTable.value}), 0)::float` })
        .from(dealsTable)
        .where(eq(dealsTable.companyId, id)),
    ]);

    res.json({
      ...company,
      contacts,
      deals: deals.map(({ deal, stage }) => ({ ...deal, stage })),
      openPipelineValue,
    });
  } catch {
    res.status(500).json({ error: "Failed to get company" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const body = req.body as {
      name: string;
      domain?: string;
      domains?: string[];
      status?: typeof companiesTable.$inferSelect["status"];
      productLicensed?: string[];
      memberOf?: string[];
      assignedCsmId?: string;
      estimatedAnnualRevenue?: number;
      numberOfEmployees?: number;
      industry?: string;
      size?: string;
      website?: string;
      phone?: string;
      address?: string;
      city?: string;
      country?: string;
    };
    if (!body.name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const [company] = await db
      .insert(companiesTable)
      .values({
        name: body.name,
        domain: body.domain ?? null,
        domains: body.domains ?? [],
        status: body.status ?? null,
        productLicensed: body.productLicensed ?? [],
        memberOf: body.memberOf ?? [],
        assignedCsmId: body.assignedCsmId ?? null,
        estimatedAnnualRevenue: body.estimatedAnnualRevenue ?? null,
        numberOfEmployees: body.numberOfEmployees ?? null,
        industry: body.industry ?? null,
        size: body.size ?? null,
        website: body.website ?? null,
        phone: body.phone ?? null,
        address: body.address ?? null,
        city: body.city ?? null,
        country: body.country ?? null,
      })
      .returning();

    await logAudit({
      action: "CREATE",
      objectType: "company",
      objectId: company.id,
      objectLabel: company.name,
      actorId: dbUser.id,
      actorName: dbUser.name,
      after: company,
    });

    res.status(201).json(company);
  } catch {
    res.status(500).json({ error: "Failed to create company" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const id = req.params.id as string;
    const [existing] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const [updated] = await db
      .update(companiesTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(companiesTable.id, id))
      .returning();

    await logAudit({
      action: "UPDATE",
      objectType: "company",
      objectId: updated.id,
      objectLabel: updated.name,
      actorId: dbUser.id,
      actorName: dbUser.name,
      before: existing,
      after: updated,
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update company" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const id = req.params.id as string;
    const [existing] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    await db.delete(companiesTable).where(eq(companiesTable.id, id));

    await logAudit({
      action: "DELETE",
      objectType: "company",
      objectId: existing.id,
      objectLabel: existing.name,
      actorId: dbUser.id,
      actorName: dbUser.name,
      before: existing,
    });

    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete company" });
  }
});

export default router;
