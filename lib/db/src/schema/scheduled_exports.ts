import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const scheduledExportsTable = pgTable("scheduled_exports", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  createdById: text("created_by_id").notNull(),
  frequency: text("frequency").notNull().$type<"daily" | "weekly">(),
  dataType: text("data_type").notNull().$type<"tasks" | "activities" | "notes" | "combined">(),
  deliveryEmail: text("delivery_email").notNull(),
  paused: boolean("paused").notNull().default(false),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  nextSendAt: timestamp("next_send_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ScheduledExport = typeof scheduledExportsTable.$inferSelect;
export type InsertScheduledExport = typeof scheduledExportsTable.$inferInsert;
