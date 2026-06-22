import { Router } from "express";
import {
  db, usersTable, baUserTable, baSessionTable, baVerificationTable,
  dealsTable, tasksTable, dealStagesTable,
} from "@workspace/db";
import { eq, and, not, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import type { Request, Response } from "express";

const router = Router();

function requireAdmin(req: Request, res: Response): boolean {
  const { dbUser } = req as AuthRequest;
  if (dbUser.role !== "ADMIN") {
    res.status(403).json({ error: "Admin only" });
    return false;
  }
  return true;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getBaseUrl(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  return domain ? `https://${domain}` : `http://localhost:${process.env.PORT ?? 3000}`;
}

/* ── GET /team ─────────────────────────────────────────────── */

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const members = await db.select().from(usersTable).orderBy(usersTable.createdAt);
    res.json({ members, pending: [] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── POST /team/add-user ────────────────────────────────────── */
/* Creates the account with the invite token as the initial     */
/* (throwaway) password, stores the token, returns the invite   */
/* URL. Email sending slot is marked with TODO below.           */

import { auth } from "../lib/auth";

router.post("/add-user", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { email, name, title, phone, tags, insuranceGroups } = req.body as {
    email?: string;
    name?: string;
    title?: string;
    phone?: string;
    tags?: string[];
    insuranceGroups?: string[];
  };

  if (!email || !EMAIL_RE.test(email.trim())) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }

  try {
    const inviteToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: email.trim(),
        password: inviteToken,
        name: name?.trim() ?? email.trim(),
      },
    });

    const baUserId = signUpResult?.user?.id ?? null;

    const [dbUser] = await db
      .insert(usersTable)
      .values({
        authId: baUserId,
        email: email.trim(),
        name: name?.trim() ?? null,
        title: title?.trim() ?? null,
        phone: phone?.trim() ?? null,
        tags: tags ?? [],
        insuranceGroups: insuranceGroups ?? [],
      })
      .onConflictDoUpdate({
        target: usersTable.email,
        set: {
          authId: baUserId,
          name: name?.trim() ?? null,
          title: title?.trim() ?? null,
          phone: phone?.trim() ?? null,
          tags: tags ?? [],
          insuranceGroups: insuranceGroups ?? [],
          updatedAt: new Date(),
        },
      })
      .returning();

    await db.insert(baVerificationTable).values({
      id: crypto.randomUUID(),
      identifier: `crm-invite-${inviteToken}`,
      value: JSON.stringify({ email: email.trim(), name: name?.trim() ?? null }),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const inviteUrl = `${getBaseUrl()}/set-password?token=${inviteToken}`;

    // TODO: when email is configured, send inviteUrl to email.trim() here

    res.status(201).json({ ...dbUser, inviteUrl });
  } catch (err) {
    const e = err as { message?: string };
    res.status(400).json({ error: e.message ?? "Failed to create user" });
  }
});

/* ── GET /team/invite/:token ────────────────────────────────── */
/* Public — called by the /set-password page before the user    */
/* is authenticated so we can display name + email.             */

router.get("/invite/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  try {
    const [record] = await db
      .select()
      .from(baVerificationTable)
      .where(eq(baVerificationTable.identifier, `crm-invite-${token}`))
      .limit(1);

    if (!record || record.expiresAt < new Date()) {
      res.status(404).json({ error: "Invite link is invalid or has expired" });
      return;
    }

    const payload = JSON.parse(record.value) as { email: string; name: string | null };
    res.json({ email: payload.email, name: payload.name });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── DELETE /team/invite/:token ─────────────────────────────── */
/* Called after the user successfully sets their password.      */
/* Cleans up the one-time invite record.                        */

router.delete("/invite/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  try {
    await db
      .delete(baVerificationTable)
      .where(eq(baVerificationTable.identifier, `crm-invite-${token}`));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── PATCH /team/:userId/role ───────────────────────────────── */

router.patch("/:userId/role", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { dbUser } = req as AuthRequest;
  const userId = req.params.userId as string;
  const { role } = req.body as { role?: string };

  if (role !== "ADMIN" && role !== "MEMBER") {
    res.status(400).json({ error: "role must be ADMIN or MEMBER" });
    return;
  }
  if (dbUser.id === userId && role === "MEMBER") {
    res.status(400).json({ error: "You cannot demote yourself" });
    return;
  }

  try {
    const [updated] = await db
      .update(usersTable)
      .set({ role: role as "ADMIN" | "MEMBER", updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning();

    if (!updated) { res.status(404).json({ error: "User not found" }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── PATCH /team/:userId/status ─────────────────────────────── */

router.patch("/:userId/status", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { dbUser } = req as AuthRequest;
  const userId = req.params.userId as string;
  const { status } = req.body as { status?: string };

  if (status !== "ACTIVE" && status !== "INACTIVE" && status !== "ARCHIVED") {
    res.status(400).json({ error: "status must be ACTIVE, INACTIVE, or ARCHIVED" });
    return;
  }
  if (dbUser.id === userId && status !== "ACTIVE") {
    res.status(400).json({ error: "You cannot deactivate or archive yourself" });
    return;
  }

  try {
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!target) { res.status(404).json({ error: "User not found" }); return; }

    if (target.authId) {
      if (status === "INACTIVE" || status === "ARCHIVED") {
        await db.update(baUserTable)
          .set({ banned: true, banReason: status === "ARCHIVED" ? "archived" : "deactivated" })
          .where(eq(baUserTable.id, target.authId));
        await db.delete(baSessionTable).where(eq(baSessionTable.userId, target.authId));
      } else {
        await db.update(baUserTable)
          .set({ banned: false, banReason: null })
          .where(eq(baUserTable.id, target.authId));
      }
    }

    const [updated] = await db
      .update(usersTable)
      .set({ status: status as "ACTIVE" | "INACTIVE" | "ARCHIVED", updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── PATCH /team/:userId/profile ────────────────────────────── */

router.patch("/:userId/profile", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const userId = req.params.userId as string;
  const { name, title, phone, tags, insuranceGroups } = req.body as {
    name?: string; title?: string; phone?: string;
    tags?: string[]; insuranceGroups?: string[];
  };

  try {
    const [updated] = await db
      .update(usersTable)
      .set({
        ...(name !== undefined && { name: name.trim() || null }),
        ...(title !== undefined && { title: title.trim() || null }),
        ...(phone !== undefined && { phone: phone.trim() || null }),
        ...(tags !== undefined && { tags }),
        ...(insuranceGroups !== undefined && { insuranceGroups }),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId))
      .returning();

    if (!updated) { res.status(404).json({ error: "User not found" }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── DELETE /team/:userId ───────────────────────────────────── */

router.delete("/:userId", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { dbUser } = req as AuthRequest;
  const userId = req.params.userId as string;

  if (dbUser.id === userId) {
    res.status(400).json({ error: "You cannot remove yourself" });
    return;
  }

  try {
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!target) { res.status(404).json({ error: "User not found" }); return; }

    if (target.authId) {
      await db.delete(baSessionTable).where(eq(baSessionTable.userId, target.authId));
      await db.delete(baUserTable).where(eq(baUserTable.id, target.authId));
    }

    await db.delete(usersTable).where(eq(usersTable.id, userId));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── GET /team/my-assignments ───────────────────────────────── */

router.get("/my-assignments", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const [dealRows, taskRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(dealsTable)
        .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
        .where(
          and(
            eq(dealsTable.assigneeId, dbUser.id),
            not(eq(dealStagesTable.name, "Closed Won")),
            not(eq(dealStagesTable.name, "Closed Lost")),
          ),
        ),
      db.select({ count: sql<number>`count(*)::int` })
        .from(tasksTable)
        .where(and(eq(tasksTable.assigneeId, dbUser.id), eq(tasksTable.completed, false))),
    ]);
    res.json({ deals: dealRows[0]?.count ?? 0, tasks: taskRows[0]?.count ?? 0 });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ── POST /team/bootstrap-admin ─────────────────────────────── */

router.post("/bootstrap-admin", requireAuth, async (req: Request, res: Response) => {
  try {
    const dbUser = (req as AuthRequest).dbUser;
    const admins = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.role, "ADMIN")).limit(1);
    if (admins.length > 0) {
      res.status(400).json({ error: "An admin already exists. Ask them to promote you." });
      return;
    }
    const [updated] = await db.update(usersTable).set({ role: "ADMIN" })
      .where(eq(usersTable.id, dbUser.id)).returning();
    res.json({ ok: true, user: updated });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
