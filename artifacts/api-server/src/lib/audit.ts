import { db, auditLogTable } from "@workspace/db";

type AuditAction = typeof auditLogTable.$inferInsert["action"];

const IGNORED_FIELDS = new Set(["updatedAt", "createdAt"]);

function valueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue;
    const from = before[key];
    const to = after[key];
    if (!valueEqual(from, to)) {
      diff[key] = { from: from ?? null, to: to ?? null };
    }
  }
  return diff;
}

export async function logAudit(params: {
  action: AuditAction;
  objectType: string;
  objectId: string;
  objectLabel?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}) {
  try {
    const { action, objectType, objectId, objectLabel, actorId, actorName, before, after } = params;

    let changes: Record<string, unknown> | null = null;
    if (action === "UPDATE") {
      const diff = computeDiff(before ?? {}, after ?? {});
      if (Object.keys(diff).length === 0) return;
      changes = { diff };
    } else if (action === "CREATE") {
      changes = { after: after ?? null };
    } else if (action === "DELETE") {
      changes = { before: before ?? null };
    } else if (action === "MERGE") {
      changes = { before: before ?? null, after: after ?? null };
    }

    await db.insert(auditLogTable).values({
      action,
      objectType,
      objectId,
      objectLabel: objectLabel ?? null,
      actorId: actorId ?? null,
      actorName: actorName ?? null,
      changes,
    });
  } catch {
    // Audit logging must never break the originating request.
  }
}
