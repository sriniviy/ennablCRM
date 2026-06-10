---
name: merge handler ordering
description: correct statement order inside record-merge transactions to avoid FK and unique-constraint failures
---

When merging duplicate records (primary survives, losers deleted) inside one transaction, order matters:

1. **Re-point related rows** from losers to the primary FIRST (deals, tasks, activities, notes, bridge tables). Must precede deletion to satisfy FK references.
2. **Delete loser rows** next.
3. **Update the primary LAST**, applying merged/back-filled fields.

**Why:** if the primary update runs before loser deletion, back-filling a blank primary unique field (e.g. `contacts.email`, `companies.domain`) from a loser that still exists triggers a unique-constraint violation and aborts the whole transaction. Deleting losers first frees the unique value.

**How to apply:** any new merge handler (or new related table) must keep this re-point → delete → update-primary order. Bridge tables with their own UNIQUE constraints (e.g. campaign_contacts UNIQUE(campaign_id, contact_id)) need their own dedupe before re-pointing: drop loser rows whose key the primary already covers, then keep the lowest-id loser per key, then re-point.
