import { Router, type Request, type Response } from "express";
import { createHmac } from "crypto";
import { db, contactsTable, campaignContactsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

function getSecret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("BETTER_AUTH_SECRET environment variable is required but not set");
  return s;
}

export function generateUnsubscribeToken(contactId: string, campaignId: string): string {
  return createHmac("sha256", getSecret())
    .update(`${contactId}:${campaignId}`)
    .digest("hex");
}

function verifyUnsubscribeToken(contactId: string, campaignId: string, token: string): boolean {
  const expected = generateUnsubscribeToken(contactId, campaignId);
  if (expected.length !== token.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}

router.get("/unsubscribe", async (req: Request, res: Response) => {
  const { cid, campaign, token } = req.query as { cid?: string; campaign?: string; token?: string };

  if (!cid || !campaign || !token) {
    res.status(400).send(unsubscribePage("Invalid Link", "The unsubscribe link is missing required parameters."));
    return;
  }

  if (!verifyUnsubscribeToken(cid, campaign, token)) {
    res.status(400).send(unsubscribePage("Invalid Link", "This unsubscribe link is invalid or has expired."));
    return;
  }

  try {
    await db
      .update(contactsTable)
      .set({ emailMarketingContact: false, updatedAt: new Date() })
      .where(eq(contactsTable.id, cid));

    await db
      .update(campaignContactsTable)
      .set({ status: "UNSUBSCRIBED", unsubscribedAt: new Date() })
      .where(
        and(
          eq(campaignContactsTable.campaignId, campaign),
          eq(campaignContactsTable.contactId, cid),
        ),
      );

    res.send(unsubscribePage("Unsubscribed", "You have been successfully unsubscribed and will no longer receive marketing emails."));
  } catch {
    res.status(500).send(unsubscribePage("Error", "Something went wrong. Please try again later."));
  }
});

function unsubscribePage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 60px 20px; background: #f9fafb; font-family: Arial, sans-serif; display: flex; align-items: flex-start; justify-content: center; }
    .card { background: #fff; border-radius: 12px; padding: 40px; max-width: 480px; width: 100%; box-shadow: 0 1px 3px rgba(0,0,0,.1); text-align: center; }
    h1 { margin: 0 0 16px; font-size: 24px; color: #111; }
    p { margin: 0; color: #6b7280; font-size: 16px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

export default router;
