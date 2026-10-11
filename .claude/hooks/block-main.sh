#!/usr/bin/env bash
# PreToolUse(Bash): refuse `git commit` / `git push` while on main.
cmd=$(jq -r '.tool_input.command // ""')
echo "$cmd" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+(commit|push)([[:space:]]|$)' || exit 0
# A command that creates a branch first is fine even though HEAD is still main.
echo "$cmd" | grep -Eq 'git[[:space:]]+(checkout[[:space:]]+-b|switch[[:space:]]+-c)' && exit 0
branch=$(git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current 2>/dev/null)
if [ "$branch" = "main" ]; then
  echo "Blocked: never commit or push directly to main. Create a feat/ or fix/ branch first." >&2
  exit 2
fi
exit 0
