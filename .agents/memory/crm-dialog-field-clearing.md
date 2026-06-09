---
name: CRM dialog optional-field clearing
description: When edit dialogs may clear an optional FK/enum, send null on PATCH (undefined is a no-op)
---

CRM entity dialogs (company/contact/deal) build a single `data` object using the
undefined-omit convention for optional fields (`x || undefined`). This works for
CREATE (Create*Input types only allow `string | undefined`).

**Rule:** For any optional field exposed in the edit dialog with an explicit
"None"/"Unassigned" option (e.g. company `assignedCsmId`, `status`), the edit/PATCH
path must send `null` — not `undefined` — when the user picks the empty option.

**Why:** The backend PATCH handlers spread `req.body` into a Drizzle `.set()`. An
omitted (`undefined`) key is a no-op, so the old value persists and the field can
never be cleared once set. `Update*Input` types allow `string | null`, so null is
valid; `Create*Input` does not, so keep `undefined` for create.

**How to apply:** Keep the shared `data` object with `undefined` for create, then in
the `isEdit` branch override just that field, e.g.
`const updateData = { ...data, assignedCsmId: sel === "none" ? null : sel };`.
