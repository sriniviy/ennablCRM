---
name: api-zod codegen index clash
description: orval codegen re-introduces a duplicate-export line in lib/api-zod that breaks typecheck
---

After running `pnpm --filter @workspace/api-spec run codegen`, orval re-adds
`export * from './generated/types';` to `lib/api-zod/src/index.ts`. That clashes with
`export * from "./generated/api";` (both re-export the same names, e.g. `CompleteTaskBody`,
`TrackEmailClickParams`), producing duplicate-export TS errors in `typecheck:libs` and the
api-server build.

**Fix:** keep `lib/api-zod/src/index.ts` as a single line: `export * from "./generated/api";`

**Why:** the `api` barrel already re-exports the generated types; the extra `types` line is redundant.

**How to apply:** after any codegen run, re-check `lib/api-zod/src/index.ts` and remove the
re-added `./generated/types` export before typechecking.
