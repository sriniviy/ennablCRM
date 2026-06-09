import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { auditActionEnum } from "./enums";
import { usersTable } from "./users";

export const auditLogTable = pgTable(
  "audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    action: auditActionEnum("action").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id").notNull(),
    objectLabel: text("object_label"),
    actorId: text("actor_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    actorName: text("actor_name"),
    changes: jsonb("changes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_object_idx").on(t.objectType, t.objectId),
    index("audit_log_actor_idx").on(t.actorId),
    index("audit_log_action_idx").on(t.action),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogTable.$inferSelect;
