import { Router, type Request, type Response } from "express";
import {
  db,
  sequencesTable,
  sequenceStepsTable,
  sequenceEnrollmentsTable,
  sequenceTriggersTable,
  contactsTable,
  companiesTable,
  usersTable,
  dealsTable,
  dealStagesTable,
  activitiesTable,
} from "@workspace/db";
import { eq, and, lte, inArray, sql, asc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { Resend } from "resend";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

// Replaces {{token}} placeholders with contact/rep data. Unknown tokens are left as-is.
function replaceTokens(text: string, tokens: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in tokens ? tokens[key] : match,
  );
}

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

// Returns the sequence only if it exists and belongs to userId (ownership guard).
async function getOwnedSequence(sequenceId: string, userId: string) {
  const [sequence] = await db
    .select()
    .from(sequencesTable)
    .where(
      and(
        eq(sequencesTable.id, sequenceId),
        eq(sequencesTable.ownerId, userId),
      ),
    )
    .limit(1);
  return sequence ?? null;
}

// ─── Sequences CRUD ──────────────────────────────────────────────────────────

// ─── AI Draft Step ───────────────────────────────────────────────────────────

router.post("/ai-draft-step", requireAuth, async (req: Request, res: Response) => {
  try {
    const { goal, tone, context, stepNumber, totalSteps, existingSubject, existingBody, improveFields } = req.body as {
      goal?: string;
      tone?: string;
      context?: string;
      stepNumber?: number;
      totalSteps?: number;
      existingSubject?: string;
      existingBody?: string;
      improveFields?: "subject" | "body" | "both";
    };
    if (!goal?.trim()) {
      res.status(400).json({ error: "goal is required" });
      return;
    }
    const toneLabel = tone ?? "Professional";
    const stepCtx =
      stepNumber != null && totalSteps != null
        ? `This is step ${stepNumber} of ${totalSteps} in a multi-step outreach sequence.`
        : "";
    const isImprove = !!(existingSubject?.trim() || existingBody?.trim());

    // Determine which fields to generate
    const fields = isImprove ? (improveFields ?? "both") : "both";
    const wantSubject = fields === "subject" || fields === "both";
    const wantBody = fields === "body" || fields === "both";

    // Build the JSON shape description for the prompt
    const jsonShape = wantSubject && wantBody
      ? `"subject" (a short, compelling subject line) and "body" (the email body)`
      : wantSubject
        ? `"subject" (a short, compelling subject line)`
        : `"body" (the email body)`;

    const systemPrompt = isImprove
      ? `You are an expert B2B sales email editor. Your job is to improve an existing outreach email for a sales sequence. Return ONLY a JSON object with ${jsonShape}. Do not include any markdown, explanation, or text outside the JSON object.

Guidelines:
- Preserve the intent and key points of the original email unless the goal says otherwise
- Keep emails concise (3-5 short paragraphs max)
- Sound human and natural, not like a template
- Tone should be ${toneLabel}
- Never use phrases like "I hope this email finds you well"
- End with a clear, low-friction call to action
${stepCtx}`
      : `You are an expert B2B sales email writer. Your job is to draft a single outreach email for a sales sequence. Return ONLY a JSON object with "subject" (a short, compelling subject line) and "body" (the email body). Do not include any markdown, explanation, or text outside the JSON object.

Guidelines:
- Keep emails concise (3-5 short paragraphs max)
- Sound human and natural, not like a template
- Tone should be ${toneLabel}
- Never use phrases like "I hope this email finds you well"
- End with a clear, low-friction call to action
${stepCtx}`;

    const improveContext = isImprove
      ? `\nExisting email to improve:${wantSubject ? `\nSubject: ${existingSubject?.trim() ?? ""}` : ""}${wantBody ? `\nBody:\n${existingBody?.trim() ?? ""}` : ""}`
      : "";

    const userPrompt = isImprove
      ? `Goal: ${goal.trim()}
${improveContext}${context?.trim() ? `\n\nAdditional context: ${context.trim()}` : ""}

Rewrite ${fields === "both" ? "the email" : `only the ${fields}`} now.`
      : `Goal of this email: ${goal.trim()}${context?.trim() ? `\n\nAdditional context: ${context.trim()}` : ""}

Write the email now.`;

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

    // Extract JSON from the response (handle ```json``` fences if present)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "AI returned unexpected format" });
      return;
    }
    const parsed = JSON.parse(jsonMatch[0]) as { subject?: string; body?: string };
    if (wantSubject && !parsed.subject) {
      res.status(500).json({ error: "AI response missing subject" });
      return;
    }
    if (wantBody && !parsed.body) {
      res.status(500).json({ error: "AI response missing body" });
      return;
    }
    const responsePayload: { subject?: string; body?: string } = {};
    if (wantSubject) responsePayload.subject = parsed.subject;
    if (wantBody) responsePayload.body = parsed.body;
    res.json(responsePayload);
  } catch (err) {
    console.error("AI draft step error:", err);
    res.status(500).json({ error: "Failed to generate email draft" });
  }
});

