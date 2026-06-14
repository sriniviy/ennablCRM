import { Router, type Request, type Response } from "express";
import { db, backgroundJobsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
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

  const VALID_TYPES = ["ai_sequence_draft", "data_hygiene", "ai_email_summary"];
  if (!VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `Unknown job type: ${type}` });
    return;
  }

  let label = type;
  if (type === "ai_sequence_draft") label = `AI Sequence Draft${payload.goal ? ` — ${String(payload.goal).slice(0, 60)}` : ""}`;
  if (type === "data_hygiene") label = "Data Hygiene Scan";
  if (type === "ai_email_summary") label = "AI Email Summarization";

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

      const systemPrompt = `You are an expert B2B sales email writer for insurance and benefits brokers. Draft a complete multi-step outreach email sequence.
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

export default router;
