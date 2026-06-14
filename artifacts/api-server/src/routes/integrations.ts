import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { workspaceSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

function requireAdmin(req: Request, res: Response): boolean {
  const { dbUser } = req as AuthRequest;
  if (dbUser.role !== "ADMIN") {
    res.status(403).json({ error: "Admin only" });
    return false;
  }
  return true;
}

const INTEGRATION_KEYS = ["apollo", "gmail", "ai", "ennabl_growth"] as const;

const DEFAULTS: Record<string, object> = {
  apollo: { enabled: false, apiKey: "" },
  gmail: { enabled: false, emailLogging: true, campaignSending: true },
  ai: {
    enabled: true,
    providers: [
      { id: "openai", name: "OpenAI", apiKey: "", enabled: false },
      { id: "anthropic", name: "Anthropic", apiKey: "", enabled: false },
      { id: "google", name: "Google AI", apiKey: "", enabled: false },
    ],
    activeProvider: null,
    activeModel: null,
  },
  ennabl_growth: { enabled: false },
};

/* GET /api/integrations — returns all integration configs (admin only) */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const rows = await db.select().from(workspaceSettingsTable);
    const stored: Record<string, object> = {};
    for (const row of rows) {
      stored[row.key] = row.value as object;
    }
    const result: Record<string, object> = {};
    for (const key of INTEGRATION_KEYS) {
      result[key] = { ...DEFAULTS[key], ...(stored[key] ?? {}) };
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* PATCH /api/integrations/:key — merge-update a specific integration config */
router.patch("/:key", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { key } = req.params;
  if (!INTEGRATION_KEYS.includes(key as (typeof INTEGRATION_KEYS)[number])) {
    res.status(400).json({ error: "Unknown integration key" });
    return;
  }
  try {
    const existing = await db
      .select()
      .from(workspaceSettingsTable)
      .where(eq(workspaceSettingsTable.key, key))
      .then((r) => r[0]);

    const merged = {
      ...(DEFAULTS[key] ?? {}),
      ...(existing?.value as object ?? {}),
      ...req.body,
    };

    await db
      .insert(workspaceSettingsTable)
      .values({ key, value: merged })
      .onConflictDoUpdate({
        target: workspaceSettingsTable.key,
        set: { value: merged, updatedAt: new Date() },
      });

    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
