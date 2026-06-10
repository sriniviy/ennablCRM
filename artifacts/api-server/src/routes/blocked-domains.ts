import { Router, type Request, type Response } from "express";
import { db, blockedDomainsTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { extractEmailDomain } from "../lib/domain-matching";

const router = Router();

router.get("/", requireAuth, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(blockedDomainsTable)
      .orderBy(asc(blockedDomainsTable.domain));
    res.json({ data: rows });
  } catch {
    res.status(500).json({ error: "Failed to list blocked domains" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    if (dbUser.role !== "ADMIN") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const raw = typeof req.body?.domain === "string" ? req.body.domain : "";
    // Accept either a bare domain or a full email address.
    const domain = (raw.includes("@") ? extractEmailDomain(raw) : raw.trim().toLowerCase()) || "";
    if (!domain || !domain.includes(".")) {
      res.status(400).json({ error: "A valid domain is required" });
      return;
    }

    const [existing] = await db
      .select()
      .from(blockedDomainsTable)
      .where(eq(blockedDomainsTable.domain, domain))
      .limit(1);
    if (existing) {
      res.status(200).json(existing);
      return;
    }

    const [created] = await db
      .insert(blockedDomainsTable)
      .values({ domain })
      .returning();
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: "Failed to add blocked domain" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    if (dbUser.role !== "ADMIN") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const id = req.params.id as string;
    const [existing] = await db
      .select()
      .from(blockedDomainsTable)
      .where(eq(blockedDomainsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Blocked domain not found" });
      return;
    }

    await db.delete(blockedDomainsTable).where(eq(blockedDomainsTable.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete blocked domain" });
  }
});

export default router;
