#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Provision the blocked_domains table BEFORE the (drift-prone) schema push so the
# contact create/import hot path always has its table even if `push` fails.
pnpm --filter db run provision:blocked-domains
# Use push-force (non-interactive): plain `push` blocks on a TTY confirmation
# prompt (e.g. unique-constraint truncate) which hangs when stdin is closed.
pnpm --filter db run push-force
pnpm --filter db run migrate:stages
