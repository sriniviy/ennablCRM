---
name: lib/db rebuild pattern
description: After schema changes, must rebuild lib/db before api-server can typecheck
---

Any time a new table or export is added to `lib/db/src/schema/`, run:

```bash
pnpm --filter @workspace/db exec tsc -p tsconfig.json
```

This regenerates `dist/*.d.ts` so downstream packages (api-server, crm) can resolve the new types.

**Why:** The monorepo uses project references (composite: true). TypeScript resolves `@workspace/db` from the compiled `dist/` output, not the source `src/`. Stale dist means new exports are invisible.

**How to apply:** Always run this after editing any file in `lib/db/src/schema/`, before running typecheck on api-server or crm.
