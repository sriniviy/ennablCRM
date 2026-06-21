---
name: crm-flat e2e auth provisioning
description: Why browser e2e tests of crm-flat hit 403 "Account not provisioned" and how the auth/users link actually works.
---

# crm-flat e2e auth provisioning

crm-flat uses better-auth (email/password, autoSignIn, no email verification) in
its own `ba_user`/`ba_account`/`ba_session` tables, SEPARATE from the app's
`users` table. `requireAuth` only authorizes a session if a row in `users`
matches the session by `auth_id` OR `email`; otherwise it returns
403 "Account not provisioned" (it auto-provisions only when `users` is empty —
the bootstrap-first-user path).

**Why e2e tests keep failing:** signing up a brand-new email creates a `ba_user`
but no `users` row, so every authed API call 403s. Pre-inserting a `users` row
with the signup email *should* link on first request, but test runs repeatedly
failed to get past 403 — the practical blocker is keeping the DB-inserted email
byte-identical to the signup email (nanoid generated twice drifts), and
better-auth lowercases emails. Seeded users (alice@acme.com, etc.) exist in
`users` but have NO password set, so you cannot just sign in as them.

**How to apply:** to test an authed crm-flat flow in the browser, use a FIXED
lowercase email (no nanoid), `[DB] insert into users (email, role) values
('fixed@example.com','ADMIN')` with that exact string, then sign up with the
identical email. Clean up afterward: delete from `users`, then `ba_account`/
`ba_session`/`ba_user` for that email. For pure data/SQL correctness (e.g.
dashboard query engine output), skip the browser entirely and run the aggregate
via executeSql — far more reliable than fighting auth.
