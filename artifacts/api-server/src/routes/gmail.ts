import { Router, type Request, type Response } from "express";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { workspaceSettingsTable, activitiesTable, contactsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

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

async function getStoredToken() {
  const row = await db
    .select()
    .from(workspaceSettingsTable)
    .where(eq(workspaceSettingsTable.key, "gmail_token"))
    .then((r) => r[0]);
  return row ? (row.value as GmailToken) : null;
}

async function saveToken(token: GmailToken) {
  await db
    .insert(workspaceSettingsTable)
    .values({ key: "gmail_token", value: token })
    .onConflictDoUpdate({
      target: workspaceSettingsTable.key,
      set: { value: token, updatedAt: new Date() },
    });
}

interface GmailToken {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  email: string;
  connected_at: string;
  last_sync: string | null;
}

/* GET /api/gmail/status */
router.get("/status", requireAuth, async (_req: Request, res: Response) => {
  const token = await getStoredToken();
  if (!token) {
    res.json({ connected: false });
    return;
  }
  res.json({
    connected: true,
    email: token.email,
    connected_at: token.connected_at,
    last_sync: token.last_sync,
  });
});

/* GET /api/gmail/auth — initiates OAuth flow (must be visited in browser) */
router.get("/auth", async (_req: Request, res: Response) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    res.status(500).send("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env");
    return;
  }
  const oauth2Client = makeOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
  res.redirect(url);
});

/* GET /api/gmail/callback — Google redirects here after consent */
router.get("/callback", async (req: Request, res: Response) => {
  const { code, error } = req.query as Record<string, string>;
  if (error) {
    res.send(`<h3>OAuth error: ${error}</h3><p>Close this tab and try again.</p>`);
    return;
  }
  try {
    const oauth2Client = makeOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch email address
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    const toStore: GmailToken = {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token!,
      expiry_date: tokens.expiry_date!,
      email: userInfo.email!,
      connected_at: new Date().toISOString(),
      last_sync: null,
    };
    await saveToken(toStore);

    // Enable gmail integration
    const existing = await db
      .select()
      .from(workspaceSettingsTable)
      .where(eq(workspaceSettingsTable.key, "gmail"))
      .then((r) => r[0]);
    const merged = { ...(existing?.value as object ?? {}), enabled: true };
    await db
      .insert(workspaceSettingsTable)
      .values({ key: "gmail", value: merged })
      .onConflictDoUpdate({
        target: workspaceSettingsTable.key,
        set: { value: merged, updatedAt: new Date() },
      });

    res.send(`
      <html><body style="font-family:sans-serif;padding:40px;max-width:400px;margin:auto">
        <h2 style="color:#16a34a">✓ Gmail connected</h2>
        <p>Connected as <strong>${userInfo.email}</strong></p>
        <p>You can close this tab and return to the CRM.</p>
        <script>
          setTimeout(() => {
            if (window.opener) { window.opener.postMessage('gmail_connected', '*'); window.close(); }
          }, 1000);
        </script>
      </body></html>
    `);
  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    res.status(500).send(`<h3>Error: ${(err as Error).message}</h3>`);
  }
});

/* DELETE /api/gmail/disconnect */
router.delete("/disconnect", requireAuth, async (_req: Request, res: Response) => {
  await db
    .delete(workspaceSettingsTable)
    .where(eq(workspaceSettingsTable.key, "gmail_token"));
  res.json({ ok: true });
});

