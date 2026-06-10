import { Router, type IRouter, type Request, type Response } from "express";
import { db, attachmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.use(requireAuth);

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
      .orderBy(attachmentsTable.createdAt);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch attachments" });
  }
});

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
    const user = (req as any).user;
    const [row] = await db
      .insert(attachmentsTable)
      .values({
        id: crypto.randomUUID(),
        objectType: objectType as any,
        recordId,
        objectPath,
        fileName,
        contentType,
        fileSize,
        uploadedBy: user?.id ?? "unknown",
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to save attachment" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    await db
      .delete(attachmentsTable)
      .where(eq(attachmentsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete attachment" });
  }
});

export default router;
