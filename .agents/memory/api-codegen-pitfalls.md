---
name: API codegen pitfalls (orval)
description: Recurring breakages when running the OpenAPI codegen in lib/api-spec
---

# api-zod barrel must export only ./generated/api

After every `pnpm --filter @workspace/api-spec run codegen`, orval rewrites
`lib/api-zod/src/index.ts` to:
```
export * from "./generated/api";
export * from './generated/types';
```
The second line causes duplicate-export TS errors (e.g. `CompleteTaskBody`,
`TrackEmailClickParams`) and fails `typecheck:libs`.

**Rule:** reset `lib/api-zod/src/index.ts` to contain ONLY
`export * from "./generated/api";` after codegen, then re-run `pnpm -w run typecheck:libs`.

**Why:** the generated `types` and `api` modules re-declare some of the same names.
Only `health.ts` consumes api-zod, so dropping the types barrel is safe.

# Nullable enum columns in eq() filters

`eq(table.col, value as typeof table.$inferSelect["col"])` fails to typecheck
when the column is nullable (e.g. `companies.status`) because the cast type
includes `null`. Cast with `NonNullable<...>` instead. Non-null columns
(contacts.status/reviewStatus) don't need this.
