import { db, activitiesTable } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import { openai } from "./openai-client";

type ActivityRow = typeof activitiesTable.$inferSelect;

export function isEmailActivity(type: string): boolean {
  return type === "EMAIL_SENT" || type === "EMAIL_OPENED" || type === "EMAIL_CLICKED";
}

export function isMeetingActivity(type: string): boolean {
  return type === "MEETING";
}

export function isSummarizable(a: {
  type: string;
  emailBody?: string | null;
  description?: string | null;
}): boolean {
  if (isMeetingActivity(a.type)) return !!(a.description?.trim() || a.emailBody?.trim());
  if (isEmailActivity(a.type)) return !!(a.emailBody?.trim() || a.description?.trim());
  return false;
}

export function getThreadId(a: ActivityRow): string | null {
  const meta = a.metadata as Record<string, unknown> | null;
  const t = meta?.threadId ?? meta?.thread_id;
  return typeof t === "string" && t.length > 0 ? t : null;
}

export function isThreadedEmail(a: ActivityRow): boolean {
  return isEmailActivity(a.type) && getThreadId(a) !== null;
}

const threadMatch = (threadId: string) =>
  sql`coalesce(${activitiesTable.metadata}->>'threadId', ${activitiesTable.metadata}->>'thread_id') = ${threadId}`;

async function getThreadMessages(a: ActivityRow): Promise<ActivityRow[]> {
  const threadId = getThreadId(a);
  if (!threadId) return [a];
  const rows = await db
    .select()
    .from(activitiesTable)
    .where(threadMatch(threadId))
    .orderBy(asc(activitiesTable.createdAt));
  return rows.length > 0 ? rows : [a];
}

function buildEmailThreadText(messages: ActivityRow[]): string {
  return messages
    .map((m, i) => {
      const date = m.createdAt ? new Date(m.createdAt).toISOString().split("T")[0] : "unknown";
      const subject = m.emailSubject ?? m.title;
      const body = (m.emailBody ?? m.description ?? "").trim();
      return `Message ${i + 1} [${date}] Subject: ${subject}\n${body}`;
    })
    .join("\n\n")
    .slice(0, 8000);
}

async function summarizeEmailThread(messages: ActivityRow[]): Promise<string | null> {
  const text = buildEmailThreadText(messages);
  if (!text.trim()) return null;

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 200,
    messages: [
      {
        role: "system",
        content:
          "You are a CRM assistant. Summarize the following email thread in exactly two concise, plain-English sentences that capture the context and any outcome or next step. Do not use markdown, headings, or bullet points. Return only the two-sentence summary.",
      },
      { role: "user", content: text },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() || null;
}

async function summarizeMeeting(activity: ActivityRow): Promise<string | null> {
  const notes = (activity.description ?? activity.emailBody ?? "").trim();
  if (!notes) return null;

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 320,
    messages: [
      {
        role: "system",
        content:
          "You are a CRM assistant. Summarize the meeting notes below. First write a two-sentence plain-English summary, then list key decisions and action items. Use exactly this format:\n<two sentences>\n\nKey decisions:\n- ...\n\nAction items:\n- ...\nIf there are no decisions or action items, write 'None' under that heading. Return only the summary.",
      },
      { role: "user", content: notes.slice(0, 8000) },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() || null;
}

export async function generateActivitySummary(activity: ActivityRow): Promise<string | null> {
  if (isMeetingActivity(activity.type)) return summarizeMeeting(activity);
  if (isEmailActivity(activity.type)) {
    const messages = await getThreadMessages(activity);
    return summarizeEmailThread(messages);
  }
  return null;
}

/**
 * Regenerate and persist the AI summary for an activity. For email threads, all
 * activities sharing the same threadId are updated so the summary stays in sync
 * as the thread gains new messages.
 */
export async function refreshActivitySummary(activityId: string): Promise<string | null> {
  const [activity] = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.id, activityId))
    .limit(1);
  if (!activity || !isSummarizable(activity)) return null;

  const summary = await generateActivitySummary(activity);
  if (!summary) return null;

  if (isEmailActivity(activity.type)) {
    const threadId = getThreadId(activity);
    if (threadId) {
      await db.update(activitiesTable).set({ aiSummary: summary }).where(threadMatch(threadId));
      return summary;
    }
  }

  await db.update(activitiesTable).set({ aiSummary: summary }).where(eq(activitiesTable.id, activity.id));
  return summary;
}
