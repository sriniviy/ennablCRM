import {
  pgTable,
  text,
  timestamp,
  index,
  integer,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companyStatusEnum } from "./enums";
import { usersTable } from "./users";

export const companiesTable = pgTable(
  "companies",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    domain: text("domain").unique(),
    domains: text("domains")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    status: companyStatusEnum("status"),
    productLicensed: text("product_licensed")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    memberOf: text("member_of")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    assignedCsmId: text("assigned_csm_id").references(() => usersTable.id),
    estimatedAnnualRevenue: doublePrecision("estimated_annual_revenue"),
    numberOfEmployees: integer("number_of_employees"),
    industry: text("industry"),
    size: text("size"),
    website: text("website"),
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("companies_domain_idx").on(t.domain),
    index("companies_status_idx").on(t.status),
  ],
);

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
