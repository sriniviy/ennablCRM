import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const backgroundJobsTable = pgTable("background_jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull(),
  label: text("label"),
  status: text("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  result: jsonb("result"),
  error: text("error"),
  createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type BackgroundJob = typeof backgroundJobsTable.$inferSelect;
