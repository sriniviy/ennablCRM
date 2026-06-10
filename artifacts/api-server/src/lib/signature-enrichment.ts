import { db, companiesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { openai } from "./openai-client";

/**
 * Fields that can be derived from an email signature. Company is resolved to an
 * existing company id by name match; we never create new companies here.
 */
export type ParsedSignature = {
  title: string | null;
  phone: string | null;
  companyName: string | null;
};

const EMPTY: ParsedSignature = { title: null, phone: null, companyName: null };

function cleanString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : null;
}

/**
 * Parse a raw email body and extract job title, phone, and company name from the
 * sender's signature block, using the Replit AI integration. Returns nulls for
 * anything not confidently present. Never throws — on any error it degrades to
 * an empty result so contact creation never hard-fails because of enrichment.
 */
export async function parseSignature(
  emailBody?: string | null,
): Promise<ParsedSignature> {
  const body = (emailBody ?? "").trim();
  if (!body) return EMPTY;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "You extract contact details from the signature block of an email. " +
            "Return ONLY the sender's own job title, phone number, and company " +
            "name as they appear in their signature. Do not guess or infer " +
            "values that are not explicitly written. Respond with a single JSON " +
            'object: {"title": string|null, "phone": string|null, "companyName": string|null}. ' +
            "Use null for any field that is not clearly present.",
        },
        {
          role: "user",
          content: body.slice(0, 8000),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return EMPTY;

    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) return EMPTY;

    const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1)) as Record<
      string,
      unknown
    >;

    return {
      title: cleanString(parsed.title),
      phone: cleanString(parsed.phone),
      companyName: cleanString(parsed.companyName),
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Resolve a free-text company name from a signature to an existing company id by
 * case-insensitive exact name match. Returns null when there is no unambiguous
 * match (zero or multiple companies) — we never create companies from a guess.
 */
export async function resolveCompanyByName(
  companyName?: string | null,
): Promise<string | null> {
  const name = (companyName ?? "").trim();
  if (!name) return null;

  try {
    const rows = await db
      .select({ id: companiesTable.id })
      .from(companiesTable)
      .where(sql`lower(${companiesTable.name}) = lower(${name})`)
      .limit(2);

    return rows.length === 1 ? rows[0].id : null;
  } catch {
    return null;
  }
}
