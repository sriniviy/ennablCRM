import { db, activitiesTable } from "@workspace/db";

type ActivityType = typeof activitiesTable.$inferInsert["type"];

export async function logActivity(params: {
  type: ActivityType;
  title: string;
  description?: string;
  userId?: string;
  contactId?: string;
  companyId?: string;
  dealId?: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(activitiesTable).values(params);
  } catch {
  }
}
