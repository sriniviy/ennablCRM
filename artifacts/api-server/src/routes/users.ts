import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import type { Request, Response } from "express";
import { db, aiPresetsTable } from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";

const router = Router();

router.get("/me", requireAuth, (req: Request, res: Response) => {
  const { dbUser } = req as AuthRequest;
  res.json(dbUser);
});

// ── AI Presets ─────────────────────────────────────────────────────────────

router.get("/me/ai-presets", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  try {
    const presets = await db
      .select()
      .from(aiPresetsTable)
      .where(eq(aiPresetsTable.userId, userId))
      .orderBy(
        sql`coalesce(${aiPresetsTable.category}, '')`,
        asc(aiPresetsTable.name),
      );
    res.json(presets);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch presets" });
  }
});

router.post("/me/ai-presets", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const { name, category, goal, tone, improveFields } = req.body as {
    name: string;
    category?: string;
    goal: string;
    tone: string;
    improveFields: string;
  };

  if (!name?.trim() || !goal?.trim()) {
    res.status(400).json({ error: "name and goal are required" });
    return;
  }

  try {
    const [preset] = await db
      .insert(aiPresetsTable)
      .values({
        userId,
        name: name.trim(),
        category: category?.trim() || null,
        goal: goal.trim(),
        tone: tone ?? "Professional",
        improveFields: improveFields ?? "both",
      })
      .returning();
    res.status(201).json(preset);
  } catch (err) {
    res.status(500).json({ error: "Failed to save preset" });
  }
});

router.delete("/me/ai-presets/:presetId", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const { presetId } = req.params;

  try {
    const deleted = await db
      .delete(aiPresetsTable)
      .where(and(eq(aiPresetsTable.id, presetId), eq(aiPresetsTable.userId, userId)))
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: "Preset not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete preset" });
  }
});

export default router;
