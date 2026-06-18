import { pgTable, text, bigint, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userGmailTokensTable = pgTable("user_gmail_tokens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiryDate: bigint("expiry_date", { mode: "number" }).notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  lastSync: timestamp("last_sync", { withTimezone: true }),
});

export const oauthStatesTable = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type UserGmailToken = typeof userGmailTokensTable.$inferSelect;
