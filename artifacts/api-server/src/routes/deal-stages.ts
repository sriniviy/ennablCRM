import { Router, type Request, type Response } from "express";
import { db, dealStagesTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/", requireAuth, async (_req: Request, res: Response) => {
  try {
    const stages = await db
      .select()
      .from(dealStagesTable)
      .orderBy(asc(dealStagesTable.order));
    res.json(stages);
  } catch {
    res.status(500).json({ error: "Failed to list deal stages" });
  }
});

export default router;
