import { pgTable, text, timestamp, index, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { contactStatusEnum, reviewStatusEnum } from "./enums";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

export const contactsTable = pgTable(
  "contacts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").unique(),
    phone: text("phone"),
    title: text("title"),
    status: contactStatusEnum("status").notNull().default("LEAD"),
    reviewStatus: reviewStatusEnum("review_status")
      .notNull()
      .default("REVIEWED"),
    ennablUser: boolean("ennabl_user").notNull().default(false),
    emailMarketingContact: boolean("email_marketing_contact")
      .notNull()
      .default(false),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    enrichedFields: text("enriched_fields")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    notes: text("notes"),
    linkedIn: text("linked_in"),
    assigneeId: text("assignee_id").references(() => usersTable.id),
    companyId: text("company_id").references(() => companiesTable.id),
    lastActivityDate: timestamp("last_activity_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("contacts_email_idx").on(t.email),
    index("contacts_company_idx").on(t.companyId),
    index("contacts_status_idx").on(t.status),
  ],
);

export const insertContactSchema = createInsertSchema(contactsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;
