---
name: Drizzle push TTY issue
description: drizzle push fails non-interactively; use executeSql via code_execution instead
---

`pnpm --filter @workspace/db run push` requires a TTY and interactive confirmation prompts — it hangs or fails when run non-interactively in the agent shell.

**Why:** Drizzle Studio and push commands prompt for approval before applying destructive schema changes.

**How to apply:** Always use `executeSql(...)` via the `code_execution` tool to create/alter tables. After schema file changes, rebuild the lib with `pnpm --filter @workspace/db exec tsc -p tsconfig.json` so the dist types are regenerated.
