---
name: Dashboard mutation authz
description: Access-control rules for dashboards/cards and the seeded-resource createdBy=null nuance
---

Dashboard and dashboard_card mutations use an **author-or-admin** policy with a
**builtin = read-only** override (consistent with the notes/attachments policy in
`delete-permission-policy.md`).

Rule (one `authorizeMutation(dashboard, user)` helper, applied to every mutate
endpoint — PATCH/DELETE dashboard, card create/update/delete, and cards/reorder):
- `builtin` dashboards → 403 (never editable, even by admin)
- `user.role === "ADMIN"` → allowed
- `dashboard.createdBy === user.id` → allowed
- otherwise → 403

**Why:** the original endpoints had no ownership check (IDOR). Card endpoints must
load the card → its parent dashboard, then authorize against the *parent* — there is
no per-card owner. `cards/reorder` takes a list, so resolve every distinct parent
dashboard and authorize each before writing.

**Non-obvious:** the seeded "Sales Dashboard (Master)" is `builtin:false` but
`createdBy:null`. Under author-or-admin that makes it **admin-only** to edit (null
never equals a user id). This is intentional — curated/seeded content should only be
changed by admins, not whoever happens to be looking at it.
