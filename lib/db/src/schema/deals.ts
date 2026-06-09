import {
  pgTable,
  text,
  timestamp,
  doublePrecision,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { companiesTable } from "./companies";
import { contactsTable } from "./contacts";
import { dealStagesTable } from "./deal_stages";

export const dealsTable = pgTable(
  "deals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    value: doublePrecision("value"),
    currency: text("currency").notNull().default("USD"),
    probability: integer("probability").default(50),
    closeDate: timestamp("close_date", { withTimezone: true }),
    stageId: text("stage_id")
      .notNull()
      .references(() => dealStagesTable.id),
    contactId: text("contact_id").references(() => contactsTable.id),
    companyId: text("company_id").references(() => companiesTable.id),
    assigneeId: text("assignee_id").references(() => usersTable.id),
    notes: text("notes"),
    order: integer("order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("deals_stage_idx").on(t.stageId),
    index("deals_contact_idx").on(t.contactId),
    index("deals_company_idx").on(t.companyId),
  ],
);

export const insertDealSchema = createInsertSchema(dealsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDeal = z.infer<typeof insertDealSchema>;
export type Deal = typeof dealsTable.$inferSelect;
