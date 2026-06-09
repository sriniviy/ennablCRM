import { Router } from "express";
import { createClerkClient } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import type { Request, Response } from "express";

const router = Router();

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

function requireAdmin(req: Request, res: Response): boolean {
  const { dbUser } = req as AuthRequest;
  if (dbUser.role !== "ADMIN") {
    res.status(403).json({ error: "Admin only" });
    return false;
  }
  return true;
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const members = await db
      .select()
      .from(usersTable)
      .orderBy(usersTable.createdAt);

    let pending: { id: string; emailAddress: string; createdAt: string }[] = [];
    try {
      const invitationList = await clerk.invitations.getInvitationList({
        status: "pending",
        limit: 100,
      });
      pending = (invitationList.data ?? []).map((inv) => ({
        id: inv.id,
        emailAddress: inv.emailAddress,
        createdAt: new Date(inv.createdAt).toISOString(),
      }));
    } catch {
      pending = [];
    }

    res.json({ members, pending });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/invite", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const email = (req.body as { email?: string })?.email?.trim() ?? "";
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }

  try {
    const invitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: `${req.headers.origin ?? ""}`,
    });
    res.status(201).json({
      id: invitation.id,
      emailAddress: invitation.emailAddress,
      createdAt: new Date(invitation.createdAt).toISOString(),
    });
  } catch (err) {
    const e = err as { errors?: { message: string }[]; message?: string };
    const msg = e.errors?.[0]?.message ?? e.message ?? "Failed to send invite";
    res.status(400).json({ error: msg });
  }
});

router.delete(
  "/invite/:inviteId",
  requireAuth,
  async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      await clerk.invitations.revokeInvitation(req.params.inviteId as string);
      res.json({ ok: true });
    } catch (err) {
      const e = err as Error;
      res.status(400).json({ error: e.message });
    }
  },
);

router.patch(
  "/:userId/role",
  requireAuth,
  async (req: Request, res: Response) => {
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

      if (!updated) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.json(updated);
    } catch (err) {
      const e = err as Error;
      res.status(500).json({ error: e.message });
    }
  },
);

router.delete("/:userId", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { dbUser } = req as AuthRequest;
  const userId = req.params.userId as string;

  if (dbUser.id === userId) {
    res.status(400).json({ error: "You cannot remove yourself" });
    return;
  }

  try {
    const [target] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await db.delete(usersTable).where(eq(usersTable.id, userId));

    try {
      await clerk.users.banUser(target.clerkId);
    } catch {
      // best-effort; DB removal is the authoritative action
    }

    res.json({ ok: true });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

export default router;
