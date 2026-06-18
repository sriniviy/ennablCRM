import { Router, type Request, type Response } from "express";
import { google } from "googleapis";
import { db } from "@workspace/db";
import {
  userGmailTokensTable,
  oauthStatesTable,
  activitiesTable,
  contactsTable,
  attachmentsTable,
} from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { auth } from "../lib/auth";
import { usersTable } from "@workspace/db";
import { randomUUID } from "crypto";

const router = Router();

// ── OAuth client factory ─────────────────────────────────────────────────────

function makeOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ?? `${process.env.API_BASE_URL}/api/gmail/callback`,
  );
}

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

// ── Token helpers ────────────────────────────────────────────────────────────

async function getTokenForUser(userId: string) {
  return db
    .select()
    .from(userGmailTokensTable)
    .where(eq(userGmailTokensTable.userId, userId))
    .then((r) => r[0] ?? null);
}

async function saveTokenForUser(
  userId: string,
  fields: Partial<typeof userGmailTokensTable.$inferInsert> & {
    email: string;
    accessToken: string;
    refreshToken: string;
    expiryDate: number;
  },
) {
  await db
    .insert(userGmailTokensTable)
    .values({ id: randomUUID(), userId, ...fields })
    .onConflictDoUpdate({
      target: userGmailTokensTable.userId,
      set: {
        ...fields,
        ...(fields.lastSync !== undefined ? { lastSync: fields.lastSync } : {}),
      },
    });
}

function buildAuthClient(token: typeof userGmailTokensTable.$inferSelect) {
  const oauth2Client = makeOAuthClient();
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiryDate,
  });
  return oauth2Client;
}

// ── Email address extraction ─────────────────────────────────────────────────

