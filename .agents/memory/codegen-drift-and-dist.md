---
name: openapi codegen drift + project-reference dist staleness
description: Two traps when running orval codegen in this monorepo — silent field drops from openapi drift, and stale consuming-app types from skipping the lib build.
---

# OpenAPI codegen: drift drops fields, and orval-alone leaves stale dist

## Trap 1 — blind codegen silently DROPS genuinely-returned fields
`openapi.yaml` can lag behind what the backend actually returns. The committed
generated client may contain fields that openapi.yaml no longer declares (someone
edited a route + the old generated client, but never re-ran codegen). Running
`orval` then regenerates the client *from openapi.yaml* and REMOVES those fields,
breaking frontend pages that depend on them.

**Why:** the generated client is downstream of openapi.yaml only; the backend route
is a separate source of truth that can diverge.

**How to apply:** after any codegen run, `git diff` the generated client. For every
REMOVED field, confirm whether the backend route still returns it (grep the route).
If it does, the fix is to ADD the field to openapi.yaml (not to revert codegen),
then re-run. Real cases found: `ContactWithRelations.engagementOpens/engagementClicks`,
`CampaignWithStats.segmentId/builderBlocks/builderStep`.

## Trap 2 — `orval` alone does NOT refresh consuming-app types
`@workspace/api-client-react` `exports` points at `./src/index.ts`, so Vite/runtime
use fresh source immediately. BUT consuming apps (e.g. crm-flat) consume it as a TS
**project reference**, so `tsc` reads the built `dist/*.d.ts`, not the source. The
full codegen script runs `tsc --build` afterward; running bare `orval` skips it,
leaving stale `dist` → phantom "property does not exist" errors even though source
is correct.

**How to apply:** after codegen, rebuild the lib declarations
(`pnpm --filter @workspace/api-client-react exec tsc --build --force`) before
trusting a consuming app's `tsc --noEmit`. Prefer the full codegen script over bare
`orval`.

## Known pre-existing noise (not codegen-caused)
- `lib/api-zod` barrel double-exports `CompleteTaskBody`/`TrackEmailClickParams`
  (both `generated/api` and `generated/types`) → `typecheck:libs` fails structurally
  on HEAD. Unrelated to feature work.
- crm-flat pre-existing TS errors unrelated to api types: `company-detail.openDeals`,
  `sequence-detail` missing `Shield` import, `settings-*` (lastSync/password/ai-presets).
