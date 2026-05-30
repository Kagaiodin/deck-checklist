# deck-checklist — Claude Instructions

## Testing

- All new work requires code coverage where a testing framework is available

## Design Workflow

- Tech specs go in `docs/specs/<feature>-spec.md`
- Design briefs go in `docs/specs/<feature>-design-brief.md`
- After receiving a design handoff, always read it via the **open-design MCP** before implementing — never implement from memory
- When implementing, call `get_artifact` for token CSS before hardcoding any color, spacing, or typography values

## CSS Structure

- `src/tokens.css` — all CSS custom properties: reset, `:root` (dark mode), light mode overrides, and accent variants. Import this first.
- `src/App.css` — component and layout styles (~2005 lines). See section index comment at the top of that file for line ranges.
