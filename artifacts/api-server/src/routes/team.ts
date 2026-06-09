import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { auth } from "../lib/auth";
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

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const members = await db
      .select()
      .from(usersTable)
      .orderBy(usersTable.createdAt);
    res.json({ members, pending: [] });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/add-user", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { email, name, password } = req.body as {
    email?: string;
    name?: string;
    password?: string;
  };

  if (!email || !EMAIL_RE.test(email.trim())) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  try {
    await auth.api.signUpEmail({
      body: {
        email: email.trim(),
        password,
        name: name?.trim() ?? email.trim(),
      },
    });
  } catch (err) {
    const e = err as { message?: string; status?: number };
    if (!e.message?.toLowerCase().includes("already")) {
      res.status(400).json({ error: e.message ?? "Failed to create user" });
      return;
    }
  }

  const [dbUser] = await db
    .insert(usersTable)
    .values({
      email: email.trim(),
      name: name?.trim() ?? null,
    })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: { name: name?.trim() ?? null, updatedAt: new Date() },
    })
    .returning();

  res.status(201).json(dbUser);
});

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
    res.json({ ok: true });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

export default router;
