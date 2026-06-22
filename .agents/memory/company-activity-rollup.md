---
name: company activity/notes rollup
description: Why company views must roll up deal/contact activities, and where the rollup condition lives.
---

# Company activity & notes must roll up from deals and contacts

Notes/activities are stored in `activities` with independent FK columns
(`companyId`, `dealId`, `contactId`), and a note typically sets only ONE of them.
A note logged against a deal has `dealId` set and `companyId` null. So a company
view that filters `activities.companyId = X` strictly will NOT show notes that
belong to the company's deals or contacts.

**Rule:** any company-scoped activity query must roll up:
`OR(activities.companyId = X, activities.dealId IN deals(company=X), activities.contactId IN contacts(company=X))`.

**Why:** users expect a company page to be a single pane showing everything related
to that company (its deals' and contacts' notes/activity), not just items tagged
directly to the company. Reported bug: deal note invisible on the linked company.

**How to apply:** both the company NotesFeed and the activities timeline in
crm-flat hit `GET /api/activities?companyId=...` (and `/export`). The rollup lives
in `activities.ts` as `companyScopeCondition(companyId)` and must be applied to
BOTH the list and export handlers to keep on-screen notes and CSV export in parity.
Build it with drizzle `or`/`inArray` + subqueries (parameter-bound, no string
interpolation). `contactId`/`dealId` filters still compose via AND, so direct
deal/contact views remain narrow.
