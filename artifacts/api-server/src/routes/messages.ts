import { Router, type Request, type Response } from "express";
import { db, usersTable, contactsTable, companiesTable, emailCampaignsTable, sequencesTable, aiPresetsTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { pgTable, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

/* ── Inline table definition ──────────────────────────────────── */

export const internalMessagesTable = pgTable(
  "internal_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    fromUserId: text("from_user_id").notNull(),
    toUserId: text("to_user_id").notNull(),
    type: text("type").notNull().default("contact_share"),
    contactId: text("contact_id"),
    companyId: text("company_id"),
    recordType: text("record_type"),
    recordId: text("record_id"),
    note: text("note"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("internal_messages_to_idx").on(t.toUserId, t.read),
    index("internal_messages_from_idx").on(t.fromUserId),
  ],
);

type RecordType = "contact" | "company" | "campaign" | "sequence" | "ai_preset";

const router = Router();

/* ── GET /messages/shared-tags ────────────────────────────────── */

router.get("/shared-tags", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  try {
    const msgs = await db
      .select({
        recordType: internalMessagesTable.recordType,
        recordId: internalMessagesTable.recordId,
        fromUserId: internalMessagesTable.fromUserId,
      })
      .from(internalMessagesTable)
      .where(eq(internalMessagesTable.toUserId, userId));

    if (msgs.length === 0) { res.json({}); return; }

    const senderIds = [...new Set(msgs.map((m) => m.fromUserId))];
    const senders = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.id, senderIds));
    const senderMap = new Map(senders.map((s) => [s.id, s.name ?? s.email]));

    const result: Record<string, Record<string, string>> = {};
    for (const msg of msgs) {
      if (!msg.recordType || !msg.recordId) continue;
      result[msg.recordType] ??= {};
      result[msg.recordType][msg.recordId] = senderMap.get(msg.fromUserId) ?? "A teammate";
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── GET /messages/unread-count ───────────────────────────────── */

router.get("/unread-count", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(internalMessagesTable)
      .where(and(eq(internalMessagesTable.toUserId, userId), eq(internalMessagesTable.read, false)));
    res.json({ count: count ?? 0 });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── GET /messages ────────────────────────────────────────────── */

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  try {
    const msgs = await db
      .select()
      .from(internalMessagesTable)
      .where(eq(internalMessagesTable.toUserId, userId))
      .orderBy(sql`${internalMessagesTable.createdAt} desc`);

    if (msgs.length === 0) { res.json([]); return; }

    const senderIds = [...new Set(msgs.map((m) => m.fromUserId))];

    // Group record IDs by type
    const byType: Partial<Record<RecordType, string[]>> = {};
    for (const m of msgs) {
      const rt = m.recordType as RecordType | null;
      const rid = m.recordId;
      if (rt && rid) {
        byType[rt] = byType[rt] ?? [];
        byType[rt]!.push(rid);
      }
    }

    const uniq = (arr?: string[]) => arr ? [...new Set(arr)] : [];

    const [senders, contacts, companies, campaigns, sequences, aiPresets] = await Promise.all([
      db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, avatarUrl: usersTable.avatarUrl })
        .from(usersTable).where(inArray(usersTable.id, senderIds)),
      uniq(byType.contact).length > 0
        ? db.select({ id: contactsTable.id, firstName: contactsTable.firstName, lastName: contactsTable.lastName, email: contactsTable.email, phone: contactsTable.phone, title: contactsTable.title, status: contactsTable.status })
            .from(contactsTable).where(inArray(contactsTable.id, uniq(byType.contact)))
        : [],
      uniq(byType.company).length > 0
        ? db.select({ id: companiesTable.id, name: companiesTable.name, website: companiesTable.website })
            .from(companiesTable).where(inArray(companiesTable.id, uniq(byType.company)))
        : [],
      uniq(byType.campaign).length > 0
        ? db.select({ id: emailCampaignsTable.id, name: emailCampaignsTable.name, subject: emailCampaignsTable.subject, status: emailCampaignsTable.status })
            .from(emailCampaignsTable).where(inArray(emailCampaignsTable.id, uniq(byType.campaign)))
        : [],
      uniq(byType.sequence).length > 0
        ? db.select({ id: sequencesTable.id, name: sequencesTable.name })
            .from(sequencesTable).where(inArray(sequencesTable.id, uniq(byType.sequence)))
        : [],
      uniq(byType.ai_preset).length > 0
        ? db.select({ id: aiPresetsTable.id, name: aiPresetsTable.name, category: aiPresetsTable.category })
            .from(aiPresetsTable).where(inArray(aiPresetsTable.id, uniq(byType.ai_preset)))
        : [],
    ]);

    const senderMap = new Map(senders.map((s) => [s.id, s]));
    const recordMaps: Record<RecordType, Map<string, unknown>> = {
      contact:  new Map(contacts.map((r) => [r.id, r])),
      company:  new Map(companies.map((r) => [r.id, r])),
      campaign: new Map(campaigns.map((r) => [r.id, r])),
      sequence: new Map(sequences.map((r) => [r.id, r])),
      ai_preset: new Map((aiPresets as Array<{ id: string }>).map((r) => [r.id, r])),
    };

    const enriched = msgs.map((m) => ({
      ...m,
      sender: senderMap.get(m.fromUserId) ?? null,
      record: m.recordType && m.recordId
        ? (recordMaps[m.recordType as RecordType]?.get(m.recordId) ?? null)
        : null,
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── POST /messages/share-contact ────────────────────────────── */

router.post("/share-contact", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const { recordType, recordId, contactId, companyId, toUserIds, note } = req.body as {
    recordType?: RecordType;
    recordId?: string;
    contactId?: string;
    companyId?: string;
    toUserIds: string[];
    note?: string;
  };

  // Normalize to generic record_type / record_id
  const rt: RecordType | undefined = recordType ?? (contactId ? "contact" : companyId ? "company" : undefined);
  const rid: string | undefined = recordId ?? contactId ?? companyId;

  if (!rt || !rid || !Array.isArray(toUserIds) || toUserIds.length === 0) {
    res.status(400).json({ error: "recordType, recordId, and toUserIds[] are required" });
    return;
  }

  const recipients = toUserIds.filter((id) => id !== userId);
  if (recipients.length === 0) {
    res.status(400).json({ error: "Cannot share only with yourself" });
    return;
  }

  try {
    const rows = recipients.map((toId) => ({
      id: crypto.randomUUID(),
      fromUserId: userId,
      toUserId: toId,
      type: `${rt}_share`,
      recordType: rt,
      recordId: rid,
      note: note?.trim() || null,
    }));
    await db.insert(internalMessagesTable).values(rows);
    res.status(201).json({ ok: true, sent: rows.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── PATCH /messages/read-all ─────────────────────────────────── */

router.patch("/read-all", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  try {
    await db.update(internalMessagesTable).set({ read: true })
      .where(and(eq(internalMessagesTable.toUserId, userId), eq(internalMessagesTable.read, false)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── PATCH /messages/:id/read ─────────────────────────────────── */

router.patch("/:id/read", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const { id } = req.params as { id: string };
  try {
    await db.update(internalMessagesTable).set({ read: true })
      .where(and(eq(internalMessagesTable.id, id), eq(internalMessagesTable.toUserId, userId)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── DELETE /messages/:id ─────────────────────────────────────── */

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const { id } = req.params as { id: string };
  try {
    await db.delete(internalMessagesTable)
      .where(and(eq(internalMessagesTable.id, id), eq(internalMessagesTable.toUserId, userId)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
