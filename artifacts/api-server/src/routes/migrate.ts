import { Router, type Request, type Response } from "express";
import {
  db,
  contactsTable,
  companiesTable,
  dealsTable,
  dealStagesTable,
  activitiesTable,
  usersTable,
  customFieldDefinitionsTable,
  customFieldValuesTable,
  type CustomFieldObjectType,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { buildCompanyDomainIndex, loadBlockedDomains, matchContactCompany } from "../lib/domain-matching";

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function mapRow(row: Record<string, string>, mapping: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [col, field] of Object.entries(mapping)) {
    if (field && field !== "skip") out[field] = row[col] ?? "";
  }
  return out;
}

/** Load the set of custom-field definition ids for an object type. */
async function loadCustomFieldIds(objectType: CustomFieldObjectType): Promise<Set<string>> {
  const defs = await db
    .select({ id: customFieldDefinitionsTable.id })
    .from(customFieldDefinitionsTable)
    .where(eq(customFieldDefinitionsTable.objectType, objectType));
  return new Set(defs.map((d) => d.id));
}

/** Build custom-field value rows from a source CSV row for an inserted record.
 *  Mapping entries whose target is `cf_<fieldId>` carry custom-field values. */
function customFieldValuesForRow(
  raw: Record<string, string>,
  mapping: Record<string, string>,
  cfFieldIds: Set<string>,
  objectType: CustomFieldObjectType,
  recordId: string,
): Array<typeof customFieldValuesTable.$inferInsert> {
  const out: Array<typeof customFieldValuesTable.$inferInsert> = [];
  for (const [col, field] of Object.entries(mapping)) {
    if (!field?.startsWith("cf_")) continue;
    const fieldId = field.slice(3);
    if (!cfFieldIds.has(fieldId)) continue;
    const v = raw[col]?.trim();
    if (v) out.push({ fieldId, objectType, recordId, value: v });
  }
  return out;
}

/** Persist custom-field values for a batch of inserted records (index-aligned
 *  with their source rows). No-op when nothing is mapped. */
async function persistCustomFieldValues(
  cfFieldIds: Set<string>,
  mapping: Record<string, string>,
  objectType: CustomFieldObjectType,
  pairs: Array<{ recordId: string; raw: Record<string, string> }>,
): Promise<void> {
  if (cfFieldIds.size === 0) return;
  const cfRows: Array<typeof customFieldValuesTable.$inferInsert> = [];
  for (const { recordId, raw } of pairs) {
    cfRows.push(...customFieldValuesForRow(raw, mapping, cfFieldIds, objectType, recordId));
  }
  if (cfRows.length > 0) {
    await db.insert(customFieldValuesTable).values(cfRows).onConflictDoNothing();
  }
}

/** Read the raw value of the CSV column mapped to a given logical field. */
function rawVal(
  raw: Record<string, string>,
  mapping: Record<string, string>,
  field: string,
): string | undefined {
  const col = Object.keys(mapping).find((k) => mapping[k] === field);
  const v = col ? raw[col]?.trim() : undefined;
  return v || undefined;
}

/** Resolve an owner value (email or name from the CSV) to a CRM user id. */
function resolveOwner(
  raw: Record<string, string>,
  mapping: Record<string, string>,
  ownerMapping: Record<string, string> | undefined,
): { userId: string | null; ownerVal?: string } {
  const ownerVal = rawVal(raw, mapping, "owner");
  if (!ownerVal) return { userId: null };
  const id = ownerMapping?.[ownerVal] ?? ownerMapping?.[ownerVal.toLowerCase()];
  return { userId: id ?? null, ownerVal };
}

