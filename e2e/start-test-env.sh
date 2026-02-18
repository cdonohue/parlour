#!/bin/bash
set -e

SERVER_PORT=5198
VITE_PORT=5199

cleanup() {
  kill $SERVER_PID $VITE_PID 2>/dev/null || true
}
trap cleanup EXIT

cd "$(dirname "$0")/.."

bun run packages/server/src/main.ts --port $SERVER_PORT &
SERVER_PID=$!

for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:$SERVER_PORT/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

VITE_SERVER_PORT=$SERVER_PORT bunx vite --config packages/app/vite.config.ts --port $VITE_PORT &
VITE_PID=$!

wait