const EMAIL_RE = /<([^>]+)>|([^\s,<>"]+@[^\s,<>"]+\.[^\s,<>"]+)/g;

function extractEmails(str: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  EMAIL_RE.lastIndex = 0;
  while ((m = EMAIL_RE.exec(str)) !== null) {
    out.push((m[1] ?? m[2]).toLowerCase().trim());
  }
  return out;
}

// ── Core sync function ───────────────────────────────────────────────────────

export async function syncUserGmail(userId: string, maxMessages = 100) {
  const token = await getTokenForUser(userId);
  if (!token) throw new Error("Gmail not connected for this user");

  const oauth2Client = buildAuthClient(token);

  // Auto-refresh token
  oauth2Client.on("tokens", async (newTokens) => {
    if (newTokens.access_token) {
      await db
        .update(userGmailTokensTable)
        .set({
          accessToken: newTokens.access_token,
          expiryDate: newTokens.expiry_date ?? token.expiryDate,
        })
        .where(eq(userGmailTokensTable.userId, userId));
    }
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Build query — only emails since last sync
  const afterClause = token.lastSync
    ? `after:${Math.floor(new Date(token.lastSync).getTime() / 1000)}`
    : "";
  const q = `(in:sent OR in:inbox) ${afterClause}`.trim();

  const listRes = await gmail.users.messages.list({
    userId: "me",
    maxResults: maxMessages,
    q,
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) {
    await db
      .update(userGmailTokensTable)
      .set({ lastSync: new Date() })
      .where(eq(userGmailTokensTable.userId, userId));
    return { synced: 0, skipped: 0, total: 0 };
  }

  // Fetch full message metadata in batches of 10
  type ParsedMessage = {
    id: string;
    subject: string;
    from: string;
    to: string;
    cc: string;
    date: Date;
    snippet: string;
    isSent: boolean;
    hasAttachments: boolean;
    attachmentParts: Array<{ filename: string; mimeType: string; attachmentId: string; size: number }>;
  };

  const parsed: ParsedMessage[] = [];
  const BATCH = 10;

  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    const details = await Promise.all(
      batch.map((m) =>
        gmail.users.messages.get({
          userId: "me",
          id: m.id!,
          format: "full",
        }),
      ),
    );

    for (const { data } of details) {
      const headers = data.payload?.headers ?? [];
      const h = (name: string) =>
        headers.find((hd) => hd.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

      const labelIds = data.labelIds ?? [];
      const isSent = labelIds.includes("SENT");

      // Collect attachment parts recursively
      const attachmentParts: ParsedMessage["attachmentParts"] = [];
      const collectParts = (parts: typeof data.payload.parts): void => {
        if (!parts) return;
        for (const part of parts) {
          if (part.filename && part.body?.attachmentId) {
            attachmentParts.push({
              filename: part.filename,
              mimeType: part.mimeType ?? "application/octet-stream",
              attachmentId: part.body.attachmentId,
              size: part.body.size ?? 0,
            });
          }
          if (part.parts) collectParts(part.parts);
        }
      };
      collectParts(data.payload?.parts ?? []);

      parsed.push({
        id: data.id!,
        subject: h("Subject"),
        from: h("From"),
        to: h("To"),
        cc: h("Cc"),
        date: new Date(parseInt(data.internalDate ?? "0")),
        snippet: data.snippet ?? "",
        isSent,
        hasAttachments: attachmentParts.length > 0,
        attachmentParts,
      });
    }
  }

  // Collect all unique external email addresses
  const allEmails = new Set<string>();
  for (const msg of parsed) {
    extractEmails(msg.from).forEach((e) => allEmails.add(e));
    extractEmails(msg.to).forEach((e) => allEmails.add(e));
    extractEmails(msg.cc).forEach((e) => allEmails.add(e));
  }
  allEmails.delete(token.email.toLowerCase());

  // Match to CRM contacts
  const emailList = Array.from(allEmails);
  const contacts = emailList.length
    ? await db
        .select({ id: contactsTable.id, email: contactsTable.email, companyId: contactsTable.companyId })
        .from(contactsTable)
        .where(inArray(contactsTable.email, emailList))
    : [];

  const emailToContact = new Map(
    contacts.map((c) => [c.email!.toLowerCase(), c]),
  );

  // Find already-synced Gmail IDs to avoid duplicates
  const existingRows = await db
    .select({ metadata: activitiesTable.metadata })
    .from(activitiesTable);
  const syncedIds = new Set(
    existingRows
      .map((r) => (r.metadata as { gmailId?: string } | null)?.gmailId)
      .filter(Boolean),
  );

  let synced = 0;
  let skipped = 0;

  for (const msg of parsed) {
    if (syncedIds.has(msg.id)) {
      skipped++;
      continue;
    }

    // Determine the contact (the non-org party)
    const otherEmails = msg.isSent
      ? [...extractEmails(msg.to), ...extractEmails(msg.cc)]
      : extractEmails(msg.from);

    const matchedContact = otherEmails
      .map((e) => emailToContact.get(e.toLowerCase()))
      .find(Boolean);

    // Skip if no contact match (avoids flooding CRM with internal emails)
    if (!matchedContact) {
      skipped++;
      continue;
    }

    const activityId = randomUUID();
    await db.insert(activitiesTable).values({
      id: activityId,
      type: "EMAIL_SENT",
      title: msg.subject || "(no subject)",
      description: msg.snippet,
      emailSubject: msg.subject || undefined,
      emailBody: msg.snippet || undefined,
      contactId: matchedContact.id,
      companyId: matchedContact.companyId ?? undefined,
      userId,
      createdAt: msg.date,
      metadata: {
        gmailId: msg.id,
        from: msg.from,
        to: msg.to,
        cc: msg.cc || undefined,
        direction: msg.isSent ? "sent" : "received",
        hasAttachments: msg.hasAttachments,
        attachmentCount: msg.attachmentParts.length,
      },
    });

    // Create attachment records (metadata only — served via /api/gmail/attachment)
    for (const part of msg.attachmentParts) {
      await db.insert(attachmentsTable).values({
        id: randomUUID(),
        documentId: randomUUID(),
        version: 1,
        objectType: "contact",
        recordId: matchedContact.id,
        objectPath: `/gmail/${userId}/${msg.id}/${part.attachmentId}`,
        fileName: part.filename,
        contentType: part.mimeType,
        fileSize: part.size,
        uploadedBy: userId,
      });
    }

    synced++;
  }

  await db
    .update(userGmailTokensTable)
    .set({ lastSync: new Date() })
    .where(eq(userGmailTokensTable.userId, userId));

  return { synced, skipped, total: parsed.length };
}

// ── Background scheduler ─────────────────────────────────────────────────────

export function startGmailSyncScheduler() {
  const INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

  const run = async () => {
    const allTokens = await db.select().from(userGmailTokensTable).catch(() => []);
    for (const token of allTokens) {
      syncUserGmail(token.userId, 50).catch((err) =>
        console.error(`[gmail-sync] user ${token.userId} failed:`, err.message),
      );
    }
  };

  // Run once 30 seconds after startup, then on interval
  setTimeout(run, 30_000);
  setInterval(run, INTERVAL_MS);
  console.log("[gmail-sync] scheduler started (5-min interval)");
}

// ── Routes ───────────────────────────────────────────────────────────────────

/* GET /api/gmail/status — current user's connection status */
router.get("/status", requireAuth, async (req: Request, res: Response) => {
  const { dbUser } = req as AuthRequest;
  const token = await getTokenForUser(dbUser.id);
  if (!token) {
    res.json({ connected: false });
    return;
  }
  res.json({
    connected: true,
    email: token.email,
    connectedAt: token.connectedAt,
    lastSync: token.lastSync,
  });
});

/* GET /api/gmail/all-status — all connected users (admin only) */
router.get("/all-status", requireAuth, async (req: Request, res: Response) => {
  const { dbUser } = req as AuthRequest;
  if (dbUser.role !== "ADMIN") { res.status(403).json({ error: "Admin only" }); return; }
  const rows = await db.select({
    userId: userGmailTokensTable.userId,
    email: userGmailTokensTable.email,
    connectedAt: userGmailTokensTable.connectedAt,
    lastSync: userGmailTokensTable.lastSync,
  }).from(userGmailTokensTable);
  res.json(rows);
});

/* GET /api/gmail/auth — initiate OAuth for the current user.
   Accepts ?token= query param because this is a browser redirect (no Authorization header). */
router.get("/auth", async (req: Request, res: Response) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    res.status(500).send("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env");
    return;
  }

  // Validate the session token passed as query param
  const sessionToken = req.query.token as string | undefined;
  if (!sessionToken) {
    res.status(401).send("Missing auth token. Please connect from within the CRM.");
    return;
  }

  const session = await auth.api.getSession({
    headers: new Headers({ authorization: `Bearer ${sessionToken}` }),
  }).catch(() => null);

  if (!session) {
    res.status(401).send("Invalid or expired session. Please log in and try again.");
    return;
  }

  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, session.user.email))
    .limit(1);

  if (!dbUser) {
    res.status(403).send("User not found in CRM.");
    return;
  }

  const state = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10-min window

  await db
    .insert(oauthStatesTable)
    .values({ state, userId: dbUser.id, expiresAt })
    .onConflictDoNothing();

  const oauth2Client = makeOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state,
  });
  res.redirect(url);
});

