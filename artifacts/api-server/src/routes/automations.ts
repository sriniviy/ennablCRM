import { Router, type Request, type Response } from "express";
import { db, backgroundJobsTable, usersTable, workspaceSettingsTable } from "@workspace/db";
import { eq, desc, gte, and, sql, ne } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

function requireAdmin(req: Request, res: Response): boolean {
  const { dbUser } = req as AuthRequest;
  if (dbUser.role !== "ADMIN") {
    res.status(403).json({ error: "Admin only" });
    return false;
  }
  return true;
}

// ── Industry Intelligence constants ──────────────────────────────────────────
const INTEL_CONFIG_KEY = "industry_intel_config";
const INTEL_RESULTS_KEY = "industry_intel_results";
const MAX_RUNS_PER_DAY = 3;
const INTEL_CONFIG_DEFAULTS = {
  enabled: true,
  activeTopics: ["competitors", "pc_market", "benefits_market", "regulatory"] as string[],
  competitors: [
    "Applied Epic", "Vertafore AMS360", "EZLynx", "HawkSoft", "AgencyBloc",
    "NowCerts", "Zywave", "Salesforce Financial Services Cloud", "HubSpot",
    "Relay Platform", "Canopy Connect", "TechCanary",
  ] as string[],
  customTopics: [] as string[],
  surfaceTypes: ["competitor_intel", "market_conditions", "regulatory_updates", "technology_trends"] as string[],
  schedule: ["08:00", "17:00"] as string[],
};

