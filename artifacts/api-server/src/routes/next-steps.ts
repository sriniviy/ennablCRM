import { Router, type Request, type Response } from "express";
import {
  db,
  activitiesTable,
  companiesTable,
  contactsTable,
  dealStagesTable,
  dealsTable,
  tasksTable,
  workspaceSettingsTable,
} from "@workspace/db";
import { eq, and, gte, not, desc, isNull, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { openai } from "../lib/openai-client";

const router = Router();

const RESULTS_KEY = "next_steps_results";
const SETTINGS_KEY = "next_steps_settings";

const CLOSED_STAGES = ["Closed Won", "Closed Lost", "No Decisions"];

type NextStepsDeal = {
  dealId: string;
  dealTitle: string;
  companyName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  value: number | null;
  stageName: string;
  lastContactedAt: string | null;
  lastContactType: string | null;
  daysSinceContact: number | null;
  steps: string[];
};

type NextStepsResults = {
  generatedAt: string;
  frequency: string;
  deals: NextStepsDeal[];
};

type NextStepsSettings = {
  frequency: "weekly" | "biweekly" | "monthly";
};

const DEFAULT_SETTINGS: NextStepsSettings = { frequency: "weekly" };

// ── GET / — return stored results + settings ─────────────────────────────────
router.get("/", requireAuth, async (_req: Request, res: Response) => {
  try {
    const [resultsRow, settingsRow] = await Promise.all([
      db.select().from(workspaceSettingsTable).where(eq(workspaceSettingsTable.key, RESULTS_KEY)).then(r => r[0]),
      db.select().from(workspaceSettingsTable).where(eq(workspaceSettingsTable.key, SETTINGS_KEY)).then(r => r[0]),
    ]);
    res.json({
      results: resultsRow ? (resultsRow.value as unknown as NextStepsResults) : null,
      settings: settingsRow ? (settingsRow.value as unknown as NextStepsSettings) : DEFAULT_SETTINGS,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── PUT /settings ────────────────────────────────────────────────────────────
router.put("/settings", requireAuth, async (req: Request, res: Response) => {
  const { frequency } = req.body as Partial<NextStepsSettings>;
  if (!["weekly", "biweekly", "monthly"].includes(frequency ?? "")) {
    res.status(400).json({ error: "frequency must be weekly, biweekly, or monthly" });
    return;
  }
  try {
    const value = { frequency } as Record<string, unknown>;
    await db
      .insert(workspaceSettingsTable)
      .values({ key: SETTINGS_KEY, value })
      .onConflictDoUpdate({ target: workspaceSettingsTable.key, set: { value, updatedAt: new Date() } });
    res.json({ frequency });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /generate ────────────────────────────────────────────────────────────
router.post("/generate", requireAuth, async (_req: Request, res: Response) => {
  if (!openai) {
    res.status(503).json({ error: "AI not configured" });
    return;
  }

  try {
    // ── 1. Load settings + analysis config ────────────────────────────────
    const [settingsRow, configRow, intelRow] = await Promise.all([
      db.select().from(workspaceSettingsTable).where(eq(workspaceSettingsTable.key, SETTINGS_KEY)).then(r => r[0]),
      db.select().from(workspaceSettingsTable).where(eq(workspaceSettingsTable.key, "next_steps_config")).then(r => r[0]),
      db.select().from(workspaceSettingsTable).where(eq(workspaceSettingsTable.key, "industry_intel_results")).then(r => r[0]),
    ]);

    const cfg = {
      analysisDepth: "standard" as "compact" | "standard" | "deep",
      activityLookbackDays: 90 as number,
      stagesIncluded: [] as string[],
      focusTopics: ["renewal risk", "pricing objections", "competitor mentions"] as string[],
      insightTypes: ["re_engagement", "objection_signals", "renewal_timeline", "upsell_opportunity"] as string[],
      frequency: "weekly" as "weekly" | "biweekly" | "monthly",
      ...(configRow?.value as Record<string, unknown> ?? {}),
    };

    // Frequency: config takes precedence over the old settings key
    const frequency = cfg.frequency;
    const settings: NextStepsSettings = settingsRow
      ? { ...DEFAULT_SETTINGS, ...(settingsRow.value as unknown as NextStepsSettings) }
      : DEFAULT_SETTINGS;
    const resolvedFrequency = frequency ?? settings.frequency;

    // Depth → activity limit + token budget
    const depthActivityLimit: Record<string, number> = { compact: 5, standard: 15, deep: 30 };
    const depthTokens: Record<string, number> = { compact: 200, standard: 320, deep: 500 };
    const activityLimit = depthActivityLimit[cfg.analysisDepth] ?? 15;
    const maxTokens = depthTokens[cfg.analysisDepth] ?? 320;
    const activityCount = cfg.analysisDepth === "compact" ? 4 : cfg.analysisDepth === "deep" ? 12 : 8;

    // ── 2. Market intel (optional context) ────────────────────────────────
    const intelItems = intelRow
      ? ((intelRow.value as unknown as { items: { headline: string }[] }).items ?? []).slice(0, cfg.analysisDepth === "deep" ? 5 : 3)
      : [];
    const marketContext = intelItems.length > 0
      ? intelItems.map((i) => `• ${i.headline}`).join("\n")
      : "• Hard market persists in commercial lines — rates up 6–9% in P&C\n• AI underwriting compressing quote timelines";

    // ── 3. Fetch all open deals with relations ─────────────────────────────
    const deals = await db
      .select({
        id: dealsTable.id,
        title: dealsTable.title,
        value: dealsTable.value,
        closeDate: dealsTable.closeDate,
        notes: dealsTable.notes,
        stageName: dealStagesTable.name,
        companyId: dealsTable.companyId,
        contactId: dealsTable.contactId,
        companyName: companiesTable.name,
        companyIndustry: companiesTable.industry,
        contactFirstName: contactsTable.firstName,
        contactLastName: contactsTable.lastName,
        contactEmail: contactsTable.email,
      })
      .from(dealsTable)
      .innerJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
      .leftJoin(companiesTable, eq(dealsTable.companyId, companiesTable.id))
      .leftJoin(contactsTable, eq(dealsTable.contactId, contactsTable.id))
      .where(not(eq(dealStagesTable.name, CLOSED_STAGES[0])))
      .orderBy(desc(dealsTable.value));

    let openDeals = deals.filter(d => !CLOSED_STAGES.includes(d.stageName));
    // Filter by configured stages (empty = all)
    if (cfg.stagesIncluded.length > 0) {
      openDeals = openDeals.filter(d => cfg.stagesIncluded.includes(d.stageName));
    }

    if (openDeals.length === 0) {
      const emptyResult: NextStepsResults = {
        generatedAt: new Date().toISOString(),
        frequency: resolvedFrequency,
        deals: [],
      };
      await upsertResults(emptyResult);
      res.json({ results: emptyResult, settings });
      return;
    }

    const cutoff = new Date(Date.now() - cfg.activityLookbackDays * 86_400_000);

    // Build insight type label map for the prompt
    const INSIGHT_LABELS: Record<string, string> = {
      re_engagement: "re-engagement cues (long silence from contact, inactivity)",
      objection_signals: "objection signals (budget, authority, timeline concerns)",
      renewal_timeline: "renewal timeline alignment (upcoming policy renewal dates)",
      upsell_opportunity: "upsell / cross-sell opportunities",
      competitive_threats: "competitive threats (mentions of other providers)",
      budget_constraints: "budget constraints or approval barriers",
      decision_maker: "decision-maker access (who to engage next)",
    };
    const insightInstructions = cfg.insightTypes.length > 0
      ? `\nPay special attention to: ${cfg.insightTypes.map(id => INSIGHT_LABELS[id] ?? id).join(", ")}.`
      : "";
    const topicInstructions = cfg.focusTopics.length > 0
      ? `\nCustom focus topics the broker cares about: ${cfg.focusTopics.join(", ")}.`
      : "";

    // ── 4. Generate next steps per deal (parallel) ─────────────────────────
    const dealResults: NextStepsDeal[] = await Promise.all(
      openDeals.slice(0, 10).map(async (deal) => {
        // Fetch activities within configured lookback window
        const activities = await db
          .select({
            type: activitiesTable.type,
            title: activitiesTable.title,
            createdAt: activitiesTable.createdAt,
            aiSummary: activitiesTable.aiSummary,
          })
          .from(activitiesTable)
          .where(
            and(
              gte(activitiesTable.createdAt, cutoff),
              or(
                deal.id ? eq(activitiesTable.dealId, deal.id) : isNull(activitiesTable.dealId),
                deal.contactId ? eq(activitiesTable.contactId, deal.contactId) : isNull(activitiesTable.contactId),
              ),
            ),
          )
          .orderBy(desc(activitiesTable.createdAt))
          .limit(activityLimit);

        // Open tasks for this deal
        const tasks = await db
          .select({ title: tasksTable.title, dueDate: tasksTable.dueDate, type: tasksTable.type })
          .from(tasksTable)
          .where(and(eq(tasksTable.dealId, deal.id), eq(tasksTable.completed, false)))
          .limit(5);

        // Last contact date
        const lastActivity = activities[0] ?? null;
        const lastContactedAt = lastActivity?.createdAt?.toISOString() ?? null;
        const daysSinceContact = lastContactedAt
          ? Math.floor((Date.now() - new Date(lastContactedAt).getTime()) / 86_400_000)
          : null;

        const contactName = deal.contactFirstName
          ? `${deal.contactFirstName} ${deal.contactLastName ?? ""}`.trim()
          : null;
        const fmt$ = (n: number | null) => n != null ? `$${Math.round(n).toLocaleString()}` : "Unknown";
        const fmtDate = (d: Date | null) => d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown";

        const activityLines = activities.slice(0, activityCount).map(a => {
          const daysAgo = Math.floor((Date.now() - new Date(a.createdAt).getTime()) / 86_400_000);
          return `- ${a.type} (${daysAgo}d ago): ${a.title}${a.aiSummary ? ` [AI: ${a.aiSummary.slice(0, 80)}…]` : ""}`;
        });

        const taskLines = tasks.map(t => {
          const due = t.dueDate ? ` due ${fmtDate(t.dueDate)}` : "";
          return `- ${t.type}: ${t.title}${due}`;
        });

        const prompt = [
          `Deal: ${deal.title}`,
          `Stage: ${deal.stageName}`,
          `Value: ${fmt$(deal.value)} | Close date: ${fmtDate(deal.closeDate)}`,
          `Company: ${deal.companyName ?? "Unknown"}${deal.companyIndustry ? ` (${deal.companyIndustry})` : ""}`,
          `Contact: ${contactName ?? "None"} | Email: ${deal.contactEmail ?? "none"}`,
          `Last contacted: ${daysSinceContact != null ? `${daysSinceContact} days ago (${lastActivity?.type ?? "unknown"})` : "Never"}`,
          `Activity lookback: last ${cfg.activityLookbackDays} days`,
          "",
          activityLines.length > 0 ? `Recent activity:\n${activityLines.join("\n")}` : "Recent activity: None in lookback window",
          "",
          taskLines.length > 0 ? `Open tasks:\n${taskLines.join("\n")}` : "Open tasks: None",
          deal.notes ? `\nDeal notes: ${deal.notes.slice(0, 200)}` : "",
          `\nMarket context (P&C/benefits):\n${marketContext}`,
        ].filter(Boolean).join("\n");

        const stepCount = cfg.analysisDepth === "compact" ? "2–3" : cfg.analysisDepth === "deep" ? "3–4" : "2–4";

        const completion = await openai!.chat.completions.create({
          model: "gpt-4o-mini",
          max_completion_tokens: maxTokens,
          messages: [
            {
              role: "system",
              content:
                "You are a P&C and group-benefits insurance brokerage sales coach. " +
                "Given this deal context, produce 2-4 specific, concrete next steps for the broker. " +
                "Each step must be actionable (who to contact, what to send/negotiate/ask). " +
                "Factor in the last contact date — if it has been a long time, prioritize re-engagement. " +
                "Consider the market context when relevant. " +
                "Return ONLY a JSON array of strings. No markdown. No extra text.",
            },
            { role: "user", content: prompt },
          ],
        });

        const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";
        let steps: string[] = [];
        try {
          const match = raw.match(/\[[\s\S]*\]/);
          if (match) steps = JSON.parse(match[0]) as string[];
        } catch {
          steps = [raw];
        }

        return {
          dealId: deal.id,
          dealTitle: deal.title,
          companyName: deal.companyName ?? null,
          contactName: contactName ?? null,
          contactEmail: deal.contactEmail ?? null,
          value: deal.value ?? null,
          stageName: deal.stageName,
          lastContactedAt,
          lastContactType: lastActivity?.type ?? null,
          daysSinceContact,
          steps: steps.slice(0, 4),
        } satisfies NextStepsDeal;
      }),
    );

    // ── 5. Persist and return ─────────────────────────────────────────────
    const result: NextStepsResults = {
      generatedAt: new Date().toISOString(),
      frequency: settings.frequency,
      deals: dealResults,
    };
    await upsertResults(result);
    res.json({ results: result, settings });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

async function upsertResults(result: NextStepsResults) {
  const value = result as unknown as Record<string, unknown>;
  await db
    .insert(workspaceSettingsTable)
    .values({ key: RESULTS_KEY, value })
    .onConflictDoUpdate({
      target: workspaceSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export default router;
