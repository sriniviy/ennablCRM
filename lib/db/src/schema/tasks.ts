import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { priorityEnum, taskTypeEnum } from "./enums";
import { usersTable } from "./users";
import { contactsTable } from "./contacts";
import { dealsTable } from "./deals";
import { companiesTable } from "./companies";

export const tasksTable = pgTable(
  "tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completionNote: text("completion_note"),
    priority: priorityEnum("priority").notNull().default("MEDIUM"),
    type: taskTypeEnum("type").notNull().default("TODO"),
    contactId: text("contact_id").references(() => contactsTable.id),
    dealId: text("deal_id").references(() => dealsTable.id),
    companyId: text("company_id").references(() => companiesTable.id),
    reminderAt: timestamp("reminder_at", { withTimezone: true }),
    assigneeId: text("assignee_id").references(() => usersTable.id),
    creatorId: text("creator_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tasks_assignee_idx").on(t.assigneeId),
    index("tasks_due_date_idx").on(t.dueDate),
    index("tasks_completed_idx").on(t.completed),
  ],
);

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