function safeDate(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function safeNumber(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? null : n;
}

type RowIssue = { row: number; reason: string };

// ── POST /migrate/companies ───────────────────────────────────────────────────

router.post("/companies", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { rows, mapping, hubspotIdField, ownerMapping } = req.body as {
      rows: Record<string, string>[];
      mapping: Record<string, string>;
      hubspotIdField?: string;
      ownerMapping?: Record<string, string>;
    };

    if (!rows?.length || !mapping) {
      res.status(400).json({ error: "rows and mapping are required" });
      return;
    }

    const existing = await db.select({ name: companiesTable.name, domain: companiesTable.domain, id: companiesTable.id }).from(companiesTable);
    const existingByName = new Map(existing.map(c => [c.name.toLowerCase().trim(), c.id]));
    const existingByDomain = new Map(existing.filter(c => c.domain).map(c => [c.domain!.toLowerCase().trim(), c.id]));
    const cfFieldIds = await loadCustomFieldIds("company");

    const toInsert: Array<typeof companiesTable.$inferInsert & { __hubId?: string; __row?: Record<string, string> }> = [];
    const skipped: RowIssue[] = [];
    const warnings: RowIssue[] = [];
    const idMap: Record<string, string> = {};

    for (let i = 0; i < rows.length; i++) {
      const mapped = mapRow(rows[i], mapping);
      const name = mapped["name"]?.trim();
      if (!name) { skipped.push({ row: i + 2, reason: "Missing company name" }); continue; }

      const domain = mapped["domain"]?.trim().toLowerCase() || null;
      const hubId = hubspotIdField ? rows[i][hubspotIdField]?.trim() : undefined;

      if (existingByName.has(name.toLowerCase())) {
        const existingId = existingByName.get(name.toLowerCase())!;
        if (hubId) idMap[hubId] = existingId;
        skipped.push({ row: i + 2, reason: `Company "${name}" already exists — linked` });
        continue;
      }
      if (domain && existingByDomain.has(domain)) {
        const existingId = existingByDomain.get(domain)!;
        if (hubId) idMap[hubId] = existingId;
        skipped.push({ row: i + 2, reason: `Domain "${domain}" already exists — linked` });
        continue;
      }

      const { userId: ownerId, ownerVal } = resolveOwner(rows[i], mapping, ownerMapping);
      if (ownerVal && !ownerId) {
        warnings.push({ row: i + 2, reason: `Owner "${ownerVal}" not matched to a user — imported unassigned` });
      }

      toInsert.push({
        name,
        domain: domain || undefined,
        industry: mapped["industry"] || null,
        size: mapped["size"] || null,
        website: mapped["website"] || null,
        phone: mapped["phone"] || null,
        address: mapped["address"] || null,
        city: mapped["city"] || null,
        country: mapped["country"] || null,
        assignedCsmId: ownerId,
        __hubId: hubId,
        __row: rows[i],
      } as typeof companiesTable.$inferInsert & { __hubId?: string; __row?: Record<string, string> });
    }

    let imported = 0;
    if (toInsert.length > 0) {
      const insertData = toInsert.map(({ __hubId: _h, __row: _r, ...rest }) => rest);
      const inserted = await db.insert(companiesTable).values(insertData).returning();
      imported = inserted.length;
      for (let i = 0; i < inserted.length; i++) {
        const hubId = toInsert[i].__hubId;
        if (hubId) idMap[hubId] = inserted[i].id;
        existingByName.set(inserted[i].name.toLowerCase().trim(), inserted[i].id);
        if (inserted[i].domain) existingByDomain.set(inserted[i].domain!.toLowerCase(), inserted[i].id);
      }
      await persistCustomFieldValues(cfFieldIds, mapping, "company",
        inserted.map((c, i) => ({ recordId: c.id, raw: toInsert[i].__row! })));
      await Promise.all(inserted.map(c => logAudit({
        action: "CREATE", objectType: "company", objectId: c.id,
        objectLabel: c.name, actorId: dbUser.id, actorName: dbUser.name,
        after: c as Record<string, unknown>,
      })));
    }

    res.json({ received: rows.length, imported, skipped, warnings, idMap });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to import companies" });
  }
});

// ── POST /migrate/contacts ────────────────────────────────────────────────────

