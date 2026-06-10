// Shared helpers for duplicate detection and record merging.

/**
 * A flat (id, key) pair. The `key` is namespaced with a type prefix such as
 * "name:acme" or "domain:acme.com" / "email:a@b.com". Keys that are shared by
 * more than one id indicate a potential duplicate relationship.
 */
export type DuplicateKeyRow = { id: string; key: string };

export type DuplicateGroup = {
  /** All record ids that belong to this candidate duplicate group. */
  ids: string[];
  /** The match reasons (key type prefixes) that link this group, e.g. ["name","domain"]. */
  matchedOn: string[];
};

/**
 * Groups records into candidate duplicate clusters using union-find over shared
 * keys. Only keys held by more than one distinct id contribute to a group, and
 * only clusters with more than one member are returned.
 */
export function computeDuplicateGroups(rows: DuplicateKeyRow[]): DuplicateGroup[] {
  const keyToIds = new Map<string, Set<string>>();
  for (const { id, key } of rows) {
    let set = keyToIds.get(key);
    if (!set) {
      set = new Set();
      keyToIds.set(key, set);
    }
    set.add(id);
  }

  const parent = new Map<string, string>();
  const ensure = (x: string) => {
    if (!parent.has(x)) parent.set(x, x);
  };
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur) as string;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b));
  };

  const dupKeys = [...keyToIds.entries()].filter(([, ids]) => ids.size > 1);
  for (const [, ids] of dupKeys) {
    const arr = [...ids];
    arr.forEach(ensure);
    for (let i = 1; i < arr.length; i++) union(arr[0], arr[i]);
  }

  const groups = new Map<string, Set<string>>();
  for (const id of parent.keys()) {
    const root = find(id);
    let set = groups.get(root);
    if (!set) {
      set = new Set();
      groups.set(root, set);
    }
    set.add(id);
  }

  const result: DuplicateGroup[] = [];
  for (const [root, ids] of groups) {
    if (ids.size < 2) continue;
    const types = new Set<string>();
    for (const [key, kids] of dupKeys) {
      const sample = [...kids][0];
      if (find(sample) === root) {
        const prefix = key.slice(0, key.indexOf(":"));
        if (prefix) types.add(prefix);
      }
    }
    result.push({ ids: [...ids], matchedOn: [...types] });
  }
  return result;
}

const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/**
 * Resolves a scalar field across a primary record and its losers. The primary
 * value wins when present; otherwise the first non-blank loser value back-fills.
 */
export function resolveScalar<T>(primary: T, losers: T[]): T {
  if (!isBlank(primary)) return primary;
  for (const v of losers) {
    if (!isBlank(v)) return v;
  }
  return primary;
}

/**
 * Unions multi-value array fields across primary + losers, preserving order and
 * removing duplicates (case-sensitive, trimmed-blank entries dropped).
 */
export function unionArrays(...lists: (string[] | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const item of list ?? []) {
      if (item == null) continue;
      if (typeof item === "string" && item.trim() === "") continue;
      if (seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/** OR semantics for boolean capability flags (true if any record is true). */
export function resolveBool(primary: boolean | null | undefined, losers: (boolean | null | undefined)[]): boolean {
  return Boolean(primary) || losers.some((v) => Boolean(v));
}

/**
 * Validates and normalizes a merge request body into { primaryId, loserIds }.
 * Throws an Error with a user-facing message when invalid.
 */
export function parseMergeInput(body: unknown): { primaryId: string; loserIds: string[] } {
  const b = (body ?? {}) as { primaryId?: unknown; mergeIds?: unknown };
  const primaryId = typeof b.primaryId === "string" ? b.primaryId.trim() : "";
  if (!primaryId) {
    throw new Error("primaryId is required");
  }
  const rawIds = Array.isArray(b.mergeIds) ? b.mergeIds : [];
  const loserIds = [
    ...new Set(
      rawIds
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter((x) => x && x !== primaryId),
    ),
  ];
  if (loserIds.length === 0) {
    throw new Error("mergeIds must contain at least one record to merge into the primary");
  }
  return { primaryId, loserIds };
}
