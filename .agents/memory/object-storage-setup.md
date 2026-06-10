---
name: Object storage setup in this monorepo
description: Key steps and gotchas for setting up Replit object storage (GCS presigned URL flow)
---

## Setup sequence that works

1. `setupObjectStorage()` via code_execution — idempotent, sets env vars.
2. Copy template files: `objectStorage.ts`, `objectAcl.ts`, `storage.ts` from `.local/skills/object-storage/templates/`.
3. Install GCS deps in api-server: `pnpm --filter @workspace/api-server add @google-cloud/storage google-auth-library`.
4. Copy client lib: `cp -r .local/skills/object-storage/templates/lib/object-storage-web/* lib/object-storage-web/`.
5. Fix `lib/object-storage-web/tsconfig.json` — add `composite: true, declarationMap: true, emitDeclarationOnly: true` (the template ships without these; the lib won't work as a TS project reference without them).
6. Add `{ "path": "./lib/object-storage-web" }` to root `tsconfig.json` references and to `artifacts/crm/tsconfig.json` references.
7. Add `"@workspace/object-storage-web": "workspace:*"` to the crm `package.json` dependencies.
8. Add storage paths to `lib/api-spec/openapi.yaml`; run codegen.
9. Wire `storageRouter` in `artifacts/api-server/src/routes/index.ts`.

## React 19 note
The project uses React 19 — Uppy's `react@>=19` peer dep is already satisfied. No pnpm overrides needed (the `$react` shorthand errors anyway if react isn't a direct root dep).

## objectStorage.ts cast fix
The template's `response.json()` returns `unknown`, causing TS2339. Cast it:
```ts
const { signed_url: signedURL } = (await response.json()) as { signed_url: string };
```

**Why:** Template was written for a looser tsconfig. This project uses strict mode.
