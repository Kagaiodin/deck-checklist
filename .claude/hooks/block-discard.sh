#!/usr/bin/env bash
# PreToolUse(Bash): refuse `git checkout <path>` / `git restore <path>` when that path has
# uncommitted changes. Those commands overwrite the working tree with no undo, the per-file
# twin of `git reset --hard` (denied in settings.json). Branch switches and
# `git restore --staged` (unstage only) pass through.
input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
cwd=$(jq -r '.cwd // ""' <<<"$input")
cd "${cwd:-${CLAUDE_PROJECT_DIR:-.}}" 2>/dev/null || exit 0

grep -Eq 'git[[:space:]]+(checkout|restore)([[:space:]]|$)' <<<"$cmd" || exit 0

# One simple command per line, so `a; git checkout f; b` is checked piece by piece.
segments=$(sed -E 's/(\&\&|\|\||;|\|)/\n/g' <<<"$cmd")

dirty=()
while IFS= read -r seg; do
  read -ra words <<<"$seg"
  # Find `git checkout|restore` inside the segment (it may follow `cd x &&` or env vars).
  i=0; sub=""
  while [ $i -lt ${#words[@]} ]; do
    if [ "${words[$i]}" = "git" ] && { [ "${words[$((i+1))]}" = "checkout" ] || [ "${words[$((i+1))]}" = "restore" ]; }; then
      sub=${words[$((i+1))]}; i=$((i+2)); break
    fi
    i=$((i+1))
  done
  [ -n "$sub" ] || continue

  paths=(); after_dd=0; staged_only=0; worktree=0; creates_branch=0
  for w in "${words[@]:$i}"; do
    case "$w" in
      *">"*|*"<"*) continue ;;                      # redirections like 2>/dev/null
      --) after_dd=1; continue ;;
    esac
    if [ $after_dd -eq 0 ]; then
      case "$w" in
        -b|-B|--orphan|-c|-C) creates_branch=1 ;;
        --staged|-S) staged_only=1 ;;
        --worktree|-W) worktree=1 ;;
        -*) ;;
        *)
          if [ "$sub" = "checkout" ]; then
            # Without `--`, a ref is a branch switch; only words naming files are paths.
            [ -e "$w" ] && ! git rev-parse --verify --quiet "$w^{commit}" >/dev/null && paths+=("$w")
          else
            paths+=("$w")
          fi ;;
      esac
    else
      paths+=("$w")
    fi
  done
  [ $creates_branch -eq 1 ] && continue
  [ "$sub" = "restore" ] && [ $staged_only -eq 1 ] && [ $worktree -eq 0 ] && continue

  for p in "${paths[@]}"; do
    changed=$(git status --porcelain --untracked-files=no -- "$p" 2>/dev/null)
    [ -n "$changed" ] && dirty+=("$p")
  done
done <<<"$segments"

[ ${#dirty[@]} -eq 0 ] && exit 0
{
  echo "Blocked: git ${sub} would discard uncommitted changes in: ${dirty[*]}"
  echo "Commit or stash them first. To run something against older code, use \`git stash\` (then \`git stash pop\`),"
  echo "or a worktree: \`git worktree add ../old HEAD~1\`."
} >&2
exit 2
