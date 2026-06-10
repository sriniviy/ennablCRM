import { db, companiesTable, blockedDomainsTable } from "@workspace/db";
import { eq, or, sql } from "drizzle-orm";

export const INTERNAL_DOMAINS = ["ennabl.com"];

export const DEFAULT_FREE_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "zoho.com",
  "yandex.com",
  "mail.com",
  "fastmail.com",
];

export type ReviewStatusFlag = "AUTO_CREATED" | "REVIEWED";

export type ContactMatchResult = {
  /** Resolved company id when exactly one company matches the domain, else null. */
  companyId: string | null;
  /** Suggested review status; null when there is no email to evaluate. */
  reviewStatus: ReviewStatusFlag | null;
  /** True when the address belongs to an internal (@ennabl.com) domain. */
  isInternal: boolean;
  /** True when the domain is in the free/public email blocklist. */
  isFreeDomain: boolean;
  /** Number of companies whose primary or secondary domain matched. */
  matchCount: number;
};

const EMPTY_RESULT: ContactMatchResult = {
  companyId: null,
  reviewStatus: null,
  isInternal: false,
  isFreeDomain: false,
  matchCount: 0,
};

export function extractEmailDomain(email?: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

export function isInternalDomain(domain: string): boolean {
  return INTERNAL_DOMAINS.includes(domain.toLowerCase());
}

/**
 * Load the set of free/public email domains from the editable blocklist table.
 * Falls back to the built-in defaults when the table has not been seeded.
 */
export async function loadBlockedDomains(): Promise<Set<string>> {
  const rows = await db
    .select({ domain: blockedDomainsTable.domain })
    .from(blockedDomainsTable);
  const set = new Set(rows.map((r) => r.domain.toLowerCase()));
  if (set.size === 0) {
    for (const d of DEFAULT_FREE_EMAIL_DOMAINS) set.add(d);
  }
  return set;
}

/**
 * Build an in-memory index of domain -> matching company ids, covering both the
 * primary `domain` column and the `domains` (secondary) array. Use for bulk
 * matching (e.g. CSV import) to avoid a query per row.
 */
export async function buildCompanyDomainIndex(): Promise<Map<string, string[]>> {
  const rows = await db
    .select({
      id: companiesTable.id,
      domain: companiesTable.domain,
      domains: companiesTable.domains,
    })
    .from(companiesTable);

  const index = new Map<string, string[]>();
  const add = (d: string | null | undefined, id: string) => {
    if (!d) return;
    const key = d.trim().toLowerCase();
    if (!key) return;
    const arr = index.get(key) ?? [];
    if (!arr.includes(id)) arr.push(id);
    index.set(key, arr);
  };

  for (const r of rows) {
    add(r.domain, r.id);
    for (const sec of r.domains ?? []) add(sec, r.id);
  }
  return index;
}

function matchFromCandidates(
  domain: string,
  blockedDomains: Set<string>,
  candidateIds: string[],
): ContactMatchResult {
  if (isInternalDomain(domain)) {
    return { ...EMPTY_RESULT, isInternal: true };
  }
  if (blockedDomains.has(domain)) {
    return { ...EMPTY_RESULT, isFreeDomain: true, reviewStatus: "AUTO_CREATED" };
  }
  if (candidateIds.length === 1) {
    return {
      ...EMPTY_RESULT,
      companyId: candidateIds[0],
      reviewStatus: "REVIEWED",
      matchCount: 1,
    };
  }
  // Zero or multiple matches: flag for review rather than guessing.
  return { ...EMPTY_RESULT, reviewStatus: "AUTO_CREATED", matchCount: candidateIds.length };
}

/**
 * Pure matcher for bulk flows. Pass a prebuilt domain index and blocklist.
 */
export function matchContactCompany(
  email: string | null | undefined,
  opts: { domainIndex: Map<string, string[]>; blockedDomains: Set<string> },
): ContactMatchResult {
  const domain = extractEmailDomain(email);
  if (!domain) return { ...EMPTY_RESULT };
  const candidateIds = opts.domainIndex.get(domain) ?? [];
  return matchFromCandidates(domain, opts.blockedDomains, candidateIds);
}

/**
 * Resolve the company + review status for a single email. Loads the blocklist
 * (unless provided) and runs a targeted company lookup by primary/secondary domain.
 */
export async function resolveContactCompany(
  email?: string | null,
  blockedDomains?: Set<string>,
): Promise<ContactMatchResult> {
  const domain = extractEmailDomain(email);
  if (!domain) return { ...EMPTY_RESULT };

  if (isInternalDomain(domain)) {
    return { ...EMPTY_RESULT, isInternal: true };
  }

  const blocked = blockedDomains ?? (await loadBlockedDomains());
  if (blocked.has(domain)) {
    return { ...EMPTY_RESULT, isFreeDomain: true, reviewStatus: "AUTO_CREATED" };
  }

  const rows = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(
      or(
        eq(companiesTable.domain, domain),
        sql`${companiesTable.domains} @> ARRAY[${domain}]::text[]`,
      ),
    );

  return matchFromCandidates(domain, blocked, rows.map((r) => r.id));
}
