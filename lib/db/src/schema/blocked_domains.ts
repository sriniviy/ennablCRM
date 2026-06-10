import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const blockedDomainsTable = pgTable("blocked_domains", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  domain: text("domain").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type BlockedDomain = typeof blockedDomainsTable.$inferSelect;
export type InsertBlockedDomain = typeof blockedDomainsTable.$inferInsert;
