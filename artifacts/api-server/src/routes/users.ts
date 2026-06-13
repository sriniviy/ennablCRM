import { Router } from "express";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/requireAuth";
import type { Request, Response } from "express";
import { db, aiPresetsTable, usersTable } from "@workspace/db";
import { eq, asc, or, sql } from "drizzle-orm";

const router = Router();

router.get("/me", requireAuth, (req: Request, res: Response) => {
  const { dbUser } = req as AuthRequest;
  res.json(dbUser);
});

// ── AI Presets ─────────────────────────────────────────────────────────────

const PRESET_SELECT = {
  id: aiPresetsTable.id,
  userId: aiPresetsTable.userId,
  name: aiPresetsTable.name,
  category: aiPresetsTable.category,
  goal: aiPresetsTable.goal,
  tone: aiPresetsTable.tone,
  improveFields: aiPresetsTable.improveFields,
  context: aiPresetsTable.context,
  shared: aiPresetsTable.shared,
  createdAt: aiPresetsTable.createdAt,
  creatorName: usersTable.name,
  creatorEmail: usersTable.email,
};

function normalizeContext(ctx: unknown): string[] {
  if (Array.isArray(ctx) && ctx.length > 0) return ctx.map(String);
  return ["email"];
}

/* GET /users/me/ai-presets
   Returns own presets + shared presets. Optional ?context= filter. */
router.get("/me/ai-presets", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const { context } = req.query as { context?: string };
  try {
    const rows = await db
      .select(PRESET_SELECT)
      .from(aiPresetsTable)
      .leftJoin(usersTable, eq(usersTable.id, aiPresetsTable.userId))
      .where(or(eq(aiPresetsTable.userId, userId), eq(aiPresetsTable.shared, true)))
      .orderBy(sql`coalesce(${aiPresetsTable.category}, '')`, asc(aiPresetsTable.name));

    const withCtx = rows.map((r) => ({ ...r, context: normalizeContext(r.context) }));
    const filtered = context
      ? withCtx.filter((r) => r.context.includes(context))
      : withCtx;

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch presets" });
  }
});

/* POST /users/me/ai-presets — create a new preset */
router.post("/me/ai-presets", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  const { name, category, goal, tone, improveFields, context, shared } = req.body as {
    name: string;
    category?: string;
    goal: string;
    tone?: string;
    improveFields?: string;
    context?: string[];
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
        context: normalizeContext(context),
        shared: shared === true,
      })
      .returning();
    res.status(201).json({ ...preset, context: normalizeContext(preset.context) });
  } catch (err) {
    res.status(500).json({ error: "Failed to save preset" });
  }
});

/* PATCH /users/me/ai-presets/:presetId — update any field (owner or admin) */
router.patch("/me/ai-presets/:presetId", requireAuth, async (req: Request, res: Response) => {
  const { userId, dbUser } = req as AuthRequest;
  const { presetId } = req.params;
  const { shared, name, category, goal, tone, improveFields, context } = req.body as {
    shared?: boolean;
    name?: string;
    category?: string | null;
    goal?: string;
    tone?: string;
    improveFields?: string;
    context?: string[];
  };

  try {
    const [preset] = await db
      .select()
      .from(aiPresetsTable)
      .where(eq(aiPresetsTable.id, presetId))
      .limit(1);

    if (!preset) { res.status(404).json({ error: "Preset not found" }); return; }

    const isOwner = preset.userId === userId;
    const isAdmin = dbUser.role === "ADMIN";
    if (!isOwner && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

    const updates: Partial<typeof aiPresetsTable.$inferInsert> = {};
    if (shared !== undefined) updates.shared = shared === true;
    if (name !== undefined && name.trim()) updates.name = name.trim();
    if (category !== undefined) updates.category = category?.trim() || null;
    if (goal !== undefined && goal.trim()) updates.goal = goal.trim();
    if (tone !== undefined) updates.tone = tone;
    if (improveFields !== undefined) updates.improveFields = improveFields;
    if (context !== undefined) updates.context = normalizeContext(context);

    if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

    const [updated] = await db
      .update(aiPresetsTable)
      .set(updates)
      .where(eq(aiPresetsTable.id, presetId))
      .returning();

    res.json({ ...updated, context: normalizeContext(updated.context) });
  } catch (err) {
    res.status(500).json({ error: "Failed to update preset" });
  }
});

/* DELETE /users/me/ai-presets/:presetId */
router.delete("/me/ai-presets/:presetId", requireAuth, async (req: Request, res: Response) => {
  const { userId, dbUser } = req as AuthRequest;
  const { presetId } = req.params;

  try {
    const [preset] = await db.select().from(aiPresetsTable).where(eq(aiPresetsTable.id, presetId)).limit(1);
    if (!preset) { res.status(404).json({ error: "Preset not found" }); return; }

    const isOwner = preset.userId === userId;
    const isAdmin = dbUser.role === "ADMIN";
    if (!isOwner && !isAdmin) { res.status(403).json({ error: "Only the creator or an admin can delete this preset" }); return; }

    await db.delete(aiPresetsTable).where(eq(aiPresetsTable.id, presetId));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete preset" });
  }
});

/* GET /users/admin/ai-presets — admin sees ALL presets from all users */
router.get("/admin/ai-presets", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const { context } = req.query as { context?: string };
  try {
    const rows = await db
      .select(PRESET_SELECT)
      .from(aiPresetsTable)
      .leftJoin(usersTable, eq(aiPresetsTable.userId, usersTable.id))
      .orderBy(
        sql`coalesce(${aiPresetsTable.category}, '')`,
        asc(aiPresetsTable.name),
      );

    const withCtx = rows.map((r) => ({ ...r, context: normalizeContext(r.context) }));
    const filtered = context
      ? withCtx.filter((r) => r.context.includes(context))
      : withCtx;

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch presets" });
  }
});

export default router;