// ─── AI Draft Sequence (all steps at once) ───────────────────────────────────

router.post("/ai-draft-sequence", requireAuth, async (req: Request, res: Response) => {
  try {
    const { goal, numSteps, tone, context } = req.body as {
      goal?: string;
      numSteps?: number;
      tone?: string;
      context?: string;
    };
    if (!goal?.trim()) {
      res.status(400).json({ error: "goal is required" });
      return;
    }
    const count = Math.min(7, Math.max(2, Math.round(numSteps ?? 3)));
    const toneLabel = tone ?? "Professional";

    const systemPrompt = `You are an expert B2B sales email writer. Your job is to draft a complete multi-step outreach email sequence.
Return ONLY a JSON array with exactly ${count} objects. Each object must have:
- "subject": a short, compelling subject line
- "body": the full email body (3-5 short paragraphs max, ending with a clear low-friction CTA)
- "delayDays": number of days after the previous step to send this email (first step is 0, subsequent steps are 1-5)

Guidelines:
- Sound human and natural, not like a template
- Tone should be: ${toneLabel}
- Each email should reference or build on the previous without being repetitive
- Never use phrases like "I hope this email finds you well"
- Do not wrap in markdown, do not include any text outside the JSON array`;

    const userPrompt = `Sequence goal: ${goal.trim()}${context?.trim() ? `\n\nAdditional context: ${context.trim()}` : ""}

Draft all ${count} emails now.`;

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

    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      res.status(500).json({ error: "AI returned unexpected format" });
      return;
    }
    const parsed = JSON.parse(jsonMatch[0]) as unknown[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      res.status(500).json({ error: "AI response was not an array" });
      return;
    }
    const steps = parsed.map((s, i) => {
      const step = s as { subject?: string; body?: string; delayDays?: number };
      if (!step.subject || !step.body) throw new Error(`Step ${i + 1} missing subject or body`);
      return {
        subject: step.subject,
        body: step.body,
        delayDays: typeof step.delayDays === "number" ? Math.max(0, step.delayDays) : (i === 0 ? 0 : 2),
      };
    });
    res.json({ steps });
  } catch (err) {
    console.error("AI draft sequence error:", err);
    res.status(500).json({ error: "Failed to generate sequence draft" });
  }
});