router.post("/contacts", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { rows, mapping, hubspotIdField, companyIdMap, ownerMapping } = req.body as {
      rows: Record<string, string>[];
      mapping: Record<string, string>;
      hubspotIdField?: string;
      companyIdMap?: Record<string, string>;
      ownerMapping?: Record<string, string>;
    };

    if (!rows?.length || !mapping) {
      res.status(400).json({ error: "rows and mapping are required" });
      return;
    }

    const existingRows = await db.select({ email: contactsTable.email, id: contactsTable.id }).from(contactsTable);
    const existingEmails = new Map(existingRows.filter(r => r.email).map(r => [r.email!.toLowerCase(), r.id]));
    const [domainIndex, blockedDomains, companies] = await Promise.all([
      buildCompanyDomainIndex(),
      loadBlockedDomains(),
      db.select({ id: companiesTable.id, name: companiesTable.name }).from(companiesTable),
    ]);
    // Name index lets associations resolve by exact company name (deferred: it
    // reflects companies already imported in the previous step).
    const companyByName = new Map(companies.map(c => [c.name.toLowerCase().trim(), c.id]));
    const cfFieldIds = await loadCustomFieldIds("contact");

    const toInsert: Array<typeof contactsTable.$inferInsert & { __hubId?: string; __row?: Record<string, string> }> = [];
    const skipped: RowIssue[] = [];
    const warnings: RowIssue[] = [];
    const idMap: Record<string, string> = {};

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const mapped = mapRow(raw, mapping);
      const firstName = mapped["firstName"]?.trim() || "";
      const lastName = mapped["lastName"]?.trim() || "";
      if (!firstName && !lastName) { skipped.push({ row: i + 2, reason: "Missing name" }); continue; }

      const email = mapped["email"]?.trim().toLowerCase() || null;
      const hubId = hubspotIdField ? raw[hubspotIdField]?.trim() : undefined;

      if (email && existingEmails.has(email)) {
        const existingId = existingEmails.get(email)!;
        if (hubId) idMap[hubId] = existingId;
        skipped.push({ row: i + 2, reason: `Email ${email} already exists — linked` });
        continue;
      }

      // Resolve company association: Record ID first, then exact name, then
      // email-domain match. A provided-but-unresolvable key is recorded.
      const hubCompanyVal = rawVal(raw, mapping, "__hubCompanyId");
      const companyNameVal = rawVal(raw, mapping, "__companyName");
      let companyId: string | null = null;
      if (hubCompanyVal && companyIdMap?.[hubCompanyVal]) {
        companyId = companyIdMap[hubCompanyVal];
      } else if (companyNameVal && companyByName.has(companyNameVal.toLowerCase())) {
        companyId = companyByName.get(companyNameVal.toLowerCase())!;
      } else if (hubCompanyVal || companyNameVal) {
        warnings.push({ row: i + 2, reason: `Company "${companyNameVal ?? hubCompanyVal}" not found — imported without company link` });
      } else if (email) {
        const match = matchContactCompany(email, { domainIndex, blockedDomains });
        companyId = match.companyId ?? null;
      }

      const { userId: ownerId, ownerVal } = resolveOwner(raw, mapping, ownerMapping);
      if (ownerVal && !ownerId) {
        warnings.push({ row: i + 2, reason: `Owner "${ownerVal}" not matched to a user — imported unassigned` });
      }

      toInsert.push({
        firstName: firstName || "Unknown",
        lastName: lastName || "",
        email: email || null,
        phone: mapped["phone"] || null,
        title: mapped["title"] || null,
        notes: mapped["notes"] || null,
        linkedIn: mapped["linkedIn"] || null,
        status: "LEAD",
        companyId,
        assigneeId: ownerId,
        __hubId: hubId,
        __row: raw,
      } as typeof contactsTable.$inferInsert & { __hubId?: string; __row?: Record<string, string> });

      if (email) existingEmails.set(email, "pending");
    }

    let imported = 0;
    if (toInsert.length > 0) {
      const insertData = toInsert.map(({ __hubId: _h, __row: _r, ...rest }) => rest);
      const inserted = await db.insert(contactsTable).values(insertData).returning();
      imported = inserted.length;
      for (let i = 0; i < inserted.length; i++) {
        const hubId = toInsert[i].__hubId;
        if (hubId) idMap[hubId] = inserted[i].id;
      }
      await persistCustomFieldValues(cfFieldIds, mapping, "contact",
        inserted.map((c, i) => ({ recordId: c.id, raw: toInsert[i].__row! })));
      await Promise.all(inserted.map(c => logAudit({
        action: "CREATE", objectType: "contact", objectId: c.id,
        objectLabel: `${c.firstName} ${c.lastName}`.trim(),
        actorId: dbUser.id, actorName: dbUser.name,
        after: c as Record<string, unknown>,
      })));
    }

    res.json({ received: rows.length, imported, skipped, warnings, idMap });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to import contacts" });
  }
});

