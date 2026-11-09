#!/bin/sh
# Decides whether the contrast and a11y checks need to run (#216). They render the whole app with demo data, so any
# change can alter the screens except the files on the skip list below. Prints `true` or `false` on stdout; the reason
# goes to stderr.
#   sh scripts/needs-visual-checks.sh origin/main   # files changed on this branch since it left origin/main
#   git diff --name-only ... | sh scripts/needs-visual-checks.sh -   # judge a file list from stdin
# Fails open: a git error or an empty file list prints `true`, so a broken check never skips the gate.
# VISUAL_CHECKS_FORCE=true prints `true` without looking at the diff. CI (.github/workflows/ci.yml, `changes` job) sets
# it for pushes to main, manual runs and PRs labelled `run-visual`.
set -u

if [ "${VISUAL_CHECKS_FORCE:-}" = true ]; then
  echo "needs-visual-checks: VISUAL_CHECKS_FORCE=true; running the checks" >&2
  echo true; exit 0
fi

if [ "${1:-}" = "-" ]; then
  files=$(cat)
elif [ $# -eq 1 ]; then
  # --no-renames: a move from src/ to docs/ must list the src/ path too.
  if ! files=$(git diff --name-only --no-renames "$1...HEAD" 2>/dev/null); then
    echo "needs-visual-checks: git diff against $1 failed; running the checks" >&2
    echo true; exit 0
  fi
else
  echo "usage: $0 <base-ref> | $0 -" >&2; exit 2
fi

if [ -z "$files" ]; then
  echo "needs-visual-checks: no changed files; running the checks" >&2
  echo true; exit 0
fi

# In `case`, `*` also matches `/`, so `*.md` and `docs/*` cover nested paths.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    *.md | docs/* | .claude/*) ;;
    __tests__/* | */__tests__/* | src/test/* | vitest.config.*) ;;
    eslint-suppressions.json | .github/ISSUE_TEMPLATE/*) ;;
    *)
      echo "needs-visual-checks: $f can change the screens" >&2
      echo true; exit 0 ;;
  esac
done <<EOF
$files
EOF

echo "needs-visual-checks: only non-visual files changed; skipping" >&2
echo false
