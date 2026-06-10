import { Router, type IRouter, type Request, type Response } from "express";
import { db, attachmentsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

type AttachmentRow = typeof attachmentsTable.$inferSelect;

async function uploaderNameMap(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return map;
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
    })
    .from(usersTable);
  for (const u of users) {
    map.set(u.id, u.name || u.email);
  }
  return map;
}

function serialize(row: AttachmentRow, names: Map<string, string>) {
  return {
    ...row,
    uploadedByName: names.get(row.uploadedBy) ?? "Unknown",
  };
}

/**
 * List all versions of a document, newest first.
 *
 * NOTE: must be declared before "/:objectType/:recordId" — otherwise that
 * two-segment route would shadow it (objectType="versions").
 */
router.get("/versions/:documentId", async (req: Request, res: Response) => {
  const documentId = req.params.documentId as string;
  try {
    const rows = await db
      .select()
      .from(attachmentsTable)
      .where(eq(attachmentsTable.documentId, documentId))
      .orderBy(desc(attachmentsTable.version));

    if (rows.length === 0) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    const names = await uploaderNameMap(rows.map((r) => r.uploadedBy));
    res.json(rows.map((row) => serialize(row, names)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch versions" });
  }
});

/**
 * List the latest version of each document attached to a record.
 * Each item includes `versionCount` so the UI can offer version history.
 */
router.get("/:objectType/:recordId", async (req: Request, res: Response) => {
  const { objectType, recordId } = req.params as {
    objectType: string;
    recordId: string;
  };
  try {
    const rows = await db
      .select()
      .from(attachmentsTable)
      .where(
        and(
          eq(attachmentsTable.objectType, objectType as any),
          eq(attachmentsTable.recordId, recordId),
        ),
      )
      .orderBy(desc(attachmentsTable.version));

    // Group by documentId, keeping the highest-version row as the current one.
    const latest = new Map<string, AttachmentRow>();
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.documentId, (counts.get(row.documentId) ?? 0) + 1);
      const existing = latest.get(row.documentId);
      if (!existing || row.version > existing.version) {
        latest.set(row.documentId, row);
      }
    }

    const current = [...latest.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const names = await uploaderNameMap(current.map((r) => r.uploadedBy));

    res.json(
      current.map((row) => ({
        ...serialize(row, names),
        versionCount: counts.get(row.documentId) ?? 1,
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch attachments" });
  }
});

/**
 * Save an attachment record after the file has been uploaded to storage.
 * Pass `documentId` to add a new version to an existing document; omit it to
 * start a new document.
 */
router.post("/", async (req: Request, res: Response) => {
  const { objectType, recordId, objectPath, fileName, contentType, fileSize } =
    req.body as {
      objectType: string;
      recordId: string;
      objectPath: string;
      fileName: string;
      contentType: string;
      fileSize: number;
    };
  const documentId = (req.body as { documentId?: string }).documentId;

  if (
    !objectType ||
    !recordId ||
    !objectPath ||
    !fileName ||
    !contentType ||
    !fileSize
  ) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    const { dbUser } = req as AuthRequest;

    if (documentId) {
      // Adding a new version to an existing document — verify it belongs to the
      // same record before allowing a new version.
      const [existing] = await db
        .select({ id: attachmentsTable.id })
        .from(attachmentsTable)
        .where(
          and(
            eq(attachmentsTable.documentId, documentId),
            eq(attachmentsTable.objectType, objectType as any),
            eq(attachmentsTable.recordId, recordId),
          ),
        )
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
    }

    const resolvedDocumentId = documentId ?? crypto.randomUUID();

    // Compute the next version as max(version)+1. The (document_id, version)
    // unique index guards against concurrent re-uploads racing to the same
    // number — retry a few times on conflict before giving up.
    let row: typeof attachmentsTable.$inferSelect | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      let version = 1;
      if (documentId) {
        const [latest] = await db
          .select({ version: attachmentsTable.version })
          .from(attachmentsTable)
          .where(eq(attachmentsTable.documentId, resolvedDocumentId))
          .orderBy(desc(attachmentsTable.version))
          .limit(1);
        version = (latest?.version ?? 0) + 1;
      }

      try {
        [row] = await db
          .insert(attachmentsTable)
          .values({
            id: crypto.randomUUID(),
            documentId: resolvedDocumentId,
            version,
            objectType: objectType as any,
            recordId,
            objectPath,
            fileName,
            contentType,
            fileSize,
            uploadedBy: dbUser.id,
          })
          .returning();
        break;
      } catch (err) {
        // 23505 = unique_violation (version race). Recompute and retry.
        if ((err as { code?: string })?.code === "23505" && attempt < 4) {
          continue;
        }
        throw err;
      }
    }

    res.status(201).json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to save attachment" });
  }
});

/**
 * Delete an entire document (all of its versions).
 */
router.delete("/document/:documentId", async (req: Request, res: Response) => {
  const documentId = req.params.documentId as string;
  const { dbUser } = req as AuthRequest;
  try {
    const rows = await db
      .select()
      .from(attachmentsTable)
      .where(eq(attachmentsTable.documentId, documentId));
    if (rows.length === 0) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const ownsAll = rows.every((r) => r.uploadedBy === dbUser.id);
    if (!ownsAll && dbUser.role !== "ADMIN") {
      res
        .status(403)
        .json({ error: "You can only delete documents you uploaded" });
      return;
    }
    await db
      .delete(attachmentsTable)
      .where(eq(attachmentsTable.documentId, documentId));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

/**
 * Delete a single attachment version.
 */
router.delete("/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { dbUser } = req as AuthRequest;
  try {
    const [attachment] = await db
      .select()
      .from(attachmentsTable)
      .where(eq(attachmentsTable.id, id))
      .limit(1);
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    if (attachment.uploadedBy !== dbUser.id && dbUser.role !== "ADMIN") {
      res
        .status(403)
        .json({ error: "You can only delete your own attachments" });
      return;
    }
    await db.delete(attachmentsTable).where(eq(attachmentsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete attachment" });
  }
});

export default router;
