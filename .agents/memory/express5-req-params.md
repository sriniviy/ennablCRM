---
name: Express 5 req.params typing
description: Why route param access needs an explicit string cast in artifacts/api-server.
---

In this api-server (Express 5 + @types), `req.params.x` and destructured `const { x } = req.params` are typed `string | string[]`, NOT `string`.
Passing them directly into drizzle `eq(table.id, x)` or string-only functions (e.g. clerk SDK calls) fails typecheck with overload/`never` errors.

**Fix / convention:** cast at the access site, e.g. `const id = req.params.id as string;` or `eq(table.id, req.params.id as string)`. This matches the existing pattern in `companies.ts`.
**Why:** without the cast the whole monorepo `typecheck` is red; this was already broken across team.ts/sequences.ts/scheduled-exports.ts/notes.ts at one point.
**How to apply:** whenever adding a route handler that reads path params, add `as string` (or cast into a typed local) before using the value.
