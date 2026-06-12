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
  const data = Buffer.from(`${contactId}:${campaignId}`).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(data).digest("hex");
  return `${data}.${sig}`;
}

function verifyUnsubscribeToken(token: string): { contactId: string; campaignId: string } | null {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx < 0) return null;
  const data = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = createHmac("sha256", getSecret()).update(data).digest("hex");
  if (expectedSig.length !== sig.length) return null;
  let mismatch = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    mismatch |= expectedSig.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (mismatch !== 0) return null;
  try {
    const decoded = Buffer.from(data, "base64url").toString("utf-8");
    const colonIdx = decoded.indexOf(":");
    if (colonIdx < 0) return null;
    const contactId = decoded.slice(0, colonIdx);
    const campaignId = decoded.slice(colonIdx + 1);
    if (!contactId || !campaignId) return null;
    return { contactId, campaignId };
  } catch {
    return null;
  }
}

router.get("/unsubscribe", async (req: Request, res: Response) => {
  const { token } = req.query as { token?: string };

  if (!token) {
    res.status(400).send(unsubscribePage("Invalid Link", "The unsubscribe link is missing required parameters."));
    return;
  }

  let parsed: { contactId: string; campaignId: string } | null;
  try {
    parsed = verifyUnsubscribeToken(token);
  } catch {
    res.status(400).send(unsubscribePage("Invalid Link", "This unsubscribe link is invalid or has expired."));
    return;
  }

  if (!parsed) {
    res.status(400).send(unsubscribePage("Invalid Link", "This unsubscribe link is invalid or has expired."));
    return;
  }

  const { contactId, campaignId } = parsed;

  try {
    await db
      .update(contactsTable)
      .set({ emailMarketingContact: false, updatedAt: new Date() })
      .where(eq(contactsTable.id, contactId));

    await db
      .update(campaignContactsTable)
      .set({ status: "UNSUBSCRIBED", unsubscribedAt: new Date() })
      .where(
        and(
          eq(campaignContactsTable.campaignId, campaignId),
          eq(campaignContactsTable.contactId, contactId),
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
