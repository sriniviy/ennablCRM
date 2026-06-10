import { Router, type Request, type Response } from "express";
import { db, customFieldDefinitionsTable, customFieldValuesTable } from "@workspace/db";
import { eq, and, inArray, asc, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import type { CustomFieldObjectType, CustomFieldType } from "@workspace/db";

const router = Router();

const VALID_OBJECT_TYPES: CustomFieldObjectType[] = ["contact", "company", "deal", "activity"];
const VALID_FIELD_TYPES: CustomFieldType[] = [
  "text", "number", "date", "boolean", "single_select", "multi_select",
];

function isValidObjectType(v: unknown): v is CustomFieldObjectType {
  return typeof v === "string" && VALID_OBJECT_TYPES.includes(v as CustomFieldObjectType);
}
function isValidFieldType(v: unknown): v is CustomFieldType {
  return typeof v === "string" && VALID_FIELD_TYPES.includes(v as CustomFieldType);
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { objectType } = req.query as Record<string, string>;
    const where = objectType
      ? eq(customFieldDefinitionsTable.objectType, objectType as CustomFieldObjectType)
      : undefined;
    const defs = await db
      .select()
      .from(customFieldDefinitionsTable)
      .where(where)
      .orderBy(
        asc(customFieldDefinitionsTable.objectType),
        asc(customFieldDefinitionsTable.displayOrder),
        asc(customFieldDefinitionsTable.createdAt),
      );
    res.json(defs);
  } catch {
    res.status(500).json({ error: "Failed to list custom field definitions" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    if (dbUser.role !== "ADMIN") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const { objectType, label, fieldType = "text", options, required = false } = req.body;
    if (!objectType || !label) {
      res.status(400).json({ error: "objectType and label are required" });
      return;
    }
    if (!isValidObjectType(objectType)) {
      res.status(400).json({ error: `objectType must be one of: ${VALID_OBJECT_TYPES.join(", ")}` });
      return;
    }
    if (!isValidFieldType(fieldType)) {
      res.status(400).json({ error: `fieldType must be one of: ${VALID_FIELD_TYPES.join(", ")}` });
      return;
    }

    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(display_order), -1)::int` })
      .from(customFieldDefinitionsTable)
      .where(eq(customFieldDefinitionsTable.objectType, objectType));

    const [def] = await db
      .insert(customFieldDefinitionsTable)
      .values({
        objectType,
        label: label.trim(),
        fieldType,
        options: (fieldType === "single_select" || fieldType === "multi_select") && Array.isArray(options)
          ? options.map(String)
          : null,
        required: Boolean(required),
        displayOrder: (maxOrder ?? -1) + 1,
      })
      .returning();

    res.status(201).json(def);
  } catch {
    res.status(500).json({ error: "Failed to create custom field definition" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    if (dbUser.role !== "ADMIN") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const id = req.params.id as string;
    const { label, options, required, displayOrder } = req.body;

    const updates: Record<string, unknown> = {};
    if (label !== undefined) updates.label = String(label).trim();
    if (options !== undefined) updates.options = Array.isArray(options) ? options.map(String) : null;
    if (required !== undefined) updates.required = Boolean(required);
    if (displayOrder !== undefined) updates.displayOrder = Number(displayOrder);

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const [updated] = await db
      .update(customFieldDefinitionsTable)
      .set(updates)
      .where(eq(customFieldDefinitionsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Custom field definition not found" });
      return;
    }
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update custom field definition" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    if (dbUser.role !== "ADMIN") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const id = req.params.id as string;
    const [deleted] = await db
      .delete(customFieldDefinitionsTable)
      .where(eq(customFieldDefinitionsTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Custom field definition not found" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete custom field definition" });
  }
});

router.get("/values/:objectType/:recordId", requireAuth, async (req: Request, res: Response) => {
  try {
    const objectType = req.params.objectType as string;
    const recordId = req.params.recordId as string;
    if (!isValidObjectType(objectType)) {
      res.status(400).json({ error: "Invalid objectType" });
      return;
    }
    const [defs, values] = await Promise.all([
      db
        .select()
        .from(customFieldDefinitionsTable)
        .where(eq(customFieldDefinitionsTable.objectType, objectType as CustomFieldObjectType))
        .orderBy(asc(customFieldDefinitionsTable.displayOrder), asc(customFieldDefinitionsTable.createdAt)),
      db
        .select()
        .from(customFieldValuesTable)
        .where(
          and(
            eq(customFieldValuesTable.objectType, objectType as CustomFieldObjectType),
            eq(customFieldValuesTable.recordId, recordId),
          ),
        ),
    ]);

    const valuesByFieldId = new Map(values.map((v) => [v.fieldId, v.value]));

    const result = defs.map((def) => ({
      ...def,
      value: valuesByFieldId.get(def.id) ?? null,
    }));

    res.json(result);
  } catch {
    res.status(500).json({ error: "Failed to get custom field values" });
  }
});

router.put("/values/:objectType/:recordId", requireAuth, async (req: Request, res: Response) => {
  try {
    const objectType = req.params.objectType as string;
    const recordId = req.params.recordId as string;
    if (!isValidObjectType(objectType)) {
      res.status(400).json({ error: "Invalid objectType" });
      return;
    }
    const { values } = req.body as { values: Array<{ fieldId: string; value: string | null }> };
    if (!Array.isArray(values)) {
      res.status(400).json({ error: "values must be an array" });
      return;
    }

    if (values.length === 0) {
      res.json({ ok: true });
      return;
    }

    const fieldIds = values.map((v) => v.fieldId);
    const defs = await db
      .select({ id: customFieldDefinitionsTable.id })
      .from(customFieldDefinitionsTable)
      .where(
        and(
          inArray(customFieldDefinitionsTable.id, fieldIds),
          eq(customFieldDefinitionsTable.objectType, objectType as CustomFieldObjectType),
        ),
      );
    const validIds = new Set(defs.map((d) => d.id));

    const toUpsert = values
      .filter((v) => validIds.has(v.fieldId))
      .map((v) => ({
        fieldId: v.fieldId,
        objectType: objectType as CustomFieldObjectType,
        recordId,
        value: v.value !== undefined ? v.value : null,
        updatedAt: new Date(),
      }));

    if (toUpsert.length > 0) {
      await db
        .insert(customFieldValuesTable)
        .values(toUpsert)
        .onConflictDoUpdate({
          target: [customFieldValuesTable.fieldId, customFieldValuesTable.recordId],
          set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at` },
        });
    }

    res.json({ ok: true, upserted: toUpsert.length });
  } catch {
    res.status(500).json({ error: "Failed to save custom field values" });
  }
});

export default router;
