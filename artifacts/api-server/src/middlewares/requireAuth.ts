import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { auth } from "../lib/auth";

export type AuthRequest = Request & {
  userId: string;
  dbUser: typeof usersTable.$inferSelect;
};

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
      .where(eq(usersTable.email, user.email))
      .limit(1);

    if (existing) {
      (req as AuthRequest).userId = user.id;
      (req as AuthRequest).dbUser = existing;
      return next();
    }

    const [newUser] = await db
      .insert(usersTable)
      .values({
        email: user.email,
        name: user.name ?? null,
        avatarUrl: user.image ?? null,
      })
      .returning();

    (req as AuthRequest).userId = user.id;
    (req as AuthRequest).dbUser = newUser;
    next();
  } catch (err) {
    next(err);
  }
}