/* GET /api/automations/jobs — last 50 jobs (admin only) */
router.get("/jobs", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const jobs = await db
      .select({
        job: backgroundJobsTable,
        creatorName: usersTable.name,
      })
      .from(backgroundJobsTable)
      .leftJoin(usersTable, eq(backgroundJobsTable.createdBy, usersTable.id))
      .orderBy(desc(backgroundJobsTable.createdAt))
      .limit(50);

    res.json(jobs.map(({ job, creatorName }) => ({ ...job, creatorName })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* GET /api/automations/jobs/:id */
router.get("/jobs/:id", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const row = await db
      .select({ job: backgroundJobsTable, creatorName: usersTable.name })
      .from(backgroundJobsTable)
      .leftJoin(usersTable, eq(backgroundJobsTable.createdBy, usersTable.id))
      .where(eq(backgroundJobsTable.id, req.params.id))
      .then((r) => r[0]);

    if (!row) { res.status(404).json({ error: "Job not found" }); return; }
    res.json({ ...row.job, creatorName: row.creatorName });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* POST /api/automations/jobs — create and run a job */
router.post("/jobs", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { dbUser } = req as AuthRequest;
  const { type, payload = {} } = req.body as { type: string; payload?: Record<string, unknown> };

  const VALID_TYPES = ["ai_sequence_draft", "data_hygiene", "ai_email_summary", "industry_intel_refresh"];
  if (!VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `Unknown job type: ${type}` });
    return;
  }

  // Rate-limit industry_intel_refresh to 3 completed/running runs per calendar day
  if (type === "industry_intel_refresh") {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [{ runCount }] = await db
      .select({ runCount: sql<number>`count(*)::int` })
      .from(backgroundJobsTable)
      .where(
        and(
          eq(backgroundJobsTable.type, "industry_intel_refresh"),
          gte(backgroundJobsTable.createdAt, todayStart),
          ne(backgroundJobsTable.status, "failed"),
        ),
      );
    if (runCount >= 3) {
      res.status(429).json({ error: "Daily limit reached. Industry Intelligence can run at most 3 times per day.", runsToday: runCount });
      return;
    }
  }

  let label = type;
  if (type === "ai_sequence_draft") label = `AI Sequence Draft${payload.goal ? ` — ${String(payload.goal).slice(0, 60)}` : ""}`;
  if (type === "data_hygiene") label = "Data Hygiene Scan";
  if (type === "ai_email_summary") label = "AI Email Summarization";
  if (type === "industry_intel_refresh") label = "Industry Intelligence Refresh";

  // Insert job as running
  const [job] = await db
    .insert(backgroundJobsTable)
    .values({ type, label, status: "running", progress: 0, createdBy: dbUser.id, startedAt: new Date() })
    .returning();

  try {
    let result: unknown = null;

    if (type === "ai_sequence_draft") {
      const goal = String(payload.goal ?? "").trim();
      const tone = String(payload.tone ?? "Professional");
      const numSteps = Math.min(7, Math.max(2, Number(payload.numSteps ?? 3)));
      const context = String(payload.context ?? "").trim();

      if (!goal) throw new Error("goal is required for ai_sequence_draft");

      const systemPrompt = `You are an expert B2B sales email writer for P&C (property & casualty) and group benefits brokers. You focus exclusively on commercial P&C lines and employer-sponsored group benefits (health, dental, vision, disability, workers' comp). Do not reference life insurance products. Draft a complete multi-step outreach email sequence.
Return ONLY a JSON object with:
- "name": a short sequence name (max 60 chars)
- "steps": an array of exactly ${numSteps} objects, each with "subject" (subject line), "body" (full email body, 3-5 short paragraphs, clear low-friction CTA), and "delayDays" (0 for first step, 1-5 for subsequent)

Tone: ${tone}. Sound human, not templated. Never use "I hope this email finds you well". Return only JSON, no markdown.`;

      const userPrompt = `Sequence goal: ${goal}${context ? `\n\nContext: ${context}` : ""}\n\nDraft all ${numSteps} emails now.`;

      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 8192,
        messages: [{ role: "user", content: userPrompt }],
        system: systemPrompt,
      });

      const rawText = message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");

      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("AI returned unexpected format");
      const parsed = JSON.parse(jsonMatch[0]) as { name: string; steps: unknown[] };
      result = parsed;
    }

    if (type === "data_hygiene") {
      // Synchronous scan — results come from /contacts/duplicates and /companies/duplicates
      // This job just marks completion; UI calls those endpoints directly
      result = { message: "Scan complete. Review duplicates in the Data Hygiene panel." };
    }

    if (type === "ai_email_summary") {
      result = { message: "Gmail integration required. Connect Gmail in Settings → Integrations to enable this automation." };
    }

    if (type === "industry_intel_refresh") {
      // Load config
      const configRow = await db
        .select()
        .from(workspaceSettingsTable)
        .where(eq(workspaceSettingsTable.key, INTEL_CONFIG_KEY))
        .then((r) => r[0]);
      const cfg = { ...INTEL_CONFIG_DEFAULTS, ...(configRow?.value ?? {}) } as typeof INTEL_CONFIG_DEFAULTS;

      const TOPIC_LABELS: Record<string, string> = {
        competitors: "Insurtech Competitors vs Ennabl (CRM/AMS tools for insurance brokers)",
        pc_market: "P&C Commercial Market Conditions (rates, capacity, underwriting trends)",
        benefits_market: "Group Benefits & Employee Health Trends (ACA, self-insurance, plan design)",
        regulatory: "Regulatory & Compliance Updates (DOL, IRS, state regulations, P&C/benefits only)",
        agency_tech: "Agency Technology & Automation (AMS, API integrations, AI tools for brokers)",
        ma_activity: "M&A & Carrier Consolidation (agency acquisitions, PE rollups, carrier mergers)",
      };

      const activeLabels = cfg.activeTopics
        .filter((t: string) => TOPIC_LABELS[t])
        .map((t: string) => `- ${TOPIC_LABELS[t]}`);

      const customLabels = (cfg.customTopics as string[])
        .filter((t) => t.trim())
        .map((t) => `- Custom: ${t}`);

      const allTopics = [...activeLabels, ...customLabels];
      if (allTopics.length === 0) throw new Error("No research topics configured. Enable at least one topic first.");

      const competitorList = (cfg.competitors as string[]).join(", ");

      const systemPrompt = `You are an industry intelligence analyst for P&C (property & casualty) and group benefits insurance brokers. 
Produce concise, actionable market intelligence. Focus ONLY on commercial P&C lines and employer-sponsored group benefits. Never include life insurance.
Return ONLY a JSON array, no markdown, no explanation.`;

      const userPrompt = `Research these topics and produce 2 sharp intelligence items per topic (max 10 items total):

${allTopics.join("\n")}

Ennabl context: Ennabl is a CRM built specifically for independent P&C and group benefits brokers.
Direct competitors include: ${competitorList}

For each item return: { "section": "<topic name>", "headline": "<max 80 chars>", "summary": "<2 sentences max, actionable>", "tag": "<one word>", "date": "<Month YYYY>" }

Return only a JSON array. P&C & group benefits ONLY. No life insurance.`;

      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: userPrompt }],
        system: systemPrompt,
      });

      const rawText = message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");

      const arrayMatch = rawText.match(/\[[\s\S]*\]/);
      if (!arrayMatch) throw new Error("AI returned unexpected format for industry intel");
      const items = JSON.parse(arrayMatch[0]) as unknown[];

      const intelResult = { generatedAt: new Date().toISOString(), jobId: job.id, items };
      result = intelResult;

      // Persist results to workspace_settings for dashboard to read
      await db
        .insert(workspaceSettingsTable)
        .values({ key: INTEL_RESULTS_KEY, value: intelResult as unknown as Record<string, unknown> })
        .onConflictDoUpdate({
          target: workspaceSettingsTable.key,
          set: { value: intelResult as unknown as Record<string, unknown>, updatedAt: new Date() },
        });
    }

    const [updated] = await db
      .update(backgroundJobsTable)
      .set({ status: "completed", progress: 100, result, completedAt: new Date() })
      .where(eq(backgroundJobsTable.id, job.id))
      .returning();

    res.json({ ...updated, creatorName: dbUser.name });
  } catch (err) {
    const [failed] = await db
      .update(backgroundJobsTable)
      .set({ status: "failed", error: (err as Error).message, completedAt: new Date() })
      .where(eq(backgroundJobsTable.id, job.id))
      .returning();
    res.status(500).json({ ...failed, creatorName: dbUser.name, error: (err as Error).message });
  }
});

