#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
pnpm --filter db run migrate:stages
pnpm --filter db run provision:blocked-domains
