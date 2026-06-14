import { Router, type Request, type Response } from "express";
import { db, usersTable, contactsTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { pgTable, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

/* ── Inline table definition (not in shared schema yet) ───────── */

export const internalMessagesTable = pgTable(
  "internal_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    fromUserId: text("from_user_id").notNull(),
    toUserId: text("to_user_id").notNull(),
    type: text("type").notNull().default("contact_share"),
    contactId: text("contact_id"),
    note: text("note"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("internal_messages_to_idx").on(t.toUserId, t.read),
    index("internal_messages_from_idx").on(t.fromUserId),
  ],
);

const router = Router();

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
    const contactIds = [...new Set(msgs.map((m) => m.contactId).filter(Boolean) as string[])];

    const [senders, contacts] = await Promise.all([
      db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, avatarUrl: usersTable.avatarUrl })
        .from(usersTable).where(inArray(usersTable.id, senderIds)),
      contactIds.length > 0
        ? db.select({
            id: contactsTable.id,
            firstName: contactsTable.firstName,
            lastName: contactsTable.lastName,
            email: contactsTable.email,
            phone: contactsTable.phone,
            title: contactsTable.title,
            status: contactsTable.status,
          }).from(contactsTable).where(inArray(contactsTable.id, contactIds))
        : [],
    ]);

    const senderMap = new Map(senders.map((s) => [s.id, s]));
    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    const enriched = msgs.map((m) => ({
      ...m,
      sender: senderMap.get(m.fromUserId) ?? null,
      contact: m.contactId ? (contactMap.get(m.contactId) ?? null) : null,
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── POST /messages/share-contact ────────────────────────────── */

router.post("/share-contact", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const { contactId, toUserIds, note } = req.body as {
    contactId: string;
    toUserIds: string[];
    note?: string;
  };

  if (!contactId || !Array.isArray(toUserIds) || toUserIds.length === 0) {
    res.status(400).json({ error: "contactId and toUserIds[] are required" });
    return;
  }

  const me = toUserIds.filter((id) => id !== userId);
  if (me.length === 0) {
    res.status(400).json({ error: "Cannot share a contact only with yourself" });
    return;
  }

  try {
    const rows = me.map((toId) => ({
      id: crypto.randomUUID(),
      fromUserId: userId,
      toUserId: toId,
      type: "contact_share" as const,
      contactId,
      note: note?.trim() || null,
    }));

    await db.insert(internalMessagesTable).values(rows);
    res.status(201).json({ ok: true, sent: rows.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── PATCH /messages/:id/read ─────────────────────────────────── */

router.patch("/:id/read", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const { id } = req.params as { id: string };
  try {
    await db
      .update(internalMessagesTable)
      .set({ read: true })
      .where(and(eq(internalMessagesTable.id, id), eq(internalMessagesTable.toUserId, userId)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── PATCH /messages/read-all ─────────────────────────────────── */

router.patch("/read-all", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  try {
    await db
      .update(internalMessagesTable)
      .set({ read: true })
      .where(and(eq(internalMessagesTable.toUserId, userId), eq(internalMessagesTable.read, false)));
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
    await db
      .delete(internalMessagesTable)
      .where(and(eq(internalMessagesTable.id, id), eq(internalMessagesTable.toUserId, userId)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
