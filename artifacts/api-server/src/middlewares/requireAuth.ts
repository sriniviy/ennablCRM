import { db, usersTable } from "@workspace/db";
import { eq, or, sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { auth } from "../lib/auth";

export type AuthRequest = Request & {
  userId: string;
  dbUser: typeof usersTable.$inferSelect;
};

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { dbUser } = req as AuthRequest;
  if (dbUser.role !== "ADMIN") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  next();
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as unknown as Headers,
    });

    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { user } = session;

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(
        or(
          eq(usersTable.authId, user.id),
          eq(usersTable.email, user.email),
        ),
      )
      .limit(1);

    if (existing) {
      if (!existing.authId) {
        await db
          .update(usersTable)
          .set({ authId: user.id, updatedAt: new Date() })
          .where(eq(usersTable.id, existing.id));
        existing.authId = user.id;
      }
      (req as AuthRequest).userId = existing.id;
      (req as AuthRequest).dbUser = existing;
      return next();
    }

    // Bootstrap: auto-provision the very first user as a regular member so they
    // can sign in and promote themselves to Admin via the bootstrap-admin endpoint.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable);

    if (count === 0) {
      const [provisioned] = await db
        .insert(usersTable)
        .values({
          authId: user.id,
          email: user.email,
          name: user.name ?? null,
        })
        .returning();
      (req as AuthRequest).userId = provisioned.id;
      (req as AuthRequest).dbUser = provisioned;
      return next();
    }

    res.status(403).json({ error: "Account not provisioned. Contact your administrator." });
  } catch (err) {
    next(err);
  }
}
