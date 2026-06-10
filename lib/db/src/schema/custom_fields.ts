import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const CUSTOM_FIELD_OBJECT_TYPES = ["contact", "company", "deal", "activity"] as const;
export type CustomFieldObjectType = typeof CUSTOM_FIELD_OBJECT_TYPES[number];

export const CUSTOM_FIELD_TYPES = [
  "text",
  "number",
  "date",
  "boolean",
  "single_select",
  "multi_select",
] as const;
export type CustomFieldType = typeof CUSTOM_FIELD_TYPES[number];

export const customFieldDefinitionsTable = pgTable(
  "custom_field_definitions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    objectType: text("object_type")
      .$type<CustomFieldObjectType>()
      .notNull(),
    label: text("label").notNull(),
    fieldType: text("field_type")
      .$type<CustomFieldType>()
      .notNull()
      .default("text"),
    options: jsonb("options").$type<string[]>(),
    required: boolean("required").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("cfd_object_type_idx").on(t.objectType),
    index("cfd_object_order_idx").on(t.objectType, t.displayOrder),
  ],
);

export const customFieldValuesTable = pgTable(
  "custom_field_values",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    fieldId: text("field_id")
      .notNull()
      .references(() => customFieldDefinitionsTable.id, { onDelete: "cascade" }),
    objectType: text("object_type")
      .$type<CustomFieldObjectType>()
      .notNull(),
    recordId: text("record_id").notNull(),
    value: text("value"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("cfv_field_record_uniq").on(t.fieldId, t.recordId),
    index("cfv_record_idx").on(t.objectType, t.recordId),
    index("cfv_field_idx").on(t.fieldId),
  ],
);

export const customFieldValueSchema = z.object({
  fieldId: z.string(),
  value: z.string().nullable(),
});

export type CustomFieldDefinition = typeof customFieldDefinitionsTable.$inferSelect;
export type CustomFieldValue = typeof customFieldValuesTable.$inferSelect;
