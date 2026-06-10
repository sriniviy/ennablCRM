---
name: api-zod codegen index quirk
description: Why api-zod's index.ts must stay a one-liner after running orval codegen
---

After running `pnpm --filter @workspace/api-spec run codegen` (orval, with `clean: true`),
`lib/api-zod/src/index.ts` gets regenerated to include both:
```
export * from "./generated/api";
export * from './generated/types';
```
These two re-export overlapping member names (e.g. `CompleteTaskBody`,
`TrackEmailClickParams`), so `typecheck:libs` (the second half of the `codegen`
script) fails with TS2308 "already exported a member named ...".

**Fix:** restore `lib/api-zod/src/index.ts` to just:
```
export * from "./generated/api";
```

**Why:** the committed index.ts is intentionally hand-trimmed to that single line.
orval re-adds the `./generated/types` export on every regeneration.

**How to apply:** any time you run api-spec codegen, re-check `git diff` on
`lib/api-zod/src/index.ts` and revert the extra `./generated/types` line before
relying on the libs typecheck. (api-client-react's index.ts is not affected.)
