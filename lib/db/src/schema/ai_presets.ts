import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const aiPresetsTable = pgTable(
  "ai_presets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category"),
    goal: text("goal").notNull(),
    tone: text("tone").notNull().default("Professional"),
    improveFields: text("improve_fields").notNull().default("both"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ai_presets_user_idx").on(t.userId)],
);

export type AiPreset = typeof aiPresetsTable.$inferSelect;
