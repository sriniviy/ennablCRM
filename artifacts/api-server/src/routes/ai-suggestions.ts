import { Router, type Request, type Response } from "express";
import {
  db,
  contactsTable,
  companiesTable,
  dealsTable,
  dealStagesTable,
  activitiesTable,
  tasksTable,
  notesTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { openai } from "../lib/openai-client";

const router = Router();

function daysSince(date: string | Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

function fmt(d: string | Date | null) {
  if (!d) return "unknown";
  return new Date(d).toISOString().split("T")[0];
}

async function buildContactContext(recordId: string): Promise<string> {
  const [row] = await db
    .select({ contact: contactsTable, company: companiesTable })
    .from(contactsTable)
    .leftJoin(companiesTable, eq(contactsTable.companyId, companiesTable.id))
    .where(eq(contactsTable.id, recordId))
    .limit(1);
  if (!row) throw new Error("Contact not found");

  const { contact, company } = row;
  const [activities, tasks, notes] = await Promise.all([
    db
      .select()
      .from(activitiesTable)
      .where(eq(activitiesTable.contactId, recordId))
      .orderBy(desc(activitiesTable.createdAt))
      .limit(10),
    db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.contactId, recordId), eq(tasksTable.completed, false)))
      .orderBy(tasksTable.dueDate)
      .limit(5),
    db
      .select()
      .from(notesTable)
      .where(and(eq(notesTable.entityType, "contact"), eq(notesTable.entityId, recordId)))
      .orderBy(desc(notesTable.createdAt))
      .limit(5),
  ]);

  const lastActivity = activities[0];
  const daysSinceLast = daysSince(lastActivity?.createdAt ?? null);

  const lines: string[] = [
    `Contact: ${contact.firstName} ${contact.lastName}`,
    `Status: ${contact.status}`,
    `Company: ${company?.name ?? "none"}`,
    `Email: ${contact.email ?? "none"}`,
    `Days since last activity: ${daysSinceLast ?? "never"}`,
    "",
    `Recent activities (${activities.length}):`,
    ...activities.slice(0, 5).map(a => `  - [${fmt(a.createdAt)}] ${a.type}: ${a.description ?? ""}`),
    "",
    `Open tasks (${tasks.length}):`,
    ...tasks.map(t => `  - [due ${fmt(t.dueDate)}] ${t.title} (${t.priority})`),
    "",
    `Recent notes (${notes.length}):`,
    ...notes.slice(0, 3).map(n => `  - "${n.body?.slice(0, 120)}"`),
  ];

  return lines.join("\n");
}

async function buildDealContext(recordId: string): Promise<string> {
  const [row] = await db
    .select({ deal: dealsTable, stage: dealStagesTable, company: companiesTable })
    .from(dealsTable)
    .leftJoin(dealStagesTable, eq(dealsTable.stageId, dealStagesTable.id))
    .leftJoin(companiesTable, eq(dealsTable.companyId, companiesTable.id))
    .where(eq(dealsTable.id, recordId))
    .limit(1);
  if (!row) throw new Error("Deal not found");

  const { deal, stage, company } = row;
  const [activities, tasks, notes] = await Promise.all([
    db
      .select()
      .from(activitiesTable)
      .where(eq(activitiesTable.dealId, recordId))
      .orderBy(desc(activitiesTable.createdAt))
      .limit(10),
    db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.dealId, recordId), eq(tasksTable.completed, false)))
      .orderBy(tasksTable.dueDate)
      .limit(5),
    db
      .select()
      .from(notesTable)
      .where(and(eq(notesTable.entityType, "deal"), eq(notesTable.entityId, recordId)))
      .orderBy(desc(notesTable.createdAt))
      .limit(5),
  ]);

  const lastActivity = activities[0];
  const daysSinceLast = daysSince(lastActivity?.createdAt ?? null);
  const daysToClose = deal.closeDate ? daysSince(deal.closeDate) : null;

  const lines: string[] = [
    `Deal: ${deal.title}`,
    `Stage: ${stage?.name ?? "unknown"}`,
    `Value: ${deal.value != null ? `$${deal.value}` : "not set"}`,
    `Probability: ${deal.probability != null ? `${deal.probability}%` : "not set"}`,
    `Company: ${company?.name ?? "none"}`,
    `Close date: ${fmt(deal.closeDate)} (${daysToClose != null ? (daysToClose > 0 ? `${daysToClose}d overdue` : `${-daysToClose}d remaining`) : "no date"})`,
    `Days since last activity: ${daysSinceLast ?? "never"}`,
    "",
    `Recent activities (${activities.length}):`,
    ...activities.slice(0, 5).map(a => `  - [${fmt(a.createdAt)}] ${a.type}: ${a.description ?? ""}`),
    "",
    `Open tasks (${tasks.length}):`,
    ...tasks.map(t => `  - [due ${fmt(t.dueDate)}] ${t.title} (${t.priority})`),
    "",
    `Recent notes (${notes.length}):`,
    ...notes.slice(0, 3).map(n => `  - "${n.body?.slice(0, 120)}"`),
  ];

  return lines.join("\n");
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { objectType, recordId } = req.query as Record<string, string>;

  if (!objectType || !recordId) {
    res.status(400).json({ error: "objectType and recordId are required" });
    return;
  }
  if (objectType !== "contact" && objectType !== "deal") {
    res.status(400).json({ error: "objectType must be contact or deal" });
    return;
  }

  try {
    const context =
      objectType === "contact"
        ? await buildContactContext(recordId)
        : await buildDealContext(recordId);

    const systemPrompt = `You are a CRM assistant for an insurance brokerage firm. 
Given a ${objectType} record summary, return exactly 2 concise next-best-action suggestions for the sales rep.
Each suggestion must be actionable, specific, and ≤ 15 words.
Return JSON: { "suggestions": [{ "id": "1", "text": "...", "action": "task|email|call|follow_up|meeting|other" }, ...] }
Only return the JSON object, no markdown.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 256,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: context },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const VALID_ACTIONS = new Set(["task", "email", "call", "follow_up", "meeting", "other"]);
    let suggestions: { id: string; text: string; action: string }[] = [];
    try {
      const parsed = JSON.parse(raw) as { suggestions?: unknown };
      if (Array.isArray(parsed.suggestions)) {
        suggestions = parsed.suggestions
          .filter(
            (s): s is { text: string; id?: unknown; action?: unknown } =>
              !!s &&
              typeof s === "object" &&
              typeof (s as { text?: unknown }).text === "string" &&
              (s as { text: string }).text.trim().length > 0,
          )
          // Spec: 1-2 suggestions. Clamp to a max of 2 regardless of model output.
          .slice(0, 2)
          .map((s, i) => ({
            id: typeof s.id === "string" && s.id ? s.id : String(i + 1),
            text: s.text.trim(),
            action:
              typeof s.action === "string" && VALID_ACTIONS.has(s.action) ? s.action : "other",
          }));
      }
    } catch {
      suggestions = [];
    }

    res.json({ suggestions });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message ?? "Failed to generate suggestions" });
  }
});

export default router;
