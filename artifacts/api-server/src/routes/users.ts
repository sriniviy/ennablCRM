import { Router } from "express";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/requireAuth";
import type { Request, Response } from "express";
import { db, aiPresetsTable } from "@workspace/db";
import { eq, and, or, asc, sql } from "drizzle-orm";

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
      .where(
        or(
          eq(aiPresetsTable.userId, userId),
          eq(aiPresetsTable.scope, "team"),
        ),
      )
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
  const { userId, dbUser } = req as AuthRequest;
  const { name, category, goal, tone, improveFields, scope } = req.body as {
    name: string;
    category?: string;
    goal: string;
    tone: string;
    improveFields: string;
    scope?: string;
  };

  if (!name?.trim() || !goal?.trim()) {
    res.status(400).json({ error: "name and goal are required" });
    return;
  }

  const resolvedScope = scope === "team" ? "team" : "personal";

  if (resolvedScope === "team" && dbUser.role !== "ADMIN") {
    res.status(403).json({ error: "Only admins can create team presets" });
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
        scope: resolvedScope,
      })
      .returning();
    res.status(201).json(preset);
  } catch (err) {
    res.status(500).json({ error: "Failed to save preset" });
  }
});

router.delete("/me/ai-presets/:presetId", requireAuth, async (req: Request, res: Response) => {
  const { userId, dbUser } = req as AuthRequest;
  const { presetId } = req.params;
  const isAdmin = dbUser.role === "ADMIN";

  try {
    // Admins can delete any preset; members can only delete their own
    const condition = isAdmin
      ? eq(aiPresetsTable.id, presetId)
      : and(eq(aiPresetsTable.id, presetId), eq(aiPresetsTable.userId, userId));

    const deleted = await db
      .delete(aiPresetsTable)
      .where(condition)
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
