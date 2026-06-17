import { pgTable, text, timestamp, doublePrecision, uniqueIndex } from "drizzle-orm/pg-core";
import { dealsTable } from "./deals";
import { usersTable } from "./users";

export const dealSplitsTable = pgTable(
  "deal_splits",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    dealId: text("deal_id")
      .notNull()
      .references(() => dealsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    percentage: doublePrecision("percentage").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("deal_splits_deal_user_idx").on(t.dealId, t.userId)],
);

export type DealSplit = typeof dealSplitsTable.$inferSelect;
