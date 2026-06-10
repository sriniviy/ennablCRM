import { Router, type Request, type Response } from "express";
import { db, contactsTable, companiesTable, usersTable, dealsTable, dealStagesTable, tasksTable, activitiesTable, notesTable } from "@workspace/db";
import { eq, ne, ilike, and, or, inArray, sql, asc, desc, isNotNull } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { logActivity } from "../lib/activity";
import { logAudit } from "../lib/audit";
import {
  resolveContactCompany,
  matchContactCompany,
  buildCompanyDomainIndex,
  loadBlockedDomains,
} from "../lib/domain-matching";
import {
  computeDuplicateGroups,
  resolveScalar,
  unionArrays,
  resolveBool,
  parseMergeInput,
  type DuplicateKeyRow,
} from "../lib/merge";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, status, reviewStatus, assigneeId, companyId, tag, page = "1", pageSize = "50" } = req.query as Record<string, string>;
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
    if (reviewStatus) {
      conditions.push(eq(contactsTable.reviewStatus, reviewStatus as typeof contactsTable.$inferSelect["reviewStatus"]));
    } else {
      // By default hide suppressed contacts from normal lists. Suppressed contacts are
      // only visible when explicitly filtering by reviewStatus=SUPPRESSED.
      conditions.push(ne(contactsTable.reviewStatus, "SUPPRESSED" as typeof contactsTable.$inferSelect["reviewStatus"]));
    }
    if (assigneeId) {
      conditions.push(eq(contactsTable.assigneeId, assigneeId));
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

    const [domainIndex, blockedDomains] = await Promise.all([
      buildCompanyDomainIndex(),
      loadBlockedDomains(),
    ]);

    const toInsert: Array<typeof contactsTable.$inferInsert> = [];
    const skipped: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mapped: Record<string, string> = {};
      for (const [col, field] of Object.entries(mapping)) {
        mapped[field] = row[col] ?? "";
      }

      const firstName = mapped["firstName"] || "";
      const lastName = mapped["lastName"] || "";
      if (!firstName && !lastName) {
        skipped.push({ row: i + 2, reason: "Missing first and last name" });
        continue;
      }

      const email = mapped["email"] ? mapped["email"].toLowerCase() : null;
      if (email && existingEmails.has(email)) {
        skipped.push({ row: i + 2, reason: `Email address already exists (${mapped["email"]})` });
        continue;
      }

      const match = matchContactCompany(email, { domainIndex, blockedDomains });

      toInsert.push({
        firstName: firstName || "Unknown",
        lastName: lastName || "",
        email: email || null,
        phone: mapped["phone"] || null,
        title: mapped["title"] || null,
        status: "LEAD",
        companyId: match.isInternal ? null : match.companyId,
        reviewStatus: match.isInternal ? "AUTO_CREATED" : (match.reviewStatus ?? "AUTO_CREATED"),
      });

      if (email) existingEmails.add(email);
    }

    let imported = 0;
    if (toInsert.length > 0) {
      const inserted = await db.insert(contactsTable).values(toInsert).returning();
      imported = inserted.length;
      await logActivity({
        type: "CONTACT_CREATED",
        title: `Imported ${imported} contacts`,
        userId: dbUser.id,
      });
      await Promise.all(
        inserted.map((contact) =>
          logAudit({
            action: "CREATE",
            objectType: "contact",
            objectId: contact.id,
            objectLabel: `${contact.firstName} ${contact.lastName}`.trim(),
            actorId: dbUser.id,
            actorName: dbUser.name,
            after: contact as Record<string, unknown>,
          }),
        ),
      );
    }

    res.status(200).json({ imported, skipped });
  } catch {
    res.status(500).json({ error: "Failed to import contacts" });
  }
});

