import { Router, type Request, type Response } from "express";
import { generateUnsubscribeToken } from "./unsubscribe";
import { db, emailCampaignsTable, campaignContactsTable, contactsTable } from "@workspace/db";
import { eq, and, desc, inArray, lte, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { Resend } from "resend";

const router = Router();

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}


async function executeSend(campaignId: string, contactIds: string[]) {
  const [campaign] = await db
    .select()
    .from(emailCampaignsTable)
    .where(eq(emailCampaignsTable.id, campaignId))
    .limit(1);
  if (!campaign) return;

  const resend = getResend();
  if (!resend) return;

  const contacts = await db
    .select({
      id: contactsTable.id,
      email: contactsTable.email,
      firstName: contactsTable.firstName,
      lastName: contactsTable.lastName,
      emailMarketingContact: contactsTable.emailMarketingContact,
    })
    .from(contactsTable)
    .where(inArray(contactsTable.id, contactIds));

  const validContacts = contacts.filter(
    (c) => c.email && c.emailMarketingContact !== false,
  );

  await db
    .update(emailCampaignsTable)
    .set({ status: "SENDING", updatedAt: new Date() })
    .where(eq(emailCampaignsTable.id, campaignId));

  const campaignContactRows = validContacts.map((c) => ({
    campaignId,
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

  const base = process.env.API_BASE_URL ?? "";

  for (const contact of validContacts) {
    if (!contact.email) continue;

    const unsubToken = generateUnsubscribeToken(contact.id, campaignId);
    const unsubscribeUrl = `${base}/api/unsubscribe?token=${unsubToken}`;
    const trackingPixelUrl = `${base}/api/track/open/${campaignId}?cid=${contact.id}`;

    let html = campaign.htmlContent
      .replace(/\{\{firstName\}\}/g, contact.firstName || "")
      .replace(/\{\{lastName\}\}/g, contact.lastName || "")
      .replace(/\{\{fullName\}\}/g, `${contact.firstName || ""} ${contact.lastName || ""}`.trim())
      .replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl)
      .replace(
        /href="(https?:\/\/[^"]+)"/gi,
        (_match: string, url: string) =>
          `href="${base}/api/track/click/${campaignId}?cid=${contact.id}&url=${encodeURIComponent(url)}"`,
      );

    if (!html.includes("</body>")) {
      html += `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />`;
    } else {
      html = html.replace(
        "</body>",
        `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" /></body>`,
      );
    }

    try {
      await resend.emails.send({
        from: `${campaign.fromName} <${campaign.fromEmail}>`,
        to: contact.email,
        subject: campaign.subject,
        html,
        text: campaign.textContent ?? undefined,
      });

      await db
        .update(campaignContactsTable)
        .set({ status: "SENT", sentAt: new Date() })
        .where(
          and(
            eq(campaignContactsTable.campaignId, campaignId),
            eq(campaignContactsTable.contactId, contact.id),
          ),
        );
    } catch {
      // ignore individual send errors
    }
  }

  await db
    .update(emailCampaignsTable)
    .set({ status: "SENT", sentAt: new Date(), updatedAt: new Date() })
    .where(eq(emailCampaignsTable.id, campaignId));
}

export function startCampaignScheduler() {
  setInterval(async () => {
    try {
      const due = await db
        .select()
        .from(emailCampaignsTable)
        .where(
          and(
            eq(emailCampaignsTable.status, "SCHEDULED"),
            lte(emailCampaignsTable.scheduledAt, new Date()),
          ),
        );

      for (const campaign of due) {
        if (campaign.recipientIds && campaign.recipientIds.length > 0) {
          await executeSend(campaign.id, campaign.recipientIds).catch(() => {});
        }
      }
    } catch {
      // swallow scheduler errors
    }
  }, 60_000);
}

