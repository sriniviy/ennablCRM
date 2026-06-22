import { db, dealStagesTable, dealsTable } from "./index";
import { eq, sql } from "drizzle-orm";

const PRD_STAGES: { name: string; order: number; color: string }[] = [
  { name: "Qualified",         order: 0, color: "#6366f1" },
  { name: "Discovery",         order: 1, color: "#3b82f6" },
  { name: "Validation",        order: 2, color: "#0ea5e9" },
  { name: "Proposal",          order: 3, color: "#06b6d4" },
  { name: "Proof of Concept",  order: 4, color: "#0d9488" },
  { name: "Out for Signature", order: 5, color: "#f59e0b" },
  { name: "Closed Won",        order: 6, color: "#22c55e" },
  { name: "Closed Lost",       order: 7, color: "#ef4444" },
  { name: "No Decisions",      order: 8, color: "#6b7280" },
];

const PRD_NAMES = new Set(PRD_STAGES.map((s) => s.name));

// Rename legacy stage names in place so existing deals keep their FK.
// Key = old name in DB, value = new canonical name.
const RENAME: Record<string, string> = {
  "Won":          "Closed Won",
  "Lost":         "Closed Lost",
  "No Decision":  "No Decisions",
};

// Any other removed / unmapped stage names → remap deals to nearest PRD stage.
const LEGACY_REMAP: Record<string, string> = {
  Negotiation: "Out for Signature",
  Lead:        "Discovery",
};

export async function migrateDealStages() {
  // 0. Rename legacy stages in place (preserves deal foreign keys).
  for (const [oldName, newName] of Object.entries(RENAME)) {
    const [oldStage] = await db
      .select()
      .from(dealStagesTable)
      .where(eq(dealStagesTable.name, oldName))
      .limit(1);
    if (!oldStage) continue;

    const [newStage] = await db
      .select()
      .from(dealStagesTable)
      .where(eq(dealStagesTable.name, newName))
      .limit(1);

    if (newStage) {
      // Target already exists (partial prior run): move deals over, drop the old row.
      await db
        .update(dealsTable)
        .set({ stageId: newStage.id })
        .where(eq(dealsTable.stageId, oldStage.id));
      await db.delete(dealStagesTable).where(eq(dealStagesTable.id, oldStage.id));
    } else {
      await db
        .update(dealStagesTable)
        .set({ name: newName })
        .where(eq(dealStagesTable.id, oldStage.id));
    }
  }

  // 1. Ensure all PRD stages exist with the correct order/color (idempotent).
  for (const s of PRD_STAGES) {
    const [existing] = await db
      .select()
      .from(dealStagesTable)
      .where(eq(dealStagesTable.name, s.name))
      .limit(1);
    if (existing) {
      if (existing.order !== s.order || existing.color !== s.color) {
        await db
          .update(dealStagesTable)
          .set({ order: s.order, color: s.color })
          .where(eq(dealStagesTable.id, existing.id));
      }
    } else {
      await db.insert(dealStagesTable).values(s);
    }
  }

  // Re-read so we have ids for every PRD stage.
  const allStages = await db.select().from(dealStagesTable);
  const byName = new Map(allStages.map((s) => [s.name, s]));

  // 2. Remap deals sitting on legacy stages to the nearest PRD stage.
  const legacyStages = allStages.filter((s) => !PRD_NAMES.has(s.name));
  for (const legacy of legacyStages) {
    const targetName = LEGACY_REMAP[legacy.name] ?? "Discovery";
    const target = byName.get(targetName);
    if (!target) continue;
    await db
      .update(dealsTable)
      .set({ stageId: target.id })
      .where(eq(dealsTable.stageId, legacy.id));
  }

  // 3. Delete legacy stages that no longer have deals referencing them.
  for (const legacy of legacyStages) {
    const remaining = await db
      .select({ id: dealsTable.id })
      .from(dealsTable)
      .where(eq(dealsTable.stageId, legacy.id))
      .limit(1);
    if (remaining.length === 0) {
      await db.delete(dealStagesTable).where(eq(dealStagesTable.id, legacy.id));
    }
  }

  // Ensure deal_splits table exists (idempotent DDL).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS deal_splits (
      id text PRIMARY KEY,
      deal_id text NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      percentage double precision NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(deal_id, user_id)
    )
  `);

  console.log("Deal stages migrated to PRD pipeline.");
}

if (process.argv[1]?.includes("migrate-deal-stages")) {
  migrateDealStages()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Deal stage migration error:", err);
      process.exit(1);
    });
}
