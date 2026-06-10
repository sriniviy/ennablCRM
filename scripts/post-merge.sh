#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Provision the blocked_domains table BEFORE the (drift-prone) schema push so the
# contact create/import hot path always has its table even if `push` fails.
pnpm --filter db run provision:blocked-domains
pnpm --filter db push
pnpm --filter db run migrate:stages
