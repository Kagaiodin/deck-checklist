#!/bin/sh
# Runs the real-browser Group-by-set check (scripts/e2e-set-grouping.ts). Starts the dev server if :5173 is not
# already listening, and stops it afterwards. Not part of `npm run verify` (needs a Playwright browser).
set -u
cd "$(dirname "$0")/.."

server_pid=""
if ! curl -sf -o /dev/null http://localhost:5173/; then
  npx vite --port 5173 --strictPort >/dev/null 2>&1 &
  server_pid=$!
  i=0
  until curl -sf -o /dev/null http://localhost:5173/; do
    i=$((i + 1))
    if [ "$i" -gt 60 ]; then echo "dev server did not start on :5173" >&2; kill "$server_pid" 2>/dev/null; exit 1; fi
    sleep 1
  done
fi

npx tsx scripts/e2e-set-grouping.ts "$@"
status=$?
[ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null
exit $status
