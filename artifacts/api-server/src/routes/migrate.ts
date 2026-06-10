import { Router, type Request, type Response } from "express";
import {
  db,
  contactsTable,
  companiesTable,
  dealsTable,
  dealStagesTable,
  activitiesTable,
} from "@workspace/db";
import { eq, ilike, inArray, or } from "drizzle-orm";
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

// ── POST /migrate/companies ───────────────────────────────────────────────────

router.post("/companies", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { rows, mapping, hubspotIdField } = req.body as {
      rows: Record<string, string>[];
      mapping: Record<string, string>;
      hubspotIdField?: string;
    };

    if (!rows?.length || !mapping) {
      res.status(400).json({ error: "rows and mapping are required" });
      return;
    }

    const existing = await db.select({ name: companiesTable.name, domain: companiesTable.domain, id: companiesTable.id }).from(companiesTable);
    const existingByName = new Map(existing.map(c => [c.name.toLowerCase().trim(), c.id]));
    const existingByDomain = new Map(existing.filter(c => c.domain).map(c => [c.domain!.toLowerCase().trim(), c.id]));

    const toInsert: Array<typeof companiesTable.$inferInsert & { __hubId?: string }> = [];
    const skipped: Array<{ row: number; reason: string }> = [];
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
        __hubId: hubId,
      } as typeof companiesTable.$inferInsert & { __hubId?: string });
    }

    let imported = 0;
    if (toInsert.length > 0) {
      const insertData = toInsert.map(({ __hubId: _h, ...rest }) => rest);
      const inserted = await db.insert(companiesTable).values(insertData).returning();
      imported = inserted.length;
      for (let i = 0; i < inserted.length; i++) {
        const hubId = toInsert[i].__hubId;
        if (hubId) idMap[hubId] = inserted[i].id;
        existingByName.set(inserted[i].name.toLowerCase().trim(), inserted[i].id);
        if (inserted[i].domain) existingByDomain.set(inserted[i].domain!.toLowerCase(), inserted[i].id);
      }
      await Promise.all(inserted.map(c => logAudit({
        action: "CREATE", objectType: "company", objectId: c.id,
        objectLabel: c.name, actorId: dbUser.id, actorName: dbUser.name,
        after: c as Record<string, unknown>,
      })));
    }

    res.json({ imported, skipped, idMap });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to import companies" });
  }
});

// ── POST /migrate/contacts ────────────────────────────────────────────────────

