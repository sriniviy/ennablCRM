import type { AuditAction } from "@workspace/api-client-react";

export const OBJECT_TYPE_LABELS: Record<string, string> = {
  company: "Company",
  contact: "Contact",
  deal: "Deal",
  activity: "Activity",
};

export const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  UPDATE: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  MERGE: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

const HIDDEN_FIELDS = new Set(["id", "updatedAt", "createdAt"]);

export function formatFieldName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\bId\b/, "ID")
    .trim();
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  const str = String(value);
  return str.length > 120 ? `${str.slice(0, 117)}…` : str;
}

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

type Changes = { [key: string]: unknown } | null | undefined;

export function extractDiff(changes: Changes): FieldChange[] {
  if (!changes || typeof changes !== "object") return [];
  const diff = (changes as Record<string, unknown>).diff;
  if (!diff || typeof diff !== "object") return [];
  return Object.entries(diff as Record<string, { from: unknown; to: unknown }>)
    .filter(([field]) => !HIDDEN_FIELDS.has(field))
    .map(([field, { from, to }]) => ({ field, from, to }));
}

export function changeSummary(action: AuditAction, changes: Changes): string {
  if (action === "UPDATE") {
    const diff = extractDiff(changes);
    if (diff.length === 0) return "No tracked field changes";
    if (diff.length <= 3) return diff.map((d) => formatFieldName(d.field)).join(", ");
    return `${diff.length} fields changed`;
  }
  if (action === "CREATE") return "Record created";
  if (action === "DELETE") return "Record deleted";
  if (action === "MERGE") return "Records merged";
  return "";
}