// ── POST /migrate/deals ───────────────────────────────────────────────────────

router.post("/deals", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { rows, mapping, hubspotIdField, contactIdMap, companyIdMap, stageMapping, ownerMapping } = req.body as {
      rows: Record<string, string>[];
      mapping: Record<string, string>;
      hubspotIdField?: string;
      contactIdMap?: Record<string, string>;
      companyIdMap?: Record<string, string>;
      stageMapping?: Record<string, string>;
      ownerMapping?: Record<string, string>;
    };

    if (!rows?.length || !mapping) {
      res.status(400).json({ error: "rows and mapping are required" });
      return;
    }

    const [stages, companies, contacts] = await Promise.all([
      db.select().from(dealStagesTable),
      db.select({ id: companiesTable.id, name: companiesTable.name }).from(companiesTable),
      db.select({ id: contactsTable.id, email: contactsTable.email }).from(contactsTable),
    ]);
    const stageByName = new Map(stages.map(s => [s.name.toLowerCase().trim(), s.id]));
    const companyByName = new Map(companies.map(c => [c.name.toLowerCase().trim(), c.id]));
    const contactByEmail = new Map(contacts.filter(c => c.email).map(c => [c.email!.toLowerCase().trim(), c.id]));
    const defaultStageId = stages[0]?.id;

    if (!defaultStageId) {
      res.status(400).json({ error: "No deal stages configured — create at least one stage first" });
      return;
    }
    const cfFieldIds = await loadCustomFieldIds("deal");

    const toInsert: Array<typeof dealsTable.$inferInsert & { __hubId?: string; __row?: Record<string, string> }> = [];
    const skipped: RowIssue[] = [];
    const warnings: RowIssue[] = [];
    const idMap: Record<string, string> = {};

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const mapped = mapRow(raw, mapping);
      const title = mapped["title"]?.trim();
      if (!title) { skipped.push({ row: i + 2, reason: "Missing deal title" }); continue; }

      const hubId = hubspotIdField ? raw[hubspotIdField]?.trim() : undefined;

      // Contact association: Record ID, then exact email.
      const hubContactVal = rawVal(raw, mapping, "__hubContactId");
      const contactEmailVal = rawVal(raw, mapping, "__contactEmail");
      let contactId: string | null = null;
      if (hubContactVal && contactIdMap?.[hubContactVal]) {
        contactId = contactIdMap[hubContactVal];
      } else if (contactEmailVal && contactByEmail.has(contactEmailVal.toLowerCase())) {
        contactId = contactByEmail.get(contactEmailVal.toLowerCase())!;
      } else if (hubContactVal || contactEmailVal) {
        warnings.push({ row: i + 2, reason: `Contact "${contactEmailVal ?? hubContactVal}" not found — deal imported without contact link` });
      }

      // Company association: Record ID, then exact name.
      const hubCompanyVal = rawVal(raw, mapping, "__hubCompanyId");
      const companyNameVal = rawVal(raw, mapping, "__companyName");
      let companyId: string | null = null;
      if (hubCompanyVal && companyIdMap?.[hubCompanyVal]) {
        companyId = companyIdMap[hubCompanyVal];
      } else if (companyNameVal && companyByName.has(companyNameVal.toLowerCase())) {
        companyId = companyByName.get(companyNameVal.toLowerCase())!;
      } else if (hubCompanyVal || companyNameVal) {
        warnings.push({ row: i + 2, reason: `Company "${companyNameVal ?? hubCompanyVal}" not found — deal imported without company link` });
      }

      // Stage: explicit per-import mapping, then match by name, else default.
      const hubStageVal = rawVal(raw, mapping, "__hubStage");
      let stageId = defaultStageId;
      if (hubStageVal) {
        if (stageMapping?.[hubStageVal]) {
          stageId = stageMapping[hubStageVal];
        } else if (stageByName.has(hubStageVal.toLowerCase().trim())) {
          stageId = stageByName.get(hubStageVal.toLowerCase().trim())!;
        } else {
          warnings.push({ row: i + 2, reason: `Stage "${hubStageVal}" not mapped — placed in "${stages[0]?.name}"` });
        }
      } else if (mapped["stageName"]) {
        const byName = stageByName.get(mapped["stageName"].toLowerCase().trim());
        if (byName) stageId = byName;
      }

      const { userId: ownerId, ownerVal } = resolveOwner(raw, mapping, ownerMapping);
      if (ownerVal && !ownerId) {
        warnings.push({ row: i + 2, reason: `Owner "${ownerVal}" not matched to a user — imported unassigned` });
      }

      toInsert.push({
        title,
        value: safeNumber(mapped["value"]),
        probability: safeNumber(mapped["probability"]) != null ? Math.round(safeNumber(mapped["probability"])!) : 50,
        closeDate: safeDate(mapped["closeDate"]),
        notes: mapped["notes"] || null,
        stageId,
        contactId,
        companyId,
        assigneeId: ownerId,
        __hubId: hubId,
        __row: raw,
      } as typeof dealsTable.$inferInsert & { __hubId?: string; __row?: Record<string, string> });
    }

    let imported = 0;
    if (toInsert.length > 0) {
      const insertData = toInsert.map(({ __hubId: _h, __row: _r, ...rest }) => rest);
      const inserted = await db.insert(dealsTable).values(insertData).returning();
      imported = inserted.length;
      for (let i = 0; i < inserted.length; i++) {
        const hubId = toInsert[i].__hubId;
        if (hubId) idMap[hubId] = inserted[i].id;
      }
      await persistCustomFieldValues(cfFieldIds, mapping, "deal",
        inserted.map((d, i) => ({ recordId: d.id, raw: toInsert[i].__row! })));
      await Promise.all(inserted.map(d => logAudit({
        action: "CREATE", objectType: "deal", objectId: d.id,
        objectLabel: d.title, actorId: dbUser.id, actorName: dbUser.name,
        after: d as Record<string, unknown>,
      })));
    }

    res.json({ received: rows.length, imported, skipped, warnings, idMap });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to import deals" });
  }
});

