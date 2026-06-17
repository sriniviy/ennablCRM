import { Router, type Request, type Response } from "express";
import { db, workspaceSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();
router.use(requireAuth);

const MEMBER_OF_KEY = "member_of_options";

const DEFAULT_MEMBER_OF: string[] = [
  "Acrisure",
  "Afore",
  "ALKEME",
  "Alera",
  "Alliant",
  "Applied Reference Client",
  "Association of Risk Managers Northwest",
  "Assurex",
  "BIGN",
  "BroadStreet",
  "CIAB",
  "Fortified",
  "Gallagher",
  "HUB",
  "HighStreet",
  "InCite",
  "Insurors Group",
  "Intersure",
  "Iroquois Group",
  "ISU",
  "Keystone",
  "Marsh/MMA",
  "MarshBerry Connect",
  "New Demos Challenge 26",
  "Outmarket Customer",
  "PacWest",
  "Patriot",
  "Reagan Survey",
  "RiskProNet",
  "Top 100 Target List",
  "USI",
  "Vertafore Reference Customer",
];

router.get("/member-of", async (_req: Request, res: Response) => {
  const row = await db
    .select()
    .from(workspaceSettingsTable)
    .where(eq(workspaceSettingsTable.key, MEMBER_OF_KEY))
    .then((r) => r[0]);

  const options: string[] = row ? (row.value as { options: string[] }).options ?? DEFAULT_MEMBER_OF : DEFAULT_MEMBER_OF;
  res.json({ options });
});

router.put("/member-of", async (req: Request, res: Response) => {
  const { dbUser } = req as AuthRequest;
  if (dbUser.role !== "ADMIN") {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const options: string[] = Array.isArray(req.body?.options) ? req.body.options : [];

  await db
    .insert(workspaceSettingsTable)
    .values({ key: MEMBER_OF_KEY, value: { options } })
    .onConflictDoUpdate({
      target: workspaceSettingsTable.key,
      set: { value: { options }, updatedAt: new Date() },
    });

  res.json({ options });
});

export default router;
