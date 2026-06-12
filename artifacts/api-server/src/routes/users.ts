import { Router } from "express";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/requireAuth";
import type { Request, Response } from "express";
import { db, aiPresetsTable, usersTable } from "@workspace/db";
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
    const rows = await db
      .select({
        id: aiPresetsTable.id,
        userId: aiPresetsTable.userId,
        name: aiPresetsTable.name,
        category: aiPresetsTable.category,
        goal: aiPresetsTable.goal,
        tone: aiPresetsTable.tone,
        improveFields: aiPresetsTable.improveFields,
        shared: aiPresetsTable.shared,
        createdAt: aiPresetsTable.createdAt,
        creatorName: usersTable.name,
      })
      .from(aiPresetsTable)
      .leftJoin(usersTable, eq(usersTable.id, aiPresetsTable.userId))
      .where(
        or(
          eq(aiPresetsTable.userId, userId),
          eq(aiPresetsTable.shared, true),
        ),
      )
      .orderBy(
        sql`coalesce(${aiPresetsTable.category}, '')`,
        asc(aiPresetsTable.name),
      );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch presets" });
  }
});

router.post("/me/ai-presets", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const { name, category, goal, tone, improveFields, shared } = req.body as {
    name: string;
    category?: string;
    goal: string;
    tone: string;
    improveFields: string;
    shared?: boolean;
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
        shared: shared === true,
      })
      .returning();
    res.status(201).json(preset);
  } catch (err) {
    res.status(500).json({ error: "Failed to save preset" });
  }
});

router.patch("/me/ai-presets/:presetId", requireAuth, async (req: Request, res: Response) => {
  const { userId, dbUser } = req as AuthRequest;
  const { presetId } = req.params;
  const { shared } = req.body as { shared: boolean };

  try {
    const [preset] = await db
      .select()
      .from(aiPresetsTable)
      .where(eq(aiPresetsTable.id, presetId))
      .limit(1);

    if (!preset) {
      res.status(404).json({ error: "Preset not found" });
      return;
    }

    const isOwner = preset.userId === userId;
    const isAdmin = dbUser.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [updated] = await db
      .update(aiPresetsTable)
      .set({ shared: shared === true })
      .where(eq(aiPresetsTable.id, presetId))
      .returning();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update preset" });
  }
});

router.delete("/me/ai-presets/:presetId", requireAuth, async (req: Request, res: Response) => {
  const { userId, dbUser } = req as AuthRequest;
  const { presetId } = req.params;

  try {
    const [preset] = await db
      .select()
      .from(aiPresetsTable)
      .where(eq(aiPresetsTable.id, presetId))
      .limit(1);

    if (!preset) {
      res.status(404).json({ error: "Preset not found" });
      return;
    }

    const isOwner = preset.userId === userId;
    const isAdmin = dbUser.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: "Only the creator or an admin can delete this preset" });
      return;
    }

    await db
      .delete(aiPresetsTable)
      .where(eq(aiPresetsTable.id, presetId));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete preset" });
  }
});

export default router;
