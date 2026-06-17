#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Kill any leftover processes on our ports
lsof -ti:4000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

echo "Building API server..."
cd "$ROOT/artifacts/api-server"
node ./build.mjs

echo "Starting API server on http://localhost:4000 ..."
node --env-file=.env --enable-source-maps ./dist/index.mjs &
API_PID=$!

echo "Waiting for API to start..."
sleep 3

echo "Starting CRM frontend on http://localhost:3000 ..."
cd "$ROOT/artifacts/crm-flat"
PORT=3000 BASE_PATH=/ pnpm run dev &
FRONTEND_PID=$!

sleep 3
echo ""
echo "✓ CRM is running at http://localhost:3000"
echo "  Press Ctrl+C to stop both servers."
echo ""

trap "kill $API_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
