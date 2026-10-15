---
name: implement-from-open-design
description: Implement a UI change from an Open Design artifact. Use when the user says to build, implement, or port a design from Open Design.
---

# Implement from an Open Design artifact

Open Design (OD) is a separate design tool. Claude Code reads its output from disk; it does
not drive OD through MCP.

1. List available artifacts: `ls "$OPEN_DESIGN_ARTIFACTS"` (env var set in `.zshrc`).
2. Read the target file directly: `cat "$OPEN_DESIGN_ARTIFACTS/<filename>.html"`. Do not
   pull artifacts via MCP.
3. Check `docs/specs/<feature>-spec.md` and `<feature>-design-brief.md` for constraints.
4. Implement against existing tokens in `src/tokens.css`; don't copy the artifact's inline styles.
5. Don't run OD and Claude Code on the same problem simultaneously.