function getStats(campaignId: string) {
  return db
    .select({
      total: sql<number>`count(*)::int`,
      sent: sql<number>`count(case when ${campaignContactsTable.status} != 'PENDING' then 1 end)::int`,
      opened: sql<number>`count(case when ${campaignContactsTable.openedAt} is not null then 1 end)::int`,
      clicked: sql<number>`count(case when ${campaignContactsTable.clickedAt} is not null then 1 end)::int`,
      unsubscribed: sql<number>`count(case when ${campaignContactsTable.status} = 'UNSUBSCRIBED' then 1 end)::int`,
    })
    .from(campaignContactsTable)
    .where(eq(campaignContactsTable.campaignId, campaignId))
    .then(([r]) => ({
      total: r.total,
      sent: r.sent,
      opened: r.opened,
      clicked: r.clicked,
      unsubscribed: r.unsubscribed,
      openRate: r.sent > 0 ? Math.round((r.opened / r.sent) * 100) : 0,
      clickRate: r.sent > 0 ? Math.round((r.clicked / r.sent) * 100) : 0,
      unsubscribeRate: r.sent > 0 ? Math.round((r.unsubscribed / r.sent) * 100) : 0,
    }));
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
          unsubscribed: sql<number>`count(distinct case when ${campaignContactsTable.status} = 'UNSUBSCRIBED' then ${campaignContactsTable.id} end)::int`,
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
      data: campaigns.map(({ campaign, total, sent, opened, clicked, unsubscribed }) => ({
        ...campaign,
        stats: {
          total, sent, opened, clicked, unsubscribed,
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
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
    const stats = await getStats(id);
    res.json({ ...campaign, stats });
  } catch {
    res.status(500).json({ error: "Failed to get campaign" });
  }
});

router.get("/:id/recipients", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { search = "" } = req.query as { search?: string };

    const rows = await db
      .select({
        contactId: campaignContactsTable.contactId,
        email: campaignContactsTable.email,
        status: campaignContactsTable.status,
        sentAt: campaignContactsTable.sentAt,
        openedAt: campaignContactsTable.openedAt,
        clickedAt: campaignContactsTable.clickedAt,
        unsubscribedAt: campaignContactsTable.unsubscribedAt,
        firstName: contactsTable.firstName,
        lastName: contactsTable.lastName,
      })
      .from(campaignContactsTable)
      .leftJoin(contactsTable, eq(contactsTable.id, campaignContactsTable.contactId))
      .where(eq(campaignContactsTable.campaignId, id))
      .orderBy(desc(campaignContactsTable.sentAt));

    const filtered = search
      ? rows.filter(r =>
          `${r.firstName} ${r.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
          r.email.toLowerCase().includes(search.toLowerCase())
        )
      : rows;

    res.json(filtered);
  } catch {
    res.status(500).json({ error: "Failed to get recipients" });
  }
});

router.get("/for-contact/:contactId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params as { contactId: string };

    const rows = await db
      .select({
        campaignId: campaignContactsTable.campaignId,
        email: campaignContactsTable.email,
        status: campaignContactsTable.status,
        sentAt: campaignContactsTable.sentAt,
        openedAt: campaignContactsTable.openedAt,
        clickedAt: campaignContactsTable.clickedAt,
        unsubscribedAt: campaignContactsTable.unsubscribedAt,
        campaignName: emailCampaignsTable.name,
        campaignSubject: emailCampaignsTable.subject,
        campaignStatus: emailCampaignsTable.status,
        campaignSentAt: emailCampaignsTable.sentAt,
      })
      .from(campaignContactsTable)
      .innerJoin(emailCampaignsTable, eq(emailCampaignsTable.id, campaignContactsTable.campaignId))
      .where(eq(campaignContactsTable.contactId, contactId))
      .orderBy(desc(campaignContactsTable.sentAt));

    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to get contact campaign history" });
  }
});

router.post("/contact-subscription/:contactId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params as { contactId: string };
    const { action } = req.body as { action?: string };

    const { dbUser } = req as AuthRequest;
    if (dbUser.role !== "ADMIN" && dbUser.role !== "MEMBER") {
      res.status(403).json({ error: "Insufficient permissions to change subscription status" });
      return;
    }

    if (action !== "unsubscribe" && action !== "resubscribe") {
      res.status(400).json({ error: "action must be 'unsubscribe' or 'resubscribe'" });
      return;
    }

    if (action === "unsubscribe") {
      await db
        .update(contactsTable)
        .set({ emailMarketingContact: false, updatedAt: new Date() })
        .where(eq(contactsTable.id, contactId));

      await db
        .update(campaignContactsTable)
        .set({ status: "UNSUBSCRIBED", unsubscribedAt: new Date() })
        .where(
          and(
            eq(campaignContactsTable.contactId, contactId),
            sql`${campaignContactsTable.status} != 'UNSUBSCRIBED'`,
          ),
        );
    } else {
      await db
        .update(contactsTable)
        .set({ emailMarketingContact: true, updatedAt: new Date() })
        .where(eq(contactsTable.id, contactId));

      await db
        .update(campaignContactsTable)
        .set({ status: "SENT", unsubscribedAt: null })
        .where(
          and(
            eq(campaignContactsTable.contactId, contactId),
            eq(campaignContactsTable.status, "UNSUBSCRIBED"),
          ),
        );
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update subscription status" });
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
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      recipientIds: body.recipientIds ?? [],
      segmentId: body.segmentId ?? null,
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
    if (!existing) { res.status(404).json({ error: "Campaign not found" }); return; }

    const body = { ...req.body };
    if (body.scheduledAt) body.scheduledAt = new Date(body.scheduledAt);

    const [updated] = await db
      .update(emailCampaignsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(emailCampaignsTable.id, id))
      .returning();

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

router.patch("/:id/cancel", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [existing] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Campaign not found" }); return; }
    if (existing.status !== "SCHEDULED") { res.status(400).json({ error: "Only scheduled campaigns can be cancelled" }); return; }

    const [updated] = await db
      .update(emailCampaignsTable)
      .set({ status: "DRAFT", scheduledAt: null, updatedAt: new Date() })
      .where(eq(emailCampaignsTable.id, id))
      .returning();

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to cancel campaign" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [existing] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Campaign not found" }); return; }
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

    if (!recipientContactIds || recipientContactIds.length === 0) {
      res.status(400).json({ error: "recipientContactIds array is required" });
      return;
    }

    if (!getResend()) {
      res.status(503).json({ error: "Email sending is not configured. Set RESEND_API_KEY to enable outbound email." });
      return;
    }

    const [campaign] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, id)).limit(1);
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    await executeSend(id, recipientContactIds);
    const stats = await getStats(id);
    const [updatedCampaign] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, id)).limit(1);
    res.json({ ...updatedCampaign, stats });
  } catch {
    res.status(500).json({ error: "Failed to send campaign" });
  }
});

export default router;