// ── POST /migrate/activities ──────────────────────────────────────────────────

const ACTIVITY_TYPE_MAP: Record<string, string> = {
  call: "CALL", email: "EMAIL", note: "NOTE", meeting: "MEETING",
  task: "TASK_COMPLETED", "task completed": "TASK_COMPLETED",
  other: "OTHER", "incoming email": "EMAIL", "outgoing email": "EMAIL",
};

router.post("/activities", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { rows, mapping, contactIdMap, companyIdMap, dealIdMap, ownerMapping } = req.body as {
      rows: Record<string, string>[];
      mapping: Record<string, string>;
      contactIdMap?: Record<string, string>;
      companyIdMap?: Record<string, string>;
      dealIdMap?: Record<string, string>;
      ownerMapping?: Record<string, string>;
    };

    if (!rows?.length || !mapping) {
      res.status(400).json({ error: "rows and mapping are required" });
      return;
    }

    const [companies, contacts, deals] = await Promise.all([
      db.select({ id: companiesTable.id, name: companiesTable.name }).from(companiesTable),
      db.select({ id: contactsTable.id, email: contactsTable.email }).from(contactsTable),
      db.select({ id: dealsTable.id, title: dealsTable.title }).from(dealsTable),
    ]);
    const companyByName = new Map(companies.map(c => [c.name.toLowerCase().trim(), c.id]));
    const contactByEmail = new Map(contacts.filter(c => c.email).map(c => [c.email!.toLowerCase().trim(), c.id]));
    const dealByTitle = new Map(deals.map(d => [d.title.toLowerCase().trim(), d.id]));
    const cfFieldIds = await loadCustomFieldIds("activity");

    const toInsert: Array<typeof activitiesTable.$inferInsert> = [];
    const insertRows: Array<Record<string, string>> = [];
    const skipped: RowIssue[] = [];
    const warnings: RowIssue[] = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const mapped = mapRow(raw, mapping);

      // Contact: Record ID, then exact email.
      const hubContactVal = rawVal(raw, mapping, "__hubContactId");
      const contactEmailVal = rawVal(raw, mapping, "__contactEmail");
      let contactId: string | null = null;
      if (hubContactVal && contactIdMap?.[hubContactVal]) contactId = contactIdMap[hubContactVal];
      else if (contactEmailVal && contactByEmail.has(contactEmailVal.toLowerCase())) contactId = contactByEmail.get(contactEmailVal.toLowerCase())!;
      else if (hubContactVal || contactEmailVal) warnings.push({ row: i + 2, reason: `Contact "${contactEmailVal ?? hubContactVal}" not found — activity imported without contact link` });

      // Company: Record ID, then exact name.
      const hubCompanyVal = rawVal(raw, mapping, "__hubCompanyId");
      const companyNameVal = rawVal(raw, mapping, "__companyName");
      let companyId: string | null = null;
      if (hubCompanyVal && companyIdMap?.[hubCompanyVal]) companyId = companyIdMap[hubCompanyVal];
      else if (companyNameVal && companyByName.has(companyNameVal.toLowerCase())) companyId = companyByName.get(companyNameVal.toLowerCase())!;
      else if (hubCompanyVal || companyNameVal) warnings.push({ row: i + 2, reason: `Company "${companyNameVal ?? hubCompanyVal}" not found — activity imported without company link` });

      // Deal: Record ID, then exact title.
      const hubDealVal = rawVal(raw, mapping, "__hubDealId");
      const dealTitleVal = rawVal(raw, mapping, "__dealTitle");
      let dealId: string | null = null;
      if (hubDealVal && dealIdMap?.[hubDealVal]) dealId = dealIdMap[hubDealVal];
      else if (dealTitleVal && dealByTitle.has(dealTitleVal.toLowerCase())) dealId = dealByTitle.get(dealTitleVal.toLowerCase())!;
      else if (hubDealVal || dealTitleVal) warnings.push({ row: i + 2, reason: `Deal "${dealTitleVal ?? hubDealVal}" not found — activity imported without deal link` });

      const rawType = mapped["type"]?.toLowerCase().trim() || "other";
      const type = (ACTIVITY_TYPE_MAP[rawType] ?? "OTHER") as typeof activitiesTable.$inferInsert["type"];

      const title = mapped["title"]?.trim() || mapped["subject"]?.trim() || `Imported ${type.toLowerCase()}`;

      const { userId: ownerId, ownerVal } = resolveOwner(raw, mapping, ownerMapping);
      if (ownerVal && !ownerId) {
        warnings.push({ row: i + 2, reason: `Owner "${ownerVal}" not matched to a user — logged under importer` });
      }

      toInsert.push({
        type,
        title,
        description: mapped["description"] || mapped["body"] || null,
        emailSubject: mapped["emailSubject"] || mapped["subject"] || null,
        emailBody: mapped["emailBody"] || mapped["body"] || null,
        endDate: safeDate(mapped["endDate"] || mapped["date"]),
        userId: ownerId ?? dbUser.id,
        contactId,
        companyId,
        dealId,
      });
      insertRows.push(raw);
    }

    let imported = 0;
    if (toInsert.length > 0) {
      const inserted = await db.insert(activitiesTable).values(toInsert).returning();
      imported = inserted.length;
      await persistCustomFieldValues(cfFieldIds, mapping, "activity",
        inserted.map((a, i) => ({ recordId: a.id, raw: insertRows[i] })));
    }

    res.json({ received: rows.length, imported, skipped, warnings, idMap: {} });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to import activities" });
  }
});

// ── GET /migrate/stages ───────────────────────────────────────────────────────

router.get("/stages", requireAuth, async (_req: Request, res: Response) => {
  try {
    const stages = await db.select({ id: dealStagesTable.id, name: dealStagesTable.name }).from(dealStagesTable);
    res.json(stages);
  } catch {
    res.status(500).json({ error: "Failed to load stages" });
  }
});

// ── GET /migrate/owners ───────────────────────────────────────────────────────

router.get("/owners", requireAuth, async (_req: Request, res: Response) => {
  try {
    const users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable);
    res.json(users);
  } catch {
    res.status(500).json({ error: "Failed to load owners" });
  }
});

export default router;
