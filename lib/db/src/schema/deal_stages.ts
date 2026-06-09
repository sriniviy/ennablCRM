import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dealStagesTable = pgTable("deal_stages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  order: integer("order").notNull().default(0),
  color: text("color").notNull().default("#14b8a6"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertDealStageSchema = createInsertSchema(dealStagesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertDealStage = z.infer<typeof insertDealStageSchema>;
export type DealStage = typeof dealStagesTable.$inferSelect;
