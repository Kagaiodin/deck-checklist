# deck-checklist — Claude Instructions

## Testing

- All new work requires code coverage where a testing framework is available

## Design Workflow

- Tech specs go in `docs/specs/<feature>-spec.md`
- Design briefs go in `docs/specs/<feature>-design-brief.md`
- After receiving a design handoff, always read it via the **open-design MCP** before implementing — never implement from memory
- When implementing, call `get_artifact` for token CSS before hardcoding any color, spacing, or typography values
