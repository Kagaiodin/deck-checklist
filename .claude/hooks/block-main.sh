#!/usr/bin/env bash
# PreToolUse(Bash): refuse `git commit` / `git push` while on main, and any push that targets main.
# The branch is read where the command runs (hook input `cwd`, or a leading `cd <dir> &&`),
# not from the main checkout, so git worktrees on feature branches pass.
input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
cwd=${cwd:-${CLAUDE_PROJECT_DIR:-.}}

grep -Eq '(^|[;&|[:space:]])git[[:space:]]+(commit|push)([[:space:]]|$)' <<<"$cmd" || exit 0
# A command that creates a branch first is fine even though HEAD is still main.
grep -Eq 'git[[:space:]]+(checkout[[:space:]]+-b|switch[[:space:]]+-c)' <<<"$cmd" && exit 0

source "$(dirname "${BASH_SOURCE[0]}")/resolve-dir.sh"
dir=$(resolve_command_dir "$cmd" "$cwd")
branch=$(git -C "$dir" branch --show-current 2>/dev/null)

block() {
  echo "Blocked: never commit or push directly to main. Create a feat/ or fix/ branch first." >&2
  exit 2
}

grep -Eq '(^|[;&|[:space:]])git[[:space:]]+commit([[:space:]]|$)' <<<"$cmd" && [ "$branch" = "main" ] && block

if grep -Eq '(^|[;&|[:space:]])git[[:space:]]+push([[:space:]]|$)' <<<"$cmd"; then
  # Pushing to main from anywhere: a word that is `main`, `refs/heads/main` or `<src>:main`
  # (`main:feature` pushes main TO feature, so it doesn't match). Covers `--delete origin main`.
  grep -Eq '(^|[[:space:]])([^[:space:]:]*:)?(refs/heads/)?main([[:space:]]|$|[;&|])' <<<"$cmd" && block
  # Deleting a non-main remote branch is cleanup, not a push to main.
  if grep -Eq -- '(^|[[:space:]])(--delete|-d)([[:space:]]|$)|[[:space:]]:[^[:space:]]+' <<<"$cmd"; then
    exit 0
  fi
  [ "$branch" = "main" ] && block
fi
exit 0
