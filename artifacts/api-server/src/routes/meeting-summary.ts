import { Router, type Request, type Response } from "express";
import { db, activitiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { openai } from "../lib/openai-client";

const router = Router();

interface MeetingSummaryResult {
  summary: string;
  decisions: string[];
  actionItems: string[];
  attendees: string[];
}

async function generateMeetingSummary(transcript: string): Promise<MeetingSummaryResult> {
  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 600,
    messages: [
      {
        role: "system",
        content: `You are a CRM assistant for an insurance brokerage.
Analyze the meeting notes or transcript and return a JSON object with exactly these fields:
{
  "summary": "Two plain-English sentences covering the meeting purpose and outcome.",
  "decisions": ["decision 1", "decision 2"],
  "actionItems": ["action item with owner if mentioned", ...],
  "attendees": ["name or role if mentioned", ...]
}
Keep each item concise (≤15 words). If a section has nothing, return an empty array.
Return only valid JSON, no markdown.`,
      },
      { role: "user", content: transcript.slice(0, 8000) },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
  try {
    const parsed = JSON.parse(raw) as Partial<MeetingSummaryResult>;
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions.filter((d): d is string => typeof d === "string") : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.filter((a): a is string => typeof a === "string") : [],
      attendees: Array.isArray(parsed.attendees) ? parsed.attendees.filter((a): a is string => typeof a === "string") : [],
    };
  } catch {
    return { summary: raw.slice(0, 300), decisions: [], actionItems: [], attendees: [] };
  }
}

function formatSummaryForStorage(result: MeetingSummaryResult): string {
  const lines: string[] = [result.summary];
  if (result.decisions.length > 0) {
    lines.push("\nKey decisions:");
    result.decisions.forEach((d) => lines.push(`- ${d}`));
  }
  if (result.actionItems.length > 0) {
    lines.push("\nAction items:");
    result.actionItems.forEach((a) => lines.push(`- ${a}`));
  }
  return lines.join("\n");
}

// POST /ai/meeting-summary
// Accepts transcript/notes, generates structured AI summary, saves as MEETING activity.
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { title, transcript, contactId, dealId, companyId, meetingDate } = req.body as {
    title?: string;
    transcript?: string;
    contactId?: string;
    dealId?: string;
    companyId?: string;
    meetingDate?: string;
  };

  const user = (req as AuthRequest).user;

  if (!transcript?.trim()) {
    res.status(400).json({ error: "transcript is required" });
    return;
  }

  try {
    const result = await generateMeetingSummary(transcript);
    const aiSummary = formatSummaryForStorage(result);

    const [activity] = await db
      .insert(activitiesTable)
      .values({
        type: "MEETING",
        title: title?.trim() || "Meeting",
        description: transcript.trim(),
        aiSummary,
        contactId: contactId || undefined,
        dealId: dealId || undefined,
        companyId: companyId || undefined,
        userId: user?.id || undefined,
        endDate: meetingDate ? new Date(meetingDate) : undefined,
        metadata: { attendees: result.attendees },
      })
      .returning();

    res.json({ activity, structured: result });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message ?? "Failed to generate meeting summary" });
  }
});

// POST /ai/meeting-summary/regenerate/:activityId
// Regenerates the summary for an existing MEETING activity.
router.post("/regenerate/:activityId", requireAuth, async (req: Request, res: Response) => {
  const { activityId } = req.params as { activityId: string };

  const [activity] = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.id, activityId))
    .limit(1);

  if (!activity || activity.type !== "MEETING") {
    res.status(404).json({ error: "Meeting activity not found" });
    return;
  }

  const transcript = activity.description ?? "";
  if (!transcript.trim()) {
    res.status(400).json({ error: "No transcript to summarize" });
    return;
  }

  try {
    const result = await generateMeetingSummary(transcript);
    const aiSummary = formatSummaryForStorage(result);

    await db
      .update(activitiesTable)
      .set({ aiSummary, metadata: { ...(activity.metadata as object ?? {}), attendees: result.attendees } })
      .where(eq(activitiesTable.id, activityId));

    res.json({ activityId, structured: result });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message ?? "Failed to regenerate summary" });
  }
});

export default router;
