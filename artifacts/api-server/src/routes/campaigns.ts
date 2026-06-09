import { Router, type Request, type Response } from "express";
import { db, emailCampaignsTable, campaignContactsTable, contactsTable } from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { Resend } from "resend";

const router = Router();

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, page = "1", pageSize = "50" } = req.query as Record<string, string>;
    const ps = parseInt(pageSize);
    const pg = parseInt(page);
    const offset = (pg - 1) * ps;

    const where = status
      ? eq(emailCampaignsTable.status, status as typeof emailCampaignsTable.$inferSelect["status"])
      : undefined;

    const [campaigns, [{ count }]] = await Promise.all([
      db
        .select({
          campaign: emailCampaignsTable,
          total: sql<number>`count(distinct ${campaignContactsTable.id})::int`,
          sent: sql<number>`count(distinct case when ${campaignContactsTable.status} != 'PENDING' then ${campaignContactsTable.id} end)::int`,
          opened: sql<number>`count(distinct case when ${campaignContactsTable.openedAt} is not null then ${campaignContactsTable.id} end)::int`,
          clicked: sql<number>`count(distinct case when ${campaignContactsTable.clickedAt} is not null then ${campaignContactsTable.id} end)::int`,
        })
        .from(emailCampaignsTable)
        .leftJoin(campaignContactsTable, eq(campaignContactsTable.campaignId, emailCampaignsTable.id))
        .where(where)
        .groupBy(emailCampaignsTable.id)
        .orderBy(desc(emailCampaignsTable.createdAt))
        .limit(ps)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(emailCampaignsTable).where(where),
    ]);

    res.json({
      data: campaigns.map(({ campaign, total, sent, opened, clicked }) => ({
        ...campaign,
        stats: {
          total,
          sent,
          opened,
          clicked,
          openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
          clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
        },
      })),
      total: count,
      page: pg,
      pageSize: ps,
      hasMore: count > pg * ps,
    });
  } catch {
    res.status(500).json({ error: "Failed to list campaigns" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const [campaign] = await db
      .select()
      .from(emailCampaignsTable)
      .where(eq(emailCampaignsTable.id, id))
      .limit(1);

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    const [{ total, sent, opened, clicked }] = await db
      .select({
        total: sql<number>`count(*)::int`,
        sent: sql<number>`count(case when ${campaignContactsTable.status} != 'PENDING' then 1 end)::int`,
        opened: sql<number>`count(case when ${campaignContactsTable.openedAt} is not null then 1 end)::int`,
        clicked: sql<number>`count(case when ${campaignContactsTable.clickedAt} is not null then 1 end)::int`,
      })
      .from(campaignContactsTable)
      .where(eq(campaignContactsTable.campaignId, id));

    res.json({
      ...campaign,
      stats: {
        total,
        sent,
        opened,
        clicked,
        openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
        clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to get campaign" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body;

    if (!body.name || !body.subject || !body.fromName || !body.fromEmail || !body.htmlContent) {
      res.status(400).json({ error: "name, subject, fromName, fromEmail, and htmlContent are required" });
      return;
    }

    const [campaign] = await db.insert(emailCampaignsTable).values({
      name: body.name,
      subject: body.subject,
      fromName: body.fromName,
      fromEmail: body.fromEmail,
      htmlContent: body.htmlContent,
      textContent: body.textContent ?? null,
      status: body.status ?? "DRAFT",
    }).returning();

    res.status(201).json(campaign);
  } catch {
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [existing] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    const [updated] = await db
      .update(emailCampaignsTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(emailCampaignsTable.id, id))
      .returning();

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [existing] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    await db.delete(emailCampaignsTable).where(eq(emailCampaignsTable.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

router.post("/:id/send", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { recipientContactIds } = req.body as { recipientContactIds: string[] };
    const contactIds = recipientContactIds;

    if (!contactIds || contactIds.length === 0) {
      res.status(400).json({ error: "recipientContactIds array is required" });
      return;
    }

    if (!getResend()) {
      res.status(503).json({ error: "Email sending is not configured. Set RESEND_API_KEY to enable outbound email." });
      return;
    }

    const [campaign] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, id)).limit(1);
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    const contacts = await db
      .select({ id: contactsTable.id, email: contactsTable.email, firstName: contactsTable.firstName, lastName: contactsTable.lastName })
      .from(contactsTable)
      .where(inArray(contactsTable.id, contactIds));

    const validContacts = contacts.filter((c) => c.email);

    await db
      .update(emailCampaignsTable)
      .set({ status: "SENDING", updatedAt: new Date() })
      .where(eq(emailCampaignsTable.id, id));

    const campaignContactRows = validContacts.map((c) => ({
      campaignId: id,
      contactId: c.id,
      email: c.email!,
      status: "PENDING" as const,
    }));

    if (campaignContactRows.length > 0) {
      await db
        .insert(campaignContactsTable)
        .values(campaignContactRows)
        .onConflictDoNothing();
    }

    const resend = getResend()!;
    let sentCount = 0;

    for (const contact of validContacts) {
      if (!contact.email) continue;

      const base = process.env.API_BASE_URL ?? "";
      const trackingPixelUrl = `${base}/api/track/open/${id}?cid=${contact.id}`;

      const htmlWithTracking = campaign.htmlContent
        .replace(
          /href="(https?:\/\/[^"]+)"/gi,
          (_match: string, url: string) =>
            `href="${base}/api/track/click/${id}?cid=${contact.id}&url=${encodeURIComponent(url)}"`,
        )
        .replace(
          "</body>",
          `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" /></body>`,
        );

      try {
        await resend.emails.send({
          from: `${campaign.fromName} <${campaign.fromEmail}>`,
          to: contact.email,
          subject: campaign.subject,
          html: htmlWithTracking,
          text: campaign.textContent ?? undefined,
        });

        await db
          .update(campaignContactsTable)
          .set({ status: "SENT", sentAt: new Date() })
          .where(
            and(
              eq(campaignContactsTable.campaignId, id),
              eq(campaignContactsTable.contactId, contact.id),
            ),
          );
        sentCount++;
      } catch {
        // ignore individual send errors — don't fail the whole batch
      }
    }

    const [updatedCampaign] = await db
      .update(emailCampaignsTable)
      .set({ status: "SENT", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(emailCampaignsTable.id, id))
      .returning();

    const [{ total: statTotal, sent: statSent, opened: statOpened, clicked: statClicked }] = await db
      .select({
        total: sql<number>`count(*)::int`,
        sent: sql<number>`count(case when ${campaignContactsTable.status} != 'PENDING' then 1 end)::int`,
        opened: sql<number>`count(case when ${campaignContactsTable.openedAt} is not null then 1 end)::int`,
        clicked: sql<number>`count(case when ${campaignContactsTable.clickedAt} is not null then 1 end)::int`,
      })
      .from(campaignContactsTable)
      .where(eq(campaignContactsTable.campaignId, id));

    res.json({
      ...updatedCampaign,
      stats: {
        total: statTotal,
        sent: statSent,
        opened: statOpened,
        clicked: statClicked,
        openRate: statSent > 0 ? Math.round((statOpened / statSent) * 100) : 0,
        clickRate: statSent > 0 ? Math.round((statClicked / statSent) * 100) : 0,
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to send campaign" });
  }
});

export default router;
