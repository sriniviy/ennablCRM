---
name: Better Auth migration quirks
description: Lessons from migrating Clerk → Better Auth in the pnpm monorepo
---

## Drizzle-orm dual-variant TypeScript conflict

**The rule:** When better-auth is added to api-server and brings in kysely as a peer dep, pnpm creates two virtual drizzle-orm packages: one with kysely and one without. TypeScript sees SQL<unknown> types from each as incompatible.

**Why:** pnpm resolves drizzle-orm based on its optional peer deps (kysely). api-server gets the kysely variant; lib/db gets the non-kysely variant (since kysely wasn't in its deps). This makes `db` and `eq` from different virtual packages — TypeScript rejects them.

**How to apply:** Add `kysely` as a dependency to BOTH api-server AND lib/db. Then clean-rebuild lib/db (`rm -f tsconfig.tsbuildinfo && rm -rf dist && npx tsc -p tsconfig.json`). This forces both packages onto the same kysely-variant drizzle-orm. Also remove lib/db build cache first to avoid stale incremental artifacts.

## Missing runtime dep

**The rule:** better-auth requires `@opentelemetry/semantic-conventions` at runtime (not just types). It's not automatically installed.

**How to apply:** `pnpm add -F @workspace/api-server @opentelemetry/semantic-conventions`

## Clerk CSS cleanup

**The rule:** Removing @clerk/themes package does NOT automatically clean `@layer clerk` and `@import "@clerk/themes/shadcn.css"` from index.css. Vite will throw a 500 error until the CSS import is manually removed.
