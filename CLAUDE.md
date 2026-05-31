# deck-checklist — Claude Instructions

## Project
- React/TypeScript app for Magic: The Gathering deck management and card checklists
- Deployed on Cloudflare Workers — do not break Workers compatibility
- State managed via DeckProvider (src/store/)
- Entry point: src/App.tsx

## Testing
- Runner: Vitest — `npm test` / `npm run test:watch` / `npm run test:coverage`
- Environment: jsdom (separate from vite.config.ts — do not merge configs)
- Component testing: @testing-library/react + @testing-library/user-event
- Matchers: @testing-library/jest-dom (globally imported via src/test/setup.ts)
- Coverage: @vitest/coverage-v8

## Test requirements
- All new utils → test file in src/utils/__tests__/
- All new store logic → test file in src/store/__tests__/
- All new components with user interaction → test file co-located in 
  src/features/<feature>/__tests__/
- All new hooks → test file co-located with the hook's feature folder
- npm run test:coverage must pass before committing any new feature
- Never skip tests because the code "seems simple" — check existing test 
  files for pattern reference before writing new ones

## Test file reference
- src/utils/__tests__/ — parser, CSV parser, validator, carrier, dualface, deck utils
- src/store/__tests__/ — DeckProvider, decks store  
- src/features/card-purchase/__tests__/ — BuyListSheet, useBuyFlow

## Session discipline
- One feature or fix per session — state it in the first message
- /compact immediately after every git commit
- If context >70%, start a new session for the next task
- Never pull Open Design artifacts via MCP — read local files only
- Max 2 parallel Claude Code sessions at once

## Task routing
- Existing component / layout fix / refactor → Claude Code (Warp) only
- New feature / new page / unknown visual direction → Open Design first, 
  then implement from the local artifact
- Never run Open Design and Claude Code on the same problem simultaneously

## Implementation pattern
- For visual decisions on existing components, generate inline HTML mockup 
  options first — get approval before touching source files
- Read Open Design artifact from disk before starting implementation

## Design Workflow
- Tech specs go in `docs/specs/<feature>-spec.md`
- Design briefs go in `docs/specs/<feature>-design-brief.md`

## Open Design integration
- Artifacts folder: $OPEN_DESIGN_ARTIFACTS (set in .zshrc)
- List available artifacts: `ls "$OPEN_DESIGN_ARTIFACTS"`
- When implementing, read the target file directly: `cat "$OPEN_DESIGN_ARTIFACTS/<filename>.html"`
- Never pull via MCP — read the local file
- MCP is Open Design's tool, not Claude Code's

## CSS Structure

- `src/tokens.css` — all CSS custom properties: reset, `:root` (dark mode), light mode overrides, and accent variants. Import this first.
- `src/App.css` — component and layout styles (~2005 lines). See section index comment at the top of that file for line ranges.

## Git
- Atomic commits — one logical change per commit
- Commit message format: feat/fix/refactor/style: description
- npm run build must pass before every push — no exceptions
- npm test must pass before every push — no exceptions

## Work tracking
- Active work tracked in docs/BACKLOG.md
- Before starting a session, check BACKLOG.md for the next ready item
- When pausing a feature, update its entry in BACKLOG.md with last known 
  state and the open question blocking it
- Link to the relevant spec file from every BACKLOG entry