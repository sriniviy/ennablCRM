---
name: TS project references & stale db types
description: Editing a shared lib's source can leave consumers typechecking against the old shape.
---

# Stale types after editing a referenced lib (e.g. lib/db)

Artifacts like `api-server` consume shared libs via TS **project references**
(`composite: true`, `references` in tsconfig). Consumers typecheck against the
referenced project's emitted declarations, not its live source.

**Rule:** after changing a referenced lib's source, refresh consumers with
`tsc --build` (walks references and rebuilds stale ones). Plain `tsc --noEmit`
does NOT, so it reports phantom "property does not exist" / insert-overload errors
against the pre-change shape. If still stale, delete the lib's
`tsconfig.tsbuildinfo` and rebuild.

**Why:** project-reference builds are incremental and keyed to the last emit.
