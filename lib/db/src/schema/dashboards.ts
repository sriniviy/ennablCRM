import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const dashboardsTable = pgTable(
  "dashboards",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    description: text("description"),
    order: integer("order").notNull().default(0),
    builtin: boolean("builtin").notNull().default(false),
    createdBy: text("created_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("dashboards_order_idx").on(t.order)],
);

export const dashboardCardsTable = pgTable(
  "dashboard_cards",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    dashboardId: text("dashboard_id")
      .notNull()
      .references(() => dashboardsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    vizType: text("viz_type").notNull(),
    dataset: text("dataset").notNull(),
    config: jsonb("config").notNull().default({}),
    order: integer("order").notNull().default(0),
    size: text("size").notNull().default("md"),
    cardHeight: integer("card_height").notNull().default(260),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("dashboard_cards_dashboard_idx").on(t.dashboardId, t.order)],
);

export const insertDashboardSchema = createInsertSchema(dashboardsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDashboardCardSchema = createInsertSchema(
  dashboardCardsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDashboard = z.infer<typeof insertDashboardSchema>;
export type Dashboard = typeof dashboardsTable.$inferSelect;
export type InsertDashboardCard = z.infer<typeof insertDashboardCardSchema>;
export type DashboardCard = typeof dashboardCardsTable.$inferSelect;
