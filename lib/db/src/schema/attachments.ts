import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const ATTACHMENT_OBJECT_TYPES = [
  "contact",
  "company",
  "deal",
] as const;
export type AttachmentObjectType =
  (typeof ATTACHMENT_OBJECT_TYPES)[number];

export const attachmentsTable = pgTable(
  "attachments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Groups all versions of the same logical document. The first upload of a
    // document gets a fresh documentId; re-uploads reuse it and bump `version`.
    documentId: text("document_id").notNull(),
    version: integer("version").notNull().default(1),
    objectType: text("object_type")
      .$type<AttachmentObjectType>()
      .notNull(),
    recordId: text("record_id").notNull(),
    objectPath: text("object_path").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    fileSize: integer("file_size").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("att_record_idx").on(t.objectType, t.recordId),
    index("att_uploaded_by_idx").on(t.uploadedBy),
    index("att_document_idx").on(t.documentId),
    uniqueIndex("att_document_version_unique").on(t.documentId, t.version),
  ],
);

export type Attachment = typeof attachmentsTable.$inferSelect;
export type NewAttachment = typeof attachmentsTable.$inferInsert;
