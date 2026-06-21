import { Router, type Request, type Response } from "express";
import Busboy from "busboy";
import fs from "fs";
import path from "path";
import { db, contactsTable, activitiesTable, attachmentsTable } from "@workspace/db";
import { eq, ilike, or } from "drizzle-orm";

const router = Router();

const INBOUND_TOKEN = process.env["SENDGRID_INBOUND_TOKEN"];
const MAIL_DOMAIN = process.env["INBOUND_MAIL_DOMAIN"] ?? "mail.ennabl.com";
const CRM_DOMAIN = process.env["CRM_DOMAIN"] ?? "ennabl.com";
const UPLOADS_DIR = path.join(process.cwd(), "uploads", "email-attachments");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/) ?? raw.match(/(\S+@\S+)/);
  return match ? match[1]!.toLowerCase().trim() : raw.toLowerCase().trim();
}

function extractEmails(raw: string): string[] {
  return raw
    .split(",")
    .map((p) => extractEmail(p.trim()))
    .filter((e) => e.includes("@"));
}

function getContactIdFromBcc(emails: string[]): string | null {
  for (const email of emails) {
    const atIdx = email.indexOf("@");
    if (atIdx === -1) continue;
    const local = email.slice(0, atIdx);
    const domain = email.slice(atIdx + 1);
    if (domain === MAIL_DOMAIN && UUID_RE.test(local)) return local;
  }
  return null;
}

// POST /email/inbound
// Accepts SendGrid Inbound Parse multipart/form-data.
// Auth via ?token= query param (no Authorization header on webhook).
router.post("/", async (req: Request, res: Response) => {
  if (INBOUND_TOKEN && req.query["token"] !== INBOUND_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const fields: Record<string, string> = {};
  const attachmentBuffers: { filename: string; contentType: string; buffer: Buffer }[] = [];

  await new Promise<void>((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });
    bb.on("field", (name, value) => { fields[name] = value; });
    bb.on("file", (_name, stream, info) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        attachmentBuffers.push({
          filename: info.filename || "attachment",
          contentType: info.mimeType || "application/octet-stream",
          buffer: Buffer.concat(chunks),
        });
      });
    });
    bb.on("finish", resolve);
    bb.on("error", reject);
    req.pipe(bb);
  });

  try {
    const fromRaw = fields["from"] ?? "";
    const toRaw = fields["to"] ?? "";
    const ccRaw = fields["cc"] ?? "";
    const subject = fields["subject"] ?? "(no subject)";
    const body = fields["text"] ?? fields["html"] ?? "";

    let envelope: { from?: string; to?: string[] } = {};
    try { envelope = JSON.parse(fields["envelope"] ?? "{}"); } catch { /* malformed — use header fields */ }

    const fromEmail = extractEmail(fromRaw || envelope.from || "");
    const toEmails = extractEmails(toRaw);
    const ccEmails = extractEmails(ccRaw);
    // envelope.to includes BCC recipients that headers omit
    const allRecipients = [
      ...(envelope.to ?? []).map((e) => e.toLowerCase()),
      ...toEmails,
      ...ccEmails,
    ];
    const uniqueRecipients = [...new Set(allRecipients)];

    const isFromInternal = fromEmail.endsWith(`@${CRM_DOMAIN}`);
    const direction = isFromInternal ? "sent" : "received";

    // Direct routing: BCC address {contactId}@mail.ennabl.com
    const bccContactId = getContactIdFromBcc(uniqueRecipients);

    // External email addresses (exclude BCC domain and internal CRM domain)
    const externalEmails = uniqueRecipients.filter(
      (e) => !e.endsWith(`@${MAIL_DOMAIN}`) && !e.endsWith(`@${CRM_DOMAIN}`),
    );

    let contactsToLog: { id: string; companyId: string | null }[] = [];

    if (bccContactId) {
      const rows = await db
        .select({ id: contactsTable.id, companyId: contactsTable.companyId })
        .from(contactsTable)
        .where(eq(contactsTable.id, bccContactId))
        .limit(1);
      contactsToLog = rows;
    }

    if (contactsToLog.length === 0 && externalEmails.length > 0) {
      const conditions = externalEmails.map((e) => ilike(contactsTable.email, e));
      const rows = await db
        .select({ id: contactsTable.id, companyId: contactsTable.companyId })
        .from(contactsTable)
        .where(conditions.length === 1 ? conditions[0]! : or(...conditions));
      contactsToLog = rows;
    }

    if (contactsToLog.length === 0) {
      res.json({ ok: true, logged: 0, reason: "no matching contacts" });
      return;
    }

    // Save attachment files once; link records per contact below
    const savedAttachments: {
      id: string;
      filename: string;
      contentType: string;
      size: number;
      objectPath: string;
    }[] = [];

    for (const att of attachmentBuffers) {
      const attId = crypto.randomUUID();
      const dir = path.join(UPLOADS_DIR, attId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, att.filename), att.buffer);
      savedAttachments.push({
        id: attId,
        filename: att.filename,
        contentType: att.contentType,
        size: att.buffer.length,
        objectPath: `email-attachments/${attId}/${att.filename}`,
      });
    }

    for (const contact of contactsToLog) {
      await db.insert(activitiesTable).values({
        type: "EMAIL_SENT",
        title: subject,
        description: body.substring(0, 500),
        contactId: contact.id,
        companyId: contact.companyId ?? undefined,
        metadata: {
          from: fromEmail,
          to: toEmails.join(", "),
          direction,
          attachmentCount: savedAttachments.length,
          source: "inbound-parse",
        },
      });

      for (const att of savedAttachments) {
        await db.insert(attachmentsTable).values({
          id: att.id,
          documentId: att.id,
          version: 1,
          objectType: "contact",
          recordId: contact.id,
          objectPath: att.objectPath,
          fileName: att.filename,
          contentType: att.contentType,
          fileSize: att.size,
          uploadedBy: "email-inbound",
        });
      }
    }

    res.json({ ok: true, logged: contactsToLog.length });
  } catch (err) {
    console.error("email-inbound error", err);
    // Always 200 to prevent SendGrid from retrying
    res.json({ ok: false, error: "internal error" });
  }
});

export default router;
