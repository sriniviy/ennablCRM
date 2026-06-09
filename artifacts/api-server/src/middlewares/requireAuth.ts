import { getAuth, createClerkClient } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

export type AuthRequest = Request & {
  userId: string;
  dbUser: typeof usersTable.$inferSelect;
};

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, userId))
      .limit(1);

    if (existing) {
      (req as AuthRequest).userId = userId;
      (req as AuthRequest).dbUser = existing;
      return next();
    }

    const clerkUser = await clerk.users.getUser(userId);
    const primaryEmail =
      clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ?? `${userId}@unknown.local`;

    const [newUser] = await db
      .insert(usersTable)
      .values({
        clerkId: userId,
        email: primaryEmail,
        name:
          `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() ||
          null,
        avatarUrl: clerkUser.imageUrl || null,
      })
      .returning();

    (req as AuthRequest).userId = userId;
    (req as AuthRequest).dbUser = newUser;
    next();
  } catch (err) {
    next(err);
  }
}