// Returns the distinct contactIds that have at least one active TRIGGER enrollment.
// Used by the contacts list and deal cards to show the auto-enrolled indicator.
router.get("/trigger-enrolled-contacts", requireAuth, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .selectDistinct({ contactId: sequenceEnrollmentsTable.contactId })
      .from(sequenceEnrollmentsTable)
      .where(
        and(
          eq(sequenceEnrollmentsTable.enrolledVia, "TRIGGER"),
          eq(sequenceEnrollmentsTable.status, "ACTIVE"),
        ),
      );
    res.json({ contactIds: rows.map((r) => r.contactId) });
  } catch {
    res.status(500).json({ error: "Failed to fetch trigger-enrolled contacts" });
  }
});

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const rows = await db
      .select({
        sequence: sequencesTable,
        stepCount: sql<number>`count(distinct ${sequenceStepsTable.id})::int`,
        activeEnrollments: sql<number>`count(distinct case when ${sequenceEnrollmentsTable.status} = 'ACTIVE' then ${sequenceEnrollmentsTable.id} end)::int`,
        totalEnrollments: sql<number>`count(distinct ${sequenceEnrollmentsTable.id})::int`,
      })
      .from(sequencesTable)
      .leftJoin(
        sequenceStepsTable,
        eq(sequenceStepsTable.sequenceId, sequencesTable.id),
      )
      .leftJoin(
        sequenceEnrollmentsTable,
        eq(sequenceEnrollmentsTable.sequenceId, sequencesTable.id),
      )
      .where(eq(sequencesTable.ownerId, dbUser.id))
      .groupBy(sequencesTable.id)
      .orderBy(sql`${sequencesTable.createdAt} desc`);

    res.json(
      rows.map(({ sequence, stepCount, activeEnrollments, totalEnrollments }) => ({
        ...sequence,
        stepCount,
        activeEnrollments,
        totalEnrollments,
      })),
    );
  } catch {
    res.status(500).json({ error: "Failed to list sequences" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { name } = req.body as { name?: string };
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const [seq] = await db
      .insert(sequencesTable)
      .values({ name: name.trim(), ownerId: dbUser.id })
      .returning();
    res.status(201).json(seq);
  } catch {
    res.status(500).json({ error: "Failed to create sequence" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const sequence = await getOwnedSequence(req.params.id as string, dbUser.id);
    if (!sequence) {
      res.status(404).json({ error: "Sequence not found" });
      return;
    }
    const [steps, enrollments, triggers] = await Promise.all([
      db
        .select()
        .from(sequenceStepsTable)
        .where(eq(sequenceStepsTable.sequenceId, sequence.id))
        .orderBy(asc(sequenceStepsTable.stepOrder)),
      db
        .select({
          enrollment: sequenceEnrollmentsTable,
          contactFirstName: contactsTable.firstName,
          contactLastName: contactsTable.lastName,
          contactEmail: contactsTable.email,
        })
        .from(sequenceEnrollmentsTable)
        .innerJoin(
          contactsTable,
          eq(contactsTable.id, sequenceEnrollmentsTable.contactId),
        )
        .where(eq(sequenceEnrollmentsTable.sequenceId, sequence.id))
        .orderBy(sql`${sequenceEnrollmentsTable.enrolledAt} desc`),
      db
        .select()
        .from(sequenceTriggersTable)
        .where(eq(sequenceTriggersTable.sequenceId, sequence.id))
        .orderBy(sql`${sequenceTriggersTable.createdAt} asc`),
    ]);

    res.json({
      ...sequence,
      steps,
      triggers,
      enrollments: enrollments.map(({ enrollment, contactFirstName, contactLastName, contactEmail }) => ({
        ...enrollment,
        contactName: [contactFirstName, contactLastName].filter(Boolean).join(" ") || contactEmail,
        contactEmail,
      })),
    });
  } catch {
    res.status(500).json({ error: "Failed to get sequence" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const { name, exitOnDealWon, exitOnDealLost, exitOnUnsubscribe } =
      req.body as {
        name?: string;
        exitOnDealWon?: boolean;
        exitOnDealLost?: boolean;
        exitOnUnsubscribe?: boolean;
      };

    const existing = await getOwnedSequence(req.params.id as string, dbUser.id);
    if (!existing) {
      res.status(404).json({ error: "Sequence not found" });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) {
      if (!name.trim()) {
        res.status(400).json({ error: "name cannot be empty" });
        return;
      }
      updates.name = name.trim();
    }
    if (exitOnDealWon !== undefined) updates.exitOnDealWon = exitOnDealWon;
    if (exitOnDealLost !== undefined) updates.exitOnDealLost = exitOnDealLost;
    if (exitOnUnsubscribe !== undefined) updates.exitOnUnsubscribe = exitOnUnsubscribe;

    const [updated] = await db
      .update(sequencesTable)
      .set(updates)
      .where(
        and(
          eq(sequencesTable.id, req.params.id as string),
          eq(sequencesTable.ownerId, dbUser.id),
        ),
      )
      .returning();
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update sequence" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const existing = await getOwnedSequence(req.params.id as string, dbUser.id);
    if (!existing) {
      res.status(404).json({ error: "Sequence not found" });
      return;
    }
    await db
      .delete(sequencesTable)
      .where(
        and(
          eq(sequencesTable.id, req.params.id as string),
          eq(sequencesTable.ownerId, dbUser.id),
        ),
      );
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete sequence" });
  }
});

// ─── Steps ───────────────────────────────────────────────────────────────────

router.post("/:id/steps", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const sequence = await getOwnedSequence(req.params.id as string, dbUser.id);
    if (!sequence) {
      res.status(404).json({ error: "Sequence not found" });
      return;
    }
    const { subject, body, delayDays } = req.body as {
      subject?: string;
      body?: string;
      delayDays?: number;
    };
    const bodyText = body?.replace(/<[^>]*>/g, "").trim();
    if (!subject?.trim() || !bodyText) {
      res.status(400).json({ error: "subject and body are required" });
      return;
    }
    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${sequenceStepsTable.stepOrder}), -1)::int` })
      .from(sequenceStepsTable)
      .where(eq(sequenceStepsTable.sequenceId, sequence.id));

    const [step] = await db
      .insert(sequenceStepsTable)
      .values({
        sequenceId: sequence.id,
        subject: subject.trim(),
        body: body.trim(),
        delayDays: delayDays ?? 1,
        stepOrder: maxOrder + 1,
      })
      .returning();
    res.status(201).json(step);
  } catch {
    res.status(500).json({ error: "Failed to add step" });
  }
});

router.patch(
  "/:id/steps/:stepId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { dbUser } = req as AuthRequest;
      const sequence = await getOwnedSequence(req.params.id as string, dbUser.id);
      if (!sequence) {
        res.status(404).json({ error: "Sequence not found" });
        return;
      }
      const { subject, body, delayDays } = req.body as {
        subject?: string;
        body?: string;
        delayDays?: number;
      };
      const updates: Record<string, unknown> = {};
      if (subject !== undefined) updates.subject = subject.trim();
      if (body !== undefined) updates.body = body.trim();
      if (delayDays !== undefined) updates.delayDays = delayDays;

      const [updated] = await db
        .update(sequenceStepsTable)
        .set(updates)
        .where(
          and(
            eq(sequenceStepsTable.id, req.params.stepId as string),
            eq(sequenceStepsTable.sequenceId, sequence.id),
          ),
        )
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Step not found" });
        return;
      }
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update step" });
    }
  },
);

router.delete(
  "/:id/steps/:stepId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { dbUser } = req as AuthRequest;
      const sequence = await getOwnedSequence(req.params.id as string, dbUser.id);
      if (!sequence) {
        res.status(404).json({ error: "Sequence not found" });
        return;
      }
      await db
        .delete(sequenceStepsTable)
        .where(
          and(
            eq(sequenceStepsTable.id, req.params.stepId as string),
            eq(sequenceStepsTable.sequenceId, sequence.id),
          ),
        );
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Failed to delete step" });
    }
  },
);

router.post(
  "/:id/steps/reorder",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { dbUser } = req as AuthRequest;
      const sequence = await getOwnedSequence(req.params.id as string, dbUser.id);
      if (!sequence) {
        res.status(404).json({ error: "Sequence not found" });
        return;
      }
      const { orderedIds } = req.body as { orderedIds?: string[] };
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        res.status(400).json({ error: "orderedIds array required" });
        return;
      }
      await db.transaction(async (tx) => {
        for (let i = 0; i < orderedIds.length; i++) {
          await tx
            .update(sequenceStepsTable)
            .set({ stepOrder: i })
            .where(
              and(
                eq(sequenceStepsTable.id, orderedIds[i]),
                eq(sequenceStepsTable.sequenceId, sequence.id),
              ),
            );
        }
      });
      const steps = await db
        .select()
        .from(sequenceStepsTable)
        .where(eq(sequenceStepsTable.sequenceId, sequence.id))
        .orderBy(asc(sequenceStepsTable.stepOrder));
      res.json(steps);
    } catch {
      res.status(500).json({ error: "Failed to reorder steps" });
    }
  },
);

// ─── Enroll / Unenroll ───────────────────────────────────────────────────────

router.post(
  "/:id/enroll",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { dbUser } = req as AuthRequest;
      const { contactIds } = req.body as { contactIds?: string[] };
      if (!contactIds || contactIds.length === 0) {
        res.status(400).json({ error: "contactIds array required" });
        return;
      }

      const sequence = await getOwnedSequence(req.params.id as string, dbUser.id);
      if (!sequence) {
        res.status(404).json({ error: "Sequence not found" });
        return;
      }

      const steps = await db
        .select()
        .from(sequenceStepsTable)
        .where(eq(sequenceStepsTable.sequenceId, sequence.id))
        .orderBy(asc(sequenceStepsTable.stepOrder));

      if (steps.length === 0) {
        res.status(400).json({ error: "Sequence has no steps to send" });
        return;
      }

      const contacts = await db
        .select()
        .from(contactsTable)
        .where(inArray(contactsTable.id, contactIds));

      const firstStep = steps[0];
      const now = new Date();
      const firstSendAt = new Date(
        now.getTime() + firstStep.delayDays * 24 * 60 * 60 * 1000,
      );

      const enrolled: typeof sequenceEnrollmentsTable.$inferSelect[] = [];

      for (const contact of contacts) {
        const [existing] = await db
          .select()
          .from(sequenceEnrollmentsTable)
          .where(
            and(
              eq(sequenceEnrollmentsTable.sequenceId, sequence.id),
              eq(sequenceEnrollmentsTable.contactId, contact.id),
              eq(sequenceEnrollmentsTable.status, "ACTIVE"),
            ),
          )
          .limit(1);

        if (existing) continue;

        const [enrollment] = await db
          .insert(sequenceEnrollmentsTable)
          .values({
            sequenceId: sequence.id,
            contactId: contact.id,
            currentStep: 0,
            nextSendAt: firstSendAt,
            status: "ACTIVE",
          })
          .returning();

        enrolled.push(enrollment);

        await db.insert(activitiesTable).values({
          type: "SEQUENCE_ENROLLED",
          title: `Enrolled in sequence "${sequence.name}"`,
          description: `Step 1 of ${steps.length} scheduled`,
          contactId: contact.id,
          userId: dbUser.id,
          metadata: { sequenceId: sequence.id, sequenceName: sequence.name },
        });
      }

      res.status(201).json({ enrolled: enrolled.length, skipped: contacts.length - enrolled.length });
    } catch {
      res.status(500).json({ error: "Failed to enroll contacts" });
    }
  },
);

router.delete(
  "/:id/enrollments/:enrollmentId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { dbUser } = req as AuthRequest;

      // Verify the parent sequence belongs to the requester before touching the enrollment.
      const sequence = await getOwnedSequence(req.params.id as string, dbUser.id);
      if (!sequence) {
        res.status(404).json({ error: "Sequence not found" });
        return;
      }

      const [enrollment] = await db
        .select()
        .from(sequenceEnrollmentsTable)
        .where(
          and(
            eq(sequenceEnrollmentsTable.id, req.params.enrollmentId as string),
            eq(sequenceEnrollmentsTable.sequenceId, sequence.id),
          ),
        )
        .limit(1);

      if (!enrollment) {
        res.status(404).json({ error: "Enrollment not found" });
        return;
      }

      await db
        .update(sequenceEnrollmentsTable)
        .set({ status: "UNENROLLED", completedAt: new Date() })
        .where(eq(sequenceEnrollmentsTable.id, enrollment.id));

      await db.insert(activitiesTable).values({
        type: "SEQUENCE_UNENROLLED",
        title: `Unenrolled from sequence "${sequence.name}"`,
        contactId: enrollment.contactId,
        userId: dbUser.id,
        metadata: { sequenceId: sequence.id, enrollmentId: enrollment.id },
      });

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to unenroll" });
    }
  },
);

// ─── Triggers ────────────────────────────────────────────────────────────────

router.get("/:id/triggers", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const sequence = await getOwnedSequence(req.params.id as string, dbUser.id);
    if (!sequence) {
      res.status(404).json({ error: "Sequence not found" });
      return;
    }
    const triggers = await db
      .select()
      .from(sequenceTriggersTable)
      .where(eq(sequenceTriggersTable.sequenceId, sequence.id))
      .orderBy(sql`${sequenceTriggersTable.createdAt} asc`);
    res.json(triggers);
  } catch {
    res.status(500).json({ error: "Failed to list triggers" });
  }
});

router.post("/:id/triggers", requireAuth, async (req: Request, res: Response) => {
  try {
    const { dbUser } = req as AuthRequest;
    const sequence = await getOwnedSequence(req.params.id as string, dbUser.id);
    if (!sequence) {
      res.status(404).json({ error: "Sequence not found" });
      return;
    }
    const { triggerValue } = req.body as { triggerValue?: string };
    if (!triggerValue?.trim()) {
      res.status(400).json({ error: "triggerValue (stage name) is required" });
      return;
    }
    const [trigger] = await db
      .insert(sequenceTriggersTable)
      .values({
        sequenceId: sequence.id,
        triggerType: "DEAL_STAGE_CHANGE",
        triggerValue: triggerValue.trim(),
      })
      .returning();
    res.status(201).json(trigger);
  } catch {
    res.status(500).json({ error: "Failed to create trigger" });
  }
});

router.delete(
  "/:id/triggers/:triggerId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { dbUser } = req as AuthRequest;
      const sequence = await getOwnedSequence(req.params.id as string, dbUser.id);
      if (!sequence) {
        res.status(404).json({ error: "Sequence not found" });
        return;
      }
      await db
        .delete(sequenceTriggersTable)
        .where(
          and(
            eq(sequenceTriggersTable.id, req.params.triggerId as string),
            eq(sequenceTriggersTable.sequenceId, sequence.id),
          ),
        );
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Failed to delete trigger" });
    }
  },
);

// ─── Scheduled sender (runs every 60s) ───────────────────────────────────────

// Sentinel: push nextSendAt 10 min into the future before processing to claim
// the row and prevent double-processing if the interval fires again before we finish.
const CLAIM_WINDOW_MS = 10 * 60 * 1000;

export async function runSequenceSender() {
  const resend = getResend();

  // Require Resend to be configured; without it we must not advance state.
  if (!resend) return;

  const now = new Date();

  // Atomically claim due rows by bumping nextSendAt forward before processing.
  const claimedIds: string[] = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: sequenceEnrollmentsTable.id })
      .from(sequenceEnrollmentsTable)
      .where(
        and(
          eq(sequenceEnrollmentsTable.status, "ACTIVE"),
          lte(sequenceEnrollmentsTable.nextSendAt, now),
        ),
      )
      .limit(50);

    const ids = due.map((r) => r.id);
    if (ids.length === 0) return [];

    await tx
      .update(sequenceEnrollmentsTable)
      .set({ nextSendAt: new Date(now.getTime() + CLAIM_WINDOW_MS) })
      .where(inArray(sequenceEnrollmentsTable.id, ids));

    return ids;
  });

  if (claimedIds.length === 0) return;

  // Re-fetch with status = ACTIVE so enrollments unenrolled between claim and
  // send are automatically excluded — no unwanted emails sent post-unenroll.
  const claimed = await db
    .select({
      enrollment: sequenceEnrollmentsTable,
      contactEmail: contactsTable.email,
      contactFirstName: contactsTable.firstName,
      contactLastName: contactsTable.lastName,
      contactCompanyName: companiesTable.name,
      contactEmailMarketingContact: contactsTable.emailMarketingContact,
    })
    .from(sequenceEnrollmentsTable)
    .innerJoin(
      contactsTable,
      eq(contactsTable.id, sequenceEnrollmentsTable.contactId),
    )
    .leftJoin(companiesTable, eq(companiesTable.id, contactsTable.companyId))
    .where(
      and(
        inArray(sequenceEnrollmentsTable.id, claimedIds),
        eq(sequenceEnrollmentsTable.status, "ACTIVE"),
      ),
    );

  for (const { enrollment, contactEmail, contactFirstName, contactLastName, contactCompanyName, contactEmailMarketingContact } of claimed) {
    if (!contactEmail) continue;

    const steps = await db
      .select()
      .from(sequenceStepsTable)
      .where(eq(sequenceStepsTable.sequenceId, enrollment.sequenceId))
      .orderBy(asc(sequenceStepsTable.stepOrder));

    if (steps.length === 0) {
      await db
        .update(sequenceEnrollmentsTable)
        .set({ status: "COMPLETED", completedAt: new Date(), nextSendAt: null })
        .where(eq(sequenceEnrollmentsTable.id, enrollment.id));
      continue;
    }

    const step = steps[enrollment.currentStep];
    if (!step) {
      await db
        .update(sequenceEnrollmentsTable)
        .set({ status: "COMPLETED", completedAt: new Date(), nextSendAt: null })
        .where(eq(sequenceEnrollmentsTable.id, enrollment.id));
      continue;
    }

    const [sequence] = await db
      .select()
      .from(sequencesTable)
      .where(eq(sequencesTable.id, enrollment.sequenceId))
      .limit(1);

    // ─── Exit condition check ─────────────────────────────────────────────────
    if (sequence) {
      let exitReason: string | null = null;

      if (!exitReason && sequence.exitOnUnsubscribe && contactEmailMarketingContact === false) {
        exitReason = "Unsubscribed";
      }

      if (!exitReason && sequence.exitOnDealWon) {
        const [wonDeal] = await db
          .select({ id: dealsTable.id })
          .from(dealsTable)
          .innerJoin(dealStagesTable, eq(dealStagesTable.id, dealsTable.stageId))
          .where(
            and(
              eq(dealsTable.contactId, enrollment.contactId),
              eq(dealStagesTable.name, "Closed Won"),
            ),
          )
          .limit(1);
        if (wonDeal) exitReason = "Won deal";
      }

      if (!exitReason && sequence.exitOnDealLost) {
        const [lostDeal] = await db
          .select({ id: dealsTable.id })
          .from(dealsTable)
          .innerJoin(dealStagesTable, eq(dealStagesTable.id, dealsTable.stageId))
          .where(
            and(
              eq(dealsTable.contactId, enrollment.contactId),
              eq(dealStagesTable.name, "Closed Lost"),
            ),
          )
          .limit(1);
        if (lostDeal) exitReason = "Lost deal";
      }

      if (exitReason) {
        await db
          .update(sequenceEnrollmentsTable)
          .set({ status: "COMPLETED", completedAt: new Date(), nextSendAt: null, exitReason })
          .where(eq(sequenceEnrollmentsTable.id, enrollment.id));
        continue;
      }
    }

    const contactName =
      [contactFirstName, contactLastName].filter(Boolean).join(" ") || contactEmail;

    // Fetch the rep (sequence owner) so we can replace {{repName}} / {{repEmail}}.
    const [repUser] = await db
      .select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, sequence?.ownerId ?? ""))
      .limit(1);

    const tokenMap: Record<string, string> = {
      firstName: contactFirstName || "there",
      lastName: contactLastName || "",
      fullName:
        [contactFirstName, contactLastName].filter(Boolean).join(" ") || "there",
      companyName: contactCompanyName || "",
      repName: repUser?.name || "",
      repEmail: repUser?.email || "",
    };

    const resolvedSubject = replaceTokens(step.subject, tokenMap);
    const resolvedBody = replaceTokens(step.body, tokenMap);

    // Attempt send — only advance state on success.
    try {
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@resend.dev";
      const fromName = process.env.RESEND_FROM_NAME ?? "MyCRM";
      await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: contactEmail,
        subject: resolvedSubject,
        html: resolvedBody.replace(/\n/g, "<br>"),
        text: resolvedBody,
      });
    } catch {
      // Send failed — restore original nextSendAt so it's retried next tick.
      await db
        .update(sequenceEnrollmentsTable)
        .set({ nextSendAt: now })
        .where(eq(sequenceEnrollmentsTable.id, enrollment.id));
      continue;
    }

    // Send succeeded — advance to next step or complete.
    const nextStepIndex = enrollment.currentStep + 1;
    const isDone = nextStepIndex >= steps.length;

    if (isDone) {
      await db
        .update(sequenceEnrollmentsTable)
        .set({ status: "COMPLETED", completedAt: new Date(), nextSendAt: null })
        .where(eq(sequenceEnrollmentsTable.id, enrollment.id));
    } else {
      const nextStep = steps[nextStepIndex];
      const nextSendAt = new Date(
        Date.now() + nextStep.delayDays * 24 * 60 * 60 * 1000,
      );
      await db
        .update(sequenceEnrollmentsTable)
        .set({ currentStep: nextStepIndex, nextSendAt })
        .where(eq(sequenceEnrollmentsTable.id, enrollment.id));
    }

    await db.insert(activitiesTable).values({
      type: "SEQUENCE_STEP_SENT",
      title: `Sequence step ${enrollment.currentStep + 1} sent: "${step.subject}"`,
      description: `Sent to ${contactName} as part of "${sequence?.name ?? "sequence"}"`,
      contactId: enrollment.contactId,
      metadata: {
        sequenceId: enrollment.sequenceId,
        stepId: step.id,
        stepOrder: enrollment.currentStep,
        isDone,
      },
    });
  }
}

// Start the scheduler
setInterval(() => {
  runSequenceSender().catch(() => {});
}, 60_000);

export default router;
