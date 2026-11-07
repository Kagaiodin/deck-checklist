#!/usr/bin/env bash
# Tests block-main.sh against a throwaway repo + worktree. Run: npm run test:hooks
HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/block-main.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# Resolve symlinks (macOS /var -> /private/var) so cwd paths match git's.
T=$(cd "$T" && pwd -P)
git init -q -b main "$T/repo" && git -C "$T/repo" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
git -C "$T/repo" worktree add -q -b feature-x "$T/wt"
unset CLAUDE_PROJECT_DIR

fail=0
# check <name> <expected exit> <cwd> <command>
check() {
  local json code
  json=$(jq -n --arg c "$4" --arg d "$3" '{cwd:$d, tool_input:{command:$c}}')
  "$HOOK" <<<"$json" >/dev/null 2>&1; code=$?
  if [ "$code" = "$2" ]; then echo "PASS  $1"; else echo "FAIL  $1 (expected $2, got $code)"; fail=1; fi
}

check "worktree on feature branch, main checkout on main: commit allowed" 0 "$T/wt" 'git commit -m x'
check "worktree on feature branch: push allowed"                           0 "$T/wt" 'git push --force-with-lease origin feature-x'
check "commit on main blocked"                                             2 "$T/repo" 'git commit -m x'
check "bare push on main blocked"                                          2 "$T/repo" 'git push'
check "push origin main from feature branch blocked"                       2 "$T/wt" 'git push origin main'
check "push origin HEAD:main from feature branch blocked"                  2 "$T/wt" 'git push origin HEAD:main'
check "push origin --delete main blocked"                                  2 "$T/wt" 'git push origin --delete main'
check "push origin --delete feature-x from main allowed"                   0 "$T/repo" 'git push origin --delete feature-x'
check "push origin :feature-x from main allowed"                           0 "$T/repo" 'git push origin :feature-x'
check "checkout -b x && commit on main allowed"                            0 "$T/repo" 'git checkout -b x && git commit -m x'
check "non-git command allowed"                                            0 "$T/repo" 'ls -la'
check "cd <worktree> && commit from main cwd allowed"                      0 "$T/repo" "cd $T/wt && git commit -m x"
check "cd <relative main> && commit from worktree cwd blocked"             2 "$T/wt" 'cd ../repo && git commit -m x'
check "cd ../wt; push from main cwd allowed"                               0 "$T/repo" 'cd ../wt; git push origin feature-x'
exit $fail
