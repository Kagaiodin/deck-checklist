#!/bin/sh
# Text-contrast gate (DL-CONTRAST-01). Starts the dev server, runs the screenshot script with --contrast-gate for
# each theme × accent, and exits non-zero if any text pair is under AA or a shot failed.
#   sh scripts/contrast-gate.sh                  # dark indigo, light indigo, dark ember, light sapphire
#   sh scripts/contrast-gate.sh light sapphire   # one combination (CI runs one per matrix job)
# If a dev server is already listening on :5173 it is reused and left running.
set -u
cd "$(dirname "$0")/.."

if [ $# -ge 2 ]; then combos="$1:$2"; else combos="dark:indigo light:indigo dark:ember light:sapphire"; fi

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

status=0
for combo in $combos; do
  mode=${combo%:*}; accent=${combo#*:}
  echo "── contrast: $mode $accent"
  npx tsx scripts/capture-screenshots.ts --local --theme "$mode" --accent "$accent" \
    --contrast-gate --headless --out "${TMPDIR:-/tmp}/contrast-gate/$mode-$accent" || status=1
done

[ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null
exit $status