/* POST /api/gmail/sync — pulls last N emails, creates activities for matched contacts */
router.post("/sync", requireAuth, async (req: Request, res: Response) => {
  const token = await getStoredToken();
  if (!token) {
    res.status(400).json({ error: "Gmail not connected" });
    return;
  }

  const { dbUser } = req as AuthRequest;
  const maxMessages = Math.min(Number(req.body?.maxMessages ?? 50), 200);

  try {
    const oauth2Client = makeOAuthClient();
    oauth2Client.setCredentials({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expiry_date: token.expiry_date,
    });

    // Auto-refresh token
    oauth2Client.on("tokens", async (newTokens) => {
      if (newTokens.access_token) {
        await saveToken({
          ...token,
          access_token: newTokens.access_token,
          expiry_date: newTokens.expiry_date ?? token.expiry_date,
        });
      }
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Fetch message list
    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: maxMessages,
      q: "in:sent OR in:inbox",
    });

    const messages = listRes.data.messages ?? [];
    if (messages.length === 0) {
      res.json({ synced: 0, skipped: 0 });
      return;
    }

    // Fetch full message details in batches of 10
    const BATCH = 10;
    const fullMessages: Array<{
      id: string;
      subject: string;
      from: string;
      to: string;
      date: Date;
      snippet: string;
      body: string;
      isSent: boolean;
    }> = [];

    for (let i = 0; i < messages.length; i += BATCH) {
      const batch = messages.slice(i, i + BATCH);
      const details = await Promise.all(
        batch.map((m) =>
          gmail.users.messages.get({
            userId: "me",
            id: m.id!,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "To", "Date"],
          }),
        ),
      );

      for (const { data } of details) {
        const headers = data.payload?.headers ?? [];
        const get = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

        const labelIds = data.labelIds ?? [];
        const isSent = labelIds.includes("SENT");

        fullMessages.push({
          id: data.id!,
          subject: get("Subject"),
          from: get("From"),
          to: get("To"),
          date: new Date(parseInt(data.internalDate ?? "0")),
          snippet: data.snippet ?? "",
          body: data.snippet ?? "",
          isSent,
        });
      }
    }

    // Extract all unique email addresses from messages
    const emailPattern = /<([^>]+)>|([^\s,]+@[^\s,]+)/g;
    const extractEmails = (str: string): string[] => {
      const out: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = emailPattern.exec(str)) !== null) {
        out.push((m[1] ?? m[2]).toLowerCase());
      }
      emailPattern.lastIndex = 0;
      return out;
    };

    const allEmails = new Set<string>();
    for (const msg of fullMessages) {
      extractEmails(msg.from).forEach((e) => allEmails.add(e));
      extractEmails(msg.to).forEach((e) => allEmails.add(e));
    }
    // Remove own email
    allEmails.delete(token.email.toLowerCase());

    // Look up contacts by email
    const emailList = Array.from(allEmails);
    const contacts = emailList.length
      ? await db
          .select({ id: contactsTable.id, email: contactsTable.email })
          .from(contactsTable)
          .where(inArray(contactsTable.email, emailList))
      : [];

    const emailToContactId = new Map(
      contacts.map((c) => [c.email!.toLowerCase(), c.id]),
    );

    // Check which message IDs already synced (stored in metadata)
    const existingActivities = await db
      .select({ metadata: activitiesTable.metadata })
      .from(activitiesTable);

    const syncedGmailIds = new Set(
      existingActivities
        .map((a) => (a.metadata as { gmailId?: string } | null)?.gmailId)
        .filter(Boolean),
    );

    let synced = 0;
    let skipped = 0;

    for (const msg of fullMessages) {
      if (syncedGmailIds.has(msg.id)) {
        skipped++;
        continue;
      }

      // Find contact from the other party's email
      const otherEmails = msg.isSent
        ? extractEmails(msg.to)
        : extractEmails(msg.from);

      const contactId = otherEmails
        .map((e) => emailToContactId.get(e.toLowerCase()))
        .find(Boolean);

      // Skip if no contact match and no subject (likely noise)
      if (!contactId && !msg.subject) {
        skipped++;
        continue;
      }

      await db.insert(activitiesTable).values({
        type: "EMAIL_SENT",
        title: msg.subject || "(no subject)",
        description: msg.snippet,
        emailSubject: msg.subject || undefined,
        emailBody: msg.body || undefined,
        contactId: contactId ?? null,
        userId: dbUser.id,
        createdAt: msg.date,
        metadata: { gmailId: msg.id, from: msg.from, to: msg.to },
      });
      synced++;
    }

    // Update last_sync
    await saveToken({ ...token, last_sync: new Date().toISOString() });

    res.json({ synced, skipped, total: fullMessages.length });
  } catch (err) {
    console.error("Gmail sync error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
