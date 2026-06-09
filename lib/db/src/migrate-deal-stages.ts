import { db, dealStagesTable, dealsTable } from "./index";
import { eq } from "drizzle-orm";

const PRD_STAGES: { name: string; order: number; color: string }[] = [
  { name: "Qualified", order: 0, color: "#60a5fa" },
  { name: "Discovery", order: 1, color: "#38bdf8" },
  { name: "Validation", order: 2, color: "#22d3ee" },
  { name: "Proposal", order: 3, color: "#a78bfa" },
  { name: "Proof of Concept", order: 4, color: "#c084fc" },
  { name: "Negotiation", order: 5, color: "#f59e0b" },
  { name: "Out for Signature", order: 6, color: "#fb923c" },
  { name: "Closed Won", order: 7, color: "#22c55e" },
  { name: "Closed Lost", order: 8, color: "#ef4444" },
];

const PRD_NAMES = new Set(PRD_STAGES.map((s) => s.name));

// Map legacy / unknown stage names to the nearest PRD stage.
const LEGACY_REMAP: Record<string, string> = {
  Lead: "Qualified",
  Won: "Closed Won",
  Lost: "Closed Lost",
};

export async function migrateDealStages() {
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
    const targetName = LEGACY_REMAP[legacy.name] ?? "Qualified";
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

  console.log("Deal stages migrated to PRD pipeline.");
}

const isMain =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  migrateDealStages()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Deal stage migration error:", err);
      process.exit(1);
    });
}
