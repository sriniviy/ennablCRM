---
name: drizzle push drift
description: db push can be blocked by unrelated pending schema drift; workaround for additive columns
---

`pnpm --filter @workspace/db run push` (drizzle-kit push) can fail in this
environment with "Interactive prompts require a TTY terminal" when there is
pending schema drift unrelated to your change (observed: a pending
`users_auth_id_unique` unique constraint that prompts to truncate the users
table). `push-force` would auto-accept that destructive prompt — do NOT use it
for unrelated drift.

**Workaround for additive, non-destructive changes** (e.g. adding a column with
a default): apply the change directly with SQL and keep the drizzle schema as the
source of truth, e.g.
```
psql "$DATABASE_URL" -c "ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <col> <type> NOT NULL DEFAULT <expr>;"
```

**Why:** a plain additive column wouldn't normally prompt, but drizzle push
batches ALL drift into one interactive session, so unrelated destructive drift
blocks your safe change.

**How to apply:** when `db push` aborts on a TTY/destructive prompt that isn't
about your change, apply just your additive DDL via psql; leave the unrelated
drift for whoever owns it.
