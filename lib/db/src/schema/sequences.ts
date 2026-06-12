import { pgTable, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { enrollmentStatusEnum } from "./enums";
import { usersTable } from "./users";
import { contactsTable } from "./contacts";

export const sequencesTable = pgTable("sequences", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  ownerId: text("owner_id").references(() => usersTable.id),
  exitOnDealWon: boolean("exit_on_deal_won").notNull().default(false),
  exitOnDealLost: boolean("exit_on_deal_lost").notNull().default(false),
  exitOnUnsubscribe: boolean("exit_on_unsubscribe").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sequenceStepsTable = pgTable(
  "sequence_steps",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sequenceId: text("sequence_id")
      .notNull()
      .references(() => sequencesTable.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    delayDays: integer("delay_days").notNull().default(1),
    stepOrder: integer("step_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sequence_steps_seq_idx").on(t.sequenceId)],
);

export const sequenceEnrollmentsTable = pgTable(
  "sequence_enrollments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sequenceId: text("sequence_id")
      .notNull()
      .references(() => sequencesTable.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contactsTable.id, { onDelete: "cascade" }),
    currentStep: integer("current_step").notNull().default(0),
    nextSendAt: timestamp("next_send_at", { withTimezone: true }),
    status: enrollmentStatusEnum("status").notNull().default("ACTIVE"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    exitReason: text("exit_reason"),
    enrolledVia: text("enrolled_via").notNull().default("MANUAL"),
  },
  (t) => [
    index("sequence_enrollments_seq_idx").on(t.sequenceId),
    index("sequence_enrollments_contact_idx").on(t.contactId),
    index("sequence_enrollments_next_send_idx").on(t.nextSendAt),
  ],
);

export const sequenceTriggersTable = pgTable(
  "sequence_triggers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sequenceId: text("sequence_id")
      .notNull()
      .references(() => sequencesTable.id, { onDelete: "cascade" }),
    triggerType: text("trigger_type").notNull().default("DEAL_STAGE_CHANGE"),
    triggerValue: text("trigger_value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sequence_triggers_seq_idx").on(t.sequenceId)],
);

export const insertSequenceSchema = createInsertSchema(sequencesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSequenceStepSchema = createInsertSchema(
  sequenceStepsTable,
).omit({ id: true, createdAt: true });

export const insertSequenceEnrollmentSchema = createInsertSchema(
  sequenceEnrollmentsTable,
).omit({ id: true, enrolledAt: true, completedAt: true });

export type Sequence = typeof sequencesTable.$inferSelect;
export type SequenceStep = typeof sequenceStepsTable.$inferSelect;
export type SequenceEnrollment = typeof sequenceEnrollmentsTable.$inferSelect;
export type InsertSequence = z.infer<typeof insertSequenceSchema>;
export type InsertSequenceStep = z.infer<typeof insertSequenceStepSchema>;
export type InsertSequenceEnrollment = z.infer<
  typeof insertSequenceEnrollmentSchema
>;
