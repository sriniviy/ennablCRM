import { Router, type Request, type Response } from "express";
import { db, dealsTable, dealStagesTable, contactsTable, companiesTable, usersTable, customFieldDefinitionsTable, customFieldValuesTable, sequenceTriggersTable, sequenceEnrollmentsTable, sequenceStepsTable, sequencesTable, activitiesTable } from "@workspace/db";
import { eq, ilike, and, asc, desc, inArray, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/requireAuth";
import { logActivity } from "../lib/activity";
import { logAudit } from "../lib/audit";

const router = Router();

// Shared helper: check all DEAL_STAGE_CHANGE triggers that match the given stage name
// and auto-enroll the contact into every matched sequence (skipping duplicates).
async function autoEnrollOnStageChange(
  contactId: string,
  stageName: string,
  actorId: string,
): Promise<void> {
  const matchingTriggers = await db
    .select()
    .from(sequenceTriggersTable)
    .where(
      and(
        eq(sequenceTriggersTable.triggerType, "DEAL_STAGE_CHANGE"),
        eq(sequenceTriggersTable.triggerValue, stageName),
      ),
    );

  for (const trigger of matchingTriggers) {
    const [existingEnrollment] = await db
      .select({ id: sequenceEnrollmentsTable.id })
      .from(sequenceEnrollmentsTable)
      .where(
        and(
          eq(sequenceEnrollmentsTable.sequenceId, trigger.sequenceId),
          eq(sequenceEnrollmentsTable.contactId, contactId),
          eq(sequenceEnrollmentsTable.status, "ACTIVE"),
        ),
      )
      .limit(1);
    if (existingEnrollment) continue;

    const [firstStep] = await db
      .select()
      .from(sequenceStepsTable)
      .where(eq(sequenceStepsTable.sequenceId, trigger.sequenceId))
      .orderBy(sql`${sequenceStepsTable.stepOrder} asc`)
      .limit(1);
    if (!firstStep) continue;

    await db.insert(sequenceEnrollmentsTable).values({
      sequenceId: trigger.sequenceId,
      contactId,
      currentStep: 0,
      nextSendAt: new Date(Date.now() + firstStep.delayDays * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
      enrolledVia: "TRIGGER",
    });

    const [seq] = await db
      .select({ name: sequencesTable.name })
      .from(sequencesTable)
      .where(eq(sequencesTable.id, trigger.sequenceId))
      .limit(1);

    await db.insert(activitiesTable).values({
      type: "SEQUENCE_ENROLLED",
      title: `Auto-enrolled in sequence "${seq?.name ?? trigger.sequenceId}"`,
      description: `Triggered by deal moving to "${stageName}"`,
      contactId,
      userId: actorId,
      metadata: {
        sequenceId: trigger.sequenceId,
        sequenceName: seq?.name,
        triggerId: trigger.id,
        triggerValue: stageName,
      },
    });
  }
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, stageId, contactId, companyId, assigneeId } = req.query as Record<string, string>;

    const conditions = [];
    if (stageId) conditions.push(eq(dealsTable.stageId, stageId));
    if (contactId) conditions.push(eq(dealsTable.contactId, contactId));
    if (companyId) conditions.push(eq(dealsTable.companyId, companyId));
    if (assigneeId) conditions.push(eq(dealsTable.assigneeId, assigneeId));
    if (search) conditions.push(ilike(dealsTable.title, `%${search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [stages, rows] = await Promise.all([
      db.select().from(dealStagesTable).orderBy(asc(dealStagesTable.order)),
      db
        .select({
          deal: dealsTable,
          stage: {
            id: dealStagesTable.id,
            name: dealStagesTable.name,
            color: dealStagesTable.color,
            order: dealStagesTable.order,
          },
          contact: {
            id: contactsTable.id,
            firstName: contactsTable.firstName,
            lastName: contactsTable.lastName,
            email: contactsTable.email,
          },
          company: { id: companiesTable.id, name: companiesTable.name },
          assignee: {
            id: usersTable.id,
            name: usersTable.name,
            avatarUrl: usersTable.avatarUrl,
          },
        })
        .from(dealsTable)
        .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .leftJoin(contactsTable, eq(dealsTable.contactId, contactsTable.id))
        .leftJoin(companiesTable, eq(dealsTable.companyId, companiesTable.id))
        .leftJoin(usersTable, eq(dealsTable.assigneeId, usersTable.id))
        .where(where)
        .orderBy(asc(dealsTable.order), desc(dealsTable.createdAt)),
    ]);

    const dealMap = new Map<string, object[]>();
    for (const { deal, stage, contact, company, assignee } of rows) {
      const key = deal.stageId;
      if (!dealMap.has(key)) dealMap.set(key, []);
      dealMap.get(key)!.push({
        ...deal,
        stage: stage?.id ? stage : null,
        contact: contact?.id ? contact : null,
        company: company?.id ? company : null,
        assignee: assignee?.id ? assignee : null,
      });
    }

    const columns = stages.map((stage) => {
      const stageDeals = dealMap.get(stage.id) ?? [];
      const totalValue = (stageDeals as Array<{ value?: number | null }>).reduce(
        (sum, d) => sum + (Number(d.value) || 0),
        0,
      );
      return { stage, deals: stageDeals, totalValue };
    });

    res.json(columns);
  } catch {
    res.status(500).json({ error: "Failed to list deals" });
  }
});

router.get("/export", requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, contactId, companyId, assigneeId, fields } = req.query as Record<string, string>;

    const conditions = [];
    if (contactId) conditions.push(eq(dealsTable.contactId, contactId));
    if (companyId) conditions.push(eq(dealsTable.companyId, companyId));
    if (assigneeId) conditions.push(eq(dealsTable.assigneeId, assigneeId));
    if (search) conditions.push(ilike(dealsTable.title, `%${search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        deal: dealsTable,
        stageName: dealStagesTable.name,
        contactFirstName: contactsTable.firstName,
        contactLastName: contactsTable.lastName,
        companyName: companiesTable.name,
      })
      .from(dealsTable)
      .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
      .leftJoin(contactsTable, eq(dealsTable.contactId, contactsTable.id))
      .leftJoin(companiesTable, eq(dealsTable.companyId, companiesTable.id))
      .where(where)
      .orderBy(asc(dealsTable.order), desc(dealsTable.createdAt));

    const escape = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    type DealColKey = "title" | "stage" | "value" | "currency" | "probability" | "closeDate" | "contact" | "company" | "notes" | "createdAt";
    const ALL_COLS: { key: DealColKey; header: string }[] = [
      { key: "title", header: "Title" },
      { key: "stage", header: "Stage" },
      { key: "value", header: "Value" },
      { key: "currency", header: "Currency" },
      { key: "probability", header: "Probability (%)" },
      { key: "closeDate", header: "Close Date" },
      { key: "contact", header: "Contact" },
      { key: "company", header: "Company" },
      { key: "notes", header: "Notes" },
      { key: "createdAt", header: "Created At" },
    ];

    const selectedKeys = fields
      ? new Set(fields.split(",").map((f) => f.trim()).filter(Boolean))
      : new Set(ALL_COLS.map((c) => c.key));
    const cols = ALL_COLS.filter((c) => selectedKeys.has(c.key));

    type DealRow = typeof rows[number];
    const getValue = (key: DealColKey, row: DealRow) => {
      const { deal: d, stageName, contactFirstName, contactLastName, companyName } = row;
      switch (key) {
        case "title": return d.title;
        case "stage": return stageName;
        case "value": return d.value;
        case "currency": return d.currency;
        case "probability": return d.probability;
        case "closeDate": return d.closeDate ? new Date(d.closeDate).toISOString().slice(0, 10) : "";
        case "contact": return [contactFirstName, contactLastName].filter(Boolean).join(" ");
        case "company": return companyName;
        case "notes": return d.notes;
        case "createdAt": return d.createdAt ? new Date(d.createdAt).toISOString() : "";
      }
    };

    const [cfDefs, cfValues] = await Promise.all([
      db.select().from(customFieldDefinitionsTable)
        .where(eq(customFieldDefinitionsTable.objectType, "deal"))
        .orderBy(asc(customFieldDefinitionsTable.displayOrder)),
      rows.length > 0
        ? db.select().from(customFieldValuesTable)
            .where(and(
              eq(customFieldValuesTable.objectType, "deal"),
              inArray(customFieldValuesTable.recordId, rows.map(r => r.deal.id)),
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
    const csvRows = rows.map((row) => {
      const cfRow = cfValueMap.get(row.deal.id) ?? new Map<string, string | null>();
      return [
        ...cols.map((c) => escape(getValue(c.key, row))),
        ...cfDefs.map((d) => escape(cfRow.get(d.id) ?? null)),
      ].join(",");
    });

    const csv = [headers.map(escape).join(","), ...csvRows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"deals.csv\"");
    res.send(csv);
  } catch {
    res.status(500).json({ error: "Failed to export deals" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [row] = await db
      .select({
        deal: dealsTable,
        stage: {
          id: dealStagesTable.id,
          name: dealStagesTable.name,
          color: dealStagesTable.color,
          order: dealStagesTable.order,
        },
        contact: {
          id: contactsTable.id,
          firstName: contactsTable.firstName,
          lastName: contactsTable.lastName,
          email: contactsTable.email,
        },
        company: { id: companiesTable.id, name: companiesTable.name },
        assignee: {
          id: usersTable.id,
          name: usersTable.name,
          avatarUrl: usersTable.avatarUrl,
        },
      })
      .from(dealsTable)
      .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
      .leftJoin(contactsTable, eq(dealsTable.contactId, contactsTable.id))
      .leftJoin(companiesTable, eq(dealsTable.companyId, companiesTable.id))
      .leftJoin(usersTable, eq(dealsTable.assigneeId, usersTable.id))
      .where(eq(dealsTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }

    res.json({
      ...row.deal,
      stage: row.stage?.id ? row.stage : null,
      contact: row.contact?.id ? row.contact : null,
      company: row.company?.id ? row.company : null,
      assignee: row.assignee?.id ? row.assignee : null,
    });
  } catch {
    res.status(500).json({ error: "Failed to get deal" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const body = req.body as {
      title: string;
      stageId: string;
      value?: number;
      currency?: string;
      probability?: number;
      closeDate?: string;
      contactId?: string;
      companyId?: string;
      assigneeId?: string;
      notes?: string;
    };

    if (!body.title || !body.stageId) {
      res.status(400).json({ error: "title and stageId are required" });
      return;
    }

    const [deal] = await db
      .insert(dealsTable)
      .values({
        title: body.title,
        stageId: body.stageId,
        value: body.value ?? null,
        currency: body.currency ?? "USD",
        probability: body.probability ?? 50,
        closeDate: body.closeDate ? new Date(body.closeDate) : null,
        contactId: body.contactId ?? null,
        companyId: body.companyId ?? null,
        assigneeId: body.assigneeId ?? null,
        notes: body.notes ?? null,
        order: 0,
      })
      .returning();

    await logActivity({
      type: "DEAL_CREATED",
      title: `Created deal "${deal.title}"`,
      userId: dbUser.id,
      dealId: deal.id,
      contactId: deal.contactId ?? undefined,
    });

    await logAudit({
      action: "CREATE",
      objectType: "deal",
      objectId: deal.id,
      objectLabel: deal.title,
      actorId: dbUser.id,
      actorName: dbUser.name,
      after: deal,
    });

    res.status(201).json(deal);
  } catch {
    res.status(500).json({ error: "Failed to create deal" });
  }
});

router.patch("/:id/move", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { dbUser } = req as AuthRequest;
    const { stageId, order } = req.body as { stageId: string; order?: number };

    const [existing] = await db
      .select()
      .from(dealsTable)
      .where(eq(dealsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }

    const oldStageId = existing.stageId;

    const [updated] = await db
      .update(dealsTable)
      .set({ stageId, order: order ?? 0, updatedAt: new Date() })
      .where(eq(dealsTable.id, id))
      .returning();

    if (oldStageId !== stageId) {
      const [newStage] = await db
        .select()
        .from(dealStagesTable)
        .where(eq(dealStagesTable.id, stageId))
        .limit(1);
      await logActivity({
        type: "DEAL_MOVED",
        title: `Moved deal "${existing.title}" to ${newStage?.name ?? stageId}`,
        userId: dbUser.id,
        dealId: id,
      });

      // Auto-enroll contacts via DEAL_STAGE_CHANGE triggers.
      if (newStage && updated.contactId) {
        await autoEnrollOnStageChange(updated.contactId, newStage.name, dbUser.id);
      }
    }

    await logAudit({
      action: "UPDATE",
      objectType: "deal",
      objectId: updated.id,
      objectLabel: updated.title,
      actorId: dbUser.id,
      actorName: dbUser.name,
      before: existing,
      after: updated,
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to move deal" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const id = req.params.id as string;
    const [existing] = await db
      .select()
      .from(dealsTable)
      .where(eq(dealsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }

    const body = { ...req.body } as Record<string, unknown>;
    if (body.closeDate) body.closeDate = new Date(body.closeDate as string);

    const [updated] = await db
      .update(dealsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(dealsTable.id, id))
      .returning();

    // Auto-enroll when stageId changes via this general update path.
    if (body.stageId && body.stageId !== existing.stageId && updated.contactId) {
      const [newStage] = await db
        .select()
        .from(dealStagesTable)
        .where(eq(dealStagesTable.id, updated.stageId))
        .limit(1);
      if (newStage) {
        await autoEnrollOnStageChange(updated.contactId, newStage.name, dbUser.id);
      }
    }

    await logAudit({
      action: "UPDATE",
      objectType: "deal",
      objectId: updated.id,
      objectLabel: updated.title,
      actorId: dbUser.id,
      actorName: dbUser.name,
      before: existing,
      after: updated,
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update deal" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const id = req.params.id as string;
    const [existing] = await db
      .select()
      .from(dealsTable)
      .where(eq(dealsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }

    await db.delete(dealsTable).where(eq(dealsTable.id, id));

    await logAudit({
      action: "DELETE",
      objectType: "deal",
      objectId: existing.id,
      objectLabel: existing.title,
      actorId: dbUser.id,
      actorName: dbUser.name,
      before: existing,
    });

    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete deal" });
  }
});

export default router;
