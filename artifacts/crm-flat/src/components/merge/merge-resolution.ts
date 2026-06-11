import type { CompanyDuplicateRecord, ContactDuplicateRecord } from "@workspace/api-client-react";

export type MergeFieldKind = "scalar" | "array" | "bool";

export interface MergeFieldDef<R> {
  key: string;
  label: string;
  kind: MergeFieldKind;
  value: (r: R) => unknown;
  format: (v: unknown) => string;
}

export interface MergeMetaDef<R> {
  label: string;
  value: (r: R) => string;
}

export interface MergeConfig<R> {
  entity: "company" | "contact";
  /** Singular label, e.g. "company". */
  noun: string;
  title: (r: R) => string;
  subtitle: (r: R) => string;
  fields: MergeFieldDef<R>[];
  meta: MergeMetaDef<R>[];
}

const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Mirrors the server merge logic so the dialog can preview the result. */
export function resolveField<R>(field: MergeFieldDef<R>, primary: R, losers: R[]): unknown {
  const pv = field.value(primary);
  if (field.kind === "scalar") {
    if (!isBlank(pv)) return pv;
    for (const l of losers) {
      const lv = field.value(l);
      if (!isBlank(lv)) return lv;
    }
    return pv;
  }
  if (field.kind === "bool") {
    return Boolean(pv) || losers.some((l) => Boolean(field.value(l)));
  }
  // array union, primary order first, de-duped, blanks dropped
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of [primary, ...losers]) {
    const list = field.value(r);
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item == null) continue;
      const s = String(item);
      if (s.trim() === "" || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

const dash = (v: unknown) => (isBlank(v) ? "—" : String(v));
const fmtArray = (v: unknown) => (Array.isArray(v) && v.length ? v.join(", ") : "—");
const fmtBool = (v: unknown) => (v ? "Yes" : "No");

export const companyMergeConfig: MergeConfig<CompanyDuplicateRecord> = {
  entity: "company",
  noun: "company",
  title: (c) => c.name,
  subtitle: (c) => c.domain ?? (c.domains?.[0] ?? ""),
  meta: [
    { label: "Contacts", value: (c) => String(c.contactCount ?? 0) },
    { label: "Deals", value: (c) => String(c.dealCount ?? 0) },
  ],
  fields: [
    { key: "name", label: "Name", kind: "scalar", value: (c) => c.name, format: dash },
    { key: "domain", label: "Primary domain", kind: "scalar", value: (c) => c.domain, format: dash },
    { key: "domains", label: "All domains", kind: "array", value: (c) => c.domains, format: fmtArray },
    { key: "status", label: "Status", kind: "scalar", value: (c) => c.status, format: (v) => (isBlank(v) ? "—" : String(v).replace(/_/g, " ")) },
    { key: "productLicensed", label: "Products licensed", kind: "array", value: (c) => c.productLicensed, format: fmtArray },
    { key: "memberOf", label: "Member of", kind: "array", value: (c) => c.memberOf, format: fmtArray },
    { key: "industry", label: "Industry", kind: "scalar", value: (c) => c.industry, format: dash },
    { key: "size", label: "Size", kind: "scalar", value: (c) => c.size, format: dash },
    { key: "estimatedAnnualRevenue", label: "Est. annual revenue", kind: "scalar", value: (c) => c.estimatedAnnualRevenue, format: dash },
    { key: "numberOfEmployees", label: "Employees", kind: "scalar", value: (c) => c.numberOfEmployees, format: dash },
    { key: "website", label: "Website", kind: "scalar", value: (c) => c.website, format: dash },
    { key: "phone", label: "Phone", kind: "scalar", value: (c) => c.phone, format: dash },
    { key: "address", label: "Address", kind: "scalar", value: (c) => c.address, format: dash },
    { key: "city", label: "City", kind: "scalar", value: (c) => c.city, format: dash },
    { key: "country", label: "Country", kind: "scalar", value: (c) => c.country, format: dash },
  ],
};

export const contactMergeConfig: MergeConfig<ContactDuplicateRecord> = {
  entity: "contact",
  noun: "contact",
  title: (c) => `${c.firstName} ${c.lastName}`.trim() || "(no name)",
  subtitle: (c) => c.email ?? (c.company?.name ?? ""),
  meta: [],
  fields: [
    { key: "firstName", label: "First name", kind: "scalar", value: (c) => c.firstName, format: dash },
    { key: "lastName", label: "Last name", kind: "scalar", value: (c) => c.lastName, format: dash },
    { key: "email", label: "Email", kind: "scalar", value: (c) => c.email, format: dash },
    { key: "phone", label: "Phone", kind: "scalar", value: (c) => c.phone, format: dash },
    { key: "title", label: "Title", kind: "scalar", value: (c) => c.title, format: dash },
    { key: "status", label: "Status", kind: "scalar", value: (c) => c.status, format: (v) => (isBlank(v) ? "—" : String(v).replace(/_/g, " ")) },
    { key: "company", label: "Company", kind: "scalar", value: (c) => c.company?.name, format: dash },
    { key: "tags", label: "Tags", kind: "array", value: (c) => c.tags, format: fmtArray },
    { key: "ennablUser", label: "Ennabl user", kind: "bool", value: (c) => c.ennablUser, format: fmtBool },
    { key: "emailMarketingContact", label: "Email marketing", kind: "bool", value: (c) => c.emailMarketingContact, format: fmtBool },
  ],
};
