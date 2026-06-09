---
name: api-spec codegen pitfalls
description: Non-obvious failures when running `pnpm --filter @workspace/api-spec run codegen` (orval) in this monorepo.
---

## api-zod index barrel collision (recurs on every codegen)
After orval runs, `lib/api-zod/src/index.ts` is regenerated to:
```
export * from "./generated/api";
export * from './generated/types';
```
This breaks `typecheck:libs` with TS2308 duplicate-export errors (e.g. `CompleteTaskBody`, `TrackEmailClickParams`) because the zod consts in `./generated/api` collide with the TS types barrel `./generated/types`.

**Fix:** after any codegen, trim the file back to a single line: `export * from "./generated/api";`.
**Why:** the zod client (`generated/api.ts`) already exports everything api-server needs (it imports from package alias `l`). The types barrel is redundant and only adds collisions.
**How to apply:** the `codegen` npm script chains `orval && typecheck:libs`, so it will fail at the typecheck step. Run orval, restore index.ts to one line, then re-run typecheck. Expect to redo this every time codegen runs.

## openapi.yaml drifts from backend AND from the committed generated client
The committed generated client can be STALE relative to `openapi.yaml`; running codegen syncs them and surfaces latent frontend bugs.
Worse, `openapi.yaml` itself can be wrong vs the actual Express handler response.
**Example:** `ImportResult` spec said `{created, skipped:int, errors:[]}` but the real `/contacts/import` handler returns `{imported:int, skipped: {row,reason}[]}`. The frontend was written against the (correct) backend shape, masked by stale generated types.
**How to apply:** when codegen breaks the frontend, check the actual Express handler's `res.json(...)` to find the true shape, fix `openapi.yaml` to match the backend, regenerate — do NOT bend working frontend/backend to a wrong spec.