router.post("/contacts", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { rows, mapping, hubspotIdField, companyIdMap } = req.body as {
      rows: Record<string, string>[];
      mapping: Record<string, string>;
      hubspotIdField?: string;
      companyIdMap?: Record<string, string>;
    };

    if (!rows?.length || !mapping) {
      res.status(400).json({ error: "rows and mapping are required" });
      return;
    }

    const existingRows = await db.select({ email: contactsTable.email, id: contactsTable.id }).from(contactsTable);
    const existingEmails = new Map(existingRows.filter(r => r.email).map(r => [r.email!.toLowerCase(), r.id]));
    const [domainIndex, blockedDomains] = await Promise.all([buildCompanyDomainIndex(), loadBlockedDomains()]);

    const toInsert: Array<typeof contactsTable.$inferInsert & { __hubId?: string }> = [];
    const skipped: Array<{ row: number; reason: string }> = [];
    const idMap: Record<string, string> = {};

    for (let i = 0; i < rows.length; i++) {
      const mapped = mapRow(rows[i], mapping);
      const firstName = mapped["firstName"]?.trim() || "";
      const lastName = mapped["lastName"]?.trim() || "";
      if (!firstName && !lastName) { skipped.push({ row: i + 2, reason: "Missing name" }); continue; }

      const email = mapped["email"]?.trim().toLowerCase() || null;
      const hubId = hubspotIdField ? rows[i][hubspotIdField]?.trim() : undefined;

      if (email && existingEmails.has(email)) {
        const existingId = existingEmails.get(email)!;
        if (hubId) idMap[hubId] = existingId;
        skipped.push({ row: i + 2, reason: `Email ${email} already exists — linked` });
        continue;
      }

      const hubCompanyId = mapped["__hubCompanyId"]?.trim() || mapping["__hubCompanyId"] ? rows[i][Object.keys(mapping).find(k => mapping[k] === "__hubCompanyId") ?? ""]?.trim() : undefined;
      let companyId: string | null = null;
      if (hubCompanyId && companyIdMap?.[hubCompanyId]) {
        companyId = companyIdMap[hubCompanyId];
      } else if (email) {
        const match = matchContactCompany(email, { domainIndex, blockedDomains });
        companyId = match.companyId ?? null;
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
        __hubId: hubId,
      } as typeof contactsTable.$inferInsert & { __hubId?: string });

      if (email) existingEmails.set(email, "pending");
    }

    let imported = 0;
    if (toInsert.length > 0) {
      const insertData = toInsert.map(({ __hubId: _h, ...rest }) => rest);
      const inserted = await db.insert(contactsTable).values(insertData).returning();
      imported = inserted.length;
      for (let i = 0; i < inserted.length; i++) {
        const hubId = toInsert[i].__hubId;
        if (hubId) idMap[hubId] = inserted[i].id;
      }
      await Promise.all(inserted.map(c => logAudit({
        action: "CREATE", objectType: "contact", objectId: c.id,
        objectLabel: `${c.firstName} ${c.lastName}`.trim(),
        actorId: dbUser.id, actorName: dbUser.name,
        after: c as Record<string, unknown>,
      })));
    }

    res.json({ imported, skipped, idMap });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to import contacts" });
  }
});

// ── POST /migrate/deals ───────────────────────────────────────────────────────

