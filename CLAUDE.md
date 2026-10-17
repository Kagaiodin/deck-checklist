# deck-checklist — Claude Instructions

## Project
- React/TypeScript app for Magic: The Gathering deck management and card checklists
- Deployed on Cloudflare Workers — do not break Workers compatibility
- State managed via DeckProvider (src/store/)

## Testing
- `npm test` / `npm run test:watch` / `npm run test:coverage`; `npm run verify` = build + coverage (what CI runs)
- Vitest config is separate from vite.config.ts (jsdom vs. Workers plugin) — do not merge them
- Tests live in a `__tests__/` folder next to the code they cover (utils, store, hooks,
  `src/features/<feature>/`). New utils, store logic, hooks, and interactive components
  need a test; find the nearest `__tests__/` and copy its pattern.
- Coverage floors are enforced in vitest.config — `npm run test:coverage` fails below them.

## Demo mode
- Demo data lives in `src/features/demo/demoData.ts`; the localStorage keys it swaps are `MANAGED_KEYS` in `demoMode.ts`.
- When adding a feature, a new persisted localStorage key, or a data-shape change, consider the demo: does it need sample data,
  a new managed key (so it is isolated from real data and backups), or an update to `demoData.test.ts`? Say so in the PR.
- Demo decks must stay full 100-card Commander lists (singleton apart from basics).

## Design workflow
- New feature / new page / unknown visual direction → Open Design first, then implement
  from the local artifact (see the `implement-from-open-design` skill)
- Existing component / layout fix / refactor → Claude Code directly
- For visual decisions on existing components, show inline HTML mockup options and get
  approval before touching source files
- Tech specs: `docs/specs/<feature>-spec.md`; design briefs: `docs/specs/<feature>-design-brief.md`

## CSS
- `src/tokens.css` holds all custom properties; `src/App.css` is ~2500 lines — never read it
  whole. See `.claude/rules/css.md`.

## Git and work tracking
- Branches: `feat/<desc>`, `fix/<desc>`, `chore/<desc>`. Commits: `feat|fix|refactor|style|chore: description`, one logical change each.
- Enforced mechanically: hooks in `.claude/hooks/` block commit/push on `main` and run build +
  tests before every push; CI runs `npm run verify` on PRs. Create the feature branch in its
  own command (a hook sees the branch before a compound `checkout && commit` runs).
- Active work is tracked in GitHub Issues — check open issues before starting. When pausing
  mid-feature, comment on the issue with last known state and the blocking question; link the
  spec file in the issue body.