router.get("/export", requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, status, companyId, tag, fields } = req.query as Record<string, string>;

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
    // Suppressed contacts are never included in exports.
    conditions.push(ne(contactsTable.reviewStatus, "SUPPRESSED" as typeof contactsTable.$inferSelect["reviewStatus"]));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        contact: contactsTable,
        companyName: companiesTable.name,
      })
      .from(contactsTable)
      .leftJoin(companiesTable, eq(contactsTable.companyId, companiesTable.id))
      .where(where)
      .orderBy(desc(contactsTable.createdAt));

    const escape = (v: string | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    type ContactColKey = "firstName" | "lastName" | "email" | "phone" | "title" | "status" | "company" | "tags" | "notes" | "linkedIn" | "createdAt";
    const ALL_COLS: { key: ContactColKey; header: string }[] = [
      { key: "firstName", header: "First Name" },
      { key: "lastName", header: "Last Name" },
      { key: "email", header: "Email" },
      { key: "phone", header: "Phone" },
      { key: "title", header: "Title" },
      { key: "status", header: "Status" },
      { key: "company", header: "Company" },
      { key: "tags", header: "Tags" },
      { key: "notes", header: "Notes" },
      { key: "linkedIn", header: "LinkedIn" },
      { key: "createdAt", header: "Created At" },
    ];

    const selectedKeys = fields
      ? new Set(fields.split(",").map((f) => f.trim()).filter(Boolean))
      : new Set(ALL_COLS.map((c) => c.key));
    const cols = ALL_COLS.filter((c) => selectedKeys.has(c.key));

    const getValue = (key: ContactColKey, contact: typeof rows[number]["contact"], companyName: string | null) => {
      switch (key) {
        case "firstName": return contact.firstName;
        case "lastName": return contact.lastName;
        case "email": return contact.email;
        case "phone": return contact.phone;
        case "title": return contact.title;
        case "status": return contact.status;
        case "company": return companyName;
        case "tags": return (contact.tags ?? []).join(";");
        case "notes": return contact.notes;
        case "linkedIn": return contact.linkedIn;
        case "createdAt": return contact.createdAt ? new Date(contact.createdAt).toISOString() : "";
      }
    };

    const headers = cols.map((c) => c.header);
    const csvRows = rows.map(({ contact, companyName }) =>
      cols.map((c) => escape(getValue(c.key, contact, companyName ?? null))).join(",")
    );

    const csv = [headers.map(escape).join(","), ...csvRows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"contacts.csv\"");
    res.send(csv);
  } catch {
    res.status(500).json({ error: "Failed to export contacts" });
  }
});

router.get("/duplicates", requireAuth, async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      select id, 'email:' || lower(trim(email)) as key
        from ${contactsTable}
        where email is not null and trim(email) <> ''
      union all
      select id, 'name:' || lower(trim(first_name) || ' ' || trim(last_name)) as key
        from ${contactsTable}
        where trim(first_name) <> '' or trim(last_name) <> ''
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
        contact: contactsTable,
        company: { id: companiesTable.id, name: companiesTable.name },
      })
      .from(contactsTable)
      .leftJoin(companiesTable, eq(contactsTable.companyId, companiesTable.id))
      .where(inArray(contactsTable.id, allIds));

    const byId = new Map(
      records.map(({ contact, company }) => [
        contact.id,
        { ...contact, company: company?.id ? company : null },
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
    res.status(500).json({ error: "Failed to detect duplicate contacts" });
  }
});

