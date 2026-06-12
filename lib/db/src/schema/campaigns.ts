import { pgTable, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignStatusEnum, sendStatusEnum } from "./enums";
import { contactsTable } from "./contacts";

export const emailCampaignsTable = pgTable("email_campaigns", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  fromName: text("from_name").notNull(),
  fromEmail: text("from_email").notNull(),
  htmlContent: text("html_content").notNull(),
  textContent: text("text_content"),
  status: campaignStatusEnum("status").notNull().default("DRAFT"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  recipientIds: text("recipient_ids")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  segmentId: text("segment_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const campaignContactsTable = pgTable(
  "campaign_contacts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => emailCampaignsTable.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contactsTable.id),
    email: text("email").notNull(),
    status: sendStatusEnum("status").notNull().default("PENDING"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("campaign_contacts_unique").on(t.campaignId, t.contactId),
    index("campaign_contacts_campaign_idx").on(t.campaignId),
    index("campaign_contacts_contact_idx").on(t.contactId),
  ],
);

export const insertEmailCampaignSchema = createInsertSchema(
  emailCampaignsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export const insertCampaignContactSchema = createInsertSchema(
  campaignContactsTable,
).omit({ id: true, createdAt: true });

export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;
export type EmailCampaign = typeof emailCampaignsTable.$inferSelect;
export type InsertCampaignContact = z.infer<typeof insertCampaignContactSchema>;
export type CampaignContact = typeof campaignContactsTable.$inferSelect;
