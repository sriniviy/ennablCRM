import { Router, type Request, type Response } from "express";
import { db, campaignContactsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

router.get("/open/:campaignId", async (req: Request, res: Response) => {
  const campaignId = req.params.campaignId as string;
  const { cid: contactId } = req.query as { cid?: string };

  if (contactId) {
    db.update(campaignContactsTable)
      .set({ status: "OPENED", openedAt: new Date() })
      .where(
        and(
          eq(campaignContactsTable.campaignId, campaignId),
          eq(campaignContactsTable.contactId, contactId),
        ),
      )
      .catch(() => {});
  }

  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Expires", "0");
  res.send(PIXEL);
});

router.get("/click/:campaignId", async (req: Request, res: Response) => {
  const campaignId = req.params.campaignId as string;
  const { cid: contactId, url } = req.query as { cid?: string; url?: string };

  if (contactId) {
    db.update(campaignContactsTable)
      .set({ status: "CLICKED", clickedAt: new Date() })
      .where(
        and(
          eq(campaignContactsTable.campaignId, campaignId),
          eq(campaignContactsTable.contactId, contactId),
        ),
      )
      .catch(() => {});
  }

  if (url) {
    const decoded = decodeURIComponent(url);
    try {
      const parsed = new URL(decoded);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        res.status(400).send("invalid redirect");
        return;
      }
      res.redirect(decoded);
    } catch {
      res.status(400).send("invalid url");
    }
  } else {
    res.status(200).send("ok");
  }
});

export default router;
