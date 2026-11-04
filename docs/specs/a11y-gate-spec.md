# Accessibility Gate (axe-core) — Spec

**Status:** implemented (`npm run test:a11y`, CI job `a11y`); baseline empty
**Related:** `docs/specs/design-rules-ci-spec.md` (DL-CONTRAST-01, baseline/ratchet, `dl-allow` convention), #153 (toast close hit area: the bug this gate would have caught)

## 1. Goal

Add an automated WCAG 2.2 AA check next to the contrast gate so accessibility regressions fail CI
instead of being found by eye. The contrast gate only checks text colour pairs. Target size,
accessible names, roles, labels, landmarks and ARIA validity are unchecked today.

## 2. Non-goals

- Replacing manual checks. axe finds roughly a third of WCAG issues; keyboard flow, focus order
  and screen-reader quality stay manual.
- Re-checking colour contrast. `color-contrast` is disabled in axe because `test:contrast`
  already does it more accurately (alpha compositing, backdrop walking).
- Fixing every existing violation up front. Existing debt goes in a baseline (§5).

## 3. Design

### Tooling
- Dev dependency `axe-core`, injected into the existing plain-Playwright capture loop
  (`scripts/capture-screenshots.ts`) the same way the contrast audit is. No `@playwright/test`.
- Dev-only: no runtime, bundle or Cloudflare Workers impact, no cost.
- Rule tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` (the last includes `target-size`).
  `color-contrast` disabled.
- Custom `dialog-semantics` check (in `scripts/a11y-audit.ts`, same baseline/allowlist policy): an element with
  `aria-modal="true"` must have role `dialog`/`alertdialog`, and every dialog needs an accessible name. Escape and
  focus traps are not checkable by axe; `src/__tests__/modalEscape.test.tsx` covers them (#168).

### Entry points
- `npm run test:a11y` → `sh scripts/a11y-gate.sh`, a thin wrapper modelled on `contrast-gate.sh`
  (reuse or start the dev server on :5173, run the capture script with `--a11y-gate`).
  Logic stays in npm scripts so it ports to GitLab CI.
- `scripts/a11y-audit.ts` holds the page-side audit and result types, mirroring `contrast-audit.ts`.

### Coverage
- Runs on every screen and state the screenshot script already visits, including open sheets,
  modals, popovers and toasts. Those are the likeliest places for violations.
- Scans per screen after it settles, scoped to the visible document.

### CI
- One job (`a11y`), dark + indigo only. Most rules are theme-independent, so this costs about a
  quarter of the contrast matrix.
- Same Playwright container image as the `contrast` job; keep the image tag equal to the
  `playwright` version in `package-lock.json`.

## 4. Exceptions policy

Two separate mechanisms.

### 4a. Baseline (existing debt)
- `scripts/a11y-baseline.json`, keyed by `rule | screen | selector`.
- Only violations not in the baseline fail the run.
- Fixing a violation removes its entry. The file may only shrink.
- Each entry carries an issue number. Entries without one fail a baseline lint.
- A stale entry (no longer fires) fails the run, which forces the ratchet down.

### 4b. Allowlist (deliberate exemptions)
- Marked at the source so the reason is reviewed with the code:
  `data-a11y-allow="target-size: dense row, spacing meets WCAG 2.5.8"`.
- Format is `rule-id: reason`. A bare rule id with no reason fails the run.
- Per element only. No rule except `color-contrast` is disabled globally.
- The report prints the count of active exemptions so growth shows in CI logs.
- Decorative glyphs may reuse `data-contrast-exempt` if axe flags them; decide at first run.

Likely allowlist candidates: dense card rows and inline links (`target-size`), `react-virtuoso`
wrappers (`aria-required-children`, scrollable regions), disabled controls, hover-only controls
that are transparent at rest.

## 5. Rollout

1. Land the gate with a first-run baseline of all current violations.
2. File one follow-up issue per rule (or per cluster) from the baseline, labelled `a11y`.
3. Fix in small PRs; each removes its baseline entries.

## 6. Demo mode

No persisted localStorage keys, no data-shape change. The gate seeds the same state the
screenshot script already uses. Nothing to add to `MANAGED_KEYS` or `demoData.ts`.

## 7. Tests

- Unit test (`scripts/__tests__/` or nearest equivalent) for baseline matching: new violation
  fails, baselined violation passes, stale entry fails, missing issue number fails, bare
  allowlist reason fails.
- Manual: reintroduce the #153 hit-area bug and confirm `target-size` fails the gate.

## 8. Acceptance criteria

- `npm run test:a11y` exits non-zero on a new violation and zero on a clean tree.
- The #153 regression (toast close under 24×24) is caught by the gate.
- The CI `a11y` job runs on PRs.
- Baseline and allowlist rules in §4 are enforced mechanically.
- `color-contrast` is not reported by this gate.

## 9. Resolved decisions

- CI theme: dark + indigo (the gate script runs only that combination).
- `target-size` policy: case-by-case `data-a11y-allow`; no baseline entries today. Verified by shrinking buttons below 24x24, which fails the gate.
- Baseline is flat across screens, keyed `rule | screen | selector`. Selectors with `nth-child` shift if fixture card order changes; regenerate with `npm run test:a11y -- --update-baseline` (existing issue numbers are kept).
- CI job `a11y` runs on PRs (added in #173). Make it a required check now that the baseline is empty.
- First-run baseline: 303 entries, tracked in #170 (checkboxes), #171 (unlabeled inputs), #172 (invalid `aria-modal`); all fixed, baseline is now empty.

## 10. Suggested commit split

1. `chore: add axe-core and a11y audit module`
2. `chore: a11y gate script, baseline generation and baseline lint`
3. `chore: a11y CI job`
4. `chore: seed baseline`