/* GET /api/gmail/callback — Google redirects here */
router.get("/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    res.send(`<html><body style="font-family:sans-serif;padding:40px"><h3>OAuth cancelled</h3><p>Close this tab.</p></body></html>`);
    return;
  }

  // Look up the userId from state
  const stateRow = await db
    .select()
    .from(oauthStatesTable)
    .where(and(eq(oauthStatesTable.state, state), ))
    .then((r) => r[0] ?? null);

  if (!stateRow || new Date(stateRow.expiresAt) < new Date()) {
    res.status(400).send(`<html><body style="font-family:sans-serif;padding:40px"><h3>Invalid or expired link.</h3><p>Close this tab and try connecting again.</p></body></html>`);
    return;
  }

  // Clean up state
  await db.delete(oauthStatesTable).where(eq(oauthStatesTable.state, state));

  try {
    const oauth2Client = makeOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2Api.userinfo.get();

    await saveTokenForUser(stateRow.userId, {
      email: userInfo.email!,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiryDate: tokens.expiry_date!,
    });

    res.send(`
      <html><body style="font-family:sans-serif;padding:40px;max-width:420px;margin:auto;text-align:center">
        <div style="font-size:48px;margin-bottom:16px">✓</div>
        <h2 style="color:#16a34a;margin:0 0 8px">Gmail connected</h2>
        <p style="color:#6b7280;margin:0 0 24px">Connected as <strong style="color:#111">${userInfo.email}</strong></p>
        <p style="color:#6b7280;font-size:14px">You can close this tab and return to the CRM.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage('gmail_connected', '*');
            setTimeout(() => window.close(), 1500);
          }
        </script>
      </body></html>
    `);
  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    res.status(500).send(`<html><body style="font-family:sans-serif;padding:40px"><h3>Error: ${(err as Error).message}</h3></body></html>`);
  }
});

/* DELETE /api/gmail/disconnect — current user disconnects */
router.delete("/disconnect", requireAuth, async (req: Request, res: Response) => {
  const { dbUser } = req as AuthRequest;
  await db.delete(userGmailTokensTable).where(eq(userGmailTokensTable.userId, dbUser.id));
  res.json({ ok: true });
});

/* POST /api/gmail/sync — manual sync for current user */
router.post("/sync", requireAuth, async (req: Request, res: Response) => {
  const { dbUser } = req as AuthRequest;
  const maxMessages = Math.min(Number(req.body?.maxMessages ?? 100), 200);
  try {
    const result = await syncUserGmail(dbUser.id, maxMessages);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/* GET /api/gmail/attachment/:userId/:messageId/:attachmentId — stream from Gmail */
router.get("/attachment/:userId/:messageId/:attachmentId", requireAuth, async (req: Request, res: Response) => {
  const { userId, messageId, attachmentId } = req.params;
  const { dbUser } = req as AuthRequest;

  // Users can only access their own attachments (or admins can access any)
  if (dbUser.id !== userId && dbUser.role !== "ADMIN") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const token = await getTokenForUser(userId);
  if (!token) { res.status(404).json({ error: "Gmail not connected" }); return; }

  try {
    const oauth2Client = buildAuthClient(token);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const attachmentRes = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });

    const data = attachmentRes.data.data;
    if (!data) { res.status(404).json({ error: "Attachment not found" }); return; }

    // Gmail uses URL-safe base64
    const buf = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");

    // Get filename from attachment record
    const attRow = await db
      .select({ fileName: attachmentsTable.fileName, contentType: attachmentsTable.contentType })
      .from(attachmentsTable)
      .where(eq(attachmentsTable.objectPath, `/gmail/${userId}/${messageId}/${attachmentId}`))
      .then((r) => r[0]);

    res.setHeader("Content-Type", attRow?.contentType ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${attRow?.fileName ?? "attachment"}"`);
    res.setHeader("Content-Length", buf.length);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