router.post("/deals", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { rows, mapping, hubspotIdField, contactIdMap, companyIdMap, stageMapping } = req.body as {
      rows: Record<string, string>[];
      mapping: Record<string, string>;
      hubspotIdField?: string;
      contactIdMap?: Record<string, string>;
      companyIdMap?: Record<string, string>;
      stageMapping?: Record<string, string>;
    };

    if (!rows?.length || !mapping) {
      res.status(400).json({ error: "rows and mapping are required" });
      return;
    }

    const stages = await db.select().from(dealStagesTable);
    const stageByName = new Map(stages.map(s => [s.name.toLowerCase().trim(), s.id]));
    const defaultStageId = stages[0]?.id;

    if (!defaultStageId) {
      res.status(400).json({ error: "No deal stages configured — create at least one stage first" });
      return;
    }

    const toInsert: Array<typeof dealsTable.$inferInsert & { __hubId?: string }> = [];
    const skipped: Array<{ row: number; reason: string }> = [];
    const idMap: Record<string, string> = {};

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const mapped = mapRow(raw, mapping);
      const title = mapped["title"]?.trim();
      if (!title) { skipped.push({ row: i + 2, reason: "Missing deal title" }); continue; }

      const hubId = hubspotIdField ? raw[hubspotIdField]?.trim() : undefined;

      const hubContactId = Object.keys(mapping).find(k => mapping[k] === "__hubContactId");
      const hubCompanyId = Object.keys(mapping).find(k => mapping[k] === "__hubCompanyId");
      const hubStage    = Object.keys(mapping).find(k => mapping[k] === "__hubStage");

      const hubContactVal = hubContactId ? raw[hubContactId]?.trim() : undefined;
      const hubCompanyVal = hubCompanyId ? raw[hubCompanyId]?.trim() : undefined;
      const hubStageVal   = hubStage     ? raw[hubStage]?.trim()     : undefined;

      const contactId = hubContactVal && contactIdMap?.[hubContactVal] ? contactIdMap[hubContactVal] : null;
      const companyId = hubCompanyVal && companyIdMap?.[hubCompanyVal] ? companyIdMap[hubCompanyVal] : null;

      let stageId = defaultStageId;
      if (hubStageVal) {
        if (stageMapping?.[hubStageVal]) {
          stageId = stageMapping[hubStageVal];
        } else {
          const byName = stageByName.get(hubStageVal.toLowerCase().trim());
          if (byName) stageId = byName;
        }
      } else if (mapped["stageName"]) {
        const byName = stageByName.get(mapped["stageName"].toLowerCase().trim());
        if (byName) stageId = byName;
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
        __hubId: hubId,
      } as typeof dealsTable.$inferInsert & { __hubId?: string });
    }

    let imported = 0;
    if (toInsert.length > 0) {
      const insertData = toInsert.map(({ __hubId: _h, ...rest }) => rest);
      const inserted = await db.insert(dealsTable).values(insertData).returning();
      imported = inserted.length;
      for (let i = 0; i < inserted.length; i++) {
        const hubId = toInsert[i].__hubId;
        if (hubId) idMap[hubId] = inserted[i].id;
      }
      await Promise.all(inserted.map(d => logAudit({
        action: "CREATE", objectType: "deal", objectId: d.id,
        objectLabel: d.title, actorId: dbUser.id, actorName: dbUser.name,
        after: d as Record<string, unknown>,
      })));
    }

    res.json({ imported, skipped, idMap });
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
    const { rows, mapping, contactIdMap, companyIdMap, dealIdMap } = req.body as {
      rows: Record<string, string>[];
      mapping: Record<string, string>;
      contactIdMap?: Record<string, string>;
      companyIdMap?: Record<string, string>;
      dealIdMap?: Record<string, string>;
    };

    if (!rows?.length || !mapping) {
      res.status(400).json({ error: "rows and mapping are required" });
      return;
    }

    const toInsert: Array<typeof activitiesTable.$inferInsert> = [];
    const skipped: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const mapped = mapRow(raw, mapping);

      const hubContactId = Object.keys(mapping).find(k => mapping[k] === "__hubContactId");
      const hubCompanyId = Object.keys(mapping).find(k => mapping[k] === "__hubCompanyId");
      const hubDealId    = Object.keys(mapping).find(k => mapping[k] === "__hubDealId");

      const hubContactVal = hubContactId ? raw[hubContactId]?.trim() : undefined;
      const hubCompanyVal = hubCompanyId ? raw[hubCompanyId]?.trim() : undefined;
      const hubDealVal    = hubDealId    ? raw[hubDealId]?.trim()    : undefined;

      const rawType = mapped["type"]?.toLowerCase().trim() || "other";
      const type = (ACTIVITY_TYPE_MAP[rawType] ?? "OTHER") as typeof activitiesTable.$inferInsert["type"];

      const title = mapped["title"]?.trim() || mapped["subject"]?.trim() || `Imported ${type.toLowerCase()}`;

      toInsert.push({
        type,
        title,
        description: mapped["description"] || mapped["body"] || null,
        emailSubject: mapped["emailSubject"] || mapped["subject"] || null,
        emailBody: mapped["emailBody"] || mapped["body"] || null,
        endDate: safeDate(mapped["endDate"] || mapped["date"]),
        userId: dbUser.id,
        contactId: hubContactVal && contactIdMap?.[hubContactVal] ? contactIdMap[hubContactVal] : null,
        companyId: hubCompanyVal && companyIdMap?.[hubCompanyVal] ? companyIdMap[hubCompanyVal] : null,
        dealId: hubDealVal && dealIdMap?.[hubDealVal] ? dealIdMap[hubDealVal] : null,
      });
    }

    let imported = 0;
    if (toInsert.length > 0) {
      const inserted = await db.insert(activitiesTable).values(toInsert).returning();
      imported = inserted.length;
    }

    res.json({ imported, skipped });
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

export default router;
