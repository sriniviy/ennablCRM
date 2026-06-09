import { Router, type Request, type Response } from "express";
import {
  db,
  sequencesTable,
  sequenceStepsTable,
  sequenceEnrollmentsTable,
  contactsTable,
  activitiesTable,
} from "@workspace/db";
import { eq, and, lte, inArray, sql, asc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { Resend } from "resend";

const router = Router();

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

// ─── Sequences CRUD ──────────────────────────────────────────────────────────

router.get("/", requireAuth, async (_req: Request, res: Response) => {
  try {
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
    const [sequence] = await db
      .select()
      .from(sequencesTable)
      .where(eq(sequencesTable.id, req.params.id))
      .limit(1);
    if (!sequence) {
      res.status(404).json({ error: "Sequence not found" });
      return;
    }
    const steps = await db
      .select()
      .from(sequenceStepsTable)
      .where(eq(sequenceStepsTable.sequenceId, sequence.id))
      .orderBy(asc(sequenceStepsTable.stepOrder));

    const enrollments = await db
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
      .orderBy(sql`${sequenceEnrollmentsTable.enrolledAt} desc`);

    res.json({
      ...sequence,
      steps,
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
    const { name } = req.body as { name?: string };
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const [updated] = await db
      .update(sequencesTable)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(eq(sequencesTable.id, req.params.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Sequence not found" });
      return;
    }
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update sequence" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const [existing] = await db
      .select()
      .from(sequencesTable)
      .where(eq(sequencesTable.id, req.params.id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Sequence not found" });
      return;
    }
    await db
      .delete(sequencesTable)
      .where(eq(sequencesTable.id, req.params.id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete sequence" });
  }
});

// ─── Steps ───────────────────────────────────────────────────────────────────

router.post("/:id/steps", requireAuth, async (req: Request, res: Response) => {
  try {
    const { subject, body, delayDays } = req.body as {
      subject?: string;
      body?: string;
      delayDays?: number;
    };
    if (!subject?.trim() || !body?.trim()) {
      res.status(400).json({ error: "subject and body are required" });
      return;
    }
    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${sequenceStepsTable.stepOrder}), -1)::int` })
      .from(sequenceStepsTable)
      .where(eq(sequenceStepsTable.sequenceId, req.params.id));

    const [step] = await db
      .insert(sequenceStepsTable)
      .values({
        sequenceId: req.params.id,
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
            eq(sequenceStepsTable.id, req.params.stepId),
            eq(sequenceStepsTable.sequenceId, req.params.id),
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
      await db
        .delete(sequenceStepsTable)
        .where(
          and(
            eq(sequenceStepsTable.id, req.params.stepId),
            eq(sequenceStepsTable.sequenceId, req.params.id),
          ),
        );
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Failed to delete step" });
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

      const [sequence] = await db
        .select()
        .from(sequencesTable)
        .where(eq(sequencesTable.id, req.params.id))
        .limit(1);
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
      const [enrollment] = await db
        .select()
        .from(sequenceEnrollmentsTable)
        .where(
          and(
            eq(sequenceEnrollmentsTable.id, req.params.enrollmentId),
            eq(sequenceEnrollmentsTable.sequenceId, req.params.id),
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

      const [sequence] = await db
        .select()
        .from(sequencesTable)
        .where(eq(sequencesTable.id, req.params.id))
        .limit(1);

      await db.insert(activitiesTable).values({
        type: "SEQUENCE_UNENROLLED",
        title: `Unenrolled from sequence "${sequence?.name ?? ""}"`,
        contactId: enrollment.contactId,
        userId: dbUser.id,
        metadata: { sequenceId: req.params.id, enrollmentId: enrollment.id },
      });

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to unenroll" });
    }
  },
);

// ─── Scheduled sender (runs every 60s) ───────────────────────────────────────

export async function runSequenceSender() {
  const resend = getResend();

  const due = await db
    .select({
      enrollment: sequenceEnrollmentsTable,
      contactEmail: contactsTable.email,
      contactFirstName: contactsTable.firstName,
      contactLastName: contactsTable.lastName,
    })
    .from(sequenceEnrollmentsTable)
    .innerJoin(
      contactsTable,
      eq(contactsTable.id, sequenceEnrollmentsTable.contactId),
    )
    .where(
      and(
        eq(sequenceEnrollmentsTable.status, "ACTIVE"),
        lte(sequenceEnrollmentsTable.nextSendAt, new Date()),
      ),
    )
    .limit(100);

  for (const { enrollment, contactEmail, contactFirstName, contactLastName } of due) {
    if (!contactEmail) continue;

    const steps = await db
      .select()
      .from(sequenceStepsTable)
      .where(eq(sequenceStepsTable.sequenceId, enrollment.sequenceId))
      .orderBy(asc(sequenceStepsTable.stepOrder));

    if (steps.length === 0) continue;

    const step = steps[enrollment.currentStep];
    if (!step) {
      await db
        .update(sequenceEnrollmentsTable)
        .set({ status: "COMPLETED", completedAt: new Date() })
        .where(eq(sequenceEnrollmentsTable.id, enrollment.id));
      continue;
    }

    const [sequence] = await db
      .select()
      .from(sequencesTable)
      .where(eq(sequencesTable.id, enrollment.sequenceId))
      .limit(1);

    const contactName =
      [contactFirstName, contactLastName].filter(Boolean).join(" ") || contactEmail;

    if (resend) {
      try {
        const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@resend.dev";
        const fromName = process.env.RESEND_FROM_NAME ?? "MyCRM";
        await resend.emails.send({
          from: `${fromName} <${fromEmail}>`,
          to: contactEmail,
          subject: step.subject,
          html: step.body.replace(/\n/g, "<br>"),
          text: step.body,
        });
      } catch {
        continue;
      }
    }

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
