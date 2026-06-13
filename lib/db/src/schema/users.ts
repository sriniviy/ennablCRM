import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userRoleEnum, userStatusEnum } from "./enums";

export const usersTable = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  authId: text("auth_id").unique(),
  clerkId: text("clerk_id").unique(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").notNull().default("MEMBER"),
  status: userStatusEnum("status").notNull().default("ACTIVE"),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  insuranceGroups: text("insurance_groups").array().notNull().default(sql`'{}'::text[]`),
  title: text("title"),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
