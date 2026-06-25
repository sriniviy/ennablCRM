#!/bin/bash
# Start both local dev servers (API + frontend)
# Usage: ./scripts/start-local.sh

REPO="$(cd "$(dirname "$0")/.." && pwd)"

# Kill any existing instances
pkill -f "dist/index.mjs" 2>/dev/null || true
pkill -f "vite.*vite.config.ts" 2>/dev/null || true
sleep 1

# Start API server
echo "Starting API server on :4000..."
cd "$REPO/artifacts/api-server"
node --env-file=.env dist/index.mjs &
API_PID=$!

# Start Vite frontend
echo "Starting frontend on :3000..."
cd "$REPO/artifacts/crm-flat"
node --env-file=.env ./node_modules/vite/bin/vite.js --config vite.config.ts --host 0.0.0.0 &
VITE_PID=$!

sleep 3

# Verify both are up
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q "200"; then
  echo "✓ Frontend: http://localhost:3000"
else
  echo "✗ Frontend failed to start"
fi

if curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/companies | grep -qE "200|401"; then
  echo "✓ API: http://localhost:4000"
else
  echo "✗ API failed to start"
fi

echo "PIDs: API=$API_PID  Vite=$VITE_PID"
echo "To stop: pkill -f 'dist/index.mjs'; pkill -f 'vite.*vite.config'"
