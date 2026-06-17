---
name: api-server .env startup crash
description: Why the api-server can fail to boot in Replit (and cause frontend 502s on login/API calls)
---

# api-server `--env-file` startup crash

The api-server `start` script must use `node --env-file-if-exists=.env`, NOT `node --env-file=.env`.

**Why:** In the Replit workspace there is no `.env` file (secrets like DATABASE_URL,
BETTER_AUTH_SECRET are injected into the workflow process directly). Node 24's
`--env-file=.env` hard-errors ("`.env`: not found", exit 9) when the file is absent,
so the api-server never boots. The frontend then shows 502 Bad Gateway on every
`/api/...` call (the crm-flat vite dev server proxies `/api` -> http://localhost:4000),
which presents to the user as "login doesn't work".

**How to apply:** If login/API suddenly 502s, first check the api-server workflow is
actually running. Merges from the subrepl remote have reintroduced `--env-file=.env`
in `artifacts/api-server/package.json` before — re-check that line after any merge.
`--env-file-if-exists` loads `.env` for local dev if present and falls back to the
injected env otherwise.
