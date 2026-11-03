#!/bin/sh
# Accessibility gate (axe-core, WCAG 2.2 AA; see docs/specs/a11y-gate-spec.md). Starts the dev server if needed and
# runs the screenshot script with --a11y-gate on dark indigo (most rules are theme-independent; contrast has its own gate).
#   sh scripts/a11y-gate.sh                    # gate
#   sh scripts/a11y-gate.sh --update-baseline  # rewrite scripts/a11y-baseline.json from the current violations
set -u
cd "$(dirname "$0")/.."

flag=--a11y-gate
[ "${1:-}" = "--update-baseline" ] && flag=--a11y-update-baseline

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

npx tsx scripts/capture-screenshots.ts --local --theme dark --accent indigo "$flag" --headless --out "${TMPDIR:-/tmp}/a11y-gate"
status=$?

[ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null
exit $status