// ── Email analysis config ─────────────────────────────────────────────────────
const EMAIL_ANALYSIS_CONFIG_KEY = "email_analysis_config";
const EMAIL_ANALYSIS_DEFAULTS = {
  enabled: true,
  analysisDepth: "mid" as "short" | "mid" | "deep",
  focusTopics: ["renewal risk", "budget", "decision makers"],
  insightTypes: ["key_themes", "sentiment", "action_items", "next_steps"],
};

/* GET /api/automations/email-analysis-config */
router.get("/email-analysis-config", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const row = await db
      .select()
      .from(workspaceSettingsTable)
      .where(eq(workspaceSettingsTable.key, EMAIL_ANALYSIS_CONFIG_KEY))
      .then((r) => r[0]);
    const stored = (row?.value ?? {}) as Record<string, unknown>;
    res.json({ ...EMAIL_ANALYSIS_DEFAULTS, ...stored });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* PATCH /api/automations/email-analysis-config */
router.patch("/email-analysis-config", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const body = req.body as Partial<typeof EMAIL_ANALYSIS_DEFAULTS>;
    const row = await db
      .select()
      .from(workspaceSettingsTable)
      .where(eq(workspaceSettingsTable.key, EMAIL_ANALYSIS_CONFIG_KEY))
      .then((r) => r[0]);

    const current = (row?.value ?? EMAIL_ANALYSIS_DEFAULTS) as Record<string, unknown>;
    const updated = { ...current, ...body };

    await db
      .insert(workspaceSettingsTable)
      .values({ key: EMAIL_ANALYSIS_CONFIG_KEY, value: updated })
      .onConflictDoUpdate({
        target: workspaceSettingsTable.key,
        set: { value: updated, updatedAt: new Date() },
      });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Industry Intelligence config + results ────────────────────────────────────

/* GET /api/automations/industry-intel-config */
router.get("/industry-intel-config", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const row = await db.select().from(workspaceSettingsTable)
      .where(eq(workspaceSettingsTable.key, INTEL_CONFIG_KEY)).then((r) => r[0]);
    res.json({ ...INTEL_CONFIG_DEFAULTS, ...(row?.value ?? {}) });
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

/* PATCH /api/automations/industry-intel-config */
router.patch("/industry-intel-config", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const row = await db.select().from(workspaceSettingsTable)
      .where(eq(workspaceSettingsTable.key, INTEL_CONFIG_KEY)).then((r) => r[0]);
    const current = { ...INTEL_CONFIG_DEFAULTS, ...(row?.value ?? {}) } as Record<string, unknown>;
    const updated = { ...current, ...(req.body as Record<string, unknown>) };
    await db.insert(workspaceSettingsTable).values({ key: INTEL_CONFIG_KEY, value: updated })
      .onConflictDoUpdate({ target: workspaceSettingsTable.key, set: { value: updated, updatedAt: new Date() } });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

/* GET /api/automations/industry-intel-results — last results + today's run count */
router.get("/industry-intel-results", requireAuth, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const [resultsRow, { runCount }] = await Promise.all([
      db.select().from(workspaceSettingsTable)
        .where(eq(workspaceSettingsTable.key, INTEL_RESULTS_KEY)).then((r) => r[0]),
      db.select({ runCount: sql<number>`count(*)::int` }).from(backgroundJobsTable)
        .where(and(
          eq(backgroundJobsTable.type, "industry_intel_refresh"),
          gte(backgroundJobsTable.createdAt, todayStart),
          ne(backgroundJobsTable.status, "failed"),
        )).then((r) => r[0]),
    ]);
    res.json({
      results: resultsRow?.value ?? null,
      runsToday: runCount,
      runsRemaining: Math.max(0, MAX_RUNS_PER_DAY - runCount),
      maxRunsPerDay: MAX_RUNS_PER_DAY,
    });
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

export default router;
