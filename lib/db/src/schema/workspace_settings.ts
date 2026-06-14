import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const workspaceSettingsTable = pgTable("workspace_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WorkspaceSetting = typeof workspaceSettingsTable.$inferSelect;
