# deck-checklist — Claude Instructions

## Project
- React/TypeScript app for Magic: The Gathering deck management and card checklists
- Deployed on Cloudflare Workers — do not break Workers compatibility
- State managed via DeckProvider (src/store/)
- Code judgement calls (naming, stores, hook dependencies): `CODING_STANDARDS.md`

## Testing
- `npm test` / `npm run test:watch` / `npm run test:coverage`; `npm run verify` = lint + build + coverage (what CI runs). `eslint-suppressions.json` freezes existing React Compiler violations; after fixing one, run `npx eslint . --prune-suppressions`
- Vitest config is separate from vite.config.ts (jsdom vs. Workers plugin) — do not merge them
- Tests live in a `__tests__/` folder next to the code they cover (utils, store, hooks,
  `src/features/<feature>/`). New utils, store logic, hooks, and interactive components
  need a test; find the nearest `__tests__/` and copy its pattern.
- Coverage floors are enforced in vitest.config — `npm run test:coverage` fails below them.
- App-level tests (render the whole `<App />`) use `renderApp({ storage })` from `src/test/renderApp.tsx`: it seeds storage, resets the Collection store and stubs the browser APIs.

## Demo mode
- Demo data lives in `src/features/demo/demoData.ts`; demo mode swaps the User data and Working state keys (GLOSSARY.md).
- New localStorage keys: register them in `src/store/storageKeys.ts` with a kind and backup field. `src/__tests__/storageKeys.test.ts`
  fails on an unregistered key and when a second module writes an existing key.
- When adding a feature or changing a data shape, consider whether the demo needs sample data or an update to `demoData.test.ts`. Say so in the PR.
- Demo decks must stay full 100-card Commander lists (singleton apart from basics).

## Design and screenshots
- UI or visual work (new pages, redesigns, visual changes to existing components, screenshots): read `docs/agents/design-workflow.md` first.

## CSS
- `src/tokens.css` holds all custom properties; `src/App.css` is ~2500 lines — never read it
  whole. See `.claude/rules/css.md`.

## Git and work tracking
- Branches: `feat/<desc>`, `fix/<desc>`, `chore/<desc>`. Commits: `feat|fix|refactor|style|chore: description`, one logical change each.
- Enforced mechanically: hooks in `.claude/hooks/` block commit/push on `main` and run build +
  tests before every push; CI runs `npm run verify` on PRs. Create the feature branch in its
  own command (a hook sees the branch before a compound `checkout && commit` runs).
- After every merge, switch to `main`, pull, and delete the merged branch (local and remote). If there is more
  work to do, create a new branch; never keep working on a merged one.
- Active work is tracked in GitHub Issues — check open issues before starting. When pausing
  mid-feature, comment on the issue with last known state and the blocking question; link the
  spec file in the issue body.

## Agent skills

### Issue tracker

GitHub Issues on Kagaiodin/deck-checklist, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.
