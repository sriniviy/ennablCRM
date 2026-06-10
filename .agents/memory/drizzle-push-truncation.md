---
name: drizzle-push truncation hazard
description: Why drizzle-kit push is unsafe in this repo and the safe path for additive schema changes
---

# Never run drizzle-kit push/push-force in this repo

The live DB carries pre-existing schema drift, so `drizzle-kit push` compares the
whole schema and prompts to **truncate `users`** (and errors in the non-TTY shell).
`push-force` would auto-accept that and destroy data.

**Rule:** for additive schema changes (new table / nullable column), apply the
change with direct SQL (`executeSql`, `CREATE TABLE IF NOT EXISTS ...`) plus SQL
seeding — do not push. Keep the Drizzle schema source as the source of truth.

**Why:** a blind push is destructive given the existing drift.
**How to apply:** any task that adds to `lib/db/src/schema`. After editing schema
source, run `pnpm run typecheck:libs` so the composite build regenerates
`lib/db/dist` declarations (otherwise dependents fail to see the new export).