router.post("/merge", requireAuth, async (req: Request, res: Response) => {
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
        .from(contactsTable)
        .where(inArray(contactsTable.id, [primaryId, ...loserIds]));

      const primary = involved.find((c) => c.id === primaryId);
      const losers = loserIds
        .map((id) => involved.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c));

      if (!primary) throw new Error("PRIMARY_NOT_FOUND");
      if (losers.length === 0) throw new Error("LOSERS_NOT_FOUND");

      const merge = {
        firstName: resolveScalar(primary.firstName, losers.map((l) => l.firstName)),
        lastName: resolveScalar(primary.lastName, losers.map((l) => l.lastName)),
        email: resolveScalar(primary.email, losers.map((l) => l.email)),
        phone: resolveScalar(primary.phone, losers.map((l) => l.phone)),
        title: resolveScalar(primary.title, losers.map((l) => l.title)),
        status: resolveScalar(primary.status, losers.map((l) => l.status)),
        ennablUser: resolveBool(primary.ennablUser, losers.map((l) => l.ennablUser)),
        emailMarketingContact: resolveBool(primary.emailMarketingContact, losers.map((l) => l.emailMarketingContact)),
        tags: unionArrays(primary.tags, ...losers.map((l) => l.tags)),
        notes: resolveScalar(primary.notes, losers.map((l) => l.notes)),
        linkedIn: resolveScalar(primary.linkedIn, losers.map((l) => l.linkedIn)),
        companyId: resolveScalar(primary.companyId, losers.map((l) => l.companyId)),
        assigneeId: resolveScalar(primary.assigneeId, losers.map((l) => l.assigneeId)),
        updatedAt: new Date(),
      };

      const actualLoserIds = losers.map((l) => l.id);

      // Re-point related records to the primary contact.
      await tx.update(dealsTable).set({ contactId: primaryId }).where(inArray(dealsTable.contactId, actualLoserIds));
      await tx.update(tasksTable).set({ contactId: primaryId }).where(inArray(tasksTable.contactId, actualLoserIds));
      await tx.update(activitiesTable).set({ contactId: primaryId }).where(inArray(activitiesTable.contactId, actualLoserIds));
      await tx
        .update(notesTable)
        .set({ entityId: primaryId })
        .where(and(eq(notesTable.entityType, "contact"), inArray(notesTable.entityId, actualLoserIds)));

      const loserList = sql.join(actualLoserIds.map((id) => sql`${id}`), sql`, `);
      // sequence_enrollments has no unique (sequence, contact) constraint, but
      // avoid creating duplicate enrollments: drop loser rows whose sequence the
      // primary (or an earlier-kept loser) already covers, then re-point the rest.
      await tx.execute(sql`
        delete from sequence_enrollments
        where contact_id in (${loserList})
          and sequence_id in (select sequence_id from sequence_enrollments where contact_id = ${primaryId})
      `);
      await tx.execute(sql`
        delete from sequence_enrollments a using sequence_enrollments b
        where a.contact_id in (${loserList})
          and b.contact_id in (${loserList})
          and a.sequence_id = b.sequence_id
          and a.id > b.id
      `);
      await tx.execute(sql`
        update sequence_enrollments set contact_id = ${primaryId}
        where contact_id in (${loserList})
      `);

      // campaign_contacts has UNIQUE(campaign_id, contact_id): primary wins,
      // then keep the lowest-id loser row per campaign, then re-point.
      await tx.execute(sql`
        delete from campaign_contacts
        where contact_id in (${loserList})
          and campaign_id in (select campaign_id from campaign_contacts where contact_id = ${primaryId})
      `);
      await tx.execute(sql`
        delete from campaign_contacts a using campaign_contacts b
        where a.contact_id in (${loserList})
          and b.contact_id in (${loserList})
          and a.campaign_id = b.campaign_id
          and a.id > b.id
      `);
      await tx.execute(sql`
        update campaign_contacts set contact_id = ${primaryId}
        where contact_id in (${loserList})
      `);

      await tx.delete(contactsTable).where(inArray(contactsTable.id, actualLoserIds));

      // Update the primary last so back-filled unique fields (e.g. email) do not
      // collide with loser rows that still exist during the transaction.
      const [updated] = await tx
        .update(contactsTable)
        .set(merge)
        .where(eq(contactsTable.id, primaryId))
        .returning();

      return { updated, primary, losers };
    });

    await logAudit({
      action: "MERGE",
      objectType: "contact",
      objectId: merged.updated.id,
      objectLabel: `${merged.updated.firstName} ${merged.updated.lastName}`.trim(),
      actorId: dbUser.id,
      actorName: dbUser.name,
      before: { primary: merged.primary, merged: merged.losers },
      after: merged.updated,
    });

    // Return the surviving contact enriched to match ContactWithRelations.
    const [enriched] = await db
      .select({
        contact: contactsTable,
        company: { id: companiesTable.id, name: companiesTable.name },
        assignee: { id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl },
      })
      .from(contactsTable)
      .leftJoin(companiesTable, eq(contactsTable.companyId, companiesTable.id))
      .leftJoin(usersTable, eq(contactsTable.assigneeId, usersTable.id))
      .where(eq(contactsTable.id, merged.updated.id))
      .limit(1);

    const [[{ dealCount }], [{ taskCount }]] = await Promise.all([
      db
        .select({ dealCount: sql<number>`count(*)::int` })
        .from(dealsTable)
        .where(eq(dealsTable.contactId, merged.updated.id)),
      db
        .select({ taskCount: sql<number>`count(*)::int` })
        .from(tasksTable)
        .where(eq(tasksTable.contactId, merged.updated.id)),
    ]);

    res.json({
      ...enriched.contact,
      company: enriched.company?.id ? enriched.company : null,
      assignee: enriched.assignee?.id ? enriched.assignee : null,
      dealCount,
      taskCount,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "PRIMARY_NOT_FOUND") {
      res.status(404).json({ error: "Primary contact not found" });
      return;
    }
    if (msg === "LOSERS_NOT_FOUND") {
      res.status(404).json({ error: "No valid contacts to merge were found" });
      return;
    }
    res.status(500).json({ error: "Failed to merge contacts" });
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

    let companyId: string | null = body.companyId ?? null;
    let reviewStatus = body.reviewStatus ?? "REVIEWED";

    // Auto-match to a company by email domain when no company was explicitly
    // provided. Internal (@ennabl.com) addresses are never auto-associated and
    // are flagged for review, consistent with the bulk import path. An explicit
    // reviewStatus in the request body always wins.
    if (!companyId && body.email) {
      const match = await resolveContactCompany(body.email);
      companyId = match.isInternal ? null : match.companyId;
      if (body.reviewStatus === undefined) {
        reviewStatus = match.isInternal
          ? "AUTO_CREATED"
          : (match.reviewStatus ?? "REVIEWED");
      }
    }

    const [contact] = await db.insert(contactsTable).values({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email ?? null,
      phone: body.phone ?? null,
      title: body.title ?? null,
      status: body.status ?? "LEAD",
      reviewStatus,
      ennablUser: body.ennablUser ?? false,
      emailMarketingContact: body.emailMarketingContact ?? false,
      tags: body.tags ?? [],
      notes: body.notes ?? null,
      linkedIn: body.linkedIn ?? null,
      companyId,
      assigneeId: body.assigneeId ?? null,
    }).returning();

    await logActivity({
      type: "CONTACT_CREATED",
      title: `Created contact ${contact.firstName} ${contact.lastName}`,
      userId: dbUser.id,
      contactId: contact.id,
    });

    await logAudit({
      action: "CREATE",
      objectType: "contact",
      objectId: contact.id,
      objectLabel: `${contact.firstName} ${contact.lastName}`.trim(),
      actorId: dbUser.id,
      actorName: dbUser.name,
      after: contact,
    });

    res.status(201).json(contact);
  } catch {
    res.status(500).json({ error: "Failed to create contact" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
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

    await logAudit({
      action: "UPDATE",
      objectType: "contact",
      objectId: updated.id,
      objectLabel: `${updated.firstName} ${updated.lastName}`.trim(),
      actorId: dbUser.id,
      actorName: dbUser.name,
      before: existing,
      after: updated,
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update contact" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const id = req.params.id as string;
    const [existing] = await db.select().from(contactsTable).where(eq(contactsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    await db.delete(contactsTable).where(eq(contactsTable.id, id));

    await logAudit({
      action: "DELETE",
      objectType: "contact",
      objectId: existing.id,
      objectLabel: `${existing.firstName} ${existing.lastName}`.trim(),
      actorId: dbUser.id,
      actorName: dbUser.name,
      before: existing,
    });

    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

export default router;
