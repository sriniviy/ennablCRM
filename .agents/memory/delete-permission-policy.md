---
name: Delete & admin permission policy
description: Which destructive CRM actions are admin-only vs ownership-based, and the non-obvious merge-as-delete bypass.
---

# Delete & admin permission policy (CRM)

Phase 1 PRD rule: everyone can see/edit everything; only admins delete records and manage users.

## How it actually maps in code
- **Hard delete (DELETE /:id) is admin-only** for companies, contacts, deals, tasks, custom-fields — enforced with `requireAdmin` middleware (`artifacts/api-server/src/middlewares/requireAuth.ts`).
- **Activities have no delete route at all** — non-admin-can't-delete is trivially satisfied.
- **Notes and attachments deliberately use an author-or-admin ownership model**, NOT admin-only. A non-admin can delete their own note/attachment. This is intentional and backed by a dedicated backlog task ("Only show the delete button on your own notes"). Treat this as an approved exception to the literal "only admins delete records" wording — do not "fix" notes/attachments to admin-only without product sign-off.

## Non-obvious bypass: merge == delete
**`POST /contacts/merge` and `POST /companies/merge` run `tx.delete(...)` on the loser records.** They are destructive deletes wearing a different name. They must carry `requireAdmin` (not just `requireAuth`), and the client merge entry points ("Find duplicates" / "Merge duplicates") must be gated by `isAdmin`.

**Why:** without admin gating, any authenticated non-admin could delete records via merge, silently bypassing the admin-only delete gate.

**How to apply:** when auditing delete permissions, don't only grep `router.delete`. Any endpoint that calls `tx.delete` / `db.delete` (merge, bulk ops, cascade cleanups) is a delete path and needs the same authz as a direct delete.

## Client role gating pattern
`const { data: me } = useGetMe(); const isAdmin = me?.role === "ADMIN";` then wrap destructive controls in `{isAdmin && (...)}`. Roles are `ADMIN` | `MEMBER`.
