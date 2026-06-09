import { Router, type Request, type Response } from "express";
import { db, notesTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { logActivity } from "../lib/activity";

const router = Router();

router.get("/export", requireAuth, async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.query as Record<string, string>;

    const conditions = [];
    if (entityType) conditions.push(eq(notesTable.entityType, entityType));
    if (entityId) conditions.push(eq(notesTable.entityId, entityId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: notesTable.id,
        body: notesTable.body,
        entityType: notesTable.entityType,
        entityId: notesTable.entityId,
        createdAt: notesTable.createdAt,
        authorName: usersTable.name,
      })
      .from(notesTable)
      .leftJoin(usersTable, eq(notesTable.authorId, usersTable.id))
      .where(where)
      .orderBy(desc(notesTable.createdAt));

    const escape = (v: string | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = ["Body", "Entity Type", "Entity ID", "Author", "Created At"];
    const csvRows = rows.map((n) => [
      n.body,
      n.entityType,
      n.entityId,
      n.authorName ?? "",
      n.createdAt ? new Date(n.createdAt).toISOString() : "",
    ].map(escape).join(","));

    const csv = [headers.map(escape).join(","), ...csvRows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"notes.csv\"");
    res.send(csv);
  } catch {
    res.status(500).json({ error: "Failed to export notes" });
  }
});

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.query as Record<string, string>;
    if (!entityType || !entityId) {
      res.status(400).json({ error: "entityType and entityId are required" });
      return;
    }
    const notes = await db
      .select({
        id: notesTable.id,
        body: notesTable.body,
        entityType: notesTable.entityType,
        entityId: notesTable.entityId,
        createdAt: notesTable.createdAt,
        authorId: notesTable.authorId,
        authorName: usersTable.name,
      })
      .from(notesTable)
      .leftJoin(usersTable, eq(notesTable.authorId, usersTable.id))
      .where(
        and(
          eq(notesTable.entityType, entityType),
          eq(notesTable.entityId, entityId),
        ),
      )
      .orderBy(desc(notesTable.createdAt));
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const dbUser = (req as AuthRequest).dbUser;
    const { body, entityType, entityId } = req.body as {
      body: string;
      entityType: string;
      entityId: string;
    };
    if (!body?.trim() || !entityType || !entityId) {
      res
        .status(400)
        .json({ error: "body, entityType, and entityId are required" });
      return;
    }
    const [note] = await db
      .insert(notesTable)
      .values({ body: body.trim(), entityType, entityId, authorId: dbUser.id })
      .returning();

    await logActivity({
      type: "NOTE",
      title: "Note added",
      description: body.substring(0, 200),
      userId: dbUser.id,
      contactId: entityType === "contact" ? entityId : undefined,
      companyId: entityType === "company" ? entityId : undefined,
      dealId: entityType === "deal" ? entityId : undefined,
    });

    res.status(201).json({
      ...note,
      authorName: dbUser.name,
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const dbUser = (req as AuthRequest).dbUser;
    const id = req.params.id as string;
    const [note] = await db
      .select()
      .from(notesTable)
      .where(eq(notesTable.id, id))
      .limit(1);
    if (!note) {
      res.status(404).json({ error: "Note not found" });
      return;
    }
    if (note.authorId !== dbUser.id) {
      res.status(403).json({ error: "Not authorized to delete this note" });
      return;
    }
    await db.delete(notesTable).where(eq(notesTable.id, id));
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
