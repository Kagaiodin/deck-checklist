#!/usr/bin/env bash
# PreToolUse(Bash): run build + tests before any `git push`; block on failure.
input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
cwd=${cwd:-${CLAUDE_PROJECT_DIR:-.}}
echo "$cmd" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+push([[:space:]]|$)' || exit 0
# Deleting a remote branch doesn't need a build.
echo "$cmd" | grep -Eq -- '--delete|[[:space:]]-d[[:space:]]|[[:space:]]:[^[:space:]]+' && exit 0
# Build and test the tree the push comes from (a worktree, not always the main checkout).
source "$(dirname "${BASH_SOURCE[0]}")/resolve-dir.sh"
cd "$(resolve_command_dir "$cmd" "$cwd")" || exit 0
out=$(npm run build 2>&1 && npm test 2>&1)
status=$?
if [ $status -ne 0 ]; then
  echo "Blocked: build/tests failed — fix before pushing." >&2
  echo "$out" | tail -25 >&2
  exit 2
fi
exit 0
