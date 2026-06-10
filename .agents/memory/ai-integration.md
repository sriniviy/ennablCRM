---
name: AI integration decisions
description: Durable conventions for how AI features are wired in this CRM.
---

# AI integration decisions

- AI endpoints intentionally **bypass the OpenAPI codegen client**. The frontend calls
  them with an authenticated raw `fetch` (`import.meta.env.BASE_URL` + `useSessionToken()`),
  not `@workspace/api-client-react` hooks.
  **Why:** keeps AI-only endpoints out of the OpenAPI spec/codegen pipeline; matches the
  original `ai-suggestions` precedent. **How to apply:** add the route, then call it from
  the frontend with a plain authenticated fetch — don't regenerate the client.

- The server uses Replit's AI Integrations proxy (no user key) via the shared `openai`
  client. It throws on import if its env vars are missing, so a clean server start proves
  the credentials exist — no need to test connectivity separately.

- Email "threads" are grouped by a metadata thread id, but the key is **not normalized**:
  it may be `metadata.threadId` or `metadata.thread_id`. Any thread query must match BOTH
  (e.g. `coalesce(metadata->>'threadId', metadata->>'thread_id')`), or threaded logic
  silently degrades to single-message handling.
