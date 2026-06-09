import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { activityTypeEnum } from "./enums";
import { usersTable } from "./users";
import { contactsTable } from "./contacts";
import { companiesTable } from "./companies";
import { dealsTable } from "./deals";
import { tasksTable } from "./tasks";

export const activitiesTable = pgTable(
  "activities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    type: activityTypeEnum("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    endDate: timestamp("end_date", { withTimezone: true }),
    emailSubject: text("email_subject"),
    emailBody: text("email_body"),
    aiSummary: text("ai_summary"),
    metadata: jsonb("metadata"),
    userId: text("user_id").references(() => usersTable.id),
    contactId: text("contact_id").references(() => contactsTable.id),
    companyId: text("company_id").references(() => companiesTable.id),
    dealId: text("deal_id").references(() => dealsTable.id),
    taskId: text("task_id").references(() => tasksTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("activities_contact_idx").on(t.contactId),
    index("activities_deal_idx").on(t.dealId),
    index("activities_created_at_idx").on(t.createdAt),
  ],
);

export const insertActivitySchema = createInsertSchema(activitiesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activitiesTable.$inferSelect;
