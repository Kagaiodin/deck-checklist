---
name: implement-from-open-design
description: Implement a UI change from an Open Design artifact. Use when the user says to build, implement, or port a design from Open Design.
---

# Implement from an Open Design artifact

Default to reading the artifact from disk. The reason is token cost: Open Design's
`get_artifact` returns the entry file plus every referenced sibling in one call, which is
far more context than most changes need. A targeted local read is cheaper.

1. List available artifacts: `ls "$OPEN_DESIGN_ARTIFACTS"` (env var set in `.zshrc`).
2. Read only the file you need: `cat "$OPEN_DESIGN_ARTIFACTS/<filename>.html"`.
3. Check `docs/specs/<feature>-spec.md` and `<feature>-design-brief.md` for constraints.
4. Implement against existing tokens in `src/tokens.css`; don't copy the artifact's inline styles.

## MCP tools (open-design server)

- OK: `list_files` and `search_files` — small results, handy for finding a class or copy string.
- Avoid: `get_artifact` unless you genuinely need the whole sibling bundle.
- Never without asking: `start_run`, `create_*`, `write_file`, `delete_*`. Runs take 5–30
  minutes and design generation is a separate step from implementation.
- Don't run Open Design and Claude Code on the same problem simultaneously.
